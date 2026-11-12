import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  if (!supabase)
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 },
    );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { data, error } = await supabase
    .from("external_integrations")
    .select("status")
    .eq("user_id", user.id)
    .eq("provider", "discord")
    .maybeSingle();
  if (error)
    return NextResponse.json(
      { error: "Could not load Discord link status." },
      { status: 500 },
    );
  return NextResponse.json({ connected: data?.status === "connected" });
}

export async function DELETE() {
  const supabase = await createClient();
  if (!supabase)
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 },
    );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { error } = await supabase.from("notification_preferences").upsert({
    user_id: user.id,
    discord_user_id: null,
    discord_enabled: false,
  });
  if (error)
    return NextResponse.json(
      { error: "Could not unlink Discord." },
      { status: 400 },
    );
  const { error: integrationError } = await supabase
    .from("external_integrations")
    .update({ status: "disconnected", connected_at: null, last_error: null })
    .eq("user_id", user.id)
    .eq("provider", "discord");
  if (integrationError)
    return NextResponse.json(
      {
        error: "Discord ID was cleared, but link status could not be updated.",
      },
      { status: 400 },
    );
  return NextResponse.json({ ok: true });
}
