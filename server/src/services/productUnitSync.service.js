const models = require('../models');

/**
 * Where a product's unit is copied when it is put on a record: [model, header, line arrays].
 * `header` = the field holding the unit of the record's own productId (null when the record
 * has none); each array holds lines with their own productId/unit. Quantities are always
 * in the product's unit — there is no conversion — so when the unit is corrected on the
 * product these copies are just labels that went stale (a BOM still said "pcs" after the
 * product became "kg").
 */
const UNIT_COPIES = [
  ['Bom', 'unit', ['components']],
  ['ProductionOrder', 'unit', ['materials', 'wipLots']],
  ['MaterialIssue', null, ['lines']],
  ['FloorStockVoucher', null, ['lines']],
  ['RawMaterialReceipt', null, ['lines']],
  ['ProductionOutput', 'unit', ['consumption']],
  ['ProductionReceipt', 'unit', []],
  ['ScrapRecord', 'unit', []],
  // contentQuantity is in the bulk product's unit.
  ['PackSize', 'contentUnit', ['materials']],
  ['PackingVoucher', 'unit', ['lines', 'consumed']],
];

/**
 * Relabels every copy of `product`'s unit to its current unit: the hidden default variant
 * (manufacturing reads the variant's unit first) and the manufacturing records above.
 * Sales and purchase documents keep the unit they were printed with. Idempotent — only
 * stale copies are written. For a product with real variants only lines without a variant
 * follow the product; a variant line carries that variant's own unit.
 * @returns {Promise<number>} documents changed
 */
const syncProductUnit = async (product, { session } = {}) => {
  const { unit } = product;
  if (!unit) return 0;
  const scope = { organizationId: product.organizationId, branchId: product.branchId };
  const own = product.hasVariants ? { productId: product._id, variantId: null } : { productId: product._id };
  const stale = { ...own, unit: { $ne: unit } };
  const writes = [];

  if (!product.hasVariants) {
    writes.push([models.ProductVariant, { ...stale, isDefault: true }, { $set: { unit } }, {}]);
  }
  UNIT_COPIES.forEach(([name, header, arrays]) => {
    const Model = models[name];
    if (header) writes.push([Model, { ...scope, ...own, [header]: { $ne: unit } }, { $set: { [header]: unit } }, {}]);
    if (!arrays.length) return;
    const $set = {};
    const arrayFilters = [];
    arrays.forEach((path, i) => {
      $set[`${path}.$[l${i}].unit`] = unit;
      arrayFilters.push(Object.fromEntries(Object.entries(stale).map(([key, value]) => [`l${i}.${key}`, value])));
    });
    const filter = { ...scope, $or: arrays.map((path) => ({ [path]: { $elemMatch: stale } })) };
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

module.exports = { syncProductUnit, UNIT_COPIES };
