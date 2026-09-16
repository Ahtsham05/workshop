const mongoose = require('mongoose');
const httpStatus = require('http-status');
const {
  Product,
  ProductVariant,
  Inventory,
  Invoice,
  Purchase,
  SalesReturn,
  PurchaseReturn,
  StockAdjustment,
  InventoryTransfer,
  Customer,
  Supplier,
  Brand,
} = require('../models');
const ApiError = require('../utils/ApiError');
const { BUSINESS_TZ, toBusinessCalendarDate, parseBusinessDateBoundary } = require('../utils/businessTimezone');
const {
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
} = require('../utils/productAnalyticsMetrics');

/*
 * Product analytics: rankings, movement, profitability and per-product history.
 *
 * WHAT COUNTS AS A SALE (one definition for every number on these screens):
 *   - not a quotation (quotations never move stock and were never sold)
 *   - not cancelled
 *   - not a pending invoice that was later converted to a bill — conversion creates a
 *     separate credit invoice carrying the same lines, so counting both doubles the sale
 * Returns (SalesReturn, not rejected) are netted off by their own return date.
 *
 * MONEY: line revenue = items.subtotal (already net of the line discount) minus the
 * invoice-level discount pro-rated by line subtotal. items.profit ignores that bill
 * discount, so it is pro-rated off profit too — otherwise a product always sold on
 * discounted bills would look more profitable than it is. Tax, delivery and service
 * charges are not product revenue and are excluded.
 *
 * QUANTITIES are base units (items.stockQuantity, falling back to quantity for legacy
 * lines) so a line sold by the box and one sold by the piece add up correctly.
 *
 * STOCK is the current snapshot, not stock as of the period end.
 */

const SOLD_INVOICE_MATCH = Object.freeze({
  status: { $ne: 'cancelled' },
  type: { $ne: 'quotation' },
  $nor: [{ type: 'pending', isConvertedToBill: true }],
});

const ACTIVE_RETURN_MATCH = Object.freeze({ status: { $ne: 'rejected' } });

const toObjectId = (id) => (mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(String(id)) : id);

/** aggregate() skips Mongoose casting — org/branch must be real ObjectIds to match. */
const buildScope = ({ organizationId, branchId }) => {
  const scope = {};
  if (organizationId) scope.organizationId = toObjectId(organizationId);
  if (branchId) scope.branchId = toObjectId(branchId);
  return scope;
};

/**
 * Resolves the requested business-calendar range (default: the last 30 days ending today)
 * plus the equal-length period immediately before it, for growth comparisons.
 */
const resolvePeriod = ({ startDate, endDate } = {}) => {
  const todayKey = toBusinessCalendarDate(new Date());
  let end = parseBusinessDateBoundary(endDate || todayKey, true);
  const endKey = toBusinessCalendarDate(end);
  let start = parseBusinessDateBoundary(startDate || shiftCalendarKey(endKey, -29), false);
  if (start > end) {
    const startKey = toBusinessCalendarDate(start);
    start = parseBusinessDateBoundary(endKey, false);
    end = parseBusinessDateBoundary(startKey, true);
  }
  const days = periodDays(start, end);
  if (days > ANALYTICS_CONFIG.MAX_PERIOD_DAYS) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Date range is too long (max ${ANALYTICS_CONFIG.MAX_PERIOD_DAYS} days)`);
  }
  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(start.getTime() - days * DAY_MS);
  const startKey = toBusinessCalendarDate(start);
  return {
    start,
    end,
    days,
    startKey,
    endKey: toBusinessCalendarDate(end),
    previousStart,
    previousEnd,
    granularity: resolveGranularity(days),
    // "Days since last sale" is measured from the end of the period, or now if sooner.
    asOf: new Date(Math.min(Date.now(), end.getTime())),
  };
};

const periodPayload = (period) => ({
  startDate: period.startKey,
  endDate: period.endKey,
  days: period.days,
  previousStartDate: toBusinessCalendarDate(period.previousStart),
  previousEndDate: toBusinessCalendarDate(period.previousEnd),
  granularity: period.granularity,
});

/* ── Shared pipeline pieces ─────────────────────────────────────────────────── */

const lineUnitsExpr = (path) => ({ $ifNull: [`${path}.stockQuantity`, { $ifNull: [`${path}.quantity`, 0] }] });

/**
 * Invoice pipeline head: match real sales in range, then one row per line with
 * _units/_revenue/_profit/_discount resolved. `productIds` narrows both the document
 * match (index-assisted) and the unwound lines.
 */
const soldLineStages = ({ scope, start, end, productIds, extraProject = {} }) => {
  const productFilter = productIds ? { 'items.productId': productIds.length === 1 ? productIds[0] : { $in: productIds } } : {};
  const subtotal = { $ifNull: ['$items.subtotal', 0] };
  return [
    { $match: { ...scope, ...SOLD_INVOICE_MATCH, invoiceDate: { $gte: start, $lte: end }, ...productFilter } },
    { $project: { items: 1, discount: 1, invoiceDate: 1, ...extraProject } },
    { $addFields: { _linesSubtotal: { $sum: '$items.subtotal' } } },
    { $unwind: '$items' },
    ...(productIds ? [{ $match: productFilter }] : []),
    {
      $addFields: {
        _billDiscount: {
          $cond: [
            { $and: [{ $gt: [{ $ifNull: ['$discount', 0] }, 0] }, { $gt: ['$_linesSubtotal', 0] }] },
            { $multiply: [{ $ifNull: ['$discount', 0] }, { $divide: [subtotal, '$_linesSubtotal'] }] },
            0,
          ],
        },
      },
    },
    {
      $addFields: {
        _units: lineUnitsExpr('$items'),
        _revenue: { $subtract: [subtotal, '$_billDiscount'] },
        _profit: { $subtract: [{ $ifNull: ['$items.profit', 0] }, '$_billDiscount'] },
        _discount: { $add: [{ $ifNull: ['$items.discountAmount', 0] }, '$_billDiscount'] },
      },
    },
  ];
};

/** Purchase pipeline head: one row per line with _units/_spend (purchase discount pro-rated). */
const purchasedLineStages = ({ scope, start, end, productIds, extraProject = {} }) => {
  const productFilter = productIds ? { 'items.product': productIds.length === 1 ? productIds[0] : { $in: productIds } } : {};
  const lineTotal = { $ifNull: ['$items.total', 0] };
  return [
    { $match: { ...scope, purchaseDate: { $gte: start, $lte: end }, ...productFilter } },
    { $project: { items: 1, discount: 1, purchaseDate: 1, ...extraProject } },
    { $addFields: { _linesTotal: { $sum: '$items.total' } } },
    { $unwind: '$items' },
    ...(productIds ? [{ $match: productFilter }] : []),
    {
      $addFields: {
        _units: lineUnitsExpr('$items'),
        _spend: {
          $subtract: [
            lineTotal,
            {
              $cond: [
                { $and: [{ $gt: [{ $ifNull: ['$discount', 0] }, 0] }, { $gt: ['$_linesTotal', 0] }] },
                { $multiply: [{ $ifNull: ['$discount', 0] }, { $divide: [lineTotal, '$_linesTotal'] }] },
                0,
              ],
            },
          ],
        },
      },
    },
  ];
};

/**
 * Groups by business calendar day; bucketSeries rolls days up into weeks/months in JS.
 * (Deliberately not $dateTrunc — that needs MongoDB 5.0+, and nothing else in this
 * codebase depends on a server that new.)
 */
const dayKeyExpr = (dateField) => ({
  $dateToString: { format: '%Y-%m-%d', timezone: BUSINESS_TZ, date: dateField },
});

/* ── Per-product sums ───────────────────────────────────────────────────────── */

const aggregateSales = ({ scope, start, end, productIds }) =>
  Invoice.aggregate([
    ...soldLineStages({ scope, start, end, productIds }),
    // Two-stage group so a product listed twice on one bill is still one invoice.
    {
      $group: {
        _id: { p: '$items.productId', i: '$_id' },
        units: { $sum: '$_units' },
        revenue: { $sum: '$_revenue' },
        profit: { $sum: '$_profit' },
        discount: { $sum: '$_discount' },
        soldAt: { $max: '$invoiceDate' },
      },
    },
    {
      $group: {
        _id: '$_id.p',
        unitsSold: { $sum: '$units' },
        revenue: { $sum: '$revenue' },
        profit: { $sum: '$profit' },
        discount: { $sum: '$discount' },
        invoiceCount: { $sum: 1 },
        lastSoldAt: { $max: '$soldAt' },
      },
    },
  ]);

/**
 * Returns by return date. The profit reversed by a return uses the ORIGINAL sale line's
 * unit cost (looked up on the returned invoice); when that line can't be found (invoice
 * edited/deleted) the caller falls back to the product's current cost for those units.
 */
const aggregateSalesReturns = async ({ scope, start, end, productIds }) => {
  const productFilter = productIds ? { 'items.productId': { $in: productIds } } : {};
  const lines = await SalesReturn.aggregate([
    { $match: { ...scope, ...ACTIVE_RETURN_MATCH, date: { $gte: start, $lte: end }, ...productFilter } },
    { $project: { items: 1, invoiceId: 1 } },
    { $unwind: '$items' },
    ...(productIds ? [{ $match: productFilter }] : []),
    {
      $group: {
        _id: { p: '$items.productId', i: '$invoiceId' },
        units: { $sum: lineUnitsExpr('$items') },
        value: { $sum: { $ifNull: ['$items.total', 0] } },
      },
    },
  ]);
  if (lines.length === 0) return [];

  const invoiceIds = [...new Set(lines.map((line) => String(line._id.i)).filter((id) => mongoose.Types.ObjectId.isValid(id)))];
  const invoices = invoiceIds.length
    ? await Invoice.find({ _id: { $in: invoiceIds } })
        .select('items.productId items.subtotal items.profit items.stockQuantity items.quantity')
        .lean()
    : [];
  // Per (invoice, product): cost per base unit on the original sale.
  const unitCostByKey = new Map();
  invoices.forEach((invoice) => {
    (invoice.items || []).forEach((item) => {
      const key = `${invoice._id}|${item.productId}`;
      if (unitCostByKey.has(key)) return;
      const units = item.stockQuantity || item.quantity || 0;
      if (units > 0) unitCostByKey.set(key, ((item.subtotal || 0) - (item.profit || 0)) / units);
    });
  });

  const byProduct = new Map();
  lines.forEach((line) => {
    const productKey = String(line._id.p);
    const entry = byProduct.get(productKey) || { _id: line._id.p, unitsReturned: 0, returnValue: 0, knownCost: 0, unknownCostUnits: 0 };
    const unitCost = unitCostByKey.get(`${line._id.i}|${productKey}`);
    entry.unitsReturned += line.units;
    entry.returnValue += line.value;
    if (unitCost === undefined) entry.unknownCostUnits += line.units;
    else entry.knownCost += line.units * unitCost;
    byProduct.set(productKey, entry);
  });
  return [...byProduct.values()];
};

const aggregatePurchases = ({ scope, start, end, productIds }) =>
  Purchase.aggregate([
    ...purchasedLineStages({ scope, start, end, productIds }),
    {
      $group: {
        _id: '$items.product',
        unitsPurchased: { $sum: '$_units' },
        purchaseSpend: { $sum: '$_spend' },
        purchaseCount: { $sum: 1 },
        lastPurchasedAt: { $max: '$purchaseDate' },
      },
    },
  ]);

const aggregatePurchaseReturns = ({ scope, start, end, productIds }) => {
  const productFilter = productIds ? { 'items.productId': { $in: productIds } } : {};
  return PurchaseReturn.aggregate([
    { $match: { ...scope, ...ACTIVE_RETURN_MATCH, date: { $gte: start, $lte: end }, ...productFilter } },
    { $project: { items: 1 } },
    { $unwind: '$items' },
    ...(productIds ? [{ $match: productFilter }] : []),
    { $group: { _id: '$items.productId', units: { $sum: lineUnitsExpr('$items') } } },
  ]);
};

/** Last sale inside the lookback window — only asked for products idle in the period. */
const aggregateLastSold = ({ scope, since, end, productIds }) =>
  productIds.length === 0
    ? []
    : Invoice.aggregate([
        {
          $match: {
            ...scope,
            ...SOLD_INVOICE_MATCH,
            invoiceDate: { $gte: since, $lte: end },
            'items.productId': { $in: productIds },
          },
        },
        { $project: { 'items.productId': 1, invoiceDate: 1 } },
        { $unwind: '$items' },
        { $match: { 'items.productId': { $in: productIds } } },
        { $group: { _id: '$items.productId', lastSoldAt: { $max: '$invoiceDate' } } },
      ]);

/**
 * Variant-aware stock: a hasVariants product's own stockQuantity/price/cost are fallback
 * values — the real numbers live on Inventory/ProductVariant. Valued at the lowest variant
 * cost, the same convention product.service.js#getProductStats uses for the Products page
 * header, so the two screens never disagree about stock value.
 */
const loadVariantSnapshot = async (variantProductIds) => {
  if (variantProductIds.length === 0) return new Map();
  const [stockRows, priceRows] = await Promise.all([
    Inventory.aggregate([
      { $match: { productId: { $in: variantProductIds } } },
      { $group: { _id: '$productId', stock: { $sum: '$quantity' } } },
    ]),
    ProductVariant.aggregate([
      { $match: { productId: { $in: variantProductIds }, isDefault: false } },
      {
        $group: {
          _id: '$productId',
          minPrice: { $min: '$price' },
          maxPrice: { $max: '$price' },
          minCost: { $min: '$cost' },
          maxCost: { $max: '$cost' },
        },
      },
    ]),
  ]);
  const snapshot = new Map();
  stockRows.forEach((row) => snapshot.set(String(row._id), { stock: row.stock || 0 }));
  priceRows.forEach((row) => {
    const key = String(row._id);
    snapshot.set(key, { stock: 0, ...snapshot.get(key), priceRange: row });
  });
  return snapshot;
};

const PRODUCT_LIST_FIELDS =
  'name nameUrdu image barcode sku unit price cost stockQuantity hasVariants isActive categories brandId createdAt trackImei trackSerial color flag';

const indexById = (rows) => new Map(rows.map((row) => [String(row._id), row]));

const bucketSeries = (period, salesRows, purchaseRows) => {
  const byKey = new Map(
    enumerateBucketKeys(period.startKey, period.endKey, period.granularity).map((key) => [
      key,
      { bucket: key, unitsSold: 0, revenue: 0, profit: 0, invoiceCount: 0, unitsPurchased: 0, purchaseSpend: 0 },
    ])
  );
  const ensure = (rawKey) => {
    const key = bucketKeyFor(rawKey, period.granularity);
    if (!byKey.has(key)) {
      byKey.set(key, { bucket: key, unitsSold: 0, revenue: 0, profit: 0, invoiceCount: 0, unitsPurchased: 0, purchaseSpend: 0 });
    }
    return byKey.get(key);
  };
  salesRows.forEach((row) => {
    const point = ensure(row._id);
    point.unitsSold += row.units || 0;
    point.revenue += row.revenue || 0;
    point.profit += row.profit || 0;
    point.invoiceCount += row.invoiceCount || 0;
  });
  purchaseRows.forEach((row) => {
    const point = ensure(row._id);
    point.unitsPurchased += row.units || 0;
    point.purchaseSpend += row.spend || 0;
  });
  return [...byKey.values()]
    .sort((a, b) => a.bucket.localeCompare(b.bucket))
    .map((point) => ({
      ...point,
      unitsSold: round(point.unitsSold, 3),
      revenue: round(point.revenue),
      profit: round(point.profit),
      unitsPurchased: round(point.unitsPurchased, 3),
      purchaseSpend: round(point.purchaseSpend),
      avgSellingPrice: point.unitsSold > 0 ? round(point.revenue / point.unitsSold) : null,
      avgPurchaseCost: point.unitsPurchased > 0 ? round(point.purchaseSpend / point.unitsPurchased) : null,
    }));
};

/* ── Branch-wide computation ────────────────────────────────────────────────── */

/**
 * Every product in scope with its full metric row, classes and ranks, plus the branch-level
 * trend series. This is the one expensive pass; rankings/overview/detail all read from it.
 */
const computeBranchAnalytics = async ({ organizationId, branchId, period }) => {
  const scope = buildScope({ organizationId, branchId });
  const { start, end, previousStart, previousEnd } = period;

  const [products, sales, previousSales, returns, previousReturns, purchases, supplierReturns, salesSeries, purchaseSeries] =
    await Promise.all([
      Product.find(scope).select(PRODUCT_LIST_FIELDS).lean(),
      aggregateSales({ scope, start, end }),
      aggregateSales({ scope, start: previousStart, end: previousEnd }),
      aggregateSalesReturns({ scope, start, end }),
      aggregateSalesReturns({ scope, start: previousStart, end: previousEnd }),
      aggregatePurchases({ scope, start, end }),
      aggregatePurchaseReturns({ scope, start, end }),
      Invoice.aggregate([
        ...soldLineStages({ scope, start, end }),
        {
          $group: {
            _id: { b: dayKeyExpr('$invoiceDate'), i: '$_id' },
            units: { $sum: '$_units' },
            revenue: { $sum: '$_revenue' },
            profit: { $sum: '$_profit' },
          },
        },
        {
          $group: {
            _id: '$_id.b',
            units: { $sum: '$units' },
            revenue: { $sum: '$revenue' },
            profit: { $sum: '$profit' },
            invoiceCount: { $sum: 1 },
          },
        },
      ]),
      Purchase.aggregate([
        ...purchasedLineStages({ scope, start, end }),
        { $group: { _id: dayKeyExpr('$purchaseDate'), units: { $sum: '$_units' }, spend: { $sum: '$_spend' } } },
      ]),
    ]);

  const variantSnapshot = await loadVariantSnapshot(products.filter((p) => p.hasVariants).map((p) => p._id));
  const salesById = indexById(sales);
  const previousSalesById = indexById(previousSales);
  const returnsById = indexById(returns);
  const previousReturnsById = indexById(previousReturns);
  const purchasesById = indexById(purchases);
  const supplierReturnsById = indexById(supplierReturns);

  const resolveStock = (product) => {
    if (!product.hasVariants) {
      const stock = Number(product.stockQuantity) || 0;
      const cost = Number(product.cost) || 0;
      return { price: Number(product.price) || 0, cost, currentStock: stock, stockValue: stock * cost, priceRange: null };
    }
    const snap = variantSnapshot.get(String(product._id)) || { stock: 0 };
    const range = snap.priceRange || null;
    const minCost = range ? range.minCost || 0 : 0;
    return {
      price: range ? range.minPrice || 0 : 0,
      cost: minCost,
      currentStock: snap.stock || 0,
      stockValue: (snap.stock || 0) * minCost,
      priceRange: range
        ? { minPrice: range.minPrice, maxPrice: range.maxPrice, minCost: range.minCost, maxCost: range.maxCost }
        : null,
    };
  };

  const returnProfitOf = (ret, cost) =>
    ret ? (ret.returnValue || 0) - ((ret.knownCost || 0) + (ret.unknownCostUnits || 0) * cost) : 0;

  const rows = products.map((product) => {
    const id = String(product._id);
    const stock = resolveStock(product);
    const sale = salesById.get(id) || {};
    const prevSale = previousSalesById.get(id) || {};
    const ret = returnsById.get(id);
    const prevRet = previousReturnsById.get(id);
    const purchase = purchasesById.get(id) || {};

    const metrics = deriveProductMetrics(
      {
        unitsSold: sale.unitsSold,
        revenue: sale.revenue,
        profit: sale.profit,
        discount: sale.discount,
        invoiceCount: sale.invoiceCount,
        lastSoldAt: sale.lastSoldAt,
        unitsReturned: ret ? ret.unitsReturned : 0,
        returnValue: ret ? ret.returnValue : 0,
        returnProfit: returnProfitOf(ret, stock.cost),
        unitsPurchased: purchase.unitsPurchased,
        purchaseSpend: purchase.purchaseSpend,
        purchaseCount: purchase.purchaseCount,
        lastPurchasedAt: purchase.lastPurchasedAt,
        unitsReturnedToSupplier: (supplierReturnsById.get(id) || {}).units,
        currentStock: stock.currentStock,
        stockValue: stock.stockValue,
        createdAt: product.createdAt,
        periodStart: start,
        previous: {
          netUnits: (prevSale.unitsSold || 0) - (prevRet ? prevRet.unitsReturned : 0),
          netRevenue: (prevSale.revenue || 0) - (prevRet ? prevRet.returnValue : 0),
          netProfit: (prevSale.profit || 0) - returnProfitOf(prevRet, stock.cost),
        },
      },
      { days: period.days, asOf: period.asOf }
    );

    return {
      productId: id,
      name: product.name,
      nameUrdu: product.nameUrdu || '',
      image: product.image && product.image.url ? { url: product.image.url } : null,
      barcode: product.barcode || '',
      sku: product.sku || '',
      unit: product.unit,
      color: product.color || null,
      flag: product.flag || null,
      isActive: product.isActive !== false,
      hasVariants: Boolean(product.hasVariants),
      trackImei: Boolean(product.trackImei),
      trackSerial: Boolean(product.trackSerial),
      categories: (product.categories || []).map((c) => ({ id: c._id ? String(c._id) : null, name: c.name })),
      brandId: product.brandId ? String(product.brandId) : null,
      createdAt: product.createdAt,
      price: stock.price,
      cost: stock.cost,
      priceRange: stock.priceRange,
      ...metrics,
    };
  });

  // Last-sold lookup only for idle products holding stock — the only rows whose
  // dead-stock classification depends on it.
  const idleIds = rows
    .filter((row) => row.unitsSold <= 0 && row.currentStock > 0)
    .map((row) => toObjectId(row.productId));
  const lookbackStart = new Date(end.getTime() - ANALYTICS_CONFIG.LAST_SALE_LOOKBACK_DAYS * DAY_MS);
  const lastSold = indexById(await aggregateLastSold({ scope, since: lookbackStart, end, productIds: idleIds }));
  rows.forEach((row) => {
    const hit = lastSold.get(row.productId);
    if (hit && hit.lastSoldAt) {
      row.lastSoldAt = hit.lastSoldAt;
      row.daysSinceLastSale = Math.max(0, Math.floor((period.asOf - new Date(hit.lastSoldAt)) / DAY_MS));
    }
  });

  assignAbcClasses(rows);
  assignMovementClasses(rows);
  const rankedCounts = {
    revenue: assignRanks(rows, 'netRevenue', 'revenue'),
    profit: assignRanks(rows, 'netProfit', 'profit'),
    units: assignRanks(rows, 'netUnits', 'units'),
  };

  const brandIds = [...new Set(rows.map((row) => row.brandId).filter(Boolean))];
  const brands = brandIds.length ? await Brand.find({ _id: { $in: brandIds } }).select('name').lean() : [];
  const brandNames = new Map(brands.map((b) => [String(b._id), b.name]));
  rows.forEach((row) => {
    row.brandName = row.brandId ? brandNames.get(row.brandId) || null : null;
  });

  // Filter options for the ranking table, counted over the whole catalog (not the filtered
  // view) so picking one category never makes the others vanish from the list.
  const categoryCounts = new Map();
  let uncategorized = 0;
  rows.forEach((row) => {
    const withIds = row.categories.filter((c) => c.id);
    if (withIds.length === 0) uncategorized += 1;
    withIds.forEach((c) => {
      const entry = categoryCounts.get(c.id) || { id: c.id, name: c.name, productCount: 0 };
      entry.productCount += 1;
      categoryCounts.set(c.id, entry);
    });
  });
  const facets = {
    categories: [...categoryCounts.values()].sort((a, b) => String(a.name).localeCompare(String(b.name))),
    uncategorized,
  };

  return {
    period,
    rows,
    facets,
    rowsById: new Map(rows.map((row) => [row.productId, row])),
    rankedCounts,
    series: bucketSeries(period, salesSeries, purchaseSeries),
  };
};

/*
 * The Products page fires overview + rankings (and the detail page its own call) at the
 * same moment for the same range — share one computation across them. Short TTL: fresh
 * sales show up within seconds, while a burst of requests never repeats the heavy pass.
 */
const CACHE_TTL_MS = 15 * 1000;
const MAX_CACHE_ENTRIES = 50;
const analyticsCache = new Map();

const getBranchAnalytics = ({ organizationId, branchId, period }) => {
  const key = [organizationId, branchId || '*', period.start.toISOString(), period.end.toISOString()].join('|');
  const now = Date.now();
  const hit = analyticsCache.get(key);
  if (hit && hit.expiresAt > now) return hit.promise;

  if (analyticsCache.size >= MAX_CACHE_ENTRIES) {
    for (const [cacheKey, entry] of analyticsCache) {
      if (entry.expiresAt <= now) analyticsCache.delete(cacheKey);
    }
    if (analyticsCache.size >= MAX_CACHE_ENTRIES) analyticsCache.delete(analyticsCache.keys().next().value);
  }

  const promise = computeBranchAnalytics({ organizationId, branchId, period }).catch((error) => {
    analyticsCache.delete(key);
    throw error;
  });
  analyticsCache.set(key, { promise, expiresAt: now + CACHE_TTL_MS });
  return promise;
};

const clearAnalyticsCache = () => analyticsCache.clear();

/* ── Rankings ───────────────────────────────────────────────────────────────── */

const RANKING_SORT_FIELDS = new Set([
  'netRevenue',
  'netProfit',
  'netUnits',
  'margin',
  'revenueGrowth',
  'revenueDelta',
  'unitsGrowth',
  'velocity',
  'daysOfCover',
  'sellThrough',
  'stockValue',
  'currentStock',
  'returnRate',
  'invoiceCount',
  'avgSellingPrice',
  'daysSinceLastSale',
  'unitsPurchased',
  'purchaseSpend',
  'name',
]);

const MOVEMENTS = new Set(['fast', 'steady', 'slow', 'no_sales', 'dead']);
// Same sentinel the Products page category filter uses (product.controller.js).
const UNCATEGORIZED = 'uncategorized';

const compareRows = (field, order) => (a, b) => {
  const direction = order === 'asc' ? 1 : -1;
  if (field === 'name') return direction * String(a.name || '').localeCompare(String(b.name || ''));
  const av = a[field];
  const bv = b[field];
  // Missing values always sink to the bottom, whichever direction is asked for.
  if (av === null || av === undefined) return bv === null || bv === undefined ? 0 : 1;
  if (bv === null || bv === undefined) return -1;
  if (av === bv) return String(a.name || '').localeCompare(String(b.name || ''));
  return direction * (av - bv);
};

/** Shallow copy so a response never hands out the cached row object itself. */
const toClientRow = (row) => ({ ...row });

const filterRows = (rows, filters = {}) => {
  const term = String(filters.search || '').trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.status === 'active' && !row.isActive) return false;
    if (filters.status === 'inactive' && row.isActive) return false;
    if (filters.categoryId === UNCATEGORIZED) {
      if (row.categories.some((c) => c.id)) return false;
    } else if (filters.categoryId && !row.categories.some((c) => c.id === String(filters.categoryId))) return false;
    if (filters.brandId && row.brandId !== String(filters.brandId)) return false;
    if (filters.abcClass) {
      const wanted = String(filters.abcClass).split(',');
      if (!wanted.includes(row.abcClass || 'none')) return false;
    }
    if (filters.movement) {
      const wanted = String(filters.movement).split(',').filter((m) => MOVEMENTS.has(m));
      if (wanted.length && !wanted.includes(row.movement)) return false;
    }
    if (filters.stock === 'in_stock' && !(row.currentStock > 0)) return false;
    if (filters.stock === 'out_of_stock' && row.currentStock > 0) return false;
    if (term) {
      const haystack = [row.name, row.nameUrdu, row.barcode, row.sku, row.brandName].join(' ').toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });
};

const getProductRankings = async ({ organizationId, branchId, query = {} }) => {
  const period = resolvePeriod(query);
  const analytics = await getBranchAnalytics({ organizationId, branchId, period });
  const sortBy = RANKING_SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'netRevenue';
  const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 25, 1), 200);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);

  const filtered = filterRows(analytics.rows, query).sort(compareRows(sortBy, sortOrder));
  const totalResults = filtered.length;

  return {
    results: filtered.slice((page - 1) * limit, page * limit).map(toClientRow),
    page,
    limit,
    totalResults,
    totalPages: Math.max(1, Math.ceil(totalResults / limit)),
    sortBy,
    sortOrder,
    rankedCounts: analytics.rankedCounts,
    facets: analytics.facets,
    period: periodPayload(period),
  };
};

/** Every row matching the filters, for Excel export — capped to keep the payload sane. */
const getProductRankingsExport = async ({ organizationId, branchId, query = {} }) => {
  const result = await getProductRankings({ organizationId, branchId, query: { ...query, page: 1, limit: 200 } });
  if (result.totalResults <= result.results.length) return result;
  const period = resolvePeriod(query);
  const analytics = await getBranchAnalytics({ organizationId, branchId, period });
  const rows = filterRows(analytics.rows, query)
    .sort(compareRows(result.sortBy, result.sortOrder))
    .slice(0, 20000)
    .map(toClientRow);
  return { ...result, results: rows, limit: rows.length, totalPages: 1 };
};

/* ── Overview ───────────────────────────────────────────────────────────────── */

const LEADERBOARD_SIZE = 5;

const leaderboardRow = (row) => ({
  productId: row.productId,
  name: row.name,
  nameUrdu: row.nameUrdu,
  image: row.image,
  unit: row.unit,
  netRevenue: row.netRevenue,
  netProfit: row.netProfit,
  netUnits: row.netUnits,
  margin: row.margin,
  revenueGrowth: row.revenueGrowth,
  revenueDelta: row.revenueDelta,
  previousRevenue: row.previous.netRevenue,
  currentStock: row.currentStock,
  stockValue: row.stockValue,
  daysOfCover: row.daysOfCover,
  velocity: row.velocity,
  daysSinceLastSale: row.daysSinceLastSale,
  returnRate: row.returnRate,
  unitsReturned: row.unitsReturned,
  abcClass: row.abcClass,
  movement: row.movement,
  isNew: row.isNew,
});

const topN = (rows, predicate, compare) => rows.filter(predicate).sort(compare).slice(0, LEADERBOARD_SIZE).map(leaderboardRow);

const getAnalyticsOverview = async ({ organizationId, branchId, query = {} }) => {
  const period = resolvePeriod(query);
  const analytics = await getBranchAnalytics({ organizationId, branchId, period });
  const rows = analytics.rows;
  const sum = (field, list = rows) => list.reduce((total, row) => total + (Number(row[field]) || 0), 0);

  const netRevenue = sum('netRevenue');
  const netProfit = sum('netProfit');
  const prevRevenue = rows.reduce((t, r) => t + r.previous.netRevenue, 0);
  const prevProfit = rows.reduce((t, r) => t + r.previous.netProfit, 0);
  const prevUnits = rows.reduce((t, r) => t + r.previous.netUnits, 0);
  const netUnits = sum('netUnits');

  const countBy = (predicate) => rows.filter(predicate).length;
  const dead = rows.filter((r) => r.movement === 'dead');
  const abc = ['A', 'B', 'C'].reduce((acc, cls) => {
    const members = rows.filter((r) => r.abcClass === cls);
    const revenue = sum('netRevenue', members);
    acc[cls] = { count: members.length, revenue: round(revenue), share: netRevenue > 0 ? round((revenue / netRevenue) * 100) : 0 };
    return acc;
  }, {});

  return {
    period: periodPayload(period),
    totals: {
      netRevenue: round(netRevenue),
      netProfit: round(netProfit),
      margin: netRevenue > 0 ? round((netProfit / netRevenue) * 100) : null,
      netUnits: round(netUnits, 3),
      unitsReturned: round(sum('unitsReturned'), 3),
      returnValue: round(sum('returnValue')),
      discount: round(sum('discount')),
      unitsPurchased: round(sum('unitsPurchased'), 3),
      purchaseSpend: round(sum('purchaseSpend')),
      stockValue: round(sum('stockValue')),
    },
    previous: {
      netRevenue: round(prevRevenue),
      netProfit: round(prevProfit),
      netUnits: round(prevUnits, 3),
      margin: prevRevenue > 0 ? round((prevProfit / prevRevenue) * 100) : null,
    },
    growth: {
      revenue: pctChange(netRevenue, prevRevenue),
      profit: pctChange(netProfit, prevProfit),
      units: pctChange(netUnits, prevUnits),
    },
    counts: {
      totalProducts: rows.length,
      activeProducts: countBy((r) => r.isActive),
      productsSold: countBy((r) => r.netUnits > 0),
      fast: countBy((r) => r.movement === 'fast'),
      steady: countBy((r) => r.movement === 'steady'),
      slow: countBy((r) => r.movement === 'slow'),
      noSales: countBy((r) => r.movement === 'no_sales'),
      dead: dead.length,
      stockoutRisk: countBy((r) => r.daysOfCover !== null && r.daysOfCover <= ANALYTICS_CONFIG.STOCKOUT_WARNING_DAYS),
      newProducts: countBy((r) => r.isNew),
    },
    deadStock: { count: dead.length, value: round(sum('stockValue', dead)) },
    abc,
    leaderboards: {
      topRevenue: topN(rows, (r) => r.netRevenue > 0, (a, b) => b.netRevenue - a.netRevenue),
      topProfit: topN(rows, (r) => r.netProfit > 0, (a, b) => b.netProfit - a.netProfit),
      topUnits: topN(rows, (r) => r.netUnits > 0, (a, b) => b.netUnits - a.netUnits),
      rising: topN(rows, (r) => r.revenueDelta > 0 && r.previous.netRevenue > 0, (a, b) => b.revenueDelta - a.revenueDelta),
      declining: topN(rows, (r) => r.revenueDelta < 0, (a, b) => a.revenueDelta - b.revenueDelta),
      stockoutRisk: topN(
        rows,
        (r) => r.daysOfCover !== null && r.daysOfCover <= ANALYTICS_CONFIG.STOCKOUT_WARNING_DAYS,
        (a, b) => a.daysOfCover - b.daysOfCover || b.velocity - a.velocity
      ),
      deadStock: topN(rows, (r) => r.movement === 'dead', (a, b) => b.stockValue - a.stockValue),
      mostReturned: topN(
        rows,
        (r) => r.unitsReturned >= ANALYTICS_CONFIG.MIN_RETURNED_UNITS_FOR_SIGNAL && r.returnRate !== null,
        (a, b) => b.returnRate - a.returnRate || b.unitsReturned - a.unitsReturned
      ),
    },
    series: analytics.series,
  };
};

/** Compact metrics for specific products (e.g. the rows on one page of the catalog table). */
const getMetricsForProducts = async ({ organizationId, branchId, productIds, query = {} }) => {
  const period = resolvePeriod(query);
  const analytics = await getBranchAnalytics({ organizationId, branchId, period });
  const data = {};
  productIds.forEach((id) => {
    const row = analytics.rowsById.get(String(id));
    if (!row) return;
    data[row.productId] = {
      netUnits: row.netUnits,
      netRevenue: row.netRevenue,
      netProfit: row.netProfit,
      margin: row.margin,
      revenueGrowth: row.revenueGrowth,
      unitsGrowth: row.unitsGrowth,
      daysOfCover: row.daysOfCover,
      abcClass: row.abcClass,
      movement: row.movement,
      ranks: row.ranks,
      isNew: row.isNew,
    };
  });
  return { data, rankedCounts: analytics.rankedCounts, period: periodPayload(period) };
};

/* ── Single product ─────────────────────────────────────────────────────────── */

const findScopedProduct = async ({ organizationId, branchId, productId }) => {
  if (!mongoose.Types.ObjectId.isValid(productId)) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
  const product = await Product.findOne({ _id: productId, ...buildScope({ organizationId, branchId }) })
    .populate('brandId', 'name logo')
    .populate('supplier', 'name nameUrdu phone')
    .lean();
  if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
  return product;
};

const isCustomerRef = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return text !== '' && text !== 'walk-in' && mongoose.Types.ObjectId.isValid(text);
};

const variantLabelOf = (variant) => {
  if (!variant || !variant.attributes) return '';
  const entries = variant.attributes instanceof Map ? [...variant.attributes.values()] : Object.values(variant.attributes);
  return entries.filter(Boolean).join(' / ');
};

const getProductAnalytics = async ({ organizationId, branchId, productId, query = {} }) => {
  const product = await findScopedProduct({ organizationId, branchId, productId });
  const period = resolvePeriod(query);
  const scope = buildScope({ organizationId, branchId });
  const pid = product._id;
  const productIds = [pid];
  const supplierWindowStart = new Date(period.end.getTime() - 365 * DAY_MS);

  const [analytics, salesSeries, purchaseSeries, customerRows, supplierRows, variantSales, lastSaleDocs, lastPurchaseDocs] =
    await Promise.all([
      getBranchAnalytics({ organizationId, branchId, period }),
      Invoice.aggregate([
        ...soldLineStages({ scope, start: period.start, end: period.end, productIds }),
        {
          $group: {
            _id: { b: dayKeyExpr('$invoiceDate'), i: '$_id' },
            units: { $sum: '$_units' },
            revenue: { $sum: '$_revenue' },
            profit: { $sum: '$_profit' },
          },
        },
        {
          $group: {
            _id: '$_id.b',
            units: { $sum: '$units' },
            revenue: { $sum: '$revenue' },
            profit: { $sum: '$profit' },
            invoiceCount: { $sum: 1 },
          },
        },
      ]),
      Purchase.aggregate([
        ...purchasedLineStages({ scope, start: period.start, end: period.end, productIds }),
        { $group: { _id: dayKeyExpr('$purchaseDate'), units: { $sum: '$_units' }, spend: { $sum: '$_spend' } } },
      ]),
      Invoice.aggregate([
        ...soldLineStages({
          scope,
          start: period.start,
          end: period.end,
          productIds,
          extraProject: { customerId: 1 },
        }),
        {
          $group: {
            _id: { c: { $toString: { $ifNull: ['$customerId', ''] } }, i: '$_id' },
            units: { $sum: '$_units' },
            revenue: { $sum: '$_revenue' },
            profit: { $sum: '$_profit' },
            at: { $max: '$invoiceDate' },
          },
        },
        {
          $group: {
            _id: '$_id.c',
            units: { $sum: '$units' },
            revenue: { $sum: '$revenue' },
            profit: { $sum: '$profit' },
            invoices: { $sum: 1 },
            lastPurchasedAt: { $max: '$at' },
          },
        },
        { $sort: { revenue: -1 } },
      ]),
      Purchase.aggregate([
        ...purchasedLineStages({
          scope,
          start: supplierWindowStart,
          end: period.end,
          productIds,
          extraProject: { supplier: 1 },
        }),
        { $addFields: { _unitCost: { $cond: [{ $gt: ['$_units', 0] }, { $divide: ['$_spend', '$_units'] }, null] } } },
        { $sort: { purchaseDate: 1 } },
        {
          $group: {
            _id: '$supplier',
            units: { $sum: '$_units' },
            spend: { $sum: '$_spend' },
            purchases: { $sum: 1 },
            minUnitCost: { $min: '$_unitCost' },
            maxUnitCost: { $max: '$_unitCost' },
            lastUnitCost: { $last: '$_unitCost' },
            lastPurchasedAt: { $last: '$purchaseDate' },
          },
        },
      ]),
      product.hasVariants
        ? Invoice.aggregate([
            ...soldLineStages({ scope, start: period.start, end: period.end, productIds }),
            {
              $group: {
                _id: '$items.variantId',
                units: { $sum: '$_units' },
                revenue: { $sum: '$_revenue' },
                profit: { $sum: '$_profit' },
              },
            },
          ])
        : [],
      Invoice.aggregate([
        { $match: { ...scope, ...SOLD_INVOICE_MATCH, 'items.productId': pid } },
        { $sort: { invoiceDate: -1 } },
        { $limit: 1 },
        {
          $project: {
            invoiceNumber: 1,
            invoiceDate: 1,
            items: { $filter: { input: '$items', as: 'line', cond: { $eq: ['$$line.productId', pid] } } },
          },
        },
      ]),
      Purchase.aggregate([
        { $match: { ...scope, 'items.product': pid } },
        { $sort: { purchaseDate: -1 } },
        { $limit: 1 },
        { $lookup: { from: Supplier.collection.name, localField: 'supplier', foreignField: '_id', as: '_supplier' } },
        {
          $project: {
            invoiceNumber: 1,
            purchaseDate: 1,
            supplier: 1,
            supplierName: { $arrayElemAt: ['$_supplier.name', 0] },
            items: { $filter: { input: '$items', as: 'line', cond: { $eq: ['$$line.product', pid] } } },
          },
        },
      ]),
    ]);

  const row = analytics.rowsById.get(String(pid));
  if (!row) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');

  // Customers — walk-ins (no linked customer) are summarised, not ranked.
  const walkIn = { units: 0, revenue: 0, invoices: 0 };
  const namedCustomerRows = [];
  customerRows.forEach((entry) => {
    if (isCustomerRef(entry._id)) namedCustomerRows.push(entry);
    else {
      walkIn.units += entry.units;
      walkIn.revenue += entry.revenue;
      walkIn.invoices += entry.invoices;
    }
  });
  const topCustomerRows = namedCustomerRows.slice(0, 10);
  const customerDocs = topCustomerRows.length
    ? await Customer.find({ _id: { $in: topCustomerRows.map((c) => toObjectId(c._id)) } }).select('name nameUrdu phone').lean()
    : [];
  const customersById = indexById(customerDocs);

  const supplierDocs = supplierRows.length
    ? await Supplier.find({ _id: { $in: supplierRows.map((s) => s._id).filter(Boolean) } }).select('name nameUrdu phone').lean()
    : [];
  const suppliersById = indexById(supplierDocs);
  const suppliers = supplierRows
    .map((entry) => {
      const doc = suppliersById.get(String(entry._id)) || {};
      return {
        supplierId: entry._id ? String(entry._id) : null,
        name: doc.name || 'Unknown supplier',
        nameUrdu: doc.nameUrdu || '',
        phone: doc.phone || '',
        units: round(entry.units, 3),
        spend: round(entry.spend),
        purchases: entry.purchases,
        avgUnitCost: entry.units > 0 ? round(entry.spend / entry.units) : null,
        minUnitCost: entry.minUnitCost === null ? null : round(entry.minUnitCost),
        maxUnitCost: entry.maxUnitCost === null ? null : round(entry.maxUnitCost),
        lastUnitCost: entry.lastUnitCost === null ? null : round(entry.lastUnitCost),
        lastPurchasedAt: entry.lastPurchasedAt,
      };
    })
    .sort((a, b) => (a.avgUnitCost ?? Infinity) - (b.avgUnitCost ?? Infinity));

  let variants = [];
  if (product.hasVariants) {
    const [variantDocs, inventoryRows] = await Promise.all([
      ProductVariant.find({ productId: pid, isDefault: false }).select('attributes sku barcode price cost isActive').lean(),
      Inventory.find({ productId: pid }).select('variantId quantity').lean(),
    ]);
    const stockByVariant = new Map();
    inventoryRows.forEach((inv) => stockByVariant.set(String(inv.variantId), (stockByVariant.get(String(inv.variantId)) || 0) + (inv.quantity || 0)));
    const salesByVariant = indexById(variantSales.filter((v) => v._id));
    variants = variantDocs
      .map((variant) => {
        const sold = salesByVariant.get(String(variant._id)) || {};
        const revenue = sold.revenue || 0;
        return {
          variantId: String(variant._id),
          label: variantLabelOf(variant) || variant.sku || 'Variant',
          sku: variant.sku || '',
          barcode: variant.barcode || '',
          price: variant.price,
          cost: variant.cost,
          isActive: variant.isActive !== false,
          currentStock: stockByVariant.get(String(variant._id)) || 0,
          unitsSold: round(sold.units || 0, 3),
          revenue: round(revenue),
          profit: round(sold.profit || 0),
          margin: revenue > 0 ? round(((sold.profit || 0) / revenue) * 100) : null,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }

  const lastSaleDoc = lastSaleDocs[0];
  const lastSaleLine = lastSaleDoc && lastSaleDoc.items && lastSaleDoc.items[0];
  const lastPurchaseDoc = lastPurchaseDocs[0];
  const lastPurchaseLine = lastPurchaseDoc && lastPurchaseDoc.items && lastPurchaseDoc.items[0];
  const lastPurchaseUnits = lastPurchaseLine ? lastPurchaseLine.stockQuantity || lastPurchaseLine.quantity || 0 : 0;
  const lastPurchaseUnitCost =
    lastPurchaseLine && lastPurchaseUnits > 0 ? round((lastPurchaseLine.total || 0) / lastPurchaseUnits) : null;

  const metrics = { ...row, lastPurchaseUnitCost };
  const insights = buildProductInsights({
    metrics,
    product: {
      price: product.hasVariants ? row.price : Number(product.price) || 0,
      cost: product.hasVariants ? row.cost : Number(product.cost) || 0,
      hasVariants: row.hasVariants,
    },
    suppliers,
  });

  const brand = product.brandId && typeof product.brandId === 'object' ? product.brandId : null;
  const supplier = product.supplier && typeof product.supplier === 'object' ? product.supplier : null;

  return {
    product: {
      id: String(pid),
      name: product.name,
      nameUrdu: product.nameUrdu || '',
      description: product.description || '',
      image: product.image && product.image.url ? product.image : null,
      barcode: product.barcode || '',
      sku: product.sku || '',
      unit: product.unit,
      color: product.color || null,
      tags: product.tags || [],
      shelfLocation: product.shelfLocation || '',
      isActive: product.isActive !== false,
      hasVariants: Boolean(product.hasVariants),
      trackImei: Boolean(product.trackImei),
      trackSerial: Boolean(product.trackSerial),
      warrantyMonths: product.warrantyMonths || 0,
      flag: product.flag || null,
      lowStockThreshold: product.lowStockThreshold ?? null,
      criticalStockThreshold: product.criticalStockThreshold ?? null,
      categories: (product.categories || []).map((c) => ({ id: c._id ? String(c._id) : null, name: c.name })),
      subCategories: (product.subCategories || []).map((c) => ({ id: c._id ? String(c._id) : null, name: c.name })),
      brand: brand ? { id: String(brand._id), name: brand.name, logo: brand.logo && brand.logo.url ? brand.logo.url : null } : null,
      defaultSupplier: supplier ? { id: String(supplier._id), name: supplier.name, phone: supplier.phone || '' } : null,
      // Simple products read price/cost from the fresh document (the branch rows may be up to
      // CACHE_TTL_MS old), so an edit made a moment ago shows immediately.
      price: product.hasVariants ? row.price : Number(product.price) || 0,
      cost: product.hasVariants ? row.cost : Number(product.cost) || 0,
      priceRange: row.priceRange,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    },
    period: periodPayload(period),
    metrics: toClientRow(metrics),
    rankedCounts: analytics.rankedCounts,
    totalProducts: analytics.rows.length,
    series: bucketSeries(period, salesSeries, purchaseSeries),
    customers: {
      uniqueCustomers: namedCustomerRows.length,
      walkIn: { units: round(walkIn.units, 3), revenue: round(walkIn.revenue), invoices: walkIn.invoices },
      top: topCustomerRows.map((entry) => {
        const doc = customersById.get(String(entry._id)) || {};
        return {
          customerId: String(entry._id),
          name: doc.name || 'Deleted customer',
          nameUrdu: doc.nameUrdu || '',
          phone: doc.phone || '',
          units: round(entry.units, 3),
          revenue: round(entry.revenue),
          profit: round(entry.profit),
          invoices: entry.invoices,
          lastPurchasedAt: entry.lastPurchasedAt,
        };
      }),
    },
    suppliers,
    supplierWindow: { startDate: toBusinessCalendarDate(supplierWindowStart), endDate: period.endKey },
    variants,
    lastSale: lastSaleLine
      ? {
          date: lastSaleDoc.invoiceDate,
          invoiceNumber: lastSaleDoc.invoiceNumber,
          unitPrice: lastSaleLine.unitPrice,
          invoiceId: String(lastSaleDoc._id),
        }
      : null,
    lastPurchase: lastPurchaseLine
      ? {
          date: lastPurchaseDoc.purchaseDate,
          invoiceNumber: lastPurchaseDoc.invoiceNumber,
          purchaseId: String(lastPurchaseDoc._id),
          supplierId: lastPurchaseDoc.supplier ? String(lastPurchaseDoc.supplier) : null,
          supplierName: lastPurchaseDoc.supplierName || null,
          unitCost: lastPurchaseUnitCost,
        }
      : null,
    insights,
  };
};

/* ── Activity ledger ────────────────────────────────────────────────────────── */

const ACTIVITY_TYPES = ['sale', 'purchase', 'sale_return', 'purchase_return', 'adjustment', 'transfer'];
const MAX_ACTIVITY_WINDOW = 5000;

/**
 * One chronological stream of everything that happened to a product: sales, purchases,
 * returns both ways, stock adjustments and branch transfers. Each source is read newest
 * first up to page*limit rows and merged — correct pagination without a union collection.
 * Quantities are signed from the branch's point of view (+ in, − out).
 */
const getProductActivity = async ({ organizationId, branchId, productId, query = {} }) => {
  const product = await findScopedProduct({ organizationId, branchId, productId });
  const pid = product._id;
  const scope = buildScope({ organizationId, branchId });
  const hasRange = Boolean(query.startDate || query.endDate);
  const period = hasRange ? resolvePeriod(query) : null;
  const range = (field) => (period ? { [field]: { $gte: period.start, $lte: period.end } } : {});
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const fetchWindow = Math.min(page * limit, MAX_ACTIVITY_WINDOW);
  const requested = String(query.type || 'all')
    .split(',')
    .filter((type) => ACTIVITY_TYPES.includes(type));
  const types = requested.length ? requested : ACTIVITY_TYPES;

  const sources = {
    sale: {
      count: () =>
        Invoice.aggregate([
          { $match: { ...scope, ...SOLD_INVOICE_MATCH, ...range('invoiceDate'), 'items.productId': pid } },
          { $project: { items: { $filter: { input: '$items', as: 'l', cond: { $eq: ['$$l.productId', pid] } } } } },
          { $unwind: '$items' },
          { $group: { _id: null, count: { $sum: 1 }, units: { $sum: lineUnitsExpr('$items') } } },
        ]),
      rows: () =>
        Invoice.aggregate([
          { $match: { ...scope, ...SOLD_INVOICE_MATCH, ...range('invoiceDate'), 'items.productId': pid } },
          { $sort: { invoiceDate: -1, _id: -1 } },
          { $limit: fetchWindow },
          {
            $project: {
              invoiceNumber: 1,
              invoiceDate: 1,
              type: 1,
              customerId: 1,
              walkInCustomerName: 1,
              customerName: 1,
              items: { $filter: { input: '$items', as: 'l', cond: { $eq: ['$$l.productId', pid] } } },
            },
          },
          { $unwind: '$items' },
        ]).then((docs) =>
          docs.map((doc) => ({
            type: 'sale',
            date: doc.invoiceDate,
            referenceId: String(doc._id),
            reference: doc.invoiceNumber,
            subtype: doc.type,
            partyId: isCustomerRef(doc.customerId) ? String(doc.customerId) : null,
            partyName: doc.walkInCustomerName || doc.customerName || null,
            quantity: -(doc.items.stockQuantity || doc.items.quantity || 0),
            unitPrice: doc.items.unitPrice,
            amount: doc.items.subtotal,
            profit: doc.items.profit,
            variantId: doc.items.variantId ? String(doc.items.variantId) : null,
            batchNumber: doc.items.batchNumber || null,
            imeis: doc.items.imeis || [],
          }))
        ),
    },
    purchase: {
      count: () =>
        Purchase.aggregate([
          { $match: { ...scope, ...range('purchaseDate'), 'items.product': pid } },
          { $project: { items: { $filter: { input: '$items', as: 'l', cond: { $eq: ['$$l.product', pid] } } } } },
          { $unwind: '$items' },
          { $group: { _id: null, count: { $sum: 1 }, units: { $sum: lineUnitsExpr('$items') } } },
        ]),
      rows: () =>
        Purchase.aggregate([
          { $match: { ...scope, ...range('purchaseDate'), 'items.product': pid } },
          { $sort: { purchaseDate: -1, _id: -1 } },
          { $limit: fetchWindow },
          {
            $project: {
              invoiceNumber: 1,
              vendorBillNumber: 1,
              purchaseDate: 1,
              type: 1,
              supplier: 1,
              items: { $filter: { input: '$items', as: 'l', cond: { $eq: ['$$l.product', pid] } } },
            },
          },
          { $unwind: '$items' },
        ]).then((docs) =>
          docs.map((doc) => ({
            type: 'purchase',
            date: doc.purchaseDate,
            referenceId: String(doc._id),
            reference: doc.invoiceNumber,
            subtype: doc.type,
            note: doc.vendorBillNumber || null,
            partyId: doc.supplier ? String(doc.supplier) : null,
            quantity: doc.items.stockQuantity || doc.items.quantity || 0,
            unitPrice: doc.items.priceAtPurchase,
            amount: doc.items.total,
            variantId: doc.items.variantId ? String(doc.items.variantId) : null,
            batchNumber: doc.items.batchNumber || null,
            imeis: doc.items.imeis || [],
          }))
        ),
    },
    sale_return: {
      count: () =>
        SalesReturn.aggregate([
          { $match: { ...scope, ...ACTIVE_RETURN_MATCH, ...range('date'), 'items.productId': pid } },
          { $project: { items: { $filter: { input: '$items', as: 'l', cond: { $eq: ['$$l.productId', pid] } } } } },
          { $unwind: '$items' },
          { $group: { _id: null, count: { $sum: 1 }, units: { $sum: lineUnitsExpr('$items') } } },
        ]),
      rows: () =>
        SalesReturn.aggregate([
          { $match: { ...scope, ...ACTIVE_RETURN_MATCH, ...range('date'), 'items.productId': pid } },
          { $sort: { date: -1, _id: -1 } },
          { $limit: fetchWindow },
          {
            $project: {
              returnNumber: 1,
              date: 1,
              status: 1,
              reason: 1,
              customerId: 1,
              customerName: 1,
              items: { $filter: { input: '$items', as: 'l', cond: { $eq: ['$$l.productId', pid] } } },
            },
          },
          { $unwind: '$items' },
        ]).then((docs) =>
          docs.map((doc) => ({
            type: 'sale_return',
            date: doc.date,
            referenceId: String(doc._id),
            reference: doc.returnNumber,
            subtype: doc.status,
            note: doc.reason || null,
            partyId: doc.customerId ? String(doc.customerId) : null,
            partyName: doc.customerName || null,
            quantity: doc.items.stockQuantity || doc.items.quantity || 0,
            unitPrice: doc.items.price,
            amount: doc.items.total,
            variantId: doc.items.variantId ? String(doc.items.variantId) : null,
            batchNumber: doc.items.batchNumber || null,
          }))
        ),
    },
    purchase_return: {
      count: () =>
        PurchaseReturn.aggregate([
          { $match: { ...scope, ...ACTIVE_RETURN_MATCH, ...range('date'), 'items.productId': pid } },
          { $project: { items: { $filter: { input: '$items', as: 'l', cond: { $eq: ['$$l.productId', pid] } } } } },
          { $unwind: '$items' },
          { $group: { _id: null, count: { $sum: 1 }, units: { $sum: lineUnitsExpr('$items') } } },
        ]),
      rows: () =>
        PurchaseReturn.aggregate([
          { $match: { ...scope, ...ACTIVE_RETURN_MATCH, ...range('date'), 'items.productId': pid } },
          { $sort: { date: -1, _id: -1 } },
          { $limit: fetchWindow },
          {
            $project: {
              returnNumber: 1,
              date: 1,
              status: 1,
              reason: 1,
              supplierId: 1,
              items: { $filter: { input: '$items', as: 'l', cond: { $eq: ['$$l.productId', pid] } } },
            },
          },
          { $unwind: '$items' },
        ]).then((docs) =>
          docs.map((doc) => ({
            type: 'purchase_return',
            date: doc.date,
            referenceId: String(doc._id),
            reference: doc.returnNumber,
            subtype: doc.status,
            note: doc.reason || null,
            partyId: doc.supplierId ? String(doc.supplierId) : null,
            quantity: -(doc.items.stockQuantity || doc.items.quantity || 0),
            unitPrice: doc.items.price,
            amount: doc.items.total,
            variantId: doc.items.variantId ? String(doc.items.variantId) : null,
            batchNumber: doc.items.batchNumber || null,
          }))
        ),
    },
    adjustment: {
      count: () =>
        StockAdjustment.aggregate([
          { $match: { ...scope, productId: pid, ...range('createdAt') } },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              units: { $sum: { $cond: [{ $eq: ['$direction', 'increase'] }, '$quantity', { $multiply: ['$quantity', -1] }] } },
            },
          },
        ]),
      rows: () =>
        StockAdjustment.find({ ...scope, productId: pid, ...range('createdAt') })
          .sort({ createdAt: -1, _id: -1 })
          .limit(fetchWindow)
          .lean()
          .then((docs) =>
            docs.map((doc) => ({
              type: 'adjustment',
              date: doc.createdAt,
              referenceId: String(doc._id),
              reference: null,
              subtype: doc.type,
              status: doc.status,
              note: doc.reason || doc.notes || null,
              quantity: doc.direction === 'increase' ? doc.quantity : -doc.quantity,
              unitPrice: doc.unitCost,
              amount: doc.totalValue,
              variantId: doc.variantId ? String(doc.variantId) : null,
              imeis: doc.imeis || [],
            }))
          ),
    },
    transfer: (() => {
      // Only transfers that actually moved stock. Branch-less scope (org-wide) sees both legs.
      const legs = [];
      if (scope.branchId) {
        legs.push({ fromBranchId: scope.branchId, fromProductId: pid });
        legs.push({ toBranchId: scope.branchId, toProductId: pid, status: 'completed' });
      } else {
        legs.push({ fromProductId: pid });
        legs.push({ toProductId: pid, status: 'completed' });
      }
      const match = {
        organizationId: scope.organizationId,
        status: { $in: ['in_transit', 'completed'] },
        $or: legs,
        ...range('createdAt'),
      };
      return {
        count: () =>
          InventoryTransfer.aggregate([
            { $match: match },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                units: { $sum: { $cond: [{ $eq: ['$fromProductId', pid] }, { $multiply: ['$quantity', -1] }, '$quantity'] } },
              },
            },
          ]),
        rows: () =>
          InventoryTransfer.find(match)
            .sort({ createdAt: -1, _id: -1 })
            .limit(fetchWindow)
            .populate('fromBranchId', 'name')
            .populate('toBranchId', 'name')
            .lean()
            .then((docs) =>
              docs.map((doc) => {
                const outgoing = String(doc.fromProductId) === String(pid);
                const otherBranch = outgoing ? doc.toBranchId : doc.fromBranchId;
                return {
                  type: 'transfer',
                  date: doc.completedAt || doc.createdAt,
                  referenceId: String(doc._id),
                  reference: doc.transferNumber || null,
                  subtype: outgoing ? 'out' : 'in',
                  status: doc.status,
                  partyName: otherBranch && otherBranch.name ? otherBranch.name : null,
                  note: doc.notes || doc.reason || null,
                  quantity: outgoing ? -doc.quantity : doc.quantity,
                  unitPrice: doc.batchSnapshot ? doc.batchSnapshot.costPerUnit : null,
                  amount: null,
                  variantId: (outgoing ? doc.fromVariantId : doc.toVariantId) ? String(outgoing ? doc.fromVariantId : doc.toVariantId) : null,
                  imeis: doc.imeis || [],
                };
              })
            ),
      };
    })(),
  };

  const [countResults, rowResults] = await Promise.all([
    Promise.all(ACTIVITY_TYPES.map((type) => sources[type].count())),
    Promise.all(types.map((type) => sources[type].rows())),
  ]);

  const summary = {};
  ACTIVITY_TYPES.forEach((type, index) => {
    const hit = countResults[index][0];
    summary[type] = { count: hit ? hit.count : 0, units: hit ? round(hit.units, 3) : 0 };
  });

  const merged = rowResults
    .flat()
    .sort((a, b) => new Date(b.date) - new Date(a.date) || String(b.referenceId).localeCompare(String(a.referenceId)));
  const pageRows = merged.slice((page - 1) * limit, page * limit);

  // Resolve party names for the page only.
  const customerIds = pageRows.filter((r) => (r.type === 'sale' || r.type === 'sale_return') && r.partyId).map((r) => r.partyId);
  const supplierIds = pageRows.filter((r) => (r.type === 'purchase' || r.type === 'purchase_return') && r.partyId).map((r) => r.partyId);
  const variantIds = pageRows.filter((r) => r.variantId).map((r) => r.variantId);
  const [customers, suppliers, variants] = await Promise.all([
    customerIds.length ? Customer.find({ _id: { $in: customerIds } }).select('name').lean() : [],
    supplierIds.length ? Supplier.find({ _id: { $in: supplierIds } }).select('name').lean() : [],
    variantIds.length ? ProductVariant.find({ _id: { $in: variantIds }, isDefault: false }).select('attributes sku').lean() : [],
  ]);
  const customerNames = new Map(customers.map((c) => [String(c._id), c.name]));
  const supplierNames = new Map(suppliers.map((s) => [String(s._id), s.name]));
  const variantLabels = new Map(variants.map((v) => [String(v._id), variantLabelOf(v) || v.sku || null]));

  const totalResults = types.reduce((total, type) => total + summary[type].count, 0);
  return {
    results: pageRows.map((entry, index) => ({
      id: `${entry.type}:${entry.referenceId}:${(page - 1) * limit + index}`,
      ...entry,
      partyName:
        (entry.partyId && (customerNames.get(entry.partyId) || supplierNames.get(entry.partyId))) || entry.partyName || null,
      variantLabel: entry.variantId ? variantLabels.get(entry.variantId) || null : null,
    })),
    page,
    limit,
    totalResults,
    totalPages: Math.max(1, Math.ceil(Math.min(totalResults, MAX_ACTIVITY_WINDOW) / limit)),
    summary,
    types,
  };
};

module.exports = {
  SOLD_INVOICE_MATCH,
  RANKING_SORT_FIELDS,
  ACTIVITY_TYPES,
  resolvePeriod,
  getProductRankings,
  getProductRankingsExport,
  getAnalyticsOverview,
  getMetricsForProducts,
  getProductAnalytics,
  getProductActivity,
  clearAnalyticsCache,
};
