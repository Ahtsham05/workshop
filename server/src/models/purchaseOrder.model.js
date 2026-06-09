const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');
const { DEFAULT_UNIT } = require('../config/units');

const PURCHASE_ORDER_STATUSES = [
  'draft',       // freshly drafted, not yet sent to supplier
  'sent',        // sent / approved, awaiting goods (no receipts yet)
  'partial',     // some items received, but not all
  'completed',   // every line fully received
  'cancelled',   // cancelled, no further activity expected
];

const PurchaseOrderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    productName: { type: String, trim: true }, // snapshot at order time (helps if product is renamed/deleted)
    productNameUrdu: { type: String, trim: true },
    quantity: { type: Number, required: true, min: 0 }, // ordered quantity (in the order line unit)
    receivedQuantity: { type: Number, default: 0, min: 0 }, // total received so far (in the order line unit)
    unit: { type: String, default: DEFAULT_UNIT },
    conversionFactor: { type: Number, default: 1, min: 0.000001 },
    expectedPrice: { type: Number, required: true, min: 0 }, // expected per-unit purchase price
    expectedSellingPrice: { type: Number, min: 0 }, // optional — what we plan to retail at
    total: { type: Number, required: true, min: 0 }, // expectedPrice * quantity
    notes: { type: String, trim: true },
  },
  { _id: true }
);

const PurchaseOrderReceiptSchema = new mongoose.Schema(
  {
    purchase: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' }, // the Purchase doc this receipt produced
    purchaseInvoiceNumber: { type: String }, // snapshot for quick display
    receivedAt: { type: Date, default: Date.now },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    items: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        receivedQuantity: { type: Number, required: true, min: 0 }, // received this time, in order's unit
        priceAtPurchase: { type: Number, required: true, min: 0 }, // actual paid price
        sellingPriceAtPurchase: { type: Number, min: 0 },
        unit: { type: String },
        conversionFactor: { type: Number, default: 1, min: 0.000001 },
        notes: { type: String, trim: true },
      },
    ],
    notes: { type: String, trim: true },
  },
  { _id: true, timestamps: true }
);

const PurchaseOrderSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    orderNumber: { type: String, required: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },

    items: [PurchaseOrderItemSchema],

    orderDate: { type: Date, default: Date.now, required: true },
    expectedDeliveryDate: { type: Date },

    subtotal: { type: Number, required: true, default: 0 },
    discount: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    shippingCost: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, default: 0 }, // subtotal - discount + tax + shippingCost

    status: {
      type: String,
      enum: PURCHASE_ORDER_STATUSES,
      default: 'draft',
      index: true,
    },

    receipts: [PurchaseOrderReceiptSchema],

    notes: { type: String, trim: true },
    termsAndConditions: { type: String, trim: true },

    cancelledAt: { type: Date },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancellationReason: { type: String, trim: true },
  },
  {
    timestamps: true,
  }
);

PurchaseOrderSchema.index({ organizationId: 1, orderNumber: 1 }, { unique: true });
PurchaseOrderSchema.index({ organizationId: 1, branchId: 1, status: 1 });
PurchaseOrderSchema.index({ supplier: 1, status: 1 });

PurchaseOrderSchema.plugin(toJSON);
PurchaseOrderSchema.plugin(paginate);

/**
 * Recompute the order status from its items' received quantities.
 * Returns the new status (does NOT save).
 */
PurchaseOrderSchema.methods.computeStatus = function computeStatus() {
  if (this.status === 'cancelled') return 'cancelled';

  const items = this.items || [];
  if (items.length === 0) {
    return this.status === 'draft' ? 'draft' : 'sent';
  }

  let receivedSum = 0;
  let orderedSum = 0;
  for (const item of items) {
    const ordered = Number(item.quantity || 0);
    const received = Number(item.receivedQuantity || 0);
    orderedSum += ordered;
    receivedSum += Math.min(received, ordered);
  }

  if (receivedSum === 0) {
    return this.status === 'draft' ? 'draft' : 'sent';
  }
  if (receivedSum >= orderedSum) {
    return 'completed';
  }
  return 'partial';
};

const PurchaseOrder = mongoose.model('PurchaseOrder', PurchaseOrderSchema);

module.exports = PurchaseOrder;
module.exports.PURCHASE_ORDER_STATUSES = PURCHASE_ORDER_STATUSES;
