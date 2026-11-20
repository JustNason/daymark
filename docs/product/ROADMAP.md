# Roadmap

**Status: Proposed; Phase 0 complete, Phase 1 in progress.** Sequencing derived from the verified audit findings
(2026-11-17) and the owner's stated priorities: (1) documentation of
verified reality, (2) repair broken integrations, (3) $0/month cost ceiling,
(4) design system + UI/UX quality, (5) roadmap/backlog visibility, (6)
contextual AI — not another chatbot. Phase contents are recommendations;
ordering within a phase is adjustable by the owner. Nothing here has been
implemented unless it says otherwise.

Item IDs map to [BACKLOG.md](BACKLOG.md) (UI-xx = UI/UX audit, S-x =
security/backend, INT-x = integrations, ENG-x = engineering).

---

## Phase 0 — Documentation — **Complete (committed to master 2026-11-17)**

- `docs/` tree with INDEX, product/architecture/design/development/
  operations/decisions sections.
- Verified reality recorded for all integrations (live probes 2026-11-17).
- Design system reference + 25-finding UI/UX audit.
- Roadmap, backlog, implementation plan.
- Doc/reality contradictions fixed (SECURITY CSP/constant-time, TESTING
  status-vs-target, DEPLOYMENT service-role scope, DATABASE table list,
  README stack claims).

*No application source, migrations, dependencies, or deployments were
modified.*

## Phase 1 — Safety & correctness — **In progress**

| Item | Finding | Why first |
| --- | --- | --- |
| S1 | Ensure `profiles` RLS and owner filtering (migration/test passed on DaymarkTest; production migration and metadata verified) | Application code change is in the working tree and awaits normal release deployment |
| S2 | Revoke `EXECUTE` on `claim_notification_deliveries` (migration and ACL assertions verified on DaymarkTest and production) | Worker delivery after restriction was not live-tested |
| S3/S4 | Constant-time cron secret compare; add CSP | Match SECURITY.md claims |
| UI-07 | Keep modals open on save failure | Silent data loss on the core workflow |
| UI-08 | Unify datetime I/O on `src/lib/timezone.ts` | Silent date-shift bug |
| UI-09 | Confirm/undo for task & project delete | One-click irreversible loss |

Exit criteria: expanded `rls_isolation.sql` passes covering `profiles`;
`npm run lint && typecheck && test && build` green.

## Phase 2 — Integration repairs (owner priorities 2 & 3)

1. **Schoology (INT-1):** switch OAuth token requests to GET, validate the
   OAuth 1.0 signature against Schoology docs, then live-test connect → sync
   with a real account. Fallback deliverable regardless: **CSV assignment
   import** (INT-3).
2. **Discord (INT-2):** per-environment `DISCORD_REDIRECT_URI` (or derive
   from request host); fix link→`discord_enabled` gap; fix misleading error
   copy; verify mutual-server/DM viability; add `allowed_mentions`.
3. **Push/email (INT-4/5):** reset `push_enabled` on last-unsubscribe;
   live-test one push + one email; record dates in INTEGRATIONS.md.
4. **Cron (INT-6):** confirm the Supabase Cron job targets the public
   production host (not the Deployment-Protection-walled one).

Exit criteria: every integration row in INTEGRATIONS.md is either
*live-tested (date recorded)* or explicitly *Not verified*.

## Phase 3 — UI/UX P1 fixes (owner priority 4)

Ordering respects dependencies from the audit:

1. **UI-18 foundation first (partial):** extract `Modal`, `Toast`,
   `Button`/`IconButton` primitives — unlocks UI-05, UI-07, UI-12, UI-17.
2. UI-01 calendar/dashboard state isolation · UI-02 overdue bucket ·
   UI-04 deadline rows open the task · UI-03 section-in-URL.
3. UI-05 modal a11y · UI-06 event/session edit & lifecycle · UI-10 wire-or-
   remove dead settings · UI-11 search scope + shortcut · UI-12 auto-dismiss
   `aria-live` toasts.

Exit criteria: no P1 findings open in
[../design/UI_UX_AUDIT.md](../design/UI_UX_AUDIT.md); smoke e2e covers
today → task create → plan → settings.

## Phase 4 — Design system + structure (owner priority 4, continued)

- Enforce tokens (`--space-*`, type scale, radius tokens); fix
  `--text-muted` AA contrast; unify breakpoints (UI-15/16/20/22).
- Decide styling direction ADR (hand-written CSS + component library vs.
  Tailwind/CVA) — needs owner decision.
- Split `src/app/app/page.tsx` into feature modules with a typed data layer
  (or adopt the mounted react-query); optimistic updates (UI-21).
- Motion pass: skeletons, modal/toast entrance, completion animation
  (UI-24); copy/metrics pass (UI-23).

## Phase 5 — Engineering hardening (owner priority 5's foundation)

- CI workflow: lint, typecheck, unit tests, build, prettier check, expanded
  RLS SQL test on a disposable Supabase project.
- Prettier config + one full format pass (10 files failing today).
- E2E against a production build; cover the core journey (TESTING.md
  charter).
- Dependency hygiene: remove unused packages or adopt them; `engines` field;
  `.gitignore` additions (ENG-x items in BACKLOG).
- Indexes for hot paths; `requireUser()` helper; curated API error messages.

## Phase 6 — Contextual AI (owner priority 6 — **gated on decision**)

Blocked on PRD question 1 (AI philosophy + cost). If embedded assistance is
chosen, the candidate ladder (detail in
[../operations/INTEGRATIONS.md](../operations/INTEGRATIONS.md) § AI) is:

1. **A1** natural-language quick add (highest frequency, no new screen)
2. **A2** on-demand task breakdown in the detail modal
3. **A3** plan explanations surfaced on Today/Calendar
4. **A4** "suggested next" hints (deterministic scorer first)
5. A5 coursework steps · A6 chat surface (only if philosophy explicitly
   approves it — conflicts with "not another chatbot")

Pre-requisites: provider decision (hosted vs local — $0 constraint),
output-type validation fix (V1), usage caps, documented data-exposure
policy.

---

## Cross-phase rules

- **No doc work mixed into app-code changes** — docs update in the same
  change as the code that invalidates them, per [AGENTS.md](../../AGENTS.md).
- Every phase ends with the verification gate:
  `npm run lint && npm run typecheck && npm test && npm run build`.
- Any migration change re-runs `supabase/tests/rls_isolation.sql`.
- Integration status labels in INTEGRATIONS.md are updated only with dated
  evidence.
