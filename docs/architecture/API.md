# API Reference

Every HTTP endpoint Daymark actually exposes. **No endpoints exist beyond
those listed here** — do not document or call others. Route source root:
[`src/app/`](../../src/app/).

**Verification:** all routes listed below were read from source on
2026-11-17; live behavior for the Discord/Schoology/AI/cron routes was
additionally probed against the production deployment (see notes).

## Conventions

- **Auth:** every route except the cron worker requires an active Supabase
  session via `supabase.auth.getUser()` (cookie), and returns
  `401 {"error":"Unauthorized"}` (or `503` when Supabase env vars are
  missing). All user data access through these routes still runs under RLS
  (the server client uses the publishable key) — except routes using the
  service role, marked below.
- **Validation:** request bodies are Zod-validated only where marked; other
  routes accept no body or do loose type checks.
- **Errors:** JSON `{"error": "…"}`. Some routes echo raw upstream/database
  error messages (noted as a known issue — *recommendation: curated messages*).
- **Rate limiting:** none anywhere (known gap).
- **CSRF:** none; mitigated by same-origin `fetch` + SameSite cookies.

## Pages (non-API routes)

| Route | File | Behavior |
| --- | --- | --- |
| `/` | `src/app/page.tsx` | server redirect → `/app` |
| `/login` | `src/app/login/page.tsx` | email/password sign-in & sign-up, Google + Discord OAuth buttons, forgot-password |
| `/app` | `src/app/app/page.tsx` | the entire workspace (client-side auth gate; no server middleware) |
| `/auth/reset` · `/auth/reset/confirm` | `src/app/auth/reset*/page.tsx` | password reset request / new-password form |
| `/auth/callback` | `src/app/auth/callback/route.ts` | PKCE code exchange; `next` allowlisted to `/auth/reset/confirm` only; exchange errors silently ignored → `/app` |

## Route handlers

### Account

| | |
| --- | --- |
| **`DELETE /api/account`** | `api/account/route.ts` |
| Auth | session; **uses service role** (`admin.deleteUser`) |
| Body | none |
| Responses | `200 {ok:true}` · `401` · `503` · `500 {error}` (raw Supabase message) |
| Notes | no password re-confirmation (known gap); deletion cascades via FKs |

### AI planning

| | |
| --- | --- |
| **`GET /api/ai/plan`** | `api/ai/plan/route.ts` |
| Auth | session |
| Responses | `200 {configured: boolean}` — **live-verified `false` on both deployments** (2026-11-17) |
| | |
| **`POST /api/ai/plan`** | |
| Auth | session |
| Body | Zod: `{ prompt?: string ≤ 2000 }` |
| Responses | `200 {slots: [{taskId,title,start,end}], explanation, provider: "deterministic" \| "openai-compatible"}` · `400` · `401` · `500` (raw DB error) · `503` |
| Notes | schedule is always deterministic; LLM output used only as `explanation` text and **not type-validated** (known defect); no data is written by this route |

### Notification cron

| | |
| --- | --- |
| **`GET /api/cron/notifications`** | `api/cron/notifications/route.ts` (`runtime = "nodejs"`) |
| Auth | `Authorization: Bearer <CRON_SECRET>` compared with plain `!==` (not constant-time — known gap); fail-closed 401 when unset |
| Responses | `200 {ok, generated, claimed, sent, failed}` · `401` · `503` (service-role client unavailable) · `500` |
| Notes | **uses service role**; generates `task_due` notifications, claims deliveries via the `claim_notification_deliveries()` RPC, dispatches push/Discord/email with quiet-hours deferral and ≤4 retries. Live probing from outside is blocked by Vercel Deployment Protection on one host; production answers `401` without the secret (2026-11-17) |

### Discord integration

| | |
| --- | --- |
| **`GET /api/integrations/discord/connect`** | starts OAuth2 (`scope=identify`, random state in httpOnly path-scoped 600s cookie bound to user id) → 302 Discord authorize |
| **`GET /api/integrations/discord/callback`** | validates state + user binding, exchanges code, fetches identity, upserts `external_integrations` + `notification_preferences.discord_user_id` → 302 `/app?discord_link=connected\|failed\|cancelled\|not_configured` |
| **`GET /api/integrations/discord`** | `{connected: boolean}` |
| **`DELETE /api/integrations/discord`** | unlinks: clears `discord_user_id`, sets `discord_enabled=false`, marks integration disconnected → `{ok:true}` |
| Live notes | OAuth client credentials configured on both deployments; **preview host's redirect URI points at the production host** → linking from preview fails state validation on return (verified 2026-11-17) |

### Schoology integration

| | |
| --- | --- |
| **`GET /api/integrations/schoology/connect`** | requires consumer credentials (else `503`); fetches an OAuth 1.0 request token, stores HMAC-signed state cookie, 302 to `app.schoology.com/oauth/authorize` · failures: `502 {error}` |
| **`GET /api/integrations/schoology/callback`** | verifies HMAC state + token match, exchanges verifier for access token, encrypts it (AES-256-GCM) into `external_integrations.encrypted_credentials` → 302 `/app?section=Settings` or `?integration_error=…` (message truncated to 120 chars) |
| **`POST /api/integrations/schoology/sync`** | session; **no Zod**; 241-line sync worker: sections → courses → assignments (idempotent by `(user_id,integration_id,external_id)`), preserves `personal_*` fields, optional auto-import to tasks; writes `integration_sync_logs` → `{ok, itemsSeen, itemsChanged}` · `400`/`409` (reauth required) / `502`. **No explicit `.eq("user_id", …)`** — relies on RLS (defense-in-depth gap) |
| **`DELETE /api/integrations/schoology`** | disconnect → `{ok}`; same missing user filter (relies on RLS) |
| Live notes | **Broken:** connect returns `502 {"error":"Schoology request token failed (405)"}` on both deployments — Schoology accepts `GET` only on its OAuth endpoints, code sends `POST` (probed 2026-11-17; see [INTEGRATIONS.md](../operations/INTEGRATIONS.md)) |

### Notification preferences & push

| | |
| --- | --- |
| **`POST /api/notifications/discord-test`** | session; requires `DISCORD_BOT_TOKEN` (`503`) + linked account (`400`); opens a DM channel and sends a test message; curated errors for 401/403 (`502`). **Best error UX in the codebase.** Live-verified: passes the token check on both deployments (2026-11-17) |
| **`POST /api/push/subscribe`** | Zod `{endpoint: url, keys: {p256dh, auth}}`; upsert by endpoint; sets `push_enabled=true` → `{ok}` |
| **`DELETE /api/push/subscribe`** | body `{endpoint: string}`; deletes subscription — **does not reset `push_enabled`** (known gap) → `{ok}` |

## Known cross-cutting issues

1. No rate limiting on any route (including auth-adjacent OAuth starts).
2. Raw upstream/DB error messages are echoed in several responses
   (`account`, `ai/plan`, `push/subscribe`, `schoology*`).
3. Auth boilerplate duplicated across 13 files; no shared `requireUser()`
   helper (*recommendation*).
4. Business logic (sync worker, notification worker) lives inside route
   handlers, so unit tests cannot reach it (see
   [TESTING.md](../development/TESTING.md)).
5. The workspace page calls most data endpoints **directly against PostgREST
   from the browser**, not through these API routes — the API surface above
   covers only privileged operations.
