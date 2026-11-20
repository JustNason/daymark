import { describe, expect, it } from "vitest";
import {
  constrainQuickAddSuggestion,
  deterministicSuggestion,
  proposeNextAction,
  proposeQuickAdd,
  proposeSteps,
} from "@/lib/ai/context";
import { maxFreeWindowMinutes } from "@/lib/scheduling";

describe("contextual AI deterministic proposals", () => {
  it("parses the title, priority, weekday, and local time for quick add", () => {
    const now = new Date("2026-11-16T18:00:00Z");
    expect(
      proposeQuickAdd(
        "Finish the chemistry lab report Thursday at 5 PM, high priority",
        "America/Los_Angeles",
        now,
      ),
    ).toEqual({
      title: "Finish the chemistry lab report",
      description: "",
      dueAt: "2026-11-20T01:00:00.000Z",
      priority: "high",
      estimatedMinutes: 60,
    });
  });

  it("does not invent a deadline when a request has no date", () => {
    expect(
      proposeQuickAdd(
        "Read the chapter",
        "UTC",
        new Date("2026-11-19T12:00:00Z"),
      ).dueAt,
    ).toBeNull();
  });

  it("extracts a requested duration and removes it from the task title", () => {
    expect(
      proposeQuickAdd("Study chemistry for 45 minutes tomorrow", "UTC"),
    ).toMatchObject({
      title: "Study chemistry",
      estimatedMinutes: 45,
    });
    expect(proposeQuickAdd("Read for 1.5 hours", "UTC").estimatedMinutes).toBe(
      90,
    );
  });

  it("bounds unusually short or long requested durations", () => {
    expect(
      proposeQuickAdd("Review notes for 5 minutes", "UTC").estimatedMinutes,
    ).toBe(15);
    expect(proposeQuickAdd("Study for 30 hours", "UTC").estimatedMinutes).toBe(
      1440,
    );
  });

  it("finds the largest remaining workday gap around existing commitments", () => {
    expect(
      maxFreeWindowMinutes(
        new Date("2026-11-19T10:00:00Z"),
        new Date("2026-11-19T09:00:00Z"),
        new Date("2026-11-19T17:00:00Z"),
        [
          { start: "2026-11-19T11:00:00Z", end: "2026-11-19T12:00:00Z" },
          { start: "2026-11-19T11:30:00Z", end: "2026-11-19T13:00:00Z" },
          { start: "2026-11-19T15:00:00Z", end: "2026-11-19T16:00:00Z" },
        ],
      ),
    ).toBe(120);
    expect(
      maxFreeWindowMinutes(
        new Date("2026-11-19T18:00:00Z"),
        new Date("2026-11-19T09:00:00Z"),
        new Date("2026-11-19T17:00:00Z"),
        [],
      ),
    ).toBe(0);
  });

  it("does not let an opted-in model invent a deadline or override parsed task facts", () => {
    const deterministic = proposeQuickAdd(
      "Study biology for 45 minutes",
      "UTC",
    );
    const constrained = constrainQuickAddSuggestion(deterministic, {
      ...deterministic,
      title: "Study biology for the exam",
      dueAt: "2026-12-31T17:00:00.000Z",
      priority: "urgent",
      estimatedMinutes: 120,
    });
    expect(constrained).toMatchObject({
      title: "Study biology for the exam",
      dueAt: null,
      priority: "medium",
      estimatedMinutes: 45,
    });
  });

  it("provides task and coursework steps without a model", () => {
    expect(
      proposeSteps("Write the report").steps.length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      proposeSteps("Complete the lab", "Use the attached rubric", true).steps,
    ).toHaveLength(4);
  });

  it("selects a deterministic next action and explains the reason", () => {
    const overdue = {
      id: "da2ac293-89a0-4f81-998b-5d4dce9f6bb0",
      title: "Late task",
      dueAt: "2026-11-18T10:00:00Z",
      priority: "low" as const,
    };
    const soon = {
      id: "ea2ac293-89a0-4f81-998b-5d4dce9f6bb0",
      title: "Soon task",
      dueAt: "2026-11-20T10:00:00Z",
      priority: "urgent" as const,
    };
    expect(
      proposeNextAction([soon, overdue], new Date("2026-11-19T12:00:00Z")),
    ).toMatchObject({ taskId: overdue.id, reason: "This task is overdue." });
    expect(
      deterministicSuggestion({
        feature: "breakdown",
        input: { title: "Prepare slides" },
      }),
    ).toHaveProperty("steps");
  });
});
