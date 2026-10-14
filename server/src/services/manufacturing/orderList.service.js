const mongoose = require('mongoose');
const httpStatus = require('http-status');
const { ProductionOrder, ScrapRecord, Product, Branch, User } = require('../../models');
const { OPEN_PRODUCTION_STATUSES, PRODUCTION_STATUSES } = require('../../config/manufacturing');
const ApiError = require('../../utils/ApiError');
const { parseBusinessDateBoundary, getBusinessDayRange } = require('../../utils/businessTimezone');
const productionOrderService = require('./productionOrder.service');
const { roundMoney, roundQty, escapeRegex } = require('./common');

/*
 * The Production Orders workspace: one filter builder shared by the list, the summary
 * cards, the export and the status counts, so every number on the page describes the
 * same set of orders. Every match starts from the caller's organization (and branch when
 * pinned) — a branch filter can only narrow that, never widen it.
 */

const { ObjectId } = mongoose.Types;
const DAY_MS = 24 * 60 * 60 * 1000;
const NOT_STARTED = ['draft', 'planned', 'released'];
const EXPORT_CAP = 5000;
const BULK_CAP = 200;
const BULK_STATUSES = ['planned', 'released', 'paused', 'cancelled'];

const PRIORITY_RANK = { urgent: 4, high: 3, normal: 2, low: 1 };
const STATUS_RANK = Object.fromEntries(PRODUCTION_STATUSES.map((s, i) => [s, i]));

const list = (value) =>
  (Array.isArray(value) ? value : String(value || '').split(',')).map((v) => String(v).trim()).filter(Boolean);
const ids = (value) =>
  list(value)
    .filter((v) => ObjectId.isValid(v))
    .map((v) => new ObjectId(v));
const truthy = (value) => value === true || value === 'true' || value === '1';
const num = (value) => (value === undefined || value === null || value === '' ? null : Number(value));

/** "Delayed": open and behind schedule — past its due date, or due to have started and not yet running. */
const delayedClause = (todayStart) => ({
  status: { $in: OPEN_PRODUCTION_STATUSES },
  $or: [
    { plannedCompletionDate: { $lt: todayStart } },
    { status: { $in: NOT_STARTED }, plannedStartDate: { $lt: todayStart } },
  ],
});
/** "Overdue": open and past its due date. */
const overdueClause = (todayStart) => ({
  status: { $in: OPEN_PRODUCTION_STATUSES },
  plannedCompletionDate: { $lt: todayStart },
});

const dateRange = (from, to) => {
  const range = {};
  const start = from ? parseBusinessDateBoundary(from, false) : null;
  const end = to ? parseBusinessDateBoundary(to, true) : null;
  if (start) range.$gte = start;
  if (end) range.$lte = end;
  return Object.keys(range).length ? range : null;
};

/** Order ids whose open material needs exceed stock right now. */
const shortageOrderIds = async (ctx) => {
  const requirements = await productionOrderService.getAggregatedRequirements(ctx);
  const out = new Set();
  requirements.lines
    .filter((l) => l.shortageQuantity > 0)
    .forEach((l) => (l.orders || []).forEach((o) => out.add(String(o.orderId))));
  return out;
};

/**
 * Build the aggregate `$match` for a filter payload. `omit` drops keys the caller is
 * itself breaking down by (the status counts ignore the status filter).
 */
const buildOrderMatch = async (ctx, filter = {}, { now = new Date(), omit = [] } = {}) => {
  const f = { ...filter };
  omit.forEach((k) => delete f[k]);
  const and = [{ organizationId: new ObjectId(String(ctx.organizationId)) }];
  if (ctx.branchId) and.push({ branchId: new ObjectId(String(ctx.branchId)) });
  const todayStart = getBusinessDayRange(now).start;

  if (f.orderType) and.push({ orderType: f.orderType === 'production' ? { $ne: 'assembly' } : f.orderType });
  if (f.search) {
    const re = new RegExp(escapeRegex(f.search), 'i');
    and.push({ $or: [{ orderNumber: re }, { productName: re }, { sku: re }, { bomNumber: re }] });
  }
  if (f.orderNumber) and.push({ orderNumber: new RegExp(escapeRegex(f.orderNumber), 'i') });
  if (f.product) {
    const re = new RegExp(escapeRegex(f.product), 'i');
    and.push({ $or: [{ productName: re }, { sku: re }] });
  }
  if (list(f.status).length) and.push({ status: { $in: list(f.status) } });
  if (list(f.priority).length) and.push({ priority: { $in: list(f.priority) } });

  // dateFrom/dateTo are the older names for the planned-start range.
  const production = dateRange(f.productionFrom || f.dateFrom, f.productionTo || f.dateTo);
  if (production) and.push({ plannedStartDate: production });
  const due = dateRange(f.dueFrom, f.dueTo);
  if (due) and.push({ plannedCompletionDate: due });
  const completed = dateRange(f.completedFrom, f.completedTo);
  if (completed) and.push({ actualCompletionDate: completed });
  const created = dateRange(f.createdFrom, f.createdTo);
  if (created) and.push({ createdAt: created });

  if (list(f.warehouse).length) {
    and.push({
      $or: [{ sourceLocation: { $in: list(f.warehouse) } }, { finishedGoodsLocation: { $in: list(f.warehouse) } }],
    });
  }
  if (list(f.workCenter).length) and.push({ wipLocation: { $in: list(f.workCenter) } });
  if (ids(f.branchId).length) {
    // Only branches of this organization count; a pinned branch can't be widened.
    const owned = await Branch.find({ _id: { $in: ids(f.branchId) }, organizationId: ctx.organizationId })
      .select('_id')
      .lean();
    and.push({ branchId: { $in: owned.map((b) => b._id) } });
  }
  if (ids(f.bomId).length) and.push({ bomId: { $in: ids(f.bomId) } });
  if (ids(f.productId).length) and.push({ productId: { $in: ids(f.productId) } });
  if (ids(f.parentOrderId).length) and.push({ parentOrderId: { $in: ids(f.parentOrderId) } });
  if (ids(f.operatorId).length) and.push({ operatorId: { $in: ids(f.operatorId) } });
  if (ids(f.createdBy).length) and.push({ createdBy: { $in: ids(f.createdBy) } });
  if (list(f.productType).length) {
    const products = await Product.find({ organizationId: ctx.organizationId, productType: { $in: list(f.productType) } })
      .select('_id')
      .lean();
    and.push({ productId: { $in: products.map((p) => p._id) } });
  }

  const qtyMin = num(f.quantityMin);
  const qtyMax = num(f.quantityMax);
  if (qtyMin !== null || qtyMax !== null) {
    and.push({
      plannedQuantity: { ...(qtyMin !== null ? { $gte: qtyMin } : {}), ...(qtyMax !== null ? { $lte: qtyMax } : {}) },
    });
  }
  const pctMin = num(f.completionMin);
  const pctMax = num(f.completionMax);
  if (pctMin !== null || pctMax !== null) {
    const pct = {
      $cond: [
        { $gt: ['$plannedQuantity', 0] },
        { $multiply: [{ $divide: ['$completedQuantity', '$plannedQuantity'] }, 100] },
        0,
      ],
    };
    const exprs = [];
    if (pctMin !== null) exprs.push({ $gte: [pct, pctMin] });
    if (pctMax !== null) exprs.push({ $lte: [pct, pctMax] });
    and.push({ $expr: exprs.length > 1 ? { $and: exprs } : exprs[0] });
  }

  if (truthy(f.delayed)) and.push(delayedClause(todayStart));
  if (truthy(f.overdue)) and.push(overdueClause(todayStart));
  if (truthy(f.hasQcIssue)) and.push({ $or: [{ rejectedQuantity: { $gt: 0 } }, { qcPendingQuantity: { $gt: 0 } }] });
  if (truthy(f.hasRework)) and.push({ $or: [{ reworkPendingQuantity: { $gt: 0 } }, { reworkedGoodQuantity: { $gt: 0 } }] });
  if (truthy(f.hasScrap)) {
    const scrapped = await ScrapRecord.distinct('productionOrderId', {
      organizationId: ctx.organizationId,
      productionOrderId: { $ne: null },
    });
    and.push({ $or: [{ scrappedQuantity: { $gt: 0 } }, { _id: { $in: scrapped } }] });
  }
  if (truthy(f.hasShortage)) {
    const short = await shortageOrderIds(ctx);
    and.push({ _id: { $in: [...short].map((id) => new ObjectId(id)) } });
  }

  return and.length === 1 ? and[0] : { $and: and };
};

const SORTS = {
  newest: { key: 'createdAt', dir: -1 },
  oldest: { key: 'createdAt', dir: 1 },
  due: { key: 'plannedCompletionDate', dir: 1 },
  quantity: { key: 'plannedQuantity', dir: -1 },
  priority: { key: 'priorityRank', dir: -1 },
  status: { key: 'statusRank', dir: 1 },
  completion: { key: 'completionPct', dir: -1 },
  cost: { key: 'materialCost', dir: -1 },
};

const sortStage = (sort = 'newest', dir) => {
  const spec = SORTS[sort];
  if (!spec) throw new ApiError(httpStatus.BAD_REQUEST, `Unknown sort "${sort}"`);
  let direction = spec.dir;
  if (dir === 'asc') direction = 1;
  if (dir === 'desc') direction = -1;
  // Orders without a due date sort after dated ones whichever way the list runs.
  const stage = {};
  if (spec.key === 'plannedCompletionDate') stage.hasDue = -1;
  stage[spec.key] = direction;
  if (spec.key !== 'createdAt') stage.createdAt = -1;
  stage._id = -1;
  return stage;
};

const derivedFields = {
  completionPct: {
    $cond: [
      { $gt: ['$plannedQuantity', 0] },
      { $multiply: [{ $divide: ['$completedQuantity', '$plannedQuantity'] }, 100] },
      0,
    ],
  },
  priorityRank: {
    $switch: {
      branches: Object.entries(PRIORITY_RANK).map(([k, v]) => ({ case: { $eq: ['$priority', k] }, then: v })),
      default: 0,
    },
  },
  statusRank: {
    $switch: {
      branches: Object.entries(STATUS_RANK).map(([k, v]) => ({ case: { $eq: ['$status', k] }, then: v })),
      default: 99,
    },
  },
  hasDue: { $cond: [{ $ifNull: ['$plannedCompletionDate', false] }, 1, 0] },
};

/** Per-row flags the list shows as badges. */
const decorate = (order, { todayStart, short }) => {
  const open = OPEN_PRODUCTION_STATUSES.includes(order.status);
  const due = order.plannedCompletionDate ? new Date(order.plannedCompletionDate) : null;
  const start = order.plannedStartDate ? new Date(order.plannedStartDate) : null;
  const overdue = open && !!due && due < todayStart;
  const lateStart = open && NOT_STARTED.includes(order.status) && !!start && start < todayStart;
  return {
    ...order,
    completionPercent: order.plannedQuantity > 0 ? Math.round((order.completedQuantity / order.plannedQuantity) * 100) : 0,
    isOverdue: overdue,
    isDelayed: overdue || lateStart,
    // Calendar days: due on the 5th and still open on the 7th is 2 days late.
    daysLate: overdue ? Math.max(1, Math.round((todayStart - getBusinessDayRange(due).start) / DAY_MS)) : 0,
    hasShortage: short.has(String(order.id)),
    hasQcIssue: order.rejectedQuantity > 0 || order.qcPendingQuantity > 0,
    hasRework: order.reworkPendingQuantity > 0 || order.reworkedGoodQuantity > 0,
  };
};

const listOrders = async (ctx, filter = {}, options = {}, now = new Date()) => {
  const limit = Math.min(Math.max(parseInt(options.limit, 10) || 20, 1), 200);
  const page = Math.max(parseInt(options.page, 10) || 1, 1);
  const match = await buildOrderMatch(ctx, filter, { now });
  const [result] = await ProductionOrder.aggregate([
    { $match: match },
    { $addFields: derivedFields },
    {
      $facet: {
        rows: [
          { $sort: sortStage(options.sort, options.dir) },
          { $skip: (page - 1) * limit },
          { $limit: limit },
          { $project: { _id: 1 } },
        ],
        total: [{ $count: 'n' }],
      },
    },
  ]);
  const pageIds = result.rows.map((r) => r._id);
  const totalResults = result.total[0] ? result.total[0].n : 0;
  const docs = await ProductionOrder.find({ _id: { $in: pageIds } });
  const byId = new Map(docs.map((d) => [String(d._id), d.toJSON()]));
  const short = pageIds.length ? await shortageOrderIds(ctx) : new Set();
  const todayStart = getBusinessDayRange(now).start;
  return {
    results: pageIds
      .map((id) => byId.get(String(id)))
      .filter(Boolean)
      .map((o) => decorate(o, { todayStart, short })),
    page,
    limit,
    totalPages: Math.ceil(totalResults / limit),
    totalResults,
  };
};

/** The summary cards and status chips for the current filters (status itself left out). */
const summarizeOrders = async (ctx, filter = {}, now = new Date()) => {
  const match = await buildOrderMatch(ctx, filter, { now, omit: ['status'] });
  const todayStart = getBusinessDayRange(now).start;
  const [result] = await ProductionOrder.aggregate([
    { $match: match },
    {
      $facet: {
        byStatus: [
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
              quantity: { $sum: '$plannedQuantity' },
              cost: { $sum: '$materialCost' },
            },
          },
        ],
        delayed: [{ $match: delayedClause(todayStart) }, { $count: 'n' }],
        overdue: [{ $match: overdueClause(todayStart) }, { $count: 'n' }],
      },
    },
  ]);
  const byStatus = Object.fromEntries(PRODUCTION_STATUSES.map((s) => [s, 0]));
  let quantity = 0;
  let cost = 0;
  result.byStatus.forEach((r) => {
    byStatus[r._id] = r.count;
    quantity += r.quantity;
    cost += r.cost;
  });
  const total = Object.values(byStatus).reduce((s, n) => s + n, 0);
  return {
    total,
    byStatus,
    open: OPEN_PRODUCTION_STATUSES.reduce((s, k) => s + (byStatus[k] || 0), 0),
    inProduction: byStatus.in_production + byStatus.qc_pending,
    paused: byStatus.paused,
    planned: byStatus.planned + byStatus.released,
    completed: byStatus.completed,
    cancelled: byStatus.cancelled,
    delayed: result.delayed[0] ? result.delayed[0].n : 0,
    overdue: result.overdue[0] ? result.overdue[0].n : 0,
    plannedQuantity: roundQty(quantity),
    materialCost: roundMoney(cost),
  };
};

/** Choices for the filter pickers, drawn from this organization's own orders. */
const filterOptions = async (ctx) => {
  const scope = { organizationId: ctx.organizationId, ...(ctx.branchId ? { branchId: ctx.branchId } : {}) };
  const aggScope = {
    organizationId: new ObjectId(String(ctx.organizationId)),
    ...(ctx.branchId ? { branchId: new ObjectId(String(ctx.branchId)) } : {}),
  };
  const [workCenters, sources, finished, operators, creators, boms, branches] = await Promise.all([
    ProductionOrder.distinct('wipLocation', scope),
    ProductionOrder.distinct('sourceLocation', scope),
    ProductionOrder.distinct('finishedGoodsLocation', scope),
    ProductionOrder.aggregate([
      { $match: { ...aggScope, operatorId: { $ne: null } } },
      { $group: { _id: '$operatorId', name: { $first: '$operatorName' } } },
    ]),
    ProductionOrder.distinct('createdBy', scope),
    ProductionOrder.aggregate([
      { $match: { ...aggScope, bomId: { $ne: null } } },
      {
        $group: {
          _id: '$bomId',
          bomNumber: { $first: '$bomNumber' },
          version: { $first: '$bomVersion' },
          productName: { $first: '$productName' },
        },
      },
      { $sort: { bomNumber: 1, version: 1 } },
    ]),
    Branch.find({ organizationId: ctx.organizationId }).select('name').sort({ name: 1 }).lean(),
  ]);
  const users = creators.length
    ? await User.find({ _id: { $in: creators } })
        .select('name email')
        .lean()
    : [];
  const clean = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return {
    workCenters: clean(workCenters),
    warehouses: clean([...sources, ...finished]),
    operators: operators
      .map((o) => ({ id: String(o._id), name: o.name || '—' }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    createdBy: users.map((u) => ({ id: String(u._id), name: u.name || u.email, email: u.email })),
    boms: boms.map((b) => ({ id: String(b._id), label: `${b.bomNumber} v${b.version}`, productName: b.productName })),
    branches: branches.map((b) => ({ id: String(b._id), name: b.name })),
  };
};

/** Every matching order (capped), already sorted, flattened for CSV / PDF. */
const exportOrders = async (ctx, filter = {}, options = {}, now = new Date()) => {
  const page = await listOrders(ctx, filter, { ...options, page: 1, limit: 200 }, now);
  let rows = page.results;
  const pages = Math.min(page.totalPages, Math.ceil(EXPORT_CAP / 200));
  for (let p = 2; p <= pages; p += 1) {
    // eslint-disable-next-line no-await-in-loop
    const next = await listOrders(ctx, filter, { ...options, page: p, limit: 200 }, now);
    rows = rows.concat(next.results);
  }
  const branchNames = new Map(
    (await Branch.find({ organizationId: ctx.organizationId }).select('name').lean()).map((b) => [String(b._id), b.name])
  );
  const creatorIds = [...new Set(rows.map((r) => String(r.createdBy || '')).filter(Boolean))];
  const creators = new Map(
    (creatorIds.length
      ? await User.find({ _id: { $in: creatorIds } })
          .select('name')
          .lean()
      : []
    ).map((u) => [String(u._id), u.name])
  );
  return {
    totalResults: page.totalResults,
    truncated: page.totalResults > rows.length,
    results: rows.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      orderType: o.orderType || 'production',
      productName: o.productName,
      sku: o.sku || '',
      bom: o.bomNumber ? `${o.bomNumber} v${o.bomVersion}` : '',
      status: o.status,
      priority: o.priority,
      plannedQuantity: o.plannedQuantity,
      completedQuantity: o.completedQuantity,
      rejectedQuantity: o.rejectedQuantity,
      unit: o.unit,
      completionPercent: o.completionPercent,
      plannedStartDate: o.plannedStartDate,
      plannedCompletionDate: o.plannedCompletionDate,
      actualCompletionDate: o.actualCompletionDate,
      workCenter: o.wipLocation || '',
      warehouse: o.sourceLocation || '',
      branch: branchNames.get(String(o.branchId)) || '',
      operator: o.operatorName || '',
      createdBy: creators.get(String(o.createdBy || '')) || '',
      materialCost: o.materialCost,
      isDelayed: o.isDelayed,
      isOverdue: o.isOverdue,
      hasShortage: o.hasShortage,
      createdAt: o.createdAt,
    })),
  };
};

/**
 * Apply one change to many orders through the normal single-order rules (so a closed
 * order still refuses edits). Each order succeeds or fails on its own.
 */
const bulkUpdate = async (
  ctx,
  { orderIds = [], priority, operatorId, plannedStartDate, plannedCompletionDate, status, note }
) => {
  const unique = [...new Set(orderIds.map(String))];
  if (!unique.length) throw new ApiError(httpStatus.BAD_REQUEST, 'Select at least one order');
  if (unique.length > BULK_CAP) throw new ApiError(httpStatus.BAD_REQUEST, `At most ${BULK_CAP} orders at a time`);
  if (status && !BULK_STATUSES.includes(status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Bulk status changes support: ${BULK_STATUSES.join(', ')}`);
  }
  const fields = {};
  if (priority) fields.priority = priority;
  if (operatorId !== undefined) fields.operatorId = operatorId;
  if (plannedStartDate !== undefined) fields.plannedStartDate = plannedStartDate;
  if (plannedCompletionDate !== undefined) fields.plannedCompletionDate = plannedCompletionDate;
  if (!Object.keys(fields).length && !status) throw new ApiError(httpStatus.BAD_REQUEST, 'Nothing to change');

  const updated = [];
  const failed = [];
  // Sequential on purpose: each order goes through the single-order rules in turn.
  // eslint-disable-next-line no-restricted-syntax
  for (const id of unique) {
    try {
      let order = null;
      // eslint-disable-next-line no-await-in-loop
      if (Object.keys(fields).length) order = await productionOrderService.updateOrder(ctx, id, fields);
      // eslint-disable-next-line no-await-in-loop
      if (status) order = await productionOrderService.changeStatus(ctx, id, { status, note });
      updated.push(order);
    } catch (err) {
      // eslint-disable-next-line no-await-in-loop
      const found = await ProductionOrder.findOne({
        _id: ObjectId.isValid(id) ? id : null,
        organizationId: ctx.organizationId,
      })
        .select('orderNumber')
        .lean();
      failed.push({ id, orderNumber: found ? found.orderNumber : id, message: err.message });
    }
  }
  return { updated, failed };
};

module.exports = {
  buildOrderMatch,
  listOrders,
  summarizeOrders,
  filterOptions,
  exportOrders,
  bulkUpdate,
  SORTS,
  BULK_STATUSES,
};
