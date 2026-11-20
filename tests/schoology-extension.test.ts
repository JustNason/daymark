import { describe, expect, it } from "vitest";
import {
  collectSchoologyAssignments,
  hashExtensionSecret,
  importedTaskId,
  isExtensionTokenActive,
  isSchoologyPageUrl,
  normalizePairingCode,
  normalizeSchoologyDate,
  readBodyLimited,
  reconcileImportedTaskFields,
  schoologySnapshotSchema,
  sameSchoologyAssignmentSource,
} from "@/lib/integrations/schoology-extension";

const snapshot = {
  pageUrl: "https://school.schoology.com/course/12/materials",
  scannedAt: "2026-11-19T12:00:00.000Z",
  courses: [
    {
      externalId: "course-12",
      name: "Chemistry",
      assignments: [
        {
          externalId: "assignment-34",
          courseExternalId: "course-12",
          title: "Lab report",
          dueAt: "2026-11-20T17:00:00.000Z",
        },
      ],
    },
  ],
  assignments: [
    {
      externalId: "assignment-34",
      courseExternalId: "course-12",
      title: "Lab report",
      dueAt: "2026-11-20T17:00:00.000Z",
    },
  ],
  warnings: [],
};

describe("Schoology extension API contract", () => {
  it("enforces a streaming request limit even without Content-Length", async () => {
    let cancelled = false;
    let chunksSent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunksSent++;
        controller.enqueue(new TextEncoder().encode("1234"));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request("https://daymark.test/pair", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    expect(request.headers.has("content-length")).toBe(false);
    await expect(readBodyLimited(request, 6)).resolves.toEqual({
      ok: false,
      reason: "too_large",
    });
    expect(chunksSent).toBe(2);
    expect(cancelled).toBe(true);
  });

  it("accepts a body at the byte limit and counts multibyte UTF-8 bytes", async () => {
    const body = "éé";
    const request = new Request("https://daymark.test/pair", {
      method: "POST",
      body,
    });
    await expect(readBodyLimited(request, 4)).resolves.toEqual({
      ok: true,
      text: body,
    });
    const tooSmallRequest = new Request("https://daymark.test/pair", {
      method: "POST",
      body,
    });
    await expect(readBodyLimited(tooSmallRequest, 3)).resolves.toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("validates normalized course and assignment payloads", () => {
    expect(schoologySnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(
      schoologySnapshotSchema.safeParse({
        ...snapshot,
        assignments: [{ title: "Missing IDs" }],
      }).success,
    ).toBe(false);
  });

  it("deduplicates top-level and course-nested assignments using stable external IDs", () => {
    const parsed = schoologySnapshotSchema.parse(snapshot);
    expect(collectSchoologyAssignments(parsed)).toHaveLength(1);
    expect(collectSchoologyAssignments(parsed)[0].externalId).toBe(
      "assignment-34",
    );
  });

  it("normalizes pairing-code input and rejects short or malformed codes", () => {
    const code = "A1B2C3D4E5F60718293A4B5C6D7E";
    expect(
      normalizePairingCode(` ${code.slice(0, 14)}-${code.slice(14)} `),
    ).toBe(code);
    expect(normalizePairingCode("too-short")).toBeNull();
    expect(normalizePairingCode(`${code.slice(0, 27)}Z`)).toBeNull();
  });

  it("hashes bearer secrets and generates stable assignment task IDs", () => {
    expect(hashExtensionSecret("secret-token")).toBe(
      hashExtensionSecret("secret-token"),
    );
    expect(hashExtensionSecret("secret-token")).not.toBe("secret-token");
    expect(importedTaskId("user-1", "assignment-1")).toBe(
      importedTaskId("user-1", "assignment-1"),
    );
    expect(importedTaskId("user-1", "assignment-1")).not.toBe(
      importedTaskId("user-2", "assignment-1"),
    );
  });

  it("normalizes dates, rejects invalid URL schemes, and checks token expiry/revocation", () => {
    expect(normalizeSchoologyDate("2026-11-20T17:00:00-08:00")).toBe(
      "2026-11-21T01:00:00.000Z",
    );
    expect(normalizeSchoologyDate("not-a-date")).toBeNull();
    expect(isSchoologyPageUrl("https://school.schoology.com/course/12")).toBe(
      true,
    );
    expect(isSchoologyPageUrl("javascript:alert(1)")).toBe(false);
    const now = new Date("2026-11-19T12:00:00Z");
    expect(
      isExtensionTokenActive({ expiresAt: "2026-11-20T12:00:00Z" }, now),
    ).toBe(true);
    expect(
      isExtensionTokenActive(
        {
          expiresAt: "2026-11-20T12:00:00Z",
          revokedAt: "2026-11-19T11:00:00Z",
        },
        now,
      ),
    ).toBe(false);
    expect(
      isExtensionTokenActive({ expiresAt: "2026-11-18T12:00:00Z" }, now),
    ).toBe(false);
  });

  it("does not update an unchanged assignment on a repeated scan", () => {
    const source = {
      course_id: "course-row-1",
      title: "Lab report",
      description: "Write the report",
      url: null,
      original_due_at: "2026-11-21T01:00:00.000Z",
      original_available_at: null,
      original_max_points: 20,
      original_completed: false,
    };
    expect(sameSchoologyAssignmentSource(source, { ...source })).toBe(true);
    expect(
      sameSchoologyAssignmentSource(source, {
        ...source,
        title: "Updated title",
      }),
    ).toBe(false);
  });

  it("refreshes only untouched imported task fields and keeps user edits and personal overrides", () => {
    const prior = {
      title: "Lab report",
      description: "Write the report",
      original_due_at: "2026-11-21T01:00:00.000Z",
      personal_title: null,
      personal_description: null,
      personal_due_at: null,
    };
    const incoming = {
      title: "Updated lab report",
      description: "Write and submit the report",
      dueAt: "2026-11-22T01:00:00.000Z",
    };
    expect(
      reconcileImportedTaskFields(
        prior,
        {
          title: "Lab report",
          description: "Write the report",
          due_at: "2026-11-21T01:00:00.000Z",
        },
        incoming,
      ),
    ).toEqual({
      title: "Updated lab report",
      description: "Write and submit the report",
      due_at: "2026-11-22T01:00:00.000Z",
    });
    expect(
      reconcileImportedTaskFields(
        prior,
        {
          title: "My edited title",
          description: "Write the report",
          due_at: "2026-11-21T01:00:00.000Z",
        },
        incoming,
      ),
    ).toEqual({
      description: "Write and submit the report",
      due_at: "2026-11-22T01:00:00.000Z",
    });
    expect(
      reconcileImportedTaskFields(
        { ...prior, personal_due_at: "2026-11-25T01:00:00.000Z" },
        {
          title: "Lab report",
          description: "Write the report",
          due_at: "2026-11-25T01:00:00.000Z",
        },
        incoming,
      ),
    ).toEqual({
      title: "Updated lab report",
      description: "Write and submit the report",
    });
    expect(
      reconcileImportedTaskFields(
        prior,
        {
          title: "My edited title",
          description: "Custom task notes",
          due_at: "2026-11-30T01:00:00.000Z",
        },
        incoming,
      ),
    ).toBeNull();
  });
});
