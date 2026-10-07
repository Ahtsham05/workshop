# Manufacturing — Phase 5 (Dashboard)

The Manufacturing **Overview** is now a production-performance dashboard: one time
filter, eight clickable summary cards, eight charts and a **Production alerts** list.
Every figure comes from the records the module already writes (orders, outputs,
receipts, scrap, the requirements calculation). There is no separate metrics store.

## Time filter

The filter is a single row of chips above everything: **Last 7 days**, **Last 30 days**
(default), **Last 90 days** and **Month to date**.
- The choice is kept in the URL (`/manufacturing?range=7d`), so a view can be shared.
- Every card, chart and alert answers to the same period.
- Comparisons use the period of equal length immediately before.
- Days are business calendar days in `BUSINESS_TIMEZONE` (Asia/Karachi by default),
  the same as the rest of Logix Plus, so "today" means today in the shop's timezone.
- 90-day views bucket by week; the others bucket by day.
- Switching period keeps the current charts on screen, dimmed, until the new numbers
  arrive. There is no skeleton flash.

## Summary cards (each opens the page behind it)

| Card | Value | Detail line | Opens |
| --- | --- | --- | --- |
| Production orders | Orders worked in the period: created by its end, and either still open or closed within it (excluding cancelled) | in production · completed | Production orders (all) |
| In production | Orders running now (in production or QC pending) | paused · released | Production orders, In Production |
| Completed today | Orders completed today | units received today | Production orders, Completed |
| Units produced | Units received into stock in the period | ↑/↓ % vs previous period | Finished goods |
| WIP value | Material on the floor, at issue cost | orders holding WIP | Work in progress |
| Material shortages | Materials short for open orders | "Requires attention" | Requirements |
| QC issues | Units rejected at inspection in the period | reject rate · awaiting QC | Quality check |
| Scrap rate | Scrap cost ÷ (good output cost + scrap cost) | ↑/↓ points vs previous period | Scrap |

The scrap rate is **value-based**, so mixed units (kg of wire, pieces of fans) compare
fairly. A rising scrap rate shows in red; rising output shows in green.

## Charts

Every chart has a **Chart / Table** switch, so no value can only be read by hovering.

| Chart | What it shows | Form |
| --- | --- | --- |
| Production vs target | Units received vs units planned to finish, per day or week, plus overall attainment | Columns: actual (blue) against target (gray) |
| Production trend | Running total of units this period vs the previous period | Two lines; the previous period in gray |
| Material consumption | Material built into reported output, by value. Top 8, then "+N more" | Ranked bars |
| Scrap trend | Running scrap rate, which ends at the Scrap rate card | Line with a light wash |
| Production by product | Units received per product, top 8 | Ranked bars, labelled with units |
| Production by work center | Units received per work center (the order's WIP location); scrap rate in tooltip and table | Ranked bars |
| Production cost | Material cost of good output and of scrap per period, plus cost per unit | Stacked columns |
| Order status | Where every order sits now | Bars in lifecycle order |

Design rules (from the data-viz method this phase follows):
- **Colour:** production is blue and scrap is orange in every chart and in both themes.
  Targets and previous periods are gray. The two-colour palette was run through the
  validator against the app's real card surfaces (`#ffffff` light, `#020919` dark) and
  passes lightness, chroma, colour-blind separation and contrast. The tokens live in
  `components/charts/viz.css`.
- **Marks:** one y-axis per chart. Thin marks (bars ≤ 24px with rounded ends, 2px
  lines). Hairline solid grid. A 2px gap between stacked segments.
- **Text and tooltips:** text never wears a series colour. Tooltips put the value
  first. A legend appears whenever a chart has two series.
- **Motion:** no entry animations.

Running totals were chosen deliberately. Daily output is lumpy, and a single day's
scrap rate jumps to 100% when scrap lands on a day with no good output. The running
views are steady, and their endpoints match the cards.

## Production alerts

Generated on the server and sorted most-severe first. Each alert links to the order,
or to the page that resolves it.

| Alert | When | Example |
| --- | --- | --- |
| Material shortage (critical) | An open order needs more than is on hand | *Blade Set (3 pcs) short by 77 set for MO-00009 +2 more* |
| Delayed production (warning; critical from 3 days) | An open order is past its planned completion | *MO-00131 is 2 days behind schedule (Exhaust Fan)* |
| High scrap (warning) | A work center's scrap rate is ≥ 2% and up ≥ 10% on the previous period, or ≥ 2% with no history | *Assembly Line 2 scrap rate increased by 355% (9.1% vs 2%)* |
| Waiting for inspection (warning) | Output has waited over a day for QC | *PO-2 (4 pcs, MO-00131) has waited 3 days for QC* |
| Production completed (success) | An order completed in the last 7 days | *MO-00120 completed successfully: 10 pcs Ceiling Fan* |

The panel shows five alerts and expands to all of them. Severity is always an icon
plus a word (for screen readers), never colour alone.

## Phone, tablet and desktop

- **Phone:** two cards per row with hint lines that wrap. Alerts come straight after the
  cards, then the charts in one column. Bar labels are shortened, with the full name
  in the tooltip and table. The period chips scroll sideways.
- **Tablet:** four cards per row, alerts full width, charts two per row.
- **Desktop:** the alerts sit beside the headline Production vs target chart, which
  stretches to match their height.

## API

`GET /manufacturing/dashboard/analytics?range=7d|30d|90d|mtd` (`viewManufacturing`)
→ `{ range, granularity, period, kpis, series[], materialConsumption,
productionByProduct, productionByWorkCenter, orderStatus, alerts[], alertCounts }`.
It is scoped to the organization, and to the branch when one is selected. Covered by
integration tests that fix the clock, place records on known dates, and assert every
KPI, bucket, breakdown and alert message, plus isolation from another organization.

## Also fixed

- **Demo data dates:** the demo seeder now moves each record's own date (receipt,
  output report and inspection, and scrap dates) to its scenario day, not just
  `createdAt`. Before this, the demo factory's whole history appeared to happen on the
  day it was loaded.
- **Contrast:** light-mode "High" priority text was darkened to meet 4.5:1 contrast.
- **Stat tiles:**
  - They show the change against a named period (↑/↓ plus text, coloured by whether
    that direction is good).
  - Large values use proportional figures.

## Verified

- The dashboard was screenshotted at 1440 (desktop), 820 (tablet) and 390 (phone), in
  dark and light themes, on a freshly loaded demo factory.
- Interaction checks covered changing the period (URL and figures update), a card
  click, an alert click, the table view and the hover tooltip.
- axe (WCAG 2 A/AA) reports no violations on the dashboard in either theme.
- Typecheck, ESLint and Prettier are clean, and the production build passes.
- All 25 manufacturing tests pass, 2 of them new for analytics.
