import { describe, expect, it } from "vitest";
import { safeAuthReturnPath } from "@/lib/auth/return-path";

const origin = "https://daymark.example";
const flowId = "f".repeat(43);

describe("safeAuthReturnPath", () => {
  it("returns to the extension approval after login", () => {
    expect(
      safeAuthReturnPath(`/extension/schoology?flow=${flowId}`, origin),
    ).toBe(`/extension/schoology?flow=${flowId}`);
  });

  it("rejects missing, malformed, and external destinations", () => {
    expect(safeAuthReturnPath(null, origin)).toBe("/app");
    expect(safeAuthReturnPath("/extension/schoology?flow=bad", origin)).toBe(
      "/app",
    );
    expect(safeAuthReturnPath("https://attacker.example/", origin)).toBe(
      "/app",
    );
    expect(safeAuthReturnPath("//attacker.example/", origin)).toBe("/app");
  });

  it("preserves the password reset return path", () => {
    expect(safeAuthReturnPath("/auth/reset/confirm", origin)).toBe(
      "/auth/reset/confirm",
    );
  });
});
