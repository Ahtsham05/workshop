# Material issue for a finished good + Material usage

This extends the Phase 10 Material Issue Voucher (see [phase-10.md](phase-10.md)) with two things:

1. A faster way to issue: pick the finished good and how many to make. Every material it needs is calculated from its BOM.
2. A view of where issued material went.

## Issue for a finished good

On `/manufacturing/material-issues/new`, choose what the voucher is for:

- **For a finished good** (the default). Pick the product (finished goods and sub-assemblies) and enter the **Quantity to Make**.
  - `GET /manufacturing/material-issues/plan?productId&bomId&quantity` explodes the BOM for that quantity, scrap allowance included.
  - The rows load with **Issue Qty** set to what's needed, capped at the stock on hand.
  - Change the quantity or the BOM version, and the rows are recalculated.
  - Adjust a line with the **− / +** stepper, or by typing.
  - If the product already has an open order, the summary offers **Issue against MO-…** instead.
- **For a production order**: the original flow, plus **Issue For** (N units). It sets each line to its share for N units of output, capped at what's still open and at stock.

### Posting

Posting a finished-good voucher (`POST /manufacturing/material-issues` with `newOrder` instead of `productionOrderId`) happens in one MongoDB transaction:

1. The production order is numbered and created. Its status history is draft → released.
2. Its BOM version is locked.
3. Materials are issued through `execution.service#issueMaterials`, which is the only issue pipeline. The order then moves to in production.

If anything fails, nothing is kept: no stray order, stock or ledger rows.

**Why create an order at all:** everything after the issue (consumption on output, returns, wastage, WIP value, costs) is tracked per order. A voucher with no order would make "used vs wasted vs still in the factory" impossible to answer.

**Plan line references:** voucher lines refer to plan lines as `new:<index>`, and also send their `productId`. If the BOM changed between the plan and the post, the row reports "reload the materials".

**Permissions:** `executeProduction`, plus `manageProductionOrders`, because posting creates an order. Overrides work as before.

**Implementation notes:**
- `issueMaterials` gained the options `{ session, settings }` so it can run inside the caller's transaction.
- The caller must pass `settings`. `getSettings` upserts the settings document outside the session, and that write would deadlock on the counter the transaction has already bumped.

## Material usage

`/manufacturing/material-issues?view=usage` (optionally with `&orderId=`) is backed by `GET /manufacturing/material-usage` (`materialUsage.service.js`).

Per order and summed per material, in the line's units:

    issued = used in output + returned to store + wastage + still in the factory (WIP)

| Term | Meaning |
| --- | --- |
| **Used** | Backflushed when output is reported (good and rejected units). |
| **Wastage** | Material scrapped from WIP. |
| **In factory** | The order's live WIP lots. |
| **Standard** | What the BOM allows for the GOOD output so far. |
| **Variance** | (used + wastage) − standard. |

**Values:**
- Issued and used are at their actual cost.
- WIP is at its lots' cost.
- Returned and wastage are at the line's average issue cost.

**On screen:** totals tiles, a split bar, and two tables: By material and By order. An order's sheet links to **Return unused** (the order's WIP tab) and **Record wastage** (its Scrap tab).

## Tests

- `server/tests/integration/materialIssueForProduct.test.js` (7 tests, replica set):
  - the plan;
  - create + issue in one transaction;
  - a partial issue;
  - rollback when the issue fails;
  - per-row errors before anything is created;
  - a product with no BOM;
  - the usage identity and values.
- All manufacturing suites: 80/80.
- Real-app e2e (jailed API + client, demo fan factory): 19/19. It covered:
  - picking the product, then quantity and Enter;
  - BOM rows;
  - the steppers;
  - recalculation;
  - post → order created and in production, stock down;
  - Issue For in order mode;
  - the usage view and order sheet;
  - the identity on all 63 demo lines;
  - no sideways scroll on a phone.

## Materials only (issue by material)

Sometimes material is issued separately, without picking a finished good. Typical case: a voucher for 20 fans went out while packaging stock covered only 10. The order keeps the other 10 sets of packaging open, and they are issued once the stock arrives.

On the voucher, the **Materials only** mode lists what every open order (released, in production or paused) still needs (`GET /manufacturing/material-issues/pending`), filterable by type: Packaging, Raw materials, Components and so on. You can:

- add one material from the list, or search for it on the grid;
- add every pending material of that type with **Load all pending**.

Issue Qty starts at what's needed, capped at stock on hand. **Goes To** decides where each line ends up:

| Choice | Where the quantity goes |
| --- | --- |
| **Auto** (default) | Split over the orders that need it, in production-queue order: running orders first, then by priority, planned start and age. Each order gets up to what it still needs. The label shows the split, e.g. `Auto · MO-00008 ×10, MO-00009 ×16`. |
| **One order** | All of the quantity goes to that order. |

**Over-issue:** a quantity above the total need goes to the first order and raises the usual `exceeds_remaining` override.

### Posting

`POST /manufacturing/material-issues/by-material` (`materialIssueByMaterial.service.js`) writes one Material Issue Voucher per order, all in ONE transaction, through `issueMaterials`.

- **Checks:** each order's part runs through `checkVoucher`, and its row numbers are mapped back to the voucher's lines. Stock is also checked across orders, because two orders sharing one line must not both count the same stock.
- **Not allowed here:** serial-tracked items must be issued against their order, so the serials can be picked.
- **Result:** several vouchers are listed in a dialog with **Print all**. A single voucher opens its own page.
- **Afterwards:** a posted voucher whose order still needs material shows "MO-… still needs …" with **Issue the rest**.

**Tests:** 7 more server tests, 87/87 across the manufacturing suites. The e2e run is 33/33, including one line split over 3 orders → 3 vouchers in one post.

## Editing and deleting posted vouchers

`materialIssueEdit.service.js`. A posted stock document is never silently erased.

| Action | What happens |
| --- | --- |
| **Delete** (`POST /material-issues/:id/cancel`, needs `manageProductionOrders` and a reason) | Reverses the voucher: its material goes from the order's WIP back into stock with contra ledger rows (`wip_in` −, `production_issue` +, `refType: 'MaterialIssueReversal'`), and the order's issued quantity and cost come down. The voucher stays as `status: 'cancelled'` with who, when and why. Its number is never reused. Optionally it also cancels the order, when that voucher was all that happened on it (e.g. an order created by a finished-good voucher). |
| **Edit, header only** (`PUT /material-issues/:id`) | Date, people, reference, notes: no stock moves. It is logged in `editHistory` (`kind: 'header'`). |
| **Edit, lines** (quantities, materials, batches, locations) | Reversed and re-posted under the **same id and number** in one transaction, through `issueMaterials` (`reuse`). `createdAt`/`createdBy` are kept, and `editHistory` records `kind: 'lines'` with a summary ("Motor 10 → 6 pcs; Steel added 5 kg") and the before/after totals. The check counts the voucher's own quantity as available again (`checkVoucher` `giveBack`). |

**Blocked once used:** if any of the voucher's material was already used in output, scrapped or returned, deleting and line edits are refused (`VOUCHER_LOCKED`) with what is gone. Header edits still work. The edit screen locks the rows, and the delete dialog explains why.

**Stale screens:** an edit or cancel names the `revision` it was made from. Anything stale gets a 409.

**Not covered:** returns (MR) are not edited or deleted here.

**On screen:**
- Voucher page: **Edit** (`?edit=true` reopens the voucher screen) and **Delete** (a dialog showing what goes back). A cancelled voucher is marked, struck through and keeps its history.
- List: a **Cancelled** filter, and a row menu with Open / Edit / Delete.
- Order's Materials tab: a Cancelled badge.

**Tests:** 12 server tests (99/99 manufacturing). e2e 52/52.

## Production order page: issue the rest, receive finished goods, QC

| Before | Now |
| --- | --- |
| "Issue materials" (header) opened the quick-issue dialog. | Opens the full Material Issue Voucher for that order, loaded with what is still open. A badge counts the open lines. |
| The quick-issue dialog (`IssueMaterialsDialog`), which could hang on "Loading stock…". | Removed. |
| "Report output" opened a small dialog. | "Receive finished goods" opens `/manufacturing/finished-goods/receive?orderId=` (`pages/finished-goods-receipt.tsx`). |

The `finished-goods.tsx` route became the folder `finished-goods/{index,receive}.tsx`.

**The receipt page:**
- **Quantity made:** − / + controls, plus quick picks for **All remaining** and **Floor can build** (what the issued material covers; `lib/output-math.ts#buildableFrom`). The quantity starts at what the floor can build.
- **Material check:** what this output backflushes from WIP, line by line, mirroring the server's `backflush`. When short, posting is blocked and **Issue the missing material** opens the voucher.
- **When the order is fully made,** the page says so.
- **Quality:**

  | Choice | What happens |
  | --- | --- |
  | **Send to QC** | Units wait in the QC hold. |
  | **Receive directly** | Checked on receipt: passed vs rejected (`components/quality-decision.tsx`), rejected to scrap or rework, reason chips. Finished-goods batch and serials use the existing fields. |

  The default follows the *require quality check* setting. While QC is required, only `inspectProduction` users can receive directly: the server refuses others (403), and the output is flagged `directReceipt` for traceability.
- **Summary:** to stock / to QC / rejected, material cost and cost per unit, and the order's progress after the receipt.
- **After posting:** a result card with **Inspect now** (for QC holds, inspectors only), **Receive more** and back to the order.

**Server:** `reportOutput` takes `qcMode: 'direct' | 'hold'`. When it is omitted, the setting decides, as before.

**The QC inspection dialog** (order page and Quality page) uses the same quality block: pass/reject stepper, pass rate, scrap/rework cards, defect reasons and inspector notes.

**Tests:**
- 3 server tests for `qcMode`; 102/102 across the manufacturing suites. One run had a one-off failure in `manufacturingProducts` "stats follow the same filters", which passed 3/3 alone and in the full rerun.
- e2e: 22/22.
