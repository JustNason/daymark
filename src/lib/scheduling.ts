export type WorkItem = {
  id: string;
  title: string;
  dueAt?: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  minutes: number;
};
export type BusyRange = { start: Date; end: Date };
export type Slot = { taskId: string; title: string; start: Date; end: Date };

const zonedParts = (date: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(
    parts.map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
};
const zonedDate = (day: Date, hour: number, timezone: string) => {
  const wholeHour = Math.floor(hour);
  const minute = Math.round((hour - wholeHour) * 60);
  const desired = Date.UTC(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate(),
    wholeHour,
    minute,
  );
  let result = new Date(desired);
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(result, timezone);
    const represented = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    result = new Date(result.getTime() + desired - represented);
  }
  return result;
};

const weight: Record<WorkItem["priority"], number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};
export function planWork(
  items: WorkItem[],
  busy: BusyRange[],
  from: Date,
  to: Date,
  dayStart = 9,
  dayEnd = 17,
  timezone = "UTC",
): Slot[] {
  const slots: Slot[] = [];
  const occupied = [...busy].map((x) => ({
    start: new Date(x.start),
    end: new Date(x.end),
  }));
  const sorted = [...items].sort((a, b) => {
    const dueA = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
    const dueB = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
    return dueA - dueB || weight[b.priority] - weight[a.priority];
  });
  for (const item of sorted) {
    let remaining = Math.max(15, item.minutes);
    const deadline = item.dueAt ? new Date(item.dueAt) : to;
    const local = zonedParts(from, timezone);
    let localDay = new Date(Date.UTC(local.year, local.month - 1, local.day));
    for (
      let dayStartAt = zonedDate(localDay, dayStart, timezone);
      dayStartAt < to && dayStartAt < deadline && remaining > 0;
      localDay = new Date(localDay.getTime() + 86400000),
        dayStartAt = zonedDate(localDay, dayStart, timezone)
    ) {
      const dayCursor = dayStartAt < from ? new Date(from) : dayStartAt;
      const endOfWorkday = zonedDate(localDay, dayEnd, timezone);
      const dayEndAt = endOfWorkday < deadline ? endOfWorkday : deadline;
      if (dayEndAt <= dayCursor) continue;
      const dayBusy = occupied
        .filter((r) => r.start < dayEndAt && r.end > dayCursor)
        .sort((a, b) => a.start.getTime() - b.start.getTime());
      let cursor = dayCursor;
      for (const block of [...dayBusy, { start: dayEndAt, end: dayEndAt }]) {
        const gap = Math.floor(
          (block.start.getTime() - cursor.getTime()) / 60000,
        );
        if (gap >= 15 && remaining > 0) {
          const length = Math.min(remaining, Math.min(90, gap));
          const end = new Date(cursor.getTime() + length * 60000);
          slots.push({
            taskId: item.id,
            title: item.title,
            start: new Date(cursor),
            end,
          });
          occupied.push({ start: new Date(cursor), end });
          remaining -= length;
        }
        if (block.end > cursor) cursor = new Date(block.end);
      }
    }
  }
  return slots;
}
