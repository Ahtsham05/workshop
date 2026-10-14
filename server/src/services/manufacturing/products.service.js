const mongoose = require('mongoose');
const httpStatus = require('http-status');
const { Product, Bom, ProductionOrder } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { PRODUCT_TYPES } = require('../../config/manufacturing');
const bomService = require('./bom.service');
const { requireBranch, scopeFilter, aggregateScope, escapeRegex } = require('./common');

const PRODUCT_FIELDS =
  'name nameUrdu sku barcode unit cost price stockQuantity hasVariants isActive image categories productType procurementType defaultBomId manufacturingLeadTimeDays branchId createdAt';

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
    query.productType = { $in: String(filter.productType).split(',').map((v) => (v === 'unclassified' ? null : v)) };
  }
  else if (filter.classifiedOnly === true || filter.classifiedOnly === 'true') query.productType = { $ne: null };
  if (filter.hasBom === true || filter.hasBom === 'true') query.defaultBomId = { $ne: null };
  if (filter.hasBom === false || filter.hasBom === 'false') query.defaultBomId = null;
  if (filter.procurementType) query.procurementType = filter.procurementType === 'none' ? null : filter.procurementType;
  if (filter.stock === 'out') query.stockQuantity = { $lte: 0 };
  if (filter.stock === 'in') query.stockQuantity = { $gt: 0 };
  if (filter.search) {
    const re = new RegExp(escapeRegex(filter.search), 'i');
    query.$or = [{ name: re }, { sku: re }, { barcode: re }];
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

const queryProducts = async (ctx, filter, options) => {
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
  const counts = await bomCountsFor(
    ctx,
    results.map((p) => p._id)
  );
  return {
    results: results.map(({ _id, ...product }) => ({
      ...product,
      id: String(_id),
      bomCount: (counts.get(String(_id)) || {}).total || 0,
      activeBomCount: (counts.get(String(_id)) || {}).active || 0,
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

const updateAttributes = async ({ organizationId, branchId }, productId, body) => {
  requireBranch(branchId);
  const product = await Product.findOne({ _id: productId, organizationId, branchId });
  if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found in this branch');

  const $set = {};
  ['productType', 'procurementType', 'manufacturingLeadTimeDays'].forEach((field) => {
    if (body[field] !== undefined) $set[field] = body[field];
  });
  if (Object.keys($set).length) await Product.updateOne({ _id: product._id }, { $set });

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
const getProductStats = async (ctx, filter) => {
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
  return {
    product: { ...product, id, _id: undefined },
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
};
