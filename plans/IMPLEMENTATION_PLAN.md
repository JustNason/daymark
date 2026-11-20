# Implementation Plan

**Status: Phase 0 complete; Phase 1 in progress.** This plan sequences the
repair/refactor work derived from the audit. Phase 0 (documentation) was
committed to `master` on 2026-11-17. Phase 1 is underway. Production metadata
confirms profiles RLS is enabled. Migrations `0001` and `0002` plus the
expanded rollback-only isolation test passed on disposable DaymarkTest on
2026-11-19. Migration `0002` was then applied to production with explicit
approval; production metadata confirms the expected policy and ACLs.

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

## Phase 2 — Integrations

1. Schoology: method fix + signature verification + live connect/sync test
   (INT-1); then sync hardening (INT-1b); start CSV import in parallel as
   the guaranteed fallback (INT-3).
2. Discord: environment-correct redirect URI, link→enable gap, error copy,
   DM viability check, `allowed_mentions` (INT-2).
3. Push/email/cron: push_enabled reset, live delivery tests, cron host
   confirmation (INT-4/5/6).

**Exit:** each integration row in
[docs/operations/INTEGRATIONS.md](../docs/operations/INTEGRATIONS.md) carries either a dated
live-test record or an explicit *Not verified*.

## Phase 3 — UI/UX P1

1. Extract `Modal`/`Toast`/`Button`/`IconButton` primitives into
   `src/components/` (partial UI-18) — the enabling step.
2. Data/state fixes: UI-01, UI-02, UI-03, UI-04.
3. Behavior fixes: UI-05, UI-06, UI-10, UI-11, UI-12.

**Exit:** zero P1 findings open; core-journey e2e exists.

## Phase 4 — Design system & structure

Token enforcement, contrast fix, breakpoint unification, styling-direction
ADR (owner decision), page split (ENG-7), optimistic updates, motion + copy
passes. See ROADMAP Phase 4.

## Phase 5 — Engineering hardening

CI, prettier, e2e-on-prod-build, dependency hygiene, indexes/`requireUser()`,
worker testability. See ROADMAP Phase 5.

## Phase 6 — Contextual AI (decision-gated)

Do not start until PRD §7 Q1 is answered. Pre-requisites: provider choice
consistent with $0, INT-7 output validation, usage caps, data-exposure
policy.

---

## Working agreements

- **One phase per review unit;** never mix documentation reorganization with
  application changes in the same commit series.
- After any change that invalidates a documented claim, update the owning
  document in the same change (ownership map: `docs/INDEX.md`).
- Migration changes always re-run the expanded RLS test.
- Integration statuses change only with dated, recorded evidence.
- No secrets in commits; `.env.local` stays ignored; never log env values.
