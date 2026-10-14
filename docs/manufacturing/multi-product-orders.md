# Several production orders at once

`/manufacturing/production-orders/new` is an invoice-style entry screen for planners, built on the transaction engine. Each row (product, BOM, quantity) becomes its own production order, with its own number, BOM snapshot and routing.

## How to get there

- **Multiple orders**, next to *Create production order* on the Production Orders page.
- **Multiple products**, in the single-order dialog. If a product was already picked there, it carries over (`?productId=`).

## The screen

**Header.** These values are the defaults for every row:

- planned start and planned completion
- priority, operator and production team
- source, WIP and finished-goods locations
- notes (a row's own notes are added after them)

**Rows.** Each row has these columns:

- **Product:** finished goods and sub-assemblies.
- **Bill of materials:** the product's default, or any of its active versions.
- **Qty**, plus read-only **Unit** and **In stock**.
- **Priority / Start / Due:** leave empty to use the header's value, or fill in to override it for that row.
- **Materials:** a live check, described below.

**Materials column.** A moment after you stop typing, the server builds every row's order without saving it. It then reports each row's component count and any shortages:

- Rows compete for the same stock: row 2 gets what row 1 leaves.
- Stock already promised to open orders is not counted as free.
- Hovering over a shortage shows the quantity needed, free, on hand, and held by open orders.

**Keyboard.** Enter moves Product → Qty → next row. The BOM, priority and date cells are reached with Tab.

| Key or button | What it does |
| --- | --- |
| Ctrl+Enter (Create & plan) | Creates the orders with status *planned* |
| Save as drafts | Creates the orders with status *draft* |
| Alt+Enter | Creates the orders and starts a fresh list |

Unsaved rows stay as a local draft on this device.

## Server

The logic is in `services/manufacturing/productionOrderBatch.service.js`. Both endpoints need `manageProductionOrders`.

**`POST /manufacturing/production-orders/batch/check`** (read-only) returns `{ rows, lines }`:

- `rows`: per-row problems in the ROW_ERRORS shape, such as no BOM, quantity ≤ 0, due before start, or an unknown product;
- `lines`: the material preview for each row.

**`POST /manufacturing/production-orders/batch`** runs the same checks first:

- If any row has a problem, it returns 400 ROW_ERRORS and creates nothing.
- Otherwise it creates every order, and assigns its number, in one transaction. `nextDocumentNumber` now accepts a `session`, so a failed batch leaves no gap in the numbering.
- Each created order gets its own audit entry.

**Refactor.** `createOrder` is now `buildOrderDoc` (load, check and snapshot, read-only), followed by numbering and saving. Creating a single order works as before.

## Tests

- `tests/integration/productionOrderBatch.test.js` (6 tests): per-row problems; the competing-stock preview; header defaults with row overrides and consecutive numbers; a bad row creates nothing; a failure mid-save rolls back both the orders and the counter; tenant isolation.
- All manufacturing test suites: 73/73.
- Real-app end-to-end checks: 21/21.
