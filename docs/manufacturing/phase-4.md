# Manufacturing — Phase 4 (UI/UX)

A redesign of the Manufacturing frontend into one consistent, quiet ERP workspace,
built only from the existing Logix Plus design system: shadcn primitives, the app's
colour, radius and branch-tint tokens, `ConfirmDialog`, `DateRangeFilter`,
`SimplePagination` and `Sheet`. No new UI library, no new theme.

## Principles applied

- **Colour means state, never decoration.** KPIs are neutral. Red, amber and green
  appear only on values that need action (overdue, short, rejected, QC waiting) and
  only while they're non-zero. The gradient header, blurred blob and six
  multi-coloured icon tiles are gone.
- **One way to do each thing.** Every list has the same header, toolbar, filter chips,
  table, skeleton, empty state and pagination. Every record drawer has the same frame.
- **Nothing hidden by width.** Navigation is grouped so it fits any screen. Tables drop
  secondary columns by breakpoint, and on phones they become stacked cards, so status
  and the key figures are always visible.
- **Touch and keyboard first.** Mobile targets are at least 36–40px. Rows are clickable
  and also keep a real link for keyboard and screen-reader users. Focus rings are
  visible.

## Frame and navigation

`components/manufacturing-shell.tsx` with the IA in `lib/navigation.ts`:

| Group | Sections |
| --- | --- |
| Overview | Dashboard |
| Planning | Products, Bills of Materials, Structures, Requirements |
| Production | Production Orders, Assembly Orders, Material Issues, Work in Progress, Quality Check |
| Inventory | Finished Goods, Scrap, Stock Movements |
| Traceability | Traceability |
| Settings | Settings (permission-gated) |

The header holds the module name and branch, a **Search** trigger and a **New** menu
(production order / assembly order / BOM, by permission). Below it are underline tabs
for the groups, then the active group's sections.

**Command search** (`components/command-search.tsx`) opens with `/` from anywhere in
the module (⌘K stays the app-wide palette) or from the header button. It finds:
- orders by number or product,
- BOMs,
- serials and batches, which open in Traceability,
- sections and create actions.

## Shared kit

| Component | Use |
| --- | --- |
| `page.tsx` | `PageHeader`, `EmptyState`, `Panel`, `StatGrid` / `Stat` (neutral KPI strip with tones), `Field` |
| `list-controls.tsx` | `FilterChips` (single choice, counts, tones, `aria-pressed`), `SearchField`, `Toolbar` |
| `data-table.tsx` | `DataTable` (columns with `hideBelow`, row click, skeleton rows, empty state, phone card layout, footer), `CellStack` |
| `detail-sheet.tsx` | `DetailSheet` record drawer (header, badges, scrolling body, footer actions), `SheetSection` |
| `confirm-provider.tsx` + `lib/confirm.ts` | `await confirm({ title, description, destructive })` on the app's `ConfirmDialog`; replaces every `window.confirm` in the module |

## Page notes

- **Overview:**
  - One six-figure KPI strip.
  - A **Needs attention** list showing only non-zero exceptions: overdue orders,
    material shortages, QC waiting, rework, paused orders.
  - Output chart, pipeline as one segmented bar plus counts, due this week,
    shortages, recent orders and catalog coverage.
- **Production / Assembly orders:** status chips with live counts from the new
  `GET /manufacturing/production-orders/status-counts`, including an **Overdue**
  chip. `?new=true` opens the create dialog, as used by the header's New menu and
  by command search.
- **Order detail:**
  - A breadcrumb replaces the back button.
  - The header is calmer: transitions use outline buttons and Release is the one
    primary action.
  - Quantities and the flow stages each sit in one hairline-divided strip.
  - On phones, tabs scroll from the start and secondary material columns collapse.
  - Cancel and delete ask through the confirm dialog.
- **Products:**
  - Type chips with counts.
  - A contextual bulk bar (set type, apply, clear) replaces the toolbar while rows
    are selected.
  - Manufacturing attributes are edited in a side drawer.
- **Material issues, Finished goods, Requirements:** a row opens a drawer with the
  full document: lines, batches, serials and value. Finished goods has a one-click
  **Trace** of the exact batch or serial. Requirements lists the orders needing
  each material.
- **WIP:** a floor board with status and overdue chips plus search.
- **Quality:** an inspection queue, where the pending count stays visible.
- **Scrap:** stage chips and a reason filter.
- **Movements:** bucket chips.
- **Settings:**
  - Sections use a side-heading layout.
  - The Phase 3 **assembly order** prefix is now editable.
  - A sticky "unsaved changes" bar offers Discard and Save, and only appears when
    something changed.

## Fixes found during the redesign

- Saving settings failed with `"assemblyOrder" is not allowed`. Since Phase 3 the
  settings API returns that prefix, and the page sends the prefixes back. Validation
  now accepts it, and a regression test covers the round trip.
- Dashboard, WIP and command-search rows now carry `orderType`, so assembly orders link
  to `/assembly-orders/…` and use assembly wording.
- Accessibility (axe, WCAG 2 A/AA, run on Overview, Orders, Products, Issues,
  Traceability and Settings) now reports no violations:
  - Progress bars have accessible names.
  - The shared `SimplePagination` icon buttons have labels (four attributes added;
    no visual change).

## Verified

- Every page was screenshotted at 1440×900 (desktop), 820×1180 (tablet) and
  390×844 (phone), in dark and light themes.
- Interaction checks covered:
  - `/` search, then Enter to open an order,
  - the product, issue and receipt drawers,
  - the cancel confirmation, where "Keep order" leaves the order untouched,
  - the settings dirty bar and Discard.
- Typecheck, ESLint and Prettier are clean, and the production build passes.
- All 23 manufacturing integration tests pass, 2 of them new.
