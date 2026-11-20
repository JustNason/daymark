import { describe, expect, it } from "vitest";
import {
  discordMessagePayload,
  discordRedirectUri,
  discordTestPayload,
  isPermanentDiscordFailure,
  mapDiscordError,
} from "@/lib/integrations/discord";
import { mapEmailFailure, resendEmailPayload } from "@/lib/integrations/email";
import { isDeliveryChannelEnabled } from "@/lib/integrations/notifications";

describe("Discord integration helpers", () => {
  it("uses a same-environment callback and rejects a configured callback from another host", () => {
    const request =
      "https://preview.daymark.example/api/integrations/discord/connect";
    expect(discordRedirectUri(request)).toBe(
      "https://preview.daymark.example/api/integrations/discord/callback",
    );
    expect(
      discordRedirectUri(
        request,
        "https://daymark.example/api/integrations/discord/callback",
      ),
    ).toBe("https://preview.daymark.example/api/integrations/discord/callback");
    expect(
      discordRedirectUri(
        request,
        "https://preview.daymark.example/api/integrations/discord/callback",
      ),
    ).toBe("https://preview.daymark.example/api/integrations/discord/callback");
  });

  it("prevents mention parsing in outbound payloads", () => {
    expect(
      discordMessagePayload("@everyone deadline", "@here see notes"),
    ).toEqual({
      content: "**@everyone deadline**\n@here see notes",
      allowed_mentions: { parse: [] },
    });
    expect(discordTestPayload().allowed_mentions.parse).toEqual([]);
  });

  it("maps permanent and transient Discord failures", () => {
    const blocked = mapDiscordError(400, JSON.stringify({ code: 50007 }));
    expect(blocked.permanent).toBe(true);
    expect(blocked.message).toContain("shares a server");
    expect(isPermanentDiscordFailure(403)).toBe(true);
    expect(isPermanentDiscordFailure(503)).toBe(false);
  });
});

describe("email delivery helpers", () => {
  it("builds a predictable Resend text payload", () => {
    expect(
      resendEmailPayload({
        from: " Daymark <reminders@example.test> ",
        to: " person@example.test ",
        subject: " Due soon ",
        text: "Finish the report",
      }),
    ).toEqual({
      from: "Daymark <reminders@example.test>",
      to: ["person@example.test"],
      subject: "Due soon",
      text: "Finish the report",
    });
  });

  it("does not retry permanent provider failures but retries rate limits and server failures", () => {
    expect(mapEmailFailure(401).permanent).toBe(true);
    expect(mapEmailFailure(422).permanent).toBe(true);
    expect(mapEmailFailure(429).permanent).toBe(false);
    expect(mapEmailFailure(503).permanent).toBe(false);
  });
});

describe("notification delivery preferences", () => {
  it("honors current channel settings and requires a current Discord recipient", () => {
    expect(
      isDeliveryChannelEnabled("push", {
        push_enabled: false,
      }),
    ).toBe(false);
    expect(
      isDeliveryChannelEnabled("email", {
        email_enabled: true,
      }),
    ).toBe(true);
    expect(
      isDeliveryChannelEnabled("discord", {
        discord_enabled: true,
        discord_user_id: null,
      }),
    ).toBe(false);
    expect(
      isDeliveryChannelEnabled("discord", {
        discord_enabled: true,
        discord_user_id: "123",
      }),
    ).toBe(true);
    expect(isDeliveryChannelEnabled("unknown", {})).toBe(false);
  });
});
