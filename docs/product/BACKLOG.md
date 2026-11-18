# Backlog

Consolidated, prioritized work items from the 2026-11-17 audit. **Detail
lives in the owning document** (one source of truth per subject) — this file
is the cross-cutting index and status tracker.

**Status values:** Open · In progress · Done · Deferred · Needs decision.
All items are **Open** as of 2026-11-17 unless noted. Nothing in this
backlog has been implemented; it records recommended work only.

Priority: **P1** major defect · **P2** notable · **P3** polish · **Sec-High/
Med** security severity.

---

## 1. Security & data integrity (Sec)

Full detail: [../architecture/ARCHITECTURE.md](../architecture/ARCHITECTURE.md)
§ Verified security gaps · [../architecture/DATABASE.md](../architecture/DATABASE.md)
§ RLS · [../../SECURITY.md](../../SECURITY.md).

| ID | Item | Sev | Notes |
| --- | --- | --- | --- |
| S1 | Enable RLS on `profiles` — migration:197 loop omits it; `profile_owner` policy inert; client read lacks owner filter (`page.tsx:3030`) | **High** | Requires new migration (out of scope for doc task) |
| S2 | Revoke `EXECUTE` on `claim_notification_deliveries` from `public`/`anon`; add reaper returning stale `processing` rows to `retry` | **High** | `SECURITY DEFINER`, no revocation in migration:204-205 |
| S3 | Constant-time cron secret comparison (`timingSafeEqual` on hashes) | Med | `api/cron/notifications/route.ts:60` |
| S4 | Add Content-Security-Policy to `next.config.ts` | Med | None exists today |
| S5 | Server-side session gate (`middleware.ts`) for `/app` | Med | Defense-in-depth; RLS remains the boundary |
| S6 | Password re-confirmation for account deletion | Med | `api/account/route.ts` |
| S7 | Curated error messages instead of raw upstream/DB echoes | Med | account, ai/plan, push, schoology routes |
| S8 | Derive per-purpose keys instead of reusing `INTEGRATION_ENCRYPTION_KEY` for AES + HMAC | Low | `crypto.ts` |
| S10 | Rate limiting on auth-adjacent/OAuth-start routes | Low | None anywhere |
| S-idx | Missing indexes: `push_subscriptions(user_id)`, `tasks(user_id, assignment_id)`, `subtasks(task_id)`, `task_comments(task_id)` | Low | DATABASE.md § Indexes |

## 2. Integration repairs (INT)

Full detail: [../operations/INTEGRATIONS.md](../operations/INTEGRATIONS.md).

| ID | Item | Status | Notes |
| --- | --- | --- | --- |
| INT-1 | **Schoology OAuth method fix** (POST → GET on `request_token`/`access_token`) + signature validation + live sync test | Open | Verified root cause: 405 on both deployments |
| INT-1b | Schoology sync hardening: explicit `user_id` filters, pagination `total` fallback, honest `itemsChanged`, concurrency guard | Open | Post-repair |
| INT-2 | **Discord redirect URI per environment**; link→`discord_enabled` gap; fix "enter your Discord user ID" copy; mutual-server/DM viability check; `allowed_mentions` | Open | Verified: preview host points at production host |
| INT-3 | CSV/manual assignment import (title, course, description, due, points, URL, source ID + preview) | Open | Guaranteed path independent of Schoology API |
| INT-4 | Browser push: reset `push_enabled` on last unsubscribe; isolate per-subscription failures; live test | Open | |
| INT-5 | Email: live delivery test; decide adapter abstraction vs. Resend-only | Open | |
| INT-6 | Confirm Supabase Cron job targets the public host (not Deployment-Protection-walled) | Open | Verified risk: `daymark-universeftc` returns Vercel SSO 302 |
| INT-7 | AI output `typeof content === "string"` validation | Open | `api/ai/plan/route.ts:150` — crash risk |
| INT-8 | AI philosophy + provider decision (hosted vs local vs none) | **Needs decision** | Gates Phase 6; PRD §7 Q1 |

## 3. UI/UX (UI)

Full detail with file:line evidence: [../design/UI_UX_AUDIT.md](../design/UI_UX_AUDIT.md)
(UI-01 … UI-25). Summary:

| Priority | IDs | Theme |
| --- | --- | --- |
| **P1** | UI-01 … UI-12 | Calendar/dashboard state corruption; overdue invisibility; URL-less nav; dead-end deadline rows; modal a11y; create-only calendar; silent save failures; timezone inconsistency; no delete confirm; dead settings; one-section search; stuck/unannounced toasts |
| **P2** | UI-13 … UI-22 | Mouse-only board DnD; notification reload race; 640/760 breakpoint mismatch; hidden mobile bell; native `alert/confirm`; **no component library (UI-18 — root cause, unlocks 05/07/12/17)**; a11y labels; `--text-muted` AA fail; no optimistic updates; dead framework weight |
| **P3** | UI-23 … UI-25 | Copy/metric mismatches (incl. live "1 work sessions" grammar); no motion craft; navigation dead-ends |

## 4. Engineering & docs (ENG)

Full detail: [../development/TESTING.md](../development/TESTING.md),
[../development/DEVELOPMENT.md](../development/DEVELOPMENT.md),
[../architecture/TECH_STACK.md](../architecture/TECH_STACK.md).

| ID | Item | Notes |
| --- | --- | --- |
| ENG-1 | CI workflow (lint, typecheck, test, build, prettier check) | No `.github/` today |
| ENG-2 | Prettier config + full format pass | 10 files fail `prettier --check` |
| ENG-3 | Wire `supabase/tests/rls_isolation.sql` into a documented/automated run; expand to `profiles`, writes, composite-FK attaches | Exists, never run |
| ENG-4 | E2e against production build + core-journey coverage | Today: 1 login-page smoke test |
| ENG-5 | Dependency hygiene: remove (or adopt) `react-hook-form`, `@hookform/resolvers`, `@dnd-kit/*`, `cva`, `oauth-1.0a`; decide react-query; add `engines` | TECH_STACK § hygiene |
| ENG-6 | `.gitignore`: add `.vercel/`, `.DS_Store`, `*.log`; untrack `next-env.d.ts` per Next 16 docs; repair dangling `skills/` symlinks | |
| ENG-7 | Split `src/app/app/page.tsx` (3,338 lines) into feature modules; typed data layer (generated Supabase types) | Root maintainability risk |
| ENG-8 | Extract shared Discord client + `requireUser()` helper; move sync/cron workers out of route handlers for testability | |
| ENG-9 | Dead schema decision: wire up or drop `tags`, `task_tags`, `ai_conversations`, `ai_messages`, unused preference columns | DATABASE.md § Dead schema |
| ENG-10 | Notification worker fixes: quiet-hours burning retry attempts, `in_app_enabled` gating, summary generation (or remove toggles), TTL/cleanup | ARCHITECTURE § Notification gaps |
| ENG-11 | tsconfig tightening (`noUncheckedIndexedAccess` first) | Progressive |

## 5. Scheduling

Phased delivery: [../product/ROADMAP.md](ROADMAP.md).
Phase 1 (safety) → Phase 2 (integrations) → Phase 3 (UI P1) → Phase 4
(design system) → Phase 5 (engineering) → Phase 6 (AI, decision-gated).

## 6. Needs-decision items (for Nason)

Tracked in [PRD.md §7](PRD.md): AI philosophy/provider · Discord DM
viability model · Schoology acquisition approach · design-refresh scope ·
success-criteria confirmation.
