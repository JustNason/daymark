import { NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { z } from "zod";
const schema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid push subscription" },
      { status: 400 },
    );
  const { endpoint, keys } = parsed.data;
  const { error } = await auth.supabase.from("push_subscriptions").upsert(
    {
      user_id: auth.user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth_secret: keys.auth,
    },
    { onConflict: "endpoint" },
  );
  if (error)
    return NextResponse.json(
      { error: "Could not save this push subscription" },
      { status: 400 },
    );
  const { error: preferenceError } = await auth.supabase
    .from("notification_preferences")
    .upsert({ user_id: auth.user.id, push_enabled: true });
  if (preferenceError)
    return NextResponse.json(
      { error: "Could not enable browser notifications" },
      { status: 400 },
    );
  return NextResponse.json({ ok: true });
}
export async function DELETE(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({}));
  if (typeof body.endpoint !== "string" || body.endpoint.length > 2048)
    return NextResponse.json(
      { error: "A valid push endpoint is required" },
      { status: 400 },
    );
  const { error } = await auth.supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", body.endpoint)
    .eq("user_id", auth.user.id);
  if (error)
    return NextResponse.json(
      { error: "Could not remove this push subscription" },
      { status: 400 },
    );
  const { count, error: countError } = await auth.supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", auth.user.id);
  if (countError)
    return NextResponse.json(
      {
        error: "Subscription was removed, but its status could not be checked",
      },
      { status: 500 },
    );
  if (!count) {
    const { error: preferenceError } = await auth.supabase
      .from("notification_preferences")
      .upsert({ user_id: auth.user.id, push_enabled: false });
    if (preferenceError)
      return NextResponse.json(
        {
          error:
            "Subscription was removed, but browser notifications could not be disabled",
        },
        { status: 500 },
      );
  }
  return NextResponse.json({ ok: true });
}
