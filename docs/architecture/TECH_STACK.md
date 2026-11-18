# Tech Stack

Canonical reference for Daymark's actual, installed technologies. Verify
versions against [`package.json`](../../package.json) and `package-lock.json`
before relying on this table; update it when dependencies change.

**Last verified:** 2026-11-17 against `node_modules/*/package.json` (declared,
lockfile, and installed versions all match; no drift).

## Runtime framework

| Technology | Version | Role |
| --- | --- | --- |
| [Next.js](https://nextjs.org) | **16.4.6** | App Router UI + route handlers. **This is a newer Next.js than most training data covers** — read `node_modules/next/dist/docs/` before writing Next.js code (see the generated block in [AGENTS.md](../../AGENTS.md)) |
| React / React DOM | **19.3.1** | UI runtime |
| TypeScript | **5.9.3** (`strict: true`) | Type safety; `npm run typecheck` must pass |
| Tailwind CSS | **4.1.14** (v4, `@tailwindcss/postcss`) | Styling; tokens live in `src/app/globals.css` |
| Node.js | 22+ (locally 22.22.1; not enforced via `engines`) | Server runtime |

## Data & forms

| Technology | Version | Actual usage |
| --- | --- | --- |
| `@supabase/supabase-js` | 2.57.4 | Database + Auth client (browser and server) |
| `@supabase/ssr` | 0.7.0 | Cookie-based SSR sessions (`src/lib/supabase/server.ts`) |
| `zod` | 4.6.7 | Request body validation in API routes (used in 2 routes today) |
| `@tanstack/react-query` | 5.90.2 | **Provider mounted but never queried** — no `useQuery`/`useMutation` anywhere; data fetching is direct Supabase calls (decision pending: adopt or remove) |
| `react-hook-form` + `@hookform/resolvers` | 7.65.0 / 5.2.2 | **Installed but unused** (no imports) |

## UI & interaction

| Technology | Version | Actual usage |
| --- | --- | --- |
| `lucide-react` | 0.468.0 | Icon set (plus one hand-drawn `DiscordIcon` in `src/app/app/page.tsx`) |
| `next-themes` | 0.4.6 | Dark/light/system theme switching |
| `clsx` + `tailwind-merge` | 2.1.1 / 3.3.1 | Class composition in `src/lib/utils.ts` (`cn`) |
| `class-variance-authority` | 0.7.1 | **Installed but unused** (no `cva` calls) |
| `@dnd-kit/core`/`sortable`/`utilities` | 6.3.1 / 10.0.0 / 3.2.2 | **Installed but unused** — task board drag-and-drop is native HTML5 DnD in `src/app/app/page.tsx` |
| `date-fns` | 4.1.0 | Date math in the scheduler and UI |

## Integrations

| Technology | Version | Actual usage |
| --- | --- | --- |
| `web-push` | 3.6.7 | Web Push delivery in the cron worker + VAPID key generation |
| `oauth-1.0a` | 2.2.6 | **Installed but unused** — Schoology OAuth 1.0 signing is hand-rolled HMAC-SHA1 in `src/lib/integrations/schoology.ts` |
| Discord API v10 | — (raw `fetch`) | OAuth `identify` linking + bot DMs |
| Schoology REST API (OAuth 1.0) | — (raw `fetch`) | Courses/assignments sync |
| OpenAI-compatible `/chat/completions` | — (raw `fetch`) | Optional AI explanations (`AI_BASE_URL`) |
| Resend API | — (raw `fetch`) | Optional reminder email (provider hardcoded to `resend`) |

## Quality tooling

| Tool | Version | Config | Command |
| --- | --- | --- | --- |
| Vitest | 5.1.0 | `vitest.config.mts` (node env, `tests/**/*.test.ts`) | `npm test` |
| Playwright | 1.65.0 | `playwright.config.ts` (chromium + Pixel 7, dev server on :3100) | `npm run test:e2e` |
| ESLint | 9.37.0 (flat) + `eslint-config-next` 16.4.6 | `eslint.config.mjs` | `npm run lint` |
| Prettier | 3.6.2 | **No config file — defaults only**; 10 files currently fail `prettier --check` | `npm run format` |

## Dependency hygiene notes (verified)

- All dependencies are **pinned exact** (no carets).
- Six installed packages are unused: `react-hook-form`, `@hookform/resolvers`,
  `class-variance-authority`, `oauth-1.0a`, and the three `@dnd-kit/*` packages
  (dnd-kit counts as one logical dependency). Removing or adopting them is a
  backlog item, not a documentation-time change.
- No missing declared dependencies: every external import is declared.
- Lockfile is `lockfileVersion` 3 and in sync with `package.json`.
