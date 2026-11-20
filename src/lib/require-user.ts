import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

type ServerClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;

export type RequireUserResult =
  | {
      ok: true;
      supabase: ServerClient;
      user: User;
    }
  | { ok: false; response: NextResponse };

/** Resolve a cookie-authenticated user for a route while preserving RLS. */
export async function requireUser(): Promise<RequireUserResult> {
  const supabase = await createClient();
  if (!supabase) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Authentication service is unavailable" },
        { status: 503 },
      ),
    };
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    const authStatus =
      "status" in error && typeof error.status === "number"
        ? error.status
        : null;
    if (authStatus === null || authStatus >= 500) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Authentication service is unavailable" },
          { status: 503 },
        ),
      };
    }
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true, supabase, user };
}
