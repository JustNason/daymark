import { NextResponse } from "next/server";
import {
  bearerToken,
  hashExtensionSecret,
} from "@/lib/integrations/schoology-extension";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(request: Request) {
  const token = bearerToken(request);
  if (!token)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let db;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Disconnect service is unavailable" },
      { status: 503 },
    );
  }
  const { data, error } = await db
    .from("schoology_extension_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token_hash", hashExtensionSecret(token))
    .is("revoked_at", null)
    .select("user_id")
    .maybeSingle();
  if (error)
    return NextResponse.json(
      { error: "Could not disconnect the extension" },
      { status: 500 },
    );
  if (!data)
    return NextResponse.json(
      { error: "Extension token is invalid or revoked" },
      { status: 401 },
    );

  const { error: flowError } = await db
    .from("schoology_extension_flows")
    .update({ status: "denied" })
    .eq("extension_token_hash", hashExtensionSecret(token))
    .eq("status", "approved");
  if (flowError && flowError.code !== "42P01" && flowError.code !== "PGRST205")
    console.error("Could not close the revoked Schoology extension flow", {
      code: flowError.code,
      message: flowError.message,
    });

  const { count, error: countError } = await db
    .from("schoology_extension_tokens")
    .select("id", { count: "exact", head: true })
    .eq("user_id", data.user_id)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString());
  if (!countError && (count || 0) === 0) {
    await db
      .from("external_integrations")
      .update({ status: "disconnected", connected_at: null })
      .eq("user_id", data.user_id)
      .eq("provider", "schoology");
  }
  return NextResponse.json({ ok: true });
}
