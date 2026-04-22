const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const feeItemSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FeeCategory',
    },
  },
  { _id: true }
);

const feeStructureSchema = mongoose.Schema(
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
      index: true,
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SchoolClass',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      default: 'Standard Fee Structure',
    },
    academicYear: {
      type: String,
      trim: true,
    },
    feeItems: {
      type: [feeItemSchema],
      default: [],
    },
    totalAmount: {
      type: Number,
      default: 0,
    },
    frequency: {
      type: String,
      enum: ['monthly', 'quarterly', 'annually', 'one-time'],
      default: 'monthly',
    },
    dueDay: {
      type: Number,
      min: 1,
      max: 31,
      default: 10,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

feeStructureSchema.plugin(toJSON);
feeStructureSchema.plugin(paginate);

// Recalculate totalAmount before saving
feeStructureSchema.pre('save', function (next) {
  if (this.feeItems && this.feeItems.length > 0) {
    this.totalAmount = this.feeItems.reduce((sum, item) => sum + (item.amount || 0), 0);
  }
  next();
});

feeStructureSchema.index({ organizationId: 1, branchId: 1, classId: 1 });

const FeeStructure = mongoose.model('FeeStructure', feeStructureSchema);

module.exports = FeeStructure;
