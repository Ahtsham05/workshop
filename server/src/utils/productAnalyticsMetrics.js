/**
 * Pure math for product analytics — no database access, so every ranking, classification
 * and insight rule can be unit-tested on plain objects. The aggregation side (what counts
 * as a sale, how rows are fetched) lives in services/productAnalytics.service.js.
 *
 * Money figures are always "net of discounts, before tax": a line's own discount is already
 * inside `items.subtotal`, and the service pro-rates any bill-level discount onto the lines
 * before these functions ever see them.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const ANALYTICS_CONFIG = Object.freeze({
  // ABC (Pareto) classes over net revenue: the products that make up the first 80% of
  // revenue are A, the next 15% B, the long tail C.
  ABC_A_SHARE: 0.8,
  ABC_B_SHARE: 0.95,
  // A product holding stock with no sale for this many days is dead stock.
  DEAD_STOCK_DAYS: 90,
  // How far back "last sold" is searched for products with no sale in the selected period.
  LAST_SALE_LOOKBACK_DAYS: 365,
  // Velocity classes among products that sold: top 20% fast, bottom 30% slow. Below the
  // minimum count, percentiles mean nothing, so everyone who sold is "steady".
  FAST_MOVER_SHARE: 0.2,
  SLOW_MOVER_SHARE: 0.3,
  MIN_PRODUCTS_FOR_VELOCITY_CLASSES: 5,
  STOCKOUT_WARNING_DAYS: 14,
  STOCKOUT_CRITICAL_DAYS: 3,
  OVERSTOCK_DAYS: 180,
  GROWTH_SIGNAL_PCT: 25,
  MARGIN_DROP_POINTS: 5,
  HIGH_RETURN_RATE_PCT: 10,
  MIN_RETURNED_UNITS_FOR_SIGNAL: 2,
  CHEAPER_SUPPLIER_PCT: 5,
  COST_INCREASE_PCT: 10,
  DISCOUNTING_PCT: 10,
  TOP_PERFORMER_RANK: 10,
  // Longest range the analytics endpoints accept (~5 years).
  MAX_PERIOD_DAYS: 1830,
});

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

const toNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

/** Percent change, or null when there is no previous base to compare against. */
const pctChange = (current, previous) => {
  if (!(previous > 0)) return null;
  return round(((current - previous) / previous) * 100);
};

/** Whole calendar days covered by [start, end] (end is an inclusive 23:59:59.999 boundary). */
const periodDays = (start, end) => Math.max(1, Math.round((end.getTime() - start.getTime() + 1) / DAY_MS));

const daysBetween = (from, to) => Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));

/**
 * Turns the raw per-product sums from the aggregations into every derived metric the UI
 * shows. `raw` fields default to 0 so a product with no activity still gets a full row.
 *
 * @param {Object} raw
 * @param {{ days: number, asOf: Date }} context  asOf = the moment "days since" is measured from
 */
const deriveProductMetrics = (raw, { days, asOf }) => {
  const unitsSold = toNumber(raw.unitsSold);
  const revenue = toNumber(raw.revenue);
  const profit = toNumber(raw.profit);
  const unitsReturned = toNumber(raw.unitsReturned);
  const returnValue = toNumber(raw.returnValue);
  const returnProfit = toNumber(raw.returnProfit);
  const unitsPurchased = toNumber(raw.unitsPurchased);
  const purchaseSpend = toNumber(raw.purchaseSpend);
  const currentStock = toNumber(raw.currentStock);
  const onHand = Math.max(0, currentStock);

  const netUnits = unitsSold - unitsReturned;
  const netRevenue = revenue - returnValue;
  const netProfit = profit - returnProfit;
  const velocity = netUnits > 0 ? netUnits / days : 0;

  let daysOfCover = null;
  if (velocity > 0) daysOfCover = round(onHand / velocity, 1);

  const previous = raw.previous || {};
  const prevNetRevenue = toNumber(previous.netRevenue);
  const prevNetProfit = toNumber(previous.netProfit);
  const prevNetUnits = toNumber(previous.netUnits);

  const lastSoldAt = raw.lastSoldAt ? new Date(raw.lastSoldAt) : null;
  const createdAt = raw.createdAt ? new Date(raw.createdAt) : null;

  return {
    unitsSold: round(unitsSold, 3),
    unitsReturned: round(unitsReturned, 3),
    netUnits: round(netUnits, 3),
    revenue: round(revenue),
    returnValue: round(returnValue),
    netRevenue: round(netRevenue),
    profit: round(profit),
    netProfit: round(netProfit),
    cogs: round(netRevenue - netProfit),
    discount: round(raw.discount),
    margin: netRevenue > 0 ? round((netProfit / netRevenue) * 100) : null,
    invoiceCount: toNumber(raw.invoiceCount),
    avgSellingPrice: unitsSold > 0 ? round(revenue / unitsSold) : null,
    returnRate: unitsSold > 0 ? round((unitsReturned / unitsSold) * 100) : null,
    unitsPurchased: round(unitsPurchased, 3),
    purchaseSpend: round(purchaseSpend),
    avgPurchaseCost: unitsPurchased > 0 ? round(purchaseSpend / unitsPurchased) : null,
    purchaseCount: toNumber(raw.purchaseCount),
    unitsReturnedToSupplier: round(raw.unitsReturnedToSupplier, 3),
    currentStock: round(currentStock, 3),
    stockValue: round(raw.stockValue),
    velocity: round(velocity, 3),
    daysOfCover,
    sellThrough: unitsSold + onHand > 0 ? round((unitsSold / (unitsSold + onHand)) * 100) : null,
    lastSoldAt,
    lastPurchasedAt: raw.lastPurchasedAt ? new Date(raw.lastPurchasedAt) : null,
    daysSinceLastSale: lastSoldAt ? daysBetween(lastSoldAt, asOf) : null,
    daysSinceCreated: createdAt ? daysBetween(createdAt, asOf) : null,
    previous: {
      netUnits: round(prevNetUnits, 3),
      netRevenue: round(prevNetRevenue),
      netProfit: round(prevNetProfit),
      margin: prevNetRevenue > 0 ? round((prevNetProfit / prevNetRevenue) * 100) : null,
    },
    revenueGrowth: pctChange(netRevenue, prevNetRevenue),
    profitGrowth: pctChange(netProfit, prevNetProfit),
    unitsGrowth: pctChange(netUnits, prevNetUnits),
    revenueDelta: round(netRevenue - prevNetRevenue),
    // Created inside the period and never sold before it — growth % is meaningless here.
    isNew: Boolean(createdAt && raw.periodStart && createdAt >= raw.periodStart && prevNetUnits <= 0),
  };
};

/**
 * Pareto classes over net revenue. Mutates rows with `abcClass` ('A'|'B'|'C'|null) and
 * `revenueShare` (% of total). The product that crosses a threshold still belongs to the
 * class it started in — otherwise a single product holding 90% of revenue would be "B".
 */
const assignAbcClasses = (rows, config = ANALYTICS_CONFIG) => {
  const ranked = rows.filter((row) => row.netRevenue > 0).sort((a, b) => b.netRevenue - a.netRevenue);
  const total = ranked.reduce((sum, row) => sum + row.netRevenue, 0);
  rows.forEach((row) => {
    row.abcClass = null;
    row.revenueShare = 0;
  });
  let cumulativeBefore = 0;
  ranked.forEach((row) => {
    const shareBefore = cumulativeBefore / total;
    if (shareBefore < config.ABC_A_SHARE) row.abcClass = 'A';
    else if (shareBefore < config.ABC_B_SHARE) row.abcClass = 'B';
    else row.abcClass = 'C';
    row.revenueShare = round((row.netRevenue / total) * 100);
    cumulativeBefore += row.netRevenue;
  });
  return rows;
};

/**
 * Movement classes. Mutates rows with `movement`:
 *   fast / steady / slow — relative velocity among products that sold in the period
 *   dead                 — holds stock, no sale for DEAD_STOCK_DAYS (or ever, once the
 *                          product itself is at least that old)
 *   no_sales             — nothing sold in the period, but not (yet) dead
 */
const assignMovementClasses = (rows, config = ANALYTICS_CONFIG) => {
  const sellers = rows.filter((row) => row.netUnits > 0).sort((a, b) => b.velocity - a.velocity);
  const n = sellers.length;
  const classify = n >= config.MIN_PRODUCTS_FOR_VELOCITY_CLASSES;
  const fastCount = classify ? Math.ceil(n * config.FAST_MOVER_SHARE) : 0;
  const slowCount = classify ? Math.floor(n * config.SLOW_MOVER_SHARE) : 0;

  sellers.forEach((row, index) => {
    if (index < fastCount) row.movement = 'fast';
    else if (index >= n - slowCount) row.movement = 'slow';
    else row.movement = 'steady';
  });

  rows.forEach((row) => {
    if (row.netUnits > 0) return;
    const idleDays = row.daysSinceLastSale ?? row.daysSinceCreated;
    const isDead = row.currentStock > 0 && idleDays !== null && idleDays !== undefined && idleDays >= config.DEAD_STOCK_DAYS;
    row.movement = isDead ? 'dead' : 'no_sales';
  });
  return rows;
};

/**
 * Standard competition ranking ("1224") by `field`, highest first. Only rows with a
 * positive value are ranked; the rest get null. Writes `row.ranks[key]`.
 */
const assignRanks = (rows, field, key = field) => {
  const ranked = rows.filter((row) => row[field] > 0).sort((a, b) => b[field] - a[field]);
  rows.forEach((row) => {
    row.ranks = row.ranks || {};
    row.ranks[key] = null;
  });
  let previousValue = null;
  let previousRank = 0;
  ranked.forEach((row, index) => {
    const rank = row[field] === previousValue ? previousRank : index + 1;
    row.ranks[key] = rank;
    previousValue = row[field];
    previousRank = rank;
  });
  return ranked.length;
};

/* ── Time buckets ───────────────────────────────────────────────────────────── */

const CALENDAR_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const keyToUtcDate = (key) => {
  const match = CALENDAR_KEY_RE.exec(key);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
};

const utcDateToKey = (date) => date.toISOString().slice(0, 10);

/** Chart granularity for a period length — keeps every chart between ~7 and ~60 points. */
const resolveGranularity = (days) => {
  if (days <= 62) return 'day';
  if (days <= 200) return 'week';
  return 'month';
};

/** The bucket a business calendar date (YYYY-MM-DD) falls in: itself, its Monday, or the 1st. */
const bucketKeyFor = (calendarKey, granularity) => {
  const date = keyToUtcDate(calendarKey);
  if (!date) return calendarKey;
  if (granularity === 'week') {
    const dow = date.getUTCDay(); // 0 = Sunday
    date.setUTCDate(date.getUTCDate() - (dow === 0 ? 6 : dow - 1));
    return utcDateToKey(date);
  }
  if (granularity === 'month') return `${calendarKey.slice(0, 7)}-01`;
  return calendarKey;
};

/** Every bucket key from startKey to endKey inclusive, so charts show real zero days. */
const enumerateBucketKeys = (startKey, endKey, granularity) => {
  const keys = [];
  const cursor = keyToUtcDate(bucketKeyFor(startKey, granularity));
  const end = keyToUtcDate(endKey);
  if (!cursor || !end) return keys;
  while (cursor.getTime() <= end.getTime() && keys.length < 2000) {
    keys.push(utcDateToKey(cursor));
    if (granularity === 'month') cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + (granularity === 'week' ? 7 : 1));
  }
  return keys;
};

const shiftCalendarKey = (key, days) => {
  const date = keyToUtcDate(key);
  if (!date) return key;
  date.setUTCDate(date.getUTCDate() + days);
  return utcDateToKey(date);
};

/* ── Insights ───────────────────────────────────────────────────────────────── */

/**
 * Plain-language findings for one product, most urgent first. Each is a stable `code` +
 * `severity` + `params` — the client owns the wording (and its translation), the server
 * owns the thresholds.
 *
 * @param {Object} input
 * @param {Object} input.metrics     deriveProductMetrics output (+ abcClass/movement/ranks)
 * @param {Object} input.product     { price, cost, hasVariants }
 * @param {Array}  [input.suppliers] [{ supplierId, name, avgUnitCost, lastUnitCost, lastPurchasedAt }]
 */
const buildProductInsights = ({ metrics, product = {}, suppliers = [] }, config = ANALYTICS_CONFIG) => {
  const insights = [];
  const add = (code, severity, params = {}) => insights.push({ code, severity, params });
  const m = metrics;

  if (m.netUnits > 0 && m.currentStock <= 0) {
    add('out_of_stock_while_selling', 'critical', { units: m.netUnits });
  } else if (m.daysOfCover !== null && m.daysOfCover <= config.STOCKOUT_WARNING_DAYS) {
    add('stockout_risk', m.daysOfCover <= config.STOCKOUT_CRITICAL_DAYS ? 'critical' : 'warning', {
      days: Math.max(0, Math.round(m.daysOfCover)),
      cover: m.daysOfCover,
      perDay: m.velocity,
    });
  }

  if (!product.hasVariants && toNumber(product.price) > 0 && toNumber(product.price) < toNumber(product.cost)) {
    add('price_below_cost', 'critical', { price: toNumber(product.price), cost: toNumber(product.cost) });
  }

  if (m.netRevenue > 0 && m.netProfit < 0) {
    add('selling_at_loss', 'critical', { loss: round(-m.netProfit) });
  } else if (
    m.margin !== null &&
    m.previous.margin !== null &&
    m.previous.margin - m.margin >= config.MARGIN_DROP_POINTS
  ) {
    add('margin_drop', 'warning', { from: m.previous.margin, to: m.margin });
  }

  if (m.movement === 'dead') {
    add('dead_stock', 'warning', {
      days: m.daysSinceLastSale ?? m.daysSinceCreated,
      neverSold: m.daysSinceLastSale === null,
      stockValue: m.stockValue,
    });
  } else if (m.daysOfCover !== null && m.daysOfCover >= config.OVERSTOCK_DAYS) {
    add('overstock', 'info', { days: Math.round(m.daysOfCover), stockValue: m.stockValue });
  }

  if (m.returnRate !== null && m.returnRate >= config.HIGH_RETURN_RATE_PCT && m.unitsReturned >= config.MIN_RETURNED_UNITS_FOR_SIGNAL) {
    add('high_return_rate', 'warning', { rate: m.returnRate, units: m.unitsReturned });
  }

  if (m.revenueGrowth !== null && !m.isNew) {
    if (m.revenueGrowth >= config.GROWTH_SIGNAL_PCT) add('sales_growth', 'positive', { pct: m.revenueGrowth });
    else if (m.revenueGrowth <= -config.GROWTH_SIGNAL_PCT) add('sales_decline', 'warning', { pct: Math.abs(m.revenueGrowth) });
  }

  if (m.avgSellingPrice !== null && !product.hasVariants && toNumber(product.price) > 0) {
    const belowList = ((toNumber(product.price) - m.avgSellingPrice) / toNumber(product.price)) * 100;
    if (belowList >= config.DISCOUNTING_PCT) {
      add('discounting', 'info', { pct: round(belowList, 1), avgPrice: m.avgSellingPrice, listPrice: toNumber(product.price) });
    }
  }

  const priced = suppliers.filter((s) => s.avgUnitCost > 0);
  if (priced.length >= 2) {
    const latest = [...priced].sort((a, b) => new Date(b.lastPurchasedAt) - new Date(a.lastPurchasedAt))[0];
    const cheapest = [...priced].sort((a, b) => a.avgUnitCost - b.avgUnitCost)[0];
    const latestCost = latest.lastUnitCost || latest.avgUnitCost;
    if (
      String(cheapest.supplierId) !== String(latest.supplierId) &&
      latestCost > 0 &&
      ((latestCost - cheapest.avgUnitCost) / latestCost) * 100 >= config.CHEAPER_SUPPLIER_PCT
    ) {
      add('cheaper_supplier', 'info', {
        supplier: cheapest.name,
        cost: round(cheapest.avgUnitCost),
        currentSupplier: latest.name,
        currentCost: round(latestCost),
        savingPerUnit: round(latestCost - cheapest.avgUnitCost),
      });
    }
  }

  if (m.avgPurchaseCost && m.lastPurchaseUnitCost) {
    const increase = ((m.lastPurchaseUnitCost - m.avgPurchaseCost) / m.avgPurchaseCost) * 100;
    if (increase >= config.COST_INCREASE_PCT) {
      add('cost_increase', 'warning', { pct: round(increase, 1), lastCost: m.lastPurchaseUnitCost, avgCost: m.avgPurchaseCost });
    }
  }

  if (m.abcClass === 'A' && m.ranks && m.ranks.revenue && m.ranks.revenue <= config.TOP_PERFORMER_RANK) {
    add('top_performer', 'positive', { rank: m.ranks.revenue, share: m.revenueShare });
  }

  const order = { critical: 0, warning: 1, info: 2, positive: 3 };
  return insights.sort((a, b) => order[a.severity] - order[b.severity]);
};

module.exports = {
  ANALYTICS_CONFIG,
  DAY_MS,
  round,
  pctChange,
  periodDays,
  deriveProductMetrics,
  assignAbcClasses,
  assignMovementClasses,
  assignRanks,
  resolveGranularity,
  bucketKeyFor,
  enumerateBucketKeys,
  shiftCalendarKey,
  buildProductInsights,
};
