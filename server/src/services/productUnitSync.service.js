const models = require('../models');

/**
 * Every place a product's unit is copied when it is put on a record. Quantities are always
 * held in the product's unit — there is no conversion when the unit is corrected — so these
 * copies are labels, and when the product goes from "pcs" to "kg" every one of them must
 * follow it (a voucher still printing "367.5 pcs" for a kg material is simply wrong).
 *
 *   model   — model name in models/index.js
 *   header  — field holding the unit of the record's own product (null when it has none)
 *   arrays  — line arrays whose lines carry their own product + unit
 *   key     — the lines'/header's product field ('productId', or 'product' on purchases)
 *   factor  — the lines can be in another unit via `conversionFactor` (sold/bought by the
 *             box…): only lines at factor 1 are in the product's own unit and follow it
 */
const UNIT_COPIES = [
  // Manufacturing
  { model: 'Bom', header: 'unit', arrays: ['components'] },
  { model: 'ProductionOrder', header: 'unit', arrays: ['materials', 'wipLots'] },
  { model: 'MaterialIssue', arrays: ['lines'] },
  { model: 'FloorStockVoucher', arrays: ['lines'] },
  { model: 'FloorStockLot', header: 'unit' },
  { model: 'RawMaterialReceipt', arrays: ['lines'] },
  { model: 'ProductionOutput', header: 'unit', arrays: ['consumption'] },
  { model: 'ProductionReceipt', header: 'unit' },
  { model: 'ScrapRecord', header: 'unit' },
  { model: 'ProductionTarget', arrays: ['lines'] },
  // contentQuantity is in the bulk product's unit.
  { model: 'PackSize', header: 'contentUnit', arrays: ['materials'] },
  { model: 'PackingVoucher', header: 'unit', arrays: ['lines', 'consumed'] },
  // Stock ledger + counts
  { model: 'InventoryTransaction', header: 'unit' },
  { model: 'StockCountLine', header: 'unit' },
  // Sales + purchases
  { model: 'Invoice', arrays: ['items'], factor: true },
  { model: 'SalesReturn', arrays: ['items'], factor: true },
  { model: 'Purchase', arrays: ['items'], key: 'product', factor: true },
  { model: 'PurchaseReturn', arrays: ['items'], factor: true },
  { model: 'PurchaseOrder', arrays: ['items', 'receipts.items'], key: 'product', factor: true },
];

/** `items` → `items.$[l0]`; a nested array (`receipts.items`) → `receipts.$[a1].items.$[l1]`. */
const linePath = (path, i) => {
  const [outer, inner] = path.split('.');
  return inner ? `${outer}.$[a${i}].${inner}.$[l${i}]` : `${outer}.$[l${i}]`;
};

/**
 * The unit a record line should show for a product + variant: a real variant's own unit,
 * otherwise the product's. A simple product's hidden default variant only mirrors the
 * product — its copy is never the truth (it went stale when units changed before this sync).
 */
const unitFor = (product, variant) =>
  (variant && !variant.isDefault && product && product.hasVariants && variant.unit) || (product && product.unit) || '';

/**
 * Relabels every copy of `product`'s unit to its current unit: the hidden default variant
 * and every record in UNIT_COPIES. Idempotent — only stale copies are written. For a
 * product with real variants only lines without a variant follow the product; a variant
 * line carries that variant's own unit.
 * @returns {Promise<number>} documents changed
 */
const syncProductUnit = async (product, { session } = {}) => {
  const { unit } = product;
  if (!unit) return 0;
  const scope = { organizationId: product.organizationId, branchId: product.branchId };
  const writes = [];

  if (!product.hasVariants) {
    writes.push([
      models.ProductVariant,
      { productId: product._id, isDefault: true, unit: { $ne: unit } },
      { $set: { unit } },
      {},
    ]);
  }

  UNIT_COPIES.forEach(({ model, header, arrays = [], key = 'productId', factor }) => {
    const Model = models[model];
    if (!Model) return;
    // What makes a copy "this product's unit, and stale".
    const own = { [key]: product._id, ...(product.hasVariants ? { variantId: null } : {}) };
    const stale = { ...own, ...(factor ? { conversionFactor: { $in: [1, null] } } : {}) };

    if (header) {
      writes.push([Model, { ...scope, ...stale, [header]: { $ne: unit } }, { $set: { [header]: unit } }, {}]);
    }
    if (!arrays.length) return;

    const lineMatch = { ...stale, unit: { $ne: unit } };
    const $set = {};
    const arrayFilters = [];
    arrays.forEach((path, i) => {
      $set[`${linePath(path, i)}.unit`] = unit;
      arrayFilters.push(Object.fromEntries(Object.entries(lineMatch).map(([k, v]) => [`l${i}.${k}`, v])));
      if (path.includes('.')) arrayFilters.push({ [`a${i}.${path.split('.')[1]}`]: { $elemMatch: lineMatch } });
    });
    const filter = { ...scope, $or: arrays.map((path) => ({ [path]: { $elemMatch: lineMatch } })) };
    writes.push([Model, filter, { $set }, { arrayFilters }]);
  });

  // One after another: operations on a transaction's session must not run concurrently.
  let changed = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (const [Model, filter, update, options] of writes) {
    // eslint-disable-next-line no-await-in-loop
    const res = await Model.updateMany(filter, update, { ...options, session });
    changed += res.modifiedCount || 0;
  }
  return changed;
};

module.exports = { syncProductUnit, unitFor, UNIT_COPIES };
