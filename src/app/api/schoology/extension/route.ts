import { NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  let db;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Schoology extension service is unavailable" },
      { status: 503 },
    );
  }
  const now = new Date().toISOString();
  const [
    { data: integration, error },
    { count: activeTokens, error: tokenError },
  ] = await Promise.all([
    db
      .from("external_integrations")
      .select("status,last_synced_at")
      .eq("user_id", auth.user.id)
      .eq("provider", "schoology")
      .maybeSingle(),
    db
      .from("schoology_extension_tokens")
      .select("id", { count: "exact", head: true })
      .eq("user_id", auth.user.id)
      .is("revoked_at", null)
      .gt("expires_at", now),
  ]);
  if (error || tokenError)
    return NextResponse.json(
      { error: "Could not load Schoology connection status" },
      { status: 500 },
    );
  return NextResponse.json(
    {
      connected: (activeTokens || 0) > 0 && integration?.status === "connected",
      activeTokens: activeTokens || 0,
      lastSyncedAt: integration?.last_synced_at || null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  let db;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Schoology extension service is unavailable" },
      { status: 503 },
    );
  }
  const now = new Date().toISOString();
  const [
    { error: tokenError },
    { error: codeError },
    { error: flowError },
    { error: integrationError },
  ] = await Promise.all([
    db
      .from("schoology_extension_tokens")
      .update({ revoked_at: now })
      .eq("user_id", auth.user.id)
      .is("revoked_at", null),
    db
      .from("schoology_extension_pairing_codes")
      .update({ consumed_at: now })
      .eq("user_id", auth.user.id)
      .is("consumed_at", null),
    db
      .from("schoology_extension_flows")
      .update({ status: "denied" })
      .eq("user_id", auth.user.id)
      .eq("status", "approved"),
    db
      .from("external_integrations")
      .update({
        status: "disconnected",
        connected_at: null,
        last_error: null,
      })
      .eq("user_id", auth.user.id)
      .eq("provider", "schoology"),
  ]);
  const flowSchemaMissing =
    flowError?.code === "42P01" || flowError?.code === "PGRST205";
  if (
    tokenError ||
    codeError ||
    (flowError && !flowSchemaMissing) ||
    integrationError
  )
    return NextResponse.json(
      { error: "Could not disconnect Schoology" },
      { status: 500 },
    );
  return NextResponse.json({ ok: true });
}
