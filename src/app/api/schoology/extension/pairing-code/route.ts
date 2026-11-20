import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { hashExtensionSecret } from "@/lib/integrations/schoology-extension";
import { createAdminClient } from "@/lib/supabase/admin";

const CODE_LIFETIME_MS = 10 * 60 * 1000;
const MAX_CODES_PER_HOUR = 5;

function databaseErrorResponse(
  operation: string,
  error: { code?: string; message?: string },
) {
  // Keep database details in server logs only; never include them in the API response.
  console.error("Schoology pairing code database error", {
    operation,
    code: error.code,
    message: error.message,
  });
  if (error.code === "42P01" || error.code === "PGRST205")
    return NextResponse.json(
      {
        error:
          "Schoology pairing is not set up on this Daymark server. The administrator must apply database migration 0004_schoology_extension_pairing.sql.",
      },
      { status: 503 },
    );
  return NextResponse.json(
    { error: "Could not create a pairing code. Try again shortly." },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return NextResponse.json(
      { error: "Request origin is not allowed" },
      { status: 403 },
    );

  let db;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Pairing service is unavailable" },
      { status: 503 },
    );
  }
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await db
    .from("schoology_extension_pairing_codes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", auth.user.id)
    .gte("created_at", since);
  if (countError) return databaseErrorResponse("count", countError);
  if ((count || 0) >= MAX_CODES_PER_HOUR)
    return NextResponse.json(
      { error: "Too many pairing codes. Try again later." },
      { status: 429 },
    );

  // A new code supersedes any older unconsumed code for this account.
  const now = new Date();
  const { error: supersedeError } = await db
    .from("schoology_extension_pairing_codes")
    .update({ consumed_at: now.toISOString() })
    .eq("user_id", auth.user.id)
    .is("consumed_at", null);
  if (supersedeError) return databaseErrorResponse("supersede", supersedeError);

  const pairingCode = randomBytes(14).toString("hex").toUpperCase();
  const expiresAt = new Date(now.getTime() + CODE_LIFETIME_MS).toISOString();
  const { error } = await db.from("schoology_extension_pairing_codes").insert({
    user_id: auth.user.id,
    code_hash: hashExtensionSecret(pairingCode),
    expires_at: expiresAt,
  });
  if (error) return databaseErrorResponse("insert", error);
  return NextResponse.json(
    { pairingCode, expiresAt },
    { headers: { "Cache-Control": "no-store" } },
  );
}
