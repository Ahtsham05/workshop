const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const repairStockItemSchema = new mongoose.Schema(
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
    // 'purchase' = debit (parts bought), 'repair_usage' = credit (parts used in a repair)
    type: {
      type: String,
      enum: ['purchase', 'repair_usage'],
      required: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    // Only populated for repair_usage entries
    repairJobRef: {
      type: String,
      trim: true,
    },
    // Only relevant for purchase entries
    paymentMethod: {
      type: String,
      enum: ['cash', 'jazzcash', 'easypaisa', 'bank'],
      default: 'cash',
    },
    notes: {
      type: String,
      trim: true,
    },
    date: {
      type: Date,
      default: Date.now,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

repairStockItemSchema.plugin(toJSON);
repairStockItemSchema.plugin(paginate);

repairStockItemSchema.index({ organizationId: 1, branchId: 1, date: -1 });

const RepairStockItem = mongoose.model('RepairStockItem', repairStockItemSchema);

module.exports = RepairStockItem;
