const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { ProductionOrder } = require('../../models');
const ApiError = require('../../utils/ApiError');
const settingsService = require('./settings.service');
const stockService = require('./stock.service');
const productionOrderService = require('./productionOrder.service');
const wip = require('./wip');
const { roundQty, requireBranch, RowErrors } = require('./common');

/**
 * Several production orders from one invoice-style entry: one row per product, with the
 * header's dates / priority / operator / team / locations / notes as defaults a row may
 * override. Each row becomes its own order (own number, BOM snapshot, routing).
 *
 *   checkBatch  — read-only: every row's problems at once (ROW_ERRORS shape) plus a
 *                 material preview per row: what it needs and what would be short, with
 *                 the rows above it and the open orders already holding stock.
 *   createBatch — re-checks, then creates every order in ONE transaction (numbers too):
 *                 all or nothing.
 */

const MAX_LINES = 100;

const HEADER_DEFAULTS = [
  'plannedStartDate',
  'plannedCompletionDate',
  'priority',
  'operatorId',
  'teamMemberIds',
  'sourceLocation',
  'wipLocation',
  'finishedGoodsLocation',
  'notes',
  'status',
];

/** A row's order body: the header's defaults, overridden by what the row sets. */
const rowBody = (header, line) => {
  const body = {};
  HEADER_DEFAULTS.forEach((key) => {
    if (header[key] !== undefined && header[key] !== '' && header[key] !== null) body[key] = header[key];
  });
  ['productId', 'variantId', 'bomId', 'plannedQuantity', 'batchNumber'].forEach((key) => {
    if (line[key] !== undefined && line[key] !== '') body[key] = line[key];
  });
  ['priority', 'plannedStartDate', 'plannedCompletionDate'].forEach((key) => {
    if (line[key]) body[key] = line[key];
  });
  if (line.notes) body.notes = [header.notes, line.notes].filter(Boolean).join('\n');
  return body;
};

/** Which grid cell an order-building error belongs to. */
const fieldFor = (message) => {
  if (/BOM/i.test(message)) return 'bomId';
  if (/quantity/i.test(message)) return 'plannedQuantity';
  if (/date/i.test(message)) return 'plannedCompletionDate';
  if (/operator|team|user/i.test(message)) return 'product';
  return 'product';
};

const materialKey = (m) => `${m.productId}:${m.variantId || ''}`;

const checkBatch = async (ctx, body) => {
  requireBranch(ctx.branchId);
  const lines = body.lines || [];
  if (!lines.length) throw new ApiError(httpStatus.BAD_REQUEST, 'Add at least one product');
  if (lines.length > MAX_LINES) throw new ApiError(httpStatus.BAD_REQUEST, `At most ${MAX_LINES} orders at once`);
  const header = body.header || {};
  const settings = await settingsService.getSettings(ctx.organizationId);
  const errors = new RowErrors();
  const docs = [];

  // eslint-disable-next-line no-restricted-syntax
  for (const [index, line] of lines.entries()) {
    try {
      // eslint-disable-next-line no-await-in-loop
      docs.push(await productionOrderService.buildOrderDoc(ctx, rowBody(header, line), settings));
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      errors.add(index + 1, fieldFor(err.message), err.message);
      docs.push(null);
    }
  }

  // Material preview: free stock = on hand − what open orders still need, then taken
  // row by row (a row competes with the rows above it).
  const keys = new Map();
  docs.forEach((doc) =>
    (doc ? doc.materials : []).forEach((m) => keys.set(materialKey(m), { productId: m.productId, variantId: m.variantId }))
  );
  const [onHand, openOrders] = await Promise.all([
    keys.size
      ? stockService.getAvailability({
          organizationId: ctx.organizationId,
          branchId: ctx.branchId,
          items: [...keys.values()],
        })
      : new Map(),
    keys.size
      ? ProductionOrder.find({
          organizationId: ctx.organizationId,
          branchId: ctx.branchId,
          status: { $in: productionOrderService.RESERVING_STATUSES },
          'materials.productId': { $in: [...new Set([...keys.values()].map((k) => String(k.productId)))] },
        })
          .select('materials')
          .lean()
      : [],
  ]);
  const held = new Map();
  openOrders.forEach((o) =>
    o.materials.forEach((m) => {
      if (m.isOptional) return;
      const key = materialKey(m);
      if (!keys.has(key)) return;
      held.set(key, roundQty((held.get(key) || 0) + wip.lineRemaining(m)));
    })
  );
  const free = new Map();
  keys.forEach((_, key) => free.set(key, Math.max(0, roundQty((onHand.get(key) || 0) - (held.get(key) || 0)))));

  const previews = docs.map((doc, index) => {
    if (!doc) return { line: index + 1, components: 0, shortages: [] };
    const shortages = [];
    doc.materials.forEach((m) => {
      if (m.isOptional) return;
      const key = materialKey(m);
      const left = free.get(key) || 0;
      if (m.requiredQuantity > left + 1e-9) {
        shortages.push({
          productName: m.productName,
          unit: m.unit,
          required: m.requiredQuantity,
          available: left,
          short: roundQty(m.requiredQuantity - left),
          onHand: roundQty(onHand.get(key) || 0),
          heldByOpenOrders: held.get(key) || 0,
        });
      }
      free.set(key, Math.max(0, roundQty(left - m.requiredQuantity)));
    });
    return {
      line: index + 1,
      components: doc.materials.length,
      bomNumber: doc.bomNumber ? `${doc.bomNumber} v${doc.bomVersion}` : null,
      steps: doc.operations.length,
      shortages,
    };
  });

  return { rows: errors.rows, lines: previews, docs };
};

const runTransaction = async (work) => {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await work(session);
    });
  } finally {
    await session.endSession();
  }
  return result;
};

const createBatch = async (ctx, body) => {
  const check = await checkBatch(ctx, body);
  if (check.rows.length) {
    const first = check.rows[0];
    const err = new ApiError(httpStatus.BAD_REQUEST, `Some rows need attention: ${first.message} (row ${first.line})`);
    err.errorCode = 'ROW_ERRORS';
    err.details = { rows: check.rows, lines: check.lines };
    throw err;
  }
  return runTransaction(async (session) => {
    const created = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const doc of check.docs) {
      // eslint-disable-next-line no-await-in-loop
      const numbers = await productionOrderService.assignNumbers(ctx, doc, { session });
      // eslint-disable-next-line no-await-in-loop
      const [order] = await ProductionOrder.create([{ ...doc, ...numbers }], { session });
      created.push(order);
    }
    return created;
  });
};

module.exports = { checkBatch, createBatch, rowBody, MAX_LINES };
