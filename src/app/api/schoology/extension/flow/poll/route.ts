import { NextResponse } from "next/server";
import {
  bearerToken,
  hashExtensionSecret,
} from "@/lib/integrations/schoology-extension";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const flowId = url.searchParams.get("flow");
  const pollToken = bearerToken(request);
  if (!flowId || !/^[A-Za-z0-9_-]{32,64}$/.test(flowId) || !pollToken)
    return NextResponse.json(
      { error: "Invalid connection request" },
      { status: 400 },
    );

  let db;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Schoology connection service is unavailable" },
      { status: 503 },
    );
  }
  const { data, error } = await db
    .from("schoology_extension_flows")
    .select("status,expires_at")
    .eq("flow_hash", hashExtensionSecret(flowId))
    .eq("poll_token_hash", hashExtensionSecret(pollToken))
    .maybeSingle();
  if (error) {
    console.error("Could not check Schoology extension flow", {
      code: error.code,
      message: error.message,
    });
    return NextResponse.json(
      {
        error:
          error.code === "42P01" || error.code === "PGRST205"
            ? "Automatic Schoology pairing requires database migration 0005_schoology_extension_device_flow.sql."
            : "Could not check the Daymark connection. Try again shortly.",
      },
      {
        status: error.code === "42P01" || error.code === "PGRST205" ? 503 : 500,
      },
    );
  }
  if (!data)
    return NextResponse.json(
      { error: "Connection request was not found" },
      { status: 404 },
    );
  if (new Date(data.expires_at).valueOf() <= Date.now())
    return NextResponse.json(
      { error: "Connection request expired" },
      { status: 410 },
    );
  if (data.status === "denied")
    return NextResponse.json(
      { error: "Connection request was revoked" },
      { status: 410 },
    );

  return NextResponse.json(
    { status: data.status },
    { headers: { "Cache-Control": "no-store" } },
  );
}
