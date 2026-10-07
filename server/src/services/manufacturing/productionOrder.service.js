const httpStatus = require('http-status');
const { ProductionOrder, Product, ProductVariant, Bom } = require('../../models');
const ApiError = require('../../utils/ApiError');
const {
  PRODUCTION_STATUS_TRANSITIONS,
  EDITABLE_PRODUCTION_STATUSES,
  OPEN_PRODUCTION_STATUSES,
} = require('../../config/manufacturing');
const settingsService = require('./settings.service');
const bomService = require('./bom.service');
const stockService = require('./stock.service');
const executionService = require('./execution.service');
const wip = require('./wip');
const { roundQty, requireBranch, scopeFilter, escapeRegex, parseDateRange } = require('./common');

const findOrderOrThrow = async ({ organizationId, branchId }, orderId) => {
  const order = await ProductionOrder.findOne({ _id: orderId, ...scopeFilter({ organizationId, branchId }) });
  if (!order) throw new ApiError(httpStatus.NOT_FOUND, 'Production order not found');
  return order;
};

/** Resolves which BOM version an order uses and checks it actually builds the product. */
const resolveBom = async ({ organizationId, branchId, product, variantId, bomId, settings }) => {
  const effectiveBomId = bomId || product.defaultBomId;
  if (!effectiveBomId) {
    if (settings.requireBomForProduction) {
      throw new ApiError(httpStatus.BAD_REQUEST, `"${product.name}" has no BOM — create one, or pick a BOM for this order`);
    }
    return null;
  }
  const bom = await Bom.findOne({ _id: effectiveBomId, organizationId, branchId });
  if (!bom) throw new ApiError(httpStatus.NOT_FOUND, 'BOM not found in this branch');
  if (String(bom.productId) !== String(product._id)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'The selected BOM does not build this product');
  }
  if (bom.variantId && variantId && String(bom.variantId) !== String(variantId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'The selected BOM is for a different variant of this product');
  }
  if (!bom.isActive) throw new ApiError(httpStatus.BAD_REQUEST, `BOM ${bom.bomNumber} v${bom.version} is inactive`);
  return bom;
};

const snapshotMaterials = async ({ organizationId, branchId, bom, quantity, settings }) => {
  if (!bom) return [];
  const { lines } = await bomService.explodeBom({ organizationId, branchId }, bom._id, quantity, {
    explode: !!settings.explodeSubAssemblies,
  });
  return lines.map((line) => ({
    ...line,
    issuedQuantity: 0,
    issuedCost: 0,
    returnedQuantity: 0,
    consumedQuantity: 0,
    consumedCost: 0,
    scrappedQuantity: 0,
  }));
};

const loadProduct = async ({ organizationId, branchId, productId, variantId }) => {
  const product = await Product.findOne({ _id: productId, organizationId, branchId }).select(
    'name sku unit hasVariants defaultBomId productType'
  );
  if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found in this branch');
  if (product.productType === 'service') throw new ApiError(httpStatus.BAD_REQUEST, 'Service products cannot be produced');
  let variant = null;
  if (variantId) {
    variant = await ProductVariant.findOne({ _id: variantId, productId, organizationId }).select('sku isDefault');
    if (!variant) throw new ApiError(httpStatus.NOT_FOUND, 'Variant not found for this product');
  }
  return { product, variant };
};

const createOrder = async ({ organizationId, branchId, createdBy }, body) => {
  requireBranch(branchId);
  const settings = await settingsService.getSettings(organizationId);
  const { product, variant } = await loadProduct({
    organizationId,
    branchId,
    productId: body.productId,
    variantId: body.variantId,
  });
  const bom = await resolveBom({
    organizationId,
    branchId,
    product,
    variantId: body.variantId,
    bomId: body.bomId,
    settings,
  });
  const plannedQuantity = roundQty(body.plannedQuantity);
  const materials = await snapshotMaterials({ organizationId, branchId, bom, quantity: plannedQuantity, settings });

  const status = body.status === 'planned' ? 'planned' : 'draft';
  const orderNumber = await settingsService.nextDocumentNumber(organizationId, 'productionOrder');

  return ProductionOrder.create({
    organizationId,
    branchId,
    orderNumber,
    productId: product._id,
    variantId: variant ? variant._id : null,
    productName: product.name,
    sku: (variant && variant.sku) || product.sku || '',
    unit: product.unit,
    bomId: bom ? bom._id : null,
    bomNumber: bom ? bom.bomNumber : undefined,
    bomVersion: bom ? bom.version : undefined,
    plannedQuantity,
    plannedStartDate: body.plannedStartDate || null,
    plannedCompletionDate: body.plannedCompletionDate || null,
    sourceLocation: body.sourceLocation ?? settings.defaultSourceLocation,
    wipLocation: body.wipLocation ?? settings.defaultWipLocation,
    finishedGoodsLocation: body.finishedGoodsLocation ?? settings.defaultFinishedGoodsLocation,
    status,
    priority: body.priority || settings.defaultPriority || 'normal',
    notes: body.notes || '',
    materials,
    statusHistory: [{ from: null, to: status, by: createdBy, at: new Date(), note: 'Created' }],
    createdBy,
    updatedBy: createdBy,
  });
};

const queryOrders = async ({ organizationId, branchId }, filter, options) => {
  const query = { ...scopeFilter({ organizationId, branchId }) };
  if (filter.status) {
    const statuses = String(filter.status).split(',').filter(Boolean);
    query.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
  }
  if (filter.priority) query.priority = filter.priority;
  if (filter.productId) query.productId = filter.productId;
  if (filter.bomId) query.bomId = filter.bomId;
  if (filter.overdue === true || filter.overdue === 'true') {
    query.plannedCompletionDate = { $lt: new Date() };
    if (!filter.status) query.status = { $in: OPEN_PRODUCTION_STATUSES };
  }
  Object.assign(query, parseDateRange(filter.dateFrom, filter.dateTo, 'plannedStartDate'));
  if (filter.search) {
    const re = new RegExp(escapeRegex(filter.search), 'i');
    query.$or = [{ orderNumber: re }, { productName: re }, { sku: re }, { bomNumber: re }];
  }
  return ProductionOrder.paginate(query, { sortBy: 'createdAt:desc', ...options });
};

const getOrder = async (ctx, orderId) => findOrderOrThrow(ctx, orderId);

const HEADER_FIELDS = [
  'plannedStartDate',
  'plannedCompletionDate',
  'sourceLocation',
  'wipLocation',
  'finishedGoodsLocation',
  'priority',
  'notes',
];

const updateOrder = async ({ organizationId, branchId, createdBy }, orderId, body) => {
  requireBranch(branchId);
  const order = await findOrderOrThrow({ organizationId, branchId }, orderId);

  // Dates, priority, locations and notes stay editable until the order is closed; the
  // recipe (product/BOM/quantity) only while it's still draft/planned.
  if (['completed', 'cancelled'].includes(order.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `A ${order.status} production order can no longer be edited`);
  }
  const recipeChanged =
    (body.productId && String(body.productId) !== String(order.productId)) ||
    (body.variantId !== undefined && String(body.variantId || '') !== String(order.variantId || '')) ||
    (body.bomId !== undefined && String(body.bomId || '') !== String(order.bomId || '')) ||
    (body.plannedQuantity !== undefined && roundQty(body.plannedQuantity) !== order.plannedQuantity);

  if (recipeChanged) {
    if (!EDITABLE_PRODUCTION_STATUSES.includes(order.status)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Product, BOM and quantity can only change while the order is Draft or Planned'
      );
    }
    const settings = await settingsService.getSettings(organizationId);
    const productId = body.productId || order.productId;
    const variantId = body.variantId !== undefined ? body.variantId || null : order.variantId;
    const { product, variant } = await loadProduct({ organizationId, branchId, productId, variantId });
    const productChanged = String(productId) !== String(order.productId);
    const bomId = body.bomId !== undefined ? body.bomId : productChanged ? null : order.bomId;
    const bom = await resolveBom({ organizationId, branchId, product, variantId, bomId, settings });
    const plannedQuantity = body.plannedQuantity !== undefined ? roundQty(body.plannedQuantity) : order.plannedQuantity;

    order.productId = product._id;
    order.variantId = variant ? variant._id : null;
    order.productName = product.name;
    order.sku = (variant && variant.sku) || product.sku || '';
    order.unit = product.unit;
    order.bomId = bom ? bom._id : null;
    order.bomNumber = bom ? bom.bomNumber : undefined;
    order.bomVersion = bom ? bom.version : undefined;
    order.plannedQuantity = plannedQuantity;
    order.materials = await snapshotMaterials({ organizationId, branchId, bom, quantity: plannedQuantity, settings });
  }

  HEADER_FIELDS.forEach((field) => {
    if (body[field] !== undefined) order[field] = body[field];
  });
  order.updatedBy = createdBy;
  await order.save();
  return order;
};

/** Re-snapshots materials from the order's current BOM (e.g. after the BOM was edited). */
const refreshMaterials = async ({ organizationId, branchId, createdBy }, orderId) => {
  requireBranch(branchId);
  const order = await findOrderOrThrow({ organizationId, branchId }, orderId);
  if (!EDITABLE_PRODUCTION_STATUSES.includes(order.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Materials can only be refreshed while the order is Draft or Planned');
  }
  const settings = await settingsService.getSettings(organizationId);
  const bom = order.bomId ? await Bom.findOne({ _id: order.bomId, organizationId, branchId }) : null;
  order.materials = await snapshotMaterials({ organizationId, branchId, bom, quantity: order.plannedQuantity, settings });
  order.updatedBy = createdBy;
  await order.save();
  return order;
};

const hasExecution = (order) =>
  (order.materials || []).some((m) => m.issuedQuantity > 0) ||
  order.completedQuantity > 0 ||
  order.producedQuantity > 0 ||
  (order.wipLots || []).length > 0;

/**
 * Moves an order through its lifecycle (see PRODUCTION_STATUS_TRANSITIONS). The write is
 * conditional on the status read here, so two people clicking different actions at once
 * can't both win.
 */
const changeStatus = async ({ organizationId, branchId, createdBy }, orderId, { status: to, note, wipDisposition }) => {
  requireBranch(branchId);
  const order = await findOrderOrThrow({ organizationId, branchId }, orderId);
  const from = order.status;
  if (from === to) return order;
  if (!(PRODUCTION_STATUS_TRANSITIONS[from] || []).includes(to)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Cannot move a production order from ${from} to ${to}`);
  }
  // Completion settles WIP / QC / rework, so it runs as one stock transaction.
  if (to === 'completed') {
    return executionService.completeOrder({ organizationId, branchId, createdBy }, orderId, { wipDisposition, note });
  }

  if ((to === 'cancelled' || (from === 'released' && to === 'planned')) && hasExecution(order)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Materials have already been issued or output received against this order — it can only be paused or completed now'
    );
  }
  if (to === 'released' && !order.bomId) {
    const settings = await settingsService.getSettings(organizationId);
    if (settings.requireBomForProduction) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Assign a BOM before releasing this order');
    }
  }

  const $set = { status: to, updatedBy: createdBy };
  if (to === 'in_production' && !order.actualStartDate) $set.actualStartDate = new Date();

  const updated = await ProductionOrder.findOneAndUpdate(
    { _id: order._id, organizationId, status: from },
    { $set, $push: { statusHistory: { from, to, note: note || '', by: createdBy, at: new Date() } } },
    { new: true }
  );
  if (!updated) throw new ApiError(httpStatus.CONFLICT, 'This order was changed by someone else — refresh and try again');

  // Lock the BOM version once production is committed to it, so later edits go into a
  // new version instead of silently changing what this order was released against.
  if (to === 'released' && updated.bomId) {
    await Bom.updateOne({ _id: updated.bomId, organizationId }, { $set: { isLocked: true } });
  }
  return updated;
};

const deleteOrder = async ({ organizationId, branchId }, orderId) => {
  requireBranch(branchId);
  const order = await findOrderOrThrow({ organizationId, branchId }, orderId);
  if (!['draft', 'planned', 'cancelled'].includes(order.status) || hasExecution(order)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Only draft, planned or cancelled orders with no stock movements can be deleted'
    );
  }
  await order.deleteOne();
};

/** One order's material requirements against current on-hand stock. */
const getOrderRequirements = async ({ organizationId, branchId }, orderId) => {
  const order = await findOrderOrThrow({ organizationId, branchId }, orderId);
  const availability = await stockService.getAvailability({
    organizationId,
    branchId: order.branchId,
    items: order.materials.map((m) => ({ productId: m.productId, variantId: m.variantId })),
  });
  const lines = order.materials.map((m) => {
    const available = availability.get(`${m.productId}:${m.variantId || ''}`) || 0;
    const outstanding = wip.lineRemaining(m);
    return {
      materialLineId: String(m._id),
      productId: String(m.productId),
      variantId: m.variantId ? String(m.variantId) : null,
      productName: m.productName,
      sku: m.sku,
      unit: m.unit,
      level: m.level,
      isOptional: m.isOptional,
      requiredQuantity: m.requiredQuantity,
      issuedQuantity: m.issuedQuantity,
      returnedQuantity: m.returnedQuantity,
      consumedQuantity: m.consumedQuantity,
      scrappedQuantity: m.scrappedQuantity,
      wipQuantity: wip.lineWip(order, m),
      outstandingQuantity: outstanding,
      availableQuantity: roundQty(available),
      shortageQuantity: m.isOptional ? 0 : Math.max(0, roundQty(outstanding - Math.max(0, available))),
      alternatives: m.alternatives,
    };
  });
  return {
    orderId: String(order._id),
    orderNumber: order.orderNumber,
    status: order.status,
    lines,
    shortageCount: lines.filter((l) => l.shortageQuantity > 0).length,
  };
};

/**
 * Outstanding material needs of every open (planned → paused) order in the branch,
 * summed per material and compared with on-hand stock. A requirements view only — no
 * netting against incoming purchases or scheduling (that's MRP, a later phase).
 */
const getAggregatedRequirements = async ({ organizationId, branchId }, { statuses } = {}) => {
  const openStatuses = statuses && statuses.length ? statuses : ['planned', 'released', 'in_production', 'paused'];
  const orders = await ProductionOrder.find({ ...scopeFilter({ organizationId, branchId }), status: { $in: openStatuses } })
    .select('orderNumber branchId status materials plannedStartDate')
    .lean();

  const byKey = new Map();
  orders.forEach((order) => {
    order.materials.forEach((m) => {
      if (m.isOptional) return;
      const outstanding = wip.lineRemaining(m);
      if (outstanding <= 0) return;
      const key = `${order.branchId}|${m.productId}:${m.variantId || ''}`;
      const entry = byKey.get(key) || {
        branchId: String(order.branchId),
        productId: String(m.productId),
        variantId: m.variantId ? String(m.variantId) : null,
        productName: m.productName,
        sku: m.sku,
        unit: m.unit,
        requiredQuantity: 0,
        orders: [],
      };
      entry.requiredQuantity = roundQty(entry.requiredQuantity + outstanding);
      entry.orders.push({
        orderId: String(order._id),
        orderNumber: order.orderNumber,
        status: order.status,
        quantity: outstanding,
      });
      byKey.set(key, entry);
    });
  });

  const entries = [...byKey.values()];
  const byBranch = new Map();
  entries.forEach((e) => byBranch.set(e.branchId, [...(byBranch.get(e.branchId) || []), e]));
  await Promise.all(
    [...byBranch.entries()].map(async ([entryBranchId, list]) => {
      const availability = await stockService.getAvailability({ organizationId, branchId: entryBranchId, items: list });
      list.forEach((e) => {
        e.availableQuantity = roundQty(availability.get(`${e.productId}:${e.variantId || ''}`) || 0);
        e.shortageQuantity = Math.max(0, roundQty(e.requiredQuantity - Math.max(0, e.availableQuantity)));
      });
    })
  );

  entries.sort((a, b) => b.shortageQuantity - a.shortageQuantity || a.productName.localeCompare(b.productName));
  return {
    orderCount: orders.length,
    materialCount: entries.length,
    shortageCount: entries.filter((e) => e.shortageQuantity > 0).length,
    lines: entries,
  };
};

module.exports = {
  createOrder,
  queryOrders,
  getOrder,
  updateOrder,
  refreshMaterials,
  changeStatus,
  deleteOrder,
  getOrderRequirements,
  getAggregatedRequirements,
  findOrderOrThrow,
};
