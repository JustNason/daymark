import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { accessToken } from "@/lib/integrations/schoology";
import { encryptSecret, verifyState } from "@/lib/integrations/crypto";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const supabase = await createClient();
  const {
    data: { user },
  } = (await supabase?.auth.getUser()) || { data: { user: null } };
  const cookie = (await import("next/headers")).cookies;
  const jar = await cookie();
  const raw = jar.get("daymark_schoology_oauth")?.value;
  const response = NextResponse.redirect(
    new URL("/app?section=Settings", url.origin),
  );
  response.cookies.delete("daymark_schoology_oauth");
  const payload = raw ? verifyState(raw) : null;
  let state: { userId: string; key: string; secret: string } | null = null;
  try {
    state = payload ? JSON.parse(payload) : null;
  } catch {}
  if (
    !state ||
    !user ||
    state.userId !== user.id ||
    url.searchParams.get("oauth_token") !== state.key ||
    !url.searchParams.get("oauth_verifier")
  ) {
    return NextResponse.redirect(
      new URL("/app?integration=schoology_error", url.origin),
    );
  }
  try {
    const token = await accessToken(
      { key: state.key, secret: state.secret },
      url.searchParams.get("oauth_verifier")!,
    );
    const encrypted = encryptSecret({
      key: token.key,
      secret: token.secret,
      issuedAt: new Date().toISOString(),
    });
    const result = await supabase!.from("external_integrations").upsert(
      {
        user_id: user.id,
        provider: "schoology",
        status: "connected",
        encrypted_credentials: encrypted,
        connected_at: new Date().toISOString(),
        last_error: null,
      },
      { onConflict: "user_id,provider" },
    );
    if (result.error) throw result.error;
    return response;
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Schoology connection failed";
    return NextResponse.redirect(
      new URL(
        `/app?integration_error=${encodeURIComponent(message.slice(0, 120))}`,
        url.origin,
      ),
    );
  }
}
