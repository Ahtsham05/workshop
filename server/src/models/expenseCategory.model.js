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
    // Accounting classification (business_expense categories only).
    //   direct   — cost of producing/acquiring what is sold (freight & carriage inward,
    //              direct labour, factory power, packing). Reduces GROSS profit and posts
    //              under Cost of Sales.
    //   indirect — cost of running the business (rent, office salaries, marketing,
    //              utilities). Reduces NET profit only.
    // Defaults to indirect: every expense was treated that way before this field existed,
    // so existing categories and reports keep exactly their old figures.
    expenseNature: {
      type: String,
      enum: ['direct', 'indirect'],
      default: 'indirect',
    },
    // Optional chart-of-accounts leaf (an EXPENSE head's code) this category posts to.
    // Empty → Direct Expenses (direct) or Miscellaneous Expense (indirect).
    accountCode: {
      type: String,
      trim: true,
      default: null,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    // Inactive = retired: hidden from the Add Expense picker, but its saved expenses,
    // reports and books are untouched (unlike deleting). Missing on old rows = active.
    isActive: {
      type: Boolean,
      default: true,
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
