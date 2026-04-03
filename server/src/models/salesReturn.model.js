const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const salesReturnItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const SalesReturnSchema = new mongoose.Schema(
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
    returnNumber: {
      type: String,
      unique: true,
    },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
    },
    customerName: { type: String },
    items: [salesReturnItemSchema],
    totalAmount: { type: Number, required: true, min: 0 },
    refundMethod: {
      type: String,
      enum: ['cash', 'jazzcash', 'easypaisa', 'adjustment'],
      required: true,
    },
    reason: { type: String, trim: true },
    // Damage / condition tracking
    damageDescription: { type: String, trim: true },
    // Approval workflow
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'approved', // auto-approve unless approval system is enabled
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectionReason: { type: String, trim: true },
    // Credit note amount (when refundMethod === 'adjustment')
    creditAmount: { type: Number, default: 0 },
    // Tracks whether this return has been forwarded to a supplier as a purchase return
    convertedToPurchaseReturn: { type: Boolean, default: false, index: true },
    purchaseReturnId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PurchaseReturn',
      default: null,
    },
    date: { type: Date, default: Date.now, index: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

SalesReturnSchema.index({ organizationId: 1, branchId: 1 });
SalesReturnSchema.index({ organizationId: 1, branchId: 1, date: -1 });

// Auto-generate return number before saving
SalesReturnSchema.pre('save', async function (next) {
  if (this.isNew && !this.returnNumber) {
    const count = await mongoose.models.SalesReturn.countDocuments();
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    this.returnNumber = `SR-${year}${month}-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

SalesReturnSchema.plugin(toJSON);
SalesReturnSchema.plugin(paginate);

const SalesReturn = mongoose.model('SalesReturn', SalesReturnSchema);

module.exports = SalesReturn;
