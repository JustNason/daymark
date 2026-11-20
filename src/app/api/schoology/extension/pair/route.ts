import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getClientAddress,
  hashExtensionSecret,
  normalizePairingCode,
  readBodyLimited,
} from "@/lib/integrations/schoology-extension";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({ pairingCode: z.string().trim().min(16).max(40) });

export async function POST(request: Request) {
  const maxBodyBytes = 4096;
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxBodyBytes)
    return NextResponse.json(
      { error: "Pairing request is too large" },
      { status: 413 },
    );
  const bodyRead = await readBodyLimited(request, maxBodyBytes);
  if (!bodyRead.ok)
    return NextResponse.json(
      { error: "Pairing request is too large" },
      { status: 413 },
    );
  const body = await Promise.resolve()
    .then(() => JSON.parse(bodyRead.text) as unknown)
    .catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Enter a valid Daymark pairing code" },
      { status: 400 },
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

  const addressHash = hashExtensionSecret(getClientAddress(request));
  const { data: allowed, error: limitError } = await db.rpc(
    "allow_schoology_pair_attempt",
    { p_key_hash: addressHash },
  );
  if (limitError)
    return NextResponse.json(
      { error: "Pairing service is unavailable" },
      { status: 503 },
    );
  if (!allowed)
    return NextResponse.json(
      { error: "Too many pairing attempts. Try again later." },
      { status: 429 },
    );

  const pairingCode = normalizePairingCode(parsed.data.pairingCode);
  if (!pairingCode)
    return NextResponse.json(
      { error: "Pairing code is invalid or expired" },
      { status: 400 },
    );
  const token = randomBytes(32).toString("base64url");
  const tokenExpiresAt = new Date(
    Date.now() + 365 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: userId, error } = await db.rpc(
    "consume_schoology_pairing_code",
    {
      p_code_hash: hashExtensionSecret(pairingCode),
      p_token_hash: hashExtensionSecret(token),
      p_token_expires_at: tokenExpiresAt,
    },
  );
  if (error)
    return NextResponse.json(
      { error: "Pairing could not be completed" },
      { status: 500 },
    );
  if (!userId)
    return NextResponse.json(
      { error: "Pairing code is invalid, expired, or already used" },
      { status: 400 },
    );

  return NextResponse.json(
    { token },
    { headers: { "Cache-Control": "no-store" } },
  );
}
