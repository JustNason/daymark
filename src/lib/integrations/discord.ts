export type DiscordApiError = {
  status: number;
  code?: number;
  message: string;
  permanent: boolean;
};

export function discordRedirectUri(
  requestUrl: string,
  configured?: string,
): string {
  const fallback = new URL(
    "/api/integrations/discord/callback",
    requestUrl,
  ).toString();
  if (!configured) return fallback;
  try {
    const supplied = new URL(configured);
    const expected = new URL(fallback);
    if (
      supplied.protocol === expected.protocol &&
      supplied.origin === expected.origin &&
      supplied.pathname === expected.pathname
    )
      return supplied.toString();
  } catch {
    // Invalid environment values fall back to this request's host.
  }
  return fallback;
}

export function discordMessagePayload(title: string, body: string) {
  return {
    content: `**${title}**\n${body}`,
    allowed_mentions: { parse: [] as string[] },
  };
}

export function discordTestPayload() {
  return {
    content:
      "Daymark test notification — your Discord reminders are connected.",
    allowed_mentions: { parse: [] as string[] },
  };
}

export function mapDiscordError(status: number, body = ""): DiscordApiError {
  let code: number | undefined;
  try {
    const parsed: unknown = JSON.parse(body);
    if (
      parsed &&
      typeof parsed === "object" &&
      "code" in parsed &&
      typeof parsed.code === "number"
    )
      code = parsed.code;
  } catch {
    // Discord sometimes returns non-JSON error bodies; status still maps safely.
  }
  const blocked = code === 50007 || status === 403;
  const message =
    status === 401
      ? "Discord rejected the bot credentials."
      : blocked
        ? "Discord could not open or send a direct message. Confirm the account shares a server with the Daymark bot and permits direct messages."
        : `Discord request failed (${status}).`;
  return {
    status,
    code,
    message,
    permanent: blocked || status === 400 || status === 404,
  };
}

export function isPermanentDiscordFailure(status: number, body = ""): boolean {
  return mapDiscordError(status, body).permanent;
}
