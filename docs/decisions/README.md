# Architecture Decision Records

This directory records significant architectural and product decisions for
Daymark as Architecture Decision Records (ADRs).

## How to use this directory

- One decision per file, named `ADR-NNNN-short-kebab-title.md` with a
  zero-padded sequence number starting at `0001`.
- Copy [ADR_TEMPLATE.md](ADR_TEMPLATE.md).
- ADRs record **decisions that were actually made**, with date, context, and
  evidence. Never backfill or invent historical decisions — if a decision was
  made before this process existed and cannot be evidenced, it belongs in the
  relevant `docs/` document as an observed fact instead.
- The project owner approves decisions that affect product scope, AI
  interaction philosophy, integrations, or infrastructure cost (see
  [AGENTS.md](../../AGENTS.md)).

## Index

| ADR | Title | Status |
| --- | ----- | ------ |
| — | No decisions recorded yet. | — |

## Decision backlog (candidates, not yet decided)

These are open questions that will likely need an ADR once the project owner
decides (tracked in [docs/product/BACKLOG.md](../product/BACKLOG.md) and the
open questions in [docs/product/PRD.md](../product/PRD.md) — § Unresolved
requirements):

- AI interaction philosophy: embedded contextual assistance vs. standalone
  assistant surface.
- Discord notification channel design (DM-only vs. per-channel delivery).
- Schoology acquisition approach (repair official API sync vs. structured
  manual import vs. browser extension).
- Component architecture: extracting the monolithic workspace page into a
  component library.
- Test strategy: CI provider and live vs. mocked external-service testing.
