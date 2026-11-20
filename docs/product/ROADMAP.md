# Roadmap

**Status: continuation underway (2026-11-19).** Phase 0 and Phase 1 database security are complete; Phases 2–6 have partial implementations and remaining verification/work below. Sequencing is derived from the verified audit findings
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

_No application source, migrations, dependencies, or deployments were
modified._

## Phase 1 — Safety & correctness — **In progress**

| Item  | Finding                                                                                                                                                        | Why first                                             |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| S1    | Ensure `profiles` RLS and owner filtering (migration/test passed on DaymarkTest; production migration and metadata verified; app filter deployed in `fc96685`) | Complete for the database security scope              |
| S2    | Revoke `EXECUTE` on `claim_notification_deliveries` (migration and ACL assertions verified on DaymarkTest and production)                                      | Worker delivery after restriction was not live-tested |
| S3/S4 | Constant-time cron secret compare; add CSP                                                                                                                     | Match SECURITY.md claims                              |
| UI-07 | Keep modals open on save failure                                                                                                                               | Silent data loss on the core workflow                 |
| UI-08 | Unify datetime I/O on `src/lib/timezone.ts`                                                                                                                    | Silent date-shift bug                                 |
| UI-09 | Confirm/undo for task & project delete                                                                                                                         | One-click irreversible loss                           |

Exit criteria: expanded `rls_isolation.sql` passes covering `profiles`;
`npm run lint && typecheck && test && build` green.

## Phase 2 — Integrations (partially implemented)

1. **Schoology:** OAuth/API sync is retired. The MV3 extension has hashed-token pairing, rendered DOM extraction, idempotent sync, and passing fixture tests. Real session compatibility remains unverified; CSV import remains open.
2. **Discord:** code derives a valid redirect URI for the request host, enables DM preferences on successful linking, maps DM errors, and disables mentions. Live linking and receipt remain unverified.
3. **Push/email/cron:** subscription cleanup, Resend delivery, retry logging, and cron SQL exist. Real provider receipt and deployed cron/Vault configuration remain unverified.

Exit criteria: every integration row in INTEGRATIONS.md is either
_live-tested (date recorded)_ or explicitly _Not verified_.

## Phase 3 — UI/UX P1 fixes (partially implemented)

Ordering respects dependencies from the audit:

1. **UI-18 foundation first (partial):** extract `Modal`, `Toast`,
   `Button`/`IconButton` primitives — unlocks UI-05, UI-07, UI-12, UI-17.
2. UI-01 calendar/dashboard state isolation · UI-02 overdue bucket ·
   UI-04 deadline rows open the task · UI-03 section-in-URL.
3. UI-05 modal a11y · UI-06 event/session edit & lifecycle · UI-10 wire-or-
   remove dead settings · UI-11 search scope + shortcut · UI-12 auto-dismiss
   `aria-live` toasts.

P1 source fixes are implemented, including removal of unsupported daily/weekly
summary controls. The smoke e2e currently verifies only the login screen, not
the authenticated journey.

## Phase 4 — Design system + structure (partially implemented)

- Enforce tokens (`--space-*`, type scale, radius tokens); fix
  `--text-muted` AA contrast; unify breakpoints (UI-15/16/20/22).
- Decide styling direction ADR (hand-written CSS + component library vs.
  Tailwind/CVA) — needs owner decision.
- Split `src/app/app/page.tsx` into feature modules with a typed data layer
  (or adopt the mounted react-query); optimistic updates (UI-21).
- Motion pass: skeletons, modal/toast entrance, completion animation
  (UI-24); copy/metrics pass (UI-23).

## Phase 5 — Engineering hardening (partially implemented)

- CI workflow: lint, typecheck, unit tests, build, prettier check, expanded
  RLS SQL test on a disposable Supabase project.
- Prettier config + full formatting pass (checked 2026-11-19).
- E2E against a production build; cover the core journey (TESTING.md
  charter).
- Dependency hygiene: remove unused packages or adopt them; `engines` field;
  `.gitignore` additions (ENG-x items in BACKLOG).
- Indexes for hot paths; `requireUser()` helper; curated API error messages.

## Phase 6 — Contextual AI (partially implemented)

The continuation request confirms embedded assistance, deterministic fallbacks, and no standalone chatbot. A1/A2/A5 have workflow implementations; the scheduler stays deterministic; A4 is a data-grounded Today hint that considers free workday windows and existing commitments. A3 explanation is available in the AI Planner, Today, and Calendar's visible range; live provider verification remains open. Provider configuration is optional and not currently available. Feature detail is in [../operations/INTEGRATIONS.md](../operations/INTEGRATIONS.md) § AI:

1. **A1** natural-language quick add (highest frequency, no new screen)
2. **A2** on-demand task breakdown in the detail modal
3. **A3** plan explanations surfaced in the AI Planner, Today, and Calendar
4. **A4** "suggested next" hints (deterministic scorer first)
5. **A5** coursework steps. A6 standalone chat is explicitly out of scope.

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
