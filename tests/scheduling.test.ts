import { describe, it, expect } from "vitest";
import { planWork } from "@/lib/scheduling";
describe("planWork", () => {
  it("prioritizes nearest deadline and splits long work into focused sessions", () => {
    const start = new Date("2026-11-09T00:00:00");
    const items = [
      {
        id: "later",
        title: "Later",
        dueAt: "2026-11-15T18:00:00Z",
        priority: "urgent" as const,
        minutes: 120,
      },
      {
        id: "soon",
        title: "Soon",
        dueAt: "2026-11-10T18:00:00Z",
        priority: "low" as const,
        minutes: 180,
      },
    ];
    const slots = planWork(items, [], start, new Date("2026-11-12T00:00:00"));
    expect(slots[0].taskId).toBe("soon");
    expect(
      slots.every((s) => (s.end.getTime() - s.start.getTime()) / 60000 <= 90),
    ).toBe(true);
  });
  it("does not overlap busy periods and stays inside working hours", () => {
    const start = new Date("2026-11-09T00:00:00");
    const busy = [
      {
        start: new Date("2026-11-09T10:00:00"),
        end: new Date("2026-11-09T12:00:00"),
      },
    ];
    const slots = planWork(
      [{ id: "a", title: "A", priority: "high", minutes: 120 }],
      busy,
      start,
      new Date("2026-11-10T00:00:00"),
    );
    expect(
      slots.every(
        (s) => s.start.getUTCHours() >= 9 && s.end.getUTCHours() <= 17,
      ),
    ).toBe(true);
    expect(
      slots.every((s) => s.end <= busy[0].start || s.start >= busy[0].end),
    ).toBe(true);
  });
  it("returns no slots for an empty date range", () => {
    expect(
      planWork(
        [{ id: "a", title: "A", priority: "medium", minutes: 30 }],
        [],
        new Date("2026-11-10"),
        new Date("2026-11-10"),
      ),
    ).toEqual([]);
  });
  it("uses the requested timezone and never schedules after a deadline", () => {
    const from = new Date("2026-11-09T12:00:00Z");
    const slots = planWork(
      [
        {
          id: "essay",
          title: "Essay",
          dueAt: "2026-11-09T20:00:00Z",
          priority: "high",
          minutes: 60,
        },
      ],
      [],
      from,
      new Date("2026-11-11T00:00:00Z"),
      9,
      17,
      "America/Los_Angeles",
    );
    expect(slots).toHaveLength(1);
    expect(slots[0].start.toISOString()).toBe("2026-11-09T17:00:00.000Z");
    expect(slots[0].end.getTime()).toBeLessThanOrEqual(
      new Date("2026-11-09T20:00:00Z").getTime(),
    );
  });
});
