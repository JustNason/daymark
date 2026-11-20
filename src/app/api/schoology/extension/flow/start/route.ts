import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getClientAddress,
  hashExtensionSecret,
  readBodyLimited,
} from "@/lib/integrations/schoology-extension";
import { createAdminClient } from "@/lib/supabase/admin";

const flowSchema = z.object({
  flowId: z.string().regex(/^[A-Za-z0-9_-]{32,64}$/),
  pollToken: z.string().regex(/^[A-Za-z0-9_-]{32,64}$/),
  extensionTokenHash: z.string().regex(/^[a-f0-9]{64}$/i),
});
const FLOW_LIFETIME_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  const body = await readBodyLimited(request, 4096);
  if (!body.ok)
    return NextResponse.json(
      { error: "Request is too large" },
      { status: 413 },
    );
  const parsedBody = await Promise.resolve()
    .then(() => JSON.parse(body.text) as unknown)
    .catch(() => null);
  const parsed = flowSchema.safeParse(parsedBody);
  if (!parsed.success)
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

  const { data: allowed, error: limitError } = await db.rpc(
    "allow_schoology_pair_attempt",
    {
      p_key_hash: hashExtensionSecret(
        `device-flow:${getClientAddress(request)}`,
      ),
    },
  );
  if (limitError)
    return NextResponse.json(
      { error: "Schoology connection service is unavailable" },
      { status: 503 },
    );
  if (!allowed)
    return NextResponse.json(
      { error: "Too many connection attempts. Try again later." },
      { status: 429 },
    );

  const now = new Date();
  const expiresAt = new Date(now.getTime() + FLOW_LIFETIME_MS).toISOString();
  await db
    .from("schoology_extension_flows")
    .delete()
    .lt(
      "expires_at",
      new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    );
  const { error } = await db.from("schoology_extension_flows").insert({
    flow_hash: hashExtensionSecret(parsed.data.flowId),
    poll_token_hash: hashExtensionSecret(parsed.data.pollToken),
    extension_token_hash: parsed.data.extensionTokenHash.toLowerCase(),
    expires_at: expiresAt,
  });
  if (error) {
    console.error("Could not start Schoology extension flow", {
      code: error.code,
      message: error.message,
    });
    return NextResponse.json(
      {
        error:
          error.code === "42P01" || error.code === "PGRST205"
            ? "Automatic Schoology pairing requires database migration 0005_schoology_extension_device_flow.sql."
            : "Could not start the Daymark connection. Try again shortly.",
      },
      {
        status: error.code === "42P01" || error.code === "PGRST205" ? 503 : 500,
      },
    );
  }

  return NextResponse.json(
    { expiresAt },
    { headers: { "Cache-Control": "no-store" } },
  );
}
