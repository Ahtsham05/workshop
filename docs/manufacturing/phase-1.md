# Manufacturing — Phase 1 (Foundation)

The Manufacturing module is an integrated part of Logix Plus, not a separate system. It
reuses the existing Product catalog, branch-scoped stock (Product.stockQuantity /
Inventory), the InventoryTransaction ledger, auth/permissions, branch scoping and audit log.

## Data model

| Collection | Purpose | Scope |
|---|---|---|
| `products` (extended) | `productType`, `procurementType`, `defaultBomId`, `manufacturingLeadTimeDays` — all nullable, default `null`, so existing products are untouched | org + branch |
| `manufacturingsettings` | Numbering prefixes, atomic counters, default locations, production rules | org (one doc) |
| `boms` | One document **per version**. Versions share `bomNumber`, differ by `version` | org + branch |
| `productionorders` | Header, status lifecycle + history, snapshotted `materials[]`, running cost totals | org + branch |
| `materialissues` | Immutable issue of components to an order | org + branch |
| `productionreceipts` | Immutable receipt of output into stock | org + branch |
| `scraprecords` | Scrap by stage (material / WIP / finished stock) and reason | org + branch |

Product types: raw material, component, packaging material, sub-assembly, WIP, finished
good, by-product, scrap, service. `null` means "not classified" — nothing outside the
module reads the field.

### Warehouses and locations

Logix Plus holds stock per **branch** (products themselves are branch-scoped), and there is
no separate warehouse model. A production order's branch is therefore its warehouse:
materials are issued from and output received into that branch's stock. The
`sourceLocation`, `wipLocation` and `finishedGoodsLocation` fields are bin/area labels inside
the branch (defaults come from Manufacturing Settings). Moving stock between branches stays
with the existing Stock Transfer feature.

## BOMs

* Component lines reference existing products of the same branch; a BOM never contains its
  own output product, and **cycles are rejected** at any depth (`assertNoCycle`).
* **Multi-level**: a component that has its own BOM (pinned via `childBomId`, or the
  product's `defaultBomId`) expands underneath it — Finished Product → Motor Assembly →
  Motor → Bearing. The same BOM can be reused inside any number of parent BOMs; *where
  used* lists the parents.
* Required quantity per line = component qty × (output qty ÷ BOM qty) × (1 + scrap %).
* Optional components and alternative components (with a substitution ratio) are supported.
* **Versions**: "New version" clones into `version + 1`. Exactly one active version per
  product is the default (mirrored on `Product.defaultBomId`). When an order using a version
  is released, that version is **locked** — its recipe can no longer be edited (only a new
  version can be made), and it can't be deleted.

## Production orders

Statuses: Draft → Planned → Released → In Production ⇄ Paused → Completed, plus Cancelled.
Allowed moves are in `PRODUCTION_STATUS_TRANSITIONS` (server) / `STATUS_TRANSITIONS`
(client). Status changes are conditional writes, so concurrent clicks can't both win.

* On create (and on product/BOM/quantity change while Draft/Planned) the BOM is exploded
  and snapshotted into `materials[]`. With *Explode sub-assemblies* off (default),
  sub-assemblies are issued from stock as single items.
* An order with issued material or received output can no longer be cancelled or moved back
  to Planned — only paused or completed.

## Execution and stock

Issues, receipts and finished-stock scrap run inside a MongoDB transaction:

* stock decrements use a conditional `$inc` (`balance >= qty`), so concurrent issues can't
  oversell unless *Allow negative stock* is on;
* all lines of an issue succeed or none do;
* ledger entries go to `InventoryTransaction` with new types `production_issue`,
  `production_receipt`, `production_scrap` (simple products mirror through the existing
  `inventorySync.recordStockChange`, exactly like Stock Adjustments).

Phase 1 refuses IMEI/serial- and batch/expiry-tracked items in stock moves (they need
per-unit / per-batch selection). Output is valued at issued material cost ÷ planned
quantity; labour/overhead costing and accounting postings come later.

Document numbers are reserved from atomic counters *before* the transaction, so a rejected
attempt leaves a gap in the sequence.

## Permissions

| Key | Grants |
|---|---|
| `viewManufacturing` | all read endpoints and pages |
| `manageBoms` | BOM create/edit/version/default/activate/delete, product classification |
| `manageProductionOrders` | order create/edit/status/delete |
| `executeProduction` | material issues, output receipts, scrap |
| `manageManufacturingSettings` | settings |

The Admin system role gets all of them automatically; the Manager role gets all but
settings; Viewer gets `viewManufacturing`. Custom roles must be granted them in Roles.

Every request is scoped by `organizationId` and (for writes, always) `branchId`; the
manufacturing router additionally rejects an `x-branch-id` that doesn't belong to the
caller's organization (including for super-admins).

## Not in Phase 1

MRP netting (incoming purchases, safety stock), scheduling/capacity, routings and work
centers, labour/overhead costing and GL postings, material returns, by-product receipts,
serial/batch-tracked production.

## Testing

`server/tests/integration/manufacturing.test.js`. Stock-moving cases need a replica set:

```
mongod --replSet rs0 --port 27999 --dbpath /tmp/rs --fork --logpath /tmp/rs.log
mongosh --port 27999 --eval 'rs.initiate()'
MONGODB_TEST_REPLSET_URL="mongodb://127.0.0.1:27999/mfgtest?replicaSet=rs0" npx jest tests/integration/manufacturing.test.js
```

Without `MONGODB_TEST_REPLSET_URL` those cases are skipped and the rest run on the usual
in-memory server.
