import { afterEach, describe, expect, it, vi } from "vitest";
import { getAIProvider, requestStructuredSuggestion } from "@/lib/ai/provider";
import { z } from "zod";

const output = z.object({ text: z.string().min(1).max(200) });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("optional AI provider", () => {
  it("is honestly unconfigured without base URL and model", () => {
    vi.stubEnv("AI_BASE_URL", "");
    vi.stubEnv("AI_MODEL", "");
    expect(getAIProvider()).toEqual({
      configured: false,
      name: "deterministic",
    });
  });

  it("does not claim a deployed server can reach local Ollama", () => {
    vi.stubEnv("AI_BASE_URL", "http://localhost:11434/v1");
    vi.stubEnv("AI_MODEL", "qwen2.5");
    vi.stubEnv("VERCEL", "1");
    expect(getAIProvider()).toEqual({
      configured: false,
      name: "deterministic",
    });
  });

  it("accepts only string model content that parses and matches the schema", async () => {
    vi.stubEnv("AI_BASE_URL", "http://localhost:11434/v1");
    vi.stubEnv("AI_MODEL", "qwen2.5");
    vi.stubEnv("VERCEL", "");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({ text: "Focused suggestion." }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    await expect(
      requestStructuredSuggestion(
        "Return text JSON",
        { title: "Task" },
        output,
      ),
    ).resolves.toMatchObject({
      value: { text: "Focused suggestion." },
      provider: "ollama",
    });
  });

  it.each([
    { content: { text: "not a string" } },
    { content: "not JSON" },
    { content: JSON.stringify({ text: "" }) },
  ])("falls back for malformed model content", async ({ content }) => {
    vi.stubEnv("AI_BASE_URL", "https://ai.example.test/v1");
    vi.stubEnv("AI_MODEL", "test-model");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ choices: [{ message: { content } }] }),
            { status: 200 },
          ),
        ),
    );
    await expect(
      requestStructuredSuggestion(
        "Return text JSON",
        { title: "Task" },
        output,
      ),
    ).resolves.toBeNull();
  });

  it("falls back when the provider fails", async () => {
    vi.stubEnv("AI_BASE_URL", "https://ai.example.test/v1");
    vi.stubEnv("AI_MODEL", "test-model");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(
      requestStructuredSuggestion("Return text JSON", {}, output),
    ).resolves.toBeNull();
  });
});
