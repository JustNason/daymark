# UI/UX Audit

Audit of the existing Daymark interface. **No UI changes were made as part of
this documentation effort** — this document records problems and recommended
fixes only.

**Method:** static code audit of `src/app/app/page.tsx` (3,338 lines),
`src/app/login/page.tsx`, `src/app/globals.css` (2,437 lines) plus live
verification in the deployed app on **2026-11-17**
(`https://daymark-virid-two.vercel.app`, production). Findings marked
**[live]** were observed directly in the running application; all others are
code-verified (selected findings were re-verified against source by the lead
agent). Priority: **P1** major defect · **P2** notable · **P3** polish. (No
P0: the app is usable end-to-end for its core journeys.)

Companion documents: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) for the target
design language; [BACKLOG.md](../product/BACKLOG.md) for tracked work items.

---

## Findings

### UI-01 — Calendar browsing corrupts the Today dashboard *(P1)*

- **Current behavior:** `loadCalendarRange` overwrites the shared
  `events`/`workSessions` state used by Today, the sidebar "Planned this week"
  meter, and the "In progress" metric (`src/app/app/page.tsx:249-266`,
  verified). Nothing re-runs `reload()` on section change.
- **Problem:** navigate to another month, return to Today → empty schedule,
  zeroed metrics until some unrelated mutation triggers a reload.
- **Why it matters:** the home screen silently lies about the user's day; the
  single most-trusted screen becomes unreliable.
- **Recommendation:** keep calendar-range data in its own state slice (or
  re-run `reload()` on section change).
- **Affected:** `Workspace`, `CalendarView`, sidebar, Today section.
- **Priority:** P1 · **Dependencies:** data-layer refactor (UI-18).

### UI-02 — Overdue tasks are invisible on Today *(P1)*

- **Current behavior:** `todayTasks` matches only tasks due *today*;
  `upcoming` filters `due_at >= now` (`page.tsx:426-439`). A task overdue from
  last week appears in neither "Due today" nor "Upcoming deadlines".
- **Problem:** the most urgent work is excluded from the primary view.
- **Why it matters:** contradicts the promise "Here's what's on your plate
  today" and the Linear-style principle that overdue work is the top signal.
- **Recommendation:** add an "Overdue" bucket/metric; sort past-due first in
  upcoming lists.
- **Affected:** Today section, `Metric`, deadline list.
- **Priority:** P1 · **Dependencies:** none.

### UI-03 — Section state is not in the URL *(P1)*

- **Current behavior:** navigation is `setSection(...)` only; the URL is read
  once on mount from `?section=` (`page.tsx:298-312`, verified — the only
  `router.replace` calls are auth redirects and the Discord-link cleanup).
- **Problem:** refresh loses the section; browser Back exits the app; sections
  cannot be deep-linked or shared. Notification rows are the only deep links
  (and the cron worker hardcodes `/app?section=My%20Tasks`, requiring a
  special-case normalization at `page.tsx:302`).
- **Why it matters:** durable, shareable URLs are a baseline expectation of
  the Linear reference; today's breadcrumb is static text, not navigation.
- **Recommendation:** `router.replace("/app?section=…")` on section change now,
  with a later migration to real routes (`/app/tasks`, `/app/calendar`, …);
  migrate stored `target_url` values if routes change.
- **Affected:** sidebar, topbar, `NotificationCenter`, cron `target_url`.
- **Priority:** P1 · **Dependencies:** notification link migration if real
  routes are adopted.

### UI-04 — Clicking a specific deadline does not open that deadline *(P1)*

- **Current behavior:** each deadline row's click handler is
  `setSection("Tasks")` (`page.tsx:819`, verified) — identical to the panel's
  "All tasks" button.
- **Problem:** clicking "homework · Nov 26" lands on an unfiltered Tasks list
  with no highlight or scroll target.
- **Why it matters:** breaks "clicking the thing opens the thing" on the most
  important list of the home screen.
- **Recommendation:** open `TaskDetailModal` for the clicked task (or filter
  to it).
- **Affected:** Today → Upcoming deadlines, task detail modal.
- **Priority:** P1 · **Dependencies:** none.

### UI-05 — Modals are not accessible dialogs *(P1)*

- **Current behavior:** `TaskDetailModal`/`CreateModal` close on backdrop
  `mousedown` only; no `role="dialog"`, no `aria-modal`, no focus trap, no
  focus restore, and the global Escape handler closes only nav/account menus
  (`page.tsx:267-277`, verified).
- **Problem:** keyboard/screen-reader users tab behind dialogs, cannot Escape
  out, and focus is stranded on unmounted elements.
- **Why it matters:** WCAG 2.1.2 failure; also contradicts the "thoughtful
  keyboard interactions" half of the design direction.
- **Recommendation:** one shared `Modal` primitive: `role="dialog"`,
  `aria-modal`, `aria-labelledby`, Escape-to-close, focus trap, initial focus,
  focus restoration.
- **Affected:** both modals, all future dialogs.
- **Priority:** P1 · **Dependencies:** shared component library (UI-18).

### UI-06 — Calendar is create-only *(P1)*

- **Current behavior:** events render as non-interactive `<div>`s; only
  double-click/hover-`+` creation exists (`page.tsx:1736, 1741-1758`).
  `calendar_events` has no update/delete path; `scheduled_work_sessions` rows
  are never updated despite the schema supporting `planned|done|skipped`
  (migration line 68).
- **Problem:** users can create plans but never correct them; approved AI
  sessions accumulate with no lifecycle; double-click creation is
  undiscoverable.
- **Why it matters:** a calendar you can't fix is worse than none — the
  planner loop (propose → approve → live) never closes.
- **Recommendation:** click-to-open event detail with edit/delete; session
  actions (done/skip/cancel) on Today and calendar.
- **Affected:** `CalendarView`, `CreateModal`, Today timeline.
- **Priority:** P1 · **Dependencies:** UI-01 state isolation (schema already
  supports everything needed).

### UI-07 — Failed task create/edit silently discards input *(P1)*

- **Current behavior:** `createTask` reports errors and returns `undefined`
  (`page.tsx:313-328`, verified); `CreateModal.submit` closes the dialog
  regardless, and the detail modal's `onSave` always clears the editing state.
- **Problem:** on any network/RLS error the modal disappears, typed content is
  lost, and the only feedback is a banner elsewhere on the page.
- **Why it matters:** silent data loss on the most common workflow in the app.
- **Recommendation:** mutations return success/failure; keep the modal open
  with an inline error on failure.
- **Affected:** `CreateModal`, `TaskDetailModal`, page error banner.
- **Priority:** P1 · **Dependencies:** none.

### UI-08 — Inconsistent timezone handling between task create and edit *(P1)*

- **Current behavior:** creation parses `datetime-local` input in the profile
  timezone (`wallTimeToUtc`, `page.tsx:2138-2146`), but the edit modal
  formats and saves in the *browser* timezone (`page.tsx:1823-1825, 1919`).
  Most display formatting is browser-local while calendar/agenda use the
  profile timezone.
- **Problem:** for users whose profile timezone ≠ browser timezone, opening
  and re-saving a task can shift its due date by hours; day labels disagree
  between views.
- **Why it matters:** silent correctness bug in the core data model; students
  around term boundaries/late nights hit it at exactly midnight.
- **Recommendation:** route all datetime I/O through `src/lib/timezone.ts`
  helpers (already used correctly by `AssignmentRow`).
- **Affected:** task modals, `TaskCard`, list rows, assignment rows.
- **Priority:** P1 · **Dependencies:** none.

### UI-09 — Destructive actions have no confirmation or undo *(P1)*

- **Current behavior:** task and project deletes execute immediately
  (`page.tsx:1533-1535, 994, 1042-1056`); only account deletion confirms.
- **Problem:** one mis-click permanently destroys a task (cascading to
  subtasks/comments) or a project.
- **Why it matters:** the rare irreversible action confirms while the frequent
  irreversible action does not — inverted safety.
- **Recommendation:** Things-style optimistic delete with an "Undo" toast (or
  at minimum a confirm dialog).
- **Affected:** `TaskCard`, task list, task detail, project card.
- **Priority:** P1 · **Dependencies:** undo needs a re-insert/soft-delete
  window.

### UI-10 — Settings that save but do nothing *(P1)*

- **Current behavior (each verified by grep):**
  - "First day of week" saves (`page.tsx:3064`) but every computation hardcodes
    `weekStartsOn: 1` (`448, 845, 1599-1600, 1700-1701`).
  - `display_name` saves but is never rendered (sidebar shows the email).
  - `daily_summary`, `weekly_summary`, `in_app_enabled` are editable but the
    cron worker never branches on them
    (`src/app/api/cron/notifications/route.ts:121-125`).
  - `personal_completed`/`ignored_at` assignment fields exist and are read but
    no UI can set them; project status displays but is not editable.
  - `date_format`, `time_format`, `default_calendar_view` columns have no UI.
- **Problem:** the Settings screen promises control it doesn't deliver.
- **Why it matters:** a user who sets Sunday as week start sees Monday
  calendars and concludes the whole app is buggy; dead toggles erode trust in
  every other setting.
- **Recommendation:** wire each control up or remove it until it works; add
  assignment complete/ignore actions (schema already supports them).
- **Affected:** `SettingsView`, `NotificationPreferences`, `AssignmentRow`,
  `CalendarView`, cron worker.
- **Priority:** P1 · **Dependencies:** summary generation logic for the
  daily/weekly summary toggles.

### UI-11 — Global search only affects one section *(P1)*

- **Current behavior:** the topbar search feeds state consumed only by the
  Tasks section (`page.tsx:644-652, 421-425`). On Today/Calendar/Projects/
  Settings typing has zero visible effect. CSS styles a `<kbd>` chip for the
  search box (`globals.css:793-802`) but no keyboard shortcut exists in JSX.
- **Problem:** a permanently visible control that appears broken outside one
  view; a styled-but-absent ⌘K affordance.
- **Why it matters:** dead-end affordances are exactly the "assembled, not
  designed" impression the product brief wants to eliminate.
- **Recommendation:** make search global (tasks/projects/events jump-to) or
  scope it visibly to Tasks, and implement the keyboard shortcut the CSS
  already anticipates.
- **Affected:** topbar, Tasks section.
- **Priority:** P1 · **Dependencies:** global search needs an index over
  tasks/projects/events.

### UI-12 — Toasts never auto-dismiss and are never announced *(P1)*

- **Current behavior:** toast/error are plain strings with an X; no
  `setTimeout` exists anywhere in `src/`; no `aria-live`/`role="status"`
  anywhere; a single shared error string means concurrent failures overwrite
  each other.
- **Problem:** stale "Task added" persists indefinitely; screen readers get no
  announcements; errors clobber each other.
- **Why it matters:** feedback that outlives its event trains users to ignore
  feedback.
- **Recommendation:** auto-dismiss ~4s (respecting reduced motion), stackable
  typed toasts, `role="status"`/`role="alert"`.
- **Affected:** page shell, `NotificationCenter`, `NotificationPreferences`.
- **Priority:** P1 · **Dependencies:** shared toast primitive (UI-18).

### UI-13 — Board drag-and-drop is mouse-only *(P2)*

- **Current behavior:** native HTML5 DnD (`page.tsx:938-942, 972-975`); no
  keyboard equivalent in Board view (the List view `<select>` is the only
  alternative), no touch support. `@dnd-kit/*` is installed but unused.
- **Problem:** keyboard users must switch views; touch users are auto-switched
  to List at ≤640px and never see the board.
- **Why it matters:** drag is a headline interaction; fails WCAG 2.1.1 for the
  primary control.
- **Recommendation:** adopt the already-installed dnd-kit keyboard sensors, or
  add a per-card "move to…" menu.
- **Affected:** Tasks board.
- **Priority:** P2 · **Dependencies:** board rewrite with dnd-kit.

### UI-14 — Notification rows force full page reloads and race their own
read-state *(P2)*

- **Current behavior:** rows are raw `<a href>` (`page.tsx:2433-2438`) — Next
  only intercepts `next/link` — and `read(id)` fires async alongside the
  navigation.
- **Problem:** every notification click is a full document reload; unread
  state may not persist.
- **Why it matters:** jarring in an otherwise SPA-like app; wrong unread
  counts.
- **Recommendation:** `next/link` or `router.push`; await `read()` before
  navigating.
- **Affected:** `NotificationCenter`.
- **Priority:** P2 · **Dependencies:** UI-03 URL scheme.

### UI-15 — Mobile breakpoint mismatch: JS 640px vs CSS 760px *(P2)*

- **Current behavior:** JS forces List/Agenda views at ≤640px
  (`page.tsx:190, 1590`) while the drawer/layout switch is at 760px
  (`globals.css:2069`).
- **Problem:** between 641–760px users get the desktop board squeezed into
  horizontally scrolling 210px columns plus a hamburger drawer — neither
  intended layout.
- **Why it matters:** broken layout on a very common width range (landscape
  phones, small tablets).
- **Recommendation:** single breakpoint token shared by CSS and `matchMedia`.
- **Affected:** `Workspace`, `CalendarView`, layout media queries.
- **Priority:** P2 · **Dependencies:** none.

### UI-16 — Mobile topbar hides the notifications bell *(P2)*

- **Current behavior:** at ≤760px all `.top-actions > .icon-button` are hidden
  except the theme toggle (`globals.css:2205-2210`); the bell uses that class.
- **Problem:** on phones the unread badge is two taps away in the drawer while
  the theme toggle keeps the privileged slot.
- **Why it matters:** hierarchy inversion for a headline feature on the
  primary target device.
- **Recommendation:** keep the bell (badge included); merge or drop lower
  priority controls.
- **Affected:** topbar.
- **Priority:** P2 · **Dependencies:** none.

### UI-17 — Feedback and confirmations bypass the design system *(P2)*

- **Current behavior:** Settings uses native `alert()`/`confirm()` for
  validation and account deletion (`page.tsx:3051, 3071, 3081`); the Save
  button flips to "Saved" and never resets; Settings sub-nav is click-only
  with no scroll-spy; `NotificationPreferences` is mounted twice (Notifications
  page + Settings) with independent state that can diverge — **[live]**
  confirmed both render identical reminder panels.
- **Problem:** blocking browser dialogs, a permanently-lit save button,
  stale nav highlight, divergent duplicate forms.
- **Why it matters:** the Settings screen is where polish is expected most.
- **Recommendation:** in-app confirm primitive, reset `saved` on change,
  scroll-spy or anchor-only nav, single shared preferences state.
- **Affected:** `SettingsView`, `NotificationPreferences`.
- **Priority:** P2 · **Dependencies:** shared Confirm/Toast components.

### UI-18 — No shared component library *(P2 — structural root cause)*

- **Current behavior:** 16 inline components in one file; no `src/components/`
  directory; `DiscordIcon` duplicated verbatim in `login/page.tsx` and
  `page.tsx:3311-3325`; reusable primitives exist only as global CSS classes
  with copy-pasted markup; icon-only buttons lack labels in three places.
- **Problem:** every visual tweak must be made in N places; copy-paste drift.
- **Why it matters:** this is the root cause behind most consistency findings
  in this audit.
- **Recommendation:** extract `Button`, `IconButton`, `Modal`, `Field`,
  `Toast`, `EmptyState`, `Icon` (required label) into `src/components`, then
  split the 3,338-line page into section components.
- **Affected:** entire frontend.
- **Priority:** P2 (elevated by dependencies: unlocks UI-05, UI-07, UI-12,
  UI-17) · **Dependencies:** none (it *is* the dependency).

### UI-19 — Accessibility: missing labels, color-only signals, silent live
regions *(P2)*

- **Current behavior:** icon-only buttons without `aria-label` (task delete
  `1533`, column `+` `950-955`, cell `+` `1756-1758`); `aria-label` placed on
  non-semantic `div`s (`922, 1682, 2421`); generic "Toggle complete" instead
  of "Mark {title} complete"; priority in the deadline list is a colored dot
  only; `<time>` elements lack `datetime`; no `aria-live` (see UI-12).
  Good: global focus-visible outline, `aria-current` on nav,
  `aria-pressed`/`aria-expanded` on toggles.
- **Problem:** unlabeled controls and color-only meaning.
- **Why it matters:** WCAG 1.1.1/1.4.1 failures on core actions.
- **Recommendation:** `eslint-plugin-jsx-a11y` in CI; visually-hidden text
  for priority labels; semantic roles for button groups.
- **Affected:** task cards, board, calendar, view switchers.
- **Priority:** P2 · **Dependencies:** none.

### UI-20 — One contrast pair fails WCAG AA *(P2)*

- **Current behavior:** computed from live tokens: dark `--text-muted
  #829087` on `--surface-elevated #222d26` = **4.27:1** (needs 4.5:1) —
  occurs in modal helper text, toasts, account popover, quick-action meta.
  Light `--text-muted` on `--bg` = 4.51:1 (marginal). All other audited pairs
  pass (dark primary 15.1:1, secondary 7.7:1, accent 6.6:1).
- **Problem:** small muted text on elevated surfaces is below AA.
- **Why it matters:** one token change fixes a compliance gap; the rest of the
  palette is genuinely strong.
- **Recommendation:** darken `--text-muted` or lighten `--surface-elevated`;
  add an automated contrast check.
- **Affected:** modals, toasts, popovers.
- **Priority:** P2 · **Dependencies:** none.

### UI-21 — No optimistic updates; every mutation triggers a 9-query
reload *(P2)*

- **Current behavior:** `reload()` runs nine queries in parallel and every
  mutation awaits it (`page.tsx:196-248, 327, 1335, 1364`); board drags wait
  for the server round-trip before the card moves; one failed query among nine
  reports a single combined error.
- **Problem:** perceived latency on drag-drop; slow networks make the app feel
  broken.
- **Why it matters:** directly at odds with the "precision, instant" feel of
  Linear.
- **Recommendation:** optimistic move with rollback; targeted refetch — or
  finally adopt the already-mounted react-query provider.
- **Affected:** all mutations.
- **Priority:** P2 · **Dependencies:** UI-18/data layer.

### UI-22 — Dead framework/decorator weight *(P2)*

- **Current behavior:** Tailwind v4 imported but **zero utility classes are
  used in any JSX** and no `@apply` exists — styling is 100% hand-written CSS;
  `react-hook-form`, `@hookform/resolvers`, `@dnd-kit/*`, `class-variance-authority`,
  `cn()` are unused; the react-query provider is mounted but unqueried; the
  `.searchbox kbd` style has no element; the sidebar "Personal workspace" pill
  is a non-interactive `div` with `cursor: default`.
- **Problem:** two competing styling systems, a dependency list that
  misrepresents the architecture, faux-interactive chrome.
- **Why it matters:** confuses contributors and agents, bloats the bundle, and
  unfinished affordances read as "vibe-coded".
- **Recommendation:** decide styling direction (use Tailwind/CVA, or drop
  them and document hand-written CSS as the standard); remove or implement
  vestigial elements.
- **Affected:** build config, `package.json`, README stack claims.
- **Priority:** P2 · **Dependencies:** component-library decision (UI-18).

### UI-23 — Copy and metric mismatches *(P3)*

- **Current behavior:** metric labeled "In progress" counts events + work
  sessions, not tasks; greeting uses browser time, not profile timezone;
  breadcrumb filler "Personal workspace" on every section; sidebar meter width
  is `count × 10%` (arbitrary, caps at 10); assignments header says "Schoology
  due" even for manual rows; proposal history is write-only (no way to revisit
  an approved plan). **[live]** additional defects observed in the proposal
  card: "1 work sessions" / "Approve 1 sessions" pluralization, jammed
  `Start`/`End` labels rendered as one string, and raw `datetime-local`
  inputs styled as text.
- **Problem:** labels don't match their numbers; no plan history.
- **Why it matters:** small credibility leaks that accumulate.
- **Recommendation:** copy pass against real data semantics; proposal history
  list; fix pluralization and label layout; meaningful sidebar meter.
- **Affected:** Today, AI Planner, Assignments, sidebar.
- **Priority:** P3 · **Dependencies:** proposal history needs a read query.

### UI-24 — No loading skeletons or motion craft *(P3)*

- **Current behavior:** loading states are text lines ("Preparing your
  workspace…", "Loading notifications…"); the only `@keyframes` in 2,437 lines
  of CSS is `spin`; no modal/panel entrance or exit motion; reduced-motion
  support exists (`globals.css:2374-2383`); motion tokens `--motion-fast`
  (150ms) / `--motion-menu` (190ms) exist but are used in only four places.
- **Problem:** abrupt pop-in; no feedback rhythm.
- **Why it matters:** micro-motion is Things 3's signature; its absence is the
  most visible gap against the north star.
- **Recommendation:** skeleton loaders; 150–190ms fade/scale for modals and
  toasts using the existing motion tokens; completion check animation.
- **Affected:** all views.
- **Priority:** P3 · **Dependencies:** none.

### UI-25 — Minor navigation dead-ends *(P3)*

- **Current behavior:** unauthenticated `/app` flashes a loading state before a
  client-side redirect (no `middleware.ts`); project cards are not
  click-through (only a text button); the task list view has no column
  headers; search matches titles only; assignment complete/ignore have no
  controls (see UI-10).
- **Problem:** affordances that look clickable aren't; ones that should exist
  don't.
- **Why it matters:** accumulation determines whether the product feels
  designed.
- **Recommendation:** server-side auth redirect for `/app`; whole-card click
  targets; list headers; richer search.
- **Affected:** shell, Projects, Tasks list.
- **Priority:** P3 · **Dependencies:** UI-03 for routing work.

---

## What already matches the direction (preserve)

Verified in code **[live]**: the restrained dark-green palette with a
consistent token layer (`globals.css:2-123`); strong focus-visible and
reduced-motion support; human, specific empty states ("A little breathing
room" **[live]**); `aria-current`/`aria-pressed`/`aria-expanded` on nav and
toggles; an explicit approval gate before any AI proposal is written
**[live]** (Generate → review → Approve/Reject); timezone-aware calendar
rendering; honest "not configured" integration states instead of fake data
**[live]** (Schoology/Discord/AI all show truthful status pills); clean auth
flows with Google/Discord OAuth buttons and themed brand marks **[live]**.

## Priority summary

| Priority | Findings |
| --- | --- |
| P1 (correctness & trust) | UI-01 … UI-12 |
| P2 (structure & compliance) | UI-13 … UI-22 |
| P3 (craft) | UI-23 … UI-25 |

Sequencing note: UI-18 (component library) is not the most severe finding but
it is the highest-leverage one — five P1/P2 findings are blocked on it. The
staged plan in [`plans/IMPLEMENTATION_PLAN.md`](../../plans/IMPLEMENTATION_PLAN.md)
reflects this.
