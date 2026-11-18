# Contributing

How to work in this repository without breaking its guarantees. Agent-facing
rules live in [AGENTS.md](AGENTS.md); this file is the human contributor
guide.

## Ground rules

1. **Branch:** `master` (single branch today). Commit locally only when the
   owner asks — this project's workflow so far has been owner-reviewed.
2. **One concern per change.** Documentation reorganization, application
   features, migrations, and dependency changes never share a change set
   (see [plans/IMPLEMENTATION_PLAN.md](plans/IMPLEMENTATION_PLAN.md)).
3. **Preserve [AGENTS.md](AGENTS.md)'s generated block** byte-for-byte —
   `next dev` re-creates it, and removing it just dirties the tree.
4. **Never commit secrets.** `.env.local` is ignored; only `.env.example`
   (names, no values) is tracked. Never print env values in logs, docs, or
   issue text.

## Making a change

1. Read the owning document in [docs/INDEX.md](docs/INDEX.md) for the
   subject you're touching.
2. Implement the change (source / migration / docs as appropriate).
3. **Update the affected documentation in the same change** — a claim that
   no longer matches source is a bug. Keep one source of truth per subject;
   link rather than copy.
4. Run the verification gate:

   ```bash
   npm run lint && npm run typecheck && npm test && npm run build
   ```

   Add `npm run format` before pushing (note: 10 files currently fail
   `prettier --check` — see [docs/development/TESTING.md](docs/development/TESTING.md)).

5. Schema changes: apply the migration to a disposable Supabase project and
   run [`supabase/tests/rls_isolation.sql`](supabase/tests/rls_isolation.sql);
   new user-owned tables must join the migration's RLS ownership list.

## Testing expectations

- Unit tests for logic (scheduler, timezone, parsing, retry/dedupe policy).
- Integration/RLS coverage is a **target**, not yet achieved — see the
  "Current status" section of [docs/development/TESTING.md](docs/development/TESTING.md)
  before assuming coverage exists.
- Never mark an integration "live-tested" from a mocked test. Live claims
  need date, account/environment, and a recorded result in
  [docs/operations/INTEGRATIONS.md](docs/operations/INTEGRATIONS.md).

## Style

- TypeScript `strict`; no `any` escapes without a comment justifying them.
- Styling is hand-written CSS against the tokens in `src/app/globals.css`
  (see [docs/design/DESIGN_SYSTEM.md](docs/design/DESIGN_SYSTEM.md)); prefer
  existing tokens (`--space-*`, `--radius-*`, `--motion-*`) over raw values.
- Icons: `lucide-react`, except the hand-drawn Discord mark (now duplicated
  in login + workspace — a known extract-to-component candidate).
- Commit messages: imperative subject, imperative scope; keep them unique and
  typo-free (history has two identical "Updated discord" subjects — don't
  repeat the pattern).

## Decisions

Significant architectural or product decisions get an ADR in
[docs/decisions/](docs/decisions/README.md) using
[ADR_TEMPLATE.md](docs/decisions/ADR_TEMPLATE.md). Owner approval is required
for scope, AI philosophy, integrations, and anything that could affect the
$0/month cost ceiling.
