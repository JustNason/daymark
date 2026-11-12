import { NextResponse } from "next/server";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
export const runtime = "nodejs";
type Task = {
  id: string;
  user_id: string;
  title: string;
  due_at: string;
  status: string;
};
type Pref = {
  user_id: string;
  reminder_minutes: number[];
  in_app_enabled: boolean;
  push_enabled: boolean;
  discord_enabled: boolean;
  discord_user_id: string | null;
  email_enabled: boolean;
};
type Delivery = {
  id: string;
  user_id: string;
  channel: string;
  attempts: number;
  notification_id: string;
};
function isQuietAt(date: Date, timezone: string, start: string, end: string) {
  if (start.slice(0, 5) === end.slice(0, 5)) return false;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const current = Number(values.hour) * 60 + Number(values.minute);
  const from = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5));
  const to = Number(end.slice(0, 2)) * 60 + Number(end.slice(3, 5));
  return from < to
    ? current >= from && current < to
    : current >= from || current < to;
}
function nextQuietEnd(
  now: Date,
  timezone: string,
  start?: string | null,
  end?: string | null,
) {
  if (!start || !end || !isQuietAt(now, timezone, start, end)) return null;
  for (let minute = 1; minute <= 24 * 60; minute++) {
    const candidate = new Date(now.getTime() + minute * 60000);
    if (!isQuietAt(candidate, timezone, start, end)) return candidate;
  }
  return null;
}
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") || "";
  if (!secret || header !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let db;
  try {
    db = createAdminClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Worker unavailable" },
      { status: 503 },
    );
  }
  const now = new Date();
  const [{ data: tasks, error: taskError }, { data: prefs, error: prefError }] =
    await Promise.all([
      db
        .from("tasks")
        .select("id,user_id,title,due_at,status")
        .not("due_at", "is", null)
        .neq("status", "completed")
        .gte("due_at", new Date(now.getTime() - 86400000).toISOString())
        .lte("due_at", new Date(now.getTime() + 4 * 86400000).toISOString())
        .limit(1000),
      db.from("notification_preferences").select("*"),
    ]);
  if (taskError || prefError)
    return NextResponse.json(
      { error: taskError?.message || prefError?.message },
      { status: 500 },
    );
  const prefMap = new Map((prefs || []).map((p) => [p.user_id, p as Pref]));
  let generated = 0;
  for (const task of (tasks || []) as Task[]) {
    const pref = prefMap.get(task.user_id);
    if (!pref) continue;
    const due = new Date(task.due_at);
    for (const minutes of pref.reminder_minutes || []) {
      const fireAt = due.getTime() - minutes * 60000;
      if (
        fireAt > now.getTime() ||
        fireAt < now.getTime() - 24 * 60 * 60 * 1000
      )
        continue;
      const key = `task:${task.id}:due:${due.toISOString()}:minus:${minutes}`;
      const { data: notification, error } = await db
        .from("notifications")
        .upsert(
          {
            user_id: task.user_id,
            kind: "task_due",
            title: minutes < 60 ? "Task due soon" : "Upcoming task deadline",
            body: task.title,
            target_url: "/app?section=My%20Tasks",
            dedupe_key: key,
          },
          { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
        )
        .select("id")
        .maybeSingle();
      if (error) continue;
      if (!notification) continue;
      generated++;
      const channels: string[] = [];
      if (pref.push_enabled) channels.push("push");
      if (pref.discord_enabled && pref.discord_user_id)
        channels.push("discord");
      if (pref.email_enabled) channels.push("email");
      if (channels.length)
        await db.from("notification_deliveries").upsert(
          channels.map((channel) => ({
            notification_id: notification.id,
            user_id: task.user_id,
            channel,
            status: "queued",
            scheduled_for: now.toISOString(),
          })),
          { onConflict: "notification_id,channel", ignoreDuplicates: true },
        );
    }
  }
  const { data: claimed, error: claimError } = await db.rpc(
    "claim_notification_deliveries",
    { batch_size: 40 },
  );
  if (claimError)
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  const deliveries = (claimed || []) as Delivery[];
  if (
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
  )
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
  let sent = 0,
    failed = 0;
  for (const row of deliveries) {
    const [{ data: preference }, { data: userPreference }] = await Promise.all([
      db
        .from("notification_preferences")
        .select("quiet_start,quiet_end")
        .eq("user_id", row.user_id)
        .maybeSingle(),
      db
        .from("user_preferences")
        .select("timezone")
        .eq("user_id", row.user_id)
        .maybeSingle(),
    ]);
    const delayedUntil = nextQuietEnd(
      new Date(),
      userPreference?.timezone || "UTC",
      preference?.quiet_start,
      preference?.quiet_end,
    );
    if (delayedUntil) {
      await db
        .from("notification_deliveries")
        .update({ status: "queued", scheduled_for: delayedUntil.toISOString() })
        .eq("id", row.id);
      continue;
    }
    const { data: n } = await db
      .from("notifications")
      .select("title,body,target_url")
      .eq("id", row.notification_id)
      .single();
    try {
      if (!n) throw new Error("Notification not found");
      if (row.channel === "push") {
        if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY)
          throw new Error("Web Push keys are not configured");
        const { data: subs } = await db
          .from("push_subscriptions")
          .select("id,endpoint,p256dh,auth_secret")
          .eq("user_id", row.user_id);
        if (!subs?.length) throw new Error("No active push subscription");
        for (const s of subs) {
          try {
            await webpush.sendNotification(
              {
                endpoint: s.endpoint,
                keys: { p256dh: s.p256dh, auth: s.auth_secret },
              },
              JSON.stringify({
                title: n.title,
                body: n.body,
                url: n.target_url || "/app",
              }),
            );
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410)
              await db.from("push_subscriptions").delete().eq("id", s.id);
            throw e;
          }
        }
      } else if (row.channel === "discord") {
        if (!process.env.DISCORD_BOT_TOKEN)
          throw new Error("Discord bot token is not configured");
        const { data: p } = await db
          .from("notification_preferences")
          .select("discord_user_id")
          .eq("user_id", row.user_id)
          .single();
        if (!p?.discord_user_id)
          throw new Error("Discord recipient is not configured");
        const open = await fetch(
          "https://discord.com/api/v10/users/@me/channels",
          {
            method: "POST",
            headers: {
              Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ recipient_id: p.discord_user_id }),
          },
        );
        if (!open.ok)
          throw new Error(`Discord DM setup failed (${open.status})`);
        const channel = (await open.json()) as { id: string };
        const dm = await fetch(
          `https://discord.com/api/v10/channels/${channel.id}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ content: `**${n.title}**\n${n.body}` }),
          },
        );
        if (!dm.ok) throw new Error(`Discord message failed (${dm.status})`);
      } else if (row.channel === "email") {
        if (
          process.env.EMAIL_PROVIDER !== "resend" ||
          !process.env.EMAIL_API_KEY ||
          !process.env.EMAIL_FROM
        )
          throw new Error("Email provider is not configured");
        const { data: authUser } = await db.auth.admin.getUserById(row.user_id);
        if (!authUser.user?.email)
          throw new Error("Account email is unavailable");
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.EMAIL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM,
            to: [authUser.user.email],
            subject: n.title,
            text: n.body,
          }),
        });
        if (!response.ok)
          throw new Error(`Email provider failed (${response.status})`);
      } else throw new Error("Unknown notification channel");
      await db
        .from("notification_deliveries")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", row.id);
      sent++;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Delivery failed";
      const retry = row.attempts < 4;
      await db
        .from("notification_deliveries")
        .update({
          status: retry ? "retry" : "failed",
          scheduled_for: new Date(
            Date.now() + Math.min(360, 2 ** row.attempts * 5) * 60000,
          ).toISOString(),
          last_error: message.slice(0, 500),
        })
        .eq("id", row.id);
      failed++;
    }
  }
  return NextResponse.json({
    ok: true,
    generated,
    claimed: deliveries.length,
    sent,
    failed,
  });
}
