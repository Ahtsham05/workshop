const mongoose = require('mongoose');
const httpStatus = require('http-status');
const {
  Batch,
  Inventory,
  Product,
  ProductionOrder,
  ProductionReceipt,
  MaterialIssue,
  ScrapRecord,
  Supplier,
  Purchase,
  Invoice,
  InventoryTransaction,
  InventoryTransfer,
  SalesReturn,
  PurchaseReturn,
  PackingVoucher,
} = require('../../models');
const ApiError = require('../../utils/ApiError');
const { SOLD_INVOICE_MATCH } = require('../productAnalytics.service');
const traceability = require('./traceability.service');
const { roundQty, roundMoney, aggregateScope, escapeRegex, startOfBusinessToday, daysUntil } = require('./common');

/*
 * Batch (lot) reports: what every batch holds today with its expiry, and one batch's full
 * story — where it came from, every movement in and out with a running balance, the
 * materials (and their batches) it was made from, the production orders it went into
 * and the customers it was sold to.
 */

const EPS = 1e-6;
const DAY_MS = 86400000;
const MAX_ROWS = 5000;
const SOON_DAYS = 30;
const FINISHED_TYPES = ['finished_good', 'sub_assembly', 'by_product'];
const MATERIAL_TYPES = ['raw_material', 'component', 'packaging_material'];
const oid = (v) => new mongoose.Types.ObjectId(String(v));

/** Where a batch came from: the order that made it, the supplier it was bought from, or opening stock. */
const sourcesOf = async (batches) => {
  const orderIds = [
    ...new Set(
      batches
        .map((b) => b.productionOrderId)
        .filter(Boolean)
        .map(String)
    ),
  ];
  const supplierIds = [
    ...new Set(
      batches
        .map((b) => b.supplierId)
        .filter(Boolean)
        .map(String)
    ),
  ];
  const purchaseIds = [
    ...new Set(
      batches
        .map((b) => b.purchaseId)
        .filter(Boolean)
        .map(String)
    ),
  ];
  const [orders, suppliers, purchases] = await Promise.all([
    orderIds.length
      ? ProductionOrder.find({ _id: { $in: orderIds } })
          .select('orderNumber')
          .lean()
      : [],
    supplierIds.length
      ? Supplier.find({ _id: { $in: supplierIds } })
          .select('name')
          .lean()
      : [],
    purchaseIds.length
      ? Purchase.find({ _id: { $in: purchaseIds } })
          .select('invoiceNumber supplier')
          .lean()
      : [],
  ]);
  const extraSuppliers = purchases.map((p) => String(p.supplier)).filter((id) => id && !supplierIds.includes(id));
  if (extraSuppliers.length)
    suppliers.push(
      ...(await Supplier.find({ _id: { $in: extraSuppliers } })
        .select('name')
        .lean())
    );
  const orderById = new Map(orders.map((o) => [String(o._id), o]));
  const supplierById = new Map(suppliers.map((s) => [String(s._id), s]));
  const purchaseById = new Map(purchases.map((p) => [String(p._id), p]));
  return (b) => {
    const order = b.productionOrderId && orderById.get(String(b.productionOrderId));
    if (order) return { kind: 'production', id: String(order._id), label: order.orderNumber, party: '' };
    const purchase = b.purchaseId && purchaseById.get(String(b.purchaseId));
    const supplier = supplierById.get(String(b.supplierId || (purchase && purchase.supplier) || ''));
    if (purchase || supplier) {
      return {
        kind: 'purchase',
        id: purchase ? String(purchase._id) : null,
        label: purchase ? purchase.invoiceNumber : '',
        party: supplier ? supplier.name : '',
      };
    }
    return { kind: /^OPENING/i.test(b.batchNumber) ? 'opening' : 'other', id: null, label: '', party: '' };
  };
};

const stateOf = (b, days) => {
  if (b.status === 'written_off') return 'written_off';
  if (b.quantity <= EPS) return 'depleted';
  if (days === null) return 'no_expiry';
  if (days < 0) return 'expired';
  if (days <= SOON_DAYS) return 'expiring';
  return 'ok';
};

/* ── Batch-wise stock & expiry ─────────────────────────────────────────────── */

/**
 * Every batch in the branch as of now: product, source, manufacture / expiry date, days
 * left, quantity and value. `kind` finished | materials | all, `expiry` all | expired |
 * 30 | 60 | 90 (expiring within N days, expired included), `stock` in | all.
 */
const batchStockReport = async (ctx, q) => {
  const inventories = await Inventory.find(aggregateScope(ctx)).select('_id productId').lean();
  const productIds = [...new Set(inventories.map((i) => String(i.productId)))];
  const productMatch = { _id: { $in: productIds.map(oid) } };
  if (q.kind === 'finished') productMatch.productType = { $in: FINISHED_TYPES };
  if (q.kind === 'materials') productMatch.productType = { $in: MATERIAL_TYPES };
  if (q.productId) productMatch._id = oid(q.productId);
  const products = await Product.find(productMatch).select('name sku unit productType').lean();
  const productById = new Map(products.map((p) => [String(p._id), p]));
  const productOfInventory = new Map(
    inventories.filter((i) => productById.has(String(i.productId))).map((i) => [String(i._id), String(i.productId)])
  );

  const match = { inventoryId: { $in: [...productOfInventory.keys()].map(oid) } };
  if (q.stock !== 'all') Object.assign(match, { quantity: { $gt: EPS }, status: 'active' });
  const now = Date.now();
  const today = startOfBusinessToday();
  const days = Number(q.expiry);
  if (q.expiry === 'expired') match.expiryDate = { $ne: null, $lt: new Date(today) };
  // Within N days = through the end of the Nth day from today (expired ones included).
  else if (days > 0) match.expiryDate = { $ne: null, $lt: new Date(today + (days + 1) * DAY_MS) };
  if (q.search) {
    const re = new RegExp(escapeRegex(q.search), 'i');
    const named = products.filter((p) => re.test(p.name) || re.test(p.sku || '')).map((p) => String(p._id));
    const invIds = [...productOfInventory.entries()].filter(([, pid]) => named.includes(pid)).map(([id]) => oid(id));
    match.$or = [{ batchNumber: re }, { inventoryId: { $in: invIds } }];
  }
  const batches = await Batch.find(match)
    .select(
      'inventoryId batchNumber quantity costPerUnit manufactureDate expiryDate status productionOrderId supplierId purchaseId createdAt'
    )
    .limit(MAX_ROWS)
    .lean();
  const sourceOf = await sourcesOf(batches);

  const rows = batches
    .map((b) => {
      const product = productById.get(productOfInventory.get(String(b.inventoryId)));
      const daysToExpiry = daysUntil(b.expiryDate, today);
      const made = b.manufactureDate || b.createdAt;
      const quantity = roundQty(b.quantity);
      return {
        id: String(b._id),
        productId: String(product._id),
        productName: product.name,
        sku: product.sku || '',
        productType: product.productType || null,
        unit: product.unit,
        batchNumber: b.batchNumber,
        source: sourceOf(b),
        manufactureDate: b.manufactureDate || null,
        receivedDate: b.createdAt,
        expiryDate: b.expiryDate || null,
        daysToExpiry,
        ageDays: made ? Math.max(0, Math.floor((now - new Date(made).getTime()) / DAY_MS)) : null,
        quantity,
        unitCost: roundMoney(b.costPerUnit || 0),
        value: roundMoney(Math.max(0, quantity) * (b.costPerUnit || 0)),
        state: stateOf(b, daysToExpiry),
      };
    })
    .sort(
      (a, b) =>
        a.productName.localeCompare(b.productName) ||
        (a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity) -
          (b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity) ||
        new Date(a.receivedDate) - new Date(b.receivedDate)
    );

  const byProduct = new Map();
  rows.forEach((r) => {
    const g = byProduct.get(r.productId) || {
      productId: r.productId,
      productName: r.productName,
      sku: r.sku,
      unit: r.unit,
      productType: r.productType,
      batches: 0,
      quantity: 0,
      value: 0,
      expiredQuantity: 0,
      nearestExpiry: null,
    };
    g.batches += 1;
    g.quantity = roundQty(g.quantity + r.quantity);
    g.value = roundMoney(g.value + r.value);
    if (r.state === 'expired') g.expiredQuantity = roundQty(g.expiredQuantity + r.quantity);
    if (r.expiryDate && r.quantity > EPS && (!g.nearestExpiry || r.expiryDate < g.nearestExpiry))
      g.nearestExpiry = r.expiryDate;
    byProduct.set(r.productId, g);
  });
  const sumWhere = (pred) => roundMoney(rows.filter(pred).reduce((s, r) => s + r.value, 0));
  return {
    report: 'batch-stock',
    asOf: new Date(),
    soonDays: SOON_DAYS,
    rows,
    byProduct: [...byProduct.values()],
    totals: {
      batches: rows.length,
      products: byProduct.size,
      value: sumWhere(() => true),
      expiredCount: rows.filter((r) => r.state === 'expired').length,
      expiredValue: sumWhere((r) => r.state === 'expired'),
      expiringCount: rows.filter((r) => r.state === 'expiring').length,
      expiringValue: sumWhere((r) => r.state === 'expiring'),
    },
    truncated: batches.length >= MAX_ROWS,
  };
};

/* ── One batch: ledger + genealogy ─────────────────────────────────────────── */

const MOVE_LABELS = {
  purchase: 'Purchased',
  sale: 'Sold',
  return_in: 'Sales return',
  return_out: 'Returned to supplier',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
  adjustment: 'Adjustment',
  expiry_writeoff: 'Written off (expiry)',
  damage: 'Damaged',
  theft: 'Theft / loss',
  production_issue: 'Issued to production',
  production_return: 'Returned from production',
  production_receipt: 'Produced',
  production_scrap: 'Scrapped',
  packing_out: 'Packed (used)',
  packing_in: 'Packed',
};

/** Document number + party for each ledger row, looked up in bulk per document type. */
const describeRefs = async (rows, batch) => {
  const idsOf = (...types) => [
    ...new Set(rows.filter((r) => types.includes(r.refType) && r.refId).map((r) => String(r.refId))),
  ];
  const [invoices, issues, receipts, scraps, transfers, salesReturns, purchaseReturns, purchases, packings] = await Promise.all([
    Invoice.find({ _id: { $in: idsOf('Invoice') } })
      .select('invoiceNumber customerName walkInCustomerName')
      .lean(),
    MaterialIssue.find({ _id: { $in: idsOf('MaterialIssue', 'MaterialReturn', 'MaterialIssueReversal') } })
      .select('issueNumber orderNumber')
      .lean(),
    ProductionReceipt.find({ _id: { $in: idsOf('ProductionReceipt') } })
      .select('receiptNumber orderNumber')
      .lean(),
    ScrapRecord.find({ _id: { $in: idsOf('ScrapRecord') } })
      .select('scrapNumber orderNumber')
      .lean(),
    InventoryTransfer.find({ _id: { $in: idsOf('InventoryTransfer') } })
      .select('transferNumber')
      .lean(),
    SalesReturn.find({ _id: { $in: idsOf('SalesReturn') } })
      .select('returnNumber customerName')
      .lean(),
    PurchaseReturn.find({ _id: { $in: idsOf('PurchaseReturn') } })
      .select('returnNumber')
      .lean(),
    batch.purchaseId
      ? Purchase.find({ _id: batch.purchaseId }).select('invoiceNumber supplier').populate('supplier', 'name').lean()
      : [],
    PackingVoucher.find({ _id: { $in: idsOf('PackingVoucher', 'PackingVoucherReversal') } })
      .select('voucherNumber orderNumber productName')
      .lean(),
  ]);
  const map = new Map();
  invoices.forEach((d) =>
    map.set(String(d._id), { number: d.invoiceNumber, party: d.customerName || d.walkInCustomerName || '' })
  );
  issues.forEach((d) => map.set(String(d._id), { number: d.issueNumber, party: d.orderNumber || '' }));
  receipts.forEach((d) => map.set(String(d._id), { number: d.receiptNumber, party: d.orderNumber || '' }));
  scraps.forEach((d) => map.set(String(d._id), { number: d.scrapNumber, party: d.orderNumber || '' }));
  transfers.forEach((d) => map.set(String(d._id), { number: d.transferNumber || '', party: '' }));
  salesReturns.forEach((d) => map.set(String(d._id), { number: d.returnNumber, party: d.customerName || '' }));
  purchaseReturns.forEach((d) => map.set(String(d._id), { number: d.returnNumber, party: '' }));
  packings.forEach((d) => map.set(String(d._id), { number: d.voucherNumber, party: d.orderNumber || d.productName || '' }));
  const purchase = purchases[0];
  return (r) => {
    if (r.refType === 'Batch') {
      // Purchase-side rows point at the batch itself; the batch knows its purchase.
      return purchase && r.type === 'purchase'
        ? { number: purchase.invoiceNumber, party: (purchase.supplier && purchase.supplier.name) || '' }
        : { number: '', party: '' };
    }
    return map.get(String(r.refId)) || { number: '', party: '' };
  };
};

/** How much of this batch an invoice's line(s) took: a single picked batch or a split. */
const invoiceQuantityFor = (invoice, batchId) =>
  (invoice.items || []).reduce((sum, item) => {
    const split = (item.batchAllocations || []).filter((a) => String(a.batchId) === batchId);
    if (split.length) return sum + split.reduce((s, a) => s + (Number(a.quantity) || 0), 0);
    if (String(item.batchId || '') === batchId && !(item.batchAllocations || []).length) {
      return sum + (Number(item.stockQuantity ?? item.quantity) || 0);
    }
    return sum;
  }, 0);

/** Flattens an order's genealogy one level: each material, its batch and where that came from. */
const materialsOf = (node) =>
  (node.components || []).map((c) => ({
    productId: c.productId,
    productName: c.productName,
    unit: c.unit,
    quantity: c.quantity,
    batchId: c.batch ? c.batch.id : null,
    batchNumber: c.batch ? c.batch.batchNumber : '',
    expiryDate: c.batch ? c.batch.expiryDate : null,
    sources: (c.sources || []).map((s) =>
      s.kind === 'production'
        ? { kind: 'production', label: s.order ? s.order.order.orderNumber : '', orderId: s.order ? s.order.order.id : null }
        : s.kind === 'purchase'
        ? {
            kind: 'purchase',
            label: [s.supplier && s.supplier.name, s.purchase && s.purchase.number].filter(Boolean).join(' · '),
          }
        : { kind: 'untracked', label: s.supplier ? s.supplier.name : '' }
    ),
  }));

const batchTraceReport = async (ctx, q) => {
  if (!q.batchId) throw new ApiError(httpStatus.BAD_REQUEST, 'Choose a batch');
  const batch = await Batch.findOne({ _id: oid(q.batchId), organizationId: oid(ctx.organizationId) }).lean();
  const inventory = batch && (await Inventory.findById(batch.inventoryId).select('productId branchId').lean());
  if (!batch || !inventory || (ctx.branchId && String(inventory.branchId) !== String(ctx.branchId))) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Batch not found in this branch');
  }
  // A deleted product leaves its inventory and batches behind; the lot's history still reads.
  const product = (await Product.findById(inventory.productId).select('name sku unit productType shelfLifeDays').lean()) || {
    _id: inventory.productId,
    name: 'Deleted product',
    unit: '',
  };
  const batchId = String(batch._id);

  // Every available-stock movement of the batch. Older purchase-side rows name the batch
  // as their reference instead of in batchId; older sales rows name neither — those come
  // from the invoices themselves.
  const ledger = await InventoryTransaction.find({
    $or: [{ batchId: batch._id }, { refType: 'Batch', refId: batch._id }],
    stockBucket: { $nin: ['wip', 'qc', 'rework'] },
  })
    .select('type quantityDelta unitCost refType refId productionOrderId createdAt createdBy')
    .sort({ createdAt: 1, _id: 1 })
    .lean();
  const linkedInvoices = new Set(ledger.filter((r) => r.refType === 'Invoice').map((r) => String(r.refId)));
  const invoices = await Invoice.find({
    organizationId: oid(ctx.organizationId),
    ...SOLD_INVOICE_MATCH,
    $or: [{ 'items.batchId': batch._id }, { 'items.batchAllocations.batchId': batch._id }],
  })
    .select(
      'invoiceNumber invoiceDate customerName walkInCustomerName items.batchId items.batchAllocations items.quantity items.stockQuantity'
    )
    .lean();
  invoices
    .filter((inv) => !linkedInvoices.has(String(inv._id)))
    .forEach((inv) => {
      const qty = invoiceQuantityFor(inv, batchId);
      if (qty > EPS) {
        ledger.push({ type: 'sale', quantityDelta: -qty, refType: 'Invoice', refId: inv._id, createdAt: inv.invoiceDate });
      }
    });
  ledger.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  const describe = await describeRefs(ledger, batch);
  const moved = roundQty(ledger.reduce((s, r) => s + r.quantityDelta, 0));
  // Whatever the itemised movements don't explain (stock that predates batch links,
  // transfers or adjustments written without them) — shown, never silently absorbed.
  const unexplained = roundQty(batch.quantity - moved);
  let balance = 0;
  const movements = [];
  if (Math.abs(unexplained) > EPS) {
    balance = unexplained;
    movements.push({
      date: batch.createdAt,
      type: 'opening',
      label: 'Opening / not itemised',
      number: '',
      party: '',
      quantityIn: unexplained > 0 ? unexplained : 0,
      quantityOut: unexplained < 0 ? -unexplained : 0,
      balance: roundQty(balance),
    });
  }
  ledger.forEach((r) => {
    balance += r.quantityDelta;
    const ref = describe(r);
    movements.push({
      date: r.createdAt,
      type: r.type,
      label: MOVE_LABELS[r.type] || r.type,
      number: ref.number,
      party: ref.party,
      refType: r.refType || '',
      refId: r.refId ? String(r.refId) : null,
      orderId: r.productionOrderId ? String(r.productionOrderId) : null,
      quantityIn: r.quantityDelta > 0 ? roundQty(r.quantityDelta) : 0,
      quantityOut: r.quantityDelta < 0 ? roundQty(-r.quantityDelta) : 0,
      balance: roundQty(balance),
    });
  });

  const sumType = (types, sign) =>
    roundQty(
      ledger.filter((r) => types.includes(r.type)).reduce((s, r) => s + (sign > 0 ? r.quantityDelta : -r.quantityDelta), 0)
    );
  const summary = {
    received: roundQty(sumType(['purchase', 'production_receipt', 'packing_in'], 1) + Math.max(0, unexplained)),
    // Packing draws bulk / packing material out of the batch the same way an issue does.
    issuedToProduction: roundQty(sumType(['production_issue', 'production_return', 'packing_out'], -1)),
    sold: roundQty(sumType(['sale', 'return_in'], -1)),
    scrapped: roundQty(sumType(['production_scrap', 'expiry_writeoff', 'damage', 'theft'], -1)),
    other: roundQty(sumType(['adjustment', 'transfer_in', 'transfer_out', 'return_out'], 1) + Math.min(0, unexplained)),
    balance: roundQty(batch.quantity),
  };

  // Made from: the order(s) that produced into this batch → what they drew from stock.
  const receiptOrderIds = await ProductionReceipt.distinct('productionOrderId', { batchId: batch._id });
  const orderIds = [
    ...new Set([...receiptOrderIds.map(String), ...(batch.productionOrderId ? [String(batch.productionOrderId)] : [])]),
  ];
  const madeFrom = await Promise.all(
    orderIds.map(async (id) => {
      const node = await traceability.traceOrder(ctx, id).catch(() => null);
      if (!node) return null;
      const receivedHere = (node.produced || [])
        .filter((r) => r.batch && r.batch.id === batchId)
        .reduce((s, r) => s + r.quantity, 0);
      return {
        orderId: node.order.id,
        orderNumber: node.order.orderNumber,
        productName: node.order.productName,
        unit: node.order.unit,
        plannedQuantity: node.order.plannedQuantity,
        completedQuantity: node.order.completedQuantity,
        receivedIntoBatch: roundQty(receivedHere),
        status: node.order.status,
        materials: materialsOf(node),
      };
    })
  );

  // Used in: production orders that drew this batch, and the batches they made.
  const usage = await traceability.traceWhereUsed(ctx, { batchId });
  const usedIn = usage.map((n) => ({
    orderId: n.order.id,
    orderNumber: n.order.orderNumber,
    productName: n.order.productName,
    status: n.order.status,
    quantityUsed: n.quantityUsed,
    unit: n.unit,
    produced: (n.produced || []).map((r) => ({
      receiptNumber: r.receiptNumber,
      quantity: r.quantity,
      unit: r.unit,
      date: r.date,
      batchId: r.batch ? r.batch.id : null,
      batchNumber: r.batch ? r.batch.batchNumber : '',
    })),
  }));

  // Sold to: one line per invoice (net of returns booked against the same invoice).
  const soldMap = new Map();
  movements
    .filter((m) => m.refType === 'Invoice')
    .forEach((m) => {
      const g = soldMap.get(m.refId) || {
        invoiceId: m.refId,
        number: m.number,
        customer: m.party,
        date: m.date,
        quantity: 0,
      };
      g.quantity = roundQty(g.quantity + m.quantityOut - m.quantityIn);
      soldMap.set(m.refId, g);
    });

  const sourceOf = await sourcesOf([batch]);
  const daysToExpiry = daysUntil(batch.expiryDate);
  return {
    report: 'batch-trace',
    batch: {
      id: batchId,
      batchNumber: batch.batchNumber,
      productId: String(product._id),
      productName: product.name,
      sku: product.sku || '',
      unit: product.unit,
      productType: product.productType || null,
      quantity: roundQty(batch.quantity),
      unitCost: roundMoney(batch.costPerUnit || 0),
      value: roundMoney(Math.max(0, batch.quantity) * (batch.costPerUnit || 0)),
      manufactureDate: batch.manufactureDate || null,
      receivedDate: batch.createdAt,
      expiryDate: batch.expiryDate || null,
      daysToExpiry,
      state: stateOf(batch, daysToExpiry),
      source: sourceOf(batch),
    },
    summary,
    movements,
    madeFrom: madeFrom.filter(Boolean),
    usedIn,
    soldTo: [...soldMap.values()].filter((s) => Math.abs(s.quantity) > EPS),
  };
};

/** Batches matching a number / product name, for the report's batch picker. */
const searchBatches = async (ctx, q) => {
  const inventories = await Inventory.find(aggregateScope(ctx)).select('_id productId').lean();
  const match = { inventoryId: { $in: inventories.map((i) => i._id) } };
  const term = String(q.search || '').trim();
  const products = await Product.find({
    _id: { $in: [...new Set(inventories.map((i) => String(i.productId)))].map(oid) },
    ...(term ? { $or: [{ name: new RegExp(escapeRegex(term), 'i') }, { sku: new RegExp(escapeRegex(term), 'i') }] } : {}),
  })
    .select('name unit')
    .lean();
  const productById = new Map(products.map((p) => [String(p._id), p]));
  const productOfInventory = new Map(inventories.map((i) => [String(i._id), String(i.productId)]));
  if (term) {
    const re = new RegExp(escapeRegex(term), 'i');
    const invIds = inventories.filter((i) => productById.has(String(i.productId))).map((i) => i._id);
    match.$or = [{ batchNumber: re }, { inventoryId: { $in: invIds } }];
  }
  const batches = await Batch.find(match)
    .select('inventoryId batchNumber quantity expiryDate createdAt')
    .sort({ createdAt: -1 })
    .limit(term ? 100 : 300)
    .lean();
  const missing = batches
    .map((b) => productOfInventory.get(String(b.inventoryId)))
    .filter((id) => id && !productById.has(id));
  if (missing.length) {
    (
      await Product.find({ _id: { $in: missing } })
        .select('name unit')
        .lean()
    ).forEach((p) => productById.set(String(p._id), p));
  }
  // Lots of a deleted product are left out of the picker.
  return batches
    .filter((b) => productById.has(productOfInventory.get(String(b.inventoryId))))
    .map((b) => {
      const p = productById.get(productOfInventory.get(String(b.inventoryId)));
      return {
        id: String(b._id),
        batchNumber: b.batchNumber,
        productName: p.name || '',
        unit: p.unit || '',
        quantity: roundQty(b.quantity),
        expiryDate: b.expiryDate || null,
      };
    });
};

module.exports = { batchStockReport, batchTraceReport, searchBatches };
