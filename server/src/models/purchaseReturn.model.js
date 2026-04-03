const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const purchaseReturnItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    costPrice: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const PurchaseReturnSchema = new mongoose.Schema(
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
    purchaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Purchase',
      required: false,
      default: null,
      index: true,
    },
    // When this purchase return was created from a customer (sales) return
    salesReturnId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SalesReturn',
      default: null,
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      required: true,
      index: true,
    },
    items: [purchaseReturnItemSchema],
    totalAmount: { type: Number, required: true, min: 0 },
    refundMethod: {
      type: String,
      enum: ['cash', 'bank', 'adjustment'],
      required: true,
    },
    reason: { type: String, trim: true },
    // Damage / condition tracking
    damageDescription: { type: String, trim: true },
    // Approval workflow
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'approved',
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectionReason: { type: String, trim: true },
    date: { type: Date, default: Date.now, index: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

PurchaseReturnSchema.index({ organizationId: 1, branchId: 1 });
PurchaseReturnSchema.index({ organizationId: 1, branchId: 1, date: -1 });

// Auto-generate return number before saving
PurchaseReturnSchema.pre('save', async function (next) {
  if (this.isNew && !this.returnNumber) {
    const count = await mongoose.models.PurchaseReturn.countDocuments();
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    this.returnNumber = `PR-${year}${month}-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

PurchaseReturnSchema.plugin(toJSON);
PurchaseReturnSchema.plugin(paginate);

const PurchaseReturn = mongoose.model('PurchaseReturn', PurchaseReturnSchema);

module.exports = PurchaseReturn;
