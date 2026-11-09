const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Customer, CustomerLedger, Invoice, Product, SalesReturn } = require('../models');
const ApiError = require('../utils/ApiError');
const Money = require('../utils/money');
const { parseBusinessDateBoundary, toBusinessCalendarDate } = require('../utils/businessTimezone');

/**
 * Customer profitability — how much each customer actually earns the business.
 *
 *   Net revenue   = sales (lines net of line + bill discounts, ex tax) − returns
 *   Gross profit  = Σ line profit − bill discount            (same "real sale" rule as
 *                   productAnalytics.service: not cancelled, not quotation, not a converted
 *                   pending bill that is re-issued as a credit invoice)
 *   Net profit    = gross profit − profit reversed by returns (at the ORIGINAL sale's cost)
 *                   − ledger discounts allowed (settlement / cash discount, rebates, write-offs)
 *   Margin        = net profit / net revenue
 *
 * Walk-in sales have no customer and are left out. Day boundaries are Pakistan business days.
 */

const SOLD_INVOICE_MATCH = Object.freeze({
  status: { $ne: 'cancelled' },
  type: { $ne: 'quotation' },
  $nor: [{ type: 'pending', isConvertedToBill: true }],
});
const ACTIVE_RETURN_MATCH = Object.freeze({ status: { $ne: 'rejected' } });
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS = 365 * 40; // the ledger's "All time" starts in 2000

const isObjectIdString = (id) => /^[0-9a-fA-F]{24}$/.test(String(id || ''));
const toObjectId = (id) => (isObjectIdString(id) ? new mongoose.Types.ObjectId(String(id)) : id);
const round = (n) => Money.roundMoney(Number(n) || 0);
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 10000) / 100 : 0);

const scopeOf = ({ organizationId, branchId }) => {
  const scope = { organizationId: toObjectId(organizationId) };
  if (branchId) scope.branchId = toObjectId(branchId);
  return scope;
};

/** Invoice.customerId is a plain string in storage (Mixed) — match both shapes. */
const idForms = (ids) =>
  ids.flatMap((id) => (isObjectIdString(id) ? [String(id), new mongoose.Types.ObjectId(String(id))] : [String(id)]));

const resolvePeriod = ({ startDate, endDate } = {}) => {
  const end = parseBusinessDateBoundary(endDate || toBusinessCalendarDate(new Date()), true);
  const start = parseBusinessDateBoundary(startDate, false) || new Date(end.getTime() - 30 * DAY_MS + 1);
  if (start > end) throw new ApiError(httpStatus.BAD_REQUEST, 'Start date is after end date');
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));
  if (days > MAX_DAYS) throw new ApiError(httpStatus.BAD_REQUEST, 'Date range is too long');
  return {
    start,
    end,
    days,
    previous: { start: new Date(start.getTime() - days * DAY_MS), end: new Date(start.getTime() - 1) },
  };
};

/* ── The three sources ───────────────────────────────────────────────────────── */

const salesByCustomer = async (scope, start, end, customerIds) => {
  const match = {
    ...scope,
    ...SOLD_INVOICE_MATCH,
    invoiceDate: { $gte: start, $lte: end },
    customerId: customerIds ? { $in: idForms(customerIds) } : { $nin: [null, '', 'walk-in'] },
  };
  const rows = await Invoice.aggregate([
    { $match: match },
    {
      $project: {
        cid: { $toString: '$customerId' },
        invoiceDate: 1,
        billDiscount: { $ifNull: ['$discount', 0] },
        lines: { $sum: '$items.subtotal' },
        itemsProfit: { $sum: '$items.profit' },
        lineDiscount: { $sum: '$items.discountAmount' },
        units: {
          $sum: {
            $map: {
              input: { $ifNull: ['$items', []] },
              as: 'i',
              in: { $ifNull: ['$$i.stockQuantity', { $ifNull: ['$$i.quantity', 0] }] },
            },
          },
        },
      },
    },
    {
      $group: {
        _id: '$cid',
        invoices: { $sum: 1 },
        revenue: { $sum: { $subtract: ['$lines', '$billDiscount'] } },
        profit: { $sum: { $subtract: ['$itemsProfit', '$billDiscount'] } },
        billDiscounts: { $sum: { $add: ['$lineDiscount', '$billDiscount'] } },
        units: { $sum: '$units' },
        firstSaleAt: { $min: '$invoiceDate' },
        lastSaleAt: { $max: '$invoiceDate' },
      },
    },
  ]);
  return new Map(rows.filter((r) => isObjectIdString(r._id)).map((r) => [String(r._id), r]));
};

/**
 * Returns in the period, per customer: value given back and the profit that reverses (value −
 * cost of the returned units at the ORIGINAL invoice's unit cost; current product cost when the
 * original line can't be found). A return with no customer takes its invoice's customer.
 */
const returnsByCustomer = async (scope, start, end, customerIds) => {
  const lines = await SalesReturn.aggregate([
    { $match: { ...scope, ...ACTIVE_RETURN_MATCH, date: { $gte: start, $lte: end } } },
    { $project: { customerId: 1, invoiceId: 1, items: 1 } },
    { $unwind: '$items' },
    {
      $group: {
        _id: { c: '$customerId', i: '$invoiceId', p: '$items.productId' },
        units: { $sum: { $ifNull: ['$items.stockQuantity', { $ifNull: ['$items.quantity', 0] }] } },
        value: { $sum: { $ifNull: ['$items.total', 0] } },
      },
    },
  ]);
  if (!lines.length) return new Map();

  const invoiceIds = [...new Set(lines.map((l) => String(l._id.i)).filter(isObjectIdString))];
  const invoices = invoiceIds.length
    ? await Invoice.find({ _id: { $in: invoiceIds } })
        .select('customerId items.productId items.subtotal items.profit items.stockQuantity items.quantity')
        .lean()
    : [];
  const invoiceCustomer = new Map();
  const unitCost = new Map();
  invoices.forEach((inv) => {
    invoiceCustomer.set(String(inv._id), inv.customerId ? String(inv.customerId) : null);
    (inv.items || []).forEach((item) => {
      const key = `${inv._id}|${item.productId}`;
      const units = item.stockQuantity || item.quantity || 0;
      if (!unitCost.has(key) && units > 0) unitCost.set(key, ((item.subtotal || 0) - (item.profit || 0)) / units);
    });
  });

  const unknownProducts = [
    ...new Set(
      lines
        .filter((l) => !unitCost.has(`${l._id.i}|${l._id.p}`))
        .map((l) => String(l._id.p))
        .filter(isObjectIdString)
    ),
  ];
  const productCost = new Map(
    unknownProducts.length
      ? (
          await Product.find({ _id: { $in: unknownProducts } })
            .select('cost')
            .lean()
        ).map((p) => [String(p._id), Number(p.cost) || 0])
      : []
  );

  const wanted = customerIds ? new Set(customerIds.map(String)) : null;
  const out = new Map();
  lines.forEach((l) => {
    const cid = l._id.c ? String(l._id.c) : invoiceCustomer.get(String(l._id.i));
    if (!cid || !isObjectIdString(cid) || (wanted && !wanted.has(cid))) return;
    const cost = unitCost.has(`${l._id.i}|${l._id.p}`)
      ? unitCost.get(`${l._id.i}|${l._id.p}`)
      : productCost.get(String(l._id.p)) || 0;
    const entry = out.get(cid) || { value: 0, profit: 0, units: 0, count: 0 };
    entry.value += l.value;
    entry.profit += l.value - l.units * cost;
    entry.units += l.units;
    entry.count += 1;
    out.set(cid, entry);
  });
  return out;
};

const ledgerDiscountsByCustomer = async (scope, start, end, customerIds) => {
  const rows = await CustomerLedger.aggregate([
    {
      $match: {
        ...scope,
        transactionType: 'discount_allowed',
        transactionDate: { $gte: start, $lte: end },
        ...(customerIds ? { customer: { $in: customerIds.filter(isObjectIdString).map(toObjectId) } } : {}),
      },
    },
    { $group: { _id: '$customer', amount: { $sum: '$credit' }, count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
};

/** Every customer with activity in the window → their profit figures. */
const computeWindow = async (scope, start, end, customerIds) => {
  const [sales, returns, discounts] = await Promise.all([
    salesByCustomer(scope, start, end, customerIds),
    returnsByCustomer(scope, start, end, customerIds),
    ledgerDiscountsByCustomer(scope, start, end, customerIds),
  ]);
  const ids = new Set([...sales.keys(), ...returns.keys(), ...discounts.keys()]);
  const out = new Map();
  ids.forEach((id) => {
    const s = sales.get(id) || {};
    const r = returns.get(id) || { value: 0, profit: 0 };
    const d = discounts.get(id) || { amount: 0, count: 0 };
    const revenue = round(s.revenue);
    const grossProfit = round(s.profit);
    const netRevenue = round(revenue - r.value);
    const netProfit = round(grossProfit - r.profit - d.amount);
    out.set(id, {
      customerId: id,
      invoices: s.invoices || 0,
      units: round(s.units),
      revenue,
      billDiscounts: round(s.billDiscounts),
      grossProfit,
      returnsValue: round(r.value),
      returnsProfit: round(r.profit),
      ledgerDiscount: round(d.amount),
      ledgerDiscountCount: d.count || 0,
      netRevenue,
      cost: round(netRevenue - (grossProfit - r.profit)),
      netProfit,
      margin: pct(netProfit, netRevenue),
      avgProfitPerInvoice: s.invoices ? round(netProfit / s.invoices) : 0,
      firstSaleAt: s.firstSaleAt || null,
      lastSaleAt: s.lastSaleAt || null,
    });
  });
  return out;
};

const SORTS = new Set([
  'netProfit',
  'netRevenue',
  'margin',
  'invoices',
  'ledgerDiscount',
  'grossProfit',
  'growth',
  'lastSaleAt',
  'avgProfitPerInvoice',
]);

/**
 * Reports → Customer Profit: every customer ranked by what they earned the business.
 */
const getRanking = async (tenant, query = {}) => {
  const scope = scopeOf(tenant);
  const period = resolvePeriod(query);
  const [current, previous] = await Promise.all([
    computeWindow(scope, period.start, period.end),
    computeWindow(scope, period.previous.start, period.previous.end),
  ]);

  const ids = [...current.keys()];
  const customers = ids.length
    ? await Customer.find({ _id: { $in: ids }, organizationId: scope.organizationId })
        .select('name nameUrdu phone balance')
        .lean()
    : [];
  const byId = new Map(customers.map((c) => [String(c._id), c]));

  const search = String(query.search || '')
    .trim()
    .toLowerCase();
  let rows = ids
    .filter((id) => byId.has(id))
    .map((id) => {
      const m = current.get(id);
      const c = byId.get(id);
      const prev = previous.get(id);
      const previousNetProfit = prev ? prev.netProfit : 0;
      return {
        ...m,
        name: c.name,
        nameUrdu: c.nameUrdu,
        phone: c.phone,
        balance: round(c.balance),
        previousNetProfit,
        // null when there is nothing to compare with — "new" rather than +∞%.
        growth:
          prev && Math.abs(previousNetProfit) > 0.005
            ? pct(m.netProfit - previousNetProfit, Math.abs(previousNetProfit))
            : null,
      };
    });

  if (search) {
    rows = rows.filter((r) =>
      [r.name, r.nameUrdu, r.phone].filter(Boolean).some((v) => String(v).toLowerCase().includes(search))
    );
  }
  if (query.filter === 'loss') rows = rows.filter((r) => r.netProfit < -0.005);
  if (query.filter === 'discounted') rows = rows.filter((r) => r.ledgerDiscount > 0);

  // Totals on the filtered set, ranks/shares on profit.
  const total = rows.reduce(
    (t, r) => ({
      netRevenue: t.netRevenue + r.netRevenue,
      cost: t.cost + r.cost,
      grossProfit: t.grossProfit + r.grossProfit,
      returnsProfit: t.returnsProfit + r.returnsProfit,
      ledgerDiscount: t.ledgerDiscount + r.ledgerDiscount,
      billDiscounts: t.billDiscounts + r.billDiscounts,
      netProfit: t.netProfit + r.netProfit,
      invoices: t.invoices + r.invoices,
    }),
    {
      netRevenue: 0,
      cost: 0,
      grossProfit: 0,
      returnsProfit: 0,
      ledgerDiscount: 0,
      billDiscounts: 0,
      netProfit: 0,
      invoices: 0,
    }
  );
  Object.keys(total).forEach((k) => {
    if (k !== 'invoices') total[k] = round(total[k]);
  });

  const byProfit = [...rows].sort((a, b) => b.netProfit - a.netProfit);
  const rank = new Map(byProfit.map((r, i) => [r.customerId, i + 1]));
  const positive = byProfit.filter((r) => r.netProfit > 0);
  const positiveTotal = positive.reduce((s, r) => s + r.netProfit, 0);
  // Pareto: how much of the profit the top 20% of customers bring.
  const topCount = Math.max(1, Math.ceil(byProfit.length * 0.2));
  const topShare =
    positiveTotal > 0
      ? pct(
          positive.slice(0, topCount).reduce((s, r) => s + r.netProfit, 0),
          positiveTotal
        )
      : 0;

  const sort = SORTS.has(query.sort) ? query.sort : 'netProfit';
  const dir = query.order === 'asc' ? 1 : -1;
  const value = (r) => {
    if (sort === 'lastSaleAt') return r.lastSaleAt ? new Date(r.lastSaleAt).getTime() : 0;
    if (sort === 'growth') return r.growth === null ? -Infinity : r.growth;
    return Number(r[sort]) || 0;
  };
  rows.sort((a, b) => (value(a) - value(b)) * dir || a.name.localeCompare(b.name));

  return {
    period: {
      startDate: toBusinessCalendarDate(period.start),
      endDate: toBusinessCalendarDate(period.end),
      days: period.days,
    },
    summary: {
      customers: rows.length,
      ...total,
      margin: pct(total.netProfit, total.netRevenue),
      lossMaking: rows.filter((r) => r.netProfit < -0.005).length,
      topShare,
      topCount,
      previousNetProfit: round(rows.reduce((s, r) => s + r.previousNetProfit, 0)),
    },
    rows: rows.map((r) => ({ ...r, rank: rank.get(r.customerId) })),
  };
};

/**
 * One customer's profitability (ledger page card + drill-down): the period figures, the
 * previous period, a monthly trend, and which products / invoices make or lose the money.
 */
const getCustomerDetail = async (tenant, customerId, query = {}) => {
  const scope = scopeOf(tenant);
  if (!isObjectIdString(customerId)) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid customer');
  const customer = await Customer.findOne({ _id: customerId, organizationId: scope.organizationId })
    .select('name nameUrdu phone balance')
    .lean();
  if (!customer) throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
  const period = resolvePeriod(query);
  const ids = [String(customerId)];

  const [current, previous, lifetime] = await Promise.all([
    computeWindow(scope, period.start, period.end, ids),
    computeWindow(scope, period.previous.start, period.previous.end, ids),
    computeWindow(scope, new Date(0), new Date(), ids),
  ]);
  const empty = (id) => ({
    customerId: id,
    invoices: 0,
    units: 0,
    revenue: 0,
    billDiscounts: 0,
    grossProfit: 0,
    returnsValue: 0,
    returnsProfit: 0,
    ledgerDiscount: 0,
    ledgerDiscountCount: 0,
    netRevenue: 0,
    cost: 0,
    netProfit: 0,
    margin: 0,
    avgProfitPerInvoice: 0,
    firstSaleAt: null,
    lastSaleAt: null,
  });
  const m = current.get(ids[0]) || empty(ids[0]);
  const prev = previous.get(ids[0]) || empty(ids[0]);
  const life = lifetime.get(ids[0]) || empty(ids[0]);

  const invoiceMatch = {
    ...scope,
    ...SOLD_INVOICE_MATCH,
    invoiceDate: { $gte: period.start, $lte: period.end },
    customerId: { $in: idForms(ids) },
  };

  const [products, invoices, monthly] = await Promise.all([
    // Products this customer buys, by profit (bill discount pro-rated onto lines).
    Invoice.aggregate([
      { $match: invoiceMatch },
      { $project: { items: 1, discount: 1, _subtotal: { $sum: '$items.subtotal' } } },
      { $unwind: '$items' },
      {
        $addFields: {
          _bill: {
            $cond: [
              { $and: [{ $gt: [{ $ifNull: ['$discount', 0] }, 0] }, { $gt: ['$_subtotal', 0] }] },
              { $multiply: ['$discount', { $divide: [{ $ifNull: ['$items.subtotal', 0] }, '$_subtotal'] }] },
              0,
            ],
          },
        },
      },
      {
        $group: {
          _id: '$items.productId',
          name: { $first: '$items.name' },
          units: { $sum: { $ifNull: ['$items.stockQuantity', { $ifNull: ['$items.quantity', 0] }] } },
          revenue: { $sum: { $subtract: [{ $ifNull: ['$items.subtotal', 0] }, '$_bill'] } },
          profit: { $sum: { $subtract: [{ $ifNull: ['$items.profit', 0] }, '$_bill'] } },
          invoices: { $addToSet: '$_id' },
        },
      },
      { $sort: { profit: -1 } },
      { $limit: 50 },
    ]),
    // Each invoice's own profit, to find the best and the weakest bills.
    Invoice.aggregate([
      { $match: invoiceMatch },
      {
        $project: {
          invoiceNumber: 1,
          invoiceDate: 1,
          type: 1,
          total: 1,
          revenue: { $subtract: [{ $sum: '$items.subtotal' }, { $ifNull: ['$discount', 0] }] },
          profit: { $subtract: [{ $sum: '$items.profit' }, { $ifNull: ['$discount', 0] }] },
        },
      },
      { $sort: { invoiceDate: -1 } },
      { $limit: 500 },
    ]),
    Invoice.aggregate([
      { $match: invoiceMatch },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$invoiceDate', timezone: 'Asia/Karachi' } },
          revenue: { $sum: { $subtract: [{ $sum: '$items.subtotal' }, { $ifNull: ['$discount', 0] }] } },
          profit: { $sum: { $subtract: [{ $sum: '$items.profit' }, { $ifNull: ['$discount', 0] }] } },
          invoices: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const invoiceRows = invoices.map((inv) => ({
    id: String(inv._id),
    invoiceNumber: inv.invoiceNumber,
    date: inv.invoiceDate,
    type: inv.type,
    revenue: round(inv.revenue),
    profit: round(inv.profit),
    margin: pct(inv.profit, inv.revenue),
  }));

  return {
    customer: {
      id: String(customer._id),
      name: customer.name,
      nameUrdu: customer.nameUrdu,
      phone: customer.phone,
      balance: round(customer.balance),
    },
    period: {
      startDate: toBusinessCalendarDate(period.start),
      endDate: toBusinessCalendarDate(period.end),
      days: period.days,
    },
    metrics: m,
    previous: prev,
    lifetime: life,
    growth: Math.abs(prev.netProfit) > 0.005 ? pct(m.netProfit - prev.netProfit, Math.abs(prev.netProfit)) : null,
    products: products.map((p) => ({
      productId: p._id ? String(p._id) : null,
      name: p.name || 'Product',
      units: round(p.units),
      revenue: round(p.revenue),
      profit: round(p.profit),
      margin: pct(p.profit, p.revenue),
      invoices: (p.invoices || []).length,
    })),
    invoices: invoiceRows,
    lowMarginInvoices: [...invoiceRows]
      .filter((r) => r.revenue > 0)
      .sort((a, b) => a.margin - b.margin)
      .slice(0, 5),
    monthly: monthly.map((row) => ({
      month: row._id,
      revenue: round(row.revenue),
      profit: round(row.profit),
      invoices: row.invoices,
    })),
  };
};

module.exports = { getRanking, getCustomerDetail, computeWindow, resolvePeriod };
