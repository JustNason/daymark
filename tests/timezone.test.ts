import { describe, expect, it } from "vitest";
import {
  dateInTimezone,
  sameZonedDay,
  wallTimeToUtc,
  zonedInputValue,
  zonedMidnight,
} from "@/lib/timezone";

describe("timezone helpers", () => {
  it("matches days and converts wall times in the saved timezone", () => {
    const timezone = "America/Los_Angeles";
    const instant = new Date("2026-11-13T23:30:00Z");
    expect(dateInTimezone(instant, timezone)).toBe("2026-11-13");
    expect(sameZonedDay(instant, new Date("2026-11-13T08:00:00Z"), timezone)).toBe(true);
    expect(wallTimeToUtc("2026-11-13T09:30", timezone).toISOString()).toBe("2026-11-13T17:30:00.000Z");
    expect(zonedInputValue("2026-11-13T17:30:00Z", timezone)).toBe("2026-11-13T09:30");
    expect(Number.isNaN(wallTimeToUtc("2026-03-08T02:30", timezone).getTime())).toBe(true);
  });

  it("uses 23-hour and 25-hour local days across daylight-saving changes", () => {
    const timezone = "America/Los_Angeles";
    const springStart = zonedMidnight(new Date("2026-03-08T12:00:00Z"), timezone);
    const springEnd = zonedMidnight(new Date("2026-03-09T12:00:00Z"), timezone);
    const fallStart = zonedMidnight(new Date("2026-11-01T12:00:00Z"), timezone);
    const fallEnd = zonedMidnight(new Date("2026-11-02T12:00:00Z"), timezone);
    expect((springEnd.getTime() - springStart.getTime()) / 3_600_000).toBe(23);
    expect((fallEnd.getTime() - fallStart.getTime()) / 3_600_000).toBe(25);
  });
});
