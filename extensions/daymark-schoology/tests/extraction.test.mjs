import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  extractSchoologyDocument,
  isSchoologyPage,
  normalizeDate,
} from "../dist/extraction/extract.js";

const fixture = await readFile(
  new URL("./fixtures/course-materials.html", import.meta.url),
  "utf8",
);

class FixtureElement {
  constructor(tag, attributes = {}, content = "") {
    this.tag = tag;
    this.attributes = attributes;
    this.content = content;
    this.children = [];
    this.parent = null;
  }
  get textContent() {
    return `${this.content} ${this.children.map((child) => child.textContent).join(" ")}`.trim();
  }
  getAttribute(name) {
    return this.attributes[name] ?? null;
  }
  matches(selector) {
    return selector.split(",").some((part) => this.matchesOne(part.trim()));
  }
  matchesOne(selector) {
    const attr = selector.match(/^\[([^\]]+)\]$/);
    if (attr) return Object.hasOwn(this.attributes, attr[1].split("=")[0]);
    const className = selector.match(/\.([\w-]+)/)?.[1];
    const tagName = selector.match(/^[a-z][\w-]*/i)?.[0];
    const hasAttr = selector.match(/\[([^\]]+)\]/)?.[1]?.split("=")[0];
    const hrefPage =
      selector.includes("page=") &&
      (this.attributes.href ?? "").includes("page=");
    const relNext =
      selector.includes('rel="next"') && this.attributes.rel === "next";
    return (
      (!tagName || tagName.toLowerCase() === this.tag) &&
      ((!className && !hasAttr) ||
        (className &&
          (this.attributes.class ?? "").split(/\s+/).includes(className)) ||
        (hasAttr && Object.hasOwn(this.attributes, hasAttr)) ||
        hrefPage ||
        relNext)
    );
  }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  closest(selector) {
    if (this.matches(selector)) return this;
    return this.parent?.closest(selector) ?? null;
  }
}

function parseFixture(html) {
  const root = new FixtureElement("document");
  const stack = [root];
  for (const token of html.match(/<[^>]+>|[^<]+/g) ?? []) {
    if (token.startsWith("</")) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (token.startsWith("<!") || token.startsWith("<?")) continue;
    if (!token.startsWith("<")) {
      stack[stack.length - 1].content += token;
      continue;
    }
    const match = token.match(/^<([\w-]+)([^>]*)>/);
    if (!match) continue;
    const attributes = {};
    for (const attr of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))
      attributes[attr[1]] = attr[2] ?? "";
    const element = new FixtureElement(match[1].toLowerCase(), attributes);
    element.parent = stack.at(-1);
    stack.at(-1).children.push(element);
    if (!["meta", "link", "img", "input", "br", "hr"].includes(element.tag))
      stack.push(element);
  }
  return root;
}

test("recognizes supported Schoology routes and rejects unrelated pages", () => {
  assert.equal(
    isSchoologyPage("https://app.schoology.com/course/123/materials"),
    true,
  );
  assert.equal(isSchoologyPage("https://app.schoology.com/login"), false);
  assert.equal(isSchoologyPage("https://example.org/course/123"), false);
  assert.equal(
    isSchoologyPage("https://schoology-login.example.org/course/123"),
    false,
  );
  assert.equal(
    isSchoologyPage(
      "https://school.example.edu/course/123/materials",
      "school.example.edu",
    ),
    true,
  );
  assert.equal(isSchoologyPage("not a URL"), false);
});

test("extracts courses, assignment details and completion only when page marks it", () => {
  const data = extractSchoologyDocument(
    parseFixture(fixture),
    "https://app.schoology.com/course/123/materials",
    "2026-11-19T12:00:00Z",
  );
  assert.equal(data.courses[0].externalId, "123");
  assert.equal(data.courses[0].name, "Biology 101");
  assert.equal(data.assignments.length, 3);
  assert.equal(data.assignments[0].externalId, "assignment-204");
  assert.equal(data.assignments[0].courseExternalId, "123");
  assert.equal(data.assignments[0].maxPoints, 20);
  assert.equal(data.assignments[0].completed, false);
  assert.equal(data.assignments[0].dueAt, "2026-12-03T01:00:00.000Z");
  assert.equal(data.assignments[1].completed, true);
  assert.equal(data.assignments[1].dueAt, null);
  assert.equal(data.assignments[2].externalId, "206");
  assert.equal(data.assignments[2].title, "Reading check");
  assert.ok(
    data.warnings.some((warning) => warning.includes("More Schoology pages")),
  );
});

test("invalid and missing dates normalize to null", () => {
  assert.equal(normalizeDate(undefined), null);
  assert.equal(normalizeDate("bad date"), null);
  assert.equal(
    normalizeDate("2026-12-02T17:00:00-08:00"),
    "2026-12-03T01:00:00.000Z",
  );
});
