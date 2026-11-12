import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

function returnToApp(request: Request, result: string) {
  const response = NextResponse.redirect(
    new URL(`/app?discord_link=${result}`, request.url),
  );
  response.cookies.set("daymark_discord_oauth_state", "", {
    path: "/api/integrations/discord",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("daymark_discord_oauth_state")?.value;
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const response = returnToApp(
    request,
    url.searchParams.get("error") ? "cancelled" : "failed",
  );

  if (!expectedState || !state || state !== expectedState || !code)
    return response;

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) return returnToApp(request, "not_configured");
  const redirectUri =
    process.env.DISCORD_REDIRECT_URI ||
    new URL("/api/integrations/discord/callback", request.url).toString();

  const supabase = await createClient();
  const {
    data: { user },
  } = (await supabase?.auth.getUser()) || { data: { user: null } };
  if (!supabase || !user) return NextResponse.redirect(new URL("/login", url));

  try {
    const tokenResponse = await fetch(
      "https://discord.com/api/v10/oauth2/token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
        cache: "no-store",
      },
    );
    if (!tokenResponse.ok) return returnToApp(request, "failed");
    const token = (await tokenResponse.json()) as { access_token?: string };
    if (!token.access_token) return returnToApp(request, "failed");

    const userResponse = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${token.access_token}` },
      cache: "no-store",
    });
    if (!userResponse.ok) return returnToApp(request, "failed");
    const discordUser = (await userResponse.json()) as { id?: string };
    if (!discordUser.id) return returnToApp(request, "failed");

    const { error: integrationError } = await supabase
      .from("external_integrations")
      .upsert(
        {
          user_id: user.id,
          provider: "discord",
          status: "connected",
          encrypted_credentials: null,
          connected_at: new Date().toISOString(),
          last_error: null,
        },
        { onConflict: "user_id,provider" },
      );
    if (integrationError) return returnToApp(request, "failed");

    const { error } = await supabase.from("notification_preferences").upsert({
      user_id: user.id,
      discord_user_id: discordUser.id,
    });
    if (error) {
      await supabase
        .from("external_integrations")
        .update({ status: "disconnected", connected_at: null })
        .eq("user_id", user.id)
        .eq("provider", "discord");
      return returnToApp(request, "failed");
    }
    return returnToApp(request, "connected");
  } catch {
    return returnToApp(request, "failed");
  }
}
