# Integrations

Integrations are optional. Missing credentials must leave tasks, projects, calendar, and deterministic planning available.

## Schoology

Use the official Schoology REST API and OAuth 1.0 authorization. Configure a Schoology consumer key/secret and callback URL with the institution or app registration. Schoology access depends on role and institutional permissions; cross-school applications require the applicable Schoology approval. OAuth tokens have a 90-day maximum lifetime and require reauthorization. Set `SCHOOLOGY_CONSUMER_KEY`, `SCHOOLOGY_CONSUMER_SECRET`, `SCHOOLOGY_CALLBACK_URL`, and a random `INTEGRATION_ENCRYPTION_KEY`. Never ask for a Schoology password. If API access cannot be enabled, use CSV/manual assignment entry; do not scrape the website.

The API exposes courses, a user's sections, and assignments under sections. An assignment import must retain the original title, description, due/available date, points, completion state, section ID, and external URL when available. Personal values are separate fields. Deleted remote assignments are marked unavailable/retained rather than deleting a user's task.

## AI

Ollama can run locally. For OpenAI-compatible inference set `AI_BASE_URL`, `AI_API_KEY` (a dummy value is fine for local Ollama if auth is disabled), and `AI_MODEL` on the server. Do not expose provider secrets to browser code. Without a provider, deterministic scheduling remains available.

## Discord

Create an application/bot in the Discord developer portal and store `DISCORD_BOT_TOKEN` server-side. To let users link their Discord identity, configure `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and `DISCORD_REDIRECT_URI` for that OAuth2 application. Register the redirect URI exactly as `https://<your-domain>/api/integrations/discord/callback` (use the localhost equivalent for development). Daymark requests only the `identify` scope and does not request server permissions. Users link or unlink from Notifications settings; their Discord ID is fetched through OAuth and saved to their own notification preferences. Bot DMs still require the bot token, and Discord may block messages based on the user's privacy settings or bot relationship. A test button reports delivery errors. These credentials are optional; in-app reminders and the rest of Daymark work without them.

## Browser push

Create VAPID keys and set `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, and `VAPID_PRIVATE_KEY`. Users opt in through browser permission. Remove expired subscriptions after push provider 404/410 responses. Browser push requires HTTPS in production; localhost is permitted for development.

## Email

Supabase Auth email verification/password recovery require email delivery configuration suitable for the deployment. Optional reminders use a configured free-tier transactional provider through an adapter. Free tiers and acceptable-use policies can change; keep email disabled until sender/domain setup and delivery tests pass.

## Scheduled delivery

Use the Supabase Cron setup in `supabase/cron/notifications.sql` to call the authenticated Vercel endpoint every 15 minutes. Store the app URL and `CRON_SECRET` in Supabase Vault; keep the same secret in Vercel's server environment. Each delivery row is unique per notification/channel and retried with bounded attempts. Vercel Hobby Cron is once daily, which is too imprecise for user-selected reminder windows.

## Manual fallback

Assignments can be entered as regular tasks. CSV import should map title, course, description, due date, points, URL, and source ID where present, with a preview before saving.
