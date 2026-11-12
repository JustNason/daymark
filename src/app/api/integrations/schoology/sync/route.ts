import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/integrations/crypto";
import { schoologyRequest } from "@/lib/integrations/schoology";
type UserResponse = { id: string };
type SectionsResponse = { section?: Record<string, unknown>[] };
type AssignmentsResponse = {
  assignment?: Record<string, unknown>[];
  total?: number;
};
export async function POST() {
  const supabase = await createClient();
  if (!supabase)
    return NextResponse.json(
      { error: "Supabase is not configured" },
      { status: 503 },
    );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: integration, error } = await supabase
    .from("external_integrations")
    .select("id,encrypted_credentials,status")
    .eq("provider", "schoology")
    .maybeSingle();
  if (error || !integration?.encrypted_credentials)
    return NextResponse.json(
      { error: "Schoology is not connected" },
      { status: 400 },
    );
  let token: { key: string; secret: string; issuedAt?: string };
  try {
    token = decryptSecret(integration.encrypted_credentials);
  } catch {
    return NextResponse.json(
      {
        error:
          "Integration credentials cannot be decrypted; reconnect Schoology.",
      },
      { status: 409 },
    );
  }
  if (
    token.issuedAt &&
    Date.now() - new Date(token.issuedAt).getTime() >= 89 * 24 * 60 * 60 * 1000
  ) {
    await supabase
      .from("external_integrations")
      .update({ status: "reauthorization_required" })
      .eq("id", integration.id);
    return NextResponse.json(
      {
        error:
          "Schoology authorization is near its 90-day expiry. Reconnect it before syncing.",
      },
      { status: 409 },
    );
  }
  const log = await supabase
    .from("integration_sync_logs")
    .insert({
      user_id: user.id,
      integration_id: integration.id,
      status: "running",
    })
    .select("id")
    .single();
  try {
    const me = await schoologyRequest<UserResponse>("GET", "/users/me", token);
    const sections = await schoologyRequest<SectionsResponse>(
      "GET",
      `/users/${encodeURIComponent(me.id)}/sections`,
      token,
    );
    let seen = 0,
      changed = 0;
    for (const section of sections.section || []) {
      const sectionId = String(section.id);
      const courseId = String(
        section.course_id || section.parent_id || sectionId,
      );
      const title = String(
        section.course_title ||
          section.title ||
          section.name ||
          `Course ${courseId}`,
      );
      const existing = await supabase
        .from("courses")
        .select("id,selected,auto_import")
        .eq("user_id", user.id)
        .eq("integration_id", integration.id)
        .eq("external_id", courseId)
        .eq("section_external_id", sectionId)
        .maybeSingle();
      if (existing.error) throw existing.error;
      let course = existing.data;
      if (course) {
        const renamed = await supabase
          .from("courses")
          .update({ name: title, updated_at: new Date().toISOString() })
          .eq("id", course.id)
          .select("id,selected,auto_import")
          .single();
        if (renamed.error) throw renamed.error;
        course = renamed.data;
      } else {
        const created = await supabase
          .from("courses")
          .insert({
            user_id: user.id,
            integration_id: integration.id,
            external_id: courseId,
            section_external_id: sectionId,
            name: title,
          })
          .select("id,selected,auto_import")
          .single();
        if (created.error) throw created.error;
        course = created.data;
      }
      if (!course.selected) continue;
      let start = 0;
      while (true) {
        const result = await schoologyRequest<AssignmentsResponse>(
          "GET",
          `/sections/${encodeURIComponent(sectionId)}/assignments?start=${start}&limit=50`,
          token,
        );
        const items = result.assignment || [];
        for (const item of items) {
          seen++;
          const due = item.due
            ? new Date(String(item.due)).toISOString()
            : null;
          const available = item.available_at
            ? new Date(String(item.available_at)).toISOString()
            : null;
          const { data: savedAssignment, error: upsertError } = await supabase
            .from("assignments")
            .upsert(
              {
                user_id: user.id,
                course_id: course.id,
                integration_id: integration.id,
                external_id: `${sectionId}:${String(item.id)}`,
                title: String(item.title || "Untitled assignment"),
                description: String(item.description || ""),
                url: typeof item.url === "string" ? item.url : null,
                original_due_at: due,
                original_available_at: available,
                original_max_points: item.max_points
                  ? Number(item.max_points)
                  : null,
                original_completed: !!item.completed,
                imported_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              {
                onConflict: "user_id,integration_id,external_id",
                ignoreDuplicates: false,
              },
            )
            .select("id")
            .single();
          if (upsertError) throw upsertError;
          if (course.auto_import) {
            const linkedTask = await supabase
              .from("tasks")
              .select("id")
              .eq("assignment_id", savedAssignment.id)
              .maybeSingle();
            if (linkedTask.error) throw linkedTask.error;
            if (!linkedTask.data) {
              const taskResult = await supabase.from("tasks").insert({
                user_id: user.id,
                assignment_id: savedAssignment.id,
                title: String(item.title || "Untitled assignment"),
                description: String(item.description || ""),
                due_at: due,
                status: "todo",
                priority: "medium",
                source: "assignment",
              });
              if (taskResult.error) throw taskResult.error;
            }
          }
          changed++;
        }
        if (
          items.length < 50 ||
          start + items.length >= Number(result.total || 0)
        )
          break;
        start += items.length;
      }
    }
    await supabase
      .from("external_integrations")
      .update({
        last_synced_at: new Date().toISOString(),
        last_error: null,
        status: "connected",
      })
      .eq("id", integration.id);
    if (log.data?.id)
      await supabase
        .from("integration_sync_logs")
        .update({
          status: "complete",
          items_seen: seen,
          items_changed: changed,
          finished_at: new Date().toISOString(),
        })
        .eq("id", log.data.id);
    return NextResponse.json({
      ok: true,
      itemsSeen: seen,
      itemsChanged: changed,
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Schoology synchronization failed";
    await supabase
      .from("external_integrations")
      .update({ status: "error", last_error: message })
      .eq("id", integration.id);
    if (log.data?.id)
      await supabase
        .from("integration_sync_logs")
        .update({
          status: "error",
          message: message.slice(0, 500),
          finished_at: new Date().toISOString(),
        })
        .eq("id", log.data.id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
