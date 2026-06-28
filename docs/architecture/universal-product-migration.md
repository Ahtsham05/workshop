# Universal Product Architecture — Migration Plan

Status: proposal · Owner: TBD · Created: 2026-06-24

This document designs a safe, zero-downtime path from the current mobile-shop-shaped
`Product` model to a universal inventory architecture that supports garments, grocery,
pharmacy, cosmetics, hardware, books, furniture, and wholesale — without breaking any
existing customer, API, or report.

It is grounded in the actual current code, not a generic textbook design. Key real
constraints this plan works around:

- `Product` documents are **branch-scoped**, not org-scoped. Each branch owns its own
  `Product` doc for "the same" item (see [`inventoryTransfer.model.js`](../../server/src/models/inventoryTransfer.model.js)
  comment: matched across branches by barcode/name, not a shared FK).
- There is **no separate `Inventory` collection today**. Stock is the field
  `Product.stockQuantity` ([`product.model.js:31`](../../server/src/models/product.model.js#L31)).
- Stock-affecting flows write directly into `Product.stockQuantity`: `Purchase.items`,
  `Invoice.items`, `InventoryTransfer`, `PurchaseReturn`, `SalesReturn`.
- IMEI tracking already exists as a **parallel, product-decorating collection**
  (`Imei` model) rather than being fused into core stock math — this is the precedent
  for how variants/batches/serials should be bolted on.
- Multi-unit support already exists: `Product.unit` + `Product.unitConversions[]` with
  `businessTypes` tagging ([`units.js`](../../server/src/config/units.js)).
- There's already a working precedent for *this exact kind of migration*: `category`
  (string, kept "for backward compatibility") living next to `categories[]` (new,
  richer shape) on the same document ([`product.model.js:69-78`](../../server/src/models/product.model.js#L69)).

The plan below is the same pattern, generalized: **additive, expand-contract, dual-read
dual-write**, never a destructive rewrite.

---

## 1. Current Architecture Limitations

| Limitation | Where it shows up | Why it breaks for non-mobile businesses |
|---|---|---|
| One flat product, no variants | `Product` has a single `price`/`cost`/`stockQuantity` | A T-shirt in S/M/L/Black/White is 1 product in reality, but today needs N separate Product docs with no relationship between them, no shared name/image/category editing |
| No dynamic attributes | Nothing structured between `name` and `description` | Size, color, storage, weight, diameter all need ad-hoc encoding into `name` strings today |
| Stock = a single number on Product | `stockQuantity` | No batch/lot, no expiry, no per-warehouse-bin granularity, no FIFO/FEFO costing |
| No expiry tracking | absent | Pharmacy/grocery legally need expiry-aware stock and FEFO sale ordering |
| No batch/lot tracking | absent | Grocery/pharmacy need batch-level traceability (recalls, supplier batch costs) |
| Serial numbers = IMEI-only | `Imei` model is mobile-specific (imei/imei2/warranty fields) | Furniture, electronics, appliances need generic serials without phone-shaped fields |
| Branch-scoped Product duplication | confirmed in `inventoryTransfer.model.js` | "Same" product across 5 branches = 5 documents that can drift in name/category/image; no single source of truth for catalog data |
| No barcode-per-pack-size | `Product.barcode` is a single sparse-unique string | Grocery: same product needs different barcodes per pack size (5kg bag vs 25kg sack) |

## 2. Future Architecture (Target Shape)

```
Product (catalog/org-level "what is this item")
  └─ ProductVariant[] (sellable SKU: size+color+pack combination)
        ├─ Barcode[] (1..N codes per variant — EAN/UPC/internal/QR)
        ├─ ProductAttributeValue[] (size: Large, color: Black — dynamic, not hardcoded)
        └─ Inventory (1 doc per variant per branch — the stock ledger row)
              ├─ Batch[] (lot number, expiry, batch cost — for pharmacy/grocery)
              └─ SerialNumber[] (IMEI generalized — for serialized variants)

InventoryTransaction (append-only ledger: every stock move, any reason)
ProductAttribute (org-level definitions: "Size", "Color", "Diameter" + allowed values)
```

Legacy `Product` keeps working unmodified: a legacy product is simply a `Product` with
**exactly one auto-generated `ProductVariant`** (a "default variant"), and that variant's
`Inventory.quantity` is kept byte-for-byte mirrored to `Product.stockQuantity` during the
transition. No existing code path needs to know variants exist until you choose to use them.

## 3. Product Migration Strategy

Three-phase expand → migrate → contract, run per-organization (never a global flag day):

**Phase 0 — Expand (additive only, fully backward compatible)**
- Add new collections: `ProductVariant`, `Inventory`, `InventoryTransaction`,
  `ProductAttribute`, `Batch`, `SerialNumber`. Existing collections untouched.
- Add `Product.schemaVersion: { type: Number, default: 1 }` and
  `Product.hasVariants: { type: Boolean, default: false }`.
- All existing reads/writes to `Product.stockQuantity`, `purchasePrice`/`price` etc.
  continue to work exactly as today. Nothing is removed or renamed.

**Phase 1 — Backfill (background job, idempotent, resumable)**
- For every existing `Product`, create one `ProductVariant` (`isDefault: true`,
  `attributes: {}`, `sku` copied from `Product.sku`, `barcode` copied from
  `Product.barcode`) and one `Inventory` row (`quantity = Product.stockQuantity`).
- Tag the source product `schemaVersion: 2` only after its variant+inventory rows are
  written and verified (`Inventory.quantity === Product.stockQuantity`). Re-runnable:
  skip any product already at `schemaVersion: 2`.
- Runs per-organization, throttled, with a dry-run mode that reports counts/mismatches
  without writing.

**Phase 2 — Dual-write (the only phase where existing code changes)**
- Every code path that mutates `Product.stockQuantity` (purchase receive, sale, return,
  transfer, manual adjustment) is changed to **also** write the matching
  `Inventory.quantity` delta + append an `InventoryTransaction` row, inside the same
  transaction/session. `Product.stockQuantity` remains the field every legacy read uses,
  so reports/invoices/APIs are unaffected.
- New UI (variant picker, attribute editor) reads/writes `ProductVariant` + `Inventory`
  directly. Legacy UI is untouched.

**Phase 3 — Contract (per-org opt-in, far future, not in this PR)**
- Once an org has fully adopted variants in their UI, stop writing
  `Product.stockQuantity` as the primary value and make it a computed/cached rollup
  (sum of its variants' `Inventory.quantity`) purely for legacy report compatibility.
  This step is reversible and never mandatory — orgs that never touch variants never
  reach Phase 3.

## 4. Variant Architecture

A `Product` becomes a **template**: name, description, category, brand, image, business
type. A `ProductVariant` is the actually-sellable, actually-priced, actually-stocked unit.

```
Product: "Classic Cotton T-Shirt"
  ProductVariant: { attributes: {size: "S", color: "Black"}, sku: "TSHIRT-S-BLK", price: 1200 }
  ProductVariant: { attributes: {size: "M", color: "Black"}, sku: "TSHIRT-M-BLK", price: 1200 }
  ProductVariant: { attributes: {size: "L", color: "White"}, sku: "TSHIRT-L-WHT", price: 1300 }
```

- `Product.hasVariants = false` → exactly one variant exists, hidden from variant UI,
  legacy flat-product experience preserved entirely.
- `Product.hasVariants = true` → variant picker shown; legacy single-price/stock fields
  on `Product` become display fallbacks only (e.g. "from $1200"), never authoritative.
- All pricing, stock, barcode, and IMEI/serial/batch tracking move to the **variant**
  level, because that's the actual sellable thing — this matches how Shopify/Lightspeed
  model it and avoids the "average price across all variants" trap.

## 5. Dynamic Attribute Architecture

No hardcoded `size`/`color`/`storage` fields anywhere. Two layers:

1. **`ProductAttribute`** — org-level (or global template) definition of an attribute
   name + its allowed values + applicable business types. e.g. `{ name: "Size", values:
   ["S","M","L","XL"], businessTypes: ["retail"] }` or `{ name: "Diameter", values:
   ["1 inch","1.5 inch"], businessTypes: ["hardware"] }`.
2. **`ProductVariant.attributes`** — a `Map<String, String>` (Mongoose `Map` type, not a
   fixed schema) holding the actual `{ "Size": "Large", "Color": "Black" }` for that
   variant. Validated against the org's `ProductAttribute` definitions at write time in
   the service layer, not via a fixed Mongoose schema shape — this is what makes it
   genuinely dynamic instead of "dynamic in name, hardcoded in practice."

This mirrors your existing `unitConversions[].businessTypes` pattern
([`product.model.js:39-58`](../../server/src/models/product.model.js#L39)) — you already
tag config rows by business type rather than branching code by business type. Same idea,
applied to attributes.

## 6. Inventory Architecture

`Inventory` is the new stock source of truth, one document per `(organizationId,
branchId, variantId)`:

```
Inventory {
  organizationId, branchId, productId, variantId,
  quantity,            // current on-hand, same semantics as Product.stockQuantity today
  reservedQuantity,    // for future order-hold support, default 0, unused initially
  averageCost,         // moving average cost, replaces ad-hoc cost reads off Product.cost
  reorderLevel, reorderQty,  // optional, feeds existing purchase-suggestions engine
}
```

Every change to `quantity` is **also** appended to `InventoryTransaction` (purchase
receive, sale, return, transfer, adjustment, batch expiry write-off) — an immutable
ledger. This is what lets you reconstruct "what was the stock on March 1st" and audit
discrepancies, which a single mutable counter can never do. `Batch` and `SerialNumber`
attach to `Inventory` for the businesses that need lot/expiry/serial granularity; they're
absent (zero rows) for businesses that don't, with no schema or query cost imposed on
those simpler tenants.

## 7. Database Schemas

```js
// ── ProductAttribute ────────────────────────────────────────────────
const ProductAttributeSchema = new Schema({
  organizationId: { type: ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },        // "Size", "Color", "Diameter"
  values: [{ type: String, trim: true }],                     // allowed values, org can extend
  businessTypes: [{ type: String, enum: BUSINESS_TYPES }],    // which business types show this
  isActive: { type: Boolean, default: true },
}, { timestamps: true });
ProductAttributeSchema.index({ organizationId: 1, name: 1 }, { unique: true });

// ── ProductVariant ──────────────────────────────────────────────────
const ProductVariantSchema = new Schema({
  organizationId: { type: ObjectId, ref: 'Organization', required: true, index: true },
  branchId: { type: ObjectId, ref: 'Branch', required: true, index: true },
  productId: { type: ObjectId, ref: 'Product', required: true, index: true },
  isDefault: { type: Boolean, default: false },  // true = the auto-generated legacy variant
  sku: { type: String, trim: true },
  attributes: { type: Map, of: String, default: {} },   // { Size: "Large", Color: "Black" }
  price: { type: Number, required: true },
  cost: { type: Number, required: true },
  unit: { type: String, default: DEFAULT_UNIT, enum: Object.values(UNITS) },
  trackBatch: { type: Boolean, default: false },
  trackExpiry: { type: Boolean, default: false },
  trackSerial: { type: Boolean, default: false },  // generalized successor to product.trackImei
  image: { url: String, publicId: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });
ProductVariantSchema.index({ organizationId: 1, branchId: 1, productId: 1 });
ProductVariantSchema.index({ organizationId: 1, branchId: 1, sku: 1 }, { sparse: true });

// ── Barcode (1..N per variant — multi-pack-size grocery, multiple symbologies) ──
const BarcodeSchema = new Schema({
  organizationId: { type: ObjectId, ref: 'Organization', required: true, index: true },
  variantId: { type: ObjectId, ref: 'ProductVariant', required: true, index: true },
  code: { type: String, required: true, trim: true },
  type: { type: String, enum: ['EAN13', 'UPC', 'CODE128', 'QR', 'INTERNAL'], default: 'INTERNAL' },
  isPrimary: { type: Boolean, default: false },
}, { timestamps: true });
BarcodeSchema.index({ organizationId: 1, code: 1 }, { unique: true });

// ── Inventory (the stock ledger row, one per variant per branch) ──────
const InventorySchema = new Schema({
  organizationId: { type: ObjectId, ref: 'Organization', required: true, index: true },
  branchId: { type: ObjectId, ref: 'Branch', required: true, index: true },
  productId: { type: ObjectId, ref: 'Product', required: true, index: true },
  variantId: { type: ObjectId, ref: 'ProductVariant', required: true, index: true },
  quantity: { type: Number, required: true, default: 0 },
  reservedQuantity: { type: Number, default: 0 },
  averageCost: { type: Number, default: 0 },
  reorderLevel: { type: Number, default: 0 },
  reorderQty: { type: Number, default: 0 },
}, { timestamps: true });
InventorySchema.index({ organizationId: 1, branchId: 1, variantId: 1 }, { unique: true });

// ── Batch (lot tracking, expiry) ───────────────────────────────────
const BatchSchema = new Schema({
  organizationId: { type: ObjectId, ref: 'Organization', required: true, index: true },
  inventoryId: { type: ObjectId, ref: 'Inventory', required: true, index: true },
  batchNumber: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true },
  costPerUnit: { type: Number, required: true },
  manufactureDate: Date,
  expiryDate: { type: Date, index: true },   // indexed: FEFO queries, expiry alerts job
  supplierId: { type: ObjectId, ref: 'Supplier' },
  purchaseId: { type: ObjectId, ref: 'Purchase' },
  status: { type: String, enum: ['active', 'depleted', 'expired', 'written_off'], default: 'active' },
}, { timestamps: true });
BatchSchema.index({ organizationId: 1, inventoryId: 1, batchNumber: 1 }, { unique: true });
BatchSchema.index({ organizationId: 1, expiryDate: 1 });

// ── SerialNumber (generalized IMEI — phones, appliances, furniture) ──
const SerialNumberSchema = new Schema({
  organizationId: { type: ObjectId, ref: 'Organization', required: true, index: true },
  inventoryId: { type: ObjectId, ref: 'Inventory', required: true, index: true },
  variantId: { type: ObjectId, ref: 'ProductVariant', required: true, index: true },
  serial: { type: String, required: true, trim: true, index: true },
  secondarySerial: { type: String, trim: true, default: '' },  // imei2 equivalent
  batchId: { type: ObjectId, ref: 'Batch' },
  status: { type: String, enum: ['in_stock', 'sold', 'returned', 'scrapped', 'lost', 'stolen'], default: 'in_stock', index: true },
  purchaseId: { type: ObjectId, ref: 'Purchase' },
  invoiceId: { type: ObjectId, ref: 'Invoice' },
  warrantyMonths: { type: Number, default: 0 },
  warrantyEndDate: Date,
}, { timestamps: true });
SerialNumberSchema.index({ organizationId: 1, serial: 1 }, { unique: true });

// ── InventoryTransaction (immutable ledger) ────────────────────────
const InventoryTransactionSchema = new Schema({
  organizationId: { type: ObjectId, ref: 'Organization', required: true, index: true },
  branchId: { type: ObjectId, ref: 'Branch', required: true, index: true },
  inventoryId: { type: ObjectId, ref: 'Inventory', required: true, index: true },
  variantId: { type: ObjectId, ref: 'ProductVariant', required: true, index: true },
  type: { type: String, enum: ['purchase', 'sale', 'return_in', 'return_out', 'transfer_in', 'transfer_out', 'adjustment', 'expiry_writeoff'], required: true },
  quantityDelta: { type: Number, required: true },   // signed
  balanceAfter: { type: Number, required: true },
  unitCost: Number,
  refType: String,    // 'Purchase' | 'Invoice' | 'InventoryTransfer' | ...
  refId: ObjectId,
  createdBy: { type: ObjectId, ref: 'User' },
}, { timestamps: true });
InventoryTransactionSchema.index({ organizationId: 1, branchId: 1, createdAt: -1 });
InventoryTransactionSchema.index({ inventoryId: 1, createdAt: -1 });
InventoryTransactionSchema.index({ refType: 1, refId: 1 });
```

**`Product` itself gets only two new fields** (everything else stays as-is):

```js
ProductSchema.add({
  schemaVersion: { type: Number, default: 1 },     // 1 = legacy-only, 2 = variant-backfilled
  hasVariants: { type: Boolean, default: false },   // UI switch: show variant picker or not
});
```

**Indexing rationale**: every collection is indexed first by `organizationId` (tenant
isolation, every query must filter by it), then `branchId` where stock-scoped, matching
your existing convention (`ProductSchema.index({ organizationId: 1, branchId: 1 })`).
`Inventory`'s unique compound index on `(organizationId, branchId, variantId)` is what
prevents double-counting bugs during dual-write. `Batch.expiryDate` and
`InventoryTransaction.createdAt` are indexed because they drive the two new
business-critical queries (FEFO picking, audit trail range scans) at scale.

## 8. Migration Scripts

All scripts: idempotent, resumable, per-organization batched, dry-run by default.

```js
// scripts/migrations/001-backfill-variants.js
// Usage: node 001-backfill-variants.js --org=<id> [--apply] [--batchSize=500]
//
// For each Product with schemaVersion !== 2 in the target org:
//   1. Skip if a default ProductVariant already exists for this productId (resumable).
//   2. Create ProductVariant { isDefault: true, sku: product.sku, price: product.price,
//      cost: product.cost, unit: product.unit, trackSerial: product.trackImei, ... }
//      inside a session/transaction.
//   3. Create Inventory { quantity: product.stockQuantity, averageCost: product.cost }
//      for the same (org, branch, variant).
//   4. If product.trackImei, link existing Imei docs for this productId to the new
//      Inventory/variant via a SerialNumber row referencing the same serial — Imei
//      collection itself is left untouched (read-only source), this just adds a
//      shadow record for the new model. No Imei document is modified or deleted.
//   5. Verify Inventory.quantity === product.stockQuantity, then set
//      product.schemaVersion = 2.
//   6. On any verification failure: log + skip (do not set schemaVersion), continue
//      with next product. Failures are re-attempted on next run.
//
// --apply is required to write; without it, the script only prints what it would do
// and a count of products already migrated / pending / failed last run.
```

```js
// scripts/migrations/002-backfill-inventory-transactions.js
// Usage: node 002-backfill-inventory-transactions.js --org=<id> [--apply]
//
// Optional, cosmetic-only: for each Inventory row created by script 001, write one
// InventoryTransaction of type 'adjustment' with quantityDelta = quantity,
// balanceAfter = quantity, refType: 'migration', so the ledger has a clean opening
// balance instead of starting silently non-zero. Purely additive, safe to skip.
```

```js
// scripts/migrations/rollback-001.js
// Usage: node rollback-001.js --org=<id> --apply
//
// Deletes ProductVariant/Inventory/SerialNumber/InventoryTransaction documents created
// by script 001 for the target org (filtered by a migrationBatchId stamped on every
// document script 001 writes) and resets Product.schemaVersion back to 1. Safe because
// Phase 0/1 never touch Product.stockQuantity or any pre-existing collection — rollback
// is a pure delete of new rows, not an "undo" of mutations to old data.
```

**Versioning strategy**: `Product.schemaVersion` is the single source of truth for "has
this product been backfilled." All Phase-1/2 code branches on it
(`if (product.schemaVersion >= 2) { use variant path } else { legacy path }`), so legacy
and migrated products coexist in the same org indefinitely — migration is per-product,
not per-org or per-deploy.

## 9. API Migration Strategy

No existing route signature changes. New capability is added via:

- **New endpoints**, additive only: `POST /v1/products/:id/variants`,
  `GET /v1/products/:id/variants`, `PATCH /v1/inventory/:variantId/adjust`,
  `GET /v1/product-attributes`. Existing `/v1/products` CRUD is untouched.
- **Existing `GET /v1/products` response gets two new optional fields**
  (`hasVariants`, `variantCount`) — additive fields are non-breaking for any sane JSON
  client; nothing existing is renamed or removed from the payload.
- **Existing `POST /v1/purchases` and `POST /v1/invoices`** (which write
  `Product.stockQuantity` today via `items[].product`) get an internal-only change: the
  controller/service layer, after committing the legacy write, also resolves
  `product → defaultVariant → Inventory` and writes the mirrored delta +
  `InventoryTransaction`, in the same Mongoose session. The request/response contracts
  these endpoints expose are unchanged — `items[].product` still accepts a `Product`
  `_id` exactly as today. Clients (including your own frontend) need zero changes to
  keep working.
- New frontend variant UI calls the new endpoints with `items[].variantId` optionally
  alongside `items[].product`, only once a given org has `hasVariants: true` products.

## 10. Frontend Migration Strategy

- `client/src/features/products` (and the open file
  [purchase-suggestions/index.tsx](../../client/src/features/purchase-suggestions/index.tsx)
  pattern of reading `Product.stockQuantity`) needs **no changes** for orgs that never
  create variants — `hasVariants` is `false` and the existing product list/edit/POS
  screens behave exactly as today.
- Add a **variant toggle** on the product edit screen: "This product has variants
  (size/color/etc)" → reveals an attribute/variant matrix editor, writes to the new
  endpoints. Off by default for every existing product.
- POS/sale screen: when scanning a barcode or picking a product with `hasVariants:
  true`, show a variant picker (size/color chips) before adding to cart; otherwise
  unchanged single-click add.
- Reports/insights (`insight-card.tsx`, `salesInsights.service.js`) keep reading
  `Product`/`Invoice` exactly as today; once Phase 2 dual-write is live, a later
  follow-up can enrich reports with variant-level breakdowns as a strictly additive
  feature, not a required rewrite.

## 11. Backward Compatibility Plan

- Every pre-existing field on `Product`, `Purchase`, `Invoice`, `PurchaseOrder`,
  `Imei`, `Category` keeps its current name, type, and semantics — nothing is renamed,
  retyped, or removed at any phase.
- `Product.stockQuantity` remains the field every legacy report, invoice calculation,
  and the purchase-suggestions engine (`salesInsights.service.js`,
  `purchaseSuggestions.service.js`) reads. It is kept correct by dual-write, not by
  redirecting old readers to a new collection.
- The `Imei` collection is never mutated by the migration — it's a read-only source for
  the one-time `SerialNumber` shadow-copy in script 001.
- A product is "legacy" (1 variant, no attribute UI) until a human or a future opt-in
  flow explicitly turns on `hasVariants`. The system never silently promotes a product
  into a different UX.

## 12. Rollback Plan

- **Schema rollback**: new collections (`ProductVariant`, `Inventory`, `Batch`,
  `SerialNumber`, `InventoryTransaction`, `ProductAttribute`) can be dropped entirely at
  any point during Phase 0/1 with zero impact on existing functionality — they are
  additive and nothing reads them yet.
- **Per-org rollback during Phase 1**: run `rollback-001.js --org=<id>` to delete that
  org's backfilled rows and reset `schemaVersion` to 1 — see script 9 above.
- **Phase 2 rollback (dual-write live)**: dual-write code is guarded by a feature flag
  (`DUAL_WRITE_INVENTORY=true` per org, or a config row). Flipping it off immediately
  stops new `Inventory`/`InventoryTransaction` writes; `Product.stockQuantity` writes
  (the legacy path) are never gated by this flag, so disabling dual-write cannot cause a
  stock-tracking gap — it only stops the new ledger from advancing until re-enabled, at
  which point it can be reconciled by re-running script 001's quantity-verification step.
- **No phase ever requires a maintenance window**: every migration script reads/writes
  in small batches with `findOneAndUpdate`-style idempotent operations, safe to run
  against a live, traffic-serving database.

## 13. Production Deployment Strategy

1. **Deploy Phase 0 schema changes** (new collections, two new `Product` fields,
   defaults backward-compatible) — pure additive deploy, no behavior change, ship to
   100% immediately.
2. **Run Phase 1 backfill** org-by-org in the background (cron/queue job), starting
   with 1-2 low-traffic pilot orgs, verifying `Inventory.quantity ===
   Product.stockQuantity` for 100% of their products before continuing. Roll out to all
   orgs over days, not a single batch run.
3. **Enable Phase 2 dual-write** behind the per-org flag, again starting with the same
   pilot orgs. Monitor: dual-write error rate, `Inventory.quantity` vs
   `Product.stockQuantity` drift (a scheduled job that diffs the two and alerts on
   mismatch is worth building before this step). Expand flag to all orgs once pilots
   show zero drift over a full business day (covers end-of-day batch jobs like the
   purchase-suggestions scheduler).
4. **Ship new frontend variant UI** behind the existing per-org `hasVariants` gate —
   no customer sees it until they explicitly opt in per product.
5. **Phase 3 (contract)** is a separate, much later initiative per org, only once that
   org's reporting/exports have been verified against variant-aggregated
   `Product.stockQuantity`. Not scheduled as part of this plan.

Each step above is independently revertible and independently shippable — there is no
single "migration day," which is what makes this safe for a live multi-tenant system
with real paying customers.
