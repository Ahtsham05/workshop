const { ProductionOrder } = require('../../models');
const wip = require('./wip');
const { roundQty, roundMoney, scopeFilter, escapeRegex, parseDateRange } = require('./common');

/**
 * Material usage — where every issued unit went. For each production order (and summed
 * per material across orders):
 *
 *   issued    − returned − used in output − wastage = still in the factory (WIP)
 *
 * all in the material line's own units (an alternative issued at ratio r counts as qty ÷ r).
 *   used in output — backflushed when output was reported (good + rejected units)
 *   wastage        — material scrapped from WIP (process loss, damage, unused at completion)
 *   standard       — what the BOM allows for the GOOD output received so far
 *   variance       — (used + wastage) − standard: material that did not end up in good stock
 *
 * Values: issued / used at their actual cost; WIP at its lots' cost; returned and wastage
 * at the line's average issue cost.
 */

const MAX_ORDERS = 300;
const STATUS_SETS = {
  open: ['released', 'in_production', 'paused', 'qc_pending'],
  completed: ['completed'],
};

const lineUsage = (order, m) => {
  const issued = roundQty(m.issuedQuantity || 0);
  const returned = roundQty(m.returnedQuantity || 0);
  const wastage = roundQty(m.scrappedQuantity || 0);
  const legacy = wip.predatesWip(order);
  const used = legacy ? Math.max(0, roundQty(issued - returned - wastage)) : roundQty(m.consumedQuantity || 0);
  const inFactory = wip.lineWip(order, m);
  const avgCost = issued > 0 ? (m.issuedCost || 0) / issued : 0;
  const lots = (order.wipLots || []).filter((l) => String(l.materialLineId) === String(m._id) && l.quantity > wip.EPS);
  const goodShare = order.plannedQuantity > 0 ? Math.min(1, (order.completedQuantity || 0) / order.plannedQuantity) : 0;
  const standard = roundQty((m.requiredQuantity || 0) * goodShare);
  return {
    materialLineId: String(m._id),
    productId: String(m.productId),
    variantId: m.variantId ? String(m.variantId) : null,
    productName: m.productName,
    sku: m.sku || '',
    unit: m.unit,
    isOptional: !!m.isOptional,
    required: roundQty(m.requiredQuantity || 0),
    issued,
    returned,
    used,
    wastage,
    inFactory,
    toIssue: wip.lineRemaining(m),
    standard,
    variance: roundQty(used + wastage - standard),
    issuedValue: roundMoney(m.issuedCost || 0),
    usedValue: roundMoney(legacy ? used * avgCost : m.consumedCost || 0),
    returnedValue: roundMoney(returned * avgCost),
    wastageValue: roundMoney(wastage * avgCost),
    inFactoryValue: roundMoney(lots.reduce((s, l) => s + l.quantity * (l.unitCost || 0), 0)),
  };
};

const SUM_KEYS = ['required', 'issued', 'returned', 'used', 'wastage', 'inFactory', 'toIssue', 'standard', 'variance'];
const VALUE_KEYS = ['issuedValue', 'usedValue', 'returnedValue', 'wastageValue', 'inFactoryValue'];

const getMaterialUsage = async (ctx, { status, dateFrom, dateTo, search, productionOrderId } = {}) => {
  const query = {
    ...scopeFilter(ctx),
    'materials.issuedQuantity': { $gt: 0 },
    ...parseDateRange(dateFrom, dateTo, 'createdAt'),
  };
  if (STATUS_SETS[status]) query.status = { $in: STATUS_SETS[status] };
  if (productionOrderId) query._id = productionOrderId;
  if (search && String(search).trim()) {
    const rx = new RegExp(escapeRegex(String(search).trim()), 'i');
    query.$or = [{ orderNumber: rx }, { productName: rx }, { 'materials.productName': rx }];
  }
  const orders = await ProductionOrder.find(query)
    .select(
      'orderNumber orderType status productId productName unit plannedQuantity producedQuantity completedQuantity rejectedQuantity materials wipLots createdAt actualStartDate actualCompletionDate'
    )
    .sort({ createdAt: -1 })
    .limit(MAX_ORDERS + 1)
    .lean();
  const truncated = orders.length > MAX_ORDERS;
  const shown = orders.slice(0, MAX_ORDERS);

  const byMaterial = new Map();
  const totals = Object.fromEntries([...VALUE_KEYS].map((k) => [k, 0]));
  const orderRows = shown.map((order) => {
    const lines = order.materials.filter((m) => (m.issuedQuantity || 0) > 0).map((m) => lineUsage(order, m));
    const sums = Object.fromEntries(VALUE_KEYS.map((k) => [k, roundMoney(lines.reduce((s, l) => s + l[k], 0))]));
    VALUE_KEYS.forEach((k) => {
      totals[k] = roundMoney(totals[k] + sums[k]);
    });
    lines.forEach((l) => {
      const key = `${l.productId}:${l.variantId || ''}:${l.unit}`;
      const agg = byMaterial.get(key) || {
        productId: l.productId,
        variantId: l.variantId,
        productName: l.productName,
        sku: l.sku,
        unit: l.unit,
        orderCount: 0,
        ...Object.fromEntries([...SUM_KEYS, ...VALUE_KEYS].map((k) => [k, 0])),
      };
      agg.orderCount += 1;
      SUM_KEYS.forEach((k) => {
        agg[k] = roundQty(agg[k] + l[k]);
      });
      VALUE_KEYS.forEach((k) => {
        agg[k] = roundMoney(agg[k] + l[k]);
      });
      byMaterial.set(key, agg);
    });
    return {
      id: String(order._id),
      orderNumber: order.orderNumber,
      orderType: order.orderType,
      status: order.status,
      productName: order.productName,
      unit: order.unit,
      plannedQuantity: order.plannedQuantity,
      producedQuantity: order.producedQuantity || 0,
      goodQuantity: order.completedQuantity || 0,
      rejectedQuantity: order.rejectedQuantity || 0,
      createdAt: order.createdAt,
      ...sums,
      lines,
    };
  });

  return {
    totals: {
      ...totals,
      orderCount: orderRows.length,
      // Share of the issued value that is accounted for (used, returned or wasted).
      wastagePercent: totals.issuedValue > 0 ? roundQty((totals.wastageValue / totals.issuedValue) * 100) : 0,
    },
    materials: [...byMaterial.values()].sort((a, b) => b.issuedValue - a.issuedValue),
    orders: orderRows,
    truncated,
  };
};

module.exports = { getMaterialUsage, lineUsage };
