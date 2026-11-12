import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
const schema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});
export async function POST(request: Request) {
  const c = await createClient();
  if (!c)
    return NextResponse.json(
      { error: "Supabase is not configured" },
      { status: 503 },
    );
  const {
    data: { user },
  } = await c.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid push subscription" },
      { status: 400 },
    );
  const { endpoint, keys } = parsed.data;
  const { error } = await c.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth_secret: keys.auth,
    },
    { onConflict: "endpoint" },
  );
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  await c
    .from("notification_preferences")
    .upsert({ user_id: user.id, push_enabled: true });
  return NextResponse.json({ ok: true });
}
export async function DELETE(request: Request) {
  const c = await createClient();
  const {
    data: { user },
  } = (await c?.auth.getUser()) || { data: { user: null } };
  if (!c || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (typeof body.endpoint !== "string")
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  await c.from("push_subscriptions").delete().eq("endpoint", body.endpoint);
  return NextResponse.json({ ok: true });
}
