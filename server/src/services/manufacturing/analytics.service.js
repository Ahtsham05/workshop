const httpStatus = require('http-status');
const { ProductionOrder, ProductionReceipt, ProductionOutput, ScrapRecord } = require('../../models');
const { PRODUCTION_STATUSES, OPEN_PRODUCTION_STATUSES } = require('../../config/manufacturing');
const ApiError = require('../../utils/ApiError');
const {
  BUSINESS_TZ,
  toBusinessCalendarDate,
  startOfBusinessDay,
  eachBusinessCalendarDate,
} = require('../../utils/businessTimezone');
const { shiftCalendarDate } = require('../../utils/dashboardDateRange');
const productionOrderService = require('./productionOrder.service');
const { roundMoney, roundQty, scopeFilter, aggregateScope } = require('./common');

/*
 * Manufacturing performance analytics for the dashboard. Everything is derived from
 * the records the module already writes (orders, outputs, receipts, scrap) — there is
 * no separate metrics store. All "days" are business calendar days (BUSINESS_TZ), and
 * every figure is scoped to the caller's organization (and branch when one is chosen).
 *
 * Period P = the selected range ending today; the comparison period is the same length
 * immediately before it.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGES = { '7d': 7, '30d': 30, '90d': 90, mtd: null };
const WEEKLY_FROM_DAYS = 60; // longer ranges bucket by week so charts stay readable
const TOP_N = 8;
const ALERT_LIMIT = 12;
const HIGH_SCRAP_RATE = 2; // % — below this a rise is noise
const HIGH_SCRAP_RISE = 10; // % relative increase vs the previous period

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
const dayKeyExpr = (field) => ({ $dateToString: { format: '%Y-%m-%d', date: `$${field}`, timezone: BUSINESS_TZ } });

/** Resolve the period, the comparison period and the chart buckets for a range id. */
const resolvePeriod = (range = '30d', now = new Date()) => {
  if (!Object.prototype.hasOwnProperty.call(RANGES, range)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Unknown range "${range}"`);
  }
  const todayKey = toBusinessCalendarDate(now);
  const startKey = range === 'mtd' ? `${todayKey.slice(0, 8)}01` : shiftCalendarDate(todayKey, -(RANGES[range] - 1));
  const days = eachBusinessCalendarDate(startOfBusinessDay(startKey), now);
  const { length } = days;
  const start = startOfBusinessDay(startKey);
  const prevStart = startOfBusinessDay(shiftCalendarDate(startKey, -length));

  const granularity = length > WEEKLY_FROM_DAYS ? 'week' : 'day';
  const size = granularity === 'week' ? 7 : 1;
  const buckets = [];
  for (let i = 0; i < length; i += size) {
    buckets.push({ key: days[i], days: days.slice(i, i + size) });
  }
  const bucketOfDay = new Map();
  buckets.forEach((b, i) => b.days.forEach((d) => bucketOfDay.set(d, i)));
  // Previous-period days line up index-for-index with the current ones.
  const prevBucketOfDay = new Map();
  buckets.forEach((b, i) => b.days.forEach((d) => prevBucketOfDay.set(shiftCalendarDate(d, -length), i)));

  return {
    range,
    todayKey,
    todayStart: startOfBusinessDay(todayKey),
    start,
    end: now,
    prevStart,
    prevEnd: start,
    length,
    granularity,
    buckets,
    bucketOfDay,
    prevBucketOfDay,
  };
};

/** Group a collection by business day within [from, to). */
const dailySums = (Model, match, dateField, from, to, fields) =>
  Model.aggregate([
    { $match: { ...match, [dateField]: { $gte: from, $lt: to } } },
    {
      $group: {
        _id: dayKeyExpr(dateField),
        ...Object.fromEntries(fields.map((f) => [f, { $sum: `$${f}` }])),
        count: { $sum: 1 },
      },
    },
  ]);

const intoBuckets = (rows, bucketOfDay, bucketCount, fields) => {
  const out = Array.from({ length: bucketCount }, () => Object.fromEntries(fields.map((f) => [f, 0])));
  rows.forEach((row) => {
    const i = bucketOfDay.get(row._id);
    if (i === undefined) return;
    fields.forEach((f) => {
      out[i][f] += row[f] || 0;
    });
  });
  return out;
};

const totals = (rows, fields) => Object.fromEntries(fields.map((f) => [f, rows.reduce((s, r) => s + (r[f] || 0), 0)]));

/** Receipts or scrap grouped by the producing order's WIP location (the work center). */
const byWorkCenter = (Model, match, dateField, from, to, valueFields) =>
  Model.aggregate([
    { $match: { ...match, [dateField]: { $gte: from, $lt: to }, productionOrderId: { $ne: null } } },
    {
      $lookup: {
        from: ProductionOrder.collection.name,
        localField: 'productionOrderId',
        foreignField: '_id',
        as: 'order',
      },
    },
    { $addFields: { workCenter: { $ifNull: [{ $arrayElemAt: ['$order.wipLocation', 0] }, ''] } } },
    {
      $group: {
        _id: { $cond: [{ $eq: ['$workCenter', ''] }, null, '$workCenter'] },
        ...Object.fromEntries(valueFields.map((f) => [f, { $sum: `$${f}` }])),
      },
    },
  ]);

const daysBetween = (later, earlier) => Math.floor((later.getTime() - earlier.getTime()) / DAY_MS);

const getAnalytics = async (ctx, { range = '30d' } = {}, now = new Date()) => {
  const p = resolvePeriod(range, now);
  const match = aggregateScope(ctx);
  const scope = scopeFilter(ctx);
  const n = p.buckets.length;

  const [
    statusRows,
    workedOrders,
    receiptDays,
    prevReceiptDays,
    scrapDays,
    prevScrapDays,
    targetDays,
    consumption,
    byProduct,
    wcProduced,
    wcScrap,
    prevWcProduced,
    prevWcScrap,
    rejectedRows,
    wipRows,
    completedToday,
    receivedToday,
    lateOrders,
    staleQc,
    recentlyCompleted,
    requirements,
  ] = await Promise.all([
    ProductionOrder.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    // Orders worked in the period: created by its end and either still open or closed within it.
    ProductionOrder.aggregate([
      {
        $match: {
          ...match,
          status: { $ne: 'cancelled' },
          createdAt: { $lte: p.end },
          $or: [{ status: { $in: OPEN_PRODUCTION_STATUSES } }, { actualCompletionDate: { $gte: p.start } }],
        },
      },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    dailySums(ProductionReceipt, match, 'receiptDate', p.start, p.end, ['quantity', 'totalCost']),
    dailySums(ProductionReceipt, match, 'receiptDate', p.prevStart, p.prevEnd, ['quantity', 'totalCost']),
    dailySums(ScrapRecord, match, 'scrapDate', p.start, p.end, ['quantity', 'totalCost']),
    dailySums(ScrapRecord, match, 'scrapDate', p.prevStart, p.prevEnd, ['quantity', 'totalCost']),
    // Target: what open/completed orders planned to finish on each day of the period.
    dailySums(
      ProductionOrder,
      { ...match, status: { $ne: 'cancelled' } },
      'plannedCompletionDate',
      p.start,
      new Date(p.end.getTime() + DAY_MS),
      ['plannedQuantity']
    ),
    ProductionOutput.aggregate([
      { $match: { ...match, reportedAt: { $gte: p.start, $lt: p.end } } },
      { $unwind: '$consumption' },
      {
        $group: {
          _id: '$consumption.productId',
          productName: { $first: '$consumption.productName' },
          unit: { $first: '$consumption.unit' },
          quantity: { $sum: '$consumption.quantity' },
          cost: { $sum: '$consumption.cost' },
        },
      },
      { $sort: { cost: -1 } },
    ]),
    ProductionReceipt.aggregate([
      { $match: { ...match, receiptDate: { $gte: p.start, $lt: p.end } } },
      {
        $group: {
          _id: '$productId',
          productName: { $first: '$productName' },
          unit: { $first: '$unit' },
          quantity: { $sum: '$quantity' },
          value: { $sum: '$totalCost' },
        },
      },
      { $sort: { quantity: -1 } },
    ]),
    byWorkCenter(ProductionReceipt, match, 'receiptDate', p.start, p.end, ['quantity', 'totalCost']),
    byWorkCenter(ScrapRecord, match, 'scrapDate', p.start, p.end, ['totalCost']),
    byWorkCenter(ProductionReceipt, match, 'receiptDate', p.prevStart, p.prevEnd, ['totalCost']),
    byWorkCenter(ScrapRecord, match, 'scrapDate', p.prevStart, p.prevEnd, ['totalCost']),
    ProductionOutput.aggregate([
      { $match: { ...match, status: 'inspected', inspectedAt: { $gte: p.start, $lt: p.end } } },
      { $group: { _id: null, produced: { $sum: '$producedQuantity' }, rejected: { $sum: '$rejectedQuantity' } } },
    ]),
    ProductionOrder.aggregate([
      { $match: { ...match, status: { $in: ['released', 'in_production', 'paused', 'qc_pending'] } } },
      {
        $project: {
          lots: { $size: { $ifNull: ['$wipLots', []] } },
          lotValue: {
            $sum: {
              $map: {
                input: { $ifNull: ['$wipLots', []] },
                as: 'l',
                in: { $multiply: ['$$l.quantity', { $ifNull: ['$$l.unitCost', 0] }] },
              },
            },
          },
          qcPending: { $ifNull: ['$qcPendingQuantity', 0] },
        },
      },
      {
        $group: {
          _id: null,
          wipValue: { $sum: '$lotValue' },
          qcPending: { $sum: '$qcPending' },
          orders: { $sum: { $cond: [{ $gt: ['$lotValue', 0] }, 1, 0] } },
        },
      },
    ]),
    ProductionOrder.countDocuments({ ...scope, status: 'completed', actualCompletionDate: { $gte: p.todayStart } }),
    ProductionReceipt.aggregate([
      { $match: { ...match, receiptDate: { $gte: p.todayStart } } },
      { $group: { _id: null, quantity: { $sum: '$quantity' } } },
    ]),
    ProductionOrder.find({
      ...scope,
      status: { $in: OPEN_PRODUCTION_STATUSES },
      plannedCompletionDate: { $lt: p.todayStart },
    })
      .select('orderNumber orderType productName plannedCompletionDate status plannedQuantity completedQuantity unit')
      .sort({ plannedCompletionDate: 1 })
      .limit(ALERT_LIMIT)
      .lean(),
    ProductionOutput.find({ ...scope, status: 'pending_qc', reportedAt: { $lt: new Date(now.getTime() - DAY_MS) } })
      .select('outputNumber productionOrderId orderNumber producedQuantity unit reportedAt')
      .sort({ reportedAt: 1 })
      .limit(5)
      .lean(),
    ProductionOrder.find({
      ...scope,
      status: 'completed',
      actualCompletionDate: { $gte: new Date(now.getTime() - 7 * DAY_MS) },
    })
      .select('orderNumber orderType productName completedQuantity rejectedQuantity unit actualCompletionDate')
      .sort({ actualCompletionDate: -1 })
      .limit(5)
      .lean(),
    productionOrderService.getAggregatedRequirements(ctx),
  ]);

  // ---- series --------------------------------------------------------------------
  const produced = intoBuckets(receiptDays, p.bucketOfDay, n, ['quantity', 'totalCost']);
  const prevProduced = intoBuckets(prevReceiptDays, p.prevBucketOfDay, n, ['quantity']);
  const scrap = intoBuckets(scrapDays, p.bucketOfDay, n, ['totalCost', 'quantity']);
  const target = intoBuckets(targetDays, p.bucketOfDay, n, ['plannedQuantity']);

  const period = totals(receiptDays, ['quantity', 'totalCost']);
  const prevPeriod = totals(prevReceiptDays, ['quantity', 'totalCost']);
  const scrapPeriod = totals(scrapDays, ['quantity', 'totalCost']);
  const scrapPrev = totals(prevScrapDays, ['totalCost']);
  // Scrap rate is value-based so mixed units (kg of wire, pcs of fans) compare fairly:
  // scrap cost ÷ (cost of good output + scrap cost).
  const scrapRate = pct(scrapPeriod.totalCost, period.totalCost + scrapPeriod.totalCost);
  const prevScrapRate = pct(scrapPrev.totalCost, prevPeriod.totalCost + scrapPrev.totalCost);

  const series = p.buckets.map((b, i) => ({
    key: b.key,
    produced: roundQty(produced[i].quantity),
    previous: roundQty(prevProduced[i].quantity),
    target: roundQty(target[i].plannedQuantity),
    goodCost: roundMoney(produced[i].totalCost),
    scrapCost: roundMoney(scrap[i].totalCost),
    scrapRate: pct(scrap[i].totalCost, produced[i].totalCost + scrap[i].totalCost),
  }));

  const topWithOther = (rows, valueKey, map) => {
    const top = rows.slice(0, TOP_N).map(map);
    const rest = rows.slice(TOP_N);
    return {
      rows: top,
      other: rest.length
        ? { count: rest.length, [valueKey]: roundMoney(rest.reduce((s, r) => s + (r[valueKey] || 0), 0)) }
        : null,
    };
  };

  const materialConsumption = topWithOther(consumption, 'cost', (r) => ({
    productId: String(r._id),
    productName: r.productName,
    unit: r.unit,
    quantity: roundQty(r.quantity),
    cost: roundMoney(r.cost),
  }));
  const productionByProduct = topWithOther(byProduct, 'value', (r) => ({
    productId: String(r._id),
    productName: r.productName,
    unit: r.unit,
    quantity: roundQty(r.quantity),
    value: roundMoney(r.value),
  }));

  const wcRate = (producedRows, scrapRows) => {
    const scrapBy = new Map(scrapRows.map((r) => [r._id || '', r.totalCost]));
    return new Map(
      producedRows.map((r) => {
        const scrapCost = scrapBy.get(r._id || '') || 0;
        return [r._id || '', { scrapCost, rate: pct(scrapCost, r.totalCost + scrapCost) }];
      })
    );
  };
  const wcCurrent = wcRate(wcProduced, wcScrap);
  const wcPrevious = wcRate(prevWcProduced, prevWcScrap);
  const productionByWorkCenter = wcProduced
    .map((r) => ({
      workCenter: r._id || null,
      quantity: roundQty(r.quantity),
      value: roundMoney(r.totalCost),
      scrapCost: roundMoney(wcCurrent.get(r._id || '').scrapCost),
      scrapRate: wcCurrent.get(r._id || '').rate,
    }))
    .sort((a, b) => b.quantity - a.quantity);

  const byStatus = Object.fromEntries(PRODUCTION_STATUSES.map((s) => [s, 0]));
  statusRows.forEach((r) => {
    byStatus[r._id] = r.count;
  });
  const worked = Object.fromEntries(workedOrders.map((r) => [r._id, r.count]));
  const workedTotal = workedOrders.reduce((s, r) => s + r.count, 0);
  const wip = wipRows[0] || { wipValue: 0, qcPending: 0, orders: 0 };
  const rejected = rejectedRows[0] || { produced: 0, rejected: 0 };

  // ---- alerts --------------------------------------------------------------------
  const alerts = [];
  requirements.lines
    .filter((l) => l.shortageQuantity > 0)
    .slice(0, 5)
    .forEach((l) => {
      const first = (l.orders || [])[0];
      const more = (l.orders || []).length - 1;
      alerts.push({
        id: `shortage:${l.productId}:${l.variantId || ''}`,
        kind: 'shortage',
        severity: 'critical',
        title: 'Material shortage',
        message: `${l.productName} short by ${roundQty(l.shortageQuantity)} ${l.unit}${
          first ? ` for ${first.orderNumber}${more > 0 ? ` +${more} more` : ''}` : ''
        }`,
        orderId: first ? first.orderId : null,
        link: first ? { order: first.orderId } : { to: '/manufacturing/requirements' },
      });
    });
  lateOrders.forEach((o) => {
    const behind = Math.max(
      1,
      daysBetween(p.todayStart, startOfBusinessDay(toBusinessCalendarDate(o.plannedCompletionDate)))
    );
    alerts.push({
      id: `late:${o._id}`,
      kind: 'delayed',
      severity: behind >= 3 ? 'critical' : 'warning',
      title: 'Delayed production',
      message: `${o.orderNumber} is ${behind} day${behind === 1 ? '' : 's'} behind schedule (${o.productName})`,
      at: o.plannedCompletionDate,
      link: { order: String(o._id), orderType: o.orderType || 'production' },
    });
  });
  productionByWorkCenter.forEach((wc) => {
    const prev = wcPrevious.get(wc.workCenter || '');
    const label = wc.workCenter || 'Unassigned work center';
    if (wc.scrapRate < HIGH_SCRAP_RATE) return;
    if (prev && prev.rate > 0) {
      const rise = Math.round(((wc.scrapRate - prev.rate) / prev.rate) * 100);
      if (rise < HIGH_SCRAP_RISE) return;
      alerts.push({
        id: `scrap:${label}`,
        kind: 'scrap',
        severity: 'warning',
        title: 'High scrap',
        message: `${label} scrap rate increased by ${rise}% (${wc.scrapRate}% vs ${prev.rate}%)`,
        link: { to: '/manufacturing/scrap' },
      });
    } else {
      alerts.push({
        id: `scrap:${label}`,
        kind: 'scrap',
        severity: 'warning',
        title: 'High scrap',
        message: `${label} scrap rate is ${wc.scrapRate}% this period`,
        link: { to: '/manufacturing/scrap' },
      });
    }
  });
  staleQc.forEach((o) => {
    const waited = Math.max(1, daysBetween(now, o.reportedAt));
    alerts.push({
      id: `qc:${o._id}`,
      kind: 'qc',
      severity: 'warning',
      title: 'Waiting for inspection',
      message: `${o.outputNumber} (${roundQty(o.producedQuantity)} ${o.unit}, ${o.orderNumber}) has waited ${waited} day${
        waited === 1 ? '' : 's'
      } for QC`,
      at: o.reportedAt,
      link: { to: '/manufacturing/quality' },
    });
  });
  recentlyCompleted.forEach((o) => {
    alerts.push({
      id: `done:${o._id}`,
      kind: 'completed',
      severity: 'success',
      title: 'Production completed',
      message: `${o.orderNumber} completed successfully: ${roundQty(o.completedQuantity)} ${o.unit} ${o.productName}`,
      at: o.actualCompletionDate,
      link: { order: String(o._id), orderType: o.orderType || 'production' },
    });
  });
  const SEVERITY_ORDER = { critical: 0, warning: 1, success: 2, info: 3 };
  alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const alertCounts = alerts.reduce((acc, a) => ({ ...acc, [a.severity]: (acc[a.severity] || 0) + 1 }), {});

  return {
    range: p.range,
    granularity: p.granularity,
    period: { start: p.start, end: p.end, days: p.length, today: p.todayKey },
    kpis: {
      productionOrders: {
        total: workedTotal,
        inProduction: (worked.in_production || 0) + (worked.paused || 0) + (worked.qc_pending || 0),
        completed: worked.completed || 0,
      },
      inProduction: {
        count: byStatus.in_production + byStatus.qc_pending,
        paused: byStatus.paused,
        released: byStatus.released,
      },
      completedToday: { orders: completedToday, units: roundQty(receivedToday[0] ? receivedToday[0].quantity : 0) },
      unitsProduced: {
        quantity: roundQty(period.quantity),
        value: roundMoney(period.totalCost),
        previous: roundQty(prevPeriod.quantity),
        change: prevPeriod.quantity > 0 ? pct(period.quantity - prevPeriod.quantity, prevPeriod.quantity) : null,
      },
      wipValue: { value: roundMoney(wip.wipValue), orders: wip.orders },
      materialShortages: { count: requirements.shortageCount, orders: requirements.orderCount },
      qcIssues: {
        rejected: roundQty(rejected.rejected),
        inspected: roundQty(rejected.produced),
        rejectRate: pct(rejected.rejected, rejected.produced),
        awaiting: roundQty(wip.qcPending),
      },
      scrapRate: {
        rate: scrapRate,
        previous: prevScrapRate,
        change: Math.round((scrapRate - prevScrapRate) * 10) / 10,
        value: roundMoney(scrapPeriod.totalCost),
      },
    },
    series,
    materialConsumption,
    productionByProduct,
    productionByWorkCenter,
    orderStatus: byStatus,
    alerts: alerts.slice(0, ALERT_LIMIT),
    alertCounts,
  };
};

module.exports = { getAnalytics, resolvePeriod, RANGES };
