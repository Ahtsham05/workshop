const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const repairJobSchema = new mongoose.Schema(
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
    customerName: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    deviceModel: {
      type: String,
      required: true,
      trim: true,
    },
    issue: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'delivered'],
      default: 'pending',
    },
    charges: {
      type: Number,
      default: 0,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'jazzcash', 'easypaisa', 'bank'],
      default: 'cash',
    },
    technician: {
      type: String,
      trim: true,
    },
    serialNumber: {
      type: String,
      trim: true,
    },
    color: {
      type: String,
      trim: true,
    },
    accessories: {
      type: String,
      trim: true,
    },
    advanceAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    cost: {
      type: Number,
      default: 0,
      min: 0,
    },
    date: {
      type: Date,
      default: Date.now,
      index: true,
    },
    completedAt: {
      type: Date,
    },
    deliveredAt: {
      type: Date,
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

repairJobSchema.plugin(toJSON);
repairJobSchema.plugin(paginate);

repairJobSchema.index({ organizationId: 1, branchId: 1, date: -1, status: 1 });

const RepairJob = mongoose.model('RepairJob', repairJobSchema);

module.exports = RepairJob;
