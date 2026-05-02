const Joi = require('joi');

const lineInput = Joi.object().keys({
  productId: Joi.string().required(),
  quantity: Joi.number().integer().min(1).required(),
  notes: Joi.string().allow(''),
  station: Joi.string().valid('kitchen', 'bar', 'grill', 'dessert', 'other'),
  /** POS override; defaults to catalog price */
  unitPrice: Joi.number().min(0),
});

const createFloor = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    sortOrder: Joi.number(),
  }),
};

const floorId = {
  params: Joi.object().keys({
    floorId: Joi.string().required(),
  }),
};

const updateFloor = {
  params: Joi.object().keys({
    floorId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    name: Joi.string(),
    sortOrder: Joi.number(),
  }),
};

const createTable = {
  body: Joi.object().keys({
    floorId: Joi.string().required(),
    label: Joi.string().required(),
    capacity: Joi.number().min(1),
    status: Joi.string().valid('available', 'occupied', 'reserved', 'cleaning'),
  }),
};

const tableId = {
  params: Joi.object().keys({
    tableId: Joi.string().required(),
  }),
};

const updateTable = {
  params: Joi.object().keys({
    tableId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    floorId: Joi.string(),
    label: Joi.string(),
    capacity: Joi.number().min(1),
    status: Joi.string().valid('available', 'occupied', 'reserved', 'cleaning'),
  }),
};

const createOrder = {
  body: Joi.object().keys({
    lines: Joi.array().items(lineInput).min(1).required(),
    tableId: Joi.string(),
    tableLabel: Joi.string(),
    source: Joi.string().valid('pos', 'qr', 'walk_in', 'phone'),
    customerName: Joi.string().allow(''),
    guestCount: Joi.number().integer().min(1),
    taxAmount: Joi.number().min(0),
    discountAmount: Joi.number().min(0),
    serviceChargeAmount: Joi.number().min(0),
    notes: Joi.string().allow(''),
    prepaidAmount: Joi.number().min(0),
    prepaidMethod: Joi.string().trim().allow(''),
    serviceMode: Joi.string().valid('dine_in', 'takeaway', 'delivery'),
    customerId: Joi.string(),
    deliveryPhone: Joi.string().allow(''),
  }),
};

const listOrders = {
  query: Joi.object().keys({
    status: Joi.string(),
    source: Joi.string(),
    serviceMode: Joi.string(),
    limit: Joi.number(),
  }),
};

const orderId = {
  params: Joi.object().keys({
    orderId: Joi.string().required(),
  }),
};

const patchOrderStatus = {
  params: Joi.object().keys({
    orderId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    status: Joi.string()
      .valid('open', 'in_progress', 'ready', 'served', 'out_for_delivery', 'paid', 'cancelled')
      .required(),
    paymentMethod: Joi.string(),
    markDelivered: Joi.boolean(),
  }),
};

const patchOrder = {
  params: Joi.object().keys({
    orderId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    lines: Joi.array().items(lineInput).min(1).required(),
    tableId: Joi.string().allow(null, ''),
    taxAmount: Joi.number().min(0),
    discountAmount: Joi.number().min(0),
    serviceChargeAmount: Joi.number().min(0),
    customerName: Joi.string().allow(''),
    notes: Joi.string().allow(''),
    customerId: Joi.string().allow(null, ''),
    deliveryPhone: Joi.string().allow(''),
  }),
};

const getDeliveryCustomerLookup = {
  query: Joi.object().keys({
    phone: Joi.string().min(7).required(),
    excludeOrderId: Joi.string(),
  }),
};

const patchLineStatus = {
  params: Joi.object().keys({
    orderId: Joi.string().required(),
    lineId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    status: Joi.string().valid('pending', 'preparing', 'ready', 'served').required(),
  }),
};

const createReservation = {
  body: Joi.object().keys({
    tableId: Joi.string(),
    customerName: Joi.string().required(),
    phone: Joi.string().allow(''),
    partySize: Joi.number().integer().min(1).required(),
    startAt: Joi.date().required(),
    endAt: Joi.date(),
    status: Joi.string().valid('pending', 'confirmed', 'seated', 'completed', 'no_show', 'cancelled'),
    notes: Joi.string().allow(''),
  }),
};

const listReservations = {
  query: Joi.object().keys({
    from: Joi.date(),
    to: Joi.date(),
  }),
};

const patchReservation = {
  params: Joi.object().keys({
    reservationId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    tableId: Joi.string(),
    customerName: Joi.string(),
    phone: Joi.string(),
    partySize: Joi.number(),
    startAt: Joi.date(),
    endAt: Joi.date(),
    status: Joi.string().valid('pending', 'confirmed', 'seated', 'completed', 'no_show', 'cancelled'),
    notes: Joi.string(),
  }),
};

const qrToken = {
  params: Joi.object().keys({
    qrToken: Joi.string().required().min(8),
  }),
};

const publicCreateOrder = {
  params: Joi.object().keys({
    qrToken: Joi.string().required().min(8),
  }),
  body: Joi.object().keys({
    lines: Joi.array().items(lineInput).min(1).required(),
    customerName: Joi.string().allow(''),
    guestCount: Joi.number().integer().min(1),
    taxAmount: Joi.number().min(0),
    discountAmount: Joi.number().min(0),
    serviceChargeAmount: Joi.number().min(0),
    notes: Joi.string().allow(''),
  }),
};

const getTables = {
  query: Joi.object().keys({
    floorId: Joi.string(),
  }),
};

module.exports = {
  createFloor,
  floorId,
  updateFloor,
  createTable,
  tableId,
  updateTable,
  createOrder,
  listOrders,
  orderId,
  patchOrderStatus,
  patchOrder,
  getDeliveryCustomerLookup,
  patchLineStatus,
  createReservation,
  listReservations,
  patchReservation,
  qrToken,
  publicCreateOrder,
  getTables,
};
