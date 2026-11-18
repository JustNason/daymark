# Implementation Plan

**Status: Proposed — nothing below has been implemented.** This plan
sequences the actual repair/refactor work derived from the audit. It is
deliberately separate from the documentation effort: **Phase D (docs) was
executed alone and touched only Markdown files**; every subsequent phase
involves application code, migrations, or configuration and must be planned,
reviewed, and committed on its own.

- Findings source: [../docs/product/BACKLOG.md](../docs/product/BACKLOG.md)
- Sequencing rationale: [../docs/product/ROADMAP.md](../docs/product/ROADMAP.md)
- Verification gate for every phase:
  `npm run lint && npm run typecheck && npm test && npm run build`

---

## Phase D — Documentation (executed 2026-11-17, uncommitted)

**Scope rule: Markdown only.** Git status must show only `*.md` changes
(plus the generated `AGENTS.md` block, preserved verbatim).

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

**Exit:** link validation passes; `git status` shows Markdown-only changes;
no source/migration/dependency/deployment touched. Work left **uncommitted**
per task constraints — the owner decides when to commit.

## Phase 1 — Safety & correctness (next; code + one migration)

Order of operations:

1. **Migration `0002_…`:** `ALTER TABLE profiles ENABLE ROW LEVEL SECURITY`
   (S1); `REVOKE EXECUTE … FROM public, anon` on
   `claim_notification_deliveries` + grant to `service_role` (S2); add the
   four missing indexes (S-idx). Include a `pg_class` self-check query in the
   migration header so future tables can't silently skip RLS.
2. **Client fix:** owner-filtered profile read (`page.tsx:3030`).
3. **Cron route:** constant-time secret compare (S3).
4. **UI micro-fixes that don't need the component library:** UI-07 (keep
   modal open on failure), UI-08 (timezone helpers), UI-09 (delete
   confirm/undo).
5. Expand `supabase/tests/rls_isolation.sql` (profiles, writes, composite-FK
   cross-user attach) and run it on a disposable Supabase project.

**Exit:** expanded RLS test passes; gate green; findings S1/S2/UI-07/08/09
marked Done in BACKLOG with evidence.

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
