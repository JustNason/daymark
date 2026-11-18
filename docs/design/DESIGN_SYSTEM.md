# Design System

Canonical reference for Daymark's visual language. **Source of truth for all
values below: [`src/app/globals.css`](../../src/app/globals.css)** (2,437
lines). When this document and the stylesheet disagree, the stylesheet wins —
report the drift.

**Last verified:** 2026-11-17 by direct read of `globals.css` and live
inspection of the production deployment.

Sections are labeled **Existing** (verified in code today) or **Proposed**
(recommendation, not yet implemented — decisions need owner approval).

---

## Design direction

**North star: Linear + Things 3** — precision-density and keyboard-speed
navigation (Linear) combined with warm restraint and micro-motion craft
(Things 3). Daymark's existing identity is a restrained dark-first
sage/green palette; the direction builds on it rather than replacing it.

Principles (Proposed, as the standard to hold new UI against):

1. **Density with air.** Information-rich panels, generous spacing tokens —
   never raw magic numbers.
2. **One accent.** Sage green (`--accent`) is the single brand action color;
   semantic colors (success/warning/danger/info/ai) are reserved for state.
3. **Truthful states.** Never fake data; honest "not configured" /
   empty states with human copy (already a strength — preserve it).
4. **Keyboard-first.** Every pointer interaction has a keyboard path.
5. **Motion is feedback, not decoration.** 150–190 ms, ease-out, always
   disabled under `prefers-reduced-motion`.

---

## Existing tokens (verified in `globals.css:2-123`)

### Color — dark theme (`:root`) / light theme (`.light`)

| Token | Dark | Light | Role |
| --- | --- | --- | --- |
| `--bg` | `#111613` | `#f5f7f4` | page background |
| `--sidebar` | `#151c18` | `#eef2ed` | sidebar surface |
| `--surface` | `#1a231e` | `#ffffff` | cards/panels |
| `--surface-elevated` | `#222d26` | `#ffffff` | modals, popovers, toasts |
| `--surface-hover` | `#26332b` | `#eaf0ea` | hover state |
| `--surface-inset` | `#151c18` | `#f5f7f4` | inset wells |
| `--border` / `--border-strong` | `#2d3931` / `#405047` | `#dce4dc` / `#c4d0c5` | hairlines / emphasized |
| `--text-primary` | `#e5ebe5` | `#1d2921` | primary text |
| `--text-secondary` | `#aab6ac` | `#526157` | secondary text |
| `--text-muted` | `#829087` | `#66756a` | meta/muted text — **see contrast note** |
| `--accent` | `#8bae96` | `#527d5e` | brand/action |
| `--accent-strong` / `--accent-muted` | `#a2c4ac` / `#344b3b` | `#3f694b` / `#dfeae0` | hover / soft fill |
| `--accent-foreground` | `#111613` | `#ffffff` | text on accent |
| `--success` / `--warning` / `--danger` / `--info` | `#64b86b` / `#f4b860` / `#e57373` / `#60a5fa` | `#368344` / `#8c5a12` / `#b33f47` / `#3269a8` | semantic states |
| `--ai` / `--ai-muted` | `#a78bfa` / `#342d46` | `#7652ad` / `#eee8f8` | AI affordances |
| `--focus-ring` | `#a2c4ac` | `#3f694b` | keyboard focus |
| `--overlay` | `rgb(0 0 0/52%)` | `rgb(20 30 22/38%)` | modal backdrop |
| `--shadow-menu` | `0 10px 28px rgb(0 0 0/28%)` | `rgb(29 41 33/14%)` | menus/popovers |

`globals.css:62-74, 112-122` also define **compatibility aliases**
(`--surface-2`, `--line`, `--text`, `--muted`, `--green`, `--amber`, `--red`,
`--blue`, `--radius`, …). Both families are in active use — new code should
prefer the canonical names above.

### Typography (`globals.css:37-45, 135`)

| Token | Value | Status |
| --- | --- | --- |
| `--font-sans` | `Inter, …` | used (body at `var(--type-body)/1.5`) |
| `--font-mono` | `"Geist Mono", …` | **defined but never referenced** |
| `--type-page-title` | 30px | used |
| `--type-section-title` | 19px | **unused** |
| `--type-panel-title` | 16px | **unused** |
| `--type-body` | 14px | used |
| `--type-supporting` | 13px | used |
| `--type-meta` | 12px | used |
| `--type-micro` | 11px | used |

### Spacing (`globals.css:46-55`)

`--space-1` (4px) through `--space-16` (64px) — a complete scale.
**Verified: zero `var(--space-…)` usages in the stylesheet.** All spacing
today is raw px (`17px 11px 10px`, `23px`, `14px 15px 13px`, …).

### Radius (`globals.css:56-58`)

| Token | Value | Status |
| --- | --- | --- |
| `--radius-control` | 8px | used, but coexists with raw `6px`, `7px`, `9px`, `10px`, `5px`, `4px`, `3px`, pill `20px` |
| `--radius-panel` | 12px | used |
| `--radius-dialog` | 16px | used |

### Motion (`globals.css:59-60`)

| Token | Value | Status |
| --- | --- | --- |
| `--motion-fast` | 150ms ease-out | used in 4 places |
| `--motion-menu` | 190ms ease-out | used in 4 places |

The **only `@keyframes` in the entire stylesheet is `spin`** (`:293`) —
no modal/panel entrance, no list stagger, no completion animation.

## Theme implementation (Existing)

- `next-themes` with `attribute="class"`, default **dark**, `enableSystem`
  (`src/app/providers.tsx:17`); `.light` block sets `color-scheme: light`.
- Persisted to `user_preferences.theme` (DB) and mirrored between components
  via a custom `daymark-theme` window event.
- `suppressHydrationWarning` on `<html>` (`layout.tsx:18`).

## Global accessibility styles (Existing — preserve)

- `:focus-visible` outline using `--focus-ring` (`globals.css:152-159`).
- Disabled opacity (`:148-151`).
- `prefers-reduced-motion` kill-switch (`:2374-2383`), also honored by
  settings smooth-scroll.
- `aria-current` on nav items, `aria-pressed`/`aria-expanded` on toggles.

## Breakpoints (Existing — inconsistent)

| Where | Value |
| --- | --- |
| CSS `@media (min-width: 761px)` | `:2016` |
| CSS `@media (max-width: 1100px)` | `:2051` |
| CSS `@media (max-width: 760px)` — drawer/layout switch | `:2069` |
| JS `matchMedia("(max-width: 640px)")` — forces List/Agenda views | `page.tsx:190, 1590` |

**Proposed:** one shared breakpoint (recommended: 760px) used by both CSS and
`matchMedia`, ideally exposed as a token. Today 641–760px devices get a
squeezed desktop board (see [UI_UX_AUDIT.md](UI_UX_AUDIT.md) UI-15).

## Contrast audit (Existing — computed WCAG 2.1 ratios)

| Pair | Ratio | Verdict |
| --- | --- | --- |
| Dark text-primary / bg | 15.11 | pass |
| Dark text-secondary / surface | 7.67 | pass |
| Dark accent / surface | 6.59 | pass |
| Dark **text-muted / surface-elevated** | **4.27** | **fails AA (needs 4.5)** — modal helper text, toasts, popovers |
| Light text-primary / bg | 14.01 | pass |
| Light **text-muted / bg** | **4.51** | marginal pass |
| Light accent-on-white | 4.72 | pass |

Everything else audited passes. **Proposed:** darken `--text-muted` slightly
or lighten `--surface-elevated` in the dark theme; add an automated contrast
check to CI.

## Styling approach (Existing — with a decision pending)

- **Hand-written CSS is the actual system.** Despite Tailwind v4 being
  imported (`globals.css:1`) and wired via PostCSS, **zero utility classes
  appear in any JSX and no `@apply` exists**.
- Shared primitives (`button`, `icon-button`, `notice`, `state`, `empty`,
  modal shell, form fields) exist only as global CSS classes
  (`globals.css:187-281, 1961-2008`); markup is copy-pasted per usage.
- There is **no `src/components/` directory** — see UI-18 in the audit.

**Proposed (decision needed — ADR candidate):** either (a) keep hand-written
CSS as the documented standard, extract a component library, and drop the
unused styling deps, or (b) adopt Tailwind/CVA for new components. Either way
`package.json` and README claims must match the choice.

---

## Proposed additions (not implemented)

These are recommendations aligned with the north star; each needs owner
approval and most are tracked in [BACKLOG.md](../product/BACKLOG.md):

1. **Enforce the token layer:** use `--space-*` (0 usages today), the two
   unused type tokens, and collapse radii to the three token values.
2. **Skeleton loaders** for panels/tables instead of text-only loading lines
   ("Loading notifications…").
3. **Entrance/exit motion** for modals and toasts using `--motion-fast` /
   `--motion-menu`; a completion check animation on task complete.
4. **Fix `--text-muted` contrast** on elevated surfaces (one-token change).
5. **Component primitives:** `Button`, `IconButton` (required `aria-label`),
   `Modal` (focus trap, Escape, `role="dialog"`), `Field`, `Toast`
   (`role="status"`/`role="alert"`, auto-dismiss ~4s), `EmptyState` — the
   foundation for UI-05, UI-12, UI-17, UI-18.
6. **Copy/label pass:** pluralization ("1 work sessions"), jammed
   `Start`/`End` labels, raw `datetime-local` inputs in proposals, metric
   labels matching their numbers (UI-23).

## What already matches the direction (preserve)

Verified live 2026-11-17: the restrained dark-green palette and consistent
token layer; human, specific empty states ("A little breathing room");
focus-visible and reduced-motion support; honest integration status pills;
the explicit AI approval gate; themed OAuth brand marks. Any redesign should
extend these, not replace them.

## Related documents

- [UI_UX_AUDIT.md](UI_UX_AUDIT.md) — 25 verified findings against this system
- [../architecture/TECH_STACK.md](../architecture/TECH_STACK.md) — styling
  tooling versions and unused dependencies
- [../product/PRD.md](../product/PRD.md) — product principles the design
  serves
