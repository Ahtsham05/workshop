const mongoose = require('mongoose');
const httpStatus = require('http-status');
const { ProductionOrder, MaterialIssue, ProductionReceipt, ScrapRecord } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { EXECUTABLE_PRODUCTION_STATUSES } = require('../../config/manufacturing');
const settingsService = require('./settings.service');
const stockService = require('./stock.service');
const { roundQty, roundMoney, requireBranch, scopeFilter, escapeRegex, parseDateRange } = require('./common');

const assertExecutable = (order) => {
  if (!EXECUTABLE_PRODUCTION_STATUSES.includes(order.status)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Order ${order.orderNumber} is ${order.status.replace(
        '_',
        ' '
      )} — release it before issuing materials or receiving output`
    );
  }
};

/** Reject obviously-invalid requests before a document number is reserved for them. */
const precheckOrder = async ({ organizationId, branchId }, orderId) => {
  const order = await ProductionOrder.findOne({ _id: orderId, organizationId, branchId })
    .select('orderNumber status')
    .lean();
  if (!order) throw new ApiError(httpStatus.NOT_FOUND, 'Production order not found');
  assertExecutable(order);
};

/** Released → In Production happens automatically on the first issue/receipt. */
const autoStart = (order, createdBy) => {
  if (order.status !== 'released') return;
  order.statusHistory.push({
    from: 'released',
    to: 'in_production',
    note: 'Started by first stock movement',
    by: createdBy,
    at: new Date(),
  });
  order.status = 'in_production';
  if (!order.actualStartDate) order.actualStartDate = new Date();
};

/** Runs `work(session)` in a transaction, then the deferred ledger mirrors after commit. */
const runTransaction = async (work) => {
  const deferred = [];
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      // withTransaction may retry the callback — start each attempt from a clean slate.
      deferred.length = 0;
      result = await work(session, deferred);
    });
  } finally {
    await session.endSession();
  }
  await Promise.all(deferred.map((fn) => fn()));
  return result;
};

/**
 * Issues components from branch stock to a production order. Each line names the order's
 * material line it fulfils; `alternativeProductId` issues one of that line's listed
 * substitutes instead (credited back to the requirement through its ratio).
 */
const issueMaterials = async ({ organizationId, branchId, createdBy }, orderId, body) => {
  requireBranch(branchId);
  await precheckOrder({ organizationId, branchId }, orderId);
  const settings = await settingsService.getSettings(organizationId);
  const issueNumber = await settingsService.nextDocumentNumber(organizationId, 'materialIssue');

  return runTransaction(async (session, deferred) => {
    const order = await ProductionOrder.findOne({ _id: orderId, organizationId, branchId }).session(session);
    if (!order) throw new ApiError(httpStatus.NOT_FOUND, 'Production order not found');
    assertExecutable(order);

    const issueId = new mongoose.Types.ObjectId();
    const lines = [];
    const ledger = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const input of body.lines) {
      const quantity = roundQty(input.quantity);
      if (quantity <= 0) continue; // eslint-disable-line no-continue
      const material = order.materials.id(input.materialLineId);
      if (!material) throw new ApiError(httpStatus.BAD_REQUEST, 'Material line not found on this order');

      let productId = material.productId;
      let variantId = material.variantId;
      let creditedQuantity = quantity;
      let isAlternative = false;
      if (input.alternativeProductId) {
        const alt = material.alternatives.find((a) => String(a.productId) === String(input.alternativeProductId));
        if (!alt)
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `That product is not a listed alternative for "${material.productName}"`
          );
        productId = alt.productId;
        variantId = alt.variantId;
        creditedQuantity = roundQty(quantity / (alt.ratio || 1));
        isAlternative = true;
      }

      // eslint-disable-next-line no-await-in-loop
      const target = await stockService.resolveStockTarget({ organizationId, branchId, productId, variantId, session });
      // eslint-disable-next-line no-await-in-loop
      const balanceAfter = await stockService.applyStockDelta(target, -quantity, {
        allowNegative: settings.allowNegativeStockIssue,
        session,
      });
      const unitCost = roundMoney(target.unitCost);
      const totalCost = roundMoney(unitCost * quantity);

      material.issuedQuantity = roundQty(material.issuedQuantity + creditedQuantity);
      material.issuedCost = roundMoney(material.issuedCost + totalCost);
      lines.push({
        materialLineId: material._id,
        productId,
        variantId: variantId || null,
        productName: stockService.displayName(target),
        unit: material.unit,
        quantity,
        creditedQuantity,
        isAlternative,
        unitCost,
        totalCost,
        balanceAfter,
      });
      ledger.push({ target, delta: -quantity, unitCost, balanceAfter });
    }
    if (lines.length === 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Enter a quantity for at least one material');

    const totalCost = roundMoney(lines.reduce((sum, l) => sum + l.totalCost, 0));
    order.materialCost = roundMoney(order.materialCost + totalCost);
    autoStart(order, createdBy);
    order.updatedBy = createdBy;
    await order.save({ session });

    const [issue] = await MaterialIssue.create(
      [
        {
          _id: issueId,
          organizationId,
          branchId,
          issueNumber,
          productionOrderId: order._id,
          orderNumber: order.orderNumber,
          issueDate: body.issueDate || new Date(),
          lines,
          totalCost,
          notes: body.notes || '',
          createdBy,
        },
      ],
      { session }
    );

    // eslint-disable-next-line no-restricted-syntax
    for (const entry of ledger) {
      // eslint-disable-next-line no-await-in-loop
      const after = await stockService.writeLedger(entry.target, {
        organizationId,
        delta: entry.delta,
        type: 'production_issue',
        refType: 'MaterialIssue',
        refId: issueId,
        unitCost: entry.unitCost,
        balanceAfter: entry.balanceAfter,
        createdBy,
        session,
      });
      if (after) deferred.push(after);
    }
    return issue;
  });
};

/**
 * Receives produced output into branch stock. Unit cost is the order's issued material
 * cost spread over its planned quantity (falls back to the product's cost before any
 * material has been issued) — labour/overhead absorption comes with costing later.
 */
const receiveFinishedGoods = async ({ organizationId, branchId, createdBy }, orderId, body) => {
  requireBranch(branchId);
  const quantity = roundQty(body.quantity);
  if (quantity <= 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Quantity must be greater than zero');
  await precheckOrder({ organizationId, branchId }, orderId);
  const settings = await settingsService.getSettings(organizationId);
  const receiptNumber = await settingsService.nextDocumentNumber(organizationId, 'productionReceipt');

  return runTransaction(async (session, deferred) => {
    const order = await ProductionOrder.findOne({ _id: orderId, organizationId, branchId }).session(session);
    if (!order) throw new ApiError(httpStatus.NOT_FOUND, 'Production order not found');
    assertExecutable(order);

    if (!settings.allowOverProduction && roundQty(order.completedQuantity + quantity) > order.plannedQuantity) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Receiving ${quantity} would exceed the planned ${order.plannedQuantity} (already received ${order.completedQuantity})`
      );
    }

    const target = await stockService.resolveStockTarget({
      organizationId,
      branchId,
      productId: order.productId,
      variantId: order.variantId,
      session,
    });
    const unitCost = roundMoney(order.materialCost > 0 ? order.materialCost / order.plannedQuantity : target.unitCost);
    const totalCost = roundMoney(unitCost * quantity);
    const balanceAfter = await stockService.applyStockDelta(target, quantity, { session });

    order.completedQuantity = roundQty(order.completedQuantity + quantity);
    order.finishedGoodsValue = roundMoney(order.finishedGoodsValue + totalCost);
    autoStart(order, createdBy);
    order.updatedBy = createdBy;
    await order.save({ session });

    const receiptId = new mongoose.Types.ObjectId();
    const [receipt] = await ProductionReceipt.create(
      [
        {
          _id: receiptId,
          organizationId,
          branchId,
          receiptNumber,
          productionOrderId: order._id,
          orderNumber: order.orderNumber,
          productId: order.productId,
          variantId: order.variantId,
          productName: stockService.displayName(target),
          unit: order.unit,
          quantity,
          unitCost,
          totalCost,
          location: body.location ?? order.finishedGoodsLocation,
          receiptDate: body.receiptDate || new Date(),
          balanceAfter,
          notes: body.notes || '',
          createdBy,
        },
      ],
      { session }
    );

    const after = await stockService.writeLedger(target, {
      organizationId,
      delta: quantity,
      type: 'production_receipt',
      refType: 'ProductionReceipt',
      refId: receiptId,
      unitCost,
      balanceAfter,
      createdBy,
      session,
    });
    if (after) deferred.push(after);
    return receipt;
  });
};

/**
 * Records scrap. Material- and WIP-stage scrap is a record of loss only (that stock
 * already left inventory when it was issued); finished-good scrap writes the stock off.
 */
const recordScrap = async ({ organizationId, branchId, createdBy }, body) => {
  requireBranch(branchId);
  const scrapNumber = await settingsService.nextDocumentNumber(organizationId, 'scrap');
  const quantity = roundQty(body.quantity);
  if (quantity <= 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Quantity must be greater than zero');

  return runTransaction(async (session, deferred) => {
    let order = null;
    if (body.productionOrderId) {
      order = await ProductionOrder.findOne({ _id: body.productionOrderId, organizationId, branchId }).session(session);
      if (!order) throw new ApiError(httpStatus.NOT_FOUND, 'Production order not found');
    }
    if ((body.stage === 'material' || body.stage === 'wip') && !order) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Material and WIP scrap must be recorded against a production order');
    }
    if (order && order.status === 'cancelled') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot record scrap on a cancelled order');
    }

    const scrapId = new mongoose.Types.ObjectId();
    let doc = { productId: null, variantId: null, productName: '', unit: undefined, unitCost: 0, affectsStock: false };

    if (body.stage === 'material') {
      const material = order.materials.id(body.materialLineId);
      if (!material) throw new ApiError(httpStatus.BAD_REQUEST, 'Select which material was scrapped');
      if (roundQty(material.scrappedQuantity + quantity) > material.issuedQuantity) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Only ${roundQty(material.issuedQuantity - material.scrappedQuantity)} ${material.unit} of "${
            material.productName
          }" has been issued and not yet scrapped`
        );
      }
      material.scrappedQuantity = roundQty(material.scrappedQuantity + quantity);
      doc = {
        productId: material.productId,
        variantId: material.variantId,
        productName: material.productName,
        unit: material.unit,
        unitCost: material.issuedQuantity > 0 ? roundMoney(material.issuedCost / material.issuedQuantity) : 0,
        affectsStock: false,
        materialLineId: material._id,
      };
    } else if (body.stage === 'wip') {
      order.scrappedQuantity = roundQty(order.scrappedQuantity + quantity);
      doc = {
        productId: order.productId,
        variantId: order.variantId,
        productName: order.productName,
        unit: order.unit,
        unitCost: roundMoney(order.materialCost / order.plannedQuantity),
        affectsStock: false,
      };
    } else {
      const productId = body.productId || (order && order.productId);
      if (!productId) throw new ApiError(httpStatus.BAD_REQUEST, 'Select the product being scrapped');
      const variantId = body.productId ? body.variantId : order && order.variantId;
      const target = await stockService.resolveStockTarget({ organizationId, branchId, productId, variantId, session });
      const balanceAfter = await stockService.applyStockDelta(target, -quantity, { session });
      const unitCost = roundMoney(target.unitCost);
      if (order && String(order.productId) === String(productId)) {
        order.scrappedQuantity = roundQty(order.scrappedQuantity + quantity);
      }
      doc = {
        productId: target.product._id,
        variantId: target.variant ? target.variant._id : null,
        productName: stockService.displayName(target),
        unit: target.product.unit,
        unitCost,
        affectsStock: true,
      };
      const after = await stockService.writeLedger(target, {
        organizationId,
        delta: -quantity,
        type: 'production_scrap',
        refType: 'ScrapRecord',
        refId: scrapId,
        unitCost,
        balanceAfter,
        createdBy,
        session,
      });
      if (after) deferred.push(after);
    }

    if (order) {
      order.updatedBy = createdBy;
      await order.save({ session });
    }

    const [scrap] = await ScrapRecord.create(
      [
        {
          _id: scrapId,
          organizationId,
          branchId,
          scrapNumber,
          productionOrderId: order ? order._id : null,
          orderNumber: order ? order.orderNumber : undefined,
          ...doc,
          stage: body.stage,
          reason: body.reason || 'other',
          quantity,
          totalCost: roundMoney(doc.unitCost * quantity),
          scrapDate: body.scrapDate || new Date(),
          notes: body.notes || '',
          createdBy,
        },
      ],
      { session }
    );
    return scrap;
  });
};

const buildListQuery = (ctx, filter, dateField) => {
  const query = { ...scopeFilter(ctx) };
  if (filter.productionOrderId) query.productionOrderId = filter.productionOrderId;
  if (filter.productId) query.productId = filter.productId;
  if (filter.stage) query.stage = filter.stage;
  Object.assign(query, parseDateRange(filter.dateFrom, filter.dateTo, dateField));
  return query;
};

const queryIssues = async (ctx, filter, options) => {
  const query = buildListQuery(ctx, filter, 'issueDate');
  if (filter.search) {
    const re = new RegExp(escapeRegex(filter.search), 'i');
    query.$or = [{ issueNumber: re }, { orderNumber: re }, { 'lines.productName': re }];
  }
  return MaterialIssue.paginate(query, {
    sortBy: 'createdAt:desc',
    ...options,
    populate: [{ path: 'createdBy', select: 'name email' }],
  });
};

const queryReceipts = async (ctx, filter, options) => {
  const query = buildListQuery(ctx, filter, 'receiptDate');
  if (filter.search) {
    const re = new RegExp(escapeRegex(filter.search), 'i');
    query.$or = [{ receiptNumber: re }, { orderNumber: re }, { productName: re }];
  }
  return ProductionReceipt.paginate(query, {
    sortBy: 'createdAt:desc',
    ...options,
    populate: [{ path: 'createdBy', select: 'name email' }],
  });
};

const queryScrap = async (ctx, filter, options) => {
  const query = buildListQuery(ctx, filter, 'scrapDate');
  if (filter.reason) query.reason = filter.reason;
  if (filter.search) {
    const re = new RegExp(escapeRegex(filter.search), 'i');
    query.$or = [{ scrapNumber: re }, { orderNumber: re }, { productName: re }];
  }
  return ScrapRecord.paginate(query, {
    sortBy: 'createdAt:desc',
    ...options,
    populate: [{ path: 'createdBy', select: 'name email' }],
  });
};

const getIssue = async (ctx, issueId) => {
  const issue = await MaterialIssue.findOne({ _id: issueId, ...scopeFilter(ctx) });
  if (!issue) throw new ApiError(httpStatus.NOT_FOUND, 'Material issue not found');
  return issue;
};

/**
 * Work in progress: every order that has started consuming material but isn't closed.
 * WIP value = material issued minus the material value already received as output.
 */
const getWip = async (ctx) => {
  const orders = await ProductionOrder.find({
    ...scopeFilter(ctx),
    status: { $in: ['released', 'in_production', 'paused'] },
  })
    .select(
      'orderNumber productName sku unit status priority plannedQuantity completedQuantity scrappedQuantity materialCost finishedGoodsValue plannedStartDate plannedCompletionDate actualStartDate wipLocation materials.requiredQuantity materials.issuedQuantity materials.isOptional'
    )
    .sort({ plannedCompletionDate: 1, createdAt: 1 })
    .lean();

  const now = Date.now();
  const rows = orders.map((order) => {
    const required = order.materials.filter((m) => !m.isOptional).reduce((s, m) => s + m.requiredQuantity, 0);
    const issued = order.materials
      .filter((m) => !m.isOptional)
      .reduce((s, m) => s + Math.min(m.issuedQuantity, m.requiredQuantity), 0);
    return {
      id: String(order._id),
      orderNumber: order.orderNumber,
      productName: order.productName,
      sku: order.sku,
      unit: order.unit,
      status: order.status,
      priority: order.priority,
      plannedQuantity: order.plannedQuantity,
      completedQuantity: order.completedQuantity,
      scrappedQuantity: order.scrappedQuantity,
      remainingQuantity: Math.max(0, roundQty(order.plannedQuantity - order.completedQuantity)),
      materialIssuedPercent: required > 0 ? Math.round((issued / required) * 100) : 0,
      outputPercent: Math.round((order.completedQuantity / order.plannedQuantity) * 100),
      materialCost: order.materialCost,
      finishedGoodsValue: order.finishedGoodsValue,
      wipValue: Math.max(0, roundMoney(order.materialCost - order.finishedGoodsValue)),
      wipLocation: order.wipLocation,
      plannedStartDate: order.plannedStartDate,
      plannedCompletionDate: order.plannedCompletionDate,
      actualStartDate: order.actualStartDate,
      isOverdue: !!order.plannedCompletionDate && new Date(order.plannedCompletionDate).getTime() < now,
    };
  });
  return {
    orders: rows,
    totals: {
      orderCount: rows.length,
      wipValue: roundMoney(rows.reduce((s, r) => s + r.wipValue, 0)),
      materialCost: roundMoney(rows.reduce((s, r) => s + r.materialCost, 0)),
      overdueCount: rows.filter((r) => r.isOverdue).length,
    },
  };
};

module.exports = {
  issueMaterials,
  receiveFinishedGoods,
  recordScrap,
  queryIssues,
  queryReceipts,
  queryScrap,
  getIssue,
  getWip,
};
