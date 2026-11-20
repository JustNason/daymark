import { NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
export async function DELETE() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  let db;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Schoology disconnect is unavailable" },
      { status: 503 },
    );
  }
  const now = new Date().toISOString();
  const { error: tokenError } = await db
    .from("schoology_extension_tokens")
    .update({ revoked_at: now })
    .eq("user_id", auth.user.id)
    .is("revoked_at", null);
  const { error: integrationError } = await db
    .from("external_integrations")
    .update({
      status: "disconnected",
      connected_at: null,
      last_error: null,
    })
    .eq("user_id", auth.user.id)
    .eq("provider", "schoology");
  if (tokenError || integrationError)
    return NextResponse.json(
      { error: "Could not disconnect Schoology" },
      { status: 500 },
    );
  return NextResponse.json({ ok: true });
}
