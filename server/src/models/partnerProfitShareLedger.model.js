const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');

/**
 * Running profit-share ledger per partner. One row per event — share credited on a
 * completed sale, reversed on cancellation/return, or paid out. Balance is a stored
 * running total, same incremental pattern as salesmanCommissionLedger.model.js — entries
 * are always appended in order, never edited in place.
 *
 * Unlike SalesmanCommissionLedger (one invoice -> at most one salesman -> referenceId is a
 * sufficient key), one invoice here can credit SEVERAL different partners/rules at once (an
 * org-wide partner and one or more product investors can all earn off the same sale). So
 * the idempotency/lookup key for "has this already been credited" is
 * referenceId + referenceModel + ruleId, not referenceId + referenceModel alone.
 */
const partnerProfitShareLedgerSchema = mongoose.Schema(
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
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Partner',
      required: true,
      index: true,
    },
    transactionType: {
      type: String,
      enum: ['share_earned', 'share_reversed', 'share_payment', 'adjustment'],
      required: true,
    },
    transactionDate: { type: Date, required: true, default: Date.now },
    // Human-readable pointer (e.g. the invoice number) for display.
    reference: { type: String, trim: true },
    referenceId: { type: mongoose.Schema.Types.ObjectId, index: true },
    referenceModel: { type: String, trim: true },
    // Set only for entries earned from a product-scoped rule — lets the ledger UI show
    // "earned from sale of Product X". null for organization/branch-scoped entries.
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    // The specific rule that fired — snapshotted since several rules can apply to one
    // invoice, and this is the actual idempotency key alongside referenceId/referenceModel.
    ruleId: { type: mongoose.Schema.Types.ObjectId, ref: 'PartnerProfitShareRule', index: true },
    debit: { type: Number, default: 0, min: 0 },
    credit: { type: Number, default: 0, min: 0 },
    balance: { type: Number, default: 0 },
    // The rule's shareType/rate actually applied when this entry was written, and the
    // profit amount it was computed against — kept for an auditable trail even if the
    // underlying rule is later changed or deleted.
    shareType: { type: String, enum: ['percentage_of_profit', 'fixed_per_unit'] },
    rate: { type: Number },
    saleProfit: { type: Number },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

partnerProfitShareLedgerSchema.index({ organizationId: 1, branchId: 1, partnerId: 1, transactionDate: -1 });
partnerProfitShareLedgerSchema.index({ referenceId: 1, referenceModel: 1, ruleId: 1 });

partnerProfitShareLedgerSchema.plugin(toJSON);
partnerProfitShareLedgerSchema.plugin(paginate);

const PartnerProfitShareLedger = mongoose.model('PartnerProfitShareLedger', partnerProfitShareLedgerSchema);

module.exports = PartnerProfitShareLedger;
