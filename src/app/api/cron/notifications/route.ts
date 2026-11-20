import { NextResponse } from "next/server";
import webpush from "web-push";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  discordMessagePayload,
  mapDiscordError,
} from "@/lib/integrations/discord";
import { mapEmailFailure, resendEmailPayload } from "@/lib/integrations/email";
import { isDeliveryChannelEnabled } from "@/lib/integrations/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
export const runtime = "nodejs";
function safeSecretMatch(provided: string, expected: string | undefined) {
  if (!expected) return false;
  const actualHash = createHash("sha256").update(provided).digest();
  const expectedHash = createHash("sha256")
    .update(`Bearer ${expected}`)
    .digest();
  return timingSafeEqual(actualHash, expectedHash);
}

function permanentFailure(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "permanent" in error &&
      error.permanent === true,
  );
}
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
  if (!safeSecretMatch(header, secret))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let db;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Notification worker is unavailable" },
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
      { error: "Could not load tasks or notification preferences" },
      { status: 500 },
    );
  const prefMap = new Map((prefs || []).map((p) => [p.user_id, p as Pref]));
  let generated = 0;
  let queueFailures = 0;
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
      if (notification) generated++;
      let notificationId = notification?.id;
      if (!notificationId) {
        const { data: existing, error: existingError } = await db
          .from("notifications")
          .select("id")
          .eq("user_id", task.user_id)
          .eq("dedupe_key", key)
          .maybeSingle();
        if (existingError) {
          queueFailures++;
          continue;
        }
        notificationId = existing?.id;
      }
      if (!notificationId) continue;
      const channels: string[] = [];
      if (pref.push_enabled) channels.push("push");
      if (pref.discord_enabled && pref.discord_user_id)
        channels.push("discord");
      if (pref.email_enabled) channels.push("email");
      if (channels.length) {
        const { error: deliveryQueueError } = await db
          .from("notification_deliveries")
          .upsert(
            channels.map((channel) => ({
              notification_id: notificationId,
              user_id: task.user_id,
              channel,
              status: "queued",
              scheduled_for: now.toISOString(),
            })),
            { onConflict: "notification_id,channel", ignoreDuplicates: true },
          );
        if (deliveryQueueError) queueFailures++;
      }
    }
  }
  const { data: claimed, error: claimError } = await db.rpc(
    "claim_notification_deliveries",
    { batch_size: 40 },
  );
  if (claimError)
    return NextResponse.json(
      { error: "Could not claim notification deliveries" },
      { status: 500 },
    );
  const deliveries = (claimed || []) as Delivery[];
  let sent = 0,
    failed = 0;
  for (const row of deliveries) {
    const [
      { data: preference, error: preferenceError },
      { data: userPreference, error: userPreferenceError },
    ] = await Promise.all([
      db
        .from("notification_preferences")
        .select(
          "quiet_start,quiet_end,push_enabled,discord_enabled,discord_user_id,email_enabled",
        )
        .eq("user_id", row.user_id)
        .maybeSingle(),
      db
        .from("user_preferences")
        .select("timezone")
        .eq("user_id", row.user_id)
        .maybeSingle(),
    ]);
    if (preferenceError || userPreferenceError) {
      await db
        .from("notification_deliveries")
        .update({
          status: row.attempts < 4 ? "retry" : "failed",
          scheduled_for: new Date(
            Date.now() + Math.min(360, 2 ** row.attempts * 5) * 60000,
          ).toISOString(),
          last_error: "Could not load notification preferences",
        })
        .eq("id", row.id);
      failed++;
      continue;
    }
    if (!isDeliveryChannelEnabled(row.channel, preference)) {
      const { error: cancelError } = await db
        .from("notification_deliveries")
        .update({
          status: "cancelled",
          last_error: null,
        })
        .eq("id", row.id);
      if (cancelError) {
        await db
          .from("notification_deliveries")
          .update({
            status: row.attempts < 4 ? "retry" : "failed",
            scheduled_for: new Date(
              Date.now() + Math.min(360, 2 ** row.attempts * 5) * 60000,
            ).toISOString(),
            last_error: "Could not record disabled notification preference",
          })
          .eq("id", row.id);
        failed++;
      }
      continue;
    }
    const delayedUntil = nextQuietEnd(
      new Date(),
      userPreference?.timezone || "UTC",
      preference?.quiet_start,
      preference?.quiet_end,
    );
    if (delayedUntil) {
      const { error: deferError } = await db
        .from("notification_deliveries")
        .update({ status: "queued", scheduled_for: delayedUntil.toISOString() })
        .eq("id", row.id);
      if (deferError) {
        await db
          .from("notification_deliveries")
          .update({
            status: row.attempts < 4 ? "retry" : "failed",
            scheduled_for: new Date(
              Date.now() + Math.min(360, 2 ** row.attempts * 5) * 60000,
            ).toISOString(),
            last_error: "Could not defer delivery during quiet hours",
          })
          .eq("id", row.id);
        failed++;
      }
      continue;
    }
    const { data: n, error: notificationError } = await db
      .from("notifications")
      .select("title,body,target_url")
      .eq("id", row.notification_id)
      .single();
    try {
      if (notificationError) throw new Error("Could not load notification");
      if (!n) throw new Error("Notification not found");
      if (row.channel === "push") {
        if (
          !process.env.VAPID_PUBLIC_KEY ||
          !process.env.VAPID_PRIVATE_KEY ||
          !process.env.VAPID_SUBJECT
        ) {
          const failure = new Error(
            "Web Push keys are not configured",
          ) as Error & {
            permanent?: boolean;
          };
          failure.permanent = true;
          throw failure;
        }
        try {
          webpush.setVapidDetails(
            process.env.VAPID_SUBJECT,
            process.env.VAPID_PUBLIC_KEY,
            process.env.VAPID_PRIVATE_KEY,
          );
        } catch {
          const failure = new Error(
            "Web Push configuration is invalid",
          ) as Error & {
            permanent?: boolean;
          };
          failure.permanent = true;
          throw failure;
        }
        const { data: subs, error: subscriptionError } = await db
          .from("push_subscriptions")
          .select("id,endpoint,p256dh,auth_secret")
          .eq("user_id", row.user_id);
        if (subscriptionError)
          throw new Error("Could not load push subscriptions");
        if (!subs?.length) {
          const { error: disableError } = await db
            .from("notification_preferences")
            .update({ push_enabled: false })
            .eq("user_id", row.user_id);
          if (disableError)
            throw new Error("Could not disable push without a subscription");
          const failure = new Error("No active push subscription") as Error & {
            permanent?: boolean;
          };
          failure.permanent = true;
          throw failure;
        }
        let delivered = 0;
        const transientErrors: string[] = [];
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
            delivered++;
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
              const { error: removeError } = await db
                .from("push_subscriptions")
                .delete()
                .eq("id", s.id)
                .eq("user_id", row.user_id);
              if (removeError)
                transientErrors.push(
                  "Could not remove expired push subscription",
                );
            } else {
              transientErrors.push(
                `Push provider failed (${status || "network"})`,
              );
            }
          }
        }
        const {
          count: remainingSubscriptions,
          error: remainingSubscriptionsError,
        } = await db
          .from("push_subscriptions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", row.user_id);
        if (remainingSubscriptionsError)
          throw new Error("Could not check push subscriptions");
        if (!remainingSubscriptions) {
          const { error: disableError } = await db
            .from("notification_preferences")
            .update({ push_enabled: false })
            .eq("user_id", row.user_id);
          if (disableError)
            throw new Error("Could not disable push without a subscription");
        }
        if (!remainingSubscriptions && !delivered) {
          const failure = new Error("No active push subscription") as Error & {
            permanent?: boolean;
          };
          failure.permanent = true;
          throw failure;
        }
        if (!delivered && transientErrors.length)
          throw new Error(transientErrors.join(", "));
      } else if (row.channel === "discord") {
        if (!process.env.DISCORD_BOT_TOKEN) {
          const failure = new Error(
            "Discord bot token is not configured",
          ) as Error & { permanent?: boolean };
          failure.permanent = true;
          throw failure;
        }
        const discordUserId = preference?.discord_user_id;
        if (!discordUserId) {
          const failure = new Error(
            "Discord recipient is not configured",
          ) as Error & { permanent?: boolean };
          failure.permanent = true;
          throw failure;
        }
        const open = await fetch(
          "https://discord.com/api/v10/users/@me/channels",
          {
            method: "POST",
            headers: {
              Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ recipient_id: discordUserId }),
          },
        );
        if (!open.ok) {
          const mapped = mapDiscordError(open.status, await open.text());
          const failure = new Error(mapped.message) as Error & {
            permanent?: boolean;
          };
          failure.permanent = mapped.permanent;
          throw failure;
        }
        const channel = (await open.json()) as { id: string };
        const dm = await fetch(
          `https://discord.com/api/v10/channels/${channel.id}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(discordMessagePayload(n.title, n.body)),
          },
        );
        if (!dm.ok) {
          const mapped = mapDiscordError(dm.status, await dm.text());
          const failure = new Error(mapped.message) as Error & {
            permanent?: boolean;
          };
          failure.permanent = mapped.permanent;
          throw failure;
        }
      } else if (row.channel === "email") {
        if (
          process.env.EMAIL_PROVIDER !== "resend" ||
          !process.env.EMAIL_API_KEY ||
          !process.env.EMAIL_FROM
        ) {
          const failure = new Error(
            "Email provider is not configured",
          ) as Error & { permanent?: boolean };
          failure.permanent = true;
          throw failure;
        }
        const { data: authUser, error: authUserError } =
          await db.auth.admin.getUserById(row.user_id);
        if (authUserError) throw new Error("Could not load account email");
        if (!authUser.user?.email) {
          const failure = new Error("Account email is unavailable") as Error & {
            permanent?: boolean;
          };
          failure.permanent = true;
          throw failure;
        }
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.EMAIL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            resendEmailPayload({
              from: process.env.EMAIL_FROM,
              to: authUser.user.email,
              subject: n.title,
              text: n.body,
            }),
          ),
        });
        if (!response.ok) {
          const mapped = mapEmailFailure(response.status);
          const failure = new Error(mapped.message) as Error & {
            permanent?: boolean;
          };
          failure.permanent = mapped.permanent;
          throw failure;
        }
      } else throw new Error("Unknown notification channel");
      const { error: sentUpdateError } = await db
        .from("notification_deliveries")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", row.id);
      if (sentUpdateError)
        throw new Error("Delivery succeeded but status could not be recorded");
      sent++;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Delivery failed";
      const retry = row.attempts < 4 && !permanentFailure(e);
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
  return NextResponse.json(
    {
      ok: queueFailures === 0,
      generated,
      claimed: deliveries.length,
      sent,
      failed,
      queueFailures,
    },
    { status: queueFailures ? 500 : 200 },
  );
}
