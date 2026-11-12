# Security

- PostgreSQL Row Level Security is required for every user-owned table. The frontend's route state is not an authorization control.
- Use Supabase SSR cookies for server endpoints and verify the session with `auth.getUser()` before reading/updating user data.
- Keep service-role credentials out of browser code and out of committed files. Prefer user session + RLS for ordinary application operations.
- Integration tokens use application-level AES-256-GCM encryption. Store only ciphertext and never serialize credentials into logs or errors.
- Validate request bodies with Zod, bound list/date queries, and encode user content when rendered.
- OAuth callbacks must validate state and bind request tokens to secure, HTTP-only, short-lived cookies.
- Cron endpoints require constant-time comparison of a high-entropy secret and idempotent delivery keys.
- Security headers are configured in `next.config.ts`; review Content Security Policy before deploying third-party assets.
- Account deletion should remove Auth-owned records through cascading foreign keys. Storage objects, if added, need an explicit cleanup path.

Before public signup, run RLS isolation tests with two separate users, review dependencies, configure email abuse controls and rate limits, and verify backup/restore expectations for the selected free tier.
