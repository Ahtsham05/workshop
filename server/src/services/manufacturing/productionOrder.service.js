const httpStatus = require('http-status');
const { ProductionOrder, Product, ProductVariant, Bom, User } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { transitionsFor, EDITABLE_PRODUCTION_STATUSES, OPEN_PRODUCTION_STATUSES } = require('../../config/manufacturing');
const settingsService = require('./settings.service');
const bomService = require('./bom.service');
const stockService = require('./stock.service');
const executionService = require('./execution.service');
const wip = require('./wip');
const { roundQty, requireBranch, scopeFilter, aggregateScope, escapeRegex, parseDateRange } = require('./common');

const findOrderOrThrow = async ({ organizationId, branchId }, orderId) => {
  const order = await ProductionOrder.findOne({ _id: orderId, ...scopeFilter({ organizationId, branchId }) });
  if (!order) throw new ApiError(httpStatus.NOT_FOUND, 'Production order not found');
  return order;
};

const kindLabel = (order) => (order.orderType === 'assembly' ? 'assembly order' : 'production order');

/** The operator must be a user of the same organization. */
const resolveOperator = async (organizationId, operatorId) => {
  if (!operatorId) return { operatorId: null, operatorName: '' };
  const user = await User.findOne({ _id: operatorId, organizationId }).select('name').lean();
  if (!user) throw new ApiError(httpStatus.BAD_REQUEST, 'Operator not found in this organization');
  return { operatorId: user._id, operatorName: user.name || '' };
};

/** A parent (for nested assemblies) must be an order of the same org + branch. */
const resolveParent = async ({ organizationId, branchId }, parentOrderId, parentMaterialLineId) => {
  if (!parentOrderId) return { parentOrderId: null, parentMaterialLineId: null };
  const parent = await ProductionOrder.findOne({ _id: parentOrderId, organizationId, branchId })
    .select('materials._id')
    .lean();
  if (!parent) throw new ApiError(httpStatus.BAD_REQUEST, 'Parent order not found in this branch');
  if (parentMaterialLineId && !parent.materials.some((m) => String(m._id) === String(parentMaterialLineId))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Parent material line not found');
  }
  return { parentOrderId: parent._id, parentMaterialLineId: parentMaterialLineId || null };
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

  const orderType = body.orderType === 'assembly' ? 'assembly' : 'production';
  // Assembly orders have no "planned" stage — they go draft → released.
  const status = body.status === 'planned' && orderType === 'production' ? 'planned' : 'draft';
  const operator = await resolveOperator(organizationId, body.operatorId);
  const parent = await resolveParent({ organizationId, branchId }, body.parentOrderId, body.parentMaterialLineId);
  const orderNumber = await settingsService.nextDocumentNumber(
    organizationId,
    orderType === 'assembly' ? 'assemblyOrder' : 'productionOrder'
  );

  return ProductionOrder.create({
    organizationId,
    branchId,
    orderNumber,
    orderType,
    ...operator,
    ...parent,
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
    // Only the demo-data seeder sets this (the API validation doesn't accept it).
    isDemo: body.isDemo === true,
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
  if (filter.orderType) query.orderType = filter.orderType === 'production' ? { $ne: 'assembly' } : filter.orderType;
  if (filter.parentOrderId) query.parentOrderId = filter.parentOrderId;
  if (filter.operatorId) query.operatorId = filter.operatorId;
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

/**
 * Order counts per status for the list's filter chips, under the same order type and
 * search as the list itself (status and overdue are what the chips choose, so they are
 * not applied here). `overdue` counts open orders past their planned completion.
 */
const countOrdersByStatus = async (ctx, filter = {}) => {
  const extra = {};
  if (filter.orderType) extra.orderType = filter.orderType === 'production' ? { $ne: 'assembly' } : filter.orderType;
  if (filter.search) {
    const re = new RegExp(escapeRegex(filter.search), 'i');
    extra.$or = [{ orderNumber: re }, { productName: re }, { sku: re }, { bomNumber: re }];
  }
  const [rows, overdue] = await Promise.all([
    ProductionOrder.aggregate([
      { $match: { ...aggregateScope(ctx), ...extra } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    ProductionOrder.countDocuments({
      ...scopeFilter(ctx),
      ...extra,
      status: { $in: OPEN_PRODUCTION_STATUSES },
      plannedCompletionDate: { $lt: new Date() },
    }),
  ]);
  const byStatus = Object.fromEntries(rows.map((r) => [r._id, r.count]));
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const open = OPEN_PRODUCTION_STATUSES.reduce((sum, st) => sum + (byStatus[st] || 0), 0);
  return { byStatus, total, open, overdue };
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
    throw new ApiError(httpStatus.BAD_REQUEST, `A ${order.status} ${kindLabel(order)} can no longer be edited`);
  }
  if (body.operatorId !== undefined) Object.assign(order, await resolveOperator(organizationId, body.operatorId));
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
  if (!(transitionsFor(order.orderType)[from] || []).includes(to)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Cannot move a ${kindLabel(order)} from ${from} to ${to}`);
  }
  // Completion settles WIP / QC / rework, so it runs as one stock transaction.
  if (to === 'completed') {
    return executionService.completeOrder({ organizationId, branchId, createdBy }, orderId, { wipDisposition, note });
  }
  if (order.orderType === 'assembly') {
    // Starting an assembly moves its components into WIP (one transaction).
    if (from === 'released' && to === 'in_production') {
      return executionService.startAssembly({ organizationId, branchId, createdBy }, orderId, { note });
    }
    if (to === 'qc_pending') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Use “Complete assembly” — it reports the output and sends it to QC');
    }
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

// ── Nested assemblies ───────────────────────────────────────────────────────────────

const OPEN_CHILD_STATUSES = ['draft', 'planned', 'released', 'in_production', 'paused', 'qc_pending'];
const MAX_NESTING = 10;

/**
 * Creates linked assembly orders for an order's sub-assembly components — any material
 * line whose product has an active default BOM. Quantity = what the parent still needs,
 * less stock on hand and less what open child orders already cover ('shortage'), or the
 * full remaining requirement ('full'). With `recursive`, each new assembly order gets its
 * own sub-assembly orders the same way (Product A → Assembly B → Assembly C).
 */
const createSubAssemblyOrders = async (
  ctx,
  orderId,
  { recursive = false, materialLineIds, basis = 'shortage', operatorId } = {},
  depth = 1
) => {
  requireBranch(ctx.branchId);
  if (depth > MAX_NESTING) throw new ApiError(httpStatus.BAD_REQUEST, `Assemblies nest deeper than ${MAX_NESTING} levels`);
  const order = await findOrderOrThrow(ctx, orderId);
  if (['completed', 'cancelled'].includes(order.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `The ${kindLabel(order)} is ${order.status}`);
  }
  const lines = order.materials.filter((m) => !materialLineIds || materialLineIds.map(String).includes(String(m._id)));
  if (!lines.length) return [];

  const products = await Product.find({ _id: { $in: lines.map((m) => m.productId) }, organizationId: ctx.organizationId })
    .select('name defaultBomId')
    .lean();
  const bomIds = products.map((p) => p.defaultBomId).filter(Boolean);
  const activeBoms = new Set(
    (
      await Bom.find({ _id: { $in: bomIds }, isActive: true })
        .select('_id')
        .lean()
    ).map((b) => String(b._id))
  );
  const productById = new Map(products.map((p) => [String(p._id), p]));
  const availability = await stockService.getAvailability({
    organizationId: ctx.organizationId,
    branchId: order.branchId,
    items: lines.map((m) => ({ productId: m.productId, variantId: m.variantId })),
  });
  const openChildren = await ProductionOrder.find({ parentOrderId: order._id, status: { $in: OPEN_CHILD_STATUSES } })
    .select('parentMaterialLineId plannedQuantity completedQuantity')
    .lean();

  const created = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const m of lines) {
    const product = productById.get(String(m.productId));
    if (!product || !product.defaultBomId || !activeBoms.has(String(product.defaultBomId))) continue; // eslint-disable-line no-continue
    const need = wip.lineRemaining(m);
    const covered = openChildren
      .filter((c) => String(c.parentMaterialLineId) === String(m._id))
      .reduce((sum, c) => sum + Math.max(0, c.plannedQuantity - c.completedQuantity), 0);
    const onHand = Math.max(0, availability.get(`${m.productId}:${m.variantId || ''}`) || 0);
    const quantity = roundQty(basis === 'full' ? need - covered : need - onHand - covered);
    if (quantity <= 0) continue; // eslint-disable-line no-continue
    // eslint-disable-next-line no-await-in-loop
    const child = await createOrder(ctx, {
      orderType: 'assembly',
      productId: m.productId,
      variantId: m.variantId,
      bomId: product.defaultBomId,
      plannedQuantity: quantity,
      parentOrderId: order._id,
      parentMaterialLineId: m._id,
      plannedCompletionDate: order.plannedStartDate || null,
      priority: order.priority,
      operatorId,
      notes: `Sub-assembly for ${order.orderNumber}`,
      // Children of demo orders are demo data too, so the demo cleanup removes them.
      isDemo: order.isDemo === true,
    });
    created.push({ order: child, depth });
    if (recursive) {
      // eslint-disable-next-line no-await-in-loop
      const nested = await createSubAssemblyOrders(ctx, child._id, { recursive, basis, operatorId }, depth + 1);
      created.push(...nested);
    }
  }
  return created;
};

const treeNode = (o) => ({
  id: String(o._id),
  orderNumber: o.orderNumber,
  orderType: o.orderType || 'production',
  productId: String(o.productId),
  productName: o.productName,
  unit: o.unit,
  plannedQuantity: o.plannedQuantity,
  producedQuantity: o.producedQuantity || 0,
  completedQuantity: o.completedQuantity || 0,
  status: o.status,
  operatorName: o.operatorName || '',
  parentMaterialLineId: o.parentMaterialLineId ? String(o.parentMaterialLineId) : null,
});

/** The order's place in its assembly hierarchy: ancestors up to the top, and every descendant. */
const getOrderTree = async (ctx, orderId) => {
  const order = await findOrderOrThrow(ctx, orderId);
  const fields =
    'orderNumber orderType productId productName unit plannedQuantity producedQuantity completedQuantity status operatorName parentOrderId parentMaterialLineId';
  const ancestors = [];
  let cursor = order.parentOrderId;
  while (cursor && ancestors.length < MAX_NESTING) {
    // eslint-disable-next-line no-await-in-loop
    const parent = await ProductionOrder.findOne({ _id: cursor, organizationId: ctx.organizationId }).select(fields).lean();
    if (!parent) break;
    ancestors.unshift(treeNode(parent));
    cursor = parent.parentOrderId;
  }
  const children = async (id, depth) => {
    if (depth > MAX_NESTING) return [];
    const rows = await ProductionOrder.find({ parentOrderId: id, organizationId: ctx.organizationId })
      .select(fields)
      .sort({ createdAt: 1 })
      .lean();
    return Promise.all(rows.map(async (r) => ({ ...treeNode(r), children: await children(r._id, depth + 1) })));
  };
  return { ancestors, order: { ...treeNode(order), children: await children(order._id, 1) } };
};

module.exports = {
  countOrdersByStatus,
  createSubAssemblyOrders,
  getOrderTree,
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
