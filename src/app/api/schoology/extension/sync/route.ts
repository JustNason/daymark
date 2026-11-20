import { NextResponse } from "next/server";
import {
  bearerToken,
  collectSchoologyAssignments,
  hashExtensionSecret,
  importedTaskId,
  isSchoologyPageUrl,
  normalizeSchoologyDate,
  readBodyLimited,
  reconcileImportedTaskFields,
  sameSchoologyAssignmentSource,
  schoologySnapshotSchema,
  type SchoologyAssignmentInput,
} from "@/lib/integrations/schoology-extension";
import { createAdminClient } from "@/lib/supabase/admin";

type AssignmentInput = SchoologyAssignmentInput;
type CourseRow = {
  id: string;
  external_id: string;
  name: string;
  selected: boolean;
  auto_import: boolean;
};
type AssignmentRow = {
  id: string;
  external_id: string;
  course_id: string | null;
  title: string;
  description: string;
  url: string | null;
  original_due_at: string | null;
  original_available_at: string | null;
  original_max_points: number | null;
  original_completed: boolean | null;
  personal_title: string | null;
  personal_description: string | null;
  personal_due_at: string | null;
  ignored_at: string | null;
};
type SourceFields = {
  course_id: string;
  title: string;
  description: string;
  url: string | null;
  original_due_at: string | null;
  original_available_at: string | null;
  original_max_points: number | null;
  original_completed: boolean | null;
};

async function findCredential(request: Request) {
  const token = bearerToken(request);
  if (!token) return { error: "unauthorized" as const };
  let db;
  try {
    db = createAdminClient();
  } catch {
    return { error: "unavailable" as const };
  }
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("schoology_extension_tokens")
    .select("id,user_id,expires_at")
    .eq("token_hash", hashExtensionSecret(token))
    .is("revoked_at", null)
    .gt("expires_at", now)
    .maybeSingle();
  if (error) return { error: "database" as const, db };
  if (!data) return { error: "unauthorized" as const };
  return { db, credential: data, tokenHash: hashExtensionSecret(token) };
}

export async function POST(request: Request) {
  const auth = await findCredential(request);
  if ("error" in auth) {
    const status =
      auth.error === "unavailable"
        ? 503
        : auth.error === "database"
          ? 500
          : 401;
    const error =
      auth.error === "unavailable"
        ? "Sync service is unavailable"
        : auth.error === "database"
          ? "Could not validate extension token"
          : "Extension token is invalid or expired";
    return NextResponse.json({ error }, { status });
  }

  const limitKey = hashExtensionSecret(`sync:${auth.tokenHash}`);
  const { data: allowed, error: limitError } = await auth.db.rpc(
    "allow_schoology_pair_attempt",
    { p_key_hash: limitKey },
  );
  if (limitError)
    return NextResponse.json(
      { error: "Sync service is unavailable" },
      { status: 503 },
    );
  if (!allowed)
    return NextResponse.json(
      { error: "Too many sync requests. Try again later." },
      { status: 429 },
    );

  const maxBodyBytes = 10 * 1024 * 1024;
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxBodyBytes)
    return NextResponse.json(
      { error: "Schoology scan is too large. Scan fewer courses at a time." },
      { status: 413 },
    );
  const bodyRead = await readBodyLimited(request, maxBodyBytes);
  if (!bodyRead.ok)
    return NextResponse.json(
      { error: "Schoology scan is too large. Scan fewer courses at a time." },
      { status: 413 },
    );
  const body = await Promise.resolve()
    .then(() => JSON.parse(bodyRead.text) as unknown)
    .catch(() => null);
  const parsed = schoologySnapshotSchema.safeParse(body);
  if (!parsed.success || !isSchoologyPageUrl(parsed.data?.pageUrl || ""))
    return NextResponse.json(
      { error: "Schoology scan data is invalid" },
      { status: 400 },
    );

  const { db, credential } = auth;
  const userId = credential.user_id;
  const { data: integration, error: integrationLookupError } = await db
    .from("external_integrations")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", "schoology")
    .maybeSingle();
  if (integrationLookupError || !integration)
    return NextResponse.json(
      { error: "Schoology extension is not connected" },
      { status: 409 },
    );

  const { data: log } = await db
    .from("integration_sync_logs")
    .insert({
      user_id: userId,
      integration_id: integration.id,
      status: "running",
    })
    .select("id")
    .single();

  const result = {
    detectedCourses: parsed.data.courses.length,
    detectedAssignments: 0,
    imported: 0,
    updated: 0,
    unchanged: 0,
    errors: [...new Set(parsed.data.warnings)].slice(0, 50),
  };
  const started = new Date().toISOString();
  try {
    await db
      .from("schoology_extension_tokens")
      .update({ last_used_at: started })
      .eq("id", credential.id)
      .eq("user_id", userId);

    const { data: existingCourses, error: courseReadError } = await db
      .from("courses")
      .select("id,external_id,name,selected,auto_import")
      .eq("user_id", userId)
      .eq("integration_id", integration.id);
    if (courseReadError) throw courseReadError;
    const coursesByExternalId = new Map(
      ((existingCourses || []) as CourseRow[]).map((course) => [
        course.external_id,
        course,
      ]),
    );
    const incomingCourses = new Map(
      parsed.data.courses.map((course) => [course.externalId, course]),
    );

    for (const course of incomingCourses.values()) {
      const existing = coursesByExternalId.get(course.externalId);
      if (existing) {
        // Course names are source-owned in this model; selection and auto-import remain user-owned.
        if (existing.name !== course.name) {
          const { error } = await db
            .from("courses")
            .update({ name: course.name, updated_at: new Date().toISOString() })
            .eq("id", existing.id)
            .eq("user_id", userId);
          if (error) throw error;
        }
        continue;
      }
      const { data: saved, error } = await db
        .from("courses")
        .upsert(
          {
            user_id: userId,
            integration_id: integration.id,
            external_id: course.externalId,
            section_external_id: course.externalId,
            name: course.name,
            selected: true,
            auto_import: false,
          },
          { onConflict: "user_id,external_id,section_external_id" },
        )
        .select("id,external_id,name,selected,auto_import")
        .single();
      if (error) throw error;
      coursesByExternalId.set(course.externalId, saved as CourseRow);
    }

    const candidates = collectSchoologyAssignments(parsed.data);
    result.detectedAssignments = candidates.length;

    const incomingIds: string[] = [];
    const assignmentValues: Array<{
      externalId: string;
      course: CourseRow;
      assignment: AssignmentInput;
      values: SourceFields & Record<string, unknown>;
    }> = [];
    for (const assignment of candidates) {
      const course = coursesByExternalId.get(assignment.courseExternalId);
      if (!course) {
        result.errors.push(
          `Skipped assignment “${assignment.title}”: its course was not in the scan or your Daymark courses.`,
        );
        continue;
      }
      if (!course.selected) continue;
      const dueAt = normalizeSchoologyDate(assignment.dueAt);
      const availableAt = normalizeSchoologyDate(assignment.availableAt);
      if (
        (assignment.dueAt && !dueAt) ||
        (assignment.availableAt && !availableAt)
      ) {
        result.errors.push(
          `Skipped assignment “${assignment.title}”: a date could not be read.`,
        );
        continue;
      }
      const externalId = `${assignment.courseExternalId}:${assignment.externalId}`;
      const values = {
        user_id: userId,
        course_id: course.id,
        integration_id: integration.id,
        external_id: externalId,
        title: assignment.title,
        description: assignment.description || "",
        url: assignment.url || null,
        original_due_at: dueAt,
        original_available_at: availableAt,
        original_max_points: assignment.maxPoints ?? null,
        original_completed: assignment.completed ?? null,
      } as SourceFields & Record<string, unknown>;
      incomingIds.push(externalId);
      assignmentValues.push({ externalId, course, assignment, values });
    }

    const oldByExternalId = new Map<string, AssignmentRow>();
    if (incomingIds.length) {
      const { data, error } = await db
        .from("assignments")
        .select(
          "id,external_id,course_id,title,description,url,original_due_at,original_available_at,original_max_points,original_completed,personal_title,personal_description,personal_due_at,ignored_at",
        )
        .eq("user_id", userId)
        .eq("integration_id", integration.id)
        .in("external_id", [...new Set(incomingIds)]);
      if (error) throw error;
      for (const row of (data || []) as AssignmentRow[])
        oldByExternalId.set(row.external_id, row);
    }

    for (const item of assignmentValues) {
      const current = oldByExternalId.get(item.externalId);
      let savedId: string;
      if (current && sameSchoologyAssignmentSource(current, item.values)) {
        result.unchanged++;
        savedId = current.id;
      } else {
        const { data, error } = await db
          .from("assignments")
          .upsert(
            {
              ...item.values,
              imported_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,integration_id,external_id" },
          )
          .select("id")
          .single();
        if (error) throw error;
        savedId = data.id;
        if (current) result.updated++;
        else result.imported++;
      }

      if (item.course.auto_import && !current?.ignored_at) {
        const { data: linked, error: linkedError } = await db
          .from("tasks")
          .select("id,title,description,due_at")
          .eq("user_id", userId)
          .eq("assignment_id", savedId)
          .limit(1)
          .maybeSingle();
        if (linkedError) throw linkedError;
        if (!linked) {
          const { error } = await db.from("tasks").insert({
            id: importedTaskId(userId, savedId),
            user_id: userId,
            assignment_id: savedId,
            title: current?.personal_title ?? item.assignment.title,
            description:
              current?.personal_description ??
              item.assignment.description ??
              "",
            due_at:
              current?.personal_due_at ??
              normalizeSchoologyDate(item.assignment.dueAt),
            status: "todo",
            priority: "medium",
            source: "assignment",
          });
          // A second scan may race this insert; deterministic task IDs make the retry idempotent.
          if (error && error.code !== "23505") throw error;
        } else if (current) {
          // Update only fields that still match their last imported values. A
          // field changed independently in Daymark is treated as a user edit.
          const reconciled = reconcileImportedTaskFields(
            current,
            linked,
            item.assignment,
          );
          if (reconciled) {
            const { error } = await db
              .from("tasks")
              .update({ ...reconciled, updated_at: new Date().toISOString() })
              .eq("id", linked.id)
              .eq("user_id", userId);
            if (error) throw error;
          }
        }
      }
    }

    const finished = new Date().toISOString();
    await db
      .from("external_integrations")
      .update({
        last_synced_at: finished,
        last_error: null,
        status: "connected",
      })
      .eq("id", integration.id)
      .eq("user_id", userId);
    if (log?.id)
      await db
        .from("integration_sync_logs")
        .update({
          status: "complete",
          items_seen: result.detectedAssignments,
          items_changed: result.imported + result.updated,
          finished_at: finished,
          message: result.errors.join("; ").slice(0, 500) || null,
        })
        .eq("id", log.id)
        .eq("user_id", userId);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    const finished = new Date().toISOString();
    await db
      .from("external_integrations")
      .update({
        status: "error",
        last_error: "Schoology synchronization failed",
      })
      .eq("id", integration.id)
      .eq("user_id", userId);
    if (log?.id)
      await db
        .from("integration_sync_logs")
        .update({
          status: "error",
          message: "Schoology synchronization failed",
          finished_at: finished,
        })
        .eq("id", log.id)
        .eq("user_id", userId);
    return NextResponse.json(
      { error: "Schoology synchronization failed", ...result },
      { status: 502 },
    );
  }
}
