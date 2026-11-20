import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/require-user";
import {
  hashExtensionSecret,
  readBodyLimited,
} from "@/lib/integrations/schoology-extension";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  flowId: z.string().regex(/^[A-Za-z0-9_-]{32,64}$/),
});

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return NextResponse.json(
      { error: "Request origin is not allowed" },
      { status: 403 },
    );

  const body = await readBodyLimited(request, 2048);
  if (!body.ok)
    return NextResponse.json(
      { error: "Request is too large" },
      { status: 413 },
    );
  const parsedBody = await Promise.resolve()
    .then(() => JSON.parse(body.text) as unknown)
    .catch(() => null);
  const parsed = bodySchema.safeParse(parsedBody);
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
  const { data: authorized, error } = await db.rpc(
    "authorize_schoology_extension_flow",
    {
      p_flow_hash: hashExtensionSecret(parsed.data.flowId),
      p_user_id: auth.user.id,
      p_token_expires_at: new Date(
        Date.now() + 365 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    },
  );
  if (error) {
    console.error("Could not authorize Schoology extension flow", {
      code: error.code,
      message: error.message,
    });
    return NextResponse.json(
      {
        error:
          error.code === "42883" || error.code === "PGRST202"
            ? "Automatic Schoology pairing requires database migration 0005_schoology_extension_device_flow.sql."
            : "Could not authorize the Daymark connection. Try again shortly.",
      },
      {
        status: error.code === "42883" || error.code === "PGRST202" ? 503 : 500,
      },
    );
  }
  if (!authorized)
    return NextResponse.json(
      {
        error:
          "This connection request expired or was already used. Start again from the extension.",
      },
      { status: 410 },
    );
  return NextResponse.json(
    { connected: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
