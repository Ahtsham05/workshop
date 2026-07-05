const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');

const transactionTypes = {
  SALARY_PAYABLE: 'salary_payable',
  SALARY_PAYMENT: 'salary_payment',
  ADVANCE_PAYMENT: 'advance_payment',
  ADVANCE_RECOVERY: 'advance_recovery',
  ADJUSTMENT: 'adjustment',
};

const employeeLedgerSchema = new mongoose.Schema(
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
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      index: true,
    },
    transactionType: {
      type: String,
      enum: Object.values(transactionTypes),
      required: true,
    },
    transactionDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    reference: {
      type: String,
      trim: true,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
    },
    referenceModel: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    debit: {
      type: Number,
      default: 0,
      min: 0,
    },
    credit: {
      type: Number,
      default: 0,
      min: 0,
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
    },
    paymentMethod: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    // When false, this entry is kept out of the Cash Book and Expense report
    // (e.g. the cash/expense side was already recorded elsewhere and posting
    // it again here would double-count). Defaults to the normal behavior.
    affectsBooks: {
      type: Boolean,
      default: true,
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
  { timestamps: true }
);

employeeLedgerSchema.plugin(toJSON);
employeeLedgerSchema.plugin(paginate);

employeeLedgerSchema.index({ organizationId: 1, branchId: 1, employee: 1, transactionDate: 1 });
employeeLedgerSchema.index({ employee: 1, referenceId: 1, transactionType: 1 }, { unique: false });

const EmployeeLedger = mongoose.model('EmployeeLedger', employeeLedgerSchema);

module.exports = EmployeeLedger;
module.exports.transactionTypes = transactionTypes;
