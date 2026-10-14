const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');

/**
 * One line of a raw material receipt. Money is per line as typed from the supplier's bill:
 * gross = quantity × rate, discount = gross × discountPercent, tax on (gross − discount),
 * net = gross − discount + tax. `netUnitCost` (pre-tax, after discount) is what stock is
 * valued at — input tax is recoverable, not inventory cost.
 */
const ReceiptLineSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
    productName: { type: String, trim: true },
    sku: { type: String, trim: true },
    productType: { type: String, default: null },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, trim: true },
    rate: { type: Number, default: 0, min: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    discountAmount: { type: Number, default: 0 },
    taxPercent: { type: Number, default: 0, min: 0, max: 100 },
    taxAmount: { type: Number, default: 0 },
    netAmount: { type: Number, default: 0 },
    netUnitCost: { type: Number, default: 0 },
    batchNumber: { type: String, trim: true, default: '' },
    expiryDate: { type: Date, default: null },
    serials: { type: [String], default: undefined },
    // Store / bin inside the branch (the branch itself is the warehouse — see
    // productionOrder.model.js); defaults to the voucher's.
    location: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
  },
  { _id: true }
);

/**
 * RMV — Raw Material Receipt Voucher. Receives manufacturing inputs from a supplier.
 *
 * A draft holds no stock. Confirming it posts, in ONE transaction: the voucher, a linked
 * Purchase through the existing purchase pipeline (stock, batches, serials, cost, the
 * supplier payable), and — when it's against a purchase order — the order's received
 * quantities. Cash book, accounts journal and supplier-ledger statement rows follow right
 * after commit, exactly as for every purchase (see purchase.service.js#runPurchasePostCommit).
 */
const RawMaterialReceiptSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    voucherNumber: { type: String, required: true, trim: true },
    status: { type: String, enum: ['draft', 'confirmed', 'cancelled'], default: 'draft', index: true },
    date: { type: Date, required: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
    supplierName: { type: String, trim: true, default: '' },
    purchaseOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null },
    purchaseOrderNumber: { type: String, trim: true, default: '' },
    location: { type: String, trim: true, default: '' },
    reference: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    lines: { type: [ReceiptLineSchema], default: [] },
    totals: {
      items: { type: Number, default: 0 },
      quantity: { type: Number, default: 0 },
      subtotal: { type: Number, default: 0 },
      discount: { type: Number, default: 0 },
      tax: { type: Number, default: 0 },
      grandTotal: { type: Number, default: 0 },
    },
    purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', default: null },
    purchaseInvoiceNumber: { type: String, trim: true, default: '' },
    confirmedAt: { type: Date, default: null },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, keepTimestampsInJSON: true }
);

RawMaterialReceiptSchema.plugin(toJSON);
RawMaterialReceiptSchema.plugin(paginate);
RawMaterialReceiptSchema.index({ organizationId: 1, voucherNumber: 1 }, { unique: true });
RawMaterialReceiptSchema.index({ organizationId: 1, branchId: 1, date: -1 });

module.exports = mongoose.model('RawMaterialReceipt', RawMaterialReceiptSchema);
