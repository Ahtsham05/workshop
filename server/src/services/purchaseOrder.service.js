const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { PurchaseOrder } = require('../models');
const ApiError = require('../utils/ApiError');
const purchaseService = require('./purchase.service');
const { applySupplierLinkedListSearch } = require('../utils/listSearchFilter');

const POPULATE_PATHS = [
  { path: 'supplier' },
  { path: 'items.product' },
  { path: 'createdBy', select: 'name email' },
  {
    path: 'receipts.purchase',
    select: 'invoiceNumber totalAmount paidAmount balance paymentType purchaseDate',
  },
  { path: 'receipts.receivedBy', select: 'name email' },
];

const populateOrder = async (order) => {
  if (!order) return order;
  for (const config of POPULATE_PATHS) {
    // eslint-disable-next-line no-await-in-loop
    await order.populate(config);
  }
  return order;
};

let indexesEnsured = false;

/**
 * Migrate from the legacy global orderNumber unique index to a per-org compound index.
 */
const ensurePurchaseOrderIndexes = async () => {
  if (indexesEnsured) return;

  const collection = mongoose.connection.collection('purchaseorders');
  try {
    const indexes = await collection.indexes();
    const hasLegacyUnique = indexes.some(
      (idx) => idx.key?.orderNumber === 1 && idx.unique && !idx.key?.organizationId
    );
    if (hasLegacyUnique) {
      await collection.dropIndex('orderNumber_1');
    }
  } catch (err) {
    if (err.codeName !== 'IndexNotFound') {
      // Non-fatal — syncIndexes below will still create the compound index.
    }
  }

  await PurchaseOrder.syncIndexes();
  indexesEnsured = true;
};

const parseOrderSequence = (orderNumber) => {
  const match = String(orderNumber || '').match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
};

/**
 * Generate a sequential order number per organization using an atomic counter.
 * Format: PO-{seq} starting at 1001.
 */
const generateOrderNumber = async (organizationId) => {
  if (!organizationId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Organization is required to create a purchase order');
  }

  await ensurePurchaseOrderIndexes();

  const db = mongoose.connection.db;
  const seqKey = `purchaseOrder_${organizationId}`;

  const existingCounter = await db.collection('_sequences').findOne({ _id: seqKey });
  if (!existingCounter) {
    const orders = await PurchaseOrder.find({ organizationId }).select('orderNumber').lean();
    let maxSeq = 1000;
    for (const order of orders) {
      maxSeq = Math.max(maxSeq, parseOrderSequence(order.orderNumber));
    }
    await db.collection('_sequences').updateOne(
      { _id: seqKey },
      { $setOnInsert: { seq: maxSeq } },
      { upsert: true }
    );
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const result = await db.collection('_sequences').findOneAndUpdate(
      { _id: seqKey },
      { $inc: { seq: 1 } },
      { returnDocument: 'after' }
    );

    const seq = Number(result?.seq ?? result?.value?.seq);
    if (!Number.isFinite(seq) || seq <= 0) {
      continue;
    }

    const candidate = `PO-${seq}`;
    const exists = await PurchaseOrder.exists({ organizationId, orderNumber: candidate });
    if (!exists) {
      return candidate;
    }
  }

  return `PO-${Date.now()}`;
};

const calculateTotals = (body) => {
  const items = Array.isArray(body.items) ? body.items : [];
  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.expectedPrice || 0),
    0
  );
  const discount = Number(body.discount || 0);
  const tax = Number(body.tax || 0);
  const shippingCost = Number(body.shippingCost || 0);
  const totalAmount = Math.max(0, subtotal - discount + tax + shippingCost);
  return { subtotal, totalAmount };
};

/**
 * Create a new purchase order.
 */
const createPurchaseOrder = async (body) => {
  await ensurePurchaseOrderIndexes();

  const totals = calculateTotals(body);

  const items = (body.items || []).map((item) => ({
    ...item,
    receivedQuantity: 0,
    total: Number(item.total ?? Number(item.quantity || 0) * Number(item.expectedPrice || 0)),
  }));

  const { orderNumber: _ignoredOrderNumber, ...orderBody } = body;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const orderNumber = await generateOrderNumber(body.organizationId);
    try {
      const order = await PurchaseOrder.create({
        ...orderBody,
        items,
        orderNumber,
        subtotal: totals.subtotal,
        totalAmount: totals.totalAmount,
        status: body.status || 'draft',
      });
      return populateOrder(order);
    } catch (err) {
      if (err.code === 11000 && attempt < 4) {
        continue;
      }
      if (err.code === 11000) {
        throw new ApiError(
          httpStatus.CONFLICT,
          'Could not assign a unique order number. Please try again.'
        );
      }
      throw err;
    }
  }

  throw new ApiError(httpStatus.CONFLICT, 'Could not assign a unique order number. Please try again.');
};

/**
 * Query for purchase orders with pagination.
 */
const queryPurchaseOrders = async (filter, options) => {
  const opts = { ...options };
  if (filter.status === 'open') {
    delete filter.status;
    filter.status = { $in: ['draft', 'sent', 'partial'] };
  }

  if (filter.startDate || filter.endDate) {
    const range = {};
    if (filter.startDate) range.$gte = new Date(filter.startDate);
    if (filter.endDate) range.$lte = new Date(filter.endDate);
    filter.orderDate = range;
    delete filter.startDate;
    delete filter.endDate;
  }

  await applySupplierLinkedListSearch(filter, opts, {
    documentFields: ['orderNumber', 'notes'],
  });

  opts.populate = 'supplier,items.product,createdBy,receipts.purchase';
  const result = await PurchaseOrder.paginate(filter, opts);
  return result;
};

const getPurchaseOrderById = async (id) => {
  const order = await PurchaseOrder.findById(id);
  return populateOrder(order);
};

/**
 * Update an existing purchase order.
 * Cannot update once any items have been received (use cancel + new order instead),
 * except for notes/expectedDeliveryDate.
 */
const updatePurchaseOrderById = async (orderId, updateBody) => {
  const order = await PurchaseOrder.findById(orderId);
  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Purchase order not found');
  }
  if (order.status === 'cancelled') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot edit a cancelled purchase order');
  }
  if (order.status === 'completed') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot edit a completed purchase order');
  }

  const hasReceipts = Array.isArray(order.receipts) && order.receipts.length > 0;
  const SAFE_FIELDS = ['notes', 'termsAndConditions', 'expectedDeliveryDate'];
  if (hasReceipts) {
    const offendingFields = Object.keys(updateBody).filter((k) => !SAFE_FIELDS.includes(k));
    if (offendingFields.length > 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Cannot edit items / totals after a partial receipt. Cancel and create a new order instead.'
      );
    }
  }

  if (updateBody.items) {
    const totals = calculateTotals(updateBody);
    updateBody.subtotal = totals.subtotal;
    updateBody.totalAmount = totals.totalAmount;
    updateBody.items = updateBody.items.map((item) => {
      const existing = order.items.find(
        (it) => String(it.product) === String(item.product)
      );
      return {
        ...item,
        receivedQuantity: existing ? existing.receivedQuantity : 0,
        total: Number(item.total ?? Number(item.quantity || 0) * Number(item.expectedPrice || 0)),
      };
    });
  }

  Object.assign(order, updateBody);

  // Re-evaluate status (in case items changed)
  if (order.status !== 'cancelled') {
    order.status = order.computeStatus();
  }

  await order.save();
  return populateOrder(order);
};

/**
 * Mark order as sent (no longer a draft).
 */
const sendPurchaseOrder = async (orderId) => {
  const order = await PurchaseOrder.findById(orderId);
  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Purchase order not found');
  }
  if (order.status !== 'draft') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Only draft orders can be marked as sent');
  }
  order.status = 'sent';
  await order.save();
  return populateOrder(order);
};

/**
 * Cancel a purchase order. Refuses to cancel an order that has receipts.
 */
const cancelPurchaseOrder = async (orderId, { cancellationReason, cancelledBy } = {}) => {
  const order = await PurchaseOrder.findById(orderId);
  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Purchase order not found');
  }
  if (order.status === 'cancelled') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Order is already cancelled');
  }
  if (order.status === 'completed') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot cancel a completed order');
  }
  if (Array.isArray(order.receipts) && order.receipts.length > 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Cannot cancel an order that already has goods received against it. Process returns instead.'
    );
  }

  order.status = 'cancelled';
  order.cancelledAt = new Date();
  order.cancelledBy = cancelledBy;
  order.cancellationReason = cancellationReason || '';
  await order.save();
  return populateOrder(order);
};

/**
 * Delete a purchase order. Only allowed if it's in draft and has no receipts.
 */
const deletePurchaseOrderById = async (orderId) => {
  const order = await PurchaseOrder.findById(orderId);
  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Purchase order not found');
  }
  if (Array.isArray(order.receipts) && order.receipts.length > 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Cannot delete an order with receipts. Cancel it instead.'
    );
  }
  if (order.status !== 'draft' && order.status !== 'cancelled') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Only draft or cancelled orders can be deleted');
  }
  await order.deleteOne();
  return order;
};

/**
 * Record a goods receipt against a purchase order.
 * Creates an underlying Purchase document so stock + ledger update via the
 * existing purchase pipeline. Updates per-item receivedQuantity and the
 * order status.
 *
 * @param {string} orderId
 * @param {object} body  validated body from receiveItems schema
 * @param {object} ctx   { organizationId, branchId, userId }
 */
const receiveItems = async (orderId, body, ctx) => {
  const order = await PurchaseOrder.findById(orderId);
  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Purchase order not found');
  }
  if (order.status === 'cancelled') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot receive items on a cancelled order');
  }
  if (order.status === 'completed') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Order is already fully received');
  }

  const incomingItems = Array.isArray(body.items) ? body.items : [];
  if (incomingItems.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No items provided to receive');
  }

  // Validate each incoming line: must reference an order line, and quantity
  // must not exceed the remaining ordered quantity.
  const orderItemMap = new Map();
  order.items.forEach((it) => orderItemMap.set(String(it.product), it));

  const purchaseItems = [];
  for (const incoming of incomingItems) {
    const orderLine = orderItemMap.get(String(incoming.product));
    if (!orderLine) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Product is not part of this purchase order'
      );
    }
    const remaining =
      Number(orderLine.quantity || 0) - Number(orderLine.receivedQuantity || 0);
    const receiving = Number(incoming.receivedQuantity || 0);
    if (receiving <= 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Received quantity must be greater than 0');
    }
    if (receiving - remaining > 0.000001) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Cannot receive ${receiving} of "${orderLine.productName || ''}" — only ${remaining} remaining on the order`
      );
    }

    purchaseItems.push({
      product: incoming.product,
      quantity: receiving,
      unit: incoming.unit || orderLine.unit,
      conversionFactor: incoming.conversionFactor || orderLine.conversionFactor || 1,
      priceAtPurchase: Number(incoming.priceAtPurchase || 0),
      sellingPriceAtPurchase: incoming.sellingPriceAtPurchase
        ? Number(incoming.sellingPriceAtPurchase)
        : undefined,
      total: Number(receiving) * Number(incoming.priceAtPurchase || 0),
    });
  }

  const purchaseTotal = purchaseItems.reduce((sum, it) => sum + Number(it.total || 0), 0);
  const paidAmount = Number(body.paidAmount || 0);
  const paymentType = body.paymentType || 'Cash';
  const walletType = body.walletType;

  const invoiceNumber = await purchaseService.generateNextPurchaseInvoiceNumber();

  const purchaseBody = {
    organizationId: ctx.organizationId || order.organizationId,
    branchId: ctx.branchId || order.branchId,
    createdBy: ctx.userId,
    supplier: order.supplier,
    purchaseOrder: order._id,
    invoiceNumber,
    items: purchaseItems,
    purchaseDate: body.receivedAt ? new Date(body.receivedAt) : new Date(),
    totalAmount: purchaseTotal,
    paidAmount,
    balance: Math.max(0, purchaseTotal - paidAmount),
    paymentType,
    walletType: paymentType === 'Wallet' ? walletType : undefined,
    notes: body.notes || `Goods received against PO ${order.orderNumber}`,
  };

  const purchase = await purchaseService.createPurchase(purchaseBody);

  // Apply receipt to order doc
  for (const incoming of incomingItems) {
    const orderLine = order.items.find(
      (it) => String(it.product) === String(incoming.product)
    );
    if (orderLine) {
      orderLine.receivedQuantity =
        Number(orderLine.receivedQuantity || 0) + Number(incoming.receivedQuantity || 0);
    }
  }

  order.receipts.push({
    purchase: purchase._id,
    purchaseInvoiceNumber: purchase.invoiceNumber,
    receivedAt: purchaseBody.purchaseDate,
    receivedBy: ctx.userId,
    items: incomingItems.map((it) => ({
      product: it.product,
      receivedQuantity: Number(it.receivedQuantity || 0),
      priceAtPurchase: Number(it.priceAtPurchase || 0),
      sellingPriceAtPurchase: it.sellingPriceAtPurchase
        ? Number(it.sellingPriceAtPurchase)
        : undefined,
      unit: it.unit,
      conversionFactor: it.conversionFactor || 1,
      notes: it.notes,
    })),
    notes: body.notes,
  });

  order.status = order.computeStatus();
  await order.save();

  const populatedOrder = await populateOrder(order);
  const populatedPurchase = await purchaseService.getPurchaseById(purchase._id);

  return { order: populatedOrder, purchase: populatedPurchase };
};

/**
 * Aggregate stats for the current branch — used to power the dashboard cards.
 */
const toAggregateObjectId = (value) => {
  if (!value) return undefined;
  return mongoose.Types.ObjectId.isValid(value)
    ? new mongoose.Types.ObjectId(String(value))
    : value;
};

const getStats = async (filter = {}) => {
  const baseMatch = {};
  const organizationId = toAggregateObjectId(filter.organizationId);
  const branchId = toAggregateObjectId(filter.branchId);
  if (organizationId) baseMatch.organizationId = organizationId;
  if (branchId) baseMatch.branchId = branchId;

  const [byStatus, byValue] = await Promise.all([
    PurchaseOrder.aggregate([
      { $match: baseMatch },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    PurchaseOrder.aggregate([
      { $match: { ...baseMatch, status: { $in: ['draft', 'sent', 'partial'] } } },
      { $group: { _id: null, totalValue: { $sum: '$totalAmount' } } },
    ]),
  ]);

  const counts = byStatus.reduce(
    (acc, row) => {
      acc[row._id] = row.count;
      acc.total += row.count;
      return acc;
    },
    { total: 0, draft: 0, sent: 0, partial: 0, completed: 0, cancelled: 0 }
  );

  return {
    counts,
    openValue: byValue[0]?.totalValue || 0,
  };
};

module.exports = {
  createPurchaseOrder,
  queryPurchaseOrders,
  getPurchaseOrderById,
  updatePurchaseOrderById,
  sendPurchaseOrder,
  cancelPurchaseOrder,
  deletePurchaseOrderById,
  receiveItems,
  getStats,
  generateOrderNumber,
};
