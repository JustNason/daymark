import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

import { requireUser } from "@/lib/require-user";

describe("requireUser", () => {
  beforeEach(() => createClient.mockReset());

  it("returns a curated 503 when Supabase is not configured", async () => {
    createClient.mockResolvedValue(null);

    const result = await requireUser();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(503);
      await expect(result.response.json()).resolves.toEqual({
        error: "Authentication service is unavailable",
      });
    }
  });

  it("returns 401 when the request has no authenticated user", async () => {
    createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "no session", status: 401 },
        }),
      },
    });

    const result = await requireUser();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      await expect(result.response.json()).resolves.toEqual({
        error: "Unauthorized",
      });
    }
  });

  it("returns a curated 503 when authentication cannot reach Supabase", async () => {
    createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "internal transport details" },
        }),
      },
    });

    const result = await requireUser();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(503);
      await expect(result.response.json()).resolves.toEqual({
        error: "Authentication service is unavailable",
      });
    }
  });

  it("returns the RLS client and server-verified user", async () => {
    const user = { id: "owner-1" };
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
      },
    };
    createClient.mockResolvedValue(supabase);

    const result = await requireUser();

    expect(result).toEqual({ ok: true, supabase, user });
  });
});
