const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const feeCategorySchema = mongoose.Schema(
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
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['INCOME', 'EXPENSE'],
      required: true,
    },
    description: {
      type: String,
      trim: true,
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

feeCategorySchema.plugin(toJSON);
feeCategorySchema.plugin(paginate);

feeCategorySchema.index({ organizationId: 1, branchId: 1, name: 1 }, { unique: true });

const FeeCategory = mongoose.model('FeeCategory', feeCategorySchema);

module.exports = FeeCategory;
