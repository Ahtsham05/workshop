const mongoose = require('mongoose');
const httpStatus = require('http-status');
const {
  Product,
  ProductVariant,
  Inventory,
  Batch,
  Customer,
  Supplier,
  Invoice,
  SalesReturn,
  Purchase,
  PurchaseReturn,
  StockAdjustment,
  InventoryTransfer,
  ProductionOrder,
  ProductionOutput,
  ProductionReceipt,
  MaterialIssue,
  ScrapRecord,
  PackingVoucher,
  FloorStockVoucher,
} = require('../../models');
const ApiError = require('../../utils/ApiError');
const {
  BUSINESS_TZ,
  toBusinessCalendarDate,
  startOfBusinessDay,
  endOfBusinessDay,
  eachBusinessCalendarDate,
} = require('../../utils/businessTimezone');
const { shiftCalendarDate } = require('../../utils/dashboardDateRange');
const { OPEN_PRODUCTION_STATUSES } = require('../../config/manufacturing');
const { SOLD_INVOICE_MATCH } = require('../productAnalytics.service');
const wip = require('./wip');
const { lineUsage } = require('./materialUsage.service');
const { roundQty, roundMoney, aggregateScope, escapeRegex } = require('./common');
const { batchStockReport, batchTraceReport } = require('./batchReports.service');
const { productProductionReport } = require('./productProductionReport.service');
const { stockSheetReport } = require('./stockSheetReport.service');

/*
 * Manufacturing reports — read-only statements built from the documents the module (and
 * the rest of the app) already writes. Every period is a pair of business calendar days
 * (Asia/Karachi), both inclusive.
 *
 *  production            order-wise: planned → produced → good / rejected → balance to make
 *  material-issues       issue register (MIV + returns), voucher by voucher
 *  material-consumption  per material: issued − returned − consumed − wasted = still on floor
 *  finished-goods        stock statement: opening + produced + … − dispatched … = closing
 *  raw-materials         same statement for materials: opening + purchased − issued … = closing
 *  stock-register        one product's movements, bank-statement style, running balance
 *  in-process            every open batch (order) with what is on the floor right now
 *  scrap                 scrap & rejection register
 *  product-production    each product day by day in kg: batches, issue, packs, in process
 *  product-summary       the same day sheets, without the material and batch detail
 *  stock-sheet           inventory stock sheet: per category, date by date issue · receive · balance
 *
 * Stock statements anchor on the stock the product has NOW and walk back: closing at the
 * end date = current − net movement after it; opening = closing − net movement inside the
 * period. Ending "today" therefore always agrees with the Products page.
 */

const EPS = 1e-6;
const MAX_ROWS = 5000;
const ACTIVE_RETURN_MATCH = { status: { $ne: 'rejected' } };
// Vouchers written before MIVs had a status (2026-10-14) have none: they are posted.
const POSTED_MIV = { $ne: 'cancelled' };
const isPostedMiv = (doc) => doc.status !== 'cancelled';
const OPEN_FLOOR_STATUSES = ['released', 'in_production', 'paused', 'qc_pending'];
const FINISHED_TYPES = ['finished_good', 'sub_assembly', 'by_product'];
const MATERIAL_TYPES = ['raw_material', 'component', 'packaging_material'];

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const CALENDAR_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" pair → inclusive UTC bounds. Defaults to the last 30 days. */
const resolveRange = ({ startDate, endDate } = {}) => {
  const todayKey = toBusinessCalendarDate(new Date());
  const endKey = CALENDAR_RE.test(endDate || '') ? endDate : todayKey;
  const startKey = CALENDAR_RE.test(startDate || '') ? startDate : shiftCalendarDate(endKey, -29);
  if (startKey > endKey) throw new ApiError(httpStatus.BAD_REQUEST, 'Start date is after end date');
  return { startKey, endKey, start: startOfBusinessDay(startKey), end: endOfBusinessDay(endKey), todayKey };
};

const sumBy = (rows, key) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
const lineUnits = (path) => ({ $ifNull: [`${path}.stockQuantity`, { $ifNull: [`${path}.quantity`, 0] }] });

/* ── Production (order-wise) ──────────────────────────────────────────────────── */

/**
 * Orders worked in the period: created by its end, not cancelled, and either still open
 * or completed inside / after the period start.
 */
const workedOrdersMatch = (ctx, range, { status, productId } = {}) => {
  const match = {
    ...aggregateScope(ctx),
    status: { $ne: 'cancelled' },
    createdAt: { $lte: range.end },
    $or: [{ status: { $in: OPEN_PRODUCTION_STATUSES } }, { actualCompletionDate: { $gte: range.start } }],
  };
  if (status === 'open') match.status = { $in: OPEN_PRODUCTION_STATUSES };
  if (status === 'completed') match.status = 'completed';
  if (productId) match.productId = oid(productId);
  return match;
};

/** productId → manufacturing type (finished_good, by_product, …) of the given products. */
const productTypes = async (productIds) => {
  const ids = [...new Set(productIds.filter(Boolean).map(String))];
  const products = ids.length
    ? await Product.find({ _id: { $in: ids.map(oid) } })
        .select('productType')
        .lean()
    : [];
  return new Map(products.map((p) => [String(p._id), p.productType || null]));
};

/** Balance still to come off the line: planned minus good, QC and rework already made. */
const balanceToMake = (o) =>
  Math.max(
    0,
    roundQty(o.plannedQuantity - (o.completedQuantity || 0) - (o.qcPendingQuantity || 0) - (o.reworkPendingQuantity || 0))
  );

const productionReport = async (ctx, q) => {
  const range = resolveRange(q);
  const match = workedOrdersMatch(ctx, range, q);
  const orders = await ProductionOrder.find(match)
    .select(
      'orderNumber batchNumber orderType status priority productId productName sku unit plannedQuantity producedQuantity completedQuantity rejectedQuantity qcPendingQuantity reworkPendingQuantity scrappedQuantity materialCost finishedGoodsValue plannedStartDate plannedCompletionDate actualStartDate actualCompletionDate createdAt bomNumber operatorName'
    )
    .sort({ createdAt: 1 })
    .limit(MAX_ROWS)
    .lean();
  const ids = orders.map((o) => o._id);
  const inPeriod = { $gte: range.start, $lte: range.end };
  const [receiptRows, outputRows, issueRows, typeOf] = ids.length
    ? await Promise.all([
        ProductionReceipt.aggregate([
          { $match: { productionOrderId: { $in: ids }, receiptDate: inPeriod } },
          { $group: { _id: '$productionOrderId', quantity: { $sum: '$quantity' }, value: { $sum: '$totalCost' } } },
        ]),
        ProductionOutput.aggregate([
          { $match: { productionOrderId: { $in: ids }, status: { $ne: 'reversed' }, reportedAt: inPeriod } },
          {
            $group: {
              _id: '$productionOrderId',
              produced: { $sum: '$producedQuantity' },
              rejected: { $sum: '$rejectedQuantity' },
            },
          },
        ]),
        MaterialIssue.aggregate([
          { $match: { productionOrderId: { $in: ids }, status: POSTED_MIV, issueDate: inPeriod } },
          {
            $group: {
              _id: '$productionOrderId',
              issued: { $sum: { $cond: [{ $eq: ['$kind', 'return'] }, 0, '$totalCost'] } },
              returned: { $sum: { $cond: [{ $eq: ['$kind', 'return'] }, '$totalCost', 0] } },
            },
          },
        ]),
        productTypes(orders.map((o) => o.productId)),
      ])
    : [[], [], [], new Map()];
  const receipts = new Map(receiptRows.map((r) => [String(r._id), r]));
  const outputs = new Map(outputRows.map((r) => [String(r._id), r]));
  const issues = new Map(issueRows.map((r) => [String(r._id), r]));

  const rows = orders.map((o) => {
    const id = String(o._id);
    const good = roundQty(o.completedQuantity || 0);
    const r = receipts.get(id) || {};
    const out = outputs.get(id) || {};
    const iss = issues.get(id) || {};
    return {
      id,
      orderNumber: o.orderNumber,
      batchNumber: o.batchNumber || o.orderNumber,
      orderType: o.orderType || 'production',
      status: o.status,
      productId: String(o.productId),
      productName: o.productName,
      productType: typeOf.get(String(o.productId)) || null,
      sku: o.sku || '',
      unit: o.unit,
      bomNumber: o.bomNumber || '',
      operatorName: o.operatorName || '',
      startDate: o.actualStartDate || o.plannedStartDate || o.createdAt,
      dueDate: o.plannedCompletionDate,
      completedDate: o.actualCompletionDate,
      planned: roundQty(o.plannedQuantity),
      produced: roundQty(o.producedQuantity || 0),
      good,
      rejected: roundQty(o.rejectedQuantity || 0),
      inQc: roundQty((o.qcPendingQuantity || 0) + (o.reworkPendingQuantity || 0)),
      balance: balanceToMake(o),
      completionPercent: o.plannedQuantity > 0 ? Math.min(100, Math.round((good / o.plannedQuantity) * 1000) / 10) : 0,
      materialCost: roundMoney(o.materialCost || 0),
      finishedValue: roundMoney(o.finishedGoodsValue || 0),
      unitCost: good > 0 ? roundMoney((o.finishedGoodsValue || 0) / good) : 0,
      periodProduced: roundQty(out.produced || 0),
      periodGood: roundQty(r.quantity || 0),
      periodGoodValue: roundMoney(r.value || 0),
      periodIssued: roundMoney((iss.issued || 0) - (iss.returned || 0)),
      isLate:
        !!o.plannedCompletionDate &&
        (o.actualCompletionDate ? o.actualCompletionDate > o.plannedCompletionDate : new Date() > o.plannedCompletionDate) &&
        o.status !== 'completed',
    };
  });

  // Product-wise roll-up (same unit only — orders of one product share its unit).
  const byProduct = new Map();
  rows.forEach((r) => {
    const key = `${r.productId}:${r.unit}`;
    const g = byProduct.get(key) || {
      productId: r.productId,
      productName: r.productName,
      productType: r.productType,
      sku: r.sku,
      unit: r.unit,
      orders: 0,
      planned: 0,
      produced: 0,
      good: 0,
      rejected: 0,
      inQc: 0,
      balance: 0,
      periodGood: 0,
      materialCost: 0,
      finishedValue: 0,
    };
    g.orders += 1;
    ['planned', 'produced', 'good', 'rejected', 'inQc', 'balance', 'periodGood'].forEach((k) => {
      g[k] = roundQty(g[k] + r[k]);
    });
    g.materialCost = roundMoney(g.materialCost + r.materialCost);
    g.finishedValue = roundMoney(g.finishedValue + r.finishedValue);
    byProduct.set(key, g);
  });

  return {
    report: 'production',
    period: { startDate: range.startKey, endDate: range.endKey },
    orders: rows,
    byProduct: [...byProduct.values()].sort((a, b) => a.productName.localeCompare(b.productName)),
    totals: {
      orderCount: rows.length,
      openCount: rows.filter((r) => OPEN_PRODUCTION_STATUSES.includes(r.status)).length,
      completedCount: rows.filter((r) => r.status === 'completed').length,
      lateCount: rows.filter((r) => r.isLate).length,
      materialCost: roundMoney(sumBy(rows, 'materialCost')),
      finishedValue: roundMoney(sumBy(rows, 'finishedValue')),
      periodGood: roundQty(sumBy(rows, 'periodGood')),
      periodGoodValue: roundMoney(sumBy(rows, 'periodGoodValue')),
      periodIssued: roundMoney(sumBy(rows, 'periodIssued')),
    },
    truncated: orders.length >= MAX_ROWS,
  };
};

/* ── Material issue register ──────────────────────────────────────────────────── */

const materialIssueRegister = async (ctx, q) => {
  const range = resolveRange(q);
  const match = { ...aggregateScope(ctx), issueDate: { $gte: range.start, $lte: range.end } };
  if (q.productionOrderId) match.productionOrderId = oid(q.productionOrderId);
  if (q.productId) match['lines.productId'] = oid(q.productId);
  const docs = await MaterialIssue.find(match)
    .select(
      'issueNumber kind status productionOrderId orderNumber issueDate lines totalCost issuedBy requestedBy reference notes cancelReason'
    )
    .sort({ issueDate: 1, createdAt: 1 })
    .limit(MAX_ROWS)
    .lean();

  const posted = docs.filter(isPostedMiv);
  const cancelled = docs.filter((d) => !isPostedMiv(d));
  const orderIds = [...new Set(posted.map((d) => String(d.productionOrderId)))];
  const orders = orderIds.length
    ? await ProductionOrder.find({ _id: { $in: orderIds } })
        .select('productName unit plannedQuantity')
        .lean()
    : [];
  const orderOf = new Map(orders.map((o) => [String(o._id), o]));

  const byMaterial = new Map();
  const vouchers = posted.map((d) => {
    const isReturn = d.kind === 'return';
    const lines = (d.lines || [])
      .filter((l) => !q.productId || String(l.productId) === String(q.productId))
      .map((l) => {
        const key = `${l.productId}:${l.variantId || ''}:${l.unit}`;
        const g = byMaterial.get(key) || {
          productId: String(l.productId),
          productName: l.productName,
          unit: l.unit,
          issuedQty: 0,
          issuedValue: 0,
          returnedQty: 0,
          returnedValue: 0,
          vouchers: 0,
        };
        if (isReturn) {
          g.returnedQty = roundQty(g.returnedQty + l.quantity);
          g.returnedValue = roundMoney(g.returnedValue + (l.totalCost || 0));
        } else {
          g.issuedQty = roundQty(g.issuedQty + l.quantity);
          g.issuedValue = roundMoney(g.issuedValue + (l.totalCost || 0));
        }
        g.vouchers += 1;
        byMaterial.set(key, g);
        return {
          productId: String(l.productId),
          productName: l.productName,
          unit: l.unit,
          quantity: roundQty(l.quantity),
          unitCost: roundMoney(l.unitCost || 0),
          totalCost: roundMoney(l.totalCost || 0),
          batchNumber: l.batchNumber || '',
          isAlternative: !!l.isAlternative,
        };
      });
    const order = orderOf.get(String(d.productionOrderId)) || {};
    return {
      id: String(d._id),
      number: d.issueNumber,
      kind: isReturn ? 'return' : 'issue',
      date: d.issueDate,
      orderId: String(d.productionOrderId),
      orderNumber: d.orderNumber,
      orderProduct: order.productName || '',
      issuedBy: (d.issuedBy && d.issuedBy.name) || '',
      reference: d.reference || '',
      notes: d.notes || '',
      lines,
      total: roundMoney(sumBy(lines, 'totalCost')),
    };
  });
  const shown = vouchers.filter((v) => v.lines.length);
  const issuedValue = roundMoney(
    sumBy(
      shown.filter((v) => v.kind === 'issue'),
      'total'
    )
  );
  const returnedValue = roundMoney(
    sumBy(
      shown.filter((v) => v.kind === 'return'),
      'total'
    )
  );
  return {
    report: 'material-issues',
    period: { startDate: range.startKey, endDate: range.endKey },
    vouchers: shown,
    byMaterial: [...byMaterial.values()]
      .map((g) => ({
        ...g,
        netQty: roundQty(g.issuedQty - g.returnedQty),
        netValue: roundMoney(g.issuedValue - g.returnedValue),
      }))
      .sort((a, b) => b.netValue - a.netValue),
    totals: {
      voucherCount: shown.filter((v) => v.kind === 'issue').length,
      returnCount: shown.filter((v) => v.kind === 'return').length,
      lineCount: shown.reduce((s, v) => s + v.lines.length, 0),
      issuedValue,
      returnedValue,
      netValue: roundMoney(issuedValue - returnedValue),
      cancelledCount: cancelled.length,
    },
    truncated: docs.length >= MAX_ROWS,
  };
};

/* ── Material consumption (issue vs used vs remaining) ────────────────────────── */

/**
 * Packing material recorded on receipts beyond the recipe (execution#useExtraFloorMaterials):
 * taken from production stock and used in one step, on no material line of the order, yet
 * part of the finished goods' cost. → Map(orderId → rows shaped like lineUsage), so the
 * material tables add up to what the output cost.
 */
const extraUsageLines = async (orderIds) => {
  const byOrder = new Map();
  if (!orderIds.length) return byOrder;
  const rows = await ProductionOutput.aggregate([
    { $match: { productionOrderId: { $in: orderIds }, status: { $ne: 'reversed' }, 'consumption.extra': true } },
    { $unwind: '$consumption' },
    { $match: { 'consumption.extra': true } },
    {
      $group: {
        _id: { order: '$productionOrderId', product: '$consumption.productId', unit: '$consumption.unit' },
        productName: { $last: '$consumption.productName' },
        quantity: { $sum: '$consumption.quantity' },
        cost: { $sum: '$consumption.cost' },
      },
    },
    { $sort: { productName: 1 } },
  ]);
  rows.forEach((r) => {
    const quantity = roundQty(r.quantity);
    const cost = roundMoney(r.cost);
    const line = {
      materialLineId: null,
      extra: true,
      productId: String(r._id.product),
      variantId: null,
      productName: r.productName,
      sku: '',
      unit: r._id.unit,
      isOptional: false,
      required: 0,
      issued: quantity,
      returned: 0,
      used: quantity,
      wastage: 0,
      inFactory: 0,
      toIssue: 0,
      standard: 0,
      variance: 0,
      issuedValue: cost,
      usedValue: cost,
      returnedValue: 0,
      wastageValue: 0,
      inFactoryValue: 0,
    };
    const key = String(r._id.order);
    byOrder.set(key, [...(byOrder.get(key) || []), line]);
  });
  return byOrder;
};

const materialConsumption = async (ctx, q) => {
  const range = resolveRange(q);
  const match = workedOrdersMatch(ctx, range, q);
  const orders = await ProductionOrder.find(match)
    .select(
      'orderNumber orderType status productId productName unit plannedQuantity producedQuantity completedQuantity rejectedQuantity materials wipLots createdAt'
    )
    .sort({ createdAt: 1 })
    .limit(MAX_ROWS)
    .lean();

  const KEYS = ['required', 'issued', 'returned', 'used', 'wastage', 'inFactory', 'toIssue', 'standard', 'variance'];
  const VALUES = ['issuedValue', 'usedValue', 'returnedValue', 'wastageValue', 'inFactoryValue'];
  const extras = await extraUsageLines(orders.map((o) => o._id));
  const byMaterial = new Map();
  const orderRows = orders.map((order) => {
    const lines = [...(order.materials || []).map((m) => lineUsage(order, m)), ...(extras.get(String(order._id)) || [])];
    lines.forEach((l) => {
      const key = `${l.productId}:${l.variantId || ''}:${l.unit}`;
      const g = byMaterial.get(key) || {
        productId: l.productId,
        productName: l.productName,
        sku: l.sku,
        unit: l.unit,
        orders: 0,
        ...Object.fromEntries([...KEYS, ...VALUES].map((k) => [k, 0])),
      };
      g.orders += 1;
      KEYS.forEach((k) => {
        g[k] = roundQty(g[k] + l[k]);
      });
      VALUES.forEach((k) => {
        g[k] = roundMoney(g[k] + l[k]);
      });
      byMaterial.set(key, g);
    });
    return {
      id: String(order._id),
      orderNumber: order.orderNumber,
      status: order.status,
      productName: order.productName,
      unit: order.unit,
      planned: roundQty(order.plannedQuantity),
      good: roundQty(order.completedQuantity || 0),
      lines,
      ...Object.fromEntries(VALUES.map((k) => [k, roundMoney(sumBy(lines, k))])),
    };
  });
  const materials = [...byMaterial.values()].sort((a, b) => a.productName.localeCompare(b.productName));
  const totals = Object.fromEntries(VALUES.map((k) => [k, roundMoney(sumBy(materials, k))]));
  return {
    report: 'material-consumption',
    period: { startDate: range.startKey, endDate: range.endKey },
    materials,
    orders: orderRows,
    totals: {
      ...totals,
      orderCount: orderRows.length,
      materialCount: materials.length,
      wastagePercent: totals.issuedValue > 0 ? Math.round((totals.wastageValue / totals.issuedValue) * 1000) / 10 : 0,
    },
    truncated: orders.length >= MAX_ROWS,
  };
};

/* ── Stock movement engine (statements + register) ────────────────────────────── */

/**
 * Every document that moves a product's sellable stock, as { key, sign }. `qty` resolves
 * to base (stock) units; `product` is the path holding the product id after any unwind.
 */
const MOVEMENT_SOURCES = [
  {
    key: 'produced',
    Model: ProductionReceipt,
    date: 'receiptDate',
    product: 'productId',
    qty: '$quantity',
    sign: 1,
    number: 'receiptNumber',
    detail: (d) => ({ orderNumber: d.orderNumber, note: d.batchNumber ? `Batch ${d.batchNumber}` : '' }),
    project: { receiptNumber: 1, orderNumber: 1, batchNumber: 1, unitCost: 1 },
    unitCost: '$unitCost',
  },
  {
    key: 'sold',
    Model: Invoice,
    date: 'invoiceDate',
    extra: SOLD_INVOICE_MATCH,
    array: 'items',
    product: 'items.productId',
    qty: lineUnits('$items'),
    sign: -1,
    number: 'invoiceNumber',
    party: 'customer',
    project: { invoiceNumber: 1, customerId: 1, customerName: 1, walkInCustomerName: 1, type: 1 },
    unitCost: '$items.unitPrice',
  },
  {
    key: 'salesReturn',
    Model: SalesReturn,
    date: 'date',
    extra: ACTIVE_RETURN_MATCH,
    array: 'items',
    product: 'items.productId',
    qty: lineUnits('$items'),
    sign: 1,
    number: 'returnNumber',
    party: 'customer',
    project: { returnNumber: 1, customerId: 1, customerName: 1, reason: 1 },
    unitCost: '$items.price',
  },
  {
    key: 'purchased',
    Model: Purchase,
    date: 'purchaseDate',
    array: 'items',
    product: 'items.product',
    qty: lineUnits('$items'),
    sign: 1,
    number: 'invoiceNumber',
    party: 'supplier',
    partyField: 'supplier',
    project: { invoiceNumber: 1, supplier: 1, vendorBillNumber: 1 },
    unitCost: '$items.priceAtPurchase',
  },
  {
    key: 'purchaseReturn',
    Model: PurchaseReturn,
    date: 'date',
    extra: ACTIVE_RETURN_MATCH,
    array: 'items',
    product: 'items.productId',
    qty: lineUnits('$items'),
    sign: -1,
    number: 'returnNumber',
    party: 'supplier',
    partyField: 'supplierId',
    project: { returnNumber: 1, supplierId: 1, reason: 1 },
    unitCost: '$items.price',
  },
  {
    key: 'issued',
    Model: MaterialIssue,
    date: 'issueDate',
    extra: { status: POSTED_MIV, kind: { $ne: 'return' } },
    array: 'lines',
    product: 'lines.productId',
    qty: '$lines.quantity',
    sign: -1,
    number: 'issueNumber',
    project: { issueNumber: 1, orderNumber: 1 },
    detail: (d) => ({ orderNumber: d.orderNumber }),
    unitCost: '$lines.unitCost',
  },
  {
    key: 'returnedFromProduction',
    Model: MaterialIssue,
    date: 'issueDate',
    extra: { status: POSTED_MIV, kind: 'return' },
    array: 'lines',
    product: 'lines.productId',
    qty: '$lines.quantity',
    sign: 1,
    number: 'issueNumber',
    project: { issueNumber: 1, orderNumber: 1 },
    detail: (d) => ({ orderNumber: d.orderNumber }),
    unitCost: '$lines.unitCost',
  },
  {
    key: 'scrapped',
    Model: ScrapRecord,
    date: 'scrapDate',
    extra: { affectsStock: true },
    product: 'productId',
    qty: '$quantity',
    sign: -1,
    number: 'scrapNumber',
    project: { scrapNumber: 1, orderNumber: 1, reason: 1 },
    detail: (d) => ({ orderNumber: d.orderNumber || '', note: d.reason ? String(d.reason).replace(/_/g, ' ') : '' }),
    unitCost: '$unitCost',
  },
  // Packing (packing.service.js): packs in; bulk + packing material out. A cancelled
  // voucher and its reversal net to zero, so only posted ones are read.
  {
    key: 'packedIn',
    Model: PackingVoucher,
    date: 'packingDate',
    extra: { status: 'posted' },
    array: 'lines',
    product: 'lines.productId',
    qty: '$lines.quantity',
    sign: 1,
    number: 'voucherNumber',
    project: { voucherNumber: 1, orderNumber: 1, batchNumber: 1, productName: 1 },
    detail: (d) => ({
      orderNumber: d.orderNumber || '',
      note: [`Packed from ${d.productName}`, d.batchNumber ? `Batch ${d.batchNumber}` : ''].filter(Boolean).join(' · '),
    }),
    unitCost: '$lines.unitCost',
  },
  {
    key: 'packedOut',
    Model: PackingVoucher,
    date: 'packingDate',
    extra: { status: 'posted' },
    array: 'consumed',
    product: 'consumed.productId',
    // Packing material taken from production stock left the store when it was issued there.
    lineMatch: { 'consumed.source': { $ne: 'floor' } },
    qty: '$consumed.quantity',
    sign: -1,
    number: 'voucherNumber',
    project: { voucherNumber: 1, orderNumber: 1, batchNumber: 1 },
    detail: (d) => ({ orderNumber: d.orderNumber || '', note: d.batchNumber ? `Batch ${d.batchNumber}` : '' }),
    unitCost: '$consumed.unitCost',
  },
  // Production stock (floorStock.service.js): material issued to the floor in bulk leaves
  // the store then, and comes back on a return. Cancelled vouchers net to zero (left out).
  {
    key: 'issuedToFloor',
    Model: FloorStockVoucher,
    date: 'voucherDate',
    extra: { status: 'posted', kind: 'issue' },
    array: 'lines',
    product: 'lines.productId',
    qty: '$lines.quantity',
    sign: -1,
    number: 'voucherNumber',
    project: { voucherNumber: 1, auto: 1, source: 1 },
    detail: (d) => ({
      note: d.auto
        ? `To production stock — auto for ${(d.source && d.source.number) || 'a receipt'}`
        : 'To production stock',
    }),
    unitCost: '$lines.unitCost',
  },
  {
    key: 'returnedFromFloor',
    Model: FloorStockVoucher,
    date: 'voucherDate',
    extra: { status: 'posted', kind: 'return' },
    array: 'lines',
    product: 'lines.productId',
    qty: '$lines.quantity',
    sign: 1,
    number: 'voucherNumber',
    project: { voucherNumber: 1 },
    detail: () => ({ note: 'Back from production stock' }),
    unitCost: '$lines.unitCost',
  },
  {
    key: 'adjustment',
    Model: StockAdjustment,
    date: 'createdAt',
    product: 'productId',
    qty: { $cond: [{ $eq: ['$direction', 'increase'] }, '$quantity', { $multiply: ['$quantity', -1] }] },
    sign: 1,
    number: null,
    project: { type: 1, reason: 1, notes: 1, direction: 1 },
    detail: (d) => ({ note: [String(d.type || '').replace(/_/g, ' '), d.reason || d.notes].filter(Boolean).join(' — ') }),
    unitCost: '$unitCost',
  },
];

/** Branch transfers: one leg out of the sending branch's product, one into the receiver's. */
const transferLegs = (scope, productIds, dateMatch) => {
  const out = { fromProductId: { $in: productIds }, status: { $in: ['in_transit', 'completed'] } };
  const inn = { toProductId: { $in: productIds }, status: 'completed' };
  if (scope.branchId) {
    out.fromBranchId = scope.branchId;
    inn.toBranchId = scope.branchId;
  }
  return [
    {
      key: 'transferOut',
      match: { organizationId: scope.organizationId, ...out, createdAt: dateMatch },
      product: '$fromProductId',
      sign: -1,
    },
    {
      key: 'transferIn',
      // Arrives when completed; older rows without completedAt fall back to createdAt.
      match: {
        organizationId: scope.organizationId,
        ...inn,
        $or: [{ completedAt: dateMatch }, { completedAt: null, createdAt: dateMatch }],
      },
      product: '$toProductId',
      sign: 1,
    },
  ];
};

const MOVEMENT_KEYS = [...MOVEMENT_SOURCES.map((s) => s.key), 'transferIn', 'transferOut'];

/**
 * Signed movement per product and source since `from`, split into inside the period
 * (≤ end) and after it. → Map(productId → { period: {key: qty}, after: number }).
 */
const movementTotals = async (scope, productIds, from, end) => {
  const result = new Map(productIds.map((id) => [String(id), { period: {}, after: 0 }]));
  const add = (pid, key, isAfter, qty) => {
    const r = result.get(String(pid));
    if (!r) return;
    if (isAfter) r.after += qty;
    else r.period[key] = (r.period[key] || 0) + qty;
  };
  await Promise.all(
    MOVEMENT_SOURCES.map((s) =>
      s.Model.aggregate([
        { $match: { ...scope, ...(s.extra || {}), [s.date]: { $gte: from }, [s.product]: { $in: productIds } } },
        ...(s.array
          ? [{ $unwind: `$${s.array}` }, { $match: { [s.product]: { $in: productIds }, ...(s.lineMatch || {}) } }]
          : []),
        {
          $group: {
            _id: { p: `$${s.product}`, after: { $gt: [`$${s.date}`, end] } },
            qty: { $sum: s.qty },
          },
        },
      ]).then((rows) => rows.forEach((r) => add(r._id.p, s.key, r._id.after, s.sign * r.qty)))
    )
  );
  await Promise.all(
    transferLegs(scope, productIds, { $gte: from }).map((leg) =>
      InventoryTransfer.aggregate([
        { $match: leg.match },
        {
          $group: {
            _id: {
              p: leg.product,
              after: { $gt: [leg.key === 'transferIn' ? { $ifNull: ['$completedAt', '$createdAt'] } : '$createdAt', end] },
            },
            qty: { $sum: '$quantity' },
          },
        },
      ]).then((rows) => rows.forEach((r) => add(r._id.p, leg.key, r._id.after, leg.sign * r.qty)))
    )
  );
  return result;
};

/** Current sellable stock — variant products keep theirs on Inventory rows. */
const currentStock = async (products) => {
  const variantIds = products.filter((p) => p.hasVariants).map((p) => p._id);
  const variantStock = variantIds.length
    ? await Inventory.aggregate([
        { $match: { productId: { $in: variantIds } } },
        { $group: { _id: '$productId', stock: { $sum: '$quantity' } } },
      ])
    : [];
  const byVariant = new Map(variantStock.map((r) => [String(r._id), r.stock || 0]));
  return new Map(
    products.map((p) => [String(p._id), p.hasVariants ? byVariant.get(String(p._id)) || 0 : Number(p.stockQuantity) || 0])
  );
};

/**
 * What one unit of each product's stock is worth: the cost of the batches held, else the
 * product's cost (its variants' for a variant product — kept current by purchases), else
 * the stock row's average cost, else what its latest production cost — a made finished
 * good or by-product has no bought cost of its own (stock.service#madeUnitCost).
 */
const stockUnitCosts = async (scope, products) => {
  const ids = products.map((p) => p._id);
  const costs = new Map();
  if (!ids.length) return costs;
  const weighted = (rows) => {
    const priced = rows.filter((r) => r.cost > 0);
    if (!priced.length) return 0;
    const held = priced.reduce((s, r) => s + Math.max(0, r.quantity), 0);
    return held > EPS
      ? priced.reduce((s, r) => s + Math.max(0, r.quantity) * r.cost, 0) / held
      : priced.reduce((s, r) => s + r.cost, 0) / priced.length;
  };
  const [inventories, variants, receipts] = await Promise.all([
    Inventory.find({ ...scope, productId: { $in: ids } })
      .select('productId quantity averageCost')
      .lean(),
    ProductVariant.find({ productId: { $in: ids }, isDefault: { $ne: true }, cost: { $gt: 0 } })
      .select('productId cost')
      .lean(),
    ProductionReceipt.aggregate([
      { $match: { ...scope, productId: { $in: ids }, unitCost: { $gt: 0 } } },
      { $sort: { receiptDate: -1, createdAt: -1 } },
      { $group: { _id: '$productId', unitCost: { $first: '$unitCost' } } },
    ]),
  ]);
  const batches = inventories.length
    ? await Batch.find({ inventoryId: { $in: inventories.map((i) => i._id) }, quantity: { $gt: EPS } })
        .select('inventoryId quantity costPerUnit')
        .lean()
    : [];
  const productOfInventory = new Map(inventories.map((i) => [String(i._id), String(i.productId)]));
  const group = (rows, keyOf, map) =>
    rows.reduce((acc, r) => {
      const k = keyOf(r);
      acc.set(k, [...(acc.get(k) || []), map(r)]);
      return acc;
    }, new Map());
  const batchRows = group(
    batches,
    (b) => productOfInventory.get(String(b.inventoryId)),
    (b) => ({ quantity: b.quantity, cost: b.costPerUnit || 0 })
  );
  const stockRows = group(
    inventories,
    (i) => String(i.productId),
    (i) => ({ quantity: i.quantity || 0, cost: i.averageCost || 0 })
  );
  const variantRows = group(
    variants,
    (v) => String(v.productId),
    (v) => ({ quantity: 0, cost: v.cost })
  );
  const made = new Map(receipts.map((r) => [String(r._id), r.unitCost]));
  products.forEach((p) => {
    const id = String(p._id);
    costs.set(
      id,
      weighted(batchRows.get(id) || []) ||
        (p.hasVariants ? weighted(variantRows.get(id) || []) : Number(p.cost)) ||
        weighted(stockRows.get(id) || []) ||
        made.get(id) ||
        0
    );
  });
  return costs;
};

/** Products a statement covers: by manufacturing type, plus whatever production actually touched. */
const statementProducts = async (ctx, kind, { productId, search } = {}) => {
  const scope = aggregateScope(ctx);
  const fields = 'name nameUrdu sku unit cost price stockQuantity hasVariants productType';
  if (productId) {
    const one = await Product.findOne({ ...scope, _id: oid(productId) })
      .select(fields)
      .lean();
    if (!one) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
    return [one];
  }
  const touched =
    kind === 'finished'
      ? await ProductionOrder.distinct('productId', { ...scope, status: { $ne: 'cancelled' } })
      : await MaterialIssue.distinct('lines.productId', { ...scope, status: POSTED_MIV });
  const types = kind === 'finished' ? FINISHED_TYPES : MATERIAL_TYPES;
  const query = { ...scope, $or: [{ productType: { $in: types } }, { _id: { $in: touched } }] };
  if (search && String(search).trim()) {
    const rx = new RegExp(escapeRegex(String(search).trim()), 'i');
    query.$and = [{ $or: [{ name: rx }, { sku: rx }] }];
  }
  return Product.find(query).select(fields).sort({ name: 1 }).limit(MAX_ROWS).lean();
};

const stockStatement = async (ctx, q, kind) => {
  const range = resolveRange(q);
  const products = await statementProducts(ctx, kind, q);
  const scope = aggregateScope(ctx);
  const ids = products.map((p) => p._id);
  const [moves, stock, costs] = await Promise.all([
    ids.length ? movementTotals(scope, ids, range.start, range.end) : new Map(),
    currentStock(products),
    stockUnitCosts(scope, products),
  ]);
  const rows = products.map((p) => {
    const id = String(p._id);
    const m = moves.get(id) || { period: {}, after: 0 };
    const current = roundQty(stock.get(id) || 0);
    const net = Object.values(m.period).reduce((s, v) => s + v, 0);
    const closing = roundQty(current - m.after);
    const opening = roundQty(closing - net);
    const movements = Object.fromEntries(MOVEMENT_KEYS.map((k) => [k, roundQty(m.period[k] || 0)]));
    const unitCost = costs.get(id) || 0;
    return {
      productId: id,
      productName: p.name,
      nameUrdu: p.nameUrdu || '',
      sku: p.sku || '',
      unit: p.unit || '',
      productType: p.productType || null,
      opening,
      movements,
      totalIn: roundQty(
        Object.values(movements)
          .filter((v) => v > 0)
          .reduce((s, v) => s + v, 0)
      ),
      totalOut: roundQty(
        -Object.values(movements)
          .filter((v) => v < 0)
          .reduce((s, v) => s + v, 0)
      ),
      closing,
      current,
      unitCost: roundMoney(unitCost),
      closingValue: roundMoney(closing * unitCost),
      salePrice: roundMoney(p.price || 0),
    };
  });
  const active =
    q.hideIdle === 'true' || q.hideIdle === true
      ? rows.filter((r) => Math.abs(r.opening) > EPS || Math.abs(r.closing) > EPS || r.totalIn > EPS || r.totalOut > EPS)
      : rows;
  const totals = {
    productCount: active.length,
    closingValue: roundMoney(sumBy(active, 'closingValue')),
    movements: Object.fromEntries(MOVEMENT_KEYS.map((k) => [k, roundQty(active.reduce((s, r) => s + r.movements[k], 0))])),
  };
  return {
    report: kind === 'finished' ? 'finished-goods' : 'raw-materials',
    period: { startDate: range.startKey, endDate: range.endKey },
    rows: active,
    totals,
  };
};

/** Bank-statement register of one product: opening, each movement, running balance, closing. */
const stockRegister = async (ctx, q) => {
  if (!q.productId) throw new ApiError(httpStatus.BAD_REQUEST, 'Choose a product');
  const range = resolveRange(q);
  const [product] = await statementProducts(ctx, 'finished', { productId: q.productId });
  const scope = aggregateScope(ctx);
  const pid = product._id;
  const [moves, stock] = await Promise.all([movementTotals(scope, [pid], range.start, range.end), currentStock([product])]);
  const m = moves.get(String(pid));
  const current = roundQty(stock.get(String(pid)) || 0);
  const closing = roundQty(current - m.after);
  const opening = roundQty(closing - Object.values(m.period).reduce((s, v) => s + v, 0));
  const inPeriod = { $gte: range.start, $lte: range.end };

  const entries = (
    await Promise.all(
      MOVEMENT_SOURCES.map((s) =>
        s.Model.aggregate([
          { $match: { ...scope, ...(s.extra || {}), [s.date]: inPeriod, [s.product]: pid } },
          ...(s.array ? [{ $unwind: `$${s.array}` }, { $match: { [s.product]: pid, ...(s.lineMatch || {}) } }] : []),
          {
            $project: {
              ...s.project,
              _date: `$${s.date}`,
              _qty: s.qty,
              _rate: s.unitCost || null,
              _created: '$createdAt',
            },
          },
          { $limit: MAX_ROWS },
        ]).then((docs) =>
          docs.map((d) => ({
            source: s.key,
            id: String(d._id),
            date: d._date,
            created: d._created,
            number: s.number ? d[s.number] || '' : '',
            quantity: roundQty(s.sign * (d._qty || 0)),
            rate: d._rate != null ? roundMoney(d._rate) : null,
            partyKind: s.party || null,
            partyId: s.party ? String((s.partyField ? d[s.partyField] : d.customerId) || '') || null : null,
            partyName: d.walkInCustomerName || d.customerName || null,
            invoiceType: s.key === 'sold' ? d.type : undefined,
            ...(s.detail ? s.detail(d) : {}),
          }))
        )
      )
    )
  ).flat();

  const transfers = await Promise.all(
    transferLegs(scope, [pid], inPeriod).map((leg) =>
      InventoryTransfer.find(leg.match)
        .select('transferNumber quantity fromBranchId toBranchId createdAt completedAt notes')
        .populate('fromBranchId', 'name')
        .populate('toBranchId', 'name')
        .limit(MAX_ROWS)
        .lean()
        .then((docs) =>
          docs.map((d) => ({
            source: leg.key,
            id: String(d._id),
            date: leg.key === 'transferIn' ? d.completedAt || d.createdAt : d.createdAt,
            created: d.createdAt,
            number: d.transferNumber || '',
            quantity: roundQty(leg.sign * d.quantity),
            rate: null,
            partyName: ((leg.key === 'transferIn' ? d.fromBranchId : d.toBranchId) || {}).name || null,
            note: d.notes || '',
          }))
        )
    )
  );
  const all = [...entries, ...transfers.flat()].filter((e) => Math.abs(e.quantity) > EPS);

  // Party names for sales / purchases.
  const ids = (kind) => [
    ...new Set(
      all
        .filter((e) => e.partyKind === kind && e.partyId && mongoose.Types.ObjectId.isValid(e.partyId))
        .map((e) => e.partyId)
    ),
  ];
  const [customers, suppliers] = await Promise.all([
    ids('customer').length
      ? Customer.find({ _id: { $in: ids('customer') } })
          .select('name')
          .lean()
      : [],
    ids('supplier').length
      ? Supplier.find({ _id: { $in: ids('supplier') } })
          .select('name')
          .lean()
      : [],
  ]);
  const names = new Map([...customers, ...suppliers].map((p) => [String(p._id), p.name]));

  all.sort((a, b) => new Date(a.date) - new Date(b.date) || new Date(a.created) - new Date(b.created));
  let balance = opening;
  const rows = all.map((e) => {
    balance = roundQty(balance + e.quantity);
    const { partyId, partyKind, created, ...rest } = e;
    return {
      ...rest,
      partyName: (partyId && names.get(partyId)) || e.partyName || null,
      in: e.quantity > 0 ? e.quantity : 0,
      out: e.quantity < 0 ? -e.quantity : 0,
      balance,
    };
  });

  return {
    report: 'stock-register',
    period: { startDate: range.startKey, endDate: range.endKey },
    product: {
      id: String(pid),
      name: product.name,
      nameUrdu: product.nameUrdu || '',
      sku: product.sku || '',
      unit: product.unit || '',
      productType: product.productType || null,
      unitCost: roundMoney(product.cost || 0),
      current,
    },
    opening,
    closing,
    // Rows are rebuilt from documents; if a row was edited outside them the walk-back
    // anchors on the real stock anyway, so the closing figure is always the true one.
    rows,
    totals: {
      in: roundQty(sumBy(rows, 'in')),
      out: roundQty(sumBy(rows, 'out')),
      count: rows.length,
    },
  };
};

/* ── In-process batches ───────────────────────────────────────────────────────── */

/** The step running now, else the next one due; 'Finishing' once every step is done. */
const stageOf = (running, next, ops) => {
  if (running) return running.name;
  if (next) return next.name;
  return ops.length ? 'Finishing' : '';
};

const inProcessReport = async (ctx, q) => {
  const match = { ...aggregateScope(ctx), status: { $in: OPEN_FLOOR_STATUSES } };
  if (q.productId) match.productId = oid(q.productId);
  const orders = await ProductionOrder.find(match)
    .select(
      'orderNumber orderType status priority productName sku unit plannedQuantity producedQuantity completedQuantity rejectedQuantity qcPendingQuantity reworkPendingQuantity scrappedQuantity materialCost finishedGoodsValue plannedStartDate plannedCompletionDate actualStartDate createdAt wipLocation operatorName materials wipLots operations'
    )
    .sort({ actualStartDate: 1, createdAt: 1 })
    .lean();
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const rows = orders.map((o) => {
    const lots = (o.wipLots || []).filter((l) => l.quantity > EPS);
    const ops = [...(o.operations || [])].sort((a, b) => a.sequence - b.sequence);
    const running = ops.find((op) => op.status === 'in_progress');
    const next = ops.find((op) => op.status !== 'completed' && op.status !== 'skipped');
    const doneOps = ops.filter((op) => op.status === 'completed').length;
    const started = o.actualStartDate || null;
    const materials = (o.materials || []).map((m) => {
      const inWip = wip.lineWip(o, m);
      const mLots = lots.filter((l) => String(l.materialLineId) === String(m._id));
      return {
        productName: m.productName,
        unit: m.unit,
        required: roundQty(m.requiredQuantity),
        issued: roundQty((m.issuedQuantity || 0) - (m.returnedQuantity || 0)),
        consumed: wip.predatesWip(o)
          ? Math.max(0, roundQty((m.issuedQuantity || 0) - (m.returnedQuantity || 0) - (m.scrappedQuantity || 0)))
          : roundQty(m.consumedQuantity || 0),
        scrapped: roundQty(m.scrappedQuantity || 0),
        inWip,
        toIssue: wip.lineRemaining(m),
        wipValue: roundMoney(mLots.reduce((s, l) => s + l.quantity * (l.unitCost || 0), 0)),
        batches: [...new Set(mLots.map((l) => l.batchNumber).filter(Boolean))],
      };
    });
    const dueMs = o.plannedCompletionDate ? new Date(o.plannedCompletionDate).getTime() : null;
    return {
      id: String(o._id),
      orderNumber: o.orderNumber,
      orderType: o.orderType || 'production',
      status: o.status,
      priority: o.priority,
      productName: o.productName,
      sku: o.sku || '',
      unit: o.unit,
      wipLocation: o.wipLocation || '',
      operatorName: o.operatorName || '',
      startedAt: started,
      dueDate: o.plannedCompletionDate,
      daysInProcess: started ? Math.max(0, Math.floor((now - new Date(started).getTime()) / DAY)) : null,
      daysOverdue: dueMs && dueMs < now ? Math.floor((now - dueMs) / DAY) : 0,
      stage: stageOf(running, next, ops),
      stageStatus: (running && 'running') || (next && 'next') || '',
      operationsDone: doneOps,
      operationsTotal: ops.length,
      planned: roundQty(o.plannedQuantity),
      produced: roundQty(o.producedQuantity || 0),
      good: roundQty(o.completedQuantity || 0),
      rejected: roundQty(o.rejectedQuantity || 0),
      qcPending: roundQty(o.qcPendingQuantity || 0),
      reworkPending: roundQty(o.reworkPendingQuantity || 0),
      balance: balanceToMake(o),
      completionPercent:
        o.plannedQuantity > 0 ? Math.min(100, Math.round(((o.completedQuantity || 0) / o.plannedQuantity) * 1000) / 10) : 0,
      materialCost: roundMoney(o.materialCost || 0),
      wipValue: roundMoney(lots.reduce((s, l) => s + l.quantity * (l.unitCost || 0), 0)),
      materials,
    };
  });
  return {
    report: 'in-process',
    asOf: new Date(),
    batches: rows,
    totals: {
      batchCount: rows.length,
      planned: roundQty(sumBy(rows, 'planned')),
      wipValue: roundMoney(sumBy(rows, 'wipValue')),
      qcPending: roundQty(sumBy(rows, 'qcPending')),
      reworkPending: roundQty(sumBy(rows, 'reworkPending')),
      overdueCount: rows.filter((r) => r.daysOverdue > 0).length,
      notStartedCount: rows.filter((r) => !r.startedAt).length,
    },
  };
};

/* ── Scrap & rejection ────────────────────────────────────────────────────────── */

const scrapReport = async (ctx, q) => {
  const range = resolveRange(q);
  const match = { ...aggregateScope(ctx), scrapDate: { $gte: range.start, $lte: range.end } };
  if (q.productId) match.productId = oid(q.productId);
  const docs = await ScrapRecord.find(match)
    .select('scrapNumber orderNumber productName unit stage reason quantity unitCost totalCost affectsStock scrapDate notes')
    .sort({ scrapDate: 1, createdAt: 1 })
    .limit(MAX_ROWS)
    .lean();
  const rows = docs.map((d) => ({
    id: String(d._id),
    number: d.scrapNumber,
    date: d.scrapDate,
    orderNumber: d.orderNumber || '',
    productName: d.productName,
    unit: d.unit,
    stage: d.stage,
    reason: d.reason,
    quantity: roundQty(d.quantity),
    unitCost: roundMoney(d.unitCost || 0),
    value: roundMoney(d.totalCost || 0),
    affectsStock: !!d.affectsStock,
    notes: d.notes || '',
  }));
  const group = (key) => {
    const map = new Map();
    rows.forEach((r) => {
      const g = map.get(r[key]) || { key: r[key], count: 0, value: 0 };
      g.count += 1;
      g.value = roundMoney(g.value + r.value);
      map.set(r[key], g);
    });
    return [...map.values()].sort((a, b) => b.value - a.value);
  };
  const byProduct = new Map();
  rows.forEach((r) => {
    const k = `${r.productName}:${r.unit}`;
    const g = byProduct.get(k) || { productName: r.productName, unit: r.unit, quantity: 0, value: 0, count: 0 };
    g.quantity = roundQty(g.quantity + r.quantity);
    g.value = roundMoney(g.value + r.value);
    g.count += 1;
    byProduct.set(k, g);
  });
  return {
    report: 'scrap',
    period: { startDate: range.startKey, endDate: range.endKey },
    rows,
    byStage: group('stage'),
    byReason: group('reason'),
    byProduct: [...byProduct.values()].sort((a, b) => b.value - a.value),
    totals: { count: rows.length, value: roundMoney(sumBy(rows, 'value')) },
    truncated: docs.length >= MAX_ROWS,
  };
};

/* ── Date-wise: issue, production, remaining ─────────────────────────────────── */

const dayOf = (field) => ({ $dateToString: { format: '%Y-%m-%d', date: `$${field}`, timezone: BUSINESS_TZ } });
const MAX_DAYS = 400;

/**
 * Day by day: material issued to the floor, what production took out of it, and the
 * value still on the floor (WIP) — a running balance like a bank statement:
 *
 *   WIP opening + issued − returned − consumed by output − scrapped on floor = WIP closing
 *
 * plus, per batch and day, how much was produced and how much of the batch remains.
 * The WIP balance walks back from the lots on the floor now, the same way the stock
 * statements walk back from live stock.
 */
const dailyReport = async (ctx, q) => {
  const range = resolveRange(q);
  const scope = aggregateScope(ctx);
  const days = eachBusinessCalendarDate(range.start, range.end);
  if (days.length > MAX_DAYS) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Choose a period of at most ${MAX_DAYS} days for the date-wise report`);
  }
  const since = { $gte: range.start };
  // Material taken from production stock at receipt never sat in the order's WIP: it was
  // issued and used in one step, so it is shown on its own, not taken off the WIP balance.
  const costFrom = (fromFloor) => ({
    $reduce: {
      input: '$consumption',
      initialValue: 0,
      in: {
        $add: [
          '$$value',
          { $cond: [{ [fromFloor ? '$eq' : '$ne']: ['$$this.source', 'floor'] }, { $ifNull: ['$$this.cost', 0] }, 0] },
        ],
      },
    },
  });

  // Orders from before WIP tracking: what they were issued was consumed the same day.
  const preWipOrders = await ProductionOrder.distinct('_id', { ...scope, wipLots: { $exists: false } });
  const signedCost = { $cond: [{ $eq: ['$kind', 'return'] }, { $multiply: ['$totalCost', -1] }, '$totalCost'] };

  const [issueRows, outputRows, receiptRows, scrapRows, floorRows] = await Promise.all([
    MaterialIssue.aggregate([
      { $match: { ...scope, status: POSTED_MIV, issueDate: since } },
      {
        $group: {
          _id: { day: dayOf('issueDate'), order: '$productionOrderId' },
          issued: { $sum: { $cond: [{ $eq: ['$kind', 'return'] }, 0, '$totalCost'] } },
          returned: { $sum: { $cond: [{ $eq: ['$kind', 'return'] }, '$totalCost', 0] } },
          vouchers: { $sum: { $cond: [{ $eq: ['$kind', 'return'] }, 0, 1] } },
          consumed: { $sum: { $cond: [{ $in: ['$productionOrderId', preWipOrders] }, signedCost, 0] } },
        },
      },
    ]),
    ProductionOutput.aggregate([
      { $match: { ...scope, status: { $ne: 'reversed' }, reportedAt: since } },
      {
        $group: {
          _id: { day: dayOf('reportedAt'), order: '$productionOrderId' },
          produced: { $sum: '$producedQuantity' },
          rejected: { $sum: '$rejectedQuantity' },
          consumed: { $sum: costFrom(false) },
          floorUsed: { $sum: costFrom(true) },
        },
      },
    ]),
    ProductionReceipt.aggregate([
      { $match: { ...scope, receiptDate: since } },
      {
        $group: {
          _id: { day: dayOf('receiptDate'), order: '$productionOrderId' },
          good: { $sum: '$quantity' },
          value: { $sum: '$totalCost' },
        },
      },
    ]),
    ScrapRecord.aggregate([
      { $match: { ...scope, scrapDate: since } },
      {
        $group: {
          _id: { day: dayOf('scrapDate'), order: '$productionOrderId' },
          // A pre-WIP order's scrapped material was already consumed when it was issued.
          floorScrap: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$stage', 'material'] }, { $not: [{ $in: ['$productionOrderId', preWipOrders] }] }] },
                '$totalCost',
                0,
              ],
            },
          },
          scrapValue: { $sum: '$totalCost' },
        },
      },
    ]),
    ProductionOrder.aggregate([
      { $match: { ...scope, 'wipLots.0': { $exists: true } } },
      { $unwind: '$wipLots' },
      {
        $group: { _id: null, value: { $sum: { $multiply: ['$wipLots.quantity', { $ifNull: ['$wipLots.unitCost', 0] }] } } },
      },
    ]),
  ]);

  // Day totals (in period) and the net WIP movement after the period.
  const dayMap = new Map(
    days.map((d) => [
      d,
      {
        date: d,
        issued: 0,
        returned: 0,
        consumed: 0,
        floorUsed: 0,
        floorScrap: 0,
        scrapValue: 0,
        good: 0,
        goodValue: 0,
        produced: 0,
        rejected: 0,
        vouchers: 0,
        batches: new Set(),
      },
    ])
  );
  let afterNet = 0;
  const touch = (rows, apply) =>
    rows.forEach((r) => {
      const { day, order } = r._id;
      if (day > range.endKey) {
        afterNet += apply(null, r);
        return;
      }
      const d = dayMap.get(day);
      if (!d) return;
      apply(d, r);
      if (order) d.batches.add(String(order));
    });
  /* eslint-disable no-param-reassign -- the callbacks fill the day accumulators */
  touch(issueRows, (d, r) => {
    if (d) {
      d.issued += r.issued;
      d.returned += r.returned;
      d.vouchers += r.vouchers;
      d.consumed += r.consumed;
    }
    return r.issued - r.returned - r.consumed;
  });
  touch(outputRows, (d, r) => {
    if (d) {
      d.consumed += r.consumed;
      d.floorUsed += r.floorUsed;
      d.produced += r.produced;
      d.rejected += r.rejected;
    }
    return -r.consumed;
  });
  touch(scrapRows, (d, r) => {
    if (d) {
      d.floorScrap += r.floorScrap;
      d.scrapValue += r.scrapValue;
    }
    return -r.floorScrap;
  });
  touch(receiptRows, (d, r) => {
    if (d) {
      d.good += r.good;
      d.goodValue += r.value;
    }
    return 0;
  });

  /* eslint-enable no-param-reassign */

  const floorNow = roundMoney((floorRows[0] || {}).value || 0);
  const closingWip = roundMoney(floorNow - afterNet);
  const periodNet = [...dayMap.values()].reduce((s, d) => s + d.issued - d.returned - d.consumed - d.floorScrap, 0);
  const openingWip = roundMoney(closingWip - periodNet);
  let balance = openingWip;
  const dayRows = [...dayMap.values()].map((d) => {
    balance = roundMoney(balance + d.issued - d.returned - d.consumed - d.floorScrap);
    return {
      date: d.date,
      batches: d.batches.size,
      vouchers: d.vouchers,
      issued: roundMoney(d.issued),
      returned: roundMoney(d.returned),
      consumed: roundMoney(d.consumed),
      floorUsed: roundMoney(d.floorUsed),
      floorScrap: roundMoney(d.floorScrap),
      wipBalance: balance,
      produced: roundQty(d.produced),
      good: roundQty(d.good),
      rejected: roundQty(d.rejected),
      goodValue: roundMoney(d.goodValue),
      scrapValue: roundMoney(d.scrapValue),
    };
  });

  // Batch × day: issued value, produced, completed, and what remains after each day.
  const cells = new Map();
  const cell = (day, order) => {
    const key = `${day}|${order}`;
    if (!cells.has(key))
      cells.set(key, { day, order, issued: 0, returned: 0, produced: 0, rejected: 0, good: 0, goodValue: 0 });
    return cells.get(key);
  };
  const inPeriod = (r) => r._id.order && r._id.day >= range.startKey && r._id.day <= range.endKey;
  issueRows.filter(inPeriod).forEach((r) => {
    const c = cell(r._id.day, String(r._id.order));
    c.issued += r.issued;
    c.returned += r.returned;
  });
  outputRows.filter(inPeriod).forEach((r) => {
    const c = cell(r._id.day, String(r._id.order));
    c.produced += r.produced;
    c.rejected += r.rejected;
  });
  receiptRows.filter(inPeriod).forEach((r) => {
    const c = cell(r._id.day, String(r._id.order));
    c.good += r.good;
    c.goodValue += r.value;
  });
  const orderIds = [...new Set([...cells.values()].map((c) => c.order))];
  const [orders, goodBefore] = orderIds.length
    ? await Promise.all([
        ProductionOrder.find({ _id: { $in: orderIds } })
          .select('orderNumber orderType productName unit plannedQuantity status')
          .lean(),
        ProductionReceipt.aggregate([
          { $match: { productionOrderId: { $in: orderIds.map(oid) }, receiptDate: { $lt: range.start } } },
          { $group: { _id: '$productionOrderId', good: { $sum: '$quantity' } } },
        ]),
      ])
    : [[], []];
  const orderOf = new Map(orders.map((o) => [String(o._id), o]));
  const cumulative = new Map(goodBefore.map((r) => [String(r._id), r.good]));
  const batchRows = [...cells.values()]
    .filter((c) => orderOf.has(c.order))
    .sort(
      (a, b) =>
        a.day.localeCompare(b.day) || orderOf.get(a.order).orderNumber.localeCompare(orderOf.get(b.order).orderNumber)
    )
    .map((c) => {
      const o = orderOf.get(c.order);
      const cum = roundQty((cumulative.get(c.order) || 0) + c.good);
      cumulative.set(c.order, cum);
      return {
        date: c.day,
        orderId: c.order,
        orderNumber: o.orderNumber,
        orderType: o.orderType || 'production',
        productName: o.productName,
        unit: o.unit,
        planned: roundQty(o.plannedQuantity),
        issued: roundMoney(c.issued - c.returned),
        produced: roundQty(c.produced),
        good: roundQty(c.good),
        rejected: roundQty(c.rejected),
        goodValue: roundMoney(c.goodValue),
        cumulativeGood: cum,
        remaining: Math.max(0, roundQty(o.plannedQuantity - cum)),
      };
    });

  const sum = (k) => roundMoney(sumBy(dayRows, k));
  return {
    report: 'daily',
    period: { startDate: range.startKey, endDate: range.endKey },
    openingWip,
    closingWip,
    days:
      q.hideIdle === 'true' || q.hideIdle === true
        ? dayRows.filter(
            (d) =>
              d.issued || d.returned || d.consumed || d.floorUsed || d.floorScrap || d.produced || d.good || d.scrapValue
          )
        : dayRows,
    batches: batchRows,
    totals: {
      issued: sum('issued'),
      returned: sum('returned'),
      consumed: sum('consumed'),
      floorUsed: sum('floorUsed'),
      floorScrap: sum('floorScrap'),
      goodValue: sum('goodValue'),
      scrapValue: sum('scrapValue'),
      produced: roundQty(sumBy(dayRows, 'produced')),
      good: roundQty(sumBy(dayRows, 'good')),
      activeDays: dayRows.filter((d) => d.issued || d.consumed || d.good).length,
      batchCount: new Set(batchRows.map((b) => b.orderId)).size,
    },
  };
};

/* ── One batch: the full production record ───────────────────────────────────── */

const batchReport = async (ctx, q) => {
  if (!q.productionOrderId) throw new ApiError(httpStatus.BAD_REQUEST, 'Choose a batch (production order)');
  const order = await ProductionOrder.findOne({ ...aggregateScope(ctx), _id: oid(q.productionOrderId) }).lean();
  if (!order) throw new ApiError(httpStatus.NOT_FOUND, 'Production order not found');
  const [issues, outputs, receipts, scraps] = await Promise.all([
    MaterialIssue.find({ productionOrderId: order._id })
      .select('issueNumber kind status issueDate lines totalCost issuedBy reference cancelReason')
      .sort({ issueDate: 1, createdAt: 1 })
      .lean(),
    ProductionOutput.find({ productionOrderId: order._id })
      .select(
        'outputNumber producedQuantity goodQuantity rejectedQuantity rejectDisposition rejectReason status materialCost reportedAt inspectedAt directReceipt notes'
      )
      .sort({ reportedAt: 1 })
      .lean(),
    ProductionReceipt.find({ productionOrderId: order._id })
      .select('receiptNumber quantity unitCost totalCost receiptDate source batchNumber location')
      .sort({ receiptDate: 1, createdAt: 1 })
      .lean(),
    ScrapRecord.find({ productionOrderId: order._id })
      .select('scrapNumber productName unit stage reason quantity totalCost scrapDate notes')
      .sort({ scrapDate: 1 })
      .lean(),
  ]);

  const extras = await extraUsageLines([order._id]);
  const materials = [...(order.materials || []).map((m) => lineUsage(order, m)), ...(extras.get(String(order._id)) || [])];
  const posted = issues.filter(isPostedMiv);
  let net = 0;
  const issueLines = [];
  posted.forEach((v) => {
    const isReturn = v.kind === 'return';
    (v.lines || []).forEach((l, i) => {
      net += isReturn ? -(l.totalCost || 0) : l.totalCost || 0;
      issueLines.push({
        voucherId: String(v._id),
        number: v.issueNumber,
        kind: isReturn ? 'return' : 'issue',
        date: v.issueDate,
        first: i === 0,
        last: i === v.lines.length - 1,
        issuedBy: (v.issuedBy && v.issuedBy.name) || '',
        productName: l.productName,
        unit: l.unit,
        quantity: roundQty(l.quantity),
        unitCost: roundMoney(l.unitCost || 0),
        totalCost: roundMoney(l.totalCost || 0),
        batchNumber: l.batchNumber || '',
        balance: roundMoney(net),
      });
    });
  });

  let cum = 0;
  const receiptRows = receipts.map((r) => {
    cum = roundQty(cum + r.quantity);
    return {
      id: String(r._id),
      number: r.receiptNumber,
      date: r.receiptDate,
      source: r.source,
      quantity: roundQty(r.quantity),
      unitCost: roundMoney(r.unitCost || 0),
      value: roundMoney(r.totalCost || 0),
      batchNumber: r.batchNumber || '',
      cumulative: cum,
      remaining: Math.max(0, roundQty(order.plannedQuantity - cum)),
    };
  });

  const good = roundQty(order.completedQuantity || 0);
  const issuedValue = roundMoney(sumBy(materials, 'issuedValue'));
  const returnedValue = roundMoney(sumBy(materials, 'returnedValue'));
  const usedValue = roundMoney(sumBy(materials, 'usedValue'));
  const wastageValue = roundMoney(sumBy(materials, 'wastageValue'));
  const inFactoryValue = roundMoney(sumBy(materials, 'inFactoryValue'));
  return {
    report: 'batch',
    order: {
      id: String(order._id),
      orderNumber: order.orderNumber,
      batchNumber: order.batchNumber || order.orderNumber,
      orderType: order.orderType || 'production',
      status: order.status,
      priority: order.priority,
      productName: order.productName,
      sku: order.sku || '',
      unit: order.unit,
      bomNumber: order.bomNumber || '',
      bomVersion: order.bomVersion || null,
      operatorName: order.operatorName || '',
      team: (order.team || []).map((m) => m.name).filter(Boolean),
      wipLocation: order.wipLocation || '',
      finishedGoodsLocation: order.finishedGoodsLocation || '',
      createdAt: order.createdAt,
      plannedStartDate: order.plannedStartDate,
      plannedCompletionDate: order.plannedCompletionDate,
      actualStartDate: order.actualStartDate,
      actualCompletionDate: order.actualCompletionDate,
      notes: order.notes || '',
    },
    quantities: {
      planned: roundQty(order.plannedQuantity),
      produced: roundQty(order.producedQuantity || 0),
      good,
      rejected: roundQty(order.rejectedQuantity || 0),
      reworkedGood: roundQty(order.reworkedGoodQuantity || 0),
      scrapped: roundQty(order.scrappedQuantity || 0),
      qcPending: roundQty(order.qcPendingQuantity || 0),
      reworkPending: roundQty(order.reworkPendingQuantity || 0),
      remaining: balanceToMake(order),
      completionPercent:
        order.plannedQuantity > 0 ? Math.min(100, Math.round((good / order.plannedQuantity) * 1000) / 10) : 0,
    },
    costs: {
      issuedValue,
      returnedValue,
      usedValue,
      wastageValue,
      inFactoryValue,
      finishedValue: roundMoney(order.finishedGoodsValue || 0),
      unitCost: good > 0 ? roundMoney((order.finishedGoodsValue || 0) / good) : 0,
      scrapValue: roundMoney(sumBy(scraps, 'totalCost')),
    },
    materials,
    issues: issueLines,
    cancelledVouchers: issues
      .filter((i) => !isPostedMiv(i))
      .map((i) => ({ number: i.issueNumber, reason: i.cancelReason || '' })),
    outputs: outputs.map((o) => ({
      id: String(o._id),
      number: o.outputNumber,
      date: o.reportedAt,
      produced: roundQty(o.producedQuantity),
      good: roundQty(o.goodQuantity || 0),
      rejected: roundQty(o.rejectedQuantity || 0),
      disposition: o.rejectDisposition || null,
      reason: o.rejectReason || '',
      status: o.status,
      materialCost: roundMoney(o.materialCost || 0),
    })),
    receipts: receiptRows,
    scrap: scraps.map((s) => ({
      id: String(s._id),
      number: s.scrapNumber,
      date: s.scrapDate,
      productName: s.productName,
      unit: s.unit,
      stage: s.stage,
      reason: s.reason,
      quantity: roundQty(s.quantity),
      value: roundMoney(s.totalCost || 0),
    })),
    operations: [...(order.operations || [])]
      .sort((a, b) => a.sequence - b.sequence)
      .map((op) => ({
        name: op.name,
        workCenter: op.workCenter || '',
        status: op.status,
        startedAt: op.startedAt,
        completedAt: op.completedAt,
        plannedMinutes: op.plannedMinutes || 0,
        actualMinutes: op.actualMinutes,
        by: op.completedByName || op.startedByName || '',
      })),
  };
};

const REPORTS = {
  production: productionReport,
  'material-issues': materialIssueRegister,
  'material-consumption': materialConsumption,
  'finished-goods': (ctx, q) => stockStatement(ctx, q, 'finished'),
  'raw-materials': (ctx, q) => stockStatement(ctx, q, 'materials'),
  'stock-register': stockRegister,
  'in-process': inProcessReport,
  scrap: scrapReport,
  daily: dailyReport,
  batch: batchReport,
  'batch-stock': batchStockReport,
  'batch-trace': batchTraceReport,
  'product-production': (ctx, q) => productProductionReport(ctx, q, { resolveRange }),
  'stock-sheet': (ctx, q) =>
    stockSheetReport(ctx, q, { resolveRange, MOVEMENT_SOURCES, transferLegs, currentStock, stockUnitCosts }),
  // The same register without the material-by-material columns (total issue only).
  'product-summary': async (ctx, q) => ({
    ...(await productProductionReport(ctx, q, { resolveRange })),
    report: 'product-summary',
  }),
};

const REPORT_KEYS = Object.keys(REPORTS);

const getReport = (ctx, report, query = {}) => {
  const fn = REPORTS[report];
  if (!fn) throw new ApiError(httpStatus.NOT_FOUND, `Unknown report "${report}"`);
  return fn(ctx, query);
};

module.exports = { getReport, REPORT_KEYS, MOVEMENT_KEYS, resolveRange };
