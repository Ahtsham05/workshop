const mongoose = require('mongoose');
const httpStatus = require('http-status');
const {
  Product,
  Bom,
  ProductionOrder,
  ProductVariant,
  Inventory,
  Batch,
  Supplier,
  InventoryTransaction,
  PackSize,
} = require('../../models');
const { toBusinessCalendarDate } = require('../../utils/businessTimezone');
const ApiError = require('../../utils/ApiError');
const { PRODUCT_TYPES } = require('../../config/manufacturing');
const bomService = require('./bom.service');

// Lazy: product.service pulls in a large dependency graph (and manufacturing through it).
// eslint-disable-next-line global-require
const productService = () => require('../product.service');
// eslint-disable-next-line global-require
const stockService = () => require('./stock.service');
const { requireBranch, scopeFilter, aggregateScope, escapeRegex, startOfBusinessToday, daysUntil } = require('./common');

const PRODUCT_FIELDS =
  'name nameUrdu sku barcode unit cost price stockQuantity hasVariants isActive image categories productType procurementType defaultBomId manufacturingLeadTimeDays shelfLifeDays trackImei trackSerial branchId createdAt';

const bomCountsFor = async (ctx, productIds) => {
  if (!productIds.length) return new Map();
  const rows = await Bom.aggregate([
    {
      $match: {
        ...aggregateScope(ctx),
        productId: { $in: productIds.map((id) => new mongoose.Types.ObjectId(String(id))) },
      },
    },
    { $group: { _id: '$productId', total: { $sum: 1 }, active: { $sum: { $cond: ['$isActive', 1, 0] } } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), { total: r.total, active: r.active }]));
};

const oid = (v) => new mongoose.Types.ObjectId(String(v));

/**
 * Batch / expiry tracking per product (flags live on its variants, the simple product's
 * hidden default one included) and its live batches: how many hold stock, the nearest
 * expiry and how much has already expired.
 */
const trackingFor = async (productIds) => {
  if (!productIds.length) return new Map();
  const ids = productIds.map(oid);
  const [flags, inventories, trackedVariants] = await Promise.all([
    ProductVariant.aggregate([
      { $match: { productId: { $in: ids } } },
      { $group: { _id: '$productId', trackBatch: { $max: '$trackBatch' }, trackExpiry: { $max: '$trackExpiry' } } },
    ]),
    Inventory.find({ productId: { $in: ids } })
      .select('_id productId variantId quantity')
      .lean(),
    ProductVariant.find({ productId: { $in: ids }, $or: [{ trackBatch: true }, { trackExpiry: true }] })
      .select('_id')
      .lean(),
  ]);
  const tracked = new Set(trackedVariants.map((v) => String(v._id)));
  const productOfInventory = new Map(inventories.map((i) => [String(i._id), String(i.productId)]));
  const now = new Date(startOfBusinessToday());
  const lots = inventories.length
    ? await Batch.aggregate([
        { $match: { inventoryId: { $in: inventories.map((i) => i._id) }, quantity: { $gt: 0 }, status: 'active' } },
        {
          $group: {
            _id: '$inventoryId',
            count: { $sum: 1 },
            quantity: { $sum: '$quantity' },
            nearestExpiry: { $min: '$expiryDate' },
            expiredQuantity: {
              $sum: { $cond: [{ $and: [{ $ne: ['$expiryDate', null] }, { $lt: ['$expiryDate', now] }] }, '$quantity', 0] },
            },
          },
        },
      ])
    : [];
  const out = new Map();
  flags.forEach((f) => {
    out.set(String(f._id), {
      trackBatch: !!f.trackBatch,
      trackExpiry: !!f.trackExpiry,
      batchCount: 0,
      nearestExpiry: null,
      expiredQuantity: 0,
      unbatchedQuantity: 0,
    });
  });
  // Stock a tracked variant holds that no batch accounts for — it can't be issued or sold
  // by batch until it is put into one (batchUnbatchedStock).
  const batchedByInventory = new Map(lots.map((l) => [String(l._id), l.quantity]));
  inventories.forEach((inv) => {
    if (!tracked.has(String(inv.variantId))) return;
    const gap = (Number(inv.quantity) || 0) - (batchedByInventory.get(String(inv._id)) || 0);
    const t = out.get(String(inv.productId));
    if (t && gap > 1e-9) t.unbatchedQuantity = Math.round((t.unbatchedQuantity + gap) * 1000) / 1000;
  });
  lots.forEach((l) => {
    const pid = productOfInventory.get(String(l._id));
    const t = out.get(pid) || {
      trackBatch: false,
      trackExpiry: false,
      batchCount: 0,
      nearestExpiry: null,
      expiredQuantity: 0,
      unbatchedQuantity: 0,
    };
    t.unbatchedQuantity = t.unbatchedQuantity || 0;
    t.batchCount += l.count;
    if (l.nearestExpiry && (!t.nearestExpiry || l.nearestExpiry < t.nearestExpiry)) t.nearestExpiry = l.nearestExpiry;
    t.expiredQuantity = Math.round((t.expiredQuantity + l.expiredQuantity) * 1000) / 1000;
    out.set(pid, t);
  });
  return out;
};

/** Products in scope whose variants track batches / expiry. */
const trackedProductIds = async (ctx) =>
  ProductVariant.distinct('productId', {
    organizationId: ctx.organizationId,
    ...(ctx.branchId ? { branchId: ctx.branchId } : {}),
    $or: [{ trackBatch: true }, { trackExpiry: true }],
  });

/**
 * Packing roles (packing.service.js): a "pack product" (1 KG Pack, 20 KG Bag …) is made by
 * packing a bulk product, never by its own BOM; a "bulk product" has pack sizes.
 */
const packRoles = async (ctx) => {
  const scope = { organizationId: ctx.organizationId, ...(ctx.branchId ? { branchId: ctx.branchId } : {}) };
  const [packIds, bulkIds] = await Promise.all([
    PackSize.distinct('packProductId', scope),
    PackSize.distinct('productId', scope),
  ]);
  return { packIds, bulkIds };
};

/** Resolves the async parts of a filter (batch tracking, packing roles) into plain query values. */
const resolveFilter = async (ctx, filter = {}) => {
  let resolved = filter;
  if (filter.tracking === 'batch' || filter.tracking === 'none') {
    resolved = { ...resolved, trackedIds: await trackedProductIds(ctx) };
  }
  if (filter.packRole) resolved = { ...resolved, packRoleIds: await packRoles(ctx) };
  return resolved;
};

/**
 * The existing product catalog seen through manufacturing eyes — same Product documents,
 * filtered/annotated by productType and BOM coverage. Never a separate product list.
 */
/** One filter for the list and its summary, so both always describe the same products. */
const buildProductQuery = (ctx, filter = {}) => {
  const query = { ...scopeFilter(ctx) };
  if (filter.productType === 'unclassified') query.productType = null;
  else if (filter.productType) {
    // A list may include 'unclassified' (no type yet), e.g. "everything except finished goods".
    query.productType = {
      $in: String(filter.productType)
        .split(',')
        .map((v) => (v === 'unclassified' ? null : v)),
    };
  } else if (filter.classifiedOnly === true || filter.classifiedOnly === 'true') query.productType = { $ne: null };
  if (filter.hasBom === true || filter.hasBom === 'true') query.defaultBomId = { $ne: null };
  if (filter.hasBom === false || filter.hasBom === 'false') query.defaultBomId = null;
  if (filter.procurementType) query.procurementType = filter.procurementType === 'none' ? null : filter.procurementType;
  if (filter.stock === 'out') query.stockQuantity = { $lte: 0 };
  if (filter.stock === 'in') query.stockQuantity = { $gt: 0 };
  if (filter.search) {
    const re = new RegExp(escapeRegex(filter.search), 'i');
    query.$or = [{ name: re }, { sku: re }, { barcode: re }];
  }
  if (filter.trackedIds) query._id = filter.tracking === 'batch' ? { $in: filter.trackedIds } : { $nin: filter.trackedIds };
  // packRole 'make': what a BOM / production order makes — pack products are left out.
  // 'pack': what a pack size is stocked as — pack products, or goods with no BOM that are
  // not themselves packed. 'packs': pack products only.
  if (filter.packRoleIds) {
    const { packIds, bulkIds } = filter.packRoleIds;
    const and = query.$and || [];
    if (filter.packRole === 'make') and.push({ _id: { $nin: packIds } });
    if (filter.packRole === 'packs') and.push({ _id: { $in: packIds } });
    if (filter.packRole === 'pack') {
      and.push({ $or: [{ _id: { $in: packIds } }, { defaultBomId: null, _id: { $nin: bulkIds } }] });
    }
    if (and.length) query.$and = and;
  }
  return query;
};

const SORTS = {
  name: { name: 1 },
  newest: { createdAt: -1, _id: -1 },
  stock: { stockQuantity: -1, name: 1 },
  stockLow: { stockQuantity: 1, name: 1 },
  cost: { cost: -1, name: 1 },
};

const queryProducts = async (ctx, rawFilter, options) => {
  const filter = await resolveFilter(ctx, rawFilter);
  const query = buildProductQuery(ctx, filter);
  const limit = Math.min(parseInt(options.limit, 10) || 20, 100);
  const page = Math.max(parseInt(options.page, 10) || 1, 1);
  const [results, totalResults] = await Promise.all([
    Product.find(query)
      .select(PRODUCT_FIELDS)
      .sort(SORTS[filter.sort] || SORTS.name)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Product.countDocuments(query),
  ]);
  const ids = results.map((p) => p._id);
  const [counts, tracking, packOf, sizesOf] = await Promise.all([
    bomCountsFor(ctx, ids),
    trackingFor(ids),
    PackSize.find({ packProductId: { $in: ids } })
      .select('packProductId productId name contentQuantity contentUnit')
      .populate('productId', 'name')
      .lean(),
    PackSize.aggregate([{ $match: { productId: { $in: ids } } }, { $group: { _id: '$productId', n: { $sum: 1 } } }]),
  ]);
  const packByProduct = new Map(packOf.map((s) => [String(s.packProductId), s]));
  const sizeCount = new Map(sizesOf.map((r) => [String(r._id), r.n]));
  return {
    results: results.map(({ _id, ...product }) => ({
      ...product,
      id: String(_id),
      bomCount: (counts.get(String(_id)) || {}).total || 0,
      activeBomCount: (counts.get(String(_id)) || {}).active || 0,
      // Packing: this product is a pack of a bulk product, or has pack sizes of its own.
      packOf: packByProduct.get(String(_id))
        ? {
            productId: String((packByProduct.get(String(_id)).productId || {})._id || ''),
            productName: (packByProduct.get(String(_id)).productId || {}).name || '',
            sizeName: packByProduct.get(String(_id)).name,
            contentQuantity: packByProduct.get(String(_id)).contentQuantity,
            contentUnit: packByProduct.get(String(_id)).contentUnit,
          }
        : null,
      packSizeCount: sizeCount.get(String(_id)) || 0,
      tracking: tracking.get(String(_id)) || {
        trackBatch: false,
        trackExpiry: false,
        batchCount: 0,
        nearestExpiry: null,
        expiredQuantity: 0,
        unbatchedQuantity: 0,
      },
    })),
    page,
    limit,
    totalPages: Math.ceil(totalResults / limit),
    totalResults,
  };
};

/** Count of products per productType in scope (incl. unclassified). */
const getTypeSummary = async (ctx) => {
  const rows = await Product.aggregate([
    { $match: { ...aggregateScope(ctx) } },
    { $group: { _id: '$productType', count: { $sum: 1 } } },
  ]);
  const summary = Object.fromEntries(PRODUCT_TYPES.map((t) => [t, 0]));
  summary.unclassified = 0;
  rows.forEach((r) => {
    if (r._id && summary[r._id] !== undefined) summary[r._id] = r.count;
    else summary.unclassified += r.count;
  });
  return summary;
};

/**
 * Turns batch / expiry tracking on or off through the catalog's own path (the hidden
 * default variant), so purchases, sales, issues and receipts all follow it. Stock already
 * on hand becomes one opening batch the first time tracking is turned on.
 */
const setTracking = async (product, body) => {
  if (product.trackImei || product.trackSerial) {
    throw new ApiError(httpStatus.BAD_REQUEST, `"${product.name}" is tracked by serial number — batches don't apply`);
  }
  if (product.hasVariants) {
    throw new ApiError(httpStatus.BAD_REQUEST, `"${product.name}" has variants — turn batch tracking on per variant`);
  }
  const flags = {};
  if (body.trackBatch !== undefined) flags.trackBatch = !!body.trackBatch;
  if (body.trackExpiry !== undefined) flags.trackExpiry = !!body.trackExpiry;
  // Turning tracking off with live batches would hide their stock from batch-aware screens.
  if (!flags.trackBatch && !flags.trackExpiry) {
    const tracked = (await trackingFor([product._id])).get(String(product._id));
    const stillOn = { ...tracked, ...flags };
    if (!stillOn.trackBatch && !stillOn.trackExpiry && tracked && tracked.batchCount > 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `"${product.name}" still has stock in ${tracked.batchCount} batch(es) — use or adjust it before turning tracking off`
      );
    }
  }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(() =>
      productService().syncDefaultVariantTracking(
        product,
        { ...flags, batchNumber: body.openingBatchNumber || undefined },
        session
      )
    );
  } finally {
    await session.endSession();
  }
};

const updateAttributes = async ({ organizationId, branchId }, productId, body) => {
  requireBranch(branchId);
  const product = await Product.findOne({ _id: productId, organizationId, branchId });
  if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found in this branch');

  const $set = {};
  ['productType', 'procurementType', 'manufacturingLeadTimeDays', 'shelfLifeDays'].forEach((field) => {
    if (body[field] !== undefined) $set[field] = body[field];
  });
  if (Object.keys($set).length) await Product.updateOne({ _id: product._id }, { $set });
  if (body.trackBatch !== undefined || body.trackExpiry !== undefined) await setTracking(product, body);

  if (body.defaultBomId !== undefined) {
    if (body.defaultBomId) {
      const bom = await bomService.findBomOrThrow({ organizationId, branchId }, body.defaultBomId);
      if (String(bom.productId) !== String(product._id)) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'That BOM belongs to a different product');
      }
      await bomService.setDefaultBom({ organizationId, branchId }, bom._id);
    } else {
      await Bom.updateMany({ organizationId, branchId, productId: product._id }, { $set: { isDefault: false } });
      await Product.updateOne({ _id: product._id }, { $set: { defaultBomId: null } });
    }
  }
  return Product.findById(product._id).select(PRODUCT_FIELDS);
};

/**
 * Puts the stock a batch-tracked product holds outside any batch into one batch, so it
 * can be issued and sold by batch again. Only a Batch document is written (plus a
 * zero-quantity ledger line for the audit trail) — the stock total doesn't change.
 */
const batchUnbatchedStock = async (ctx, productId, body = {}) => {
  requireBranch(ctx.branchId);
  const item = await stockService().resolveItem({
    organizationId: ctx.organizationId,
    branchId: ctx.branchId,
    productId,
    variantId: body.variantId || null,
  });
  if (!item.batchTracked || !item.inventory) {
    throw new ApiError(httpStatus.BAD_REQUEST, `"${item.name}" is not tracked by batch`);
  }
  const batched = await Batch.aggregate([
    { $match: { inventoryId: item.inventory._id, status: 'active' } },
    { $group: { _id: null, quantity: { $sum: '$quantity' } } },
  ]);
  const gap = Math.round(((Number(item.inventory.quantity) || 0) - ((batched[0] && batched[0].quantity) || 0)) * 1e6) / 1e6;
  if (!(gap > 1e-9)) throw new ApiError(httpStatus.BAD_REQUEST, `All stock of "${item.name}" is already in batches`);

  const base = String(body.batchNumber || '').trim() || `OPENING-${toBusinessCalendarDate(new Date()).replace(/-/g, '')}`;
  let batchNumber = base;
  // eslint-disable-next-line no-await-in-loop
  for (let i = 2; await Batch.exists({ inventoryId: item.inventory._id, batchNumber }); i += 1) {
    if (body.batchNumber) throw new ApiError(httpStatus.BAD_REQUEST, `Batch ${base} already exists for "${item.name}"`);
    batchNumber = `${base}-${i}`;
  }
  const batch = await Batch.create({
    organizationId: ctx.organizationId,
    inventoryId: item.inventory._id,
    batchNumber,
    quantity: gap,
    costPerUnit: item.unitCost || 0,
    expiryDate: body.expiryDate || undefined,
    status: 'active',
  });
  await InventoryTransaction.create({
    organizationId: ctx.organizationId,
    branchId: ctx.branchId,
    inventoryId: item.inventory._id,
    variantId: item.variant ? item.variant._id : undefined,
    productId: item.product._id,
    type: 'adjustment',
    quantityDelta: 0,
    balanceAfter: item.inventory.quantity,
    unitCost: item.unitCost || 0,
    refType: 'Batch',
    refId: batch._id,
    batchId: batch._id,
    createdBy: ctx.createdBy,
  });
  return {
    id: String(batch._id),
    batchNumber: batch.batchNumber,
    quantity: gap,
    expiryDate: batch.expiryDate || null,
    costPerUnit: batch.costPerUnit,
  };
};

/** Batch tracking for several products at once — each one on its own (one bad product doesn't block the rest). */
const bulkTracking = async ({ organizationId, branchId }, { productIds, trackBatch, trackExpiry }) => {
  requireBranch(branchId);
  const products = await Product.find({ _id: { $in: productIds }, organizationId, branchId });
  const failed = [];
  let updated = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (const product of products) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await setTracking(product, { trackBatch, trackExpiry });
      updated += 1;
    } catch (err) {
      failed.push({ id: String(product._id), name: product.name, message: err.message });
    }
  }
  return { updated, failed };
};

const bulkClassify = async ({ organizationId, branchId }, { productIds, productType, procurementType }) => {
  requireBranch(branchId);
  const $set = { productType };
  if (procurementType !== undefined) $set.procurementType = procurementType;
  const result = await Product.updateMany({ _id: { $in: productIds }, organizationId, branchId }, { $set });
  return { matched: result.matchedCount, modified: result.modifiedCount };
};

/**
 * Sub-assemblies: products classified as sub_assembly (or any product whose default BOM is
 * consumed inside another BOM), with their default BOM and where-used count.
 */
const getAssemblies = async (ctx) => {
  const usedAsComponent = await Bom.distinct('components.productId', { ...scopeFilter(ctx), isActive: true });
  const products = await Product.find({
    ...scopeFilter(ctx),
    $or: [{ productType: 'sub_assembly' }, { _id: { $in: usedAsComponent }, defaultBomId: { $ne: null } }],
  })
    .select(PRODUCT_FIELDS)
    .sort({ name: 1 })
    .lean();
  const ids = products.map((p) => p._id);
  const defaultBomIds = products.map((p) => p.defaultBomId).filter(Boolean);
  const [defaultBoms, parentBoms] = await Promise.all([
    Bom.find({ _id: { $in: defaultBomIds } })
      .select('bomNumber version quantity unit components.productId isLocked')
      .lean(),
    Bom.find({ ...scopeFilter(ctx), 'components.productId': { $in: ids } })
      .select('bomNumber version productName isActive components.productId')
      .lean(),
  ]);
  const bomById = new Map(defaultBoms.map((b) => [String(b._id), b]));
  return products.map(({ _id, ...product }) => {
    const bom = product.defaultBomId ? bomById.get(String(product.defaultBomId)) : null;
    const usedIn = parentBoms
      .filter((b) => b.components.some((c) => String(c.productId) === String(_id)))
      .map((b) => ({
        id: String(b._id),
        bomNumber: b.bomNumber,
        version: b.version,
        productName: b.productName,
        isActive: b.isActive,
      }));
    return {
      ...product,
      id: String(_id),
      defaultBom: bom
        ? {
            id: String(bom._id),
            bomNumber: bom.bomNumber,
            version: bom.version,
            quantity: bom.quantity,
            unit: bom.unit,
            componentCount: bom.components.length,
            isLocked: bom.isLocked,
          }
        : null,
      usedIn,
    };
  });
};

/** Summary chips for the current filter: products, units on hand, stock value, avg cost. */
const getProductStats = async (ctx, rawFilter) => {
  const filter = await resolveFilter(ctx, rawFilter);
  // aggregate() doesn't cast like find(): swap in the ObjectId scope.
  const match = { ...buildProductQuery(ctx, filter), ...aggregateScope(ctx) };
  const [row] = await Product.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        products: { $sum: 1 },
        stockQuantity: { $sum: { $max: [{ $ifNull: ['$stockQuantity', 0] }, 0] } },
        stockValue: {
          $sum: { $multiply: [{ $max: [{ $ifNull: ['$stockQuantity', 0] }, 0] }, { $ifNull: ['$cost', 0] }] },
        },
        avgCost: { $avg: { $ifNull: ['$cost', 0] } },
        outOfStock: { $sum: { $cond: [{ $lte: [{ $ifNull: ['$stockQuantity', 0] }, 0] }, 1, 0] } },
        withBom: { $sum: { $cond: [{ $ifNull: ['$defaultBomId', false] }, 1, 0] } },
      },
    },
  ]);
  const r = row || {};
  const round = (n) => Math.round((n || 0) * 100) / 100;
  return {
    products: r.products || 0,
    stockQuantity: round(r.stockQuantity),
    stockValue: round(r.stockValue),
    avgCost: round(r.avgCost),
    outOfStock: r.outOfStock || 0,
    withBom: r.withBom || 0,
  };
};

const OPEN_ORDER_STATUSES = ['draft', 'planned', 'released', 'in_production', 'paused', 'qc_pending'];

/**
 * A product's batches, FEFO order (soonest expiry first, then oldest): stock left, cost,
 * dates, and where each came from — the production order that made it or the supplier.
 */
const sourceOf = (b, order, supplier) => {
  if (order) return { kind: 'production', id: String(order._id), label: order.orderNumber };
  if (supplier || b.purchaseId) {
    return {
      kind: 'purchase',
      id: b.purchaseId ? String(b.purchaseId) : null,
      label: supplier ? supplier.name : 'Purchase',
    };
  }
  return { kind: /^OPENING/i.test(b.batchNumber) ? 'opening' : 'other', id: null, label: '' };
};

const productBatches = async (productId, { includeEmpty = false, limit = 100 } = {}) => {
  const inventories = await Inventory.find({ productId }).select('_id').lean();
  if (!inventories.length) return [];
  const batches = await Batch.find({
    inventoryId: { $in: inventories.map((i) => i._id) },
    ...(includeEmpty ? {} : { quantity: { $gt: 0 } }),
  })
    .select(
      'batchNumber quantity costPerUnit manufactureDate expiryDate status productionOrderId supplierId purchaseId createdAt'
    )
    .lean();
  batches.sort(
    (a, b) =>
      (a.expiryDate ? a.expiryDate.getTime() : Infinity) - (b.expiryDate ? b.expiryDate.getTime() : Infinity) ||
      a.createdAt - b.createdAt
  );
  const shown = batches.slice(0, limit);
  const [orders, suppliers] = await Promise.all([
    ProductionOrder.find({ _id: { $in: shown.map((b) => b.productionOrderId).filter(Boolean) } })
      .select('orderNumber')
      .lean(),
    Supplier.find({ _id: { $in: shown.map((b) => b.supplierId).filter(Boolean) } })
      .select('name')
      .lean(),
  ]);
  const orderById = new Map(orders.map((o) => [String(o._id), o]));
  const supplierById = new Map(suppliers.map((x) => [String(x._id), x]));
  const today = startOfBusinessToday();
  return shown.map((b) => {
    const order = b.productionOrderId && orderById.get(String(b.productionOrderId));
    const supplier = b.supplierId && supplierById.get(String(b.supplierId));
    return {
      id: String(b._id),
      batchNumber: b.batchNumber,
      quantity: Math.round(b.quantity * 1000) / 1000,
      costPerUnit: b.costPerUnit || 0,
      value: Math.round(b.quantity * (b.costPerUnit || 0) * 100) / 100,
      manufactureDate: b.manufactureDate || null,
      expiryDate: b.expiryDate || null,
      daysToExpiry: daysUntil(b.expiryDate, today),
      status: b.status,
      source: sourceOf(b, order, supplier),
    };
  });
};

/**
 * The manufacturing side of one product for its details page: classification, BOM
 * versions, where it's used, orders that make it and open orders that consume it, and
 * how much of it is sitting in WIP.
 */
const getProductOverview = async (ctx, productId) => {
  const product = await Product.findOne({ _id: productId, ...scopeFilter(ctx) })
    .select(PRODUCT_FIELDS)
    .lean();
  if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
  const scope = scopeFilter(ctx);
  const [boms, makingOrders, consumingOrders, whereUsed] = await Promise.all([
    Bom.find({ ...scope, productId: product._id })
      .select(
        'bomNumber version name isActive isDefault isLocked quantity unit components.productId operations.name updatedAt'
      )
      .sort({ bomNumber: 1, version: -1 })
      .lean(),
    ProductionOrder.find({ ...scope, productId: product._id })
      .select(
        'orderNumber orderType status priority plannedQuantity producedQuantity completedQuantity unit plannedCompletionDate createdAt'
      )
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
    ProductionOrder.find({ ...scope, status: { $in: OPEN_ORDER_STATUSES }, 'materials.productId': product._id })
      .select('orderNumber orderType status productName plannedCompletionDate materials wipLots')
      .sort({ plannedCompletionDate: 1 })
      .limit(20)
      .lean(),
    bomService.whereUsed(ctx, product._id),
  ]);

  const id = String(product._id);
  const consuming = consumingOrders.map((o) => {
    const lines = o.materials.filter((m) => String(m.productId) === id);
    const required = lines.reduce((s, m) => s + (m.requiredQuantity || 0), 0);
    const issued = lines.reduce((s, m) => s + (m.issuedQuantity || 0) - (m.returnedQuantity || 0), 0);
    const inWip = (o.wipLots || []).filter((l) => String(l.productId) === id).reduce((s, l) => s + (l.quantity || 0), 0);
    return {
      id: String(o._id),
      orderNumber: o.orderNumber,
      orderType: o.orderType || 'production',
      status: o.status,
      productName: o.productName,
      plannedCompletionDate: o.plannedCompletionDate,
      required: Math.round(required * 1000) / 1000,
      issued: Math.round(issued * 1000) / 1000,
      inWip: Math.round(inWip * 1000) / 1000,
    };
  });
  const making = makingOrders.map(({ _id, ...o }) => ({ id: String(_id), ...o, orderType: o.orderType || 'production' }));
  const [tracking, batches] = await Promise.all([trackingFor([product._id]), productBatches(product._id)]);
  return {
    product: { ...product, id, _id: undefined },
    tracking: tracking.get(id) || {
      trackBatch: false,
      trackExpiry: false,
      batchCount: 0,
      nearestExpiry: null,
      expiredQuantity: 0,
      unbatchedQuantity: 0,
    },
    batches,
    boms: boms.map(({ _id, components, operations, ...b }) => ({
      id: String(_id),
      ...b,
      componentCount: (components || []).length,
      operationCount: (operations || []).length,
    })),
    whereUsed,
    making,
    consuming,
    totals: {
      inProduction: making
        .filter((o) => OPEN_ORDER_STATUSES.includes(o.status))
        .reduce((s, o) => s + Math.max(0, (o.plannedQuantity || 0) - (o.completedQuantity || 0)), 0),
      requiredByOpenOrders: consuming.reduce((s, o) => s + Math.max(0, o.required - o.issued), 0),
      inWip: consuming.reduce((s, o) => s + o.inWip, 0),
    },
  };
};

module.exports = {
  queryProducts,
  getTypeSummary,
  updateAttributes,
  bulkClassify,
  getAssemblies,
  getProductStats,
  getProductOverview,
  bulkTracking,
  batchUnbatchedStock,
  productBatches,
  trackingFor,
};
