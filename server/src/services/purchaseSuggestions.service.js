const mongoose = require('mongoose');
const { Product, Branch, Invoice, PurchaseOrder, SeasonalFactor, InventoryTransfer, Insight } = require('../models');
const supplierScoringService = require('./supplierScoring.service');
const productService = require('./product.service');

/* ────────────────────────────────────────────────────────────────────────
 * CONFIG — every tunable number the engine uses. Nothing below is a fixed
 * "magic number" baked into formulas; this is the one place to retune behaviour.
 * ──────────────────────────────────────────────────────────────────────── */
const CONFIG = {
  // Demand windows. 30-day is the primary signal for reorder math: long enough to
  // smooth weekday/weekend noise, short enough to stay current. 7-day is used only
  // for trend detection (rising/falling needs to react faster than 30-day allows).
  // 90-day is the fallback when a product has too little 30-day history to trust
  // (new products, very low velocity) and is also the dead-stock detection window.
  DEMAND_WINDOW_SHORT_DAYS: 7,
  DEMAND_WINDOW_PRIMARY_DAYS: 30,
  DEMAND_WINDOW_LONG_DAYS: 90,
  MIN_ORDERS_FOR_PRIMARY_WINDOW: 3, // below this many orders in 30d, blend in the 90-day rate instead

  // Safety stock — classic service-level formula, scaled by supplier reliability and
  // recent stockout history instead of a fixed number of "buffer days".
  SERVICE_LEVEL_Z: 1.65, // ~95% service level (probability of not stocking out during lead time)
  STOCKOUT_HISTORY_BUFFER_DAYS: 3, // extra days of demand added per 100% recent-stockout-frequency
  STOCKOUT_TRACKING_WINDOW_DAYS: 90,

  DEFAULT_LEAD_TIME_DAYS: 7, // used only when a product has no supplier / no order history at all

  // Demand-signal confidence gate: a product with zero sales in the last 30 days but
  // a single sale 80 days ago still produces a tiny non-zero blended daily demand —
  // without this gate every long-discontinued SKU would generate a noise reorder
  // suggestion. Require either recent activity (qty30 > 0) or a real 90-day volume.
  MIN_QTY_90_WHEN_NO_RECENT_SALES: 5,

  STOCK_OUT_RISK_DAYS: 14,
  DEAD_STOCK_WINDOW_DAYS: 90,
  LIQUIDATION_WINDOW_DAYS: 180,
  DEAD_STOCK_HIGH_VALUE_THRESHOLD: 10000, // tied-up capital (Rs) above which "discount" beats "bundle"
  DEAD_STOCK_BUNDLE_MAX_UNIT_VALUE: 500, // low-value, slow units are better bundled than discounted alone

  TREND_RISING_THRESHOLD_PCT: 10,
  TREND_FALLING_THRESHOLD_PCT: -10,
  MIN_VOLUME_FOR_TREND: 3, // ignore trend noise below this many units/week

  // Multi-branch transfers: a branch is only "surplus" if it can give away stock and
  // still keep this many days of its own demand covered afterwards.
  MIN_BRANCH_SELF_COVER_DAYS: 30,
  MIN_TRANSFER_QTY: 1,

  PURCHASE_HORIZONS_DAYS: [30, 60, 90],
  DEFAULT_HORIZON_DAYS: 30,

  INSIGHT_TTL_HOURS: 48,
};

const toObjectId = (id) => (mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(String(id)) : id);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const daysAgo = (n, from = new Date()) => new Date(from.getTime() - n * 24 * 60 * 60 * 1000);
const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

/* ────────────────────────────────────────────────────────────────────────
 * PURE ALGORITHMS — no I/O, unit-testable in isolation.
 * ──────────────────────────────────────────────────────────────────────── */

/** Population standard deviation of a numeric series. */
const calcStdDev = (series) => {
  if (series.length === 0) return 0;
  const mean = series.reduce((s, v) => s + v, 0) / series.length;
  const variance = series.reduce((s, v) => s + (v - mean) ** 2, 0) / series.length;
  return Math.sqrt(variance);
};

/**
 * ALGORITHM — Daily Demand: salesInWindow / windowDays, blended with the longer
 * window when the primary window doesn't have enough orders to be trustworthy
 * (e.g. a new product that's only had 2 sales in 30 days).
 */
const calcBlendedDailyDemand = ({ qty30, orders30, qty90 }) => {
  const rate30 = qty30 / CONFIG.DEMAND_WINDOW_PRIMARY_DAYS;
  if (orders30 >= CONFIG.MIN_ORDERS_FOR_PRIMARY_WINDOW) return rate30;
  const rate90 = qty90 / CONFIG.DEMAND_WINDOW_LONG_DAYS;
  // Average the two rather than fully discarding the (thin) 30-day signal.
  return (rate30 + rate90) / 2;
};

/**
 * ALGORITHM — Dynamic Safety Stock.
 *   safetyStock = Z * demandStdDev * sqrt(leadTimeDays) * reliabilityFactor
 *               + stockoutFrequency * dailyDemand * STOCKOUT_HISTORY_BUFFER_DAYS
 *
 * - Z * stdDev * sqrt(leadTime) is the textbook formula for the variability that
 *   needs buffering during a lead time window (more volatile demand -> more buffer).
 * - reliabilityFactor scales that buffer up when the supplier's on-time rate is poor
 *   (a supplier with 70% on-time delivery effectively has unreliable lead time, so we
 *   inflate the safety margin by (1 - onTimeRate)).
 * - The second term adds extra cover proportional to how often this product has
 *   actually run out in the tracked history window — a product that stocks out
 *   often needs a bigger cushion than the formula above alone would suggest.
 */
const calcDynamicSafetyStock = ({ dailyDemand, demandStdDev, leadTimeDays, supplierOnTimeRate, stockoutDaysInWindow }) => {
  const reliabilityFactor = supplierOnTimeRate !== null && supplierOnTimeRate !== undefined ? 1 + (1 - supplierOnTimeRate) : 1.15;
  const variabilityBuffer = CONFIG.SERVICE_LEVEL_Z * demandStdDev * Math.sqrt(Math.max(leadTimeDays, 0)) * reliabilityFactor;

  const stockoutFrequency = stockoutDaysInWindow / CONFIG.STOCKOUT_TRACKING_WINDOW_DAYS;
  const stockoutBuffer = stockoutFrequency * dailyDemand * CONFIG.STOCKOUT_HISTORY_BUFFER_DAYS;

  return Math.max(0, Math.ceil(variabilityBuffer + stockoutBuffer));
};

/**
 * Confidence gate: is there enough real demand signal to act on, or is this just
 * residual noise from one ancient sale? See CONFIG.MIN_QTY_90_WHEN_NO_RECENT_SALES.
 */
const hasEnoughDemandSignal = (p) => p.qty30 > 0 || p.qty90 >= CONFIG.MIN_QTY_90_WHEN_NO_RECENT_SALES;

/** ALGORITHM — Reorder Point: (dailyDemand * leadTime) + safetyStock. */
const calcReorderPoint = ({ dailyDemand, leadTimeDays, safetyStock }) => dailyDemand * leadTimeDays + safetyStock;

/**
 * ALGORITHM — Purchase Quantity Optimization for a given horizon.
 *   suggestedOrderQuantity = max(0, ceil(expectedSales + safetyStock - (currentStock + incomingPOQty)))
 * where expectedSales accounts for an active seasonal multiplier.
 */
const calcSuggestedOrderQuantity = ({ currentStock, incomingPOQty, dailyDemand, safetyStock, horizonDays, seasonalMultiplier = 1 }) => {
  const expectedSales = dailyDemand * seasonalMultiplier * horizonDays;
  const projectedAvailable = currentStock + incomingPOQty;
  return Math.max(0, Math.ceil(expectedSales + safetyStock - projectedAvailable));
};

/** ALGORITHM — Demand Trend: compares last-7-days vs the previous 7 days. */
const calcDemandTrend = (last7Qty, prev7Qty) => {
  let growthPercent;
  if (prev7Qty > 0) growthPercent = ((last7Qty - prev7Qty) / prev7Qty) * 100;
  else growthPercent = last7Qty > 0 ? 100 : 0;

  const volumeEnough = Math.max(last7Qty, prev7Qty) >= CONFIG.MIN_VOLUME_FOR_TREND;
  let label = 'stable';
  if (volumeEnough) {
    if (growthPercent >= CONFIG.TREND_RISING_THRESHOLD_PCT) label = 'rising';
    else if (growthPercent <= CONFIG.TREND_FALLING_THRESHOLD_PCT) label = 'falling';
  }
  return { growthPercent: round2(growthPercent), label, last7Qty, prev7Qty };
};

/** Whether `date` falls inside a recurring month/day window (handles year-boundary wraparound). */
const isWithinSeasonalWindow = (date, { startMonth, startDay, endMonth, endDay }) => {
  const asNumber = (m, d) => m * 100 + d;
  const current = asNumber(date.getMonth() + 1, date.getDate());
  const start = asNumber(startMonth, startDay);
  const end = asNumber(endMonth, endDay);
  if (start <= end) return current >= start && current <= end;
  return current >= start || current <= end;
};

/** Picks the strongest currently-active seasonal multiplier applicable to a product, if any. */
const getActiveSeasonalFactor = ({ seasonalFactors, productId, categoryName, date = new Date() }) => {
  const matches = seasonalFactors.filter((f) => {
    const scopedToProduct = f.productIds?.some((id) => String(id) === String(productId));
    const scopedToCategory = f.categoryNames?.includes(categoryName);
    const isGlobal = (f.productIds?.length || 0) === 0 && (f.categoryNames?.length || 0) === 0;
    return (scopedToProduct || scopedToCategory || isGlobal) && isWithinSeasonalWindow(date, f);
  });
  if (matches.length === 0) return null;
  return matches.reduce((best, f) => (f.multiplier > best.multiplier ? f : best), matches[0]);
};

/** ALGORITHM — Dead Stock action tier: discount vs bundle vs liquidation. */
const classifyDeadStockAction = ({ daysSinceLastSale, stockValue, unitValue }) => {
  if (daysSinceLastSale >= CONFIG.LIQUIDATION_WINDOW_DAYS) {
    return { action: 'liquidation', reason: `No sales in ${daysSinceLastSale}+ days — past the point a discount alone typically clears stock.` };
  }
  if (stockValue >= CONFIG.DEAD_STOCK_HIGH_VALUE_THRESHOLD) {
    return { action: 'discount', reason: `Rs${round2(stockValue)} tied up in unsold stock — a price cut frees up capital faster than bundling.` };
  }
  if (unitValue <= CONFIG.DEAD_STOCK_BUNDLE_MAX_UNIT_VALUE) {
    return { action: 'bundle', reason: 'Low per-unit value — bundling with a fast-moving product is more effective than a standalone discount.' };
  }
  return { action: 'discount', reason: `No sales in ${daysSinceLastSale} days — a moderate discount should help move this stock.` };
};

/* ────────────────────────────────────────────────────────────────────────
 * DATA FETCHERS
 * ──────────────────────────────────────────────────────────────────────── */

const SALES_MATCH_BASE = { type: { $ne: 'quotation' }, status: { $ne: 'cancelled' } };

/**
 * One aggregation, reused for everything: per-product daily sales for the trailing
 * `windowDays`. Returned as a Map<productId, Map<'YYYY-MM-DD', qty>> so callers can
 * derive 7/30/90-day sums and a zero-filled series for stddev without re-querying.
 */
const aggregateDailyProductSales = async ({ organizationId, branchId, windowDays }) => {
  const start = daysAgo(windowDays);
  const rows = await Invoice.aggregate([
    {
      $match: {
        organizationId: toObjectId(organizationId),
        branchId: toObjectId(branchId),
        invoiceDate: { $gte: start },
        ...SALES_MATCH_BASE,
      },
    },
    { $unwind: '$items' },
    {
      $group: {
        // Collapses to the variant when one exists (real variant, or a batch-tracked
        // simple product's hidden default variant), else the product itself — same
        // "unit key" convention as product.service.js#getPurchasableCatalog's `id`,
        // so sales/PO data lines up with the right catalog row.
        _id: { unitId: { $ifNull: ['$items.variantId', '$items.productId'] }, day: { $dateToString: { format: '%Y-%m-%d', date: '$invoiceDate' } } },
        qty: { $sum: '$items.quantity' },
        orders: { $sum: 1 },
      },
    },
  ]);

  const byProduct = new Map();
  for (const row of rows) {
    const pid = String(row._id.unitId);
    if (!byProduct.has(pid)) byProduct.set(pid, new Map());
    byProduct.get(pid).set(row._id.day, { qty: row.qty, orders: row.orders });
  }
  return byProduct;
};

/** Zero-filled daily series for the last `days`, newest last, used for sums/stddev. */
const buildDailySeries = (dailyMap, days) => {
  const series = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = dayKey(daysAgo(i));
    series.push(dailyMap?.get(key)?.qty || 0);
  }
  return series;
};

/** Open purchase-order quantity (ordered - already received) per product, for a branch. */
const aggregateIncomingPurchaseOrderQty = async ({ organizationId, branchId }) => {
  const rows = await PurchaseOrder.aggregate([
    {
      $match: {
        organizationId: toObjectId(organizationId),
        branchId: toObjectId(branchId),
        status: { $in: ['draft', 'sent', 'partial'] },
      },
    },
    { $unwind: '$items' },
    {
      $group: {
        _id: { $ifNull: ['$items.variantId', '$items.product'] },
        outstandingQty: { $sum: { $subtract: ['$items.quantity', '$items.receivedQuantity'] } },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), Math.max(0, r.outstandingQty)]));
};

/* ────────────────────────────────────────────────────────────────────────
 * PER-BRANCH METRICS — the heart of the engine. Computes everything needed
 * (demand, trend, safety stock, reorder point, supplier lead time) for every
 * product in one branch.
 * ──────────────────────────────────────────────────────────────────────── */

const computeBranchProductMetrics = async ({ organizationId, branchId }) => {
  const orgId = toObjectId(organizationId);
  const brId = toObjectId(branchId);

  // One row per sellable unit — a whole simple product, or each real variant for a
  // hasVariants product, or a batch-tracked simple product's hidden default variant —
  // with real Inventory-based stock and (when tracked) its active batches. See
  // product.service.js#getPurchasableCatalog and docs/architecture/universal-product-migration.md.
  const [products, dailySalesMap, incomingPOMap, seasonalFactors] = await Promise.all([
    productService.getPurchasableCatalog({ organizationId: orgId, branchId: brId }),
    aggregateDailyProductSales({ organizationId: orgId, branchId: brId, windowDays: CONFIG.DEMAND_WINDOW_LONG_DAYS }),
    aggregateIncomingPurchaseOrderQty({ organizationId: orgId, branchId: brId }),
    SeasonalFactor.find({ organizationId: orgId, isActive: true }).lean(),
  ]);

  // Batch supplier lead-time/reliability lookups by unique supplier instead of per-product.
  const supplierIds = [...new Set(products.filter((p) => p.supplier).map((p) => String(p.supplier)))];
  const supplierMetrics = new Map(
    await Promise.all(
      supplierIds.map(async (supplierId) => [supplierId, await supplierScoringService.computeSupplierMetricsCached({ organizationId: orgId, supplierId })]),
    ),
  );

  const stockoutCutoff = daysAgo(CONFIG.STOCKOUT_TRACKING_WINDOW_DAYS);

  return products.map((p) => {
    // Catalog rows already use the right "unit key" as `id` — a variantId when one
    // exists (real variant, or a batch-tracked simple product's default variant),
    // else the productId — matching the sales/PO aggregations above.
    const id = String(p.id);
    const productDaily = dailySalesMap.get(id);

    const series7 = buildDailySeries(productDaily, CONFIG.DEMAND_WINDOW_SHORT_DAYS);
    const series30 = buildDailySeries(productDaily, CONFIG.DEMAND_WINDOW_PRIMARY_DAYS);
    const series90 = buildDailySeries(productDaily, CONFIG.DEMAND_WINDOW_LONG_DAYS);
    const seriesPrev7 = (() => {
      const out = [];
      for (let i = 13; i >= 7; i -= 1) out.push(productDaily?.get(dayKey(daysAgo(i)))?.qty || 0);
      return out;
    })();

    const qty7 = series7.reduce((s, v) => s + v, 0);
    const qty30 = series30.reduce((s, v) => s + v, 0);
    const qty90 = series90.reduce((s, v) => s + v, 0);
    const prevQty7 = seriesPrev7.reduce((s, v) => s + v, 0);
    const orders30 = [...(productDaily?.entries() || [])].filter(([day]) => new Date(day) >= daysAgo(CONFIG.DEMAND_WINDOW_PRIMARY_DAYS)).reduce((s, [, v]) => s + v.orders, 0);

    const dailyDemand = calcBlendedDailyDemand({ qty30, orders30, qty90 });
    const demandStdDev = calcStdDev(series30);
    const trend = calcDemandTrend(qty7, prevQty7);

    const supplierId = p.supplier ? String(p.supplier) : null;
    const supplierMetric = supplierId ? supplierMetrics.get(supplierId) : null;
    const leadTimeDays = supplierMetric?.avgLeadTimeDays ?? CONFIG.DEFAULT_LEAD_TIME_DAYS;
    const supplierOnTimeRate = supplierMetric?.onTimeDeliveryRate ?? null;

    const stockoutDaysInWindow = (p.stockoutHistory || []).filter((d) => new Date(d) >= stockoutCutoff).length;

    const safetyStock = calcDynamicSafetyStock({ dailyDemand, demandStdDev, leadTimeDays, supplierOnTimeRate, stockoutDaysInWindow });
    const reorderPoint = calcReorderPoint({ dailyDemand, leadTimeDays, safetyStock });
    const daysRemaining = dailyDemand > 0 ? p.stockQuantity / dailyDemand : p.stockQuantity > 0 ? Infinity : 0;

    const categoryName = p.categories?.[0]?.name || p.category || 'Uncategorized';
    // Seasonal factors are configured by an admin against the real product, not a
    // specific variant — match on p.productId (the real product), not the unit key.
    const seasonalFactor = getActiveSeasonalFactor({ seasonalFactors, productId: String(p.productId), categoryName });

    const lastSoldDay = [...(productDaily?.keys() || [])].sort().pop();
    const daysSinceLastSale = lastSoldDay ? Math.floor((Date.now() - new Date(lastSoldDay).getTime()) / 86400000) : null;

    // Nearest active batch expiry, when this unit tracks batches — used to warn
    // against over-ordering when existing stock is about to expire anyway.
    const nearestBatch = (p.batches || [])
      .filter((b) => b.expiryDate && b.quantity > 0)
      .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate))[0] || null;
    const expiryWarning = nearestBatch
      ? {
          batchNumber: nearestBatch.batchNumber,
          daysUntilExpiry: Math.ceil((new Date(nearestBatch.expiryDate).getTime() - Date.now()) / 86400000),
        }
      : null;

    return {
      productId: id,
      // The real Product._id, distinct from `productId` above (which is the per-unit
      // key) — needed for calls that look up supplier purchase-price history, which is
      // recorded against the real product, not a specific variant.
      realProductId: String(p.productId),
      variantId: p.variantId ? String(p.variantId) : null,
      branchId: String(brId),
      name: p.name,
      barcode: p.barcode || null,
      sku: p.sku || null,
      categoryName,
      stock: p.stockQuantity,
      cost: p.cost,
      price: p.price,
      supplierId,
      createdAt: p.createdAt,
      incomingPOQty: incomingPOMap.get(id) || 0,
      qty7,
      qty30,
      qty90,
      dailyDemand,
      demandStdDev,
      trend,
      leadTimeDays: round2(leadTimeDays),
      supplierOnTimeRate,
      stockoutDaysInWindow,
      safetyStock,
      reorderPoint,
      daysRemaining,
      seasonalFactor: seasonalFactor ? { name: seasonalFactor.name, multiplier: seasonalFactor.multiplier } : null,
      daysSinceLastSale,
      expiryWarning,
    };
  });
};

/**
 * computeBranchProductMetrics is the single most expensive call in this file (it runs
 * sales/PO aggregations across every product in a branch). The dashboard page fires up to
 * 5 independent requests on load (suggestions, stockouts, demand trends, dead stock,
 * transfers) that each need this same branch's metrics — without caching, that's 5x the
 * Mongo aggregation work for data that hasn't changed in the last few seconds.
 *
 * This is a short-TTL, single-flight cache: concurrent callers for the same org+branch
 * share one in-flight computation, and the result stays warm for METRICS_CACHE_TTL_MS so
 * a burst of page-load requests only computes once.
 */
const METRICS_CACHE_TTL_MS = 20 * 1000;
const metricsCache = new Map(); // `${organizationId}:${branchId}` -> { promise, expiresAt }

const computeBranchProductMetricsCached = ({ organizationId, branchId }) => {
  const key = `${organizationId}:${branchId}`;
  const cached = metricsCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise;
  }
  const promise = computeBranchProductMetrics({ organizationId, branchId }).catch((err) => {
    metricsCache.delete(key);
    throw err;
  });
  metricsCache.set(key, { promise, expiresAt: Date.now() + METRICS_CACHE_TTL_MS });
  return promise;
};

/** Drops cached metrics for a branch so the next read recomputes — call after anything that changes the underlying data (manual refresh, stock-affecting writes). */
const invalidateBranchMetricsCache = ({ organizationId, branchId = null }) => {
  for (const key of metricsCache.keys()) {
    if (branchId ? key === `${organizationId}:${branchId}` : key.startsWith(`${organizationId}:`)) {
      metricsCache.delete(key);
    }
  }
};

/* ────────────────────────────────────────────────────────────────────────
 * MULTI-BRANCH: transfer suggestions before any purchase suggestion.
 * Products are branch-scoped documents (no shared catalog id), so the same
 * physical item is matched across branches by barcode, falling back to an
 * exact case-insensitive name match within the organization.
 * ──────────────────────────────────────────────────────────────────────── */

const matchKeyFor = (p) => (p.barcode ? `barcode:${p.barcode}` : `name:${p.name.trim().toLowerCase()}`);

/**
 * Computes transfer suggestions across every active branch in the org, and returns
 * them alongside a Map<productId, qtyCoveredByTransferIn> so purchase-suggestion
 * math can subtract whatever a transfer already covers.
 */
const buildTransferSuggestions = (allBranchMetrics) => {
  const byKey = new Map();
  for (const metrics of allBranchMetrics) {
    for (const p of metrics) {
      if (!byKey.has(matchKeyFor(p))) byKey.set(matchKeyFor(p), []);
      byKey.get(matchKeyFor(p)).push(p);
    }
  }

  const transfers = [];
  const coveredQtyByProductId = new Map();

  for (const candidates of byKey.values()) {
    if (candidates.length < 2) continue; // only one branch carries this product — nothing to transfer

    const deficits = candidates.filter((p) => p.dailyDemand > 0 && p.stock <= p.reorderPoint);
    if (deficits.length === 0) continue;

    for (const deficit of deficits) {
      const need = Math.max(0, Math.ceil(deficit.reorderPoint - deficit.stock));
      if (need < CONFIG.MIN_TRANSFER_QTY) continue;

      const surplusCandidates = candidates
        .filter((p) => p.branchId !== deficit.branchId)
        .map((p) => {
          const selfCoverNeed = p.dailyDemand * CONFIG.MIN_BRANCH_SELF_COVER_DAYS + p.safetyStock;
          const transferable = Math.floor(p.stock - selfCoverNeed);
          return { ...p, transferable };
        })
        .filter((p) => p.transferable >= CONFIG.MIN_TRANSFER_QTY)
        .sort((a, b) => b.transferable - a.transferable);

      if (surplusCandidates.length === 0) continue;

      const source = surplusCandidates[0];
      const qty = Math.min(need, source.transferable);

      transfers.push({
        productName: deficit.name,
        fromBranchId: source.branchId,
        fromProductId: source.productId,
        toBranchId: deficit.branchId,
        toProductId: deficit.productId,
        quantity: qty,
        reason: `${source.name} has ${source.stock} unit(s) in stock and can spare ${source.transferable}; the receiving branch has ${deficit.stock} and needs ${need} to clear its reorder point.`,
      });

      coveredQtyByProductId.set(deficit.productId, (coveredQtyByProductId.get(deficit.productId) || 0) + qty);
    }
  }

  return { transfers, coveredQtyByProductId };
};

/* ────────────────────────────────────────────────────────────────────────
 * ORCHESTRATORS — public API surface used by controllers/jobs.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Computes purchase suggestions for one branch, accounting for org-wide transfer
 * coverage. NOTE on scale: this recomputes every branch in the org on each call
 * to check for transferable surplus. For orgs with many branches/products, the
 * daily job (jobs/purchaseSuggestionsScheduler.js) should be the source of truth
 * read by the dashboard, with this function reserved for an on-demand "recalculate now".
 */
const getPurchaseSuggestions = async ({ organizationId, branchId, horizonDays = CONFIG.DEFAULT_HORIZON_DAYS }) => {
  const orgId = toObjectId(organizationId);
  const activeBranches = await Branch.find({ organizationId: orgId, isActive: true }).select('_id').lean();

  // The requesting branch must always be included even if it isn't flagged isActive
  // (e.g. legacy branch docs saved before that field existed) — otherwise this whole
  // function silently returns nothing for that branch while still loading every
  // other active branch just to compute transfers.
  const branchIds = [...new Set([...activeBranches.map((b) => String(b._id)), String(branchId)])];

  const allBranchMetrics = await Promise.all(
    branchIds.map((id) => computeBranchProductMetricsCached({ organizationId: orgId, branchId: id })),
  );
  const { transfers, coveredQtyByProductId } = buildTransferSuggestions(allBranchMetrics);

  const targetMetrics = allBranchMetrics[branchIds.indexOf(String(branchId))] || [];

  // Pass 1 (cheap, synchronous): work out which products actually qualify and by how much.
  const candidates = [];
  for (const p of targetMetrics) {
    if (p.dailyDemand <= 0) continue;
    if (!hasEnoughDemandSignal(p)) continue;

    const coveredByTransfer = coveredQtyByProductId.get(p.productId) || 0;
    const effectiveStock = p.stock + coveredByTransfer;
    const seasonalMultiplier = p.seasonalFactor?.multiplier || 1;

    const suggestedOrderQty = calcSuggestedOrderQuantity({
      currentStock: effectiveStock,
      incomingPOQty: p.incomingPOQty,
      dailyDemand: p.dailyDemand,
      safetyStock: p.safetyStock,
      horizonDays,
      seasonalMultiplier,
    });
    if (suggestedOrderQty <= 0) continue;

    candidates.push({ p, coveredByTransfer, suggestedOrderQty });
  }

  // Pass 2 (I/O, parallel): supplier scoring is independent per product, so fan it out
  // instead of awaiting one at a time — matters once a catalog has 50+ qualifying products.
  const rankedSuppliers = await Promise.all(
    candidates.map((c) => supplierScoringService.scoreSuppliersForProduct({ organizationId: orgId, productId: c.p.realProductId })),
  );

  const suggestions = candidates.map(({ p, coveredByTransfer, suggestedOrderQty }, i) => {
    const ranked = rankedSuppliers[i];
    const recommendedSupplier = ranked.length > 0 ? ranked[0] : null;
    const supplierReason = recommendedSupplier ? supplierScoringService.buildSupplierRecommendationReason(recommendedSupplier) : null;

    return {
      productId: p.productId,
      // Real Product._id, distinct from `productId` above when this row is a
      // specific variant — needed by the client to add the right product to a
      // purchase invoice/order and then select the matching variant on it.
      realProductId: p.realProductId,
      variantId: p.variantId,
      name: p.name,
      categoryName: p.categoryName,
      currentStock: p.stock,
      incomingPOQty: p.incomingPOQty,
      coveredByTransfer,
      horizonDays,
      dailyDemand: round2(p.dailyDemand),
      leadTimeDays: p.leadTimeDays,
      safetyStock: p.safetyStock,
      reorderPoint: Math.ceil(p.reorderPoint),
      suggestedOrderQty,
      daysRemaining: Number.isFinite(p.daysRemaining) ? Math.round(p.daysRemaining) : null,
      trend: p.trend,
      seasonalFactor: p.seasonalFactor,
      recommendedSupplier,
      expiryWarning: p.expiryWarning,
      reason: [
        `Based on ~${round2(p.dailyDemand)} units/day demand and a ${p.leadTimeDays}-day lead time, order ${suggestedOrderQty} unit(s) to stay covered for the next ${horizonDays} days.`,
        coveredByTransfer > 0 ? `${coveredByTransfer} unit(s) of the need are already covered by an incoming branch transfer.` : null,
        supplierReason,
        p.expiryWarning ? `Heads up: existing batch ${p.expiryWarning.batchNumber} expires in ${p.expiryWarning.daysUntilExpiry} day(s) — consider a smaller order.` : null,
      ]
        .filter(Boolean)
        .join(' '),
    };
  });

  // Most urgent first: fewest days of stock cover remaining.
  suggestions.sort((a, b) => a.currentStock / Math.max(a.dailyDemand, 0.01) - b.currentStock / Math.max(b.dailyDemand, 0.01));

  return {
    branchId: String(branchId),
    horizonDays,
    suggestions,
    relevantTransfers: transfers.filter((t) => String(t.toBranchId) === String(branchId)),
  };
};

/** Org-wide transfer suggestions (independent of a single branch's perspective). */
const getTransferSuggestions = async ({ organizationId }) => {
  const orgId = toObjectId(organizationId);
  const branches = await Branch.find({ organizationId: orgId, isActive: true }).select('_id').lean();
  const allBranchMetrics = await Promise.all(
    branches.map((b) => computeBranchProductMetricsCached({ organizationId: orgId, branchId: b._id })),
  );
  const { transfers } = buildTransferSuggestions(allBranchMetrics);
  return transfers;
};

const getStockoutPredictions = async ({ organizationId, branchId }) => {
  const metrics = await computeBranchProductMetricsCached({ organizationId, branchId });
  return metrics
    .filter((p) => p.dailyDemand > 0 && p.daysRemaining <= CONFIG.STOCK_OUT_RISK_DAYS && hasEnoughDemandSignal(p))
    .map((p) => ({
      productId: p.productId,
      name: p.name,
      stock: p.stock,
      dailyDemand: round2(p.dailyDemand),
      daysRemaining: Number.isFinite(p.daysRemaining) ? Math.round(p.daysRemaining) : null,
      reason:
        p.daysRemaining <= 0
          ? `${p.name} is already out of stock.`
          : `Current inventory will likely be exhausted within ${Math.round(p.daysRemaining)} day(s).`,
    }))
    .sort((a, b) => (a.daysRemaining ?? 0) - (b.daysRemaining ?? 0));
};

const getDemandTrends = async ({ organizationId, branchId }) => {
  const metrics = await computeBranchProductMetricsCached({ organizationId, branchId });
  return metrics
    .filter((p) => p.trend.label !== 'stable')
    .map((p) => ({
      productId: p.productId,
      name: p.name,
      ...p.trend,
      reason: `${p.name} demand ${p.trend.label === 'rising' ? 'increased' : 'decreased'} ${Math.abs(p.trend.growthPercent)}% over the last ${CONFIG.DEMAND_WINDOW_SHORT_DAYS} days.`,
    }))
    .sort((a, b) => Math.abs(b.growthPercent) - Math.abs(a.growthPercent));
};

const getDeadStock = async ({ organizationId, branchId }) => {
  const metrics = await computeBranchProductMetricsCached({ organizationId, branchId });
  const deadStockCutoff = daysAgo(CONFIG.DEAD_STOCK_WINDOW_DAYS);

  return metrics
    .filter((p) => {
      const neverSoldRecently = p.daysSinceLastSale === null || p.daysSinceLastSale >= CONFIG.DEAD_STOCK_WINDOW_DAYS;
      const oldEnoughToJudge = !p.createdAt || new Date(p.createdAt) < deadStockCutoff;
      return p.stock > 0 && neverSoldRecently && oldEnoughToJudge;
    })
    .map((p) => {
      const stockValue = p.stock * p.cost;
      const { action, reason } = classifyDeadStockAction({
        daysSinceLastSale: p.daysSinceLastSale ?? CONFIG.DEAD_STOCK_WINDOW_DAYS,
        stockValue,
        unitValue: p.cost,
      });
      return {
        productId: p.productId,
        name: p.name,
        stock: p.stock,
        stockValue: round2(stockValue),
        daysSinceLastSale: p.daysSinceLastSale,
        recommendedAction: action,
        reason,
      };
    })
    .sort((a, b) => b.stockValue - a.stockValue);
};

/* ────────────────────────────────────────────────────────────────────────
 * INSIGHT PERSISTENCE — turns the above into dashboard-ready Insight docs.
 * Reuses the existing Insight collection/TTL pattern from salesInsights.service.js.
 * ──────────────────────────────────────────────────────────────────────── */

const buildInsightDocs = async ({ organizationId, branchId }) => {
  const [{ suggestions }, trends, deadStock] = await Promise.all([
    getPurchaseSuggestions({ organizationId, branchId }),
    getDemandTrends({ organizationId, branchId }),
    getDeadStock({ organizationId, branchId }),
  ]);

  const docs = [];

  for (const s of suggestions) {
    docs.push({
      type: 'reorder_suggestion',
      category: 'inventory',
      priority: s.reorderPoint > 0 && s.currentStock <= s.reorderPoint * 0.5 ? 'high' : 'medium',
      confidence: s.dailyDemand > 0 ? 'high' : 'low',
      title: `Purchase ${s.suggestedOrderQty} unit(s) of ${s.name}`,
      description: s.reason,
      // The Insights UI (client/src/features/insights) was built against the older
      // salesInsights.service.js field names for this same insight type — keep those
      // aliases so it keeps working, while still exposing the richer field names too.
      meta: { ...s, stock: s.currentStock, suggestedReorderQty: s.suggestedOrderQty, dailySalesRate: s.dailyDemand },
    });
    if (s.recommendedSupplier) {
      docs.push({
        type: 'supplier_recommendation',
        category: 'supply_chain',
        priority: 'low',
        confidence: s.recommendedSupplier.ordersCount >= 3 ? 'high' : 'medium',
        title: `${s.recommendedSupplier.supplierName} recommended for ${s.name}`,
        description: supplierScoringService.buildSupplierRecommendationReason(s.recommendedSupplier),
        meta: { productId: s.productId, supplier: s.recommendedSupplier },
      });
    }
  }

  for (const t of trends) {
    docs.push({
      type: 'demand_trend',
      category: 'supply_chain',
      priority: t.label === 'rising' ? 'low' : 'medium',
      confidence: 'medium',
      title: `${t.name} demand is ${t.label}`,
      description: t.reason,
      meta: t,
    });
  }

  if (deadStock.length > 0) {
    const tiedUp = deadStock.reduce((s, d) => s + d.stockValue, 0);
    // The Insights UI computes "tied up" as stock * cost per product (older field shape) —
    // back-fill a `cost` so that still renders correctly instead of NaN/Rs0.
    const deadStockWithCost = deadStock.map((d) => ({ ...d, cost: d.stock > 0 ? round2(d.stockValue / d.stock) : 0 }));
    docs.push({
      type: 'dead_stock',
      category: 'inventory',
      priority: tiedUp > CONFIG.DEAD_STOCK_HIGH_VALUE_THRESHOLD ? 'high' : 'medium',
      confidence: 'high',
      title: `${deadStock.length} product(s) are dead stock`,
      description: `These products are tying up about Rs${round2(tiedUp)} in unsold stock.`,
      meta: { products: deadStockWithCost.slice(0, 10), tiedUpCapital: round2(tiedUp) },
    });
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + CONFIG.INSIGHT_TTL_HOURS * 60 * 60 * 1000);
  return docs.map((d) => ({ ...d, organizationId: toObjectId(organizationId), branchId: toObjectId(branchId), generatedAt: now, expiresAt }));
};

/** Recomputes and replaces the supply-chain Insight docs for one branch (daily job entry point). */
const runPurchaseSuggestionsForBranch = async ({ organizationId, branchId }) => {
  invalidateBranchMetricsCache({ organizationId, branchId });
  const docs = await buildInsightDocs({ organizationId, branchId });
  await Insight.deleteMany({
    organizationId: toObjectId(organizationId),
    branchId: toObjectId(branchId),
    type: { $in: ['reorder_suggestion', 'supplier_recommendation', 'demand_trend', 'dead_stock'] },
  });
  if (docs.length === 0) return [];
  return Insight.insertMany(docs);
};

/** Also persists transfer suggestions as InventoryTransfer docs (one org-wide pass, not per-branch). */
const runTransferSuggestionsForOrganization = async ({ organizationId }) => {
  const transfers = await getTransferSuggestions({ organizationId });
  await InventoryTransfer.deleteMany({ organizationId: toObjectId(organizationId), status: 'suggested' });
  if (transfers.length === 0) return [];
  return InventoryTransfer.insertMany(
    transfers.map((t) => ({ ...t, organizationId: toObjectId(organizationId), status: 'suggested', suggestedAt: new Date() })),
  );
};

/** Updates each product's stockoutHistory (called once daily, before computing suggestions). */
const recordStockoutSnapshots = async ({ organizationId, branchId }) => {
  const today = new Date(dayKey(new Date()));
  const zeroStockProducts = await Product.find({ organizationId: toObjectId(organizationId), branchId: toObjectId(branchId), stockQuantity: 0 }).select('_id stockoutHistory');

  const cutoff = daysAgo(CONFIG.STOCKOUT_TRACKING_WINDOW_DAYS);
  for (const product of zeroStockProducts) {
    const alreadyLoggedToday = (product.stockoutHistory || []).some((d) => dayKey(d) === dayKey(today));
    const pruned = (product.stockoutHistory || []).filter((d) => new Date(d) >= cutoff);
    if (!alreadyLoggedToday) pruned.push(today);
    await Product.updateOne({ _id: product._id }, { $set: { stockoutHistory: pruned } });
  }
  return { productsChecked: zeroStockProducts.length };
};

/* ────────────────────────────────────────────────────────────────────────
 * SEASONALITY SELF-TUNING — run monthly. Rather than trusting a multiplier an
 * admin guessed at once, this re-derives it from what actually happened last
 * time the season occurred: (sales rate during last year's window) vs (sales
 * rate the rest of the year). Falls back to leaving the manually-set multiplier
 * untouched when there isn't enough sales volume to trust the recalculation.
 * ──────────────────────────────────────────────────────────────────────── */
const MIN_QTY_FOR_SEASONAL_RECALC = 20; // need at least this many units sold in last year's window to trust the new multiplier

const recalculateSeasonalFactorMultiplier = async (factor) => {
  const now = new Date();
  const lastYear = now.getFullYear() - 1;
  const windowStart = new Date(Date.UTC(lastYear, factor.startMonth - 1, factor.startDay));
  let windowEnd = new Date(Date.UTC(lastYear, factor.endMonth - 1, factor.endDay, 23, 59, 59));
  if (windowEnd < windowStart) windowEnd = new Date(Date.UTC(lastYear + 1, factor.endMonth - 1, factor.endDay, 23, 59, 59));
  const windowDays = Math.max(1, Math.round((windowEnd - windowStart) / 86400000));

  const yearStart = new Date(Date.UTC(lastYear, 0, 1));
  const yearEnd = new Date(Date.UTC(lastYear, 11, 31, 23, 59, 59));

  const productMatch = {};
  if (factor.productIds?.length > 0) productMatch.productId = { $in: factor.productIds.map(toObjectId) };
  // categoryNames-scoped and global factors are intentionally left unfiltered here — matching by
  // category requires joining Product, which isn't worth the cost for a once-a-month, best-effort recalibration.

  const [windowAgg, fullYearAgg] = await Promise.all([
    Invoice.aggregate([
      { $match: { organizationId: factor.organizationId, invoiceDate: { $gte: windowStart, $lte: windowEnd }, ...SALES_MATCH_BASE } },
      { $unwind: '$items' },
      ...(productMatch.productId ? [{ $match: { 'items.productId': productMatch.productId } }] : []),
      { $group: { _id: null, qty: { $sum: '$items.quantity' } } },
    ]),
    Invoice.aggregate([
      { $match: { organizationId: factor.organizationId, invoiceDate: { $gte: yearStart, $lte: yearEnd }, ...SALES_MATCH_BASE } },
      { $unwind: '$items' },
      ...(productMatch.productId ? [{ $match: { 'items.productId': productMatch.productId } }] : []),
      { $group: { _id: null, qty: { $sum: '$items.quantity' } } },
    ]),
  ]);

  const windowQty = windowAgg[0]?.qty || 0;
  const fullYearQty = fullYearAgg[0]?.qty || 0;
  if (windowQty < MIN_QTY_FOR_SEASONAL_RECALC) return { updated: false, reason: 'insufficient sales history' };

  const baselineQty = Math.max(0, fullYearQty - windowQty);
  const baselineDays = Math.max(1, 365 - windowDays);
  const windowRate = windowQty / windowDays;
  const baselineRate = baselineQty / baselineDays;

  if (baselineRate <= 0) return { updated: false, reason: 'no baseline sales to compare against' };

  const newMultiplier = round2(windowRate / baselineRate);
  await SeasonalFactor.updateOne({ _id: factor._id }, { $set: { multiplier: newMultiplier } });
  return { updated: true, previousMultiplier: factor.multiplier, newMultiplier };
};

/** Entry point for the monthly cron — recalculates every active SeasonalFactor across all orgs. */
const runSeasonalityRecalculation = async () => {
  const factors = await SeasonalFactor.find({ isActive: true }).lean();
  const summary = { factorsChecked: factors.length, factorsUpdated: 0, errors: [] };
  for (const factor of factors) {
    try {
      const result = await recalculateSeasonalFactorMultiplier(factor);
      if (result.updated) summary.factorsUpdated += 1;
    } catch (error) {
      summary.errors.push({ seasonalFactorId: String(factor._id), message: error.message });
    }
  }
  return summary;
};

/** Entry point for the daily cron — iterates every active branch, isolating failures per branch. */
const runForAllBranches = async () => {
  const branches = await Branch.find({ isActive: true }).select('_id organizationId').lean();
  const summary = { branchesProcessed: 0, insightsGenerated: 0, errors: [] };
  for (const branch of branches) {
    try {
      await recordStockoutSnapshots({ organizationId: branch.organizationId, branchId: branch._id });
      const created = await runPurchaseSuggestionsForBranch({ organizationId: branch.organizationId, branchId: branch._id });
      summary.branchesProcessed += 1;
      summary.insightsGenerated += created.length;
    } catch (error) {
      summary.errors.push({ branchId: String(branch._id), message: error.message });
    }
  }

  const organizationIds = await Branch.distinct('organizationId', { isActive: true });
  for (const organizationId of organizationIds) {
    try {
      await runTransferSuggestionsForOrganization({ organizationId });
    } catch (error) {
      summary.errors.push({ organizationId: String(organizationId), message: error.message });
    }
  }

  return summary;
};

module.exports = {
  CONFIG,
  // orchestrators
  getPurchaseSuggestions,
  getTransferSuggestions,
  getStockoutPredictions,
  getDemandTrends,
  getDeadStock,
  runPurchaseSuggestionsForBranch,
  runTransferSuggestionsForOrganization,
  recordStockoutSnapshots,
  runForAllBranches,
  runSeasonalityRecalculation,
  // pure algorithms (exported for unit tests)
  calcStdDev,
  hasEnoughDemandSignal,
  calcBlendedDailyDemand,
  calcDynamicSafetyStock,
  calcReorderPoint,
  calcSuggestedOrderQuantity,
  calcDemandTrend,
  isWithinSeasonalWindow,
  getActiveSeasonalFactor,
  classifyDeadStockAction,
};
