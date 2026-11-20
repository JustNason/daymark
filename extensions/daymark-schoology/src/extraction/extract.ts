import type {
  SchoologyAssignment,
  SchoologyCourse,
  SchoologySnapshot,
} from "../shared/types.js";

const SCHOOL_PATH =
  /\/(?:home(?:\/|$)|courses?(?:\/|$)|course\/\d+|assignment\/\d+)/i;
const ID_PATH = /\/(?:course|assignment|assessment)\/(\d+)/i;

export function isSchoologyPage(url: string, customHost?: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const allowedCustomHost = customHost
      ?.trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .split("/")[0];
    const knownSchoologyHost =
      host === "schoology.com" || host.endsWith(".schoology.com");
    const explicitlyAllowedHost = Boolean(
      allowedCustomHost &&
        (host === allowedCustomHost || host.endsWith(`.${allowedCustomHost}`)),
    );
    return (
      (knownSchoologyHost || explicitlyAllowedHost) &&
      SCHOOL_PATH.test(parsed.pathname) &&
      parsed.protocol === "https:"
    );
  } catch {
    return false;
  }
}

function text(element: Element | null | undefined): string | undefined {
  const value = element?.textContent?.replace(/\s+/g, " ").trim();
  return value || undefined;
}

function dateValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value.trim());
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

function href(
  element: Element | null | undefined,
  base: string,
): string | undefined {
  const raw = element?.getAttribute("href");
  if (!raw) return undefined;
  try {
    const url = new URL(raw, base);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function stableId(
  element: Element,
  url: string | undefined,
  kind: "course" | "assignment",
): string | undefined {
  const explicit =
    element.getAttribute("data-id") ??
    element.getAttribute(
      kind === "assignment" ? "data-assignment-id" : "data-course-id",
    );
  if (explicit && /^[\w-]{1,120}$/.test(explicit)) return explicit;
  const match = url?.match(ID_PATH);
  return match?.[1];
}

function firstText(root: ParentNode, selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const found = text(root.querySelector(selector));
    if (found) return found;
  }
  return undefined;
}

function assignmentFrom(
  element: Element,
  courseId: string,
  base: string,
): SchoologyAssignment | undefined {
  const link = element.matches("a[href]")
    ? element
    : element.querySelector(
        'a[href*="assignment"], a[href*="/assessment"], a[href]',
      );
  const url = href(link, base);
  const id =
    stableId(element, url, "assignment") ??
    (link ? stableId(link, url, "assignment") : undefined);
  const title = firstText(element, [
    ".item-title",
    ".assignment-title",
    ".title",
    "h2",
    "h3",
    "a[href]",
  ]);
  if (!id || !title) return undefined;
  const dueText =
    element.querySelector("time[datetime]")?.getAttribute("datetime") ??
    element.querySelector("[data-due-date]")?.getAttribute("data-due-date");
  const maxRaw =
    element
      .querySelector("[data-max-points]")
      ?.getAttribute("data-max-points") ??
    firstText(element, [".max-points", ".points-possible"]);
  const maxNumber = maxRaw ? Number(maxRaw.replace(/[^\d.]/g, "")) : NaN;
  const description = firstText(element, [
    ".description",
    ".assignment-description",
    "[data-description]",
  ]);
  const statusText =
    `${element.getAttribute("data-status") ?? ""} ${element.getAttribute("class") ?? ""} ${text(element) ?? ""}`.toLowerCase();
  const completion = /not submitted|incomplete|missing/.test(statusText)
    ? false
    : /submitted|completed|graded/.test(statusText)
      ? true
      : null;
  return {
    externalId: id,
    courseExternalId: courseId,
    title: title.slice(0, 300),
    ...(description ? { description: description.slice(0, 5000) } : {}),
    ...(url ? { url } : {}),
    dueAt: dateValue(dueText),
    availableAt: null,
    maxPoints: Number.isFinite(maxNumber) ? maxNumber : null,
    completed: completion,
  };
}

function collectAssignments(
  root: ParentNode,
  courseId: string,
  base: string,
): SchoologyAssignment[] {
  const candidates = root.querySelectorAll(
    '[data-assignment-id], [data-id][class*="assignment"], .assignment, .upcoming-assignment, .item-assignment',
  );
  const deduped = new Map<string, SchoologyAssignment>();
  for (const item of candidates) {
    const assignment = assignmentFrom(item, courseId, base);
    if (assignment) {
      const previous = deduped.get(assignment.externalId);
      deduped.set(
        assignment.externalId,
        previous
          ? {
              ...previous,
              ...assignment,
              description: assignment.description ?? previous.description,
              url: assignment.url ?? previous.url,
              dueAt: assignment.dueAt ?? previous.dueAt,
              availableAt: assignment.availableAt ?? previous.availableAt,
              maxPoints: assignment.maxPoints ?? previous.maxPoints,
              completed: assignment.completed ?? previous.completed,
            }
          : assignment,
      );
    }
  }
  return [...deduped.values()];
}

/** Extracts only information already rendered in the signed-in page DOM. */
export function extractSchoologyDocument(
  doc: Document,
  pageUrl: string,
  scannedAt = new Date().toISOString(),
): SchoologySnapshot {
  const warnings: string[] = [];
  const hasNextPage =
    doc.querySelectorAll(
      'a[rel="next"], .pager .next, [aria-label="Next"], a[href*="page="]',
    ).length > 0;
  const coursesById = new Map<string, SchoologyCourse>();
  const courseNodes = doc.querySelectorAll(
    '[data-course-id], a[href*="/course/"], .course-title a, .course-name a',
  );
  const courseNodesById = new Map<string, Element>();

  for (const node of courseNodes) {
    const url = href(node, pageUrl);
    const id = stableId(node, url, "course");
    const name = text(node);
    if (!id || !name || /assignment/i.test(name)) continue;
    if (!courseNodesById.has(id)) courseNodesById.set(id, node);
    if (!coursesById.has(id)) {
      coursesById.set(id, {
        externalId: id,
        name: name.replace(/\s+/g, " ").slice(0, 200),
        ...(url ? { url } : {}),
        assignments: [],
      });
    }
  }

  const courseMatch = pageUrl.match(/\/course\/(\d+)/i);
  if (courseMatch && !coursesById.has(courseMatch[1])) {
    const heading = firstText(doc, [
      "h1",
      ".course-title",
      "[data-course-name]",
    ]);
    if (heading)
      coursesById.set(courseMatch[1], {
        externalId: courseMatch[1],
        name: heading,
        assignments: [],
      });
  }

  if (coursesById.size === 0 && courseMatch)
    warnings.push(
      "Course page detected, but its name could not be read from the rendered page.",
    );
  if (coursesById.size === 0)
    warnings.push(
      "No courses were found in the rendered page. Open a course list or course materials page and scan again.",
    );

  const allAssignments = new Map<string, SchoologyAssignment>();
  const activeCourseId = courseMatch?.[1];
  if (activeCourseId) {
    for (const assignment of collectAssignments(doc, activeCourseId, pageUrl)) {
      const key = `${assignment.courseExternalId}:${assignment.externalId}`;
      const previous = allAssignments.get(key);
      allAssignments.set(
        key,
        previous
          ? {
              ...assignment,
              description: assignment.description ?? previous.description,
              url: assignment.url ?? previous.url,
              dueAt: assignment.dueAt ?? previous.dueAt,
              maxPoints: assignment.maxPoints ?? previous.maxPoints,
              completed: assignment.completed ?? previous.completed,
            }
          : assignment,
      );
    }
  }

  for (const course of coursesById.values()) {
    const courseNode = courseNodesById.get(course.externalId);
    const container =
      courseNode?.closest(
        ".course, .course-list-item, [data-course-container]",
      ) ?? courseNode?.parentElement;
    if (!container) continue;
    for (const assignment of collectAssignments(
      container,
      course.externalId,
      pageUrl,
    )) {
      const key = `${assignment.courseExternalId}:${assignment.externalId}`;
      const previous = allAssignments.get(key);
      allAssignments.set(
        key,
        previous
          ? {
              ...assignment,
              description: assignment.description ?? previous.description,
              url: assignment.url ?? previous.url,
              dueAt: assignment.dueAt ?? previous.dueAt,
              maxPoints: assignment.maxPoints ?? previous.maxPoints,
              completed: assignment.completed ?? previous.completed,
            }
          : assignment,
      );
    }
  }

  const assignments = [...allAssignments.values()];
  for (const course of coursesById.values()) {
    course.assignments = assignments.filter(
      (assignment) => assignment.courseExternalId === course.externalId,
    );
  }
  if (assignments.length === 0)
    warnings.push(
      "No assignments could be reliably identified on this page. Visit a course materials page to include that course.",
    );
  if (hasNextPage)
    warnings.push(
      "More Schoology pages are available. Open the next page and scan again to include its courses or assignments.",
    );
  return {
    pageUrl,
    scannedAt,
    courses: [...coursesById.values()],
    assignments,
    warnings,
  };
}

export function normalizeDate(value: string | null | undefined): string | null {
  return dateValue(value);
}
