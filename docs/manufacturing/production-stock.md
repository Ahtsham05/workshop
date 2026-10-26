# Production stock (bulk / floor-stock issue)

Packing material such as cartons, labels, bottles and bags is handed from the store to the production floor in bulk. The same carton or label is used by many finished goods, so nobody issues "12 cartons for MO-00041". The other ERPs call this:

| ERP | What it's called |
| --- | --- |
| SAP | Production supply area + backflush |
| D365 | Flushing principle |
| Oracle | Supply type "Pull" |

## Model

- `Product.issueMethod`:
  - `'floor'`: the material lives in production stock.
  - `'order'` or `null`: the material is issued to each order (unchanged behaviour).
- `ProductionOrder.materials[].supply`:
  - Snapshotted from the product when the order is built.
  - Synced on open orders whenever the flag changes.
  - A `'floor'` line is never "still to issue" (`wip.lineRemaining` returns 0, and so does the client's `material-math`).
- `FloorStockLot` is the running balance, per branch and product. It is used oldest first and carries the batch and unit cost.
- `FloorStockVoucher` comes in three kinds, all cancellable (cancel puts everything back exactly):

  | Kind | Number | What it does |
  | --- | --- | --- |
  | issue | `PSI-` | Store → floor. `auto: true` when a receipt or packing issued a shortfall itself. |
  | return | `PSR-` | Floor → store. |
  | count | `PSC-` | Physical count. Each line records book, counted and the difference (− wastage, + found). |

- Ledger:
  - The floor side is bucket `'floor'` with types `floor_in`, `floor_return`, `floor_consume` and `floor_adjust`.
  - The store side is `floor_issue` and `floor_restock`.

## Flow

- **Receipt** (`execution.backflush`). A floor line uses whatever was issued to the order first, and the rest from the floor. That part counts as issued and consumed in the same step, at the lot cost, so the finished-good cost includes the packing. Output `consumption[]` entries have `source: 'floor'` and `floorLotId`. `reverseOutput` puts them back on the floor.
- **Packing** (`packing.packInTransaction`). Pack-size materials that are floor materials are taken from the floor (`consumed[].source`, `floorParts`). `uses[]` records which pack used them. `cancelPackingInTx` restores them.
- **Shortfall.** The setting `floorShortfall` controls what happens when the floor runs short:
  - `'auto_issue'` (default): one automatic PSI per receipt or packing.
  - `'block'`: refuse.
- **Reconciliation** (`floorStock.getOverview`, read from the documents with their own dates):
  `opening + issued − used − returned ± count = closing`. When the period ends today, closing equals the lots on the floor.
- Turning a material off is refused while the floor still holds some. Serial-tracked materials and materials with several variants can't be floor materials.

## Reports touched

- **Stock statements:** `MOVEMENT_SOURCES` has new sources `issuedToFloor` and `returnedFromFloor`. `packedOut` skips floor-sourced lines (`lineMatch`).
- **Batch reports:** the floor bucket is excluded from the batch ledger. `floor_issue` and `floor_restock` count as issued to production.

## Tests

`server/tests/integration/manufacturingFloorStock.test.js` covers:
- shared use by two products
- auto-issue
- block mode
- reversal
- return
- count
- cancel rules
- packing from the floor
- the ledger always agreeing with the lots
