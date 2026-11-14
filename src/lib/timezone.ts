export const dateInTimezone = (date: Date, timezone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

export const sameZonedDay = (
  instant: string | Date,
  date: Date,
  timezone: string,
) =>
  dateInTimezone(new Date(instant), timezone) ===
  dateInTimezone(date, timezone);

export const zonedTime = (instant: string | Date, timezone: string) =>
  new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(instant));

export const zonedPartsOf = (instant: string | Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  return Object.fromEntries(
    parts.map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
};

export const zonedInputValue = (instant: string, timezone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
};

function wallPartsToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
) {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let instant = new Date(target);
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    }).formatToParts(instant);
    const values = Object.fromEntries(
      parts.map((part) => [part.type, Number(part.value)]),
    );
    instant = new Date(
      instant.getTime() -
        Date.UTC(
          values.year,
          values.month - 1,
          values.day,
          values.hour,
          values.minute,
          values.second || 0,
        ) +
        target,
    );
  }
  return instant;
}

export const zonedMidnight = (date: Date, timezone: string) => {
  const [year, month, day] = dateInTimezone(date, timezone)
    .split("-")
    .map(Number);
  return wallPartsToInstant(year, month, day, 0, 0, timezone);
};

export const wallTimeToUtc = (value: string, timezone: string) => {
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) return new Date(NaN);
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite))
    return new Date(NaN);
  const instant = wallPartsToInstant(year, month, day, hour, minute, timezone);
  return zonedInputValue(instant.toISOString(), timezone) === value
    ? instant
    : new Date(NaN);
};
