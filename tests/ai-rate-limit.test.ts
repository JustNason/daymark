import { describe, expect, it } from "vitest";
import { consumeAIRequest } from "@/lib/ai/rate-limit";

describe("AI request cap", () => {
  it("caps a user at twelve requests per hour per instance", () => {
    const user = `ai-limit-${crypto.randomUUID()}`;
    for (let request = 0; request < 12; request++) {
      expect(consumeAIRequest(user, 1_000_000 + request)).toBe(true);
    }
    expect(consumeAIRequest(user, 1_000_020)).toBe(false);
    expect(consumeAIRequest(user, 1_000_000 + 60 * 60 * 1000 + 1)).toBe(true);
  });

  it("keeps users' request buckets separate", () => {
    const first = `ai-user-a-${crypto.randomUUID()}`;
    const second = `ai-user-b-${crypto.randomUUID()}`;
    for (let request = 0; request < 12; request++) {
      expect(consumeAIRequest(first, 2_000_000 + request)).toBe(true);
    }
    expect(consumeAIRequest(second, 2_000_010)).toBe(true);
  });
});
