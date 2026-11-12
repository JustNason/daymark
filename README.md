# Daymark

Daymark is a dark-first personal productivity workspace for tasks, projects, calendar planning, coursework, and reminders. It is built for a private pilot with multi-user data isolation from the first migration.

## Current implementation state

- Supabase Auth email/password sign-in and registration callback.
- Supabase PostgreSQL migration with user scoped RLS and indexes.
- Persistent task, project, event, assignment, preference, and in-app notification views.
- Task board with drag and drop between workflow statuses; calendar month/week/day/agenda views; project creation; deterministic schedule proposals with explicit approval.
- Schoology, AI, Discord, browser push, and email settings are setup-aware; external provider delivery still requires credentials and live verification.

This is an active implementation, not a claim that every external integration has been verified. See [INTEGRATIONS.md](INTEGRATIONS.md) and [TESTING.md](TESTING.md).

## Stack

Next.js 16, React 19, strict TypeScript, Tailwind CSS, Supabase Auth/PostgreSQL, TanStack Query, React Hook Form, Zod, date-fns, dnd-kit, and Lucide. Dependencies are pinned in `package.json`.

## Prerequisites

- Node.js 22 or newer and npm.
- A free Supabase project for persistent accounts and data.
- Optional Ollama installation/model for local language-model use.

## Local development

1. Copy `.env.example` to `.env.local` and set the Supabase project URL and publishable/anon key.
2. Run the SQL in `supabase/migrations/0001_daymark.sql` in the Supabase SQL editor (or `supabase db push` after installing the Supabase CLI).
3. In Supabase Auth, configure the local site URL `http://localhost:3000` and redirect `http://localhost:3000/auth/callback`.
4. Run `npm install`, then `npm run dev`.
5. Open `http://localhost:3000` and register. Email confirmation behavior is controlled by Supabase Auth settings.

Without Supabase variables, the app displays setup instructions and does not present sample records as persisted user data.

## Project structure

```text
src/app/                 Next.js App Router UI and route handlers
src/lib/                 Supabase clients, scheduler, shared utilities
supabase/migrations/     PostgreSQL schema, constraints, indexes, RLS
tests/                   Unit and end-to-end tests
README.md                Project and local start guide
DEPLOYMENT.md            Supabase/Vercel setup
ARCHITECTURE.md          System boundaries and data flow
DATABASE.md              Tables, indexes, ownership rules
INTEGRATIONS.md          Provider configuration and limitations
SECURITY.md              Security model and operating notes
TESTING.md               Automated and manual verification
COSTS.md                 Zero-cost target and free-tier behavior
```

## Main commands

```bash
npm run dev
npm run typecheck
npm test
npm run build
npm run test:e2e
```

## License

Private project. Review third-party library licenses before redistribution.
