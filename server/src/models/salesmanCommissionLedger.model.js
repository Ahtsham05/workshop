const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');

/**
 * Running commission ledger per salesman. One row per event — commission credited on a
 * completed sale, reversed on cancellation/return, or paid out (module 6). Balance is a
 * stored running total (current balance + this entry's credit/debit), the same
 * incremental pattern customerLedger._createCustomerLedgerEntry uses — not a full
 * recompute — since entries are always appended in order, never edited in place.
 */
const salesmanCommissionLedgerSchema = mongoose.Schema(
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
    salesmanUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    transactionType: {
      type: String,
      enum: ['commission_earned', 'commission_reversed', 'commission_payment', 'adjustment'],
      required: true,
    },
    transactionDate: { type: Date, required: true, default: Date.now },
    // Human-readable pointer (e.g. the invoice number or return number) for display.
    reference: { type: String, trim: true },
    referenceId: { type: mongoose.Schema.Types.ObjectId, index: true },
    referenceModel: { type: String, trim: true },
    debit: { type: Number, default: 0, min: 0 },
    credit: { type: Number, default: 0, min: 0 },
    balance: { type: Number, default: 0 },
    // The commission rate (%) actually applied when this entry was written, and the sale
    // amount it was computed against — kept for an auditable trail even if the underlying
    // CommissionRule is later changed or deleted.
    rate: { type: Number },
    saleAmount: { type: Number },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

salesmanCommissionLedgerSchema.index({ organizationId: 1, branchId: 1, salesmanUserId: 1, transactionDate: -1 });
salesmanCommissionLedgerSchema.index({ referenceId: 1, referenceModel: 1, transactionType: 1 });

salesmanCommissionLedgerSchema.plugin(toJSON);
salesmanCommissionLedgerSchema.plugin(paginate);

const SalesmanCommissionLedger = mongoose.model('SalesmanCommissionLedger', salesmanCommissionLedgerSchema);

module.exports = SalesmanCommissionLedger;
