export type DeliveryChannel = "push" | "discord" | "email";

export type DeliveryPreferences = {
  push_enabled?: boolean | null;
  discord_enabled?: boolean | null;
  discord_user_id?: string | null;
  email_enabled?: boolean | null;
};

/** Recheck settings at send time so queued work honors a later opt-out. */
export function isDeliveryChannelEnabled(
  channel: string,
  preferences: DeliveryPreferences | null | undefined,
): channel is DeliveryChannel {
  if (!preferences) return false;
  if (channel === "push") return preferences.push_enabled === true;
  if (channel === "discord")
    return (
      preferences.discord_enabled === true &&
      Boolean(preferences.discord_user_id)
    );
  if (channel === "email") return preferences.email_enabled === true;
  return false;
}
