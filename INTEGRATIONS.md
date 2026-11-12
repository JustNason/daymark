# Integrations

Integrations are optional. Missing credentials must leave tasks, projects, calendar, and deterministic planning available.

## Schoology

Use the official Schoology REST API and OAuth 1.0 authorization. Configure a Schoology consumer key/secret and callback URL with the institution or app registration. Schoology access depends on role and institutional permissions; cross-school applications require the applicable Schoology approval. OAuth tokens have a 90-day maximum lifetime and require reauthorization. Set `SCHOOLOGY_CONSUMER_KEY`, `SCHOOLOGY_CONSUMER_SECRET`, `SCHOOLOGY_CALLBACK_URL`, and a random `INTEGRATION_ENCRYPTION_KEY`. Never ask for a Schoology password. If API access cannot be enabled, use CSV/manual assignment entry; do not scrape the website.

The API exposes courses, a user's sections, and assignments under sections. An assignment import must retain the original title, description, due/available date, points, completion state, section ID, and external URL when available. Personal values are separate fields. Deleted remote assignments are marked unavailable/retained rather than deleting a user's task.

## AI

Ollama can run locally. For OpenAI-compatible inference set `AI_BASE_URL`, `AI_API_KEY` (a dummy value is fine for local Ollama if auth is disabled), and `AI_MODEL` on the server. Do not expose provider secrets to browser code. Without a provider, deterministic scheduling remains available.

## Discord

Create an application/bot in the Discord developer portal, grant only the required bot access, and store `DISCORD_BOT_TOKEN` server-side. Users must opt in and provide an allowed delivery destination. Direct-message delivery may require the recipient to start/allow the bot; delivery failures are logged. A bot cannot be tested without a configured Discord application and recipient.

## Browser push

Create VAPID keys and set `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, and `VAPID_PRIVATE_KEY`. Users opt in through browser permission. Remove expired subscriptions after push provider 404/410 responses. Browser push requires HTTPS in production; localhost is permitted for development.

## Email

Supabase Auth email verification/password recovery require email delivery configuration suitable for the deployment. Optional reminders use a configured free-tier transactional provider through an adapter. Free tiers and acceptable-use policies can change; keep email disabled until sender/domain setup and delivery tests pass.

## Scheduled delivery

Use the Supabase Cron setup in `supabase/cron/notifications.sql` to call the authenticated Vercel endpoint every 15 minutes. Store the app URL and `CRON_SECRET` in Supabase Vault; keep the same secret in Vercel's server environment. Each delivery row is unique per notification/channel and retried with bounded attempts. Vercel Hobby Cron is once daily, which is too imprecise for user-selected reminder windows.

## Manual fallback

Assignments can be entered as regular tasks. CSV import should map title, course, description, due date, points, URL, and source ID where present, with a preview before saving.
