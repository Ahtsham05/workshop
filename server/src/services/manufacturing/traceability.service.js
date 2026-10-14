const mongoose = require('mongoose');
const httpStatus = require('http-status');
const {
  ProductionOrder,
  ProductionReceipt,
  InventoryTransaction,
  Batch,
  Imei,
  Product,
  Supplier,
  Purchase,
} = require('../../models');
const ApiError = require('../../utils/ApiError');
const { roundQty, scopeFilter, escapeRegex } = require('./common');

/*
 * Genealogy, read entirely from records the rest of the system already keeps — nothing is
 * duplicated for traceability:
 *  - what went INTO an order:  InventoryTransaction rows of type production_issue (minus
 *    production_return) with their productId / batchId / imeiIds
 *  - where a batch came from:  Batch.purchaseId + supplierId (bought) or
 *                              Batch.productionOrderId (made here)
 *  - where a serial came from: Imei.purchaseId + supplierId (bought) or
 *                              Imei.producedByOrderId (made here)
 *  - what an order PRODUCED:   ProductionReceipt (batch / serials)
 *  - planned nesting:          ProductionOrder.parentOrderId (untracked sub-assemblies)
 */

const MAX_DEPTH = 8;
const oid = (v) => new mongoose.Types.ObjectId(String(v));

const orderSummary = (o) => ({
  id: String(o._id),
  orderNumber: o.orderNumber,
  orderType: o.orderType || 'production',
  productId: String(o.productId),
  productName: o.productName,
  unit: o.unit,
  plannedQuantity: o.plannedQuantity,
  completedQuantity: o.completedQuantity || 0,
  status: o.status,
  operatorName: o.operatorName || '',
  actualCompletionDate: o.actualCompletionDate || null,
});

const supplierById = async (id) => {
  if (!id) return null;
  const s = await Supplier.findById(id).select('name').lean();
  return s ? { id: String(id), name: s.name } : null;
};

const purchaseSummary = async (id) => {
  if (!id) return null;
  const p = await Purchase.findById(id).select('invoiceNumber purchaseDate supplier').lean();
  return p ? { id: String(p._id), number: p.invoiceNumber, date: p.purchaseDate, supplierId: p.supplier } : null;
};

/** What an order produced into stock: receipts with their batch / serial numbers. */
const producedBy = async (orderId) => {
  const receipts = await ProductionReceipt.find({ productionOrderId: orderId })
    .select('receiptNumber quantity unit batchId batchNumber expiryDate serialNumbers imeiIds receiptDate source')
    .sort({ createdAt: 1 })
    .lean();
  return receipts.map((r) => ({
    receiptId: String(r._id),
    receiptNumber: r.receiptNumber,
    quantity: r.quantity,
    unit: r.unit,
    date: r.receiptDate,
    source: r.source,
    batch: r.batchId ? { id: String(r.batchId), batchNumber: r.batchNumber, expiryDate: r.expiryDate } : null,
    serials: (r.serialNumbers || []).map((number, i) => ({
      id: r.imeiIds && r.imeiIds[i] ? String(r.imeiIds[i]) : null,
      number,
    })),
  }));
};

/**
 * Net material an order drew from stock, grouped per (product, batch) — serial units
 * listed individually. Issues minus returns, straight from the ledger.
 */
const consumedBy = async (orderId) => {
  const rows = await InventoryTransaction.find({
    productionOrderId: orderId,
    type: { $in: ['production_issue', 'production_return'] },
  })
    .select('type productId unit quantityDelta batchId imeiIds serialNumbers')
    .lean();
  const groups = new Map();
  rows.forEach((r) => {
    const key = `${r.productId}:${r.batchId || ''}`;
    const g = groups.get(key) || {
      productId: String(r.productId),
      unit: r.unit,
      batchId: r.batchId ? String(r.batchId) : null,
      quantity: 0,
      serials: new Map(),
    };
    g.quantity += -r.quantityDelta; // issue rows are negative on the available bucket
    (r.imeiIds || []).forEach((id, i) => {
      if (r.type === 'production_issue') g.serials.set(String(id), (r.serialNumbers || [])[i] || String(id));
      else g.serials.delete(String(id));
    });
    groups.set(key, g);
  });
  return [...groups.values()].filter((g) => g.quantity > 1e-9);
};

/**
 * Forward genealogy: an order → the components it consumed → their batches / serials →
 * the supplier (bought) or the order that made them (recursively), plus untracked
 * sub-assemblies supplied by linked child orders.
 */
const traceOrder = async (ctx, orderId, depth = 0, seen = new Set()) => {
  const order = await ProductionOrder.findOne({ _id: orderId, ...scopeFilter(ctx) }).lean();
  if (!order) throw new ApiError(httpStatus.NOT_FOUND, 'Order not found');
  const node = { order: orderSummary(order), produced: await producedBy(order._id), components: [] };
  if (depth >= MAX_DEPTH || seen.has(String(order._id))) {
    node.truncated = true;
    return node;
  }
  seen.add(String(order._id));

  const groups = await consumedBy(order._id);
  const products = await Product.find({ _id: { $in: groups.map((g) => g.productId) } })
    .select('name supplier')
    .lean();
  const productById = new Map(products.map((p) => [String(p._id), p]));
  const childOrders = await ProductionOrder.find({ parentOrderId: order._id }).select('_id productId').lean();

  // eslint-disable-next-line no-restricted-syntax
  for (const g of groups) {
    const product = productById.get(g.productId);
    const component = {
      productId: g.productId,
      productName: product ? product.name : '—',
      unit: g.unit,
      quantity: roundQty(g.quantity),
      batch: null,
      sources: [],
    };

    if (g.batchId) {
      // eslint-disable-next-line no-await-in-loop
      const batch = await Batch.findById(g.batchId).lean();
      if (batch) {
        component.batch = { id: String(batch._id), batchNumber: batch.batchNumber, expiryDate: batch.expiryDate || null };
        if (batch.productionOrderId) {
          component.sources.push({
            kind: 'production',
            order: await traceOrder(ctx, batch.productionOrderId, depth + 1, seen), // eslint-disable-line no-await-in-loop
          });
        } else {
          // eslint-disable-next-line no-await-in-loop
          const purchase = await purchaseSummary(batch.purchaseId);
          component.sources.push({
            kind: 'purchase',
            supplier: await supplierById(batch.supplierId || (purchase && purchase.supplierId)), // eslint-disable-line no-await-in-loop
            purchase,
          });
        }
      }
    }

    if (g.serials.size) {
      // eslint-disable-next-line no-await-in-loop
      const units = await Imei.find({ _id: { $in: [...g.serials.keys()] } })
        .select('imei producedByOrderId purchaseId supplierId supplierName')
        .lean();
      const bySource = new Map();
      units.forEach((u) => {
        const key = u.producedByOrderId ? `o:${u.producedByOrderId}` : `p:${u.purchaseId || ''}:${u.supplierId || ''}`;
        const entry = bySource.get(key) || { unit: u, serials: [] };
        entry.serials.push({ id: String(u._id), number: u.imei });
        bySource.set(key, entry);
      });
      // eslint-disable-next-line no-restricted-syntax
      for (const { unit: u, serials } of bySource.values()) {
        if (u.producedByOrderId) {
          component.sources.push({
            kind: 'production',
            serials,
            order: await traceOrder(ctx, u.producedByOrderId, depth + 1, seen), // eslint-disable-line no-await-in-loop
          });
        } else {
          component.sources.push({
            kind: 'purchase',
            serials,
            supplier: (await supplierById(u.supplierId)) || (u.supplierName ? { id: null, name: u.supplierName } : null), // eslint-disable-line no-await-in-loop
            purchase: await purchaseSummary(u.purchaseId), // eslint-disable-line no-await-in-loop
          });
        }
      }
    }

    if (!g.batchId && !g.serials.size) {
      // Untracked item: an exact lot can't be identified. Show linked sub-assembly orders
      // (planned link) and the product's default supplier as the likely source.
      const children = childOrders.filter((c) => String(c.productId) === g.productId);
      // eslint-disable-next-line no-restricted-syntax
      for (const child of children) {
        component.sources.push({
          kind: 'production',
          linked: true,
          order: await traceOrder(ctx, child._id, depth + 1, seen), // eslint-disable-line no-await-in-loop
        });
      }
      if (!children.length) {
        component.sources.push({
          kind: 'untracked',
          supplier: product ? await supplierById(product.supplier) : null, // eslint-disable-line no-await-in-loop
        });
      }
    }
    node.components.push(component);
  }
  return node;
};

/** Finished unit / batch / receipt → the order that made it → its genealogy. */
const traceFinished = async (ctx, { imeiId, batchId, receiptId }) => {
  let orderId = null;
  let subject = null;
  if (imeiId) {
    const unit = await Imei.findOne({ _id: imeiId, ...scopeFilter(ctx) }).lean();
    if (!unit) throw new ApiError(httpStatus.NOT_FOUND, 'Serial number not found');
    orderId = unit.producedByOrderId;
    subject = { kind: 'serial', id: String(unit._id), label: unit.imei, productName: unit.productName, status: unit.status };
  } else if (batchId) {
    const batch = await Batch.findOne({ _id: batchId, organizationId: ctx.organizationId }).lean();
    if (!batch) throw new ApiError(httpStatus.NOT_FOUND, 'Batch not found');
    orderId = batch.productionOrderId;
    subject = { kind: 'batch', id: String(batch._id), label: batch.batchNumber, quantity: batch.quantity };
  } else if (receiptId) {
    const receipt = await ProductionReceipt.findOne({ _id: receiptId, ...scopeFilter(ctx) }).lean();
    if (!receipt) throw new ApiError(httpStatus.NOT_FOUND, 'Receipt not found');
    orderId = receipt.productionOrderId;
    subject = { kind: 'receipt', id: String(receipt._id), label: receipt.receiptNumber, productName: receipt.productName };
  }
  if (!orderId) {
    return { subject, trace: null, message: 'This item was not produced in-house — it was purchased.' };
  }
  return { subject, trace: await traceOrder(ctx, orderId) };
};

/**
 * Reverse genealogy: a raw-material batch / serial unit / product → every order that drew
 * it from stock → what those orders produced → the orders that consumed THAT, and so on up
 * to the finished products.
 */
const traceWhereUsed = async (ctx, { batchId, imeiId, productId }, depth = 0, seen = new Set()) => {
  const match = { organizationId: oid(ctx.organizationId), type: 'production_issue', productionOrderId: { $exists: true } };
  if (ctx.branchId) match.branchId = oid(ctx.branchId);
  if (batchId) match.batchId = oid(batchId);
  else if (imeiId) match.imeiIds = oid(imeiId);
  else if (productId) match.productId = oid(productId);
  else throw new ApiError(httpStatus.BAD_REQUEST, 'Give a batch, serial number or product to trace');

  const usage = await InventoryTransaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$productionOrderId',
        quantity: { $sum: { $multiply: ['$quantityDelta', -1] } },
        unit: { $first: '$unit' },
      },
    },
  ]);
  const orders = await ProductionOrder.find({ _id: { $in: usage.map((u) => u._id) } }).lean();
  const usageByOrder = new Map(usage.map((u) => [String(u._id), u]));

  return Promise.all(
    orders.map(async (order) => {
      const key = String(order._id);
      const produced = await producedBy(order._id);
      const node = {
        order: orderSummary(order),
        quantityUsed: roundQty(usageByOrder.get(key).quantity),
        unit: usageByOrder.get(key).unit,
        produced,
        usedIn: [],
      };
      if (depth >= MAX_DEPTH || seen.has(key)) {
        node.truncated = true;
        return node;
      }
      seen.add(key);
      // Follow what this order made into whatever consumed it next.
      const next = [];
      const producedBatchIds = [...new Set(produced.filter((r) => r.batch).map((r) => r.batch.id))];
      producedBatchIds.forEach((id) => next.push(traceWhereUsed(ctx, { batchId: id }, depth + 1, seen)));
      const serialIds = produced.flatMap((r) => r.serials.map((s) => s.id)).filter(Boolean);
      if (serialIds.length) {
        next.push(
          (async () => {
            const rows = await InventoryTransaction.find({
              organizationId: ctx.organizationId,
              type: 'production_issue',
              imeiIds: { $in: serialIds.map(oid) },
            })
              .select('productionOrderId')
              .lean();
            const consumerIds = [...new Set(rows.map((r) => String(r.productionOrderId)))];
            const nodes = await Promise.all(consumerIds.map((id) => traceWhereUsedByOrder(ctx, id, order, depth + 1, seen)));
            return nodes.filter(Boolean);
          })()
        );
      }
      // Untracked output: follow the planned link to the parent order it was made for.
      if (!producedBatchIds.length && !serialIds.length && order.parentOrderId) {
        next.push(traceWhereUsedByOrder(ctx, order.parentOrderId, order, depth + 1, seen).then((n) => (n ? [n] : [])));
      }
      node.usedIn = (await Promise.all(next)).flat();
      return node;
    })
  );
};

/** A consuming order reached through serial units or a planned parent link. */
const traceWhereUsedByOrder = async (ctx, consumerId, fromOrder, depth, seen) => {
  const consumer = await ProductionOrder.findOne({ _id: consumerId, organizationId: ctx.organizationId }).lean();
  if (!consumer) return null;
  const usedRows = await InventoryTransaction.find({
    productionOrderId: consumer._id,
    type: 'production_issue',
    productId: fromOrder.productId,
  })
    .select('quantityDelta unit')
    .lean();
  const node = {
    order: orderSummary(consumer),
    quantityUsed: roundQty(usedRows.reduce((s, r) => s - r.quantityDelta, 0)),
    unit: fromOrder.unit,
    produced: await producedBy(consumer._id),
    usedIn: [],
  };
  const key = String(consumer._id);
  if (depth >= MAX_DEPTH || seen.has(key)) {
    node.truncated = true;
    return node;
  }
  seen.add(key);
  const batchIds = [...new Set(node.produced.filter((r) => r.batch).map((r) => r.batch.id))];
  const nested = await Promise.all(batchIds.map((id) => traceWhereUsed(ctx, { batchId: id }, depth + 1, seen)));
  node.usedIn = nested.flat();
  if (!batchIds.length && consumer.parentOrderId) {
    const up = await traceWhereUsedByOrder(ctx, consumer.parentOrderId, consumer, depth + 1, seen);
    if (up) node.usedIn.push(up);
  }
  return node;
};

/** Search box for the traceability page: serial numbers, batch numbers and order numbers. */
const lookup = async (ctx, q) => {
  const term = String(q || '').trim();
  if (term.length < 2) return [];
  const re = new RegExp(`^${escapeRegex(term)}`, 'i');
  const [units, batches, orders] = await Promise.all([
    Imei.find({ ...scopeFilter(ctx), $or: [{ imei: re }, { imei2: re }] })
      .select('imei productName status producedByOrderId')
      .limit(10)
      .lean(),
    Batch.find({ organizationId: ctx.organizationId, batchNumber: re })
      .select('batchNumber quantity productionOrderId purchaseId inventoryId')
      .populate({ path: 'inventoryId', select: 'productId branchId', populate: { path: 'productId', select: 'name' } })
      .limit(10)
      .lean(),
    ProductionOrder.find({ ...scopeFilter(ctx), orderNumber: re })
      .select('orderNumber orderType productName status')
      .limit(10)
      .lean(),
  ]);
  const inBranch = (b) => !ctx.branchId || (b.inventoryId && String(b.inventoryId.branchId) === String(ctx.branchId));
  return [
    ...units.map((u) => ({
      kind: 'serial',
      id: String(u._id),
      label: u.imei,
      productName: u.productName,
      madeHere: !!u.producedByOrderId,
      status: u.status,
    })),
    ...batches.filter(inBranch).map((b) => ({
      kind: 'batch',
      id: String(b._id),
      label: b.batchNumber,
      productName: b.inventoryId && b.inventoryId.productId ? b.inventoryId.productId.name : '',
      madeHere: !!b.productionOrderId,
      quantity: b.quantity,
    })),
    ...orders.map((o) => ({
      kind: 'order',
      id: String(o._id),
      label: o.orderNumber,
      productName: o.productName,
      orderType: o.orderType || 'production',
      status: o.status,
    })),
  ];
};

module.exports = { traceOrder, traceFinished, traceWhereUsed, lookup };
