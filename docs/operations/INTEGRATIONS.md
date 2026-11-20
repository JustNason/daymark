# Integrations

Integrations are optional. Missing credentials must leave tasks, projects,
calendar, and deterministic planning available (verified: the app degrades to
truthful "not configured" states rather than fake data).

**Status labels:** Implemented · Partially implemented · Broken ·
Configuration required · Not verified · Planned · Deprecated.
**Verification date for live claims: 2026-11-17**, probed against
`daymark-virid-two.vercel.app` (production) and `daymark-universeftc.vercel.app`
(preview). Environment variables per [ENVIRONMENT.md](ENVIRONMENT.md).

| Integration        | Code                                               | Live status                                                                                                                                                                                                                |
| ------------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schoology          | Daymark MV3 extension, pairing and sync            | **Not live-verified** — fixture tests pass; authenticated institution session unavailable                                                                                                                                  |
| Discord            | Link/unlink/test + cron DM delivery                | **Configuration required → partially verified**: credentials live on both hosts; account never linked on the test account; DM delivery **Not verified**; linking from the preview host **Broken** (redirect host mismatch) |
| AI                 | Contextual assistance + deterministic scheduler    | **Not configured** in the previously audited deployment; no live provider round-trip                                                                                                                                       |
| Browser push       | Subscribe/unsubscribe + service worker + cron send | **Implemented; delivery not verified**                                                                                                                                                                                     |
| Email (Resend)     | Cron-channel delivery                              | **Implemented; delivery not verified**                                                                                                                                                                                     |
| Scheduled delivery | Supabase Cron → authenticated endpoint             | **Implemented; deployed job/Vault/host not verified**                                                                                                                                                                      |

---

## Discord — linking and delivery

**Status: Code fixes implemented; live linking and delivery Not verified.**

OAuth linking uses a user-bound, short-lived state cookie and scopes only `identify`. `discordRedirectUri()` accepts a configured URI only when it matches the current request origin and callback path; otherwise it derives the callback from the current host. Successful linking stores the recipient and enables `discord_enabled`; unlinking clears the recipient and disables notifications. DMs use `allowed_mentions: { parse: [] }` and curated handling for mutual-server/privacy failures. The cron queue records delivery outcomes and retries transient failures up to four times.

The test route and production DM delivery have not been exercised with a linked account in this continuation. Verify mutual-server bot access and actual message receipt before upgrading status. Historical 2026-11-17 probes found a preview redirect mismatch; the current code has a host-safe fallback, but the live OAuth registration still needs verification.

---

## Contextual AI — embedded assistance

**Status: Implemented in source; external provider Not configured/verified.**

A provider abstraction supports OpenAI-compatible `/chat/completions` endpoints and local Ollama development. Model calls require per-action user opt-in; otherwise requests use deterministic parsing/rules or the deterministic scheduler. Quick add proposes fields for review, task/coursework breakdown proposes steps that the user approves, plan explanations do not alter slots, and the Today next-action hint uses actual open tasks. No standalone chatbot is exposed.

Inputs and structured outputs are bounded and Zod-validated. Invalid provider output, timeout, or failure returns a deterministic suggestion where available. Rate limits are per running instance and best-effort in serverless deployments. No real provider call has been verified, and AI output has no direct database write path. See [AI.md](../architecture/AI.md).

---

## Schoology — browser extension (current integration)

The API/OAuth connect path is retired. Build and installation instructions are in [`extensions/daymark-schoology/README.md`](../../extensions/daymark-schoology/README.md).

- The Manifest V3 extension separates rendered-DOM extraction, normalization, pairing/sync requests, local settings, and popup UI. `activeTab` and `scripting` inspect the active page only after the user requests a scan.
- It reads visible course and assignment IDs, titles, descriptions, URLs, due dates, points, and explicit submission states. It does not read cookies, use Schoology API credentials, or send data before the user presses Sync. Pagination is user-driven: scan each Schoology page that is visibly open.
- The extension starts a ten-minute device flow, opens Daymark in a browser tab, and polls until the signed-in user approves. The extension stores the polling secret and API token locally; Daymark stores only hashes. An authenticated, same-origin endpoint assigns ownership and creates the revocable one-year token. The extension never supplies a user ID.
- User/password and Google/Discord Daymark sign-in return through an allowlisted internal path to the authorization screen. Users explicitly approve the extension before it is linked.
- Pair and sync requests are streamed with hard 4 KiB and 10 MiB body caps, including when `Content-Length` is missing or inaccurate. Sync validates the bounded payload, uses stable external IDs and upserts, retains personal assignment overrides, creates deterministic auto-import task IDs, conservatively retains missing assignments, and records sync results.
- Additive database migration `0005_schoology_extension_device_flow.sql` is required for automatic pairing. Apply all migrations in order before deploying this flow. It has not been applied to production from this workspace.
- Extension TypeScript build and fixture tests pass. Real authenticated Schoology compatibility is **Not verified** because no institution account was available.
- Legacy connect returns 410, callback redirects to an extension-required state, and API sync returns 410. Existing database records are retained.

CSV/manual assignment import remains planned as an independent fallback.

---

## Browser push

**Status: Implemented · Not verified.**

- Generate VAPID keys (`node -e "console.log(require('web-push').generateVAPIDKeys())"`);
  set `VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (same value),
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- Users opt in through the browser permission prompt; `public/sw.js` handles
  `push` and `notificationclick`.
- Expired subscriptions are removed on 404/410.
- Unsubscribe is exposed in Settings and through the session-authenticated
  `DELETE /api/push/subscribe` route; `push_enabled` is reset when the final
  saved endpoint is removed. A test button was not added; delivery still needs
  a real VAPID test account. Divergent public VAPID values can still cause
  sends to fail.
- Requires HTTPS in production; localhost is allowed for development.

## Email

**Status: Implemented (single provider) · Not verified.**

- Reminder email exists only as a cron channel and only supports Resend
  (`EMAIL_PROVIDER=resend` + `EMAIL_API_KEY` + `EMAIL_FROM`). There is **no
  adapter abstraction** — any other provider fails closed.
- Supabase Auth (confirmations, password reset) is configured separately in
  Supabase Auth SMTP settings.
- Keep email disabled until sender/domain setup and a live delivery test
  pass. The worker records retries and delivery errors. Provider choice must
  stay free-tier — see [COSTS.md](COSTS.md).

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
- Before sending, the worker rechecks the current push/Discord/email setting;
  queued deliveries are cancelled after the user opts out or unlinks Discord.
  Configuration errors are terminal, transient errors use bounded backoff, and
  missing delivery rows are retried idempotently on later cron runs.
- There is no lease/reaper for rows left in `processing` if a worker exits
  after claiming them. Stale-processing recovery remains an engineering
  follow-up; provider delivery and deployed job/Vault state remain Not verified.

## Manual fallback

Assignments can always be entered as regular tasks. CSV import should map
title, course, description, due date, points, URL, and source ID where
present, with a preview before saving (Planned — see
[BACKLOG.md](../product/BACKLOG.md)).
