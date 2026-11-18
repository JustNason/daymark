# Security

- PostgreSQL Row Level Security is required for every user-owned table. The frontend's route state is not an authorization control.
- Use Supabase SSR cookies for server endpoints and verify the session with `auth.getUser()` before reading/updating user data.
- Keep service-role credentials out of browser code and out of committed files. Prefer user session + RLS for ordinary application operations.
- Integration tokens use application-level AES-256-GCM encryption. Store only ciphertext and never serialize credentials into logs or errors.
- Validate request bodies with Zod, bound list/date queries, and encode user content when rendered.
- OAuth callbacks must validate state and bind request tokens to secure, HTTP-only, short-lived cookies.
- Cron endpoints require a high-entropy `CRON_SECRET` sent as `Authorization: Bearer …`. **Gap:** the comparison at `src/app/api/cron/notifications/route.ts:60` is a plain string `!==`, not a constant-time comparison; `src/lib/integrations/crypto.ts` already imports `timingSafeEqual` if this is tightened later.
- Security headers are configured in `next.config.ts` (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`). **No Content-Security-Policy is configured today**; add one before deploying third-party assets, and update this file if it is added.
- Account deletion should remove Auth-owned records through cascading foreign keys. Storage objects, if added, need an explicit cleanup path.

Before public signup, run [`supabase/tests/rls_isolation.sql`](supabase/tests/rls_isolation.sql) with two separate users (it exists but nothing runs it automatically), review dependencies, configure email abuse controls and rate limits, and verify backup/restore expectations for the selected free tier.
