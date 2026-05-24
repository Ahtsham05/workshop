const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const expenseCategorySchema = new mongoose.Schema(
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
    name: {
      type: String,
      required: true,
      trim: true,
    },
    transactionType: {
      type: String,
      enum: ['business_expense', 'income', 'expense', 'transfer', 'opening_balance', 'adjustment'],
      default: 'business_expense',
      index: true,
    },
    color: {
      type: String,
      default: '#6366f1',
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true },
);

expenseCategorySchema.plugin(toJSON);
expenseCategorySchema.plugin(paginate);

expenseCategorySchema.index(
  { organizationId: 1, branchId: 1, name: 1, transactionType: 1 },
  { unique: true },
);

const ExpenseCategory = mongoose.model('ExpenseCategory', expenseCategorySchema);

module.exports = ExpenseCategory;
