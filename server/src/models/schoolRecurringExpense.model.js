const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');

const schoolRecurringExpenseSchema = new mongoose.Schema(
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
    name: { type: String, required: true, trim: true },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FeeCategory',
      required: true,
    },
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    paymentMethod: {
      type: String,
      enum: ['cash', 'bank_transfer', 'cheque', 'online', 'other'],
      default: 'cash',
    },
    vendor: { type: String, trim: true },
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      required: true,
    },
    // For weekly: 0=Sun,1=Mon,...,6=Sat
    dayOfWeek: { type: Number, min: 0, max: 6 },
    // For monthly: 1–31
    dayOfMonth: { type: Number, min: 1, max: 31 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    lastGeneratedDate: { type: Date, default: null },
    nextRunDate: { type: Date, required: true },
    totalGenerated: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

schoolRecurringExpenseSchema.plugin(toJSON);
schoolRecurringExpenseSchema.plugin(paginate);
schoolRecurringExpenseSchema.index({ organizationId: 1, branchId: 1, isActive: 1, nextRunDate: 1 });

const SchoolRecurringExpense = mongoose.model('SchoolRecurringExpense', schoolRecurringExpenseSchema);
module.exports = SchoolRecurringExpense;
