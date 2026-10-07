# Manufacturing — Phase 6 (Production Orders workspace)

The Production Orders page, and Assembly Orders, which shares it, is now a full
workspace:
- summary cards,
- a filter toolbar modelled on the **invoice list** (`features/invoice/components/invoice-filters-toolbar.tsx`),
- saved views,
- three layouts,
- export, print and bulk update.

## Summary cards

| Card | Counts | Click |
| --- | --- | --- |
| Total orders | Every order matching the filters (hint: units planned) | Clears the status filter |
| In production | In production + QC pending (hint: paused) | Status = in production / QC pending |
| Planned | Planned + released | Status = planned / released |
| Completed | Completed (hint: their material cost) | Status = completed |
| Delayed | Open orders behind schedule (hint: how many are past their due date) | Delayed only |
| Cancelled | Cancelled | Status = cancelled |

The cards follow every filter **except status**, so they always show the breakdown of
the current view. A card applies its filter in place; the pressed card is marked.

**Delayed** and **Overdue** are different:
- **Overdue** means open and past the due date.
- **Delayed** means open and behind schedule: overdue, *or* still not started after its
  planned production date.

## Toolbar (same behaviour as the invoice list)

- **Search by** *All fields / Order no. / Product*, plus a search box with a clear
  button. The search applies as you type.
- **Sort by:** Newest, Oldest, Due date, Quantity, Priority, Status, Completion % or
  Cost, with an ascending/descending toggle. Orders with no due date sort last.
- **Filters** button with a count badge. It opens the advanced panel, where changes
  are a draft until **Apply filters**. Cancel or Escape discards them.
- **Views**, **Export** (CSV / PDF), **Print** and **Reset**. On phones these show as
  icons, with their names kept for screen readers.
- **Quick chips:**
  - Today, Yesterday, Last 7 days, Last 30 days, This month, Last month, This
    quarter and This year (production date).
  - Delayed, Overdue, Has shortage and High priority.
- **Applied-filter pills** under the toolbar, each removable, plus *Clear all*.

### Advanced panel

| Group | Filters |
| --- | --- |
| Status, priority | Multi-select |
| Dates | Production date (planned start), Due date, Completion date. Each offers Today, Yesterday, Last 7 / 30 days, This / Last month, This quarter, This year or a Custom range |
| Where | Warehouse (the order's raw-material or finished-goods store), Branch, Work center (WIP location) |
| What | BOM, Product type |
| Who | Operator, Created by |
| Ranges | Quantity (min–max), Completion % (min–max) |
| Flags | Delayed only, Overdue only, Has shortage, Has QC issue, Has scrap, Has rework |

The picker choices come from the organization's own orders
(`GET /manufacturing/production-orders/filter-options`).

**Warehouse vs Branch:** in Logix Plus, stock is held per branch. Inside a branch, an
order names its raw-material, WIP and finished-goods locations. *Branch* picks branches
of your organization. *Warehouse* picks those stock locations.

**Date presets** are stored by name and worked out when the list loads, in the business
timezone. A saved "Today's production" view therefore always means today.

## Saved views

The **Views** menu offers five built-in presets:
- **My delayed orders:** delayed, created by me.
- **Today's production.**
- **Material shortage orders.**
- **High priority:** high and urgent, by due date.
- **Completed this month.**

Users can also save the current filters and sort as a named view, apply it later, and
delete it. Like the invoice list's saved views, these are kept in the browser. Here they
are additionally keyed per organization, user and order type, so two people on one
computer don't share them.

## Layouts

**Table** (default), **Compact** (dense rows, 50 per page) and **Cards** (24 per page).
The choice is remembered in the browser. On phones, Table and Compact become stacked
cards, so status, progress and due date are never hidden.

Rows carry badges explaining why an order needs a look: *N days late*, *Not started*,
*Shortage*, *QC*, *Rework*.

## Actions

- **Create production order** (or assembly order).
- **Export:**
  - CSV, UTF-8 with a BOM (so Excel reads it correctly) and 24 columns.
  - PDF, through the browser's print dialog, as the invoice list does.
  - Both include every order matching the filters (up to 5,000), or only the selected
    ones.
- **Print:** a print-ready list with the filters in force and totals.
- **Bulk update** for up to 200 selected orders:
  - What it changes: status (planned / released / paused / cancelled), priority,
    operator, production date and due date.
  - How it works: each order goes through its normal rules, and the result lists what
    changed and why anything was refused (for example, *MO-00004 — a completed
    production order can no longer be edited*).
  - Recording: every change is written to the audit log.
- **Reset filters.**

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /manufacturing/production-orders` | The list: all filters above, `sort` + `dir`, pagination, per-row flags |
| `GET /manufacturing/production-orders/status-counts` | The summary cards for the same filters |
| `GET /manufacturing/production-orders/filter-options` | Picker choices (work centres, warehouses, operators, creators, BOMs, branches) |
| `GET /manufacturing/production-orders/export` | Up to 5,000 flattened rows for CSV / PDF / print (audit-logged) |
| `POST /manufacturing/production-orders/bulk` | Bulk update (`manageProductionOrders`) |

All four reads share one filter builder (`services/manufacturing/orderList.service.js`),
so the list, the cards, the export and the counts always describe the same orders.
Organization scoping is applied first. A branch filter can only narrow it: another
organization's branch id matches nothing, and a user pinned to one branch can't widen
to another.

## Fixed along the way

- **Escape in the Filters panel:** closing a dropdown with Escape also closed the whole
  panel and discarded the draft. React passes key events from portalled popovers up to
  the panel. The panel now only reacts to an Escape pressed inside itself. *The invoice
  page's toolbar uses the same pattern and probably has the same issue; it hasn't been
  changed here.*
- **Phone cards:** each card was a button wrapping a checkbox (also a button). Buttons
  can't nest. The card's open action now sits behind the content, so checkboxes and
  links inside stay separate controls. This applies to every list using the shared
  table.
- **Days late:** this is now counted in calendar days. Due on the 5th and open on the 7th
  is 2 days late.

## Verified

- **Tests:** 28 manufacturing integration tests pass, 3 of them new. The new tests cover
  every filter, cross-organization isolation, branch pinning, every sort, the summary,
  export, filter options, and bulk update with refusals.
- **Browser (desktop):**
  - The draft panel stays a draft until Apply.
  - Save, reset and re-apply of a view, and the built-in presets.
  - Quick chips, summary-card filtering and sorting.
  - All three layouts.
  - CSV download, print window, bulk update with a refusal, and dashboard deep links.
- **Browser (phone):** the card layout.
- **Accessibility:** axe (WCAG 2 A/AA) reports no violations.
- **Build:** typecheck, ESLint and Prettier are clean, and the production build passes.
