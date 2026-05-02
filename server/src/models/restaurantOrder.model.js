const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const STATIONS = ['kitchen', 'bar', 'grill', 'dessert', 'other'];
const LINE_STATUSES = ['pending', 'preparing', 'ready', 'served'];

const orderLineSchema = mongoose.Schema(
  {
    productId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Product' },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    notes: { type: String, trim: true },
    station: { type: String, enum: STATIONS, default: 'kitchen' },
    status: { type: String, enum: LINE_STATUSES, default: 'pending' },
  },
  { _id: true }
);

const ORDER_STATUSES = [
  'open',
  'in_progress',
  'ready',
  'served',
  'out_for_delivery',
  'paid',
  'cancelled',
];

const restaurantOrderSchema = mongoose.Schema(
  {
    organizationId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    branchId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    tableId: { type: mongoose.SchemaTypes.ObjectId, ref: 'RestaurantTable' },
    tableLabel: { type: String, trim: true },
    orderNumber: { type: String, required: true, index: true },
    source: {
      type: String,
      enum: ['pos', 'qr', 'walk_in', 'phone'],
      default: 'pos',
    },
    /** POS: table service · pickup · home delivery */
    serviceMode: {
      type: String,
      enum: ['dine_in', 'takeaway', 'delivery'],
      default: 'dine_in',
    },
    customerName: { type: String, trim: true },
    /** CRM customer card when linked from POS delivery lookup */
    customerId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Customer' },
    /** Normalized digits-only phone for repeat delivery lookup */
    deliveryPhone: { type: String, trim: true, index: true },
    guestCount: { type: Number, min: 1 },
    lines: [orderLineSchema],
    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: 'open',
    },
    subtotal: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    serviceChargeAmount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    notes: { type: String, trim: true },
    paidAt: { type: Date },
    paymentMethod: { type: String, trim: true },
    /** COD delivery: set when payment completes and order is handed off */
    deliveredAt: { type: Date },
    /** Collected before / at fire — order stays in_progress until kitchen completes */
    prepaidAmount: { type: Number, min: 0, default: 0 },
    prepaidMethod: { type: String, trim: true },
    prepaidAt: { type: Date },
    createdBy: { type: mongoose.SchemaTypes.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

restaurantOrderSchema.plugin(toJSON);
restaurantOrderSchema.plugin(paginate);

restaurantOrderSchema.index({ branchId: 1, createdAt: -1 });
restaurantOrderSchema.index({ branchId: 1, status: 1 });

/**
 * @typedef RestaurantOrder
 */
const RestaurantOrder = mongoose.model('RestaurantOrder', restaurantOrderSchema);

module.exports = RestaurantOrder;
