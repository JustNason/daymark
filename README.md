# Daymark

Daymark is a dark-first personal productivity workspace for tasks, projects, calendar planning, coursework, and reminders. It is built for a private pilot with multi-user data isolation from the first migration.

## Current implementation state

- Supabase Auth email/password sign-in and registration callback.
- Supabase PostgreSQL migration with user scoped RLS and indexes.
- Persistent task, project, event, assignment, preference, and in-app notification views.
- Task board with drag and drop between workflow statuses; calendar month/week/day/agenda views; project creation; deterministic schedule proposals with explicit approval.
- Schoology, AI, Discord, browser push, and email settings are setup-aware; external provider delivery still requires credentials and live verification.

This is an active implementation, not a claim that every external integration has been verified. As of 2026-11-17: Schoology is **broken** (OAuth method mismatch), Discord linking is **broken from the preview host** (redirect host mismatch) and delivery is unverified, and no AI provider is configured. Full status: [docs/operations/INTEGRATIONS.md](docs/operations/INTEGRATIONS.md). Test coverage reality: [docs/development/TESTING.md](docs/development/TESTING.md).

## Stack

Next.js 16, React 19, strict TypeScript, Supabase Auth/PostgreSQL, Zod, date-fns, Lucide, next-themes, and hand-written CSS (design tokens in `src/app/globals.css`). Dependencies are pinned in `package.json`; the verified inventory — including installed-but-unused packages — is [docs/architecture/TECH_STACK.md](docs/architecture/TECH_STACK.md).

## Prerequisites

- Node.js 22 or newer and npm.
- A free Supabase project for persistent accounts and data.
- Optional Ollama installation/model for local language-model use.

## Local development

1. Copy `.env.example` to `.env.local` and set the Supabase project URL and publishable/anon key.
2. Run the SQL in `supabase/migrations/0001_daymark.sql` in the Supabase SQL editor (see [docs/development/DEVELOPMENT.md](docs/development/DEVELOPMENT.md) — the repo has no `supabase/config.toml`, so `supabase db push` requires `supabase init`/`link` first).
3. In Supabase Auth, configure the local site URL `http://localhost:3000` and redirect `http://localhost:3000/auth/callback`.
4. Run `npm install`, then `npm run dev`.
5. Open `http://localhost:3000` and register. Email confirmation behavior is controlled by Supabase Auth settings.

Without Supabase variables, the app displays setup instructions and does not present sample records as persisted user data.

## Project structure

```text
src/app/                 Next.js App Router UI and route handlers
src/app/app/page.tsx     The entire workspace UI (single large client page)
src/app/globals.css      Design tokens and all styling
src/lib/                 Supabase clients, scheduler, timezone, integrations, crypto
supabase/migrations/     PostgreSQL schema, constraints, indexes, RLS
supabase/cron/           Supabase Cron job SQL (notification delivery)
supabase/tests/          RLS isolation SQL test (manual)
tests/                   Unit (Vitest) and end-to-end (Playwright) tests
docs/                    All project documentation — start at docs/INDEX.md
plans/                   Implementation plans
README.md                Project and local start guide
SECURITY.md              Security model and operating notes
```

## Documentation

Start at **[docs/INDEX.md](docs/INDEX.md)** — it maps every subject to its
single source of truth:

- **Product:** [PRD](docs/product/PRD.md) · [Roadmap](docs/product/ROADMAP.md) · [Backlog](docs/product/BACKLOG.md)
- **Architecture:** [Overview](docs/architecture/ARCHITECTURE.md) · [Tech stack](docs/architecture/TECH_STACK.md) · [Database](docs/architecture/DATABASE.md) · [API](docs/architecture/API.md)
- **Design:** [Design system](docs/design/DESIGN_SYSTEM.md) · [UI/UX audit](docs/design/UI_UX_AUDIT.md)
- **Development:** [Development guide](docs/development/DEVELOPMENT.md) · [Testing](docs/development/TESTING.md)
- **Operations:** [Environment variables](docs/operations/ENVIRONMENT.md) · [Vercel setup](docs/operations/VERCEL_ENVIRONMENT_SETUP.md) · [Deployment](docs/operations/DEPLOYMENT.md) · [Integrations](docs/operations/INTEGRATIONS.md) · [Costs](docs/operations/COSTS.md)
- **Decisions:** [ADR index](docs/decisions/README.md) · **Plans:** [Implementation plan](plans/IMPLEMENTATION_PLAN.md)

## Main commands

```bash
npm run dev        # dev server (0.0.0.0:3000)
npm run lint       # ESLint
npm run format     # Prettier
npm run typecheck  # tsc --noEmit (strict)
npm test           # Vitest unit tests
npm run build      # production build
npm run test:e2e   # Playwright
```

## License

Private project. Review third-party library licenses before redistribution.
