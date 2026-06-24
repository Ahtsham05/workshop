const mongoose = require('mongoose');
const { Insight, Invoice, Product, Customer, Branch } = require('../models');

/* ────────────────────────────────────────────────────────────────────────
 * CONFIG — every "magic number" the engine uses lives here so behaviour
 * can be tuned without hunting through the algorithms below.
 * ──────────────────────────────────────────────────────────────────────── */
const CONFIG = {
  SALES_WINDOW_DAYS: 30, // "last 30 days" window used for run-rate calculations
  DEAD_STOCK_WINDOW_DAYS: 90, // no sales in this many days + stock on hand = dead stock
  INACTIVE_CUSTOMER_DAYS: 90, // no orders in this many days = inactive
  LEAD_TIME_DAYS: 7, // supplier lead time used in the reorder point formula
  REORDER_BUFFER_DAYS: 7, // extra safety-stock days layered on top of lead time
  STOCK_OUT_RISK_DAYS: 14, // flag STOCK_OUT_RISK when daysRemaining <= this
  SLOW_MOVER_MAX_UNITS_30D: 3, // <= this many units sold in 30 days (and in stock) = slow mover
  HIGH_GROWTH_THRESHOLD_PCT: 50, // product unit growth >= this % triggers HIGH_GROWTH_PRODUCT
  SALES_DROP_THRESHOLD_PCT: -15, // store/product revenue growth <= this % triggers SALES_DROP
  MIN_VOLUME_FOR_GROWTH_ALERTS: 5, // ignore growth/drop noise below this unit volume
  VIP_CUSTOMER_TOP_N: 10,
  ABC_THRESHOLD_A_PCT: 70, // cumulative revenue % boundary for "A" products
  ABC_THRESHOLD_B_PCT: 90, // cumulative revenue % boundary for "B" products
  INSIGHT_TTL_HOURS: 48, // insights auto-expire (TTL index) this many hours after generation
  TOP_LIST_SIZE: 10,
  BRANCH_UNDERPERFORM_PCT_OF_AVG: 50, // branch revenue below this % of the org average gets flagged
  FBT_MIN_PAIR_COUNT: 3, // a product pair must co-occur on at least this many invoices to surface
};

/** Sales/Invoice statuses & types that count as real, completed revenue. */
const SALES_MATCH_BASE = {
  type: { $ne: 'quotation' },
  status: { $ne: 'cancelled' },
};

const toObjectId = (id) => {
  if (id instanceof mongoose.Types.ObjectId) return id;
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(String(id)) : id;
};

/* ────────────────────────────────────────────────────────────────────────
 * DATE HELPERS
 * ──────────────────────────────────────────────────────────────────────── */
const daysAgo = (n, from = new Date()) => new Date(from.getTime() - n * 24 * 60 * 60 * 1000);

const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

const getDateRanges = (now = new Date()) => {
  const currentMonthStart = startOfMonth(now);
  const previousMonthStart = startOfMonth(new Date(currentMonthStart.getTime() - 1));
  return {
    now,
    last30: { start: daysAgo(CONFIG.SALES_WINDOW_DAYS, now), end: now },
    prev30: { start: daysAgo(CONFIG.SALES_WINDOW_DAYS * 2, now), end: daysAgo(CONFIG.SALES_WINDOW_DAYS, now) },
    last90: { start: daysAgo(CONFIG.DEAD_STOCK_WINDOW_DAYS, now), end: now },
    currentMonth: { start: currentMonthStart, end: now },
    previousMonth: { start: previousMonthStart, end: currentMonthStart },
  };
};

/* ────────────────────────────────────────────────────────────────────────
 * ALGORITHMS (pure functions — no I/O, easy to unit test)
 * ──────────────────────────────────────────────────────────────────────── */

/** ALGORITHM 1 — Sales Growth %: (current - previous) / previous * 100 */
const calcGrowthPercent = (current, previous) => {
  if (previous > 0) return ((current - previous) / previous) * 100;
  if (current > 0) return 100; // new/no baseline but selling now — treat as +100% (flagged via meta.noBaseline)
  return 0;
};

/** ALGORITHM 2 — Daily Sales Rate: salesLast30Days / 30 */
const calcDailySalesRate = (unitsSoldLast30Days) => unitsSoldLast30Days / CONFIG.SALES_WINDOW_DAYS;

/** ALGORITHM 3 — Stock Out Prediction: stock / dailySalesRate (days remaining) */
const calcDaysRemaining = (stock, dailySalesRate) => {
  if (dailySalesRate <= 0) return stock > 0 ? Infinity : 0;
  return stock / dailySalesRate;
};

/** ALGORITHM 4 — Reorder Point: dailySalesRate * leadTime, plus a safety buffer for the suggested qty. */
const calcReorderPoint = (dailySalesRate, leadTimeDays = CONFIG.LEAD_TIME_DAYS) => dailySalesRate * leadTimeDays;

const calcSuggestedReorderQty = (stock, dailySalesRate) => {
  const targetCoverDays = CONFIG.LEAD_TIME_DAYS + CONFIG.REORDER_BUFFER_DAYS;
  const targetStock = dailySalesRate * targetCoverDays;
  return Math.max(0, Math.ceil(targetStock - stock));
};

/** ALGORITHM 5 — Profit Calculation: sellingPrice - costPrice (per unit), plus margin %. */
const calcUnitProfit = (sellingPrice, costPrice) => sellingPrice - costPrice;
const calcMarginPercent = (sellingPrice, costPrice) =>
  sellingPrice > 0 ? (calcUnitProfit(sellingPrice, costPrice) / sellingPrice) * 100 : 0;

/** ALGORITHM 6 — ABC Classification by cumulative revenue share: A=70%, B=next 20%, C=remaining 10%. */
const classifyABC = (productsSortedByRevenueDesc, totalRevenue) => {
  let cumulative = 0;
  return productsSortedByRevenueDesc.map((p) => {
    cumulative += p.revenue;
    const cumulativePct = totalRevenue > 0 ? (cumulative / totalRevenue) * 100 : 100;
    let cls = 'C';
    if (cumulativePct <= CONFIG.ABC_THRESHOLD_A_PCT) cls = 'A';
    else if (cumulativePct <= CONFIG.ABC_THRESHOLD_B_PCT) cls = 'B';
    return { ...p, abcClass: cls, cumulativeRevenuePct: Math.round(cumulativePct * 100) / 100 };
  });
};

/** Confidence is just a proxy for "how much data backs this number" — bigger sample, higher confidence. */
const confidenceFromSampleSize = (orders) => {
  if (orders >= 10) return 'high';
  if (orders >= 3) return 'medium';
  return 'low';
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** 'high'/'medium'/'low' don't sort correctly as strings — rank them numerically instead. */
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const sortByPriorityThenRecency = (docs) =>
  [...docs].sort((a, b) => {
    const rankDiff = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
    if (rankDiff !== 0) return rankDiff;
    return new Date(b.generatedAt) - new Date(a.generatedAt);
  });

/* ────────────────────────────────────────────────────────────────────────
 * DATA FETCHERS — one aggregation pipeline per question, reused everywhere.
 * ──────────────────────────────────────────────────────────────────────── */

/** Per-product sales totals within a date range, aggregated straight from invoice line items. */
const aggregateProductSales = async ({ organizationId, branchId, start, end }) => {
  const rows = await Invoice.aggregate([
    {
      $match: {
        organizationId,
        branchId,
        invoiceDate: { $gte: start, $lte: end },
        ...SALES_MATCH_BASE,
      },
    },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.productId',
        quantitySold: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.subtotal' },
        profit: { $sum: '$items.profit' },
        orders: { $sum: 1 },
        lastSoldAt: { $max: '$invoiceDate' },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
};

/** Store-wide totals (revenue/profit/orders) within a date range — used for growth % and SALES_DROP. */
const aggregateStoreTotals = async ({ organizationId, branchId, start, end }) => {
  const [row] = await Invoice.aggregate([
    {
      $match: {
        organizationId,
        branchId,
        invoiceDate: { $gte: start, $lte: end },
        ...SALES_MATCH_BASE,
      },
    },
    {
      $group: {
        _id: null,
        revenue: { $sum: '$total' },
        profit: { $sum: '$totalProfit' },
        orders: { $sum: 1 },
      },
    },
  ]);
  return row || { revenue: 0, profit: 0, orders: 0 };
};

/** Lifetime per-customer totals — registered customers only (walk-ins carry a string id, not ObjectId). */
const aggregateCustomerLifetime = async ({ organizationId, branchId }) => {
  return Invoice.aggregate([
    {
      $match: {
        organizationId,
        branchId,
        customerId: { $type: 'objectId' },
        ...SALES_MATCH_BASE,
      },
    },
    {
      $group: {
        _id: '$customerId',
        totalRevenue: { $sum: '$total' },
        totalOrders: { $sum: 1 },
        firstOrderAt: { $min: '$invoiceDate' },
        lastOrderAt: { $max: '$invoiceDate' },
      },
    },
    { $sort: { totalRevenue: -1 } },
  ]);
};

/** Org-wide totals grouped by branch — feeds branch-comparison insights. */
const aggregateBranchTotals = async ({ organizationId, start, end }) => {
  const rows = await Invoice.aggregate([
    {
      $match: {
        organizationId,
        invoiceDate: { $gte: start, $lte: end },
        ...SALES_MATCH_BASE,
      },
    },
    {
      $group: {
        _id: '$branchId',
        revenue: { $sum: '$total' },
        profit: { $sum: '$totalProfit' },
        orders: { $sum: 1 },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
};

/** Counts how often pairs of products appear together on the same invoice — cross-sell candidates. */
const aggregateFrequentlyBoughtTogether = async ({ organizationId, branchId, start, end }) => {
  const invoices = await Invoice.find({
    organizationId,
    branchId,
    invoiceDate: { $gte: start, $lte: end },
    ...SALES_MATCH_BASE,
  })
    .select('items.productId')
    .lean();

  const pairCounts = new Map(); // "idA|idB" (sorted) -> count
  for (const invoice of invoices) {
    const productIds = [...new Set((invoice.items || []).map((i) => String(i.productId)).filter(Boolean))];
    if (productIds.length < 2) continue;
    for (let i = 0; i < productIds.length; i += 1) {
      for (let j = i + 1; j < productIds.length; j += 1) {
        const [a, b] = [productIds[i], productIds[j]].sort();
        const key = `${a}|${b}`;
        pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
      }
    }
  }

  return [...pairCounts.entries()]
    .map(([key, count]) => {
      const [productAId, productBId] = key.split('|');
      return { productAId, productBId, count };
    })
    .filter((p) => p.count >= CONFIG.FBT_MIN_PAIR_COUNT)
    .sort((a, b) => b.count - a.count);
};

/* ────────────────────────────────────────────────────────────────────────
 * INSIGHT BUILDERS — turn computed metrics into human-readable cards.
 * Each returns a plain object matching the Insight schema (minus org/branch/expiresAt,
 * which the orchestrator stamps on before saving).
 * ──────────────────────────────────────────────────────────────────────── */

const buildTopSellingInsight = (topProducts) => {
  if (topProducts.length === 0) return null;
  const leader = topProducts[0];
  return {
    type: 'top_selling_product',
    category: 'sales',
    priority: 'low',
    confidence: confidenceFromSampleSize(leader.orders),
    title: `${leader.name} is your best seller`,
    description: `${leader.name} sold ${leader.quantitySold} units (Rs${round2(leader.revenue)}) in the last ${CONFIG.SALES_WINDOW_DAYS} days — your #1 product by revenue.`,
    meta: { products: topProducts.slice(0, CONFIG.TOP_LIST_SIZE) },
  };
};

const buildSlowMoverInsight = (slowMovers) => {
  if (slowMovers.length === 0) return null;
  return {
    type: 'slow_moving_product',
    category: 'sales',
    priority: 'low',
    confidence: 'medium',
    title: `${slowMovers.length} product(s) are moving slowly`,
    description: `These products sold ${CONFIG.SLOW_MOVER_MAX_UNITS_30D} units or fewer in the last ${CONFIG.SALES_WINDOW_DAYS} days despite being in stock. Consider a promotion or bundle.`,
    meta: { products: slowMovers.slice(0, CONFIG.TOP_LIST_SIZE) },
  };
};

const buildMonthlyGrowthInsight = (growthPercent, current, previous, noBaseline) => {
  const direction = growthPercent >= 0 ? 'up' : 'down';
  return {
    type: 'monthly_sales_growth',
    category: 'sales',
    priority: growthPercent <= CONFIG.SALES_DROP_THRESHOLD_PCT ? 'high' : 'low',
    confidence: noBaseline ? 'low' : confidenceFromSampleSize(previous > 0 ? 10 : 0),
    title: noBaseline
      ? 'Not enough history yet for a month-over-month comparison'
      : `Sales are ${direction} ${Math.abs(round2(growthPercent))}% vs last month`,
    description: noBaseline
      ? `This month's revenue is Rs${round2(current)}, but last month has no recorded sales to compare against.`
      : `This month's revenue is Rs${round2(current)} compared to Rs${round2(previous)} last month — a ${round2(growthPercent)}% change.`,
    meta: { growthPercent: round2(growthPercent), currentMonthRevenue: round2(current), previousMonthRevenue: round2(previous), noBaseline },
  };
};

const buildBestCategoryInsight = (categories) => {
  if (categories.length === 0) return null;
  const leader = categories[0];
  return {
    type: 'best_performing_category',
    category: 'sales',
    priority: 'low',
    confidence: 'medium',
    title: `"${leader.name}" is your top category`,
    description: `"${leader.name}" generated Rs${round2(leader.revenue)} in the last ${CONFIG.SALES_WINDOW_DAYS} days, ahead of all other categories.`,
    meta: { categories: categories.slice(0, CONFIG.TOP_LIST_SIZE) },
  };
};

const buildLowStockInsight = (product) => ({
  type: 'low_stock',
  category: 'inventory',
  priority: product.stock <= Math.max(1, Math.round(product.reorderPoint * 0.3)) ? 'high' : 'medium',
  confidence: confidenceFromSampleSize(product.orders),
  title: `${product.name} is running low`,
  description: `Only ${product.stock} unit(s) left. Based on recent sales of ~${round2(product.dailySalesRate)}/day, this is below the recommended reorder point of ${Math.ceil(product.reorderPoint)} units.`,
  meta: {
    productId: product.productId,
    name: product.name,
    stock: product.stock,
    reorderPoint: round2(product.reorderPoint),
    dailySalesRate: round2(product.dailySalesRate),
  },
});

const buildStockOutRiskInsight = (product) => {
  const days = Math.max(0, Math.round(product.daysRemaining));
  return {
    type: 'stock_out_risk',
    category: 'inventory',
    priority: days <= 3 ? 'high' : days <= 7 ? 'medium' : 'low',
    confidence: confidenceFromSampleSize(product.orders),
    title: days === 0 ? `${product.name} is already out of stock` : `${product.name} may run out soon`,
    description:
      days === 0
        ? `Recent sales have sold through all remaining stock. Reorder as soon as possible to avoid lost sales.`
        : `Based on last ${CONFIG.SALES_WINDOW_DAYS} days sales, stock will last approximately ${days} day(s).`,
    meta: { productId: product.productId, name: product.name, daysRemaining: days, stock: product.stock, dailySalesRate: round2(product.dailySalesRate) },
  };
};

const buildReorderSuggestionInsight = (product) => ({
  type: 'reorder_suggestion',
  category: 'inventory',
  priority: product.daysRemaining <= 7 ? 'high' : 'medium',
  confidence: confidenceFromSampleSize(product.orders),
  title: `Reorder ${product.suggestedReorderQty} unit(s) of ${product.name}`,
  description: `To stay covered through your ${CONFIG.LEAD_TIME_DAYS}-day supplier lead time plus a safety buffer, order ${product.suggestedReorderQty} more unit(s) now.`,
  meta: {
    productId: product.productId,
    name: product.name,
    suggestedReorderQty: product.suggestedReorderQty,
    leadTimeDays: CONFIG.LEAD_TIME_DAYS,
    stock: product.stock,
  },
});

const buildDeadStockInsight = (deadProducts) => {
  if (deadProducts.length === 0) return null;
  const tiedUpCapital = deadProducts.reduce((sum, p) => sum + p.stock * p.cost, 0);
  return {
    type: 'dead_stock',
    category: 'inventory',
    priority: tiedUpCapital > 10000 ? 'high' : 'medium',
    confidence: 'high',
    title: `${deadProducts.length} product(s) haven't sold in ${CONFIG.DEAD_STOCK_WINDOW_DAYS}+ days`,
    description: `These products are tying up about Rs${round2(tiedUpCapital)} in unsold stock. Consider discounting or clearing them out.`,
    meta: { products: deadProducts.slice(0, CONFIG.TOP_LIST_SIZE), tiedUpCapital: round2(tiedUpCapital) },
  };
};

const buildMarginInsight = (type, products, label) => {
  if (products.length === 0) return null;
  const leader = products[0];
  return {
    type,
    category: 'profit',
    priority: 'low',
    confidence: 'medium',
    title: type === 'high_margin_product'
      ? `${leader.name} has your best profit margin`
      : `${leader.name} has a thin profit margin`,
    description: `${leader.name} sells at a ${round2(leader.marginPercent)}% margin (Rs${round2(leader.unitProfit)} profit per unit). ${label}`,
    meta: { products: products.slice(0, CONFIG.TOP_LIST_SIZE) },
  };
};

const buildVipCustomerInsight = (vips, totalRevenue) => {
  if (vips.length === 0) return null;
  const leader = vips[0];
  const sharePct = totalRevenue > 0 ? (leader.totalRevenue / totalRevenue) * 100 : 0;
  return {
    type: 'vip_customer',
    category: 'customer',
    priority: 'low',
    confidence: confidenceFromSampleSize(leader.totalOrders),
    title: `${leader.name} is your top customer`,
    description: `${leader.name} has spent Rs${round2(leader.totalRevenue)} across ${leader.totalOrders} order(s) — ${round2(sharePct)}% of all customer revenue.`,
    meta: { customers: vips.slice(0, CONFIG.VIP_CUSTOMER_TOP_N) },
  };
};

const buildInactiveCustomerInsight = (inactive) => {
  if (inactive.length === 0) return null;
  return {
    type: 'inactive_customer',
    category: 'customer',
    priority: 'medium',
    confidence: 'high',
    title: `${inactive.length} customer(s) have gone quiet`,
    description: `These customers haven't ordered in ${CONFIG.INACTIVE_CUSTOMER_DAYS}+ days despite having purchased before. A re-engagement offer could win them back.`,
    meta: { customers: inactive.slice(0, CONFIG.TOP_LIST_SIZE) },
  };
};

const buildContributionInsight = (topCustomers, totalRevenue) => {
  if (topCustomers.length === 0) return null;
  const topShare = topCustomers.reduce((s, c) => s + c.totalRevenue, 0);
  const sharePct = totalRevenue > 0 ? (topShare / totalRevenue) * 100 : 0;
  const concentrationRisk = sharePct >= 50;
  return {
    type: 'customer_contribution',
    category: 'customer',
    priority: concentrationRisk ? 'medium' : 'low',
    confidence: 'high',
    title: concentrationRisk
      ? `Your top ${topCustomers.length} customers drive ${round2(sharePct)}% of revenue`
      : `Revenue is reasonably spread across your customer base`,
    description: concentrationRisk
      ? `Revenue is concentrated in a small group of customers. Losing even one could meaningfully impact sales — consider diversifying your customer base.`
      : `Your top ${topCustomers.length} customers account for ${round2(sharePct)}% of revenue, a healthy spread.`,
    meta: { topCustomersSharePct: round2(sharePct), customers: topCustomers.slice(0, CONFIG.VIP_CUSTOMER_TOP_N) },
  };
};

const buildHighGrowthAlert = (product) => ({
  type: 'high_growth_product',
  category: 'alert',
  priority: product.growthPercent >= 100 ? 'high' : 'medium',
  confidence: confidenceFromSampleSize(product.orders),
  title: `${product.name} is trending up`,
  description: `Sales grew ${round2(product.growthPercent)}% vs the previous ${CONFIG.SALES_WINDOW_DAYS} days (${product.prevQuantitySold} → ${product.quantitySold} units). Make sure stock keeps up.`,
  meta: { productId: product.productId, name: product.name, growthPercent: round2(product.growthPercent), scope: 'product' },
});

const buildSalesDropAlert = ({ scope, name, productId, growthPercent, current, previous }) => ({
  type: 'sales_drop',
  category: 'alert',
  priority: growthPercent <= -30 ? 'high' : 'medium',
  confidence: 'medium',
  title: scope === 'store' ? 'Overall sales are dropping' : `${name} sales are dropping`,
  description: `${scope === 'store' ? 'Store-wide revenue' : `${name} revenue`} fell ${Math.abs(round2(growthPercent))}% (Rs${round2(previous)} → Rs${round2(current)}).`,
  meta: { scope, productId, name, growthPercent: round2(growthPercent) },
});

const buildFrequentlyBoughtTogetherInsight = (pairs) => {
  if (pairs.length === 0) return null;
  const top = pairs[0];
  return {
    type: 'frequently_bought_together',
    category: 'sales',
    priority: 'low',
    confidence: confidenceFromSampleSize(top.count),
    title: `${top.productAName} and ${top.productBName} are often bought together`,
    description: `These products appeared on the same invoice ${top.count} times in the last ${CONFIG.SALES_WINDOW_DAYS} days. Consider bundling or cross-promoting them.`,
    meta: { pairs: pairs.slice(0, CONFIG.TOP_LIST_SIZE) },
  };
};

const buildAtRiskCustomerInsight = (atRiskCustomers) => {
  if (atRiskCustomers.length === 0) return null;
  return {
    type: 'at_risk_customer',
    category: 'customer',
    priority: 'medium',
    confidence: 'medium',
    title: `${atRiskCustomers.length} customer(s) are at risk of churning`,
    description: `These customers haven't ordered in 30+ days after a history of regular purchases — they're not yet inactive, but the slowdown is worth a check-in before they go quiet.`,
    meta: { customers: atRiskCustomers.slice(0, CONFIG.TOP_LIST_SIZE) },
  };
};

const buildBranchTopPerformerInsight = (branches) => {
  if (branches.length === 0) return null;
  const leader = branches[0];
  return {
    type: 'branch_top_performer',
    category: 'branch_comparison',
    priority: 'low',
    confidence: 'medium',
    title: `${leader.name} is your top-performing branch`,
    description: `${leader.name} generated Rs${round2(leader.revenue)} this month, ahead of all other branches.`,
    meta: { branches: branches.slice(0, CONFIG.TOP_LIST_SIZE) },
  };
};

const buildBranchUnderperformerInsight = (branches, avgRevenue) => {
  if (branches.length === 0) return null;
  return {
    type: 'branch_underperformer',
    category: 'branch_comparison',
    priority: branches.some((b) => b.revenue <= avgRevenue * 0.25) ? 'high' : 'medium',
    confidence: 'medium',
    title: `${branches.length} branch(es) are underperforming this month`,
    description: `These branches are generating well below the org-wide average of Rs${round2(avgRevenue)} per branch this month — worth investigating staffing, stock, or local demand.`,
    meta: { branches: branches.slice(0, CONFIG.TOP_LIST_SIZE), avgRevenue: round2(avgRevenue) },
  };
};

/* ────────────────────────────────────────────────────────────────────────
 * ORCHESTRATOR — runs every algorithm for one branch and returns insight
 * objects ready to be persisted.
 * ──────────────────────────────────────────────────────────────────────── */

const generateInsightsForBranch = async ({ organizationId, branchId }) => {
  const orgId = toObjectId(organizationId);
  const brId = toObjectId(branchId);
  const ranges = getDateRanges();
  const insights = [];

  const [
    products,
    salesLast30,
    salesPrev30,
    salesLast90,
    storeCurrentMonth,
    storePreviousMonth,
    customerLifetime,
    fbtPairsRaw,
  ] = await Promise.all([
    Product.find({ organizationId: orgId, branchId: brId })
      .select('name cost price stockQuantity categories category createdAt')
      .lean(),
    aggregateProductSales({ organizationId: orgId, branchId: brId, ...ranges.last30 }),
    aggregateProductSales({ organizationId: orgId, branchId: brId, ...ranges.prev30 }),
    aggregateProductSales({ organizationId: orgId, branchId: brId, ...ranges.last90 }),
    aggregateStoreTotals({ organizationId: orgId, branchId: brId, ...ranges.currentMonth }),
    aggregateStoreTotals({ organizationId: orgId, branchId: brId, ...ranges.previousMonth }),
    aggregateCustomerLifetime({ organizationId: orgId, branchId: brId }),
    aggregateFrequentlyBoughtTogether({ organizationId: orgId, branchId: brId, ...ranges.last30 }),
  ]);

  /* ── Per-product metrics: merge current product state with sales history ── */
  const productMetrics = products.map((p) => {
    const id = String(p._id);
    const s30 = salesLast30.get(id) || { quantitySold: 0, revenue: 0, profit: 0, orders: 0, lastSoldAt: null };
    const sPrev30 = salesPrev30.get(id) || { quantitySold: 0, revenue: 0, profit: 0, orders: 0 };
    const s90 = salesLast90.get(id) || { quantitySold: 0, lastSoldAt: null };

    const dailySalesRate = calcDailySalesRate(s30.quantitySold);
    const daysRemaining = calcDaysRemaining(p.stockQuantity, dailySalesRate);
    const reorderPoint = calcReorderPoint(dailySalesRate);
    const suggestedReorderQty = calcSuggestedReorderQty(p.stockQuantity, dailySalesRate);
    const unitProfit = calcUnitProfit(p.price, p.cost);
    const marginPercent = calcMarginPercent(p.price, p.cost);
    const growthPercent = calcGrowthPercent(s30.quantitySold, sPrev30.quantitySold);
    const categoryName = p.categories?.[0]?.name || p.category || 'Uncategorized';

    return {
      productId: id,
      name: p.name,
      stock: p.stockQuantity,
      cost: p.cost,
      price: p.price,
      categoryName,
      createdAt: p.createdAt,
      quantitySold: s30.quantitySold,
      prevQuantitySold: sPrev30.quantitySold,
      revenue: s30.revenue,
      profit: s30.profit,
      orders: s30.orders,
      lastSoldAt: s90.lastSoldAt,
      dailySalesRate,
      daysRemaining,
      reorderPoint,
      suggestedReorderQty,
      unitProfit,
      marginPercent,
      growthPercent,
    };
  });

  /* ── 1. SALES INSIGHTS ───────────────────────────────────────────────── */
  const topByRevenue = [...productMetrics].filter((p) => p.revenue > 0).sort((a, b) => b.revenue - a.revenue);
  const topByQuantity = [...productMetrics].filter((p) => p.quantitySold > 0).sort((a, b) => b.quantitySold - a.quantitySold);
  insights.push(buildTopSellingInsight(topByRevenue));

  const slowMovers = productMetrics.filter((p) => p.stock > 0 && p.quantitySold <= CONFIG.SLOW_MOVER_MAX_UNITS_30D);
  insights.push(buildSlowMoverInsight(slowMovers));

  const growthPercent = calcGrowthPercent(storeCurrentMonth.revenue, storePreviousMonth.revenue);
  insights.push(
    buildMonthlyGrowthInsight(growthPercent, storeCurrentMonth.revenue, storePreviousMonth.revenue, storePreviousMonth.revenue === 0),
  );

  const categoryRevenue = new Map();
  for (const p of productMetrics) {
    categoryRevenue.set(p.categoryName, (categoryRevenue.get(p.categoryName) || 0) + p.revenue);
  }
  const categories = [...categoryRevenue.entries()]
    .map(([name, revenue]) => ({ name, revenue }))
    .filter((c) => c.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);
  insights.push(buildBestCategoryInsight(categories));

  const productNameMap = new Map(productMetrics.map((p) => [p.productId, p.name]));
  const fbtPairs = fbtPairsRaw
    .map((pair) => ({
      ...pair,
      productAName: productNameMap.get(pair.productAId) || 'Unknown product',
      productBName: productNameMap.get(pair.productBId) || 'Unknown product',
    }))
    .filter((pair) => productNameMap.has(pair.productAId) && productNameMap.has(pair.productBId));
  insights.push(buildFrequentlyBoughtTogetherInsight(fbtPairs));

  /* ── 2. INVENTORY INTELLIGENCE ───────────────────────────────────────── */
  const lowStockProducts = productMetrics.filter(
    (p) => p.stock > 0 && p.dailySalesRate > 0 && p.stock <= p.reorderPoint,
  );
  for (const p of lowStockProducts) insights.push(buildLowStockInsight(p));

  const stockOutRiskProducts = productMetrics.filter(
    (p) => p.dailySalesRate > 0 && p.daysRemaining <= CONFIG.STOCK_OUT_RISK_DAYS,
  );
  for (const p of stockOutRiskProducts) insights.push(buildStockOutRiskInsight(p));

  const reorderCandidates = productMetrics.filter((p) => p.suggestedReorderQty > 0 && p.dailySalesRate > 0);
  for (const p of reorderCandidates) insights.push(buildReorderSuggestionInsight(p));

  const deadStockCutoff = daysAgo(CONFIG.DEAD_STOCK_WINDOW_DAYS);
  const deadProducts = productMetrics.filter((p) => {
    const neverSoldRecently = !p.lastSoldAt || new Date(p.lastSoldAt) < deadStockCutoff;
    const isOldEnoughToJudge = !p.createdAt || new Date(p.createdAt) < deadStockCutoff;
    return p.stock > 0 && neverSoldRecently && isOldEnoughToJudge;
  });
  insights.push(buildDeadStockInsight(deadProducts));

  /* ── 3. PROFIT ANALYTICS ─────────────────────────────────────────────── */
  const byMargin = [...productMetrics].sort((a, b) => b.marginPercent - a.marginPercent);
  insights.push(buildMarginInsight('high_margin_product', byMargin, 'Push this product to grow profit faster.'));
  insights.push(
    buildMarginInsight(
      'low_margin_product',
      [...byMargin].reverse(),
      'Consider renegotiating cost or adjusting the sale price.',
    ),
  );

  /* ABC classification — exposed via meta on the margin insight set, also computed standalone for the API. */
  const abcClassified = classifyABC(
    topByRevenue.map((p) => ({ productId: p.productId, name: p.name, revenue: p.revenue })),
    topByRevenue.reduce((s, p) => s + p.revenue, 0),
  );

  /* ── 4. CUSTOMER INTELLIGENCE ─────────────────────────────────────────── */
  const customerIds = customerLifetime.map((c) => c._id);
  const customerDocs = customerIds.length
    ? await Customer.find({ _id: { $in: customerIds } }).select('name phone').lean()
    : [];
  const customerNameMap = new Map(customerDocs.map((c) => [String(c._id), c.name]));

  const customersRanked = customerLifetime.map((c) => ({
    customerId: String(c._id),
    name: customerNameMap.get(String(c._id)) || 'Unknown customer',
    totalRevenue: c.totalRevenue,
    totalOrders: c.totalOrders,
    lastOrderAt: c.lastOrderAt,
  }));

  const totalCustomerRevenue = customersRanked.reduce((s, c) => s + c.totalRevenue, 0);
  const vips = customersRanked.slice(0, CONFIG.VIP_CUSTOMER_TOP_N);
  insights.push(buildVipCustomerInsight(vips, totalCustomerRevenue));

  const inactiveCutoff = daysAgo(CONFIG.INACTIVE_CUSTOMER_DAYS);
  const inactiveCustomers = customersRanked.filter((c) => new Date(c.lastOrderAt) < inactiveCutoff);
  insights.push(buildInactiveCustomerInsight(inactiveCustomers));

  /* At-risk: gone quiet for 30+ days but not yet long enough silent to count as fully inactive. */
  const recentCutoff = daysAgo(CONFIG.SALES_WINDOW_DAYS);
  const atRiskCustomers = customersRanked.filter((c) => {
    const last = new Date(c.lastOrderAt);
    return last < recentCutoff && last >= inactiveCutoff;
  });
  insights.push(buildAtRiskCustomerInsight(atRiskCustomers));

  insights.push(buildContributionInsight(vips, totalCustomerRevenue));

  /* ── 5. BUSINESS ALERTS (cross-cutting) ──────────────────────────────── */
  const highGrowthProducts = productMetrics.filter(
    (p) => p.growthPercent >= CONFIG.HIGH_GROWTH_THRESHOLD_PCT && p.quantitySold >= CONFIG.MIN_VOLUME_FOR_GROWTH_ALERTS,
  );
  for (const p of highGrowthProducts) insights.push(buildHighGrowthAlert(p));

  if (growthPercent <= CONFIG.SALES_DROP_THRESHOLD_PCT && storePreviousMonth.revenue > 0) {
    insights.push(
      buildSalesDropAlert({
        scope: 'store',
        name: null,
        productId: null,
        growthPercent,
        current: storeCurrentMonth.revenue,
        previous: storePreviousMonth.revenue,
      }),
    );
  }

  const productDropCandidates = productMetrics.filter(
    (p) =>
      p.prevQuantitySold >= CONFIG.MIN_VOLUME_FOR_GROWTH_ALERTS &&
      calcGrowthPercent(p.revenue, sumPrevRevenue(salesPrev30, p.productId)) <= -40,
  );
  for (const p of productDropCandidates) {
    const prevRevenue = sumPrevRevenue(salesPrev30, p.productId);
    insights.push(
      buildSalesDropAlert({
        scope: 'product',
        name: p.name,
        productId: p.productId,
        growthPercent: calcGrowthPercent(p.revenue, prevRevenue),
        current: p.revenue,
        previous: prevRevenue,
      }),
    );
  }

  /* Stamp tenant + lifecycle fields and drop any null builders (e.g. "no slow movers this period"). */
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CONFIG.INSIGHT_TTL_HOURS * 60 * 60 * 1000);
  return insights.filter(Boolean).map((insight) => ({
    ...insight,
    organizationId: orgId,
    branchId: brId,
    generatedAt: now,
    expiresAt,
  }));
};

const sumPrevRevenue = (salesPrev30Map, productId) => salesPrev30Map.get(productId)?.revenue || 0;

/**
 * Generates organization-wide branch-comparison insights (no single branchId).
 * Only meaningful with 2+ active branches — returns [] otherwise.
 */
const generateBranchComparisonInsights = async ({ organizationId }) => {
  const orgId = toObjectId(organizationId);
  const ranges = getDateRanges();

  const activeBranches = await Branch.find({ organizationId: orgId, isActive: true }).select('_id name').lean();
  if (activeBranches.length < 2) return [];

  const totalsByBranch = await aggregateBranchTotals({ organizationId: orgId, ...ranges.currentMonth });

  const branchMetrics = activeBranches.map((b) => {
    const totals = totalsByBranch.get(String(b._id)) || { revenue: 0, profit: 0, orders: 0 };
    return { branchId: String(b._id), name: b.name, revenue: totals.revenue, profit: totals.profit, orders: totals.orders };
  });

  const avgRevenue = branchMetrics.reduce((s, b) => s + b.revenue, 0) / branchMetrics.length;
  const byRevenueDesc = [...branchMetrics].sort((a, b) => b.revenue - a.revenue);
  const underperformers = branchMetrics
    .filter((b) => b.revenue < avgRevenue * (CONFIG.BRANCH_UNDERPERFORM_PCT_OF_AVG / 100))
    .sort((a, b) => a.revenue - b.revenue);

  const insights = [buildBranchTopPerformerInsight(byRevenueDesc), buildBranchUnderperformerInsight(underperformers, avgRevenue)];

  const now = new Date();
  const expiresAt = new Date(now.getTime() + CONFIG.INSIGHT_TTL_HOURS * 60 * 60 * 1000);
  return insights.filter(Boolean).map((insight) => ({
    ...insight,
    organizationId: orgId,
    branchId: null,
    generatedAt: now,
    expiresAt,
  }));
};

/** Replaces stored branch-comparison insights for one organization with a fresh computation. */
const runBranchComparisonForOrganization = async ({ organizationId }) => {
  const docs = await generateBranchComparisonInsights({ organizationId });
  await Insight.deleteMany({
    organizationId: toObjectId(organizationId),
    branchId: null,
    category: 'branch_comparison',
  });
  if (docs.length === 0) return [];
  return Insight.insertMany(docs);
};

/**
 * Generates insights for one branch and replaces whatever was stored for it —
 * insights are fully recomputed every run, so there's no point accumulating duplicates.
 */
const runInsightsForBranch = async ({ organizationId, branchId }) => {
  const docs = await generateInsightsForBranch({ organizationId, branchId });
  await Insight.deleteMany({ organizationId: toObjectId(organizationId), branchId: toObjectId(branchId) });
  if (docs.length === 0) return [];
  return Insight.insertMany(docs);
};

/** Entry point for the scheduler — iterates every active branch, isolating failures per branch. */
const runInsightsForAllBranches = async () => {
  const branches = await Branch.find({ isActive: true }).select('_id organizationId').lean();
  const summary = { branchesProcessed: 0, insightsGenerated: 0, errors: [] };
  const organizationIds = new Set();
  for (const branch of branches) {
    try {
      const created = await runInsightsForBranch({ organizationId: branch.organizationId, branchId: branch._id });
      summary.branchesProcessed += 1;
      summary.insightsGenerated += created.length;
      organizationIds.add(String(branch.organizationId));
    } catch (error) {
      summary.errors.push({ branchId: String(branch._id), message: error.message });
    }
  }

  for (const organizationId of organizationIds) {
    try {
      const created = await runBranchComparisonForOrganization({ organizationId });
      summary.insightsGenerated += created.length;
    } catch (error) {
      summary.errors.push({ organizationId, message: error.message });
    }
  }

  return summary;
};

/* ────────────────────────────────────────────────────────────────────────
 * QUERY HELPERS — used by the controller layer.
 * ──────────────────────────────────────────────────────────────────────── */

const queryInsights = async (filter, options) => Insight.paginate(filter, options);

const getInsightsByCategory = async ({ organizationId, branchId, category }) => {
  const docs = await Insight.find({ organizationId, branchId, category }).lean();
  return sortByPriorityThenRecency(docs);
};

const getTodayInsights = async ({ organizationId, branchId }) => {
  const since = startOfDay(new Date());
  const docs = await Insight.find({ organizationId, branchId, generatedAt: { $gte: since } }).lean();
  return sortByPriorityThenRecency(docs);
};

/** Org-wide branch-comparison insights — these have no branchId. */
const getBranchComparisonInsights = async ({ organizationId }) => {
  const docs = await Insight.find({ organizationId, branchId: null, category: 'branch_comparison' }).lean();
  return sortByPriorityThenRecency(docs);
};

const updateInsightById = async (insightId, updateBody) => {
  return Insight.findByIdAndUpdate(insightId, updateBody, { new: true });
};

module.exports = {
  CONFIG,
  generateInsightsForBranch,
  runInsightsForBranch,
  runInsightsForAllBranches,
  generateBranchComparisonInsights,
  runBranchComparisonForOrganization,
  queryInsights,
  getInsightsByCategory,
  getTodayInsights,
  getBranchComparisonInsights,
  updateInsightById,
  // exported for unit tests
  calcGrowthPercent,
  calcDailySalesRate,
  calcDaysRemaining,
  calcReorderPoint,
  calcSuggestedReorderQty,
  calcUnitProfit,
  calcMarginPercent,
  classifyABC,
};
