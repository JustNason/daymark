# Development Guide

Local development workflow for Daymark. For a quick start see
[README.md](../../README.md); this document is the detailed reference.

## Prerequisites

- Node.js 22+ and npm (not enforced via `engines` yet — see
  [TECH_STACK.md](../architecture/TECH_STACK.md)).
- A free [Supabase](https://supabase.com) project (the app renders setup
  instructions instead of sample data when Supabase variables are missing).
- Optional: Ollama for local AI inference (the deterministic planner works
  without any AI provider).

## One-time setup

1. `npm install` (all dependencies are pinned exact).
2. Copy `.env.example` to `.env.local` (Git-ignored) and set at minimum
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   Full variable reference: [ENVIRONMENT.md](../operations/ENVIRONMENT.md).
3. Apply every SQL migration in [`supabase/migrations/`](../../supabase/migrations/)
   in numeric order in the Supabase SQL editor. Schoology extension pairing
   requires `0004_schoology_extension_pairing.sql`; without it, code creation
   and token exchange cannot work. There is no `supabase/config.toml` in this
   repo, so `supabase db push` requires `supabase init`/`link` first — the SQL
   editor path is the supported one today.
4. In Supabase Auth, allow `http://localhost:3000` and the
   `/auth/callback` redirect.
5. `npm run dev` → http://localhost:3000 (the dev server binds
   `0.0.0.0`, so it is reachable from your LAN).

## Commands

| Command                           | Purpose                                     |
| --------------------------------- | ------------------------------------------- |
| `npm run dev`                     | Dev server on `0.0.0.0:3000`                |
| `npm run build`                   | Production build                            |
| `npm start`                       | Serve the production build                  |
| `npm run typecheck`               | `tsc --noEmit` (strict)                     |
| `npm run lint`                    | ESLint flat config                          |
| `npm run format`                  | Prettier write (defaults; no config file)   |
| `npm test` / `npm run test:watch` | Vitest unit tests                           |
| `npm run test:e2e`                | Playwright (spawns dev server on port 3100) |

## Quality checks before pushing

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Known current gaps (see [TESTING.md](TESTING.md)): end-to-end coverage still
checks only the login screen; no authenticated workspace journey or CI result
has been observed. Do not treat a green `npm test` as broad coverage.

### Schoology extension

The extension has its own dependencies and build, separate from Next.js:

```bash
npm --prefix extensions/daymark-schoology install
npm --prefix extensions/daymark-schoology run check
```

For installation, permissions, unpacked loading, pairing, and fixture-test
limitations, follow
[`extensions/daymark-schoology/README.md`](../../extensions/daymark-schoology/README.md).

## Project layout (code)

```text
src/app/                 Next.js App Router pages and API route handlers
src/app/app/page.tsx     Workspace shell and data coordination
src/app/globals.css      Design tokens and application styles
src/components/          Shared workflow views and UI primitives
src/lib/supabase/        client (browser), server (SSR cookies), admin (service role)
src/lib/                 scheduler, timezone helpers, integration clients, AI helpers
extensions/daymark-schoology/ Standalone Manifest V3 TypeScript extension
supabase/migrations/     SQL schema + RLS (source of truth for the database)
supabase/cron/           Supabase Cron job SQL for notification delivery
supabase/tests/          RLS isolation SQL test (manual)
tests/                   Vitest unit tests + Playwright e2e
```

## Debugging

- **Data missing after save:** RLS is the authorization boundary — check the
  browser session and the `owner_all` policy, not client-side filters.
- **`Supabase is not configured` / 503s:** missing env vars in `.env.local`;
  restart the dev server after changes.
- **API route errors:** routes log to the server console in dev; Vercel
  function logs in production.
- **Notification delivery failures:** inspect `notification_deliveries`
  (`status`, `last_error`) in Supabase — every failure records a message
  (capped at 500 chars).
- **Type errors referencing `.next/types`:** run `npm run build` once; the
  tsconfig includes generated types.
- **OAuth callback failures:** state cookies are path-scoped and live 10
  minutes; mismatched redirect hosts break the flow (see
  [INTEGRATIONS.md](../operations/INTEGRATIONS.md)).

## Git conventions

- Branch: `master` (single branch today).
- Do not commit `.env.local`, `node_modules/`, `.next/`, `test-results/`,
  `*.tsbuildinfo` (all Git-ignored).
- Commit docs and the generated `AGENTS.md` block together with the code that
  changes their claims — the `<!-- BEGIN:nextjs-agent-rules -->` block is
  re-added by `next dev` and must be preserved verbatim.
- After meaningful architectural changes, update the affected documents in
  `docs/` (see [INDEX.md](../INDEX.md) for which document owns which subject).
