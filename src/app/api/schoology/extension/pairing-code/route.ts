import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { hashExtensionSecret } from "@/lib/integrations/schoology-extension";
import { createAdminClient } from "@/lib/supabase/admin";

const CODE_LIFETIME_MS = 10 * 60 * 1000;
const MAX_CODES_PER_HOUR = 5;

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
  if (countError)
    return NextResponse.json(
      { error: "Could not create a pairing code" },
      { status: 500 },
    );
  if ((count || 0) >= MAX_CODES_PER_HOUR)
    return NextResponse.json(
      { error: "Too many pairing codes. Try again later." },
      { status: 429 },
    );

  // A new code supersedes any older unconsumed code for this account.
  const now = new Date();
  await db
    .from("schoology_extension_pairing_codes")
    .update({ consumed_at: now.toISOString() })
    .eq("user_id", auth.user.id)
    .is("consumed_at", null);

  const pairingCode = randomBytes(14).toString("hex").toUpperCase();
  const expiresAt = new Date(now.getTime() + CODE_LIFETIME_MS).toISOString();
  const { error } = await db.from("schoology_extension_pairing_codes").insert({
    user_id: auth.user.id,
    code_hash: hashExtensionSecret(pairingCode),
    expires_at: expiresAt,
  });
  if (error)
    return NextResponse.json(
      { error: "Could not create a pairing code" },
      { status: 500 },
    );
  return NextResponse.json(
    { pairingCode, expiresAt },
    { headers: { "Cache-Control": "no-store" } },
  );
}
