# Manufacturing — Phase 9 (Raw Material Receipt Voucher, RMV)

Phase 9 receives raw materials, components, packaging and other manufacturing inputs from
a supplier. It is the first screen built on the Phase 8 entry engine.

Where to find it: **Manufacturing → Inventory → Raw Material Receipts**, at
`/manufacturing/material-receipts` (list), `/new`, and `/:id` (draft or posted).

## Screen

- **Header:** voucher number (assigned on first save), date, supplier, purchase order,
  warehouse (a store or bin inside the branch), branch, reference (the supplier's bill or
  delivery note) and notes.
- **Purchase order:** picking a PO and pressing the load button adds the order's open
  lines, with the quantity still to receive, the expected rate and the order's discount.
- **Grid:**

  | Column | Notes |
  | --- | --- |
  | Product | Search shows manufacturing inputs only: raw material, component, packaging, sub-assembly, by-product and unclassified products |
  | Type | |
  | Qty | For a serial item, this is the number of serials |
  | Unit | |
  | Rate | Prefilled from the product's cost |
  | Disc % | |
  | Tax % | |
  | Net Cost | |
  | Batch | When the product is batch-tracked |
  | Expiry | When the product is expiry-tracked |
  | Serials | Typed or scanned |
  | Warehouse | Defaults to the voucher's |
  | Notes | |

- **Keyboard order:** Enter goes Product → Qty → Rate → Batch → Expiry → next row.
  Discount, tax, warehouse and notes are reached with Tab.
- **Summary:** total items, total quantity, subtotal, discount, tax and grand total.
- **Actions:**

  | Action | Shortcut | What it does |
  | --- | --- | --- |
  | Save Draft | | Saves without full validation |
  | Save | Ctrl+Enter | Posts the receipt |
  | Save & New | Alt+Enter | Posts, then starts a blank receipt |
  | Save & Print | | Posts, then prints the voucher |
  | Cancel | | Leaves the screen |

  A posted voucher is read-only and can be printed.

**Line maths:** gross = qty × rate. The discount is taken off gross, and tax is charged
on gross minus discount. Net = (gross − discount) + tax. Stock is valued net of
discount and before tax, because input tax is recoverable. The server recomputes all of
this when the receipt is posted.

## Posting

A **draft** never touches stock. Lines may be incomplete.

**Save (confirm)** re-validates on the server, then writes everything in **one MongoDB
transaction**:

1. **The voucher:** draft → confirmed. This is a conditional write, so a double click or
   two people can't post it twice. A test confirms that two simultaneous posts create
   exactly one purchase.
2. **A purchase**, created through the existing `purchase.service.js#createPurchase`
   pipeline that every purchase and every PO receipt already uses. It covers:
   - stock and the inventory-ledger row;
   - batches with expiry (an existing batch number is topped up);
   - serial units;
   - product cost;
   - the supplier payable (the purchase balance, which supplier payments settle).

   It is linked both ways: `Purchase.rawMaterialReceipt` and the voucher's
   `purchaseId` / `purchaseInvoiceNumber`. Its tax is the voucher's own per-line tax
   (`manualTax`), so the payable equals the voucher's grand total.
3. **The purchase order**, when there is one: received quantities, a receipt entry and the
   status (partial or completed). Lines that aren't on the order, or quantities above
   what's left, are refused for the whole receipt. This is the same rule as receiving on
   the PO screen.

After the commit, the purchase's cash-book, accounts-journal and supplier-ledger statement
rows are posted. This is exactly what happens for every purchase today; those postings
recalculate running balances and are re-postable, which is why they sit outside the
transaction. The audit log records create, update, confirm and delete.

**Errors:** problems return one `400` with `errorCode: ROW_ERRORS` and a list of
`{ line, field, message }`. Each message appears on its own row, for example:
- "Serial SN-1 already exists" (the same in-stock-or-sold rule as purchases);
- "Not on purchase order PO-0001";
- "Only 100 kg left to receive";
- "Enter the batch number".

If **Save** on a new voucher fails, the draft it created is kept, and later saves update
that draft rather than creating another.

**Permissions:** viewing needs `viewManufacturing`. Saving and posting need
`createPurchases`, because posting creates a purchase and a supplier payable.

## Changes outside the module

All of these are additive, and existing callers behave as before.

| File | Change |
| --- | --- |
| `purchase.service.js` | `createPurchase(body, { session, deferPostCommit })` and an exported `runPurchasePostCommit` |
| `purchase.service.js` | An opt-in `manualTax` (the default stays rule-based tax) |
| `inventorySync.service.js` | `recordStockChange` accepts an optional session and then rethrows instead of swallowing errors |
| `product.service.js` | The purchasable catalog returns `productType` |
| `purchase.model.js` | Gains `rawMaterialReceipt` |

## Verified

**Server:** 9 tests on a replica set. They pass with the inventory-ledger mirror both on
and off:
- line maths;
- drafts not moving stock;
- finished goods and other-organization data refused;
- strict validation with line-level errors;
- a posting that checks stock, cost, manual tax, the payable and the back-links;
- batches with expiry, topped up rather than duplicated;
- serial units, including duplicates within a document and across documents;
- PO receipt, including over-receipt and an off-order line rolling **everything** back
  (stock, purchase, ledger rows, PO);
- concurrent posting.

Regression: the full set is 89 tests, covering manufacturing, the voucher, purchase-order
tax and supplier payments. A plain purchase (no options) still behaves as before.

**Browser:** 45 checks on the real app: the real API, the demo factory, and a no-network
sandbox.
- Header and entry:
  - the supplier → purchase order Enter chain;
  - loading PO lines;
  - keyboard entry with a batch and expiry;
  - finished goods hidden from search;
  - a serial item through the scan box;
  - per-line discount and tax maths.
- Drafts: saving a draft (no stock change) and reopening it.
- Posting:
  - off-order lines refused with nothing posted;
  - deleting those rows and posting;
  - stock, batch, serials, purchase total and tax, and PO completed, all checked in the
    database.
- After posting: the read-only view and the print output.
- Errors and Save & New:
  - a duplicate serial shown as a row error with nothing posted;
  - fixing it and Save & New posting the same draft (no duplicate voucher);
  - the list.
- Phones: the voucher and the list have no sideways scroll.
