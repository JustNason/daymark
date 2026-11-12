import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  if (!supabase)
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 },
    );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    return NextResponse.json(
      { error: "Please sign in again." },
      { status: 401 },
    );

  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token)
    return NextResponse.json(
      { error: "Discord notifications are not configured on the server." },
      { status: 503 },
    );

  const { data: preferences, error: preferenceError } = await supabase
    .from("notification_preferences")
    .select("discord_user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (preferenceError)
    return NextResponse.json(
      { error: "Could not load your Discord settings." },
      { status: 500 },
    );
  if (!preferences?.discord_user_id)
    return NextResponse.json(
      { error: "Enter your Discord user ID and save preferences first." },
      { status: 400 },
    );

  const { data: integration, error: integrationError } = await supabase
    .from("external_integrations")
    .select("status")
    .eq("user_id", user.id)
    .eq("provider", "discord")
    .maybeSingle();
  if (integrationError || integration?.status !== "connected")
    return NextResponse.json(
      { error: "Link your Discord account in settings before sending a test." },
      { status: 400 },
    );

  try {
    const dm = await fetch("https://discord.com/api/v10/users/@me/channels", {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ recipient_id: preferences.discord_user_id }),
      cache: "no-store",
    });
    if (!dm.ok) {
      return NextResponse.json(
        {
          error:
            dm.status === 401
              ? "Discord rejected the bot token. Check DISCORD_BOT_TOKEN in Vercel."
              : `Discord could not open a DM (${dm.status}). Check the user ID and that the bot can message you.`,
        },
        { status: 502 },
      );
    }
    const channel = (await dm.json()) as { id?: string };
    if (!channel.id)
      return NextResponse.json(
        { error: "Discord did not return a DM channel." },
        { status: 502 },
      );

    const sent = await fetch(
      `https://discord.com/api/v10/channels/${channel.id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content:
            "Daymark test notification — your Discord reminders are connected.",
        }),
        cache: "no-store",
      },
    );
    if (!sent.ok)
      return NextResponse.json(
        {
          error:
            sent.status === 403
              ? "Discord blocked the message. Check your DM privacy settings and try again."
              : `Discord could not send the test message (${sent.status}).`,
        },
        { status: 502 },
      );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Could not reach Discord. Please try again." },
      { status: 502 },
    );
  }
}
