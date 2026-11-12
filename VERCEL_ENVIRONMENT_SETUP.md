# Daymark Vercel Environment Setup

This guide covers Daymark's Vercel environment variables: where each value comes from, which feature needs it, and which Vercel environments to select.

Vercel project: `daymark` in the `UNIverse` team  
Connected repository: `JustNason/daymark`  
Production branch: `master`

## Current setup

The following core variables are already configured in Vercel for Development, Preview, and Production:

| Variable                        | Use                                         | Visibility                       |
| ------------------------------- | ------------------------------------------- | -------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project API URL                    | Public; included in browser code |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable key used by the client | Public; included in browser code |

No optional provider variables are currently configured. Do not add empty values or example placeholders. A missing optional variable keeps that feature disabled while the core app remains usable.

## Add or update variables in Vercel

1. Open the `daymark` project in the Vercel dashboard.
2. Go to **Settings → Environment Variables**.
3. Add the exact variable name and value from the sections below.
4. Select the environments that need it. Use **Production** for live features; add **Preview** and **Development** only if you will test that integration there.
5. Mark secret values as **Sensitive** or **Encrypted** when Vercel offers that option.
6. Save the variable, then create a new deployment. Existing deployments do not receive environment-variable changes; Vercel applies them to new builds and deployments. See [Vercel environment variables](https://vercel.com/docs/environment-variables).

Never add a `NEXT_PUBLIC_` prefix to a secret. Values with that prefix are exposed to browser code.

## Core Supabase connection

These are already present in all three Vercel environments. If you ever replace the Supabase project, update them together:

| Variable                        | Value source                                                      | Environments                     |
| ------------------------------- | ----------------------------------------------------------------- | -------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL, usually `https://<project-ref>.supabase.co` | Development, Preview, Production |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable key (`sb_publishable_…`)                     | Development, Preview, Production |

The publishable key is designed to be public. Database access is controlled by the app's user sessions and Supabase RLS policies. Do not use an admin/service key for this variable.

## Server-side Supabase admin access

| Variable                    | Value source                                                                     | Environments                                                             | Needed for                                             |
| --------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase **Project Settings → API Keys**; use the server-side `service_role` key | Production; add Preview/Development only when testing admin routes there | Account deletion and the scheduled notification worker |

This key bypasses RLS. Store it as a sensitive server-side variable, and never expose it to browser code, commit it, or paste it into chat. If you are not enabling account deletion or scheduled notifications yet, you can leave it unset. The admin routes that need it will not work until it is configured.

## Scheduled notifications

| Variable      | How to create it                                                 | Environments                                                            | Needed for                                     |
| ------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------- |
| `CRON_SECRET` | Generate a random value, for example with `openssl rand -hex 32` | Production; add Preview only if you intentionally schedule preview jobs | Authorizing calls to `/api/cron/notifications` |

To enable scheduled reminders:

1. Add `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` to Vercel Production as sensitive variables.
2. In Supabase, enable the `pg_cron`, `pg_net`, and Vault extensions.
3. Open [`supabase/cron/notifications.sql`](supabase/cron/notifications.sql). Replace `https://YOUR_DAYMARK_DOMAIN` with the production URL and `YOUR_CRON_SECRET` with the same value saved in Vercel. Run the SQL once in the Supabase SQL Editor.
4. Check Supabase Cron job history and Vercel function logs for a successful request.

Daymark checks the `Authorization: Bearer <CRON_SECRET>` header itself. Vercel also currently protects the project's non-custom domains with Vercel Authentication. If that protection blocks Supabase Cron before the request reaches Daymark, use a custom domain that is excluded from that protection for the Cron URL, or configure a Vercel protection bypass for the job. Keep Daymark's `CRON_SECRET` check enabled either way. See [Supabase Cron](https://supabase.com/docs/guides/cron) and [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection).

## Schoology (optional)

Only configure these after the institution or Schoology has approved the API application. Daymark uses Schoology's OAuth 1.0 API; it does not use a Schoology password.

| Variable                     | Value source                                                                                               | Environments                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `SCHOOLOGY_CONSUMER_KEY`     | Schoology API app registration                                                                             | Production; Preview/Development only for integration testing |
| `SCHOOLOGY_CONSUMER_SECRET`  | Schoology API app registration                                                                             | Same environments as the consumer key; sensitive             |
| `SCHOOLOGY_CALLBACK_URL`     | Exact callback registered with Schoology, e.g. `https://<your-domain>/api/integrations/schoology/callback` | Match the environment being tested                           |
| `INTEGRATION_ENCRYPTION_KEY` | Generate a new key with `openssl rand -base64 32`                                                          | Production; use a separate key for Preview/Development       |

`INTEGRATION_ENCRYPTION_KEY` must decode to exactly 32 bytes. Keep the same key for the lifetime of stored Schoology credentials; changing it makes existing encrypted credentials unreadable and requires reconnecting the integration. Local development can use `http://localhost:3000/api/integrations/schoology/callback`. Read [INTEGRATIONS.md](INTEGRATIONS.md) before setup; API access and institutional approval may be required.

## AI planner (optional)

| Variable      | Value source                                     | Environments                                                                          |
| ------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `AI_BASE_URL` | OpenAI-compatible chat completions endpoint      | Production/Preview only for a reachable hosted provider; Development for local Ollama |
| `AI_API_KEY`  | Provider API key, if the provider requires one   | Environments using that provider; sensitive                                           |
| `AI_MODEL`    | Exact model identifier supported by the provider | Same environments as `AI_BASE_URL`                                                    |

For local Ollama, the example is `AI_BASE_URL=http://localhost:11434/v1`, `AI_API_KEY=ollama`, and `AI_MODEL=qwen2.5:3b`. A Vercel deployment cannot reach Ollama on your personal computer through `localhost`; use a hosted OpenAI-compatible endpoint that you have configured, or leave these unset. Daymark's deterministic planner works without an AI provider. Never enable a paid provider or add its key unless you intend to use it.

## Discord notifications (optional)

| Variable                | Value source                                                                  | Environments                                                            |
| ----------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `DISCORD_BOT_TOKEN`     | Discord Developer Portal → your bot → reset/copy token                        | Production; Preview/Development only for intentional testing; sensitive |
| `DISCORD_CLIENT_ID`     | Discord Developer Portal → General Information → Application ID               | Production and any environment where account linking is used            |
| `DISCORD_CLIENT_SECRET` | Discord Developer Portal → OAuth2 → Client Secret                             | Same environments as client ID; sensitive                               |
| `DISCORD_REDIRECT_URI`  | Exact callback URL: `https://<your-domain>/api/integrations/discord/callback` | Same environment as the OAuth credentials                               |

To enable linking, add the exact `DISCORD_REDIRECT_URI` to your Discord application's OAuth2 redirect URLs. For local development use `http://localhost:3000/api/integrations/discord/callback`. Daymark requests only the `identify` scope; users can then link or unlink from Notifications settings without copying a Discord ID. `DISCORD_BOT_TOKEN` is still needed to send bot DMs. `DISCORD_APPLICATION_ID` is not currently read by the app. Do not grant Administrator permissions to the bot. Discord DM delivery can still be restricted by recipient privacy settings or the bot's access to the recipient.

## Browser push (optional)

Generate a VAPID key pair locally, for example with the installed `web-push` package:

```sh
node -e "console.log(require('web-push').generateVAPIDKeys())"
```

Keep the generated values private while copying them into Vercel:

| Variable                       | Value                                           | Environments                               |
| ------------------------------ | ----------------------------------------------- | ------------------------------------------ |
| `VAPID_PUBLIC_KEY`             | Generated public key                            | Production; Preview/Development if testing |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | The exact same public key                       | Same environments; public                  |
| `VAPID_PRIVATE_KEY`            | Generated private key                           | Same environments; sensitive               |
| `VAPID_SUBJECT`                | A contact URI, usually `mailto:you@example.com` | Same environments                          |

The browser receives the public key; the private key must remain server-side. After setting the variables and redeploying, test subscription permission and a real push delivery on HTTPS.

## Reminder email (optional)

Daymark's reminder worker currently supports Resend only:

| Variable         | Value source                               | Environments                                     |
| ---------------- | ------------------------------------------ | ------------------------------------------------ |
| `EMAIL_PROVIDER` | Set exactly to `resend`                    | Production; Preview/Development only for testing |
| `EMAIL_API_KEY`  | Resend API key                             | Same environments; sensitive                     |
| `EMAIL_FROM`     | Sender address on a verified Resend domain | Same environments                                |

Email reminders stay unavailable until all three are valid. Supabase Auth confirmation and password-reset email delivery are configured separately under Supabase Auth SMTP settings; these Vercel variables do not configure Supabase Auth email. Check [COSTS.md](COSTS.md) before selecting an email provider.

## Values that must stay out of Vercel's public variables

Keep these server-only and sensitive:

- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- `SCHOOLOGY_CONSUMER_SECRET`
- `INTEGRATION_ENCRYPTION_KEY`
- `AI_API_KEY` (when used)
- `DISCORD_BOT_TOKEN`
- `VAPID_PRIVATE_KEY`
- `EMAIL_API_KEY`

Public/client values are `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `VAPID_PUBLIC_KEY`, and `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. `EMAIL_FROM`, `AI_BASE_URL`, `AI_MODEL`, `VAPID_SUBJECT`, and `SCHOOLOGY_CALLBACK_URL` are configuration values rather than secrets.

## Local development

Use `.env.local` in the project root. It is ignored by Git. Start from `.env.example`, but replace placeholders with real values. Do not commit `.env.local`; do not copy production service keys into a public repository. Local Supabase client variables are already in the local file created during setup. Add optional variables locally only when testing the corresponding integration.

## Quick verification after changing variables

1. Create a new Vercel deployment after saving variables; old deployments keep their original environment.
2. Check the deployment reaches **Ready**.
3. Sign in and create a task, then refresh and confirm it persists.
4. Test each optional channel only after its credentials and provider configuration are complete.
5. For production auth email, test a non-team address if Supabase Auth email confirmation is enabled.

If you see `Connect Supabase`, check the two `NEXT_PUBLIC_SUPABASE_*` variables and redeploy. If the admin route or notification worker returns a configuration error, check `SUPABASE_SERVICE_ROLE_KEY`; for a 401 from the Cron route, check that `CRON_SECRET` matches the value in Supabase Vault.
