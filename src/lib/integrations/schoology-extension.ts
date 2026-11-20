import { createHash } from "node:crypto";
import { z } from "zod";

const dateSchema = z.string().max(80).nullable().optional();
const assignmentSchema = z.object({
  externalId: z.string().trim().min(1).max(250),
  courseExternalId: z.string().trim().min(1).max(250),
  title: z.string().trim().min(1).max(300),
  description: z.string().max(20_000).optional(),
  url: z
    .string()
    .url()
    .max(2048)
    .refine((value) => new URL(value).protocol === "https:")
    .nullable()
    .optional(),
  dueAt: dateSchema,
  availableAt: dateSchema,
  maxPoints: z.number().finite().nonnegative().nullable().optional(),
  completed: z.boolean().nullable().optional(),
});
const courseSchema = z.object({
  externalId: z.string().trim().min(1).max(250),
  name: z.string().trim().min(1).max(300),
  url: z
    .string()
    .url()
    .max(2048)
    .refine((value) => new URL(value).protocol === "https:")
    .optional(),
  assignments: z.array(assignmentSchema).max(1000).optional(),
});
export const schoologySnapshotSchema = z.object({
  pageUrl: z.string().max(2048),
  scannedAt: z.string().datetime({ offset: true }),
  courses: z.array(courseSchema).max(300),
  assignments: z.array(assignmentSchema).max(2000),
  warnings: z.array(z.string().max(500)).max(100),
});

export type SchoologyAssignmentInput = z.infer<typeof assignmentSchema>;

export function normalizePairingCode(value: string): string | null {
  const code = value.replace(/[\s-]/g, "").toUpperCase();
  return /^[A-F0-9]{28}$/.test(code) ? code : null;
}

export function hashExtensionSecret(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer ([A-Za-z0-9_-]{32,})$/.exec(header);
  return match?.[1] || null;
}

/** Reads a request body without buffering more than the configured limit. */
export async function readBodyLimited(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; text: string } | { ok: false; reason: "too_large" }> {
  const reader = request.body?.getReader();
  if (!reader) return { ok: true, text: "" };
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(bytes) };
}

export function getClientAddress(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return forwarded || "unknown";
}

/** Stable UUID for an auto-imported task, so concurrent scans cannot duplicate it. */
export function importedTaskId(userId: string, assignmentId: string): string {
  const bytes = createHash("sha256")
    .update(`daymark-schoology-task:${userId}:${assignmentId}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isSchoologyPageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.length <= 253;
  } catch {
    return false;
  }
}

export function normalizeSchoologyDate(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function collectSchoologyAssignments(
  snapshot: z.infer<typeof schoologySnapshotSchema>,
): SchoologyAssignmentInput[] {
  const unique = new Map<string, SchoologyAssignmentInput>();
  for (const assignment of snapshot.assignments)
    unique.set(
      `${assignment.courseExternalId}:${assignment.externalId}`,
      assignment,
    );
  for (const course of snapshot.courses) {
    for (const assignment of course.assignments || [])
      unique.set(
        `${assignment.courseExternalId}:${assignment.externalId}`,
        assignment,
      );
  }
  return [...unique.values()];
}

export function isExtensionTokenActive(
  token: { expiresAt: string; revokedAt?: string | null },
  now = new Date(),
): boolean {
  const expiresAt = Date.parse(token.expiresAt);
  return (
    !token.revokedAt && Number.isFinite(expiresAt) && expiresAt > now.getTime()
  );
}

export function sameSchoologyAssignmentSource(
  current: {
    course_id: string | null;
    title: string;
    description: string;
    url: string | null;
    original_due_at: string | null;
    original_available_at: string | null;
    original_max_points: number | null;
    original_completed: boolean | null;
  },
  next: {
    course_id: string;
    title: string;
    description: string;
    url: string | null;
    original_due_at: string | null;
    original_available_at: string | null;
    original_max_points: number | null;
    original_completed: boolean | null;
  },
) {
  return (
    current.course_id === next.course_id &&
    current.title === next.title &&
    current.description === next.description &&
    current.url === next.url &&
    current.original_due_at === next.original_due_at &&
    current.original_available_at === next.original_available_at &&
    (current.original_max_points == null
      ? null
      : Number(current.original_max_points)) === next.original_max_points &&
    current.original_completed === next.original_completed
  );
}

export function reconcileImportedTaskFields(
  previous: {
    title: string;
    description: string;
    original_due_at: string | null;
    personal_title: string | null;
    personal_description: string | null;
    personal_due_at: string | null;
  },
  task: { title: string; description: string; due_at: string | null },
  incoming: { title: string; description?: string; dueAt?: string | null },
) {
  const patch: {
    title?: string;
    description?: string;
    due_at?: string | null;
  } = {};
  const previousTitle = previous.personal_title ?? previous.title;
  const nextTitle = previous.personal_title ?? incoming.title;
  if (task.title === previousTitle && task.title !== nextTitle)
    patch.title = nextTitle;

  const previousDescription =
    previous.personal_description ?? previous.description;
  const nextDescription =
    previous.personal_description ?? incoming.description ?? "";
  if (
    task.description === previousDescription &&
    task.description !== nextDescription
  )
    patch.description = nextDescription;

  const previousDue = previous.personal_due_at ?? previous.original_due_at;
  const nextDue =
    previous.personal_due_at ?? normalizeSchoologyDate(incoming.dueAt);
  if (task.due_at === previousDue && task.due_at !== nextDue)
    patch.due_at = nextDue;
  return Object.keys(patch).length ? patch : null;
}
