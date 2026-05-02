const crypto = require('crypto');
const mongoose = require('mongoose');
const httpStatus = require('http-status');
const {
  RestaurantFloor,
  RestaurantTable,
  RestaurantOrder,
  RestaurantReservation,
  Product,
  Branch,
  Organization,
  Customer,
} = require('../models');
const ApiError = require('../utils/ApiError');

const generateOrderNumber = () => {
  const t = Date.now().toString(36).toUpperCase();
  const r = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `R-${t}-${r}`;
};

const computeOrderTotals = (lines, { taxAmount = 0, discountAmount = 0, serviceChargeAmount = 0 } = {}) => {
  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const total = Math.max(0, subtotal + taxAmount + serviceChargeAmount - discountAmount);
  return { subtotal, total };
};

const ensureBranch = (req) => {
  if (!req.branchId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Branch ID is required (x-branch-id header)');
  }
};

const normalizePhoneDigits = (input) => String(input || '').replace(/\D/g, '');

/** Match stored phone to query digits (handles formatting differences). */
const phoneDigitsMatch = (storedDigits, queryDigits) => {
  if (!queryDigits || queryDigits.length < 7 || !storedDigits) return false;
  if (storedDigits === queryDigits) return true;
  if (storedDigits.endsWith(queryDigits) || queryDigits.endsWith(storedDigits)) return true;
  const tail = queryDigits.slice(-10);
  const sTail = storedDigits.slice(-10);
  return tail.length >= 8 && tail === sTail;
};

const resolveDeliveryPhoneFromBody = (body) => {
  const explicit = normalizePhoneDigits(body.deliveryPhone);
  if (explicit.length >= 7) return explicit;
  const fromLabel = normalizePhoneDigits(body.customerName || '');
  return fromLabel.length >= 7 ? fromLabel : '';
};

const createFloor = async (payload, req) => {
  ensureBranch(req);
  return RestaurantFloor.create({
    ...payload,
    organizationId: req.organizationId,
    branchId: req.branchId,
  });
};

const queryFloors = async (req) => {
  ensureBranch(req);
  return RestaurantFloor.find({ branchId: req.branchId }).sort({ sortOrder: 1, name: 1 });
};

const updateFloor = async (floorId, body, req) => {
  ensureBranch(req);
  const floor = await RestaurantFloor.findOne({ _id: floorId, branchId: req.branchId });
  if (!floor) throw new ApiError(httpStatus.NOT_FOUND, 'Floor not found');
  Object.assign(floor, body);
  await floor.save();
  return floor;
};

const deleteFloor = async (floorId, req) => {
  ensureBranch(req);
  const count = await RestaurantTable.countDocuments({ floorId, branchId: req.branchId });
  if (count > 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Remove or move tables before deleting this floor');
  }
  const floor = await RestaurantFloor.findOneAndDelete({ _id: floorId, branchId: req.branchId });
  if (!floor) throw new ApiError(httpStatus.NOT_FOUND, 'Floor not found');
};

const createTable = async (payload, req) => {
  ensureBranch(req);
  const floor = await RestaurantFloor.findOne({ _id: payload.floorId, branchId: req.branchId });
  if (!floor) throw new ApiError(httpStatus.BAD_REQUEST, 'Floor not found for this branch');
  return RestaurantTable.create({
    ...payload,
    organizationId: req.organizationId,
    branchId: req.branchId,
  });
};

const queryTables = async (query, req) => {
  ensureBranch(req);
  const filter = { branchId: req.branchId };
  if (query.floorId) filter.floorId = query.floorId;
  return RestaurantTable.find(filter).populate('floorId', 'name sortOrder').sort({ createdAt: 1 });
};

const updateTable = async (tableId, body, req) => {
  ensureBranch(req);
  if (body.floorId) {
    const floor = await RestaurantFloor.findOne({ _id: body.floorId, branchId: req.branchId });
    if (!floor) throw new ApiError(httpStatus.BAD_REQUEST, 'Floor not found');
  }
  const table = await RestaurantTable.findOne({ _id: tableId, branchId: req.branchId });
  if (!table) throw new ApiError(httpStatus.NOT_FOUND, 'Table not found');
  Object.assign(table, body);
  await table.save();
  return table.populate('floorId', 'name sortOrder');
};

const regenerateTableQr = async (tableId, req) => {
  ensureBranch(req);
  const table = await RestaurantTable.findOne({ _id: tableId, branchId: req.branchId });
  if (!table) throw new ApiError(httpStatus.NOT_FOUND, 'Table not found');
  table.qrToken = crypto.randomBytes(24).toString('hex');
  await table.save();
  return table;
};

const buildLinesFromProducts = async (lineInputs, branchId) => {
  const lines = [];
  for (const input of lineInputs) {
    const product = await Product.findOne({ _id: input.productId, branchId });
    if (!product) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Product not found: ${input.productId}`);
    }
    const effectiveUnit =
      input.unitPrice != null && !Number.isNaN(Number(input.unitPrice))
        ? Math.max(0, Number(input.unitPrice))
        : Number(product.price) || 0;
    lines.push({
      productId: product._id,
      name: product.name,
      quantity: input.quantity,
      unitPrice: effectiveUnit,
      notes: input.notes,
      station: input.station || 'kitchen',
      status: 'pending',
    });
  }
  return lines;
};

const createOrder = async (body, req) => {
  ensureBranch(req);
  const lines = await buildLinesFromProducts(body.lines, req.branchId);
  const { taxAmount = 0, discountAmount = 0, serviceChargeAmount = 0 } = body;
  const { subtotal, total } = computeOrderTotals(lines, { taxAmount, discountAmount, serviceChargeAmount });

  let tableLabel = body.tableLabel;
  let tableId = body.tableId;
  let serviceMode = 'dine_in';
  if (body.serviceMode === 'takeaway') serviceMode = 'takeaway';
  else if (body.serviceMode === 'delivery') serviceMode = 'delivery';
  if (serviceMode === 'delivery' || serviceMode === 'takeaway') {
    tableId = undefined;
  }

  if (tableId) {
    const table = await RestaurantTable.findOne({ _id: tableId, branchId: req.branchId }).populate('floorId');
    if (!table) throw new ApiError(httpStatus.BAD_REQUEST, 'Table not found');
    const floorName = table.floorId?.name || 'Floor';
    tableLabel = `${floorName} · ${table.label}`;
  }

  const prepaidAmount = Math.max(0, Number(body.prepaidAmount) || 0);
  const prepaidMethod = body.prepaidMethod ? String(body.prepaidMethod).trim() : undefined;
  if (prepaidAmount > total + 0.0001) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Prepaid amount cannot exceed order total');
  }
  if (prepaidAmount > 0 && !prepaidMethod) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payment method is required when recording prepayment');
  }
  const prepaidAt =
    prepaidAmount > 0 && prepaidMethod ? new Date() : undefined;

  let resolvedCustomerId;
  let deliveryPhoneField;
  if (serviceMode === 'delivery') {
    deliveryPhoneField = resolveDeliveryPhoneFromBody(body) || undefined;
    if (body.customerId) {
      const crm = await Customer.findOne({
        _id: body.customerId,
        branchId: req.branchId,
      }).select('_id');
      if (crm) resolvedCustomerId = crm._id;
    }
  }

  const order = await RestaurantOrder.create({
    organizationId: req.organizationId,
    branchId: req.branchId,
    tableId: tableId || undefined,
    tableLabel,
    orderNumber: generateOrderNumber(),
    source: body.source || 'pos',
    serviceMode,
    customerName: body.customerName,
    customerId: resolvedCustomerId,
    deliveryPhone: deliveryPhoneField,
    guestCount: body.guestCount,
    lines,
    status: lines.length ? 'in_progress' : 'open',
    subtotal,
    taxAmount,
    discountAmount,
    serviceChargeAmount,
    total,
    notes: body.notes,
    prepaidAmount,
    prepaidMethod: prepaidAt ? prepaidMethod : undefined,
    prepaidAt,
    createdBy: req.user?._id,
  });

  if (tableId) {
    await RestaurantTable.updateOne({ _id: tableId }, { status: 'occupied' });
  }

  return order;
};

const queryOrders = async (query, req) => {
  ensureBranch(req);
  const filter = { branchId: req.branchId };
  if (query.status) filter.status = query.status;
  if (query.source) filter.source = query.source;
  if (query.serviceMode) filter.serviceMode = query.serviceMode;
  return RestaurantOrder.find(filter).sort({ createdAt: -1 }).limit(Number(query.limit) || 100);
};

const getOrderById = async (orderId, req) => {
  ensureBranch(req);
  const order = await RestaurantOrder.findOne({ _id: orderId, branchId: req.branchId });
  if (!order) throw new ApiError(httpStatus.NOT_FOUND, 'Order not found');
  return order;
};

const updateOrderStatus = async (orderId, body, req) => {
  const order = await getOrderById(orderId, req);
  order.status = body.status;
  if (body.status === 'paid') {
    order.paidAt = new Date();
    if (body.paymentMethod) order.paymentMethod = body.paymentMethod;
    if (body.markDelivered) {
      order.deliveredAt = new Date();
    }
  }
  if (body.status === 'cancelled' && order.tableId) {
    await RestaurantTable.updateOne({ _id: order.tableId }, { status: 'available' });
  }
  await order.save();
  return order;
};

const updateOrder = async (orderId, body, req) => {
  const order = await getOrderById(orderId, req);
  if (['paid', 'cancelled'].includes(order.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot edit a closed order');
  }
  const lines = await buildLinesFromProducts(body.lines, req.branchId);
  const { taxAmount = 0, discountAmount = 0, serviceChargeAmount = 0 } = body;
  const { subtotal, total } = computeOrderTotals(lines, { taxAmount, discountAmount, serviceChargeAmount });

  const previousTableId = order.tableId ? String(order.tableId) : null;

  let tableLabel = order.tableLabel;
  let tableId = order.tableId;
  if (order.serviceMode === 'dine_in' && body.tableId !== undefined) {
    if (body.tableId === null || body.tableId === '') {
      tableId = undefined;
      tableLabel = undefined;
    } else {
      const table = await RestaurantTable.findOne({ _id: body.tableId, branchId: req.branchId }).populate('floorId');
      if (!table) throw new ApiError(httpStatus.BAD_REQUEST, 'Table not found');
      tableId = table._id;
      const floorName = table.floorId?.name || 'Floor';
      tableLabel = `${floorName} · ${table.label}`;
    }
  }
  if (order.serviceMode === 'delivery' || order.serviceMode === 'takeaway') {
    tableId = undefined;
    tableLabel = order.serviceMode === 'delivery' ? order.tableLabel || 'Delivery' : undefined;
  }

  order.lines = lines;
  order.subtotal = subtotal;
  order.total = total;
  order.taxAmount = taxAmount;
  order.discountAmount = discountAmount;
  order.serviceChargeAmount = serviceChargeAmount;
  order.tableId = tableId || undefined;
  order.tableLabel = tableLabel;
  if (body.customerName !== undefined) order.customerName = body.customerName ? String(body.customerName).trim() : undefined;
  if (body.notes !== undefined) order.notes = body.notes;

  if (order.serviceMode === 'delivery') {
    const mergedForPhone = {
      deliveryPhone: body.deliveryPhone,
      customerName:
        body.customerName !== undefined ? body.customerName : order.customerName,
    };
    const dp = resolveDeliveryPhoneFromBody(mergedForPhone);
    if (dp) order.deliveryPhone = dp;
    if (body.customerId !== undefined) {
      if (!body.customerId) {
        order.customerId = undefined;
      } else {
        const crm = await Customer.findOne({ _id: body.customerId, branchId: req.branchId }).select('_id');
        order.customerId = crm ? crm._id : undefined;
      }
    }
  }

  order.status = lines.length ? 'in_progress' : 'open';

  await order.save();

  if (previousTableId && (!order.tableId || String(order.tableId) !== previousTableId)) {
    const stillOpen = await RestaurantOrder.countDocuments({
      branchId: req.branchId,
      tableId: previousTableId,
      status: { $nin: ['paid', 'cancelled'] },
    });
    if (stillOpen === 0) {
      await RestaurantTable.updateOne({ _id: previousTableId }, { status: 'available' });
    }
  }
  if (order.tableId && String(order.tableId) !== previousTableId) {
    await RestaurantTable.updateOne({ _id: order.tableId }, { status: 'occupied' });
  }

  return order;
};

const lookupDeliveryCustomerContext = async (query, req) => {
  ensureBranch(req);
  const digits = normalizePhoneDigits(query.phone);
  if (digits.length < 7) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Enter at least 7 digits');
  }

  const branchId = req.branchId;
  const customers = await Customer.find({ branchId })
    .select('name phone email address whatsapp balance')
    .limit(1000)
    .lean();

  const customerRow = customers.find(
    (c) =>
      phoneDigitsMatch(normalizePhoneDigits(c.phone), digits) ||
      phoneDigitsMatch(normalizePhoneDigits(c.whatsapp), digits),
  );

  const orderFilter = {
    branchId,
    serviceMode: 'delivery',
    $or: [{ deliveryPhone: digits }, { customerName: new RegExp(digits.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }],
  };
  if (query.excludeOrderId && mongoose.Types.ObjectId.isValid(query.excludeOrderId)) {
    orderFilter._id = { $ne: query.excludeOrderId };
  }

  const recentOrders = await RestaurantOrder.find(orderFilter)
    .sort({ createdAt: -1 })
    .limit(10)
    .select('orderNumber status total createdAt customerName deliveryPhone lines')
    .lean();

  const recentOrdersOut = recentOrders.map((o) => ({
    id: o._id.toString(),
    orderNumber: o.orderNumber,
    status: o.status,
    total: o.total,
    createdAt: o.createdAt,
    customerName: o.customerName,
    linePreview: (o.lines || [])
      .slice(0, 4)
      .map((l) => `${l.quantity}× ${l.name}`)
      .join(', '),
  }));

  return {
    normalizedPhone: digits,
    customer: customerRow
      ? {
          id: customerRow._id.toString(),
          name: customerRow.name,
          phone: customerRow.phone,
          email: customerRow.email,
          address: customerRow.address,
          whatsapp: customerRow.whatsapp,
          balance: customerRow.balance,
        }
      : null,
    recentOrders: recentOrdersOut,
  };
};

const updateLineKitchenStatus = async (orderId, lineId, body, req) => {
  const order = await getOrderById(orderId, req);
  const line = order.lines.id(lineId);
  if (!line) throw new ApiError(httpStatus.NOT_FOUND, 'Line not found');
  line.status = body.status;
  if (!['out_for_delivery', 'paid', 'cancelled'].includes(order.status)) {
    const allDone = order.lines.every((l) => ['ready', 'served'].includes(l.status));
    if (allDone) order.status = 'ready';
    else order.status = 'in_progress';
  }
  await order.save();
  return order;
};

const getStats = async (req) => {
  ensureBranch(req);
  const branchId = req.branchId;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  /**
   * Cash/card collected today must include:
   * - prepayments at fire ("Pay cash & send"): prepaidAmount with prepaidAt today
   * - balance due at checkout: when status becomes paid, sum (total - prepaidAmount) for paidAt today
   *    so fully prepaid tickets are not double-counted when later marked paid.
   */
  const [todayOrders, prepaidToday, settledBalanceToday, openOrders, tablesOccupied] = await Promise.all([
    RestaurantOrder.countDocuments({ branchId, createdAt: { $gte: start, $lt: end } }),
    RestaurantOrder.aggregate([
      {
        $match: {
          branchId,
          prepaidAt: { $gte: start, $lt: end },
          prepaidAmount: { $gt: 0 },
        },
      },
      { $group: { _id: null, revenue: { $sum: '$prepaidAmount' } } },
    ]),
    RestaurantOrder.aggregate([
      {
        $match: {
          branchId,
          status: 'paid',
          paidAt: { $gte: start, $lt: end },
        },
      },
      {
        $addFields: {
          prepaid: { $ifNull: ['$prepaidAmount', 0] },
        },
      },
      {
        $addFields: {
          balanceCollected: { $max: [0, { $subtract: ['$total', '$prepaid'] }] },
        },
      },
      { $group: { _id: null, revenue: { $sum: '$balanceCollected' } } },
    ]),
    RestaurantOrder.countDocuments({
      branchId,
      status: { $in: ['open', 'in_progress', 'ready', 'served', 'out_for_delivery'] },
    }),
    RestaurantTable.countDocuments({ branchId, status: 'occupied' }),
  ]);

  const revenue =
    (prepaidToday[0]?.revenue || 0) + (settledBalanceToday[0]?.revenue || 0);

  return {
    todayOrders,
    todayRevenue: revenue,
    openOrders,
    tablesOccupied,
  };
};

const createReservation = async (body, req) => {
  ensureBranch(req);
  return RestaurantReservation.create({
    ...body,
    organizationId: req.organizationId,
    branchId: req.branchId,
    createdBy: req.user?._id,
  });
};

const queryReservations = async (query, req) => {
  ensureBranch(req);
  const filter = { branchId: req.branchId };
  if (query.from && query.to) {
    filter.startAt = { $gte: new Date(query.from), $lte: new Date(query.to) };
  }
  return RestaurantReservation.find(filter).populate('tableId', 'label').sort({ startAt: 1 });
};

const updateReservation = async (id, body, req) => {
  ensureBranch(req);
  const doc = await RestaurantReservation.findOne({ _id: id, branchId: req.branchId });
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Reservation not found');
  Object.assign(doc, body);
  await doc.save();
  return doc;
};

// —— Public (QR) ——————————————————————————————————————————————————

const getTableByQrToken = async (qrToken) => {
  const table = await RestaurantTable.findOne({ qrToken }).populate('floorId', 'name');
  if (!table) throw new ApiError(httpStatus.NOT_FOUND, 'Table not found');
  const branch = await Branch.findById(table.branchId).select('name');
  const org = await Organization.findById(table.organizationId).select('name logo');
  return { table, branch, organization: org };
};

const listProductsForBranch = async (branchId, { limit = 200 } = {}) => {
  return Product.find({ branchId }).sort({ name: 1 }).limit(limit).select('name price description image categories');
};

const createPublicQrOrder = async (qrToken, body) => {
  const { table } = await getTableByQrToken(qrToken);
  const lines = await buildLinesFromProducts(body.lines, table.branchId);
  const { taxAmount = 0, discountAmount = 0, serviceChargeAmount = 0 } = body;
  const { subtotal, total } = computeOrderTotals(lines, { taxAmount, discountAmount, serviceChargeAmount });

  const floorName = table.floorId?.name || 'Floor';
  const tableLabel = `${floorName} · ${table.label}`;

  const order = await RestaurantOrder.create({
    organizationId: table.organizationId,
    branchId: table.branchId,
    tableId: table._id,
    tableLabel,
    orderNumber: generateOrderNumber(),
    source: 'qr',
    customerName: body.customerName,
    guestCount: body.guestCount,
    lines,
    status: 'in_progress',
    subtotal,
    taxAmount,
    discountAmount,
    serviceChargeAmount,
    total,
    notes: body.notes,
  });

  await RestaurantTable.updateOne({ _id: table._id }, { status: 'occupied' });

  return order;
};

module.exports = {
  createFloor,
  queryFloors,
  updateFloor,
  deleteFloor,
  createTable,
  queryTables,
  updateTable,
  regenerateTableQr,
  createOrder,
  queryOrders,
  getOrderById,
  lookupDeliveryCustomerContext,
  updateOrder,
  updateOrderStatus,
  updateLineKitchenStatus,
  getStats,
  createReservation,
  queryReservations,
  updateReservation,
  getTableByQrToken,
  listProductsForBranch,
  createPublicQrOrder,
};
