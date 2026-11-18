# Integrations

Integrations are optional. Missing credentials must leave tasks, projects,
calendar, and deterministic planning available (verified: the app degrades to
truthful "not configured" states rather than fake data).

**Status labels:** Implemented · Partially implemented · Broken ·
Configuration required · Not verified · Planned · Deprecated.
**Verification date for live claims: 2026-11-17**, probed against
`daymark-virid-two.vercel.app` (production) and `daymark-universeftc.vercel.app`
(preview). Environment variables per [ENVIRONMENT.md](ENVIRONMENT.md).

| Integration | Code | Live status |
| --- | --- | --- |
| Schoology | Full sync implementation | **Broken** — OAuth step 1 rejected (405), verified on both deployments |
| Discord | Link/unlink/test + cron DM delivery | **Configuration required → partially verified**: credentials live on both hosts; account never linked on the test account; DM delivery **Not verified**; linking from the preview host **Broken** (redirect host mismatch) |
| AI | Advisory planner explanation | **Not configured** on either deployment (`configured:false`); deterministic planner only |
| Browser push | Subscribe + service worker + cron send | **Not verified** (VAPID env state unknown) |
| Email (Resend) | Cron-channel only, single provider | **Not verified** (no adapter despite older docs claiming one) |
| Scheduled delivery | Supabase Cron → authenticated endpoint | **Not verified** (cannot confirm job/secret from outside) |

---

## Discord — currently nonfunctional for the test account

### What exists (Implemented, code-verified)

- **OAuth linking:** `GET /api/integrations/discord/connect` → Discord
  authorize (`scope=identify` only) with a random state stored in an
  httpOnly, path-scoped, 10-minute cookie bound to the user id;
  `callback` validates state + user binding, exchanges the code, fetches
  `users/@me`, and writes `external_integrations` (status `connected`) +
  `notification_preferences.discord_user_id`. Partial failure rolls back the
  integration row.
- **Unlink:** `DELETE /api/integrations/discord` clears the id, disables the
  channel, marks the integration disconnected.
- **Delivery:** the cron worker opens a DM channel
  (`POST /users/@me/channels {recipient_id}`) and posts
  `**title**\nbody`; failures record `last_error`, retry up to 4 attempts
  with exponential backoff.
- **Test button:** `POST /api/notifications/discord-test` — session-gated,
  requires the bot token, maps 401/403 to curated human-readable errors.
- **Preferences:** `discord_enabled` toggle + `discord_user_id` in the
  Notifications/Settings panel.

### Failure investigation

**Verified problems (evidence):**

1. **Wrong redirect host on the preview deployment.** Starting "Link Discord
   account" on `daymark-universeftc.vercel.app` produced an authorize URL
   whose `redirect_uri` is `https://daymark-virid-two.vercel.app/api/integrations/discord/callback`
   (observed 2026-11-17). The state cookie is host-only, so after
   authorization Discord returns to a *different host* where the cookie does
   not exist → `state !== flow.state` → the callback redirects back with
   `discord_link=failed`. Production's own redirect URI matches its host, so
   linking should only be attempted from production (or the variable is
   corrected per environment).
2. **The test account has never linked Discord** on either deployment
   ("No Discord account linked", observed live) — so no delivery path has
   ever been exercised for this user.
3. **Linking does not enable the channel.** The callback writes
   `discord_user_id` but never sets `discord_enabled=true`
   (`callback/route.ts:102-105`); the cron requires *both*
   (`cron/notifications/route.ts:123-124`). A user who links but never
   flips the "Discord DM" toggle silently receives nothing.
4. **Misleading error copy:** the test endpoint returns "Enter your Discord
   user ID and save preferences first" — but the preferences UI has **no
   manual Discord-ID input**; the ID can only come from OAuth. (Observed
   live; the message sent me chasing a field that does not exist.)
5. **No mutual-server handling.** Discord only lets bots DM users who share
   a mutual server (or have DMs open to server members); the app never
   checks or communicates this (no `guilds` scope, no guild onboarding step,
   `DISCORD_APPLICATION_ID` never read by code). Delivery therefore depends
   on an out-of-band condition the app cannot see.
6. **No `allowed_mentions`** on outbound messages — task titles containing
   `@everyone`/`@here` pass through unfiltered.
7. **Bot token confirmed configured** on both deployments (the test
   endpoint's config check precedes its 400 response — observed live).

**Suspected problems (need runtime confirmation):**

- Discord API limitation **50007 "Cannot send messages to this user"** when
  the recipient's privacy settings block the bot — the most likely cron-path
  failure; the cron treats it as a generic failure and burns 4 retries.
- `CRON_SECRET`/Supabase Cron job state unknown — if the job never runs,
  no channel delivers regardless of Discord health.
- Whether the Discord application has any guild the test user shares.

### Repair plan (recommendation — requires approval; not implemented)

1. **Environment hygiene (trivial):** set `DISCORD_REDIRECT_URI` per
   environment, or remove it and let the code derive it from the request
   host; verify in the Discord portal that both callback URLs are registered.
2. **Fix the link→notify gap:** after a successful link, either set
   `discord_enabled=true` or show an explicit "Enable Discord reminders"
   confirmation step in the success toast flow.
3. **Fix error copy:** replace the "enter your Discord user ID" message with
   guidance to complete OAuth linking.
4. **Verify DM viability at link time:** after OAuth, attempt a lightweight
   DM-channel open and surface Discord's answer ("bot can't message you yet"
   + how to fix: server-join/privacy settings). Alternatively request the
   `guilds` scope and/or publish a one-click bot server invite link.
5. **Harden delivery:** add `allowed_mentions: {parse: []}`; treat 50007/403
   as permanent failures (fail fast, no retry burn); share one Discord client
   between cron and test route (currently duplicated logic).
6. **Prove the pipeline:** run the end-to-end test strategy below and record
   results in [TESTING.md](../development/TESTING.md).

### Testing strategy

- **Mocked (CI):** unit-test payload construction and error mapping
  (401/403/50007 → status/`last_error`), retry/backoff policy, dedupe of
  deliveries, quiet-hours deferral.
- **Live (manual, credentials required):** (1) link from production, confirm
  `discord_user_id` + `discord_enabled`; (2) press the test button, confirm
  receipt; (3) create a task due in 5 minutes with a Discord reminder
  offset, run the cron route manually with `CRON_SECRET`, confirm the DM and
  the `sent` row; (4) confirm a blocked-DM user records `failed` with a
  readable reason. Record date/account/environment.

---

## AI — implemented but disconnected from the product

### Current implementation (verified)

One endpoint, `POST /api/ai/plan` ([API.md](../architecture/API.md)), behind
the "AI Planner" page:

- The route loads the user's non-completed tasks (≤200), 8 days of events and
  planned sessions, and workday preferences **through the user-scoped client
  (RLS)**, then always computes the schedule with the deterministic
  scheduler (`src/lib/scheduling.ts`).
- If `AI_BASE_URL` + `AI_MODEL` are set, an OpenAI-compatible
  `/chat/completions` call is made whose **only** output is a rewritten
  explanation string; the system prompt forbids inventing commitments or
  claiming changes. On any error it falls back to deterministic text.
- The user reviews editable slots and must explicitly Approve/Reject; only
  approval writes `ai_scheduling_proposals` + `scheduled_work_sessions`.
- **No AI provider is configured on either live deployment** — users only
  ever see deterministic text today.

### Current limitations and integration problems (verified)

1. **AI is a text generator bolted onto one screen.** It has no access to
   conversation history (`ai_conversations`/`ai_messages` are dead schema —
   there is no chat UI), no awareness of projects, courses, assignments,
   notification history, or prior proposals (write-only), and it appears
   nowhere else in the product: not in task creation, not in the calendar,
   not in Today, not in coursework views.
2. **No provider configured** → every user experiences "Deterministic
   planner ready" with generic prose; the "AI" branding overstates what the
   feature does.
3. **Unvalidated model output** (`route.ts:150` — no `typeof` check) can
   crash the render if a provider returns a non-string `content`.
4. **Data-access boundary is narrow by construction** (good for safety, bad
   for usefulness): today it can only see tasks/events/sessions/preferences.
   Deeper assistance (project planning, coursework breakdown) requires
   widening this payload deliberately.
5. **Cost constraint:** Daymark targets $0/month; a hosted LLM is the one
   integration that can silently cost money. Local Ollama works for
   development but is unreachable from Vercel serverless — see
   [COSTS.md](COSTS.md).
6. **Security:** task titles, due dates, priorities, busy windows, and the
   user's free-text prompt leave the server to whatever `AI_BASE_URL` points
   at. With a hosted provider this is a privacy consideration the product
   owner should confirm (see the note in the next section).

### Integration proposals (recommendations — decisions need owner approval)

The brief is explicit: **contextual intelligence, not another chatbot
screen.** Candidate experiences, ordered by leverage vs. risk:

| # | Experience | Data needed | Notes |
| --- | --- | --- | --- |
| A1 | **Natural-language quick add** — "finish lab report thu 5pm, high prio" → structured task fields proposed inline in the existing New Task modal | current task form fields | highest-frequency touch; deterministic parsing fallback required; no new screen |
| A2 | **Task breakdown on demand** — "Break this down" in the task detail modal → subtask suggestions (accept/edit individually) | task title/description (+ project context) | writes only through existing subtask UI patterns after user acceptance |
| A3 | **Plan explanation everywhere** — move the AI explanation from the planner page to the Today/Calendar surfaces ("why does today look like this") | planner inputs | reuses the existing advisory architecture; zero new write paths |
| A4 | **Deadline-aware prioritization hints** — a small "suggested next" card on Today | tasks + calendar | deterministic scorer first, LLM only for wording |
| A5 | **Coursework assistance** — summarize an imported assignment into steps | `assignments.description` | depends on Schoology working or manual import |
| A6 | Conversational assistant / chat history | new tables/UI | **the dead `ai_messages` schema was built for this**; highest cost + scope; conflicts with the "not another chatbot" brief unless strongly contextual |

Cross-cutting requirements before any of these ship: a configured
provider (or explicit "local-only" stance), the output-validation fix,
per-surface context assembly with a documented data-exposure policy, usage
caps to protect the $0 target, and an owner decision on AI philosophy
(**TBD**).

---

## Schoology — currently broken at the first API call

### What exists (Implemented, code-verified)

The most complete integration in the codebase: hand-rolled OAuth 1.0
(HMAC-SHA1, `src/lib/integrations/schoology.ts`), HMAC-signed state cookie,
AES-256-GCM token encryption at rest, 89-day expiry reauthorization gate,
section/assignment sync with sync logs, personal-override preservation
(`personal_*` fields never overwritten by sync), optional auto-import to
tasks, disconnect route, course toggles in the UI, and CSV/manual fallback
documented below.

### Failure investigation

**Verified root cause (probed 2026-11-17):**

```
connect → 502 {"error":"Schoology request token failed (405)"}   (both deployments)
GET  https://api.schoology.com/v1/oauth/request_token → 401 (endpoint exists; auth missing)
POST https://api.schoology.com/v1/oauth/request_token → 405 (method not allowed)
GET/POST https://api.schoology.com/oauth/request_token → 404 (no such path)
(same GET-only behavior for /v1/oauth/access_token)
```

Daymark calls `requestToken()`/`accessToken()` with **POST**
(`schoology.ts:92-98, 117-123`); Schoology's endpoints accept **GET**. The
consumer credentials are otherwise configured (the route passes its
credential check before failing). This single method mismatch breaks the
entire integration before any user data is involved.

**Additional verified weaknesses (will matter after the method fix):**

- Sync/disconnect queries omit `.eq("user_id", …)` and rely solely on RLS.
- Pagination stops after the first 50 assignments per section when Schoology
  omits `total` (`sync/route.ts:192-196`).
- `itemsChanged` counts every row seen, overstating change counts.
- Concurrent syncs can double-create (select-then-insert races).
- Parameter sorting uses `localeCompare` instead of byte-wise comparison —
  a plausible OAuth-signature deviation that has never been verified live.

**Not verified:** everything past the request-token step — Schoology's
institutional approval status, whether the app registration is usable,
actual course/assignment payloads.

### Options and evaluation

| Option | Assessment |
| --- | --- |
| **1. Repair the official API integration** | The failure is a small, evidenced defect (HTTP method + signature hardening). Institutional approval is the unknown, not the code. **Recommended first step** — cheapest path to a working, legitimate integration |
| **2. Improve synchronization & error handling** | Do after option 1 works: user filters, pagination fix, honest change counts, concurrency guard, sync status surfaced from `integration_sync_logs` |
| **3. Structured manual imports** | CSV import of assignments (title, course, description, due date, points, URL, source ID) with preview — **works regardless of Schoology's API status**; already documented as the fallback. Recommended as a parallel, low-risk deliverable so coursework has value without the API |
| **4. Browser extension** | The project owner's hypothesis — **remain a proposal.** It could parse Schoology pages in the user's own session (no institutional API approval needed), but it introduces a new artifact to build/distribute/keep compatible, per-page scraping fragility, and a larger privacy surface (the extension sees coursework pages). Evaluate only if options 1–3 fail in practice |
| **5. Other user-authorized approaches** | LMS standards (LTI/LTI-1.3, OneRoster, CalDAV) generally require institutional deployment cooperation; Scoology has no user-level data export API beyond the REST API. Low feasibility for a personal tool, worth noting only |

**Recommendation:** repair the official API (option 1) → harden sync
(option 2) → ship manual CSV import (option 3) as the guaranteed path →
re-evaluate the browser extension (option 4) only if institutional API
access proves unobtainable. Security/privacy/maintainability rationale:
official API = least privilege and no new distribution channel; extension =
most user data exposure and ongoing maintenance cost.

### Repair plan (recommendation — not implemented)

1. Switch `requestToken`/`accessToken` to `GET` (or vendor-correct method)
   and re-probe; then validate signature construction against Schoology's
   documented examples before touching anything else.
2. Add explicit `user_id` filters; fix pagination/`changed` counting; guard
   concurrent syncs (advisory lock or `ON CONFLICT`).
3. Complete the live test strategy below; record date/account/institution.

### Testing strategy

- **Mocked (CI):** OAuth 1.0 signature vectors (known nonce/timestamp →
  expected base64), sync idempotency (same payload twice → no changes),
  personal-override preservation, pagination edge cases (missing `total`).
- **Live (manual):** full connect → callback → sync against a real
  institution account; verify courses, assignments, re-sync idempotency,
  token-expiry reauthorization messaging, disconnect.

### Data requirements (unchanged)

An assignment import must retain original title, description,
due/available dates, points, completion state, section ID, and external URL;
personal values stay in separate `personal_*` fields; deleted remote
assignments are marked unavailable/retained rather than deleting user data.
Never ask for a Schoology password; do not scrape the website.

---

## Browser push

**Status: Implemented · Not verified.**

- Generate VAPID keys (`node -e "console.log(require('web-push').generateVAPIDKeys())"`);
  set `VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (same value),
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- Users opt in through the browser permission prompt; `public/sw.js` handles
  `push` and `notificationclick`.
- Expired subscriptions are removed on 404/410.
- **Known gaps:** `push_enabled` is never reset when the last subscription is
  deleted (cron keeps queueing failing pushes); one failing subscription
  aborts the whole channel for that delivery; if the two VAPID public key
  vars diverge, subscriptions succeed but every send fails.
- Requires HTTPS in production; localhost is allowed for development.

## Email

**Status: scaffolded (single provider) · Not verified.**

- Reminder email exists only as a cron channel and only supports Resend
  (`EMAIL_PROVIDER=resend` + `EMAIL_API_KEY` + `EMAIL_FROM`). There is **no
  adapter abstraction** — any other provider fails closed.
- Supabase Auth (confirmations, password reset) is configured separately in
  Supabase Auth SMTP settings.
- Keep email disabled until sender/domain setup and a live delivery test
  pass. Provider choice must stay free-tier — see [COSTS.md](COSTS.md).

## Scheduled delivery

**Status: Implemented · Not verified (job/secret state unobservable
externally).**

- Supabase `pg_cron` + `pg_net` call the authenticated endpoint every 15
  minutes ([`supabase/cron/notifications.sql`](../../supabase/cron/notifications.sql));
  app URL + `CRON_SECRET` live in Supabase Vault; the same secret must be in
  Vercel. Vercel Hobby Cron (daily) is too coarse for reminder windows.
- **Deployment-protection caveat (verified live):** one deployment
  (`daymark-universeftc.vercel.app`) answers external requests with a Vercel
  SSO redirect — if the cron job targets it, every run fails before reaching
  the app. Point the job at the public production host (observed
  `daymark-virid-two.vercel.app`, which answers with the app's own 401) or
  configure a protection bypass. See
  [VERCEL_ENVIRONMENT_SETUP.md](VERCEL_ENVIRONMENT_SETUP.md).
- Each delivery row is unique per notification/channel with bounded retries.

## Manual fallback

Assignments can always be entered as regular tasks. CSV import should map
title, course, description, due date, points, URL, and source ID where
present, with a preview before saving (Planned — see
[BACKLOG.md](../product/BACKLOG.md)).
