# Architecture

## Runtime

Daymark is a Next.js App Router application. Browser UI uses Supabase Auth sessions and the Supabase publishable key; PostgreSQL RLS is the data authorization boundary. Server-only integration routes authenticate with the SSR cookie session and validate the user before acting. Provider secrets must never use `NEXT_PUBLIC_` variables.

## Data flow

1. Browser login establishes the Supabase session.
2. Data queries are scoped by `auth.uid()` in PostgreSQL RLS, including when the browser calls Supabase directly.
3. Calendar and task data are fetched in bounded views; the schema has user/date indexes.
4. Deterministic scheduling reads the user's tasks, events, and working hours and returns a proposal. Only an explicit approval inserts work sessions.
5. Integration sync writes an immutable source snapshot alongside personal overrides; source refreshes never replace personal fields.
6. Scheduled notification delivery uses an authenticated scheduled endpoint and idempotency keys; provider failure is logged without blocking the core app.

## Deployment model

The app is compatible with Vercel serverless execution. It does not depend on a resident process or local persistent disk. Supabase owns persistent data, Auth, and optionally scheduled/database work. Ollama is local development inference; a deployed instance can only reach a hosted or self-hosted endpoint reachable from its server runtime.

## Security boundaries

Browser keys are publishable and constrained by RLS. OAuth consumer credentials, tokens, AI keys, bot tokens, VAPID private keys, email API keys, and cron secrets are server-only. Integration token blobs are encrypted at application level with AES-256-GCM before storage. See `SECURITY.md`.

## Current limits

Schoology and delivery integrations require user/operator configuration and live service accounts. A visual setup state is not evidence of successful provider delivery. Every production launch should use `TESTING.md` and record the provider test date and account context.
