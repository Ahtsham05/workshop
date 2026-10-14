# Manufacturing — Phase 2 (Inventory & production flow)

```
RAW MATERIAL ──issue──▶ WIP ──output (backflush)──▶ QC ──inspect──▶ FINISHED GOODS
     ▲                   │                            └─ rejected ──▶ scrap | rework ──▶ FG / scrap
     └──── return ───────┘
```

## One ledger, no parallel inventory

Available stock stays exactly where Logix Plus keeps it (`Product.stockQuantity`, or
`Inventory.quantity` + `Batch.quantity` for variant / batch-tracked items, `Imei` records for
serial items). WIP, QC hold and rework are **buckets of the existing `InventoryTransaction`
ledger** (`stockBucket: available | wip | qc | rework`), per production order — not a second
stock system. The order keeps its running WIP balance as `wipLots` (what was issued, from
which batch, which serials, at what cost) so execution never re-aggregates the ledger.

Every manufacturing movement writes one ledger row with:

| Requirement | Field |
|---|---|
| referenceType / referenceId | `refType` / `refId` (`MaterialIssue`, `MaterialReturn`, `ProductionOutput`, `ProductionReceipt`, `ScrapRecord`, `Rework`) |
| productId | `productId` (+ `variantId`, `inventoryId`) |
| warehouseId | `warehouseId` (= the branch; stock is held per branch) + `location` (bin/area label) |
| quantity / unit | `quantityDelta` (signed) / `unit`, plus `balanceAfter` and `unitCost` |
| batchId / serialId | `batchId` / `imeiIds` + `serialNumbers` |
| organizationId / branchId | `organizationId` / `branchId` |
| userId / timestamp | `createdBy` / `createdAt` |
| — | `productionOrderId`, `stockBucket`, `type` |

Movement types: `production_issue` / `wip_in` (issue, paired), `wip_return` /
`production_return` (return, paired), `wip_consume` (backflush), `wip_scrap`, `qc_in` /
`qc_out`, `production_receipt`, `rework_in` / `rework_out`, `production_scrap`.
Available-bucket rows carry the real stock balance; holding-bucket rows carry that bucket's
balance for the order.

## Material issue

- **Partial issues**: a line can be issued in any number of steps. Per line:
  remaining = required − issued + returned + scrapped (scrapped WIP has to be replaced).
  The UI shows *required · issued · remaining* on every line, a status (Not / Partially /
  Fully / Over-issued) and a progress bar (consumed · in WIP · scrapped · to issue).
- **Over-issue** beyond the remaining requirement is refused unless the request sets
  `allowOverIssue` **and** the user holds the new `overIssueMaterials` permission.
- **Batches**: FEFO allocation by default, or explicit `batches: [{batchId, quantity}]`;
  `Batch.quantity` moves with `Inventory.quantity`.
- **Serials**: pick units (`imeiIds` / `serialNumbers`); they move to status
  `in_production` (with `productionOrderId`), then `consumed` when built in, back to
  `in_stock` when returned, `scrapped` when scrapped.
- Alternatives issue with their BOM ratio (credited back to the line).

## Output, quality check, finished goods

- **Report output** (`producedQuantity`): backflushes WIP — each line's cumulative
  consumption follows its requirement × (cumulative produced ÷ planned), so the final output
  consumes exactly the requirement. Refused if issued material can't cover it (optional
  lines consume what's there). Output is costed at the material it actually consumed.
- With **Quality check** on (default) produced units go to the QC hold; inspection splits
  them into **good** → finished stock (new batch for batch items — number defaults to the
  order number; one new serial record per unit for serial items) and **rejected** →
  scrap (`ScrapRecord` stage `qc_reject`) or **rework** (rework bucket). With QC off, the
  split is entered with the output.
- **Rework**: passed units → finished stock (receipt source `rework`), failed → scrap.
- Order quantities: planned, produced, good (`completedQuantity`), rejected, in QC, in
  rework, remaining = planned − produced. E.g. planned 100, produced 95, good 92,
  rejected 3, remaining 5.

## Completion

Completing requires nothing in QC or rework. Material still in WIP must be settled
explicitly — `wipDisposition: 'return'` (back to stock) or `'scrap'`.

## Atomicity

Each action (issue, return, output, inspection, rework, scrap, completion) is one MongoDB
transaction: order, stock, batches, serial records, documents and ledger rows commit
together or not at all. Stock decrements are conditional (`balance >= qty`). Document
numbers are reserved before the transaction after cheap pre-checks, so a rejected action
can leave a numbering gap.

## Permissions (new)

- `overIssueMaterials` — issue beyond an order's remaining requirement.
- `inspectProduction` — post QC inspections and rework results.

Admin gets all; Manager gets both.

## Notes

- A simple product used by manufacturing gets its default variant + `Inventory` row
  created (as the variant migration / dual-write would) because ledger rows reference them.
  For simple products `Product.stockQuantity` stays authoritative; that `Inventory` row is a
  mirror maintained only under the existing `DUAL_WRITE_INVENTORY` flag, like every other
  legacy stock write.
- Orders started before Phase 2 have no `wipLots`; their already-issued material cannot be
  backflushed. (Phase 1 was never released, so no migration is shipped.)
