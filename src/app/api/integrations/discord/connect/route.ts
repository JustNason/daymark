import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = (await supabase?.auth.getUser()) || { data: { user: null } };
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId || !process.env.DISCORD_CLIENT_SECRET) {
    return NextResponse.redirect(
      new URL("/app?discord_link=not_configured", request.url),
    );
  }

  const redirectUri =
    process.env.DISCORD_REDIRECT_URI ||
    new URL("/api/integrations/discord/callback", request.url).toString();
  const state = randomBytes(32).toString("base64url");
  const authorize = new URL("https://discord.com/oauth2/authorize");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("scope", "identify");
  authorize.searchParams.set("state", state);

  const response = NextResponse.redirect(authorize);
  const cookiePayload = Buffer.from(
    JSON.stringify({ state, userId: user.id }),
  ).toString("base64url");
  response.cookies.set("daymark_discord_oauth_state", cookiePayload, {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax",
    path: "/api/integrations/discord",
    maxAge: 600,
  });
  return response;
}
