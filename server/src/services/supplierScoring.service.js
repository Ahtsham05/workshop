const mongoose = require('mongoose');
const { Supplier, PurchaseOrder, Purchase, PurchaseReturn } = require('../models');

/**
 * Weights for the composite supplier score. Must sum to 1. Tunable without touching
 * the math below. Reliability (cancellations/returns) is weighted highest because a
 * cheap, fast supplier who cancels or sends bad stock causes more damage than either
 * price or speed alone would suggest.
 */
const SCORE_WEIGHTS = {
  price: 0.3,
  delivery: 0.4,
  reliability: 0.3,
};

/** Within the delivery score, on-time rate matters more than raw lead time speed. */
const DELIVERY_SUBWEIGHTS = {
  onTimeRate: 0.7,
  leadTimeSpeed: 0.3,
};

const PERFORMANCE_LOOKBACK_DAYS = 365; // a year of order history is enough signal without over-weighting ancient suppliers

const toObjectId = (id) => (mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(String(id)) : id);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const daysAgo = (n, from = new Date()) => new Date(from.getTime() - n * 24 * 60 * 60 * 1000);
const msToDays = (ms) => ms / (24 * 60 * 60 * 1000);

/**
 * Raw performance metrics for one supplier, computed straight from PurchaseOrder/PurchaseReturn
 * history — no stored/cached numbers, no fixed assumptions. Returns nulls where there isn't
 * enough history yet (caller decides how to treat that, e.g. "medium confidence" fallback).
 */
const computeSupplierMetrics = async ({ organizationId, supplierId, since = daysAgo(PERFORMANCE_LOOKBACK_DAYS) }) => {
  const orgId = toObjectId(organizationId);
  const supId = toObjectId(supplierId);

  const orders = await PurchaseOrder.find({
    organizationId: orgId,
    supplier: supId,
    orderDate: { $gte: since },
  })
    .select('status orderDate expectedDeliveryDate receipts')
    .lean();

  const totalOrders = orders.length;
  const cancelledOrders = orders.filter((o) => o.status === 'cancelled').length;
  const cancellationRate = totalOrders > 0 ? cancelledOrders / totalOrders : null;

  // Lead time + on-time rate: only orders that actually received stock carry a real lead time.
  const leadTimesDays = [];
  let ordersWithDeadline = 0;
  let onTimeCount = 0;

  for (const order of orders) {
    const firstReceipt = (order.receipts || [])[0];
    if (!firstReceipt) continue;

    leadTimesDays.push(msToDays(new Date(firstReceipt.receivedAt) - new Date(order.orderDate)));

    if (order.expectedDeliveryDate) {
      ordersWithDeadline += 1;
      if (new Date(firstReceipt.receivedAt) <= new Date(order.expectedDeliveryDate)) onTimeCount += 1;
    }
  }

  const avgLeadTimeDays = leadTimesDays.length > 0 ? leadTimesDays.reduce((s, d) => s + d, 0) / leadTimesDays.length : null;
  const onTimeDeliveryRate = ordersWithDeadline > 0 ? onTimeCount / ordersWithDeadline : null;

  // Return rate: quantity returned vs quantity purchased from this supplier in the same window.
  const [purchasedAgg] = await Purchase.aggregate([
    { $match: { organizationId: orgId, supplier: supId, purchaseDate: { $gte: since } } },
    { $unwind: '$items' },
    { $group: { _id: null, qty: { $sum: '$items.quantity' } } },
  ]);
  const [returnedAgg] = await PurchaseReturn.aggregate([
    { $match: { organizationId: orgId, supplierId: supId, date: { $gte: since } } },
    { $unwind: '$items' },
    { $group: { _id: null, qty: { $sum: '$items.quantity' } } },
  ]);
  const purchasedQty = purchasedAgg?.qty || 0;
  const returnedQty = returnedAgg?.qty || 0;
  const returnRate = purchasedQty > 0 ? returnedQty / purchasedQty : null;

  return {
    supplierId: String(supplierId),
    ordersCount: totalOrders,
    avgLeadTimeDays,
    onTimeDeliveryRate,
    cancellationRate,
    returnRate,
    purchasedQty,
    returnedQty,
  };
};

/** Average price paid per supplier for a specific product, from actual receiving records. */
const computeSupplierPricesForProduct = async ({ organizationId, productId, since = daysAgo(PERFORMANCE_LOOKBACK_DAYS) }) => {
  const orgId = toObjectId(organizationId);
  const prodId = toObjectId(productId);

  const rows = await Purchase.aggregate([
    { $match: { organizationId: orgId, purchaseDate: { $gte: since } } },
    { $unwind: '$items' },
    { $match: { 'items.product': prodId } },
    {
      $group: {
        _id: '$supplier',
        avgPrice: { $avg: '$items.priceAtPurchase' },
        samples: { $sum: 1 },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), { avgPrice: r.avgPrice, samples: r.samples }]));
};

/** Min-max normalize a value within [min, max] to a 0-100 score. Inverted when lower-is-better. */
const normalizeScore = (value, min, max, { invert = false } = {}) => {
  if (value === null || value === undefined) return 50; // no data — neutral score rather than punishing/rewarding
  if (max === min) return 100; // every candidate is identical — no basis to differentiate
  const pct = ((value - min) / (max - min)) * 100;
  const clamped = Math.max(0, Math.min(100, pct));
  return invert ? 100 - clamped : clamped;
};

const round = (n) => Math.round(n * 100) / 100;

/**
 * Scores every supplier who has ever supplied `productId` (falling back to every
 * supplier in the org if none have purchase history for it yet — e.g. a brand-new
 * product) and returns them ranked best-first with a human-readable reason.
 */
const scoreSuppliersForProduct = async ({ organizationId, productId }) => {
  const orgId = toObjectId(organizationId);
  const priceMap = await computeSupplierPricesForProduct({ organizationId, productId });

  let candidateSupplierIds = [...priceMap.keys()];
  if (candidateSupplierIds.length === 0) {
    const allSuppliers = await Supplier.find({ organizationId: orgId }).select('_id').lean();
    candidateSupplierIds = allSuppliers.map((s) => String(s._id));
  }
  if (candidateSupplierIds.length === 0) return [];

  const suppliers = await Supplier.find({ _id: { $in: candidateSupplierIds } })
    .select('name')
    .lean();

  const metrics = await Promise.all(
    candidateSupplierIds.map((supplierId) => computeSupplierMetrics({ organizationId, supplierId })),
  );
  const metricsBySupplier = new Map(metrics.map((m) => [m.supplierId, m]));

  const prices = candidateSupplierIds.map((id) => priceMap.get(id)?.avgPrice).filter((p) => p !== undefined);
  const minPrice = prices.length ? Math.min(...prices) : null;
  const maxPrice = prices.length ? Math.max(...prices) : null;

  const leadTimes = metrics.map((m) => m.avgLeadTimeDays).filter((d) => d !== null);
  const minLeadTime = leadTimes.length ? Math.min(...leadTimes) : null;
  const maxLeadTime = leadTimes.length ? Math.max(...leadTimes) : null;

  const scored = candidateSupplierIds.map((supplierId) => {
    const supplierDoc = suppliers.find((s) => String(s._id) === supplierId);
    const m = metricsBySupplier.get(supplierId);
    const priceInfo = priceMap.get(supplierId);

    const priceScore =
      priceInfo && minPrice !== null ? normalizeScore(priceInfo.avgPrice, minPrice, maxPrice, { invert: true }) : 50;

    const onTimeScore = m.onTimeDeliveryRate !== null ? m.onTimeDeliveryRate * 100 : 50;
    const leadTimeScore =
      m.avgLeadTimeDays !== null && minLeadTime !== null
        ? normalizeScore(m.avgLeadTimeDays, minLeadTime, maxLeadTime, { invert: true })
        : 50;
    const deliveryScore = onTimeScore * DELIVERY_SUBWEIGHTS.onTimeRate + leadTimeScore * DELIVERY_SUBWEIGHTS.leadTimeSpeed;

    const cancellationComponent = m.cancellationRate !== null ? (1 - m.cancellationRate) * 100 : 50;
    const returnComponent = m.returnRate !== null ? (1 - m.returnRate) * 100 : 50;
    const reliabilityScore = cancellationComponent * 0.5 + returnComponent * 0.5;

    const overallScore =
      priceScore * SCORE_WEIGHTS.price + deliveryScore * SCORE_WEIGHTS.delivery + reliabilityScore * SCORE_WEIGHTS.reliability;

    return {
      supplierId,
      supplierName: supplierDoc?.name || 'Unknown supplier',
      avgPrice: priceInfo ? round(priceInfo.avgPrice) : null,
      avgLeadTimeDays: m.avgLeadTimeDays !== null ? round(m.avgLeadTimeDays) : null,
      onTimeDeliveryRate: m.onTimeDeliveryRate !== null ? round(m.onTimeDeliveryRate * 100) : null,
      cancellationRate: m.cancellationRate !== null ? round(m.cancellationRate * 100) : null,
      returnRate: m.returnRate !== null ? round(m.returnRate * 100) : null,
      ordersCount: m.ordersCount,
      priceScore: round(priceScore),
      deliveryScore: round(deliveryScore),
      reliabilityScore: round(reliabilityScore),
      overallScore: round(overallScore),
    };
  });

  scored.sort((a, b) => b.overallScore - a.overallScore);
  return scored;
};

/** Builds the human-readable "why this supplier" sentence for the top-ranked candidate. */
const buildSupplierRecommendationReason = (best) => {
  if (!best) return null;
  const parts = [];
  if (best.onTimeDeliveryRate !== null) parts.push(`a ${round2(best.onTimeDeliveryRate)}% on-time delivery rate`);
  if (best.avgLeadTimeDays !== null) parts.push(`an average lead time of ${round2(best.avgLeadTimeDays)} day(s)`);
  if (best.avgPrice !== null) parts.push(`competitive pricing (avg Rs${round2(best.avgPrice)}/unit)`);
  if (best.returnRate !== null && best.returnRate > 0) parts.push(`a ${round2(best.returnRate)}% return rate`);
  if (parts.length === 0) return `${best.supplierName} is recommended based on limited available history.`;
  return `${best.supplierName} is recommended due to ${parts.join(' and ')}.`;
};

/**
 * Recomputes and caches org-wide (not product-specific) performance metrics onto
 * every Supplier document. Used by the weekly supplier-scoring job; product-specific
 * scoring (scoreSuppliersForProduct) always runs live since price comparisons are
 * inherently per-product.
 */
const refreshSupplierPerformanceCache = async ({ organizationId }) => {
  const orgId = toObjectId(organizationId);
  const suppliers = await Supplier.find({ organizationId: orgId }).select('_id').lean();

  let updated = 0;
  for (const supplier of suppliers) {
    const m = await computeSupplierMetrics({ organizationId: orgId, supplierId: supplier._id });

    const onTimeScore = m.onTimeDeliveryRate !== null ? m.onTimeDeliveryRate * 100 : 50;
    const cancellationComponent = m.cancellationRate !== null ? (1 - m.cancellationRate) * 100 : 50;
    const returnComponent = m.returnRate !== null ? (1 - m.returnRate) * 100 : 50;
    const reliabilityScore = cancellationComponent * 0.5 + returnComponent * 0.5;
    // Cached score skips the price component (it's per-product) — reliability + delivery only.
    const overallScore = onTimeScore * SCORE_WEIGHTS.delivery + reliabilityScore * SCORE_WEIGHTS.reliability;
    const normalizedOverall = overallScore / (SCORE_WEIGHTS.delivery + SCORE_WEIGHTS.reliability);

    await Supplier.updateOne(
      { _id: supplier._id },
      {
        $set: {
          'performance.avgLeadTimeDays': m.avgLeadTimeDays !== null ? round(m.avgLeadTimeDays) : null,
          'performance.onTimeDeliveryRate': m.onTimeDeliveryRate,
          'performance.cancellationRate': m.cancellationRate,
          'performance.returnRate': m.returnRate,
          'performance.ordersCount': m.ordersCount,
          'performance.overallScore': round(normalizedOverall),
          'performance.lastScoredAt': new Date(),
        },
      },
    );
    updated += 1;
  }
  return { suppliersScored: updated };
};

/** Entry point for the weekly cron — iterates every organization that has at least one supplier. */
const refreshSupplierPerformanceForAllOrganizations = async () => {
  const organizationIds = await Supplier.distinct('organizationId');
  const summary = { organizationsProcessed: 0, suppliersScored: 0, errors: [] };
  for (const organizationId of organizationIds) {
    try {
      const result = await refreshSupplierPerformanceCache({ organizationId });
      summary.organizationsProcessed += 1;
      summary.suppliersScored += result.suppliersScored;
    } catch (error) {
      summary.errors.push({ organizationId: String(organizationId), message: error.message });
    }
  }
  return summary;
};

module.exports = {
  SCORE_WEIGHTS,
  computeSupplierMetrics,
  computeSupplierPricesForProduct,
  scoreSuppliersForProduct,
  buildSupplierRecommendationReason,
  refreshSupplierPerformanceCache,
  refreshSupplierPerformanceForAllOrganizations,
};
