# Deployment

## 1. Supabase project

Create a Supabase project on the Free plan. In Project Settings, copy the project URL and publishable/anon key into Vercel's environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). `SUPABASE_SERVICE_ROLE_KEY` is required only by the scheduled notification worker; keep it server-only and never add a `NEXT_PUBLIC_` prefix.

## 2. Database

Run `supabase/migrations/0001_daymark.sql` in the SQL editor or use the Supabase CLI to push migrations. Confirm every public user table has RLS enabled and the `owner_all`/`profile_owner` policies exist before adding real data.

## 3. Authentication

In Supabase Authentication, set production site URL and exact redirect URLs for `/auth/callback`. Enable email/password and configure confirmation/password reset email delivery. Google and Discord login are optional: register OAuth credentials at the provider and enter callback URLs shown by Supabase Auth.

## 4. Integrations

See `INTEGRATIONS.md`. Configure Schoology app credentials and callback only after institutional access is confirmed. Generate an encryption key with `openssl rand -base64 32`. Set provider secrets only as server environment variables. Do not commit `.env.local`.

## 5. Vercel

Import the Git repository into Vercel, select Next.js, and add required Supabase variables for Preview and Production. Add optional provider variables only when configured. Deploy Preview first, run authentication/RLS checks, then promote to Production. Set the production domain in Vercel and add it to Supabase Auth allowed redirects.

## 6. Scheduled jobs

Use Supabase Cron for reminders at 15-minute intervals. Enable `pg_cron`, `pg_net`, and Vault in Supabase, set the same high-entropy `CRON_SECRET` in Vercel and `supabase/cron/notifications.sql`, replace the domain/secret placeholders, then run that SQL once. Verify job history and duplicate invocations. Vercel Hobby Cron runs once per day, so it cannot meet the selected reminder intervals; this app uses Supabase Cron instead.

## 7. Production verification

Run `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:e2e`. With two test accounts, verify user A cannot read/update/delete user B's records. Test OAuth callbacks, email confirmation, mobile layout, and each configured notification channel. Live integration credentials are not supplied with this repository, so no external integration is represented as verified by default.

## Environment variables

Required for the app: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Required only for notification cron: `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`.

For Vercel Dashboard setup instructions, secret handling, and optional provider variables, see [VERCEL_ENVIRONMENT_SETUP.md](VERCEL_ENVIRONMENT_SETUP.md).

Optional server-only: `SCHOOLOGY_CONSUMER_KEY`, `SCHOOLOGY_CONSUMER_SECRET`, `SCHOOLOGY_CALLBACK_URL`, `INTEGRATION_ENCRYPTION_KEY`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, `DISCORD_APPLICATION_ID`, `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`. The VAPID public key is also exposed as `NEXT_PUBLIC_VAPID_PUBLIC_KEY` to allow browser subscription; it is not a secret. For Discord account linking, register the exact `/api/integrations/discord/callback` URL in the Discord OAuth2 application settings.
