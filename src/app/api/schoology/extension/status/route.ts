import { NextResponse } from "next/server";
import {
  bearerToken,
  hashExtensionSecret,
} from "@/lib/integrations/schoology-extension";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const token = bearerToken(request);
  if (!token) return NextResponse.json({ connected: false }, { status: 401 });
  let db;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Status service is unavailable" },
      { status: 503 },
    );
  }
  const now = new Date().toISOString();
  const { data: credential, error } = await db
    .from("schoology_extension_tokens")
    .select("id,user_id,expires_at")
    .eq("token_hash", hashExtensionSecret(token))
    .is("revoked_at", null)
    .gt("expires_at", now)
    .maybeSingle();
  if (error)
    return NextResponse.json(
      { error: "Could not load extension status" },
      { status: 500 },
    );
  if (!credential)
    return NextResponse.json({ connected: false }, { status: 401 });

  await db
    .from("schoology_extension_tokens")
    .update({ last_used_at: now })
    .eq("id", credential.id)
    .eq("user_id", credential.user_id);
  const { data: integration } = await db
    .from("external_integrations")
    .select("status,last_synced_at")
    .eq("user_id", credential.user_id)
    .eq("provider", "schoology")
    .maybeSingle();
  return NextResponse.json(
    {
      connected: true,
      syncStatus: integration?.status || "not_synced",
      expiresAt: credential.expires_at,
      lastSyncedAt: integration?.last_synced_at || null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
