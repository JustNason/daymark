# Testing

Database and deployment evidence is dated where measured. The continuation
checks on 2026-11-19 are listed in the current status table.

## Commands

```bash
npm run typecheck   # tsc --noEmit (strict)
npm test            # Vitest unit tests
npm run build       # production build
npm run lint        # ESLint
npm run test:e2e    # Playwright (chromium + Pixel 7 against a dev server)
```

## Current status (verified)

| Layer                         | What exists                                                                                                                 | Notes                                                                                                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                          | 42 tests in 8 files                                                                                                         | Scheduler/timezone, auth response handling, AI provider/context/rate limits, integrations and Schoology sync normalization; no DB-backed route integration tests |
| Integration                   | **None**                                                                                                                    | No test exercises persistence, auth, or API routes                                                                                                               |
| End-to-end                    | 1 smoke test in desktop Chromium and Pixel 7 profiles asserts the `/login` page renders controls                            | No login or authenticated flow is performed                                                                                                                      |
| Database / RLS                | Existing isolation SQL covers profiles, projects, subtasks, composite ownership, profile bootstrap, and queue-function ACLs | Passed 2026-11-19 for migrations 0001/0002 on disposable DaymarkTest; new 0004 extension RLS remains unverified                                                  |
| Production browser regression | Deployed login, workspace, Settings load, owner-filtered profile request, unchanged Settings save, and console              | **Passed 2026-11-19** on production commit `fc96685` using the designated test account; mobile viewport capture unavailable in Browser MCP                       |
| CI                            | GitHub Actions workflow added                                                                                               | Includes app checks, extension checks/build, production build, Prettier and Playwright against production build; workflow result remains unobserved              |
| Coverage reporting            | **None**                                                                                                                    | No coverage config                                                                                                                                               |

Prettier configuration and ignore rules are checked in. On 2026-11-19, lint,
typecheck, 42 unit tests, extension build/fixture test, Prettier, Webpack
production build (`npx next build --webpack`), and production-build browser
smoke tests passed. The default Turbopack `npm run build` repeatedly failed in
this environment because its CSS worker could not bind a local port (`EPERM`);
the same code compiled and generated routes in Webpack mode. Lint reports four
Lint completed without warnings after branding images moved to `next/image`.
CI remains unobserved.
Migration 0004 has not been applied to a disposable database or production.

## Target coverage (charter)

The following is the coverage Daymark requires before trusting changes. It is
**mostly not implemented yet** — see [BACKLOG.md](../product/BACKLOG.md).

### Unit

- Scheduling order, working-hour bounds, conflict avoidance, split sessions,
  daylight-saving and timezone boundaries (partially covered today).
- Recurrence/date helpers — **blocked:** no recurrence logic exists in app code
  yet, despite `tasks.recurrence` and `calendar_events.recurrence_rule`
  columns.
- Zod input validation for every API route that accepts a body.

### Integration

- Account lifecycle; task/project/calendar persistence.
- **RLS isolation across two users** using
  [`supabase/tests/rls_isolation.sql`](../../supabase/tests/rls_isolation.sql):
  A/B profile reads and writes, project and subtask read isolation, a
  cross-owner child attach rejected by the existing composite FK, profile
  bootstrap, and effective PUBLIC/anon/authenticated/service_role function
  privileges. The expanded test passed on DaymarkTest on 2026-11-19.
- Assignment sync idempotency and personal-override preservation.
- Scheduling proposal accept/reject persistence.
- Notification generation, retry, deduplication, and quiet-hours deferral.

### End-to-end

- Register/login, task create/edit/complete/delete, board status move, event
  create/reschedule, project creation, assignment import, notification
  preference changes, proposal accept/reject, settings persistence, mobile
  layout, logout/relogin.
- Run Playwright against a production build (`next build && next start`)
  instead of the dev server before release sign-off.

### Database

- Apply migrations in order to a **disposable Supabase project** using its
  database-owner SQL Editor session. `supabase/tests/rls_isolation.sql` also
  requires owner privileges to insert synthetic `auth.users`, inspect
  `pg_policies`/function ACL metadata, and `SET ROLE authenticated`. Run the
  entire file as one script; its transaction rolls back users and records.
- Never run this setup test against production or a database containing real
  users. It does not call the notification claim function; it checks effective
  privileges through PostgreSQL metadata functions.
- After every migration change, run the isolation SQL and confirm the
  migration applies cleanly from empty on that disposable project.
- **2026-11-19 status:** migrations `0001_daymark.sql` and
  `0002_security_hardening.sql` were applied to the fresh, disposable
  DaymarkTest project (`nctorjcauabycyzdmxxy`), and the isolation SQL passed
  as the database-owner `postgres` role. The migration was subsequently
  applied to production Daymark (`iytnacmrgfaykxdiurzw`) with explicit
  approval. Metadata verifies profiles RLS and `profile_owner`; production
  anon/authenticated/PUBLIC cannot execute the claim function and
  `service_role` can. The two-user isolation SQL was not run against
  production. A post-migration notification delivery was not exercised. Never
  run the synthetic-user test against production.

The production deployment for commit `fc96685` reached Vercel **READY**; its
build completed successfully, including TypeScript and static page generation.
The local `npm run build` command remains blocked by the environment's
restriction on Turbopack binding a worker port; Webpack build completed. The
Playwright regression covers the unauthenticated login screen in desktop and
mobile profiles only. Browser MCP confirmed the rendered login brand and no
console errors, but authenticated dashboard settings, extension popup, and
live integrations were not tested. `npm run test:e2e:prod` selects
`next start`; CI has not yet been observed on GitHub.

### Integration-specific tests

| Integration | Mocked tests (CI-safe)                                                                                   | Live verification (requires credentials)                                                       |
| ----------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Discord     | Request signing/URL construction, DM-channel payload, retry/dedupe logic, error mapping (401/403/50007)  | Link a test account, send the in-app test DM, confirm receipt; record date/account             |
| AI          | Prompt assembly, deterministic fallback when provider errors, output not trusted to mutate data          | One real provider round-trip per configured endpoint                                           |
| Schoology   | Rendered DOM fixture extraction, IDs/dates, duplicates, plus sync normalization/idempotency helper tests | Full extraction/sync against an authenticated institution account; no live compatibility claim |
| Push/Email  | Subscription cleanup on 404/410; email payload construction                                              | One real push/email per configured provider                                                    |

## Mocked vs live — rules

- Never mark an integration **live-tested** from a mocked test.
- Preserve sanitized test logs and record date/provider/environment.
- External-service tests run only with explicitly configured accounts;
  otherwise use deterministic mocks and report live verification as **Not
  verified** in [INTEGRATIONS.md](../operations/INTEGRATIONS.md).
