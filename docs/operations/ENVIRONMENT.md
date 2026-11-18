# Environment Variables

Canonical reference for every environment variable Daymark reads. The template
file is [`.env.example`](../../.env.example); dashboard mechanics live in
[VERCEL_ENVIRONMENT_SETUP.md](VERCEL_ENVIRONMENT_SETUP.md); integration
behavior lives in [INTEGRATIONS.md](INTEGRATIONS.md).

**Last verified:** 2026-11-17 (code locations grep-verified against `src/`;
deployment states noted per variable).

## Rules

- Never prefix a secret with `NEXT_PUBLIC_` — that prefix ships the value to
  browser code.
- Missing optional variables must degrade gracefully (feature disabled, core
  app works). This is enforced by the current code and must be preserved.
- Do not add empty placeholders to Vercel; do not commit `.env.local`.

## Core (required)

| Variable | Read at | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `src/lib/supabase/{client,server,admin}.ts` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `src/lib/supabase/{client,server}.ts` | Publishable browser key (RLS-constrained) |

Verified configured on both live deployments.

## Server-only privileged

| Variable | Read at | Purpose | Required for |
| --- | --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | `src/lib/supabase/admin.ts` | RLS-bypassing admin client | Account deletion (`src/app/api/account/route.ts`) **and** the cron worker — both fail without it |
| `CRON_SECRET` | `src/app/api/cron/notifications/route.ts:58` | Bearer auth for the notification cron | Scheduled reminders; route 401s when unset |

Not verified on either deployment (behavior not observable externally).
`.env.example` currently groups `SUPABASE_SERVICE_ROLE_KEY` under "required"
while both deployment docs call it optional — treat it as **required only for
account deletion and cron**.

## Integration: Schoology — **Broken** (see [INTEGRATIONS.md](INTEGRATIONS.md))

| Variable | Read at |
| --- | --- |
| `SCHOOLOGY_CONSUMER_KEY` | `src/lib/integrations/schoology.ts`, `src/app/api/integrations/schoology/connect/route.ts` |
| `SCHOOLOGY_CONSUMER_SECRET` | same |
| `SCHOOLOGY_CALLBACK_URL` | `connect/route.ts` (falls back to request-derived URL) |
| `INTEGRATION_ENCRYPTION_KEY` | `src/lib/integrations/crypto.ts` (must decode to exactly 32 bytes) |

Verified configured on both live deployments (the connect route passes its
config check and fails later at Schoology's API).

## Integration: Discord

| Variable | Read at | Notes |
| --- | --- | --- |
| `DISCORD_BOT_TOKEN` | `src/app/api/cron/notifications/route.ts`, `src/app/api/notifications/discord-test/route.ts` | Bot DM delivery |
| `DISCORD_CLIENT_ID` | `.../discord/connect/route.ts`, `callback/route.ts` | OAuth `identify` linking |
| `DISCORD_CLIENT_SECRET` | `.../discord/callback/route.ts` | Token exchange |
| `DISCORD_REDIRECT_URI` | both Discord routes | Must equal the callback registered in the Discord portal **and** the host the flow starts on |
| `DISCORD_APPLICATION_ID` | **never read by code** | Documented for operators only; safe to omit |

Verified configured on both live deployments; the **preview** environment's
`DISCORD_REDIRECT_URI` points at the production host, which breaks linking
from preview (state cookie is host-only).

## Integration: AI

| Variable | Read at | Notes |
| --- | --- | --- |
| `AI_BASE_URL` | `src/app/api/ai/plan/route.ts` | OpenAI-compatible base, e.g. `http://localhost:11434/v1` for Ollama |
| `AI_API_KEY` | same | Optional for local Ollama |
| `AI_MODEL` | same | Provider model id |

Verified **not configured** on either live deployment
(`GET /api/ai/plan` → `configured: false`); the deterministic planner runs
instead.

## Integration: Web Push

| Variable | Read at | Notes |
| --- | --- | --- |
| `VAPID_PUBLIC_KEY` | cron route (server) | Not secret |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | `src/app/app/page.tsx` (browser) | Same key, public copy |
| `VAPID_PRIVATE_KEY` | cron route | Secret |
| `VAPID_SUBJECT` | cron route | e.g. `mailto:you@example.com` |

Not verified (browser permission prompt not exercised during the audit).

## Integration: Email

| Variable | Read at | Notes |
| --- | --- | --- |
| `EMAIL_PROVIDER` | cron route | Only `resend` is implemented |
| `EMAIL_API_KEY` | cron route | Secret |
| `EMAIL_FROM` | cron route | Verified-sender address |

Not verified. Supabase Auth email (confirmations, password reset) is configured
in Supabase Auth SMTP settings, **not** through these variables.

## Non-env configuration

- Supabase Cron job: [`supabase/cron/notifications.sql`](../../supabase/cron/notifications.sql)
  (must target a deployment that is not blocked by Vercel Deployment
  Protection).
- Vercel Deployment Protection currently guards non-custom domains on the
  `daymark` project (observed on `daymark-universeftc.vercel.app`).
