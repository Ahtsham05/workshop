# Master Product Catalog — Migration Plan

Status: shipped (Phase 0 + 1 code complete, rollout gated per-org) · Created: 2026-08-14

This document designs a safe, zero-downtime path to a shared, cross-branch product
identity — without breaking any existing customer, API, or report. It follows the same
playbook as [`universal-product-migration.md`](./universal-product-migration.md) (the
Product→ProductVariant/Inventory/Batch split), which is already partially live in
production (see `DUAL_WRITE_INVENTORY_ORGS` in `server/.env`): **additive, expand-contract,
dual-read dual-write, never a destructive rewrite.**

## 1. The problem

`Product` documents are branch-scoped, not org-scoped — the same physical item at two
branches is two entirely separate documents with no shared id
(`server/src/services/inventoryTransfer.service.js`'s comment: matched across branches by
barcode/name, not a shared FK). Every cross-branch feature (Stock Transfer's destination
matching, the branch-availability stock lookup on Invoice) has to *guess* which product
in another branch is "the same thing," using a heuristic — exact barcode, else exact
case-insensitive name (`server/src/utils/productMatchKey.js`). This breaks silently on
any naming difference between branches (a typo, extra whitespace, a different
abbreviation), and there was no way for a branch to discover or pull in a product that
already exists elsewhere in the org.

## 2. Target shape

```
MasterProduct (org-level "what is this item" — name, barcode, category, brand, image)
  └─ MasterProductVariant[] (org-level template for a real size/color/etc combination)

Product (branch-level, unchanged) ── masterProductId ──▶ MasterProduct
ProductVariant (branch-level, unchanged) ── masterVariantId ──▶ MasterProductVariant
```

`MasterProduct`/`MasterProductVariant` are pure templates: name, barcode, unit, category,
brand, image, tracking flags, and a *suggested* `defaultPrice`/`defaultCost`. Every
existing per-branch field that legitimately varies by branch — `price`, `cost`,
`stockQuantity`, `supplier`, `stockoutHistory` — stays exactly where it is today, on
`Product`/`ProductVariant`. A branch's product is never required to link to a master; an
unlinked product behaves exactly as it did before this migration existed.

## 3. Migration strategy

Two-phase expand → backfill, plus a per-org rollout gate for anything that changes
existing behavior — same pattern as the universal-product migration's Phase 0/1/2.

**Phase 0 — Expand (additive only, shipped to 100% immediately)**
- New collections: `MasterProduct`, `MasterProductVariant`
  (`server/src/models/masterProduct.model.js`, `masterProductVariant.model.js`). Nothing
  existing reads them yet.
- Two new nullable fields: `Product.masterProductId`, `ProductVariant.masterVariantId`
  (both indexed, default `null`).
- `server/src/services/masterProduct.service.js#linkProductToMasterProduct` is wired into
  every product-creation path (`product.service.js#createProduct`, `#bulkAddProducts` —
  covers manual create, Excel import, and the AI-vision-scan import, since all three
  funnel through the same functions) so every *new* product auto-links going forward, with
  zero user action and zero existing-behavior change. This part ships ungated for every
  org, same reasoning Phase 0 fields always ship ungated: it's purely additive and doesn't
  change any existing read path.

**Phase 1 — Backfill (idempotent, resumable, per-org, dry-run by default)**
- `server/src/scripts/002-backfill-master-products.js`. For every `Product` with no
  `masterProductId`, calls `linkProductToMasterProduct`, which finds-or-creates a
  `MasterProduct` using the same org-scoped barcode-or-exact-name heuristic already
  proven by Stock Transfer's `findOrCreateDestinationProduct`. Products across branches
  that already match exactly end up sharing one `MasterProduct`; anything unmatched gets
  its own new one, so nothing is left behind. **Never touches `stockQuantity`, `price`,
  `cost`, or any pre-existing field.**
- `server/src/scripts/rollback-002-backfill-master-products.js` — per-org only, dry-run
  default, deletes that org's `MasterProduct`/`MasterProductVariant` docs and unsets the
  two link fields. Nothing else is touched.

**Rollout gate — behavior changes only, per-org (`MASTER_PRODUCT_ORGS` / `MASTER_PRODUCT_ALL=all`)**

Everything that changes how an *existing* read/match decision is made — not just adds a
new field — stays behind this flag until verified per org, mirroring
`DUAL_WRITE_INVENTORY_ORGS` exactly (`masterProduct.service.js#isMasterProductRolloutEnabledForOrg`):

1. `inventoryTransfer.service.js#findOrCreateDestinationProduct` /
   `#findOrCreateDestinationVariant` — prefer an existing branch `Product`/`ProductVariant`
   sharing the source's master link over the barcode/name heuristic; fall back +
   auto-heal the link for anything not yet backfilled. Reliability improvement only, same
   external behavior either way.
2. `branchAvailability.service.js#resolveBranchRow` — prefer an exact
   `Product.find({branchId, masterProductId})` match over the fuzzy heuristic. This is the
   direct fix for the "same name, different branch" reliability gap that motivated this
   migration.

The "Import Products" feature (section 4) is meaningful only once an org has real
cross-branch `MasterProduct` linkage, so it's naturally gated the same way in practice —
`GET /v1/master-products/importable` simply returns nothing useful until Phase 1 has run
for that org.

## 4. The Import feature

- `GET /v1/master-products/importable` — `MasterProduct`s with no linked `Product` at the
  caller's branch but ≥1 linked `Product` elsewhere in the org. Returns template fields +
  `defaultPrice`/`defaultCost` + which branch names carry it (not their live stock, which
  stays behind the separate `viewBranches`-gated branch-availability feature).
- `POST /v1/master-products/import` — creates a branch `Product` (+
  `ProductVariant`/`Inventory` per `MasterProductVariant`, for products with variants)
  from the template, with an optional opening `stockQuantity` from the request (defaults
  to 0 — the importer may already have physical stock of the item and can record it
  immediately instead of a separate stock adjustment afterward; only applies to the base
  product for a hasVariants import unless it has exactly one variant, since one number
  can't be split across several). Barcode is deliberately left unset on the new branch
  product, same reason `findOrCreateDestinationProduct` already leaves it unset:
  `Product.barcode` has a **global** unique index, so copying it down would collide with
  whichever branch already owns that value. `price`/`cost` come from the request
  (defaulted client-side from the master's suggested values, never required to match).
  Idempotent: importing an already-imported master returns the existing product instead
  of duplicating it.
- Both routes are gated by the existing `createProducts` permission — importing is
  functionally creating a product at this branch, so no new permission was introduced.

## 5. Backward compatibility

- Every pre-existing field on `Product`, `ProductVariant`, `Purchase`, `Invoice`,
  `InventoryTransfer` keeps its current name, type, and semantics.
- `masterProductId`/`masterVariantId` are optional on every read path — nothing requires
  them to be set, and no existing query filters on them unless explicitly opted in via
  `MASTER_PRODUCT_ORGS`.
- `MasterProduct.barcode`'s unique index is scoped to `{organizationId, barcode}` — a
  **new**, org-scoped index, deliberately not reusing `Product.barcode`'s existing global
  unique index, so this migration never touches a live index on existing data.

## 6. Rollback plan

- **Phase 0/1**: `MasterProduct`/`MasterProductVariant` can be dropped entirely at any
  point with zero impact on existing functionality — additive, nothing reads them without
  the rollout flag.
- **Per-org rollback**: `rollback-002-backfill-master-products.js --org=<id> --apply` —
  deletes that org's new collections and unsets the two link fields. Never deletes a
  `Product`/`ProductVariant` document itself, including ones created via Import — they
  simply become regular unlinked branch products again.
- **Rollout-gate rollback**: unset `MASTER_PRODUCT_ORGS` for an org — instantly stops the
  behavior-changing uses (sections 3.1–3.2) and hides the Import feature's practical
  value; auto-linking new products keeps running harmlessly in the background either way.
- No phase ever requires a maintenance window — same guarantee as the universal-product
  migration.

## 7. Deployment strategy

1. Ship Phase 0 (new collections, two nullable fields, always-on auto-link) — no behavior
   change, safe to deploy anytime.
2. Run `002-backfill-master-products.js` dry-run first, review counts, then `--apply` for
   one pilot org before the rest — the `demo` org (`69d28170e979ad94c1e57a78`, the same
   pilot already used for `DUAL_WRITE_INVENTORY_ORGS`) is a natural first choice.
3. Enable `MASTER_PRODUCT_ORGS` for that pilot org, verify Stock Transfer, branch
   availability, and the Import dialog behave correctly, then expand to the rest.
4. Each step is independently revertible and independently shippable — there is no single
   "migration day."
