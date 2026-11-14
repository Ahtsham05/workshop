const mongoose = require('mongoose');
const httpStatus = require('http-status');
const { Product, ProductionTarget, ProductionReceipt, PackingVoucher, ProductionOrder } = require('../../models');
const ApiError = require('../../utils/ApiError');
const {
  getBusinessTimeZone,
  toBusinessCalendarDate,
  startOfBusinessDay,
  endOfBusinessDay,
} = require('../../utils/businessTimezone');
const { OPEN_PRODUCTION_STATUSES } = require('../../config/manufacturing');
const { roundQty, requireBranch, scopeFilter, escapeRegex } = require('./common');
const settingsService = require('./settings.service');
const { currentStock, resolveRange } = require('./reports.service');

/*
 * Production targets — "make 1,000 fans this month" — measured live against what the
 * factory actually did. A target never moves stock; every figure comes from documents:
 *
 *   made        finished goods received (ProductionReceipt — a reversed output deletes its
 *               receipt) + packs packed (posted PackingVoucher lines) inside the period
 *   in stock    the product's stock on hand right now
 *   in orders   still to come off open production orders: planned − completed
 *   to plan     what is still missing after those orders — needs new orders
 *
 * Status of a line:
 *   upcoming    the period has not started
 *   achieved    target reached
 *   on_track    running and made ≥ alertAtPercent % of the pace to date
 *               (stock measure: stock + open orders cover the target)
 *   at_risk     running and below that pace (stock measure: not covered)
 *   missed      the period ended short of the target
 *
 * The pace "to date" counts only finished days (yesterday and before): on the first day
 * nothing is expected yet, so a new target never opens as "at risk".
 */

const EPS = 1e-6;
const DAY_MS = 86400000;
const MAX_PERIOD_DAYS = 400;
const MAX_TARGETS = 1000;
const ALERT_LOOKBACK_DAYS = 7;
const STATUS_RANK = { missed: 5, at_risk: 4, on_track: 3, upcoming: 2, achieved: 1 };

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const dayNumber = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
};
const daysInclusive = (from, to) => dayNumber(to) - dayNumber(from) + 1;
const shiftDay = (key, days) => new Date((dayNumber(key) + days) * DAY_MS).toISOString().slice(0, 10);
const minKey = (a, b) => (a < b ? a : b);
const dayOf = (field) => ({ $dateToString: { format: '%Y-%m-%d', date: `$${field}`, timezone: getBusinessTimeZone() } });

/** Where in its period a target stands today, in whole business days. */
const timing = (target, today) => {
  const totalDays = daysInclusive(target.startDay, target.endDay);
  if (today < target.startDay) return { phase: 'upcoming', totalDays, daysGone: 0, daysSoFar: 0, daysLeft: totalDays };
  if (today > target.endDay) return { phase: 'ended', totalDays, daysGone: totalDays, daysSoFar: totalDays, daysLeft: 0 };
  const daysSoFar = daysInclusive(target.startDay, today);
  return { phase: 'running', totalDays, daysGone: daysSoFar - 1, daysSoFar, daysLeft: totalDays - daysSoFar + 1 };
};

/**
 * Everything needed to measure `targets` in one pass, whatever their number: made per
 * branch × product × day, stock now, and open-order balance per branch × product.
 */
const loadFacts = async (organizationId, targets, today) => {
  if (!targets.length) return { made: new Map(), stock: new Map(), pipeline: new Map() };
  const productIds = [...new Set(targets.flatMap((t) => t.lines.map((l) => String(l.productId))))].map(oid);
  const branchIds = [...new Set(targets.map((t) => String(t.branchId)))].map(oid);
  const fromKey = targets.reduce((m, t) => minKey(m, t.startDay), targets[0].startDay);
  const toKey = minKey(
    targets.reduce((m, t) => (t.endDay > m ? t.endDay : m), targets[0].endDay),
    today
  );
  const org = oid(organizationId);
  const inPeriod = fromKey <= toKey ? { $gte: startOfBusinessDay(fromKey), $lte: endOfBusinessDay(toKey) } : null;

  const [receipts, packs, products, orders] = await Promise.all([
    inPeriod
      ? ProductionReceipt.aggregate([
          {
            $match: {
              organizationId: org,
              branchId: { $in: branchIds },
              productId: { $in: productIds },
              receiptDate: inPeriod,
            },
          },
          {
            $group: {
              _id: { b: '$branchId', p: '$productId', d: dayOf('receiptDate') },
              qty: { $sum: '$quantity' },
            },
          },
        ])
      : [],
    inPeriod
      ? PackingVoucher.aggregate([
          { $match: { organizationId: org, branchId: { $in: branchIds }, status: 'posted', packingDate: inPeriod } },
          { $unwind: '$lines' },
          { $match: { 'lines.productId': { $in: productIds } } },
          {
            $group: {
              _id: { b: '$branchId', p: '$lines.productId', d: dayOf('packingDate') },
              qty: { $sum: '$lines.quantity' },
            },
          },
        ])
      : [],
    Product.find({ _id: { $in: productIds }, organizationId: org })
      .select('stockQuantity hasVariants')
      .lean(),
    ProductionOrder.aggregate([
      {
        $match: {
          organizationId: org,
          branchId: { $in: branchIds },
          productId: { $in: productIds },
          status: { $in: OPEN_PRODUCTION_STATUSES },
        },
      },
      {
        $group: {
          _id: { b: '$branchId', p: '$productId' },
          orders: { $sum: 1 },
          balance: {
            $sum: { $max: [0, { $subtract: ['$plannedQuantity', { $ifNull: ['$completedQuantity', 0] }] }] },
          },
        },
      },
    ]),
  ]);

  // `${branch}:${product}` → Map(day → qty)
  const made = new Map();
  [...receipts, ...packs].forEach((r) => {
    const key = `${r._id.b}:${r._id.p}`;
    const days = made.get(key) || new Map();
    days.set(r._id.d, (days.get(r._id.d) || 0) + (Number(r.qty) || 0));
    made.set(key, days);
  });
  const pipeline = new Map(orders.map((r) => [`${r._id.b}:${r._id.p}`, { orders: r.orders, balance: r.balance || 0 }]));
  return { made, stock: await currentStock(products), pipeline };
};

const worstStatus = (statuses, phase) => {
  if (!statuses.length) return phase === 'upcoming' ? 'upcoming' : 'achieved';
  if (statuses.every((s) => s === 'achieved')) return 'achieved';
  if (phase === 'upcoming') return 'upcoming';
  return statuses.reduce((worst, s) => (STATUS_RANK[s] > STATUS_RANK[worst] ? s : worst), 'achieved');
};

/** One target with every line measured (and, with `withDaily`, its day-by-day output). */
const measure = (target, facts, today, { withDaily = false } = {}) => {
  const when = timing(target, today);
  const lastDay = minKey(target.endDay, today);
  const alertAt = (target.alertAtPercent || 90) / 100;
  const branch = String(target.branchId);

  const lines = target.lines.map((line) => {
    const productId = String(line.productId);
    const days = facts.made.get(`${branch}:${productId}`) || new Map();
    let made = 0;
    days.forEach((qty, d) => {
      if (d >= target.startDay && d <= lastDay) made += qty;
    });
    made = roundQty(made);
    const stock = roundQty(facts.stock.get(productId) || 0);
    const pipe = facts.pipeline.get(`${branch}:${productId}`) || { orders: 0, balance: 0 };
    const goal = line.targetQuantity;
    const achieved = target.measure === 'stock' ? stock : made;
    const remaining = roundQty(Math.max(0, goal - achieved));
    const inOrders = roundQty(pipe.balance);
    const expected = target.measure === 'stock' ? null : roundQty((goal * when.daysGone) / Math.max(1, when.totalDays));

    let status;
    if (achieved >= goal - EPS) status = 'achieved';
    else if (when.phase === 'upcoming') status = 'upcoming';
    else if (when.phase === 'ended') status = 'missed';
    else if (target.measure === 'stock') status = stock + inOrders >= goal - EPS ? 'on_track' : 'at_risk';
    else status = made >= expected * alertAt - EPS ? 'on_track' : 'at_risk';

    const avgPerDay = target.measure === 'production' && when.daysSoFar > 0 ? roundQty(made / when.daysSoFar) : null;
    const row = {
      id: String(line._id),
      productId,
      productName: line.productName,
      sku: line.sku || '',
      unit: line.unit,
      notes: line.notes || '',
      target: roundQty(goal),
      made,
      stock,
      achieved: roundQty(achieved),
      remaining,
      percent: goal > 0 ? Math.round((achieved / goal) * 1000) / 10 : 0,
      expected,
      // Behind (−) or ahead (+) of the pace to date.
      paceGap: expected === null ? null : roundQty(made - expected),
      avgPerDay,
      requiredPerDay: when.daysLeft > 0 && remaining > 0 ? roundQty(remaining / when.daysLeft) : null,
      projected: avgPerDay === null || when.phase === 'upcoming' ? null : roundQty(avgPerDay * when.totalDays),
      openOrders: pipe.orders,
      inOrders,
      toPlan: roundQty(Math.max(0, remaining - inOrders)),
      shortfall: status === 'missed' ? remaining : 0,
      status,
    };
    if (withDaily) {
      let running = 0;
      row.daily = [];
      for (let d = target.startDay; d <= lastDay; d = shiftDay(d, 1)) {
        const qty = roundQty(days.get(d) || 0);
        running = roundQty(running + qty);
        const index = daysInclusive(target.startDay, d);
        row.daily.push({ day: d, made: qty, cumulative: running, plan: roundQty((goal * index) / when.totalDays) });
      }
    }
    return row;
  });

  const statuses = lines.map((l) => l.status);
  return {
    id: String(target._id),
    targetNumber: target.targetNumber,
    title: target.title,
    periodType: target.periodType,
    startDay: target.startDay,
    endDay: target.endDay,
    measure: target.measure,
    alertAtPercent: target.alertAtPercent || 90,
    notes: target.notes || '',
    branchId: branch,
    createdByName: target.createdByName || '',
    createdAt: target.createdAt,
    updatedAt: target.updatedAt,
    ...when,
    status: worstStatus(statuses, when.phase),
    // Units differ between lines (kg, pcs, cartons), so overall progress is the average
    // of each line's own progress, capped at 100 % a line.
    progress: lines.length
      ? Math.round((lines.reduce((s, l) => s + Math.min(100, l.percent), 0) / lines.length) * 10) / 10
      : 0,
    counts: {
      lines: lines.length,
      achieved: statuses.filter((s) => s === 'achieved').length,
      onTrack: statuses.filter((s) => s === 'on_track').length,
      atRisk: statuses.filter((s) => s === 'at_risk').length,
      missed: statuses.filter((s) => s === 'missed').length,
    },
    lines,
  };
};

const measureAll = async (ctx, targets, options) => {
  const today = toBusinessCalendarDate(new Date());
  const facts = await loadFacts(ctx.organizationId, targets, today);
  return { today, results: targets.map((t) => measure(t, facts, today, options)) };
};

/** Targets of the branch (or org) matching a phase, newest period first. */
const findTargets = (ctx, { phase, search, overlap } = {}) => {
  const today = toBusinessCalendarDate(new Date());
  const filter = scopeFilter(ctx);
  if (phase === 'running') Object.assign(filter, { startDay: { $lte: today }, endDay: { $gte: today } });
  if (phase === 'upcoming') filter.startDay = { $gt: today };
  if (phase === 'ended') filter.endDay = { $lt: today };
  if (overlap) Object.assign(filter, { startDay: { $lte: overlap.endKey }, endDay: { $gte: overlap.startKey } });
  if (search) {
    const re = new RegExp(escapeRegex(search.trim()), 'i');
    filter.$or = [{ targetNumber: re }, { title: re }, { 'lines.productName': re }, { 'lines.sku': re }];
  }
  return ProductionTarget.find(filter).sort({ endDay: -1, startDay: -1, createdAt: -1 }).limit(MAX_TARGETS).lean();
};

const STATUSES = Object.keys(STATUS_RANK);
const countBy = (results) => Object.fromEntries(STATUSES.map((s) => [s, results.filter((r) => r.status === s).length]));

/** List with live progress. Status is computed, so it is filtered and paged in memory. */
const listTargets = async (ctx, q = {}) => {
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
  const targets = await findTargets(ctx, { phase: q.phase === 'all' ? null : q.phase, search: q.search });
  const { results } = await measureAll(ctx, targets);
  const matching = q.status && q.status !== 'all' ? results.filter((r) => r.status === q.status) : results;
  return {
    results: matching.slice((page - 1) * limit, page * limit),
    page,
    limit,
    totalResults: matching.length,
    totalPages: Math.max(1, Math.ceil(matching.length / limit)),
    stats: { total: results.length, ...countBy(results) },
  };
};

const getTarget = async (ctx, targetId) => {
  const target = await ProductionTarget.findOne({ _id: targetId, ...scopeFilter(ctx) }).lean();
  if (!target) throw new ApiError(httpStatus.NOT_FOUND, 'Target not found');
  const { results } = await measureAll(ctx, [target], { withDaily: true });
  return results[0];
};

/**
 * Lines that need attention: running targets falling behind, and targets missed in the
 * last week (older misses are history — the report has them).
 */
const getAlerts = async (ctx) => {
  const today = toBusinessCalendarDate(new Date());
  const targets = await ProductionTarget.find({
    ...scopeFilter(ctx),
    startDay: { $lte: today },
    endDay: { $gte: shiftDay(today, -ALERT_LOOKBACK_DAYS) },
  })
    .limit(MAX_TARGETS)
    .lean();
  const { results } = await measureAll(ctx, targets);
  const items = results
    .flatMap((t) =>
      t.lines
        .filter((l) => l.status === 'at_risk' || l.status === 'missed')
        .map((l) => ({
          targetId: t.id,
          targetNumber: t.targetNumber,
          title: t.title,
          startDay: t.startDay,
          endDay: t.endDay,
          measure: t.measure,
          daysLeft: t.daysLeft,
          ...l,
        }))
    )
    .sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status] || a.percent - b.percent);
  return {
    count: items.length,
    atRisk: items.filter((i) => i.status === 'at_risk').length,
    missed: items.filter((i) => i.status === 'missed').length,
    items: items.slice(0, 50),
  };
};

/* ── Writes ─────────────────────────────────────────────────────────────────────── */

const cleanBody = async (ctx, body) => {
  const { startDay, endDay } = body;
  if (startDay > endDay) throw new ApiError(httpStatus.BAD_REQUEST, 'The target starts after it ends');
  if (daysInclusive(startDay, endDay) > MAX_PERIOD_DAYS) {
    throw new ApiError(httpStatus.BAD_REQUEST, `A target can cover at most ${MAX_PERIOD_DAYS} days`);
  }
  const ids = body.lines.map((l) => String(l.productId));
  const duplicate = ids.find((id, i) => ids.indexOf(id) !== i);
  if (duplicate)
    throw new ApiError(httpStatus.BAD_REQUEST, 'A product is listed twice — put its whole quantity on one line');
  const products = await Product.find({
    _id: { $in: ids.map(oid) },
    organizationId: ctx.organizationId,
    branchId: ctx.branchId,
  })
    .select('name sku unit')
    .lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const missing = ids.find((id) => !byId.has(id));
  if (missing) throw new ApiError(httpStatus.BAD_REQUEST, 'A product on this target was not found in this branch');
  return {
    title: (body.title || '').trim() || `${startDay} – ${endDay}`,
    periodType: body.periodType || 'custom',
    startDay,
    endDay,
    measure: body.measure || 'production',
    alertAtPercent: body.alertAtPercent || 90,
    notes: body.notes || '',
    lines: body.lines.map((l) => {
      const p = byId.get(String(l.productId));
      return {
        ...(l.id ? { _id: l.id } : {}),
        productId: p._id,
        productName: p.name,
        sku: p.sku || '',
        unit: p.unit,
        targetQuantity: roundQty(l.targetQuantity),
        notes: l.notes || '',
      };
    }),
  };
};

const createTarget = async (ctx, body) => {
  requireBranch(ctx.branchId);
  const fields = await cleanBody(ctx, body);
  const targetNumber = await settingsService.nextDocumentNumber(ctx.organizationId, 'target');
  const target = await ProductionTarget.create({
    ...fields,
    organizationId: ctx.organizationId,
    branchId: ctx.branchId,
    targetNumber,
    createdBy: ctx.createdBy,
    createdByName: ctx.createdByName || '',
  });
  return getTarget(ctx, target._id);
};

const updateTarget = async (ctx, targetId, body) => {
  requireBranch(ctx.branchId);
  const target = await ProductionTarget.findOne({ _id: targetId, ...scopeFilter(ctx) });
  if (!target) throw new ApiError(httpStatus.NOT_FOUND, 'Target not found');
  // Products are checked against the target's own branch, not whichever one is selected.
  const fields = await cleanBody({ ...ctx, branchId: target.branchId }, body);
  target.set({ ...fields, updatedBy: ctx.createdBy });
  await target.save();
  return getTarget(ctx, target._id);
};

const deleteTarget = async (ctx, targetId) => {
  const target = await ProductionTarget.findOneAndDelete({ _id: targetId, ...scopeFilter(ctx) });
  if (!target) throw new ApiError(httpStatus.NOT_FOUND, 'Target not found');
  return target;
};

/* ── Report: Target vs Actual ───────────────────────────────────────────────────── */

/**
 * Every target whose period overlaps the chosen one, line by line, each measured over
 * its own whole period — plus a product-wise position: what is targeted, made, in stock,
 * coming from open orders and still to plan.
 */
const targetReport = async (ctx, q = {}) => {
  const range = resolveRange(q);
  const targets = await findTargets(ctx, { overlap: range });
  const { today, results } = await measureAll(ctx, targets);
  const visible = q.targetStatus && q.targetStatus !== 'all' ? results.filter((r) => r.status === q.targetStatus) : results;
  // Oldest first reads like a register.
  visible.reverse();

  const byProduct = new Map();
  visible.forEach((t) =>
    t.lines.forEach((l) => {
      const key = `${t.branchId}:${l.productId}:${l.unit}`;
      const g = byProduct.get(key) || {
        productId: l.productId,
        productName: l.productName,
        sku: l.sku,
        unit: l.unit,
        targets: 0,
        target: 0,
        made: 0,
        remaining: 0,
        // Stock and open orders belong to the product — counted once, not per target.
        stock: l.stock,
        inOrders: l.inOrders,
        openOrders: l.openOrders,
      };
      g.targets += 1;
      g.target = roundQty(g.target + l.target);
      g.made = roundQty(g.made + l.made);
      g.remaining = roundQty(g.remaining + l.remaining);
      byProduct.set(key, g);
    })
  );
  const products = [...byProduct.values()]
    .map((g) => ({
      ...g,
      percent: g.target > 0 ? Math.round((g.made / g.target) * 1000) / 10 : 0,
      toPlan: roundQty(Math.max(0, g.remaining - g.inOrders)),
    }))
    .sort((a, b) => a.productName.localeCompare(b.productName));

  return {
    report: 'targets',
    period: { startDate: range.startKey, endDate: range.endKey },
    today,
    targets: visible,
    byProduct: products,
    totals: {
      targets: visible.length,
      lines: visible.reduce((s, t) => s + t.lines.length, 0),
      ...countBy(visible),
      linesAtRisk: visible.reduce((s, t) => s + t.counts.atRisk, 0),
      linesMissed: visible.reduce((s, t) => s + t.counts.missed, 0),
      linesAchieved: visible.reduce((s, t) => s + t.counts.achieved, 0),
      progress: visible.length ? Math.round((visible.reduce((s, t) => s + t.progress, 0) / visible.length) * 10) / 10 : 0,
    },
  };
};

module.exports = {
  listTargets,
  getTarget,
  getAlerts,
  createTarget,
  updateTarget,
  deleteTarget,
  targetReport,
  // For tests.
  timing,
};
