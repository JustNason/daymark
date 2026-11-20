# Implementation Plan

**Continuation audit: 2026-11-19.** Phase 0 is complete; Phase 1 database
security work is verified. Phases 2–6 are in progress, with the evidence and
open work recorded below. Existing uncommitted implementation was preserved.
This plan now records the current tree rather than the earlier sequence-only
status.

- Findings source: [../docs/product/BACKLOG.md](../docs/product/BACKLOG.md)
- Sequencing rationale: [../docs/product/ROADMAP.md](../docs/product/ROADMAP.md)
- Verification gate for every phase:
  `npm run lint && npm run typecheck && npm test && npm run build`

---

## Phase 0 — Documentation (executed and committed 2026-11-17)

**Scope rule: Markdown only.**

Delivered:

1. `docs/INDEX.md` — navigation hub and per-subject ownership map.
2. Migrated root docs into `docs/{architecture,operations,development}/`
   (git-aware renames, links repaired).
3. New: product (PRD/ROADMAP/BACKLOG), design (DESIGN_SYSTEM/UI_UX_AUDIT),
   architecture (TECH_STACK/API), development (DEVELOPMENT/TESTING),
   operations (ENVIRONMENT), decisions (ADR template + index),
   `plans/IMPLEMENTATION_PLAN.md`, `CONTRIBUTING.md`.
4. Accuracy fixes to surviving root docs (README, SECURITY) and moved docs
   where they contradicted source.
5. Live verification of integrations (Discord, Schoology, AI, cron) with
   evidence recorded in [docs/operations/INTEGRATIONS.md](../docs/operations/INTEGRATIONS.md) /
   [docs/operations/VERCEL_ENVIRONMENT_SETUP.md](../docs/operations/VERCEL_ENVIRONMENT_SETUP.md).

**Exit:** documentation was committed to `master`; no source, migration,
dependency, or deployment changes were part of Phase 0.

## Phase 1 — Safety & correctness (**In progress**)

Order of operations:

1. **Migration `0002_security_hardening.sql`:** enable RLS on `profiles`
   (preserving `profile_owner`); revoke `EXECUTE` on the exact notification
   function signature from PUBLIC, `anon`, and `authenticated`; grant it to
   `service_role`.
2. **Client defense in depth:** filter the Settings profile read by the
   authenticated user's ID.
3. Expand `supabase/tests/rls_isolation.sql` to cover profile reads/writes,
   project and child isolation, composite-FK attachment, bootstrap behavior,
   and function ACLs. Run it on a disposable Supabase project; this passed on
   DaymarkTest on 2026-11-19. Read-only production metadata was inspected
   separately; no production writes were made.

Other Phase 1 roadmap items (cron timing safety, UI-07/08/09, and indexes)
remain separate backlog work and are not part of this database security task.

**Exit:** expanded RLS test passes in a disposable database, local gate is
green, and S1/S2/ENG-3 statuses reflect only verified completion. Current
status: migration and isolation test passed on DaymarkTest; production
metadata confirms the migration's intended state; local lint, typecheck, and
unit checks pass. Commit `fc96685` is deployed to production and the Vercel
build passed; desktop login/workspace/Settings regression checks passed. A
post-migration worker delivery and mobile viewport run were not performed.
The local production build remains blocked by the environment's process-bind
restriction. Other Phase 1 items remain in progress as shown in the roadmap.

## Continuation assessment

| Area                     | Status                    | Evidence / remaining work                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schoology extension      | **Partially implemented** | DOM extraction and sync are implemented. A local device-flow sign-in/approval path now removes manual code entry; it requires additive migration 0005 and still needs build/reload plus live Daymark auth verification. No real Schoology account was available. Review /docs/operations/INTEGRATIONS.md.                                                                                   |
| Discord                  | **Partially implemented** | Redirect host fallback, enabled-on-link, payload mention safety, error mapping, and test route exist. Live OAuth/DM receipt and mutual-server behavior are not verified.                                                                                                                                                                                                                    |
| Push, email, cron        | **Partially implemented** | Subscribe/unsubscribe state, per-subscription cleanup, Resend path, retry queue, and Supabase cron SQL exist. Provider delivery and deployed cron/Vault configuration are not verified; summaries remain unimplemented.                                                                                                                                                                     |
| Phase 3 UI/UX            | **Partially implemented** | UI-01–12 and UI-15/20 have source implementations; calendar event editing/deletion, session done/skip, assignment completion, ignore, and recovery are wired. Unsupported summary controls were removed. Login-only E2E does not verify authenticated journeys.                                                                                                                             |
| Phase 4 design/structure | **Partially implemented** | Tokens, branding, responsive styles and shared components exist; the workspace remains a large client page, token adoption and consistency work remain.                                                                                                                                                                                                                                     |
| Phase 5 engineering      | **Partially implemented** | CI, strict typecheck, tests, Prettier config, indexes, `requireUser`, and RLS SQL are present. Lint, typecheck, unit, format, Webpack build, E2E smoke, and extension checks passed 2026-11-19. Brand logos now use `next/image`; lint has no warnings. Default Turbopack build hits worker-port EPERM here; CI has not run, and migrations 0004–0005 remain unverified against production. |
| Phase 6 contextual AI    | **Partially implemented** | Quick Add parses duration; task/coursework breakdown, deterministic scheduling, available-window-aware next action, and planner/Today/Calendar explanations exist. Explanations use actual schedule data; explicit per-request consent gates external sharing. Live provider verification remains.                                                                                          |
| Branding                 | **Complete in source**    | Supplied assets are installed in `public/`, metadata, login and sidebar use variants. Browser login screenshot confirmed the rendered brand.                                                                                                                                                                                                                                                |

## Phase 2 — Integrations

1. Schoology OAuth/API sync is retired in favor of the dedicated extension.
   Pairing/sync implementation and fixture tests exist; real-session
   compatibility remains unverified. CSV import remains open.
2. Discord code fixes cover redirect URI host matching, notification enablement
   on OAuth completion, curated DM errors, and `allowed_mentions`; live linking
   and delivery remain unverified.
3. Push and email paths are implemented with bounded retries and delivery
   records; provider receipt and deployed cron/Vault state remain unverified.

**Exit:** each integration row in
[docs/operations/INTEGRATIONS.md](../docs/operations/INTEGRATIONS.md) carries either a dated
live-test record or an explicit _Not verified_.

## Phase 3 — UI/UX P1

Implemented in source: UI-01–12. UI-06 includes calendar event edit/delete and
planned session done/skip. UI-10 removes unsupported daily/weekly summary
controls and wires supported notification preferences, assignment completion,
and ignore/restore. Shared primitives exist; authenticated journey
verification remains open.

**Exit:** zero P1 findings open; core-journey e2e exists.

## Phase 4 — Design system & structure

Token enforcement, contrast fix, breakpoint unification, styling-direction
ADR (owner decision), page split (ENG-7), optimistic updates, motion + copy
passes. See ROADMAP Phase 4.

## Phase 5 — Engineering hardening

CI, prettier, e2e-on-prod-build, dependency hygiene, indexes/`requireUser()`,
worker testability. See ROADMAP Phase 5.

## Phase 6 — Contextual AI

The user's continuation request authorizes embedded assistance and explicitly
excludes standalone chat. A1 quick add, A2 task breakdown, A5 coursework steps,
deterministic fallback, provider abstraction, opt-in disclosure, output
validation, and bounded per-instance request caps exist. A3 explanations are
available in the planner, Today, and Calendar; live provider/UX verification
remains. A4's Today hint is deterministic and uses due dates, priorities,
estimated durations, workday settings, calendar events, and planned sessions.
No external provider is configured or verified.

---

## Working agreements

- **One phase per review unit;** never mix documentation reorganization with
  application changes in the same commit series.
- After any change that invalidates a documented claim, update the owning
  document in the same change (ownership map: `docs/INDEX.md`).
- Migration changes always re-run the expanded RLS test.
- Integration statuses change only with dated, recorded evidence.
- No secrets in commits; `.env.local` stays ignored; never log env values.
