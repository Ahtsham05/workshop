# Manufacturing — Phase 3 (Assembly, sub-assembly & traceability)

Raw material → sub-assembly → final assembly → finished good, with full genealogy in
both directions. Phase 3 adds no new inventory logic: an assembly order is a
`ProductionOrder` with `orderType: 'assembly'`, so it reuses the Phase 2 engine as-is
(ledger buckets, WIP lots, batches/serials, QC, atomic transactions).

## Assembly orders

| Field | Where it lives |
| --- | --- |
| Assembly number | `orderNumber`, `ASM-00001` (own counter / prefix in Manufacturing settings) |
| Assembly product, BOM, quantity | `productId`, `bomId`/`bomVersion`, `plannedQuantity` |
| Components | `materials` (exploded from the BOM, same as production orders) |
| Source warehouse / Assembly-WIP location / Output warehouse | the branch (warehouse) plus `sourceLocation`, `wipLocation`, `finishedGoodsLocation` |
| Operator | `operatorId` + `operatorName` (must be a user of the same organization) |
| Start / completion date | `actualStartDate`, `actualCompletionDate` |
| Status, notes | `status`, `notes` |
| Nesting | `parentOrderId`, `parentMaterialLineId` |

Statuses: **Draft → Released → In Assembly → (Paused) → QC Pending → Completed**, or
Cancelled. "In Assembly" is stored as `in_production` so every Phase 2 rule, report
and dashboard keeps working; the UI labels it per order type. The transition maps are
`ASSEMBLY_STATUS_TRANSITIONS` (server `config/manufacturing.js`, mirrored in the
client's `lib/constants.ts`).

### What moves when

- **Start assembly** (`POST /manufacturing/assembly-orders/:id/start`, Released only)
  issues every remaining non-optional component into WIP through the normal
  material-issue path. That means FEFO batch allocation, auto-picking the oldest
  in-stock serials, over-issue rules, and `production_issue` / `wip_in` ledger rows.
  If the stock isn't there, the whole start rolls back.
- **Complete assembly** (`POST /manufacturing/assembly-orders/:id/complete`) reports
  the output, which backflushes the components out of WIP (`wip_consume`).
  - With QC on: the units go to the QC hold and the order becomes **QC Pending**.
    Passing inspection receives the sub-assembly or finished assembly into stock
    and completes the order automatically.
  - With QC off: the output is received straight away, the order completes, and any
    leftover WIP is returned (or scrapped with `wipDisposition: 'scrap'`).
- Received batches and serials are stamped with the order that made them
  (`Batch.productionOrderId`, `Imei.producedByOrderId`). This is what makes
  traceability exact.

## Nested assemblies

`POST /manufacturing/production-orders/:id/sub-assemblies` creates assembly orders for
the components that have their own active BOM.

- Quantity is the outstanding requirement, less on-hand stock and less anything
  already covered by open child orders (`basis: 'full'` ignores on-hand stock).
- Asking twice creates nothing new.
- `recursive: true` walks the whole chain, e.g. Product A → Assembly B → Assembly C.

`GET /manufacturing/production-orders/:id/tree` returns the ancestors (root first)
and every descendant. The order page shows this as an **Assembly structure** card.

## Traceability

Everything is derived from existing records: the ledger, purchases, batches, serials,
receipts and parent links. Nothing is duplicated.

- **Forward:** `GET /manufacturing/trace/finished?imeiId|batchId|receiptId` and
  `GET /manufacturing/trace/orders/:id` follow the chain Finished product →
  production order → assembly order(s) → components → batches / serials → supplier
  and purchase.
  - A component that was made in-house recurses into the order that produced its
    batch or serial.
  - An untracked component shows the product's default supplier.
- **Reverse:** `GET /manufacturing/trace/where-used?batchId|imeiId|productId`
  follows Raw-material batch → assembly → production → finished batches / serials.
- **Search:** `GET /manufacturing/trace/lookup?q=` matches serials, batches and
  order numbers.

UI:
- **Manufacturing → Traceability** has a search box with "Made from" and "Used in"
  trees side by side.
- Every order page has a **Traceability** tab.

## Permissions

There are no new permissions:
- Start and complete assembly use `executeProduction`.
- Sub-assembly creation uses `manageProductionOrders`.
- Trace and tree reads use `viewManufacturing`.

## Notes

- `GET /manufacturing/production-orders?orderType=production` excludes assembly orders.
  The Production Orders and Assembly Orders lists are the same page filtered by type.
- An assembly order opened through a generic `/production-orders/:id` link redirects
  to `/assembly-orders/:id`.
- Batch-tracked purchases must carry the default `variantId` for a Batch to be
  created. This is the existing purchase contract. Without a Batch, the stock can't
  be allocated by batch.
- Trace depth is capped at 8 levels. Repeated orders are marked as truncated rather
  than looped.
