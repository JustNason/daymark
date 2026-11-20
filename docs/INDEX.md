# Daymark Documentation Index

Start here. **One source of truth per subject** — the table below says which
document owns what. If two documents appear to disagree, the owning document
wins and the other is stale: report it.

**Last full live audit:** 2026-11-17. **Continuation source audit and local verification:** 2026-11-19. Integration status and test evidence are dated in their owning documents.

**Brand package:** installed 2026-11-19 from the supplied concept archive;
asset usage and identity rules are owned by
[design/DESIGN_SYSTEM.md](design/DESIGN_SYSTEM.md#brand-identity).

## Status vocabulary

Used throughout: **Implemented** (works in code) · **Partially
implemented** · **Broken** · **Configuration required** · **Not verified**
(implemented but never proven live) · **Planned** · **Deprecated**.
Recommendations are always labeled as such and are distinct from verified
facts.

## Map

| Subject                                                    | Owner document                                                                               | Related                                                                                              |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Navigation / conventions**                               | [INDEX.md](INDEX.md) (this file)                                                             | [../README.md](../README.md), [../AGENTS.md](../AGENTS.md), [../CONTRIBUTING.md](../CONTRIBUTING.md) |
| Product requirements, principles, open questions           | [product/PRD.md](product/PRD.md)                                                             | product/ROADMAP.md                                                                                   |
| Sequencing / phases                                        | [product/ROADMAP.md](product/ROADMAP.md)                                                     | [../plans/IMPLEMENTATION_PLAN.md](../plans/IMPLEMENTATION_PLAN.md)                                   |
| Tracked work items (all findings)                          | [product/BACKLOG.md](product/BACKLOG.md)                                                     | owns the ID index (UI-xx, S-x, INT-x, ENG-x)                                                         |
| System overview, data flow, boundaries                     | [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md)                                 | architecture/API.md                                                                                  |
| Technology versions & dependency reality                   | [architecture/TECH_STACK.md](architecture/TECH_STACK.md)                                     |                                                                                                      |
| Database schema, RLS, indexes, dead schema                 | [architecture/DATABASE.md](architecture/DATABASE.md)                                         | `supabase/migrations/` (ordered SQL migrations are the source of truth)                              |
| HTTP API inventory                                         | [architecture/API.md](architecture/API.md)                                                   |                                                                                                      |
| Contextual AI providers, privacy, and validation           | [architecture/AI.md](architecture/AI.md)                                                     | [operations/INTEGRATIONS.md](operations/INTEGRATIONS.md)                                             |
| Design tokens, theme, contrast, direction                  | [design/DESIGN_SYSTEM.md](design/DESIGN_SYSTEM.md)                                           | `src/app/globals.css` (source of truth)                                                              |
| Interface defects & UX findings                            | [design/UI_UX_AUDIT.md](design/UI_UX_AUDIT.md)                                               | product/BACKLOG.md §3                                                                                |
| Local dev workflow, commands, debugging                    | [development/DEVELOPMENT.md](development/DEVELOPMENT.md)                                     | ../README.md                                                                                         |
| Test status (reality) vs target coverage                   | [development/TESTING.md](development/TESTING.md)                                             |                                                                                                      |
| Environment variables (every var, where read)              | [operations/ENVIRONMENT.md](operations/ENVIRONMENT.md)                                       | `.env.example` (template)                                                                            |
| Vercel dashboard setup & current deployment state          | [operations/VERCEL_ENVIRONMENT_SETUP.md](operations/VERCEL_ENVIRONMENT_SETUP.md)             | operations/ENVIRONMENT.md                                                                            |
| Deploy procedure & verification                            | [operations/DEPLOYMENT.md](operations/DEPLOYMENT.md)                                         |                                                                                                      |
| Integration behavior, failures, repair plans               | [operations/INTEGRATIONS.md](operations/INTEGRATIONS.md)                                     |                                                                                                      |
| Schoology extension build, permissions, pairing and limits | [../../extensions/daymark-schoology/README.md](../../extensions/daymark-schoology/README.md) | operations/INTEGRATIONS.md                                                                           |
| Cost ceiling & free-tier limits                            | [operations/COSTS.md](operations/COSTS.md)                                                   |                                                                                                      |
| Security model & operating rules                           | [../SECURITY.md](../SECURITY.md)                                                             | architecture/ARCHITECTURE.md § Security                                                              |
| Significant decisions                                      | [decisions/README.md](decisions/README.md)                                                   | decisions/ADR_TEMPLATE.md                                                                            |

## Directory layout

```text
docs/
├── INDEX.md                 this file
├── product/                 PRD, ROADMAP, BACKLOG
├── architecture/            ARCHITECTURE, TECH_STACK, DATABASE, API, AI
├── design/                  DESIGN_SYSTEM, UI_UX_AUDIT
├── development/             DEVELOPMENT, TESTING
├── operations/              ENVIRONMENT, VERCEL_ENVIRONMENT_SETUP,
│                            DEPLOYMENT, INTEGRATIONS, COSTS
└── decisions/               README (index), ADR_TEMPLATE
plans/                       IMPLEMENTATION_PLAN (repo root, sibling of docs/)
```

Root-level documents that remain: `README.md` (entry point),
`AGENTS.md` (agent rules + generated Next.js block), `CONTRIBUTING.md`,
`SECURITY.md` (operating rules, referenced from the map above).

## Reading paths

- **New contributor:** README → DEVELOPMENT → ARCHITECTURE → INDEX map.
- **Fixing a bug:** find the owning document above → BACKLOG for the item ID
  → source file cited in that document.
- **Operating a deployment:** ENVIRONMENT → VERCEL_ENVIRONMENT_SETUP →
  DEPLOYMENT → COSTS.
- **Checking what actually works:** INTEGRATIONS (dated live evidence) →
  TESTING (coverage reality) → BACKLOG (open findings).
- **Making a decision:** decisions/README → PRD §7 (open questions) → ADR.

## Maintenance rules

1. Update the owning document in the same change that invalidates it.
2. Never copy a fact into a second document — link to the owner.
3. Live/integration claims need a date and environment; upgrade or downgrade
   status labels only with evidence.
4. This index is updated whenever a document is added, renamed, or removed.
