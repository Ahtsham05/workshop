# Phase 10 — Material Issue Voucher (MIV)

A Material Issue Voucher (MIV) issues raw materials and components from a source warehouse into a production order's WIP. It is built on the multi-entry transaction engine from phase 8. It posts through the existing issue pipeline (`execution.service.js#issueMaterials`), so there is still only one way that stock moves into WIP.

## Screens

| Route | What it is |
| --- | --- |
| `/manufacturing/material-issues/new` (`?orderId=` preloads an order) | Entry screen for a new voucher |
| `/manufacturing/material-issues/$issueId` | Posted voucher (read-only), with Print and "Issue more for this order" |
| `/manufacturing/material-issues` | List; it has a **New Issue Voucher** button, and its detail sheet has **Open voucher** |
| Production order → Materials tab | **Issue Voucher** opens the voucher with that order loaded. **Quick issue** is the old dialog |

**Header fields:** voucher number, date, production order, source warehouse, WIP location, branch, requested by, issued by, reference and notes.

- The voucher number is assigned on save. The default prefix is now `MIV`; organisations that already had settings keep their own prefix.
- The source warehouse and WIP location start from the order's own locations.
- Issued by defaults to the logged-in user.

**Grid columns:** product, required, available, reserved, issued, remaining, issue qty, unit, batch, serial and status.

- Choosing an order loads its open material lines.
- **Issue Qty** starts at the remaining quantity, capped at the stock on hand ("Issue Available").
- The **Status** column shows: OK, FEFO, Short *n*, Over by *n*, Expired batch, Out of stock, or Not issued.

**Actions:**
- **Issue All** sets every row to the full remaining quantity.
- **Issue Available** caps each row at the stock on hand.
- **Clear** empties the issue quantities.
- **Reload materials** fetches the order's lines again.
- **Issue Selected** posts only the rows selected with their # button. The screen then stays on the order and reloads what is still open.
- **Add Material:** type on the blank row. The search only offers this order's materials and their listed alternatives.
- **Remove Material:** Ctrl+Delete, or select rows and press Delete.
- **Post Issue** (Ctrl+Enter), **Post & Print**, **Save & New** (Alt+Enter).
- Rows with a quantity of 0 are not posted.

## Rules (server: `services/manufacturing/materialIssueVoucher.service.js`)

`POST /manufacturing/material-issues/check` runs every check and changes nothing. `POST /manufacturing/material-issues` runs the same checks and then posts. Both need `executeProduction`.

| Problem | Kind | Who can override it |
| --- | --- | --- |
| Quantity ≤ 0 or not a number; product not on the order or not a listed alternative; the same line twice | error | — |
| Missing serial numbers, or serials not in stock | error | — |
| Chosen batch not found, or the batch has too little | error | — |
| Batch-tracked item without enough stock in any batch | error | — |
| Insufficient stock (setting *Allow negative stock issue* off) | error | — |
| Unknown source or WIP location, WIP = source, order not released | header error | — |
| Quantity more than the remaining requirement | warning `exceeds_remaining` | `overIssueMaterials` |
| An expired batch is chosen, or FEFO would need expired batches | warning `expired_batch` | `manageManufacturingSettings` (supervisor) |
| Insufficient stock with *Allow negative stock issue* on | warning `insufficient_stock` | `executeProduction` |
| No batch chosen | note: "FEFO will take B1 × 5, …" | — |

**How errors and warnings reach the screen:**
- **Errors** come back as `ROW_ERRORS`, and each message appears on its row in the grid. Nothing is posted.
- **Warnings** come back as `ISSUE_WARNINGS`: 409 if nobody has overridden them yet, 403 if the user lacks the permission.
- **The override dialog** lists each warning with its on-screen row, the product, and the permission it needs. If the user has every permission needed, **Override & post** sends the override codes. Otherwise it tells them to ask a supervisor.
- **Overrides are recorded** on the voucher (`overrides`), in the audit log, and on the printout.

**Warehouses:** a branch is the warehouse. A location is valid if it is one of the settings defaults or a location already used on this branch's orders or receipts. The screen offers exactly that list (`GET /manufacturing/material-issues/options`).

## Posting

`issueMaterials` gained the voucher fields:
- `sourceLocation` and `wipLocation` (used on the ledger rows);
- `reference`, `requestedBy`, `issuedBy` and `overrides`;
- `skipExpiredBatches`: automatic FEFO picking leaves expired batches out unless the user overrode `expired_batch`.

The same material line may now be issued both as the product and as an alternative in one voucher.

Everything happens in one MongoDB transaction, and every row write is conditional:
- source stock goes down (with a guard against going below zero, or Inventory/Batch quantities for batch items);
- serial units move to `in_production`;
- WIP lots are created;
- the order's issued quantities and costs are updated, and the order moves released → in production;
- a pair of ledger rows is written per piece (`production_issue` out of the available stock, `wip_in` into WIP), each with `refType: 'MaterialIssue'`, `refId`, `productionOrderId`, organization, branch, warehouse, location, batch, serials and user.

If any row fails (for example, stock taken by someone else between the check and the post), the whole voucher rolls back.

The engine change that came with this phase: Ctrl+Enter / Alt+Enter now save from anywhere on the page (for example after clicking "Issue Available" in the page header), but not from inside a dialog or another entry grid.

## Tests

- `server/tests/integration/materialIssueVoucher.test.js` (9 tests, replica set): posting with ledger linkage and the header; per-row errors; invalid warehouse; the over-issue warning and its permission; negative stock under the setting; FEFO skipping expired batches; supervisor override for an expired batch; missing serials; full rollback when a row fails mid-transaction; tenant isolation.
- With the other manufacturing suites: 67/67.
- Real-app end to end (jailed API + client + Playwright, demo fan factory): 25/25. It covered auto-load from an order, the defaults, Issue All refused for a shortage, Issue Available posted (view page, ledger pairs), Add Material + over-issue → override dialog → posted with the override recorded, Issue Selected, the link from the order page, and no sideways scroll on a phone.
