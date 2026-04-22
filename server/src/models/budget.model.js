const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * Budget — allocation per account head per financial year.
 * Monthly tracking allows variance analysis.
 */
const budgetSchema = mongoose.Schema(
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
    accountHeadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AccountHead',
      required: true,
    },
    financialYear: {
      type: String, // e.g. "2025-2026"
      required: true,
    },
    annualBudget: {
      type: Number,
      required: true,
      min: 0,
    },
    // Optional monthly breakdown (12 entries)
    monthlyBudget: {
      type: Map,
      of: Number, // key: "January", "February", etc.
      default: {},
    },
    spent: {
      type: Number,
      default: 0,
    },
    notes: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

budgetSchema.plugin(toJSON);
budgetSchema.plugin(paginate);

budgetSchema.index({ organizationId: 1, branchId: 1, financialYear: 1 });
budgetSchema.index({ organizationId: 1, branchId: 1, accountHeadId: 1, financialYear: 1 }, { unique: true });

const Budget = mongoose.model('Budget', budgetSchema);

module.exports = Budget;
