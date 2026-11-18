# Product Requirements Document (PRD)

**Status:** living document derived from the existing implementation and the
project brief (2026-11-17). Statements marked **[verified]** were confirmed
against source or the live deployment; everything else is intent or a
recommendation. Unresolved product questions are collected at the end — they
are **TBD, not blockers** for documentation work.

Companion documents: [ROADMAP.md](ROADMAP.md) (sequencing),
[BACKLOG.md](BACKLOG.md) (tracked items),
[../design/UI_UX_AUDIT.md](../design/UI_UX_AUDIT.md) (interface findings).

---

## 1. Product summary

Daymark is a **dark-first personal productivity workspace** — tasks,
projects, calendar planning, coursework, and reminders — built for a private
pilot with multi-user data isolation from the first migration.

**Positioning:** one calm surface where a student/knowledge worker can see
today, plan the week, track coursework, and get reminded — with **contextual
intelligence, not another chatbot screen**.

**Operating constraint (owner-stated priority):** Daymark targets
**$0/month** free-tier operation across hosting, database, email, and AI
([../operations/COSTS.md](../operations/COSTS.md)).

## 2. Principles

1. **Private by design.** RLS from the first migration; secrets server-only;
   the user owns their data (see [../../SECURITY.md](../../SECURITY.md)).
2. **Honest states.** Never render fake data. Missing credentials produce
   truthful "not configured" states **[verified live: Schoology, Discord,
   AI all show honest status pills]**.
3. **Deterministic first, AI as an advisor.** The scheduler always works
   without an LLM; AI output never writes data — only explicit user approval
   does **[verified: `src/lib/scheduling.ts`, approval gate in
   `page.tsx:1287-1342`]**.
4. **Zero-cost ceiling.** Every integration and infrastructure choice is
   evaluated against free-tier limits first.
5. **Craft over feature count.** Linear + Things 3 north star — density,
   keyboard-speed, restraint, micro-motion
   ([../design/DESIGN_SYSTEM.md](../design/DESIGN_SYSTEM.md)).

## 3. Users and primary jobs

| Persona | Jobs to be done |
| --- | --- |
| Student (primary) | See what's due today/this week; keep Schoology coursework in one place; get reminded before deadlines; plan study sessions around existing commitments |
| Knowledge worker (secondary) | Capture tasks fast; timebox work on a calendar; review the week |
| Owner/operator (Nason) | Run the whole thing at $0; verify integrations actually deliver |

## 4. Feature requirements — current state

Status labels: **Implemented** (works in code) · **Partially implemented** ·
**Broken** · **Configuration required** · **Not verified** · **Planned** ·
**Deprecated**.

### Core workspace

| Requirement | Status | Evidence |
| --- | --- | --- |
| Email/password auth, Google & Discord OAuth, password reset, account deletion | Implemented (live-verified sign-in **2026-11-17**) | `src/app/login/page.tsx`, `auth/` routes |
| Tasks: create/edit/delete/duplicate, board (drag-drop) + list, filters/sort/search, detail modal with checklist & comments | Implemented | `page.tsx` |
| Projects with progress & deletion | Implemented (no edit/archive UI — PARTIAL) | `page.tsx:999-1106` |
| Calendar: month/week/day/agenda, event creation | **Partially implemented** — create-only; no edit/delete of events or work sessions (UI-06) | `page.tsx:1560-1799` |
| Today dashboard | **Partially implemented** — corrupted by calendar browsing (UI-01), hides overdue tasks (UI-02) | `page.tsx:249-266, 426-439` |
| Deterministic week planner with explicit approval | Implemented (unit-tested) | `src/lib/scheduling.ts`, `api/ai/plan` |
| Notifications center, preferences, quiet hours | **Partially implemented** — in-app/daily/weekly summary prefs stored but never consumed (UI-10) | `page.tsx`, cron route |
| Settings (timezone, workday, week-start, theme, display name) | **Partially implemented** — week-start and display-name save but have no effect (UI-10) | `page.tsx:3049-3078` |
| Responsive layout, dark/light/system theme | Implemented | `providers.tsx`, `globals.css` |
| Navigation with durable URLs | **Broken** (by design gap) — section state not in URL (UI-03) | `page.tsx:543-546` |

### Integrations

| Requirement | Status (verified 2026-11-17) | Detail |
| --- | --- | --- |
| Schoology course/assignment sync | **Broken** — OAuth step 1 gets HTTP 405 (server accepts GET, code sends POST) | [../operations/INTEGRATIONS.md](../operations/INTEGRATIONS.md) |
| Discord link + DM reminders | **Broken for linking from preview host** (redirect host mismatch); delivery **Not verified** (account never linked) | same |
| AI planner explanation | **Not configured** on either deployment; deterministic-only | `GET /api/ai/plan → configured:false` |
| Browser push | Implemented, **Not verified** | `api/push/subscribe`, `public/sw.js` |
| Email reminders (Resend) | Implemented (single provider), **Not verified** | cron route |
| Scheduled delivery (Supabase Cron, 15 min) | Implemented, **Not verified** (job state unobservable) | `supabase/cron/notifications.sql` |

### Quality

| Requirement | Status | Detail |
| --- | --- | --- |
| Automated tests | **Partially implemented** — 6 unit tests, 1 e2e smoke, no CI | [../development/TESTING.md](../development/TESTING.md) |
| RLS isolation guarantee | Implemented in schema **except a verified `profiles` gap** | [../architecture/DATABASE.md](../architecture/DATABASE.md) |
| Security headers | Partially — no CSP; cron compare not constant-time | [../../SECURITY.md](../../SECURITY.md) |

## 5. Success criteria (proposed — owner to confirm)

- **Pilot trust:** the Today screen is never observed showing stale/empty
  data after navigation (closes UI-01).
- **Integration honesty:** every integration is either live-tested with a
  recorded date/account, or labeled *Not verified* — no in-between states.
- **Core journey coverage:** register → create task → plan week → receive
  one real reminder is covered by an automated or scripted check before any
  release sign-off.
- **$0 maintained:** no line item in [COSTS.md](../operations/COSTS.md)
  exceeds its free tier during the pilot.
- **Accessibility floor:** no P1 audit finding remains open (modal dialogs,
  labeled icon buttons, AA contrast).

## 6. Non-goals (for the current phase)

- Team/collaboration features (the schema is per-user by design).
- Mobile native apps (responsive web only).
- Public/commercial launch (Vercel Hobby is personal-use only — see COSTS).
- A standalone chat assistant surface — *pending the AI philosophy decision
  below; the brief says contextual intelligence, not another chatbot.*
- Scraping Schoology without its API (explicitly out: no password requests,
  no website scraping).

## 7. Unresolved requirements (TBD — for Nason)

These do not block documentation; they gate roadmap sequencing:

1. **AI philosophy:** embedded contextual assistance (quick-add parsing,
   breakdowns, explanations) vs. a conversational surface (the dead
   `ai_conversations`/`ai_messages` schema was built for chat). Also: is a
   hosted LLM acceptable under the $0 constraint, or local/Ollama-only?
2. **Discord behavior:** is DM-only sufficient, or should the flow verify
   mutual-server status at link time (Discord bots can only DM users who
   share a server)? Who hosts the bot's server?
3. **Schoology approach:** repair official API (recommended in
   INTEGRATIONS.md) vs. structured CSV import vs. browser extension —
   or all three in sequence?
4. **Scope of the design refresh:** fix-in-place P1 defects only, or commit
   to the full component-library + token-enforcement refactor?
5. **Success criteria §5** — are these the right bars for the pilot?
