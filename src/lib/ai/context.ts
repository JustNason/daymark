import { addDays } from "date-fns";
import { z } from "zod";
import { wallTimeToUtc } from "@/lib/timezone";

export const contextInputSchema = z.discriminatedUnion("feature", [
  z.object({
    feature: z.literal("quick_add"),
    input: z.object({
      text: z.string().trim().min(1).max(1000),
      timezone: z.string().max(80).optional(),
      allowExternalProvider: z.boolean().optional(),
    }),
  }),
  z.object({
    feature: z.literal("breakdown"),
    input: z.object({
      title: z.string().trim().min(1).max(300),
      description: z.string().max(2000).optional(),
      allowExternalProvider: z.boolean().optional(),
    }),
  }),
  z.object({
    feature: z.literal("explain"),
    input: z.object({
      slots: z
        .array(
          z.object({
            title: z.string().max(300),
            start: z.string().datetime(),
            end: z.string().datetime(),
          }),
        )
        .max(100),
      tasks: z
        .array(
          z.object({
            title: z.string().max(300),
            dueAt: z.string().datetime().nullable().optional(),
            priority: z.enum(["low", "medium", "high", "urgent"]),
          }),
        )
        .max(100)
        .optional(),
      allowExternalProvider: z.boolean().optional(),
    }),
  }),
  z.object({
    feature: z.literal("next_action"),
    input: z.object({
      tasks: z
        .array(
          z.object({
            id: z.string().uuid(),
            title: z.string().trim().min(1).max(300),
            dueAt: z.string().datetime().nullable().optional(),
            priority: z.enum(["low", "medium", "high", "urgent"]),
          }),
        )
        .max(200),
      allowExternalProvider: z.boolean().optional(),
    }),
  }),
  z.object({
    feature: z.literal("coursework_steps"),
    input: z.object({
      title: z.string().trim().min(1).max(300),
      description: z.string().max(3000).optional(),
      courseName: z.string().max(200).optional(),
      dueAt: z.string().datetime().nullable().optional(),
      allowExternalProvider: z.boolean().optional(),
    }),
  }),
]);

export type ContextFeature = z.infer<typeof contextInputSchema>["feature"];
export type ContextInput = z.infer<typeof contextInputSchema>;
export type Priority = "low" | "medium" | "high" | "urgent";

export const suggestionSchemas = {
  quick_add: z.object({
    title: z.string().trim().min(1).max(300),
    description: z.string().max(2000),
    dueAt: z.string().datetime().nullable(),
    priority: z.enum(["low", "medium", "high", "urgent"]),
    estimatedMinutes: z.number().int().min(15).max(1440),
  }),
  breakdown: z.object({
    steps: z.array(z.string().trim().min(1).max(180)).min(2).max(8),
  }),
  coursework_steps: z.object({
    steps: z.array(z.string().trim().min(1).max(180)).min(2).max(8),
  }),
  explain: z.object({ text: z.string().trim().min(1).max(1200) }),
  next_action: z.object({
    taskId: z.string().uuid(),
    title: z.string().min(1).max(300),
    reason: z.string().min(1).max(400),
  }),
} as const;

/** Keep model assistance from adding dates or task fields absent from user text. */
export function constrainQuickAddSuggestion(
  deterministic: z.infer<typeof suggestionSchemas.quick_add>,
  proposed: z.infer<typeof suggestionSchemas.quick_add>,
) {
  return {
    ...proposed,
    dueAt: deterministic.dueAt,
    priority: deterministic.priority,
    estimatedMinutes: deterministic.estimatedMinutes,
  };
}

const priorities: Array<[RegExp, Priority]> = [
  [/\b(urgent|asap|immediately)\b/i, "urgent"],
  [/\b(high priority|high prio|important)\b/i, "high"],
  [/\b(low priority|low prio)\b/i, "low"],
];

function localDate(timezone: string, now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.map((p) => [p.type, Number(p.value)]),
  );
  return new Date(Date.UTC(values.year, values.month - 1, values.day));
}

function parseDueAt(text: string, timezone: string, now: Date): string | null {
  let target = localDate(timezone, now);
  const lower = text.toLowerCase();
  if (/\btomorrow\b/.test(lower)) target = addDays(target, 1);
  else if (/\btoday\b/.test(lower)) {
    /* keep local date */
  } else {
    const explicit = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
    if (explicit)
      target = new Date(
        Date.UTC(
          Number(explicit[1]),
          Number(explicit[2]) - 1,
          Number(explicit[3]),
        ),
      );
    else {
      const weekday = lower.match(
        /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/,
      );
      if (weekday) {
        const days = [
          "sunday",
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
        ];
        const desired = days.indexOf(weekday[1]);
        const delta = (desired - target.getUTCDay() + 7) % 7 || 7;
        target = addDays(target, delta);
      } else return null;
    }
  }
  const time = text.match(
    /\b(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i,
  );
  let hour = 17;
  let minute = 0;
  if (time) {
    hour = (Number(time[1]) % 12) + (/p/i.test(time[3]) ? 12 : 0);
    minute = Number(time[2] || 0);
  }
  const date = `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(target.getUTCDate()).padStart(2, "0")}`;
  const value = `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const instant = wallTimeToUtc(value, timezone);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

function parseEstimatedMinutes(text: string): number {
  const duration = text.match(
    /\b(?:for\s+)?(\d+(?:\.\d+)?)\s*(minutes?|mins?|m|hours?|hrs?|h)\b/i,
  );
  if (!duration) return 60;
  const amount = Number(duration[1]);
  const isHours = /^(?:hours?|hrs?|h)$/i.test(duration[2]);
  const minutes = Math.round(amount * (isHours ? 60 : 1));
  return Math.max(15, Math.min(1440, minutes));
}

export function proposeQuickAdd(
  text: string,
  timezone = "UTC",
  now = new Date(),
) {
  let priority: Priority = "medium";
  for (const [pattern, value] of priorities)
    if (pattern.test(text)) {
      priority = value;
      break;
    }
  const dueAt = parseDueAt(text, timezone, now);
  const estimatedMinutes = parseEstimatedMinutes(text);
  const title = text
    .replace(
      /\b(today|tomorrow|this\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)|(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday))\b/gi,
      " ",
    )
    .replace(/\b20\d{2}-\d{1,2}-\d{1,2}\b/g, " ")
    .replace(/\b\d{1,2}(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)\b/gi, " ")
    .replace(
      /\b(?:for\s+)?\d+(?:\.\d+)?\s*(?:minutes?|mins?|m|hours?|hrs?|h)\b/gi,
      " ",
    )
    .replace(
      /\b(?:high|low)\s+(?:priority|prio)|\burgent\b|\basap\b|\bimportant\b/gi,
      " ",
    )
    .replace(/\bat\s*(?=[,.!?;]|$)/gi, " ")
    .replace(/[,.!?;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return suggestionSchemas.quick_add.parse({
    title: title || text.trim(),
    description: "",
    dueAt,
    priority,
    estimatedMinutes,
  });
}

export function proposeSteps(
  title: string,
  description = "",
  coursework = false,
) {
  const subject = title.trim().replace(/[.!?]+$/, "");
  const steps = coursework
    ? [
        `Read the assignment instructions and note the requirements for “${subject}”.`,
        "Gather the course materials and sources you will need.",
        `Draft or complete the main work for “${subject}”.`,
        "Review the rubric, proofread, and prepare the submission.",
      ]
    : [
        `Clarify what “${subject}” needs to include.`,
        description
          ? "Gather the materials and notes described for this task."
          : "Gather the materials and information you need.",
        `Complete the main work for “${subject}” in a focused session.`,
        "Review the result and mark the task complete when it is ready.",
      ];
  return { steps };
}

export function proposeNextAction<
  T extends {
    id: string;
    title: string;
    dueAt?: string | null;
    priority: Priority;
  },
>(tasks: T[], now = new Date()) {
  const score: Record<Priority, number> = {
    low: 1,
    medium: 2,
    high: 3,
    urgent: 4,
  };
  const chosen = [...tasks].sort((a, b) => {
    const ad = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
    const bd = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
    const overdue = (d: number) => d < now.getTime();
    return (
      Number(overdue(bd)) - Number(overdue(ad)) ||
      ad - bd ||
      score[b.priority] - score[a.priority]
    );
  })[0];
  if (!chosen) return null;
  const due = chosen.dueAt ? new Date(chosen.dueAt) : null;
  const reason =
    due && due.getTime() < now.getTime()
      ? "This task is overdue."
      : due
        ? "This task has the nearest deadline."
        : chosen.priority === "urgent" || chosen.priority === "high"
          ? `This task is marked ${chosen.priority} priority.`
          : "This is the next open task in your list.";
  return { taskId: chosen.id, title: chosen.title, reason };
}

export function deterministicSuggestion(payload: ContextInput) {
  switch (payload.feature) {
    case "quick_add":
      return proposeQuickAdd(
        payload.input.text,
        payload.input.timezone || "UTC",
      );
    case "breakdown":
      return proposeSteps(payload.input.title, payload.input.description);
    case "coursework_steps":
      return proposeSteps(payload.input.title, payload.input.description, true);
    case "explain": {
      const first = payload.input.slots[0];
      return {
        text: first
          ? `Your plan starts with “${first.title}”, with ${payload.input.slots.length} focused work block${payload.input.slots.length === 1 ? "" : "s"} arranged around your deadlines and available time.`
          : "No work blocks fit the current tasks and schedule. Adjust a deadline or make more time available, then try the plan again.",
      };
    }
    case "next_action":
      return proposeNextAction(payload.input.tasks);
  }
}
