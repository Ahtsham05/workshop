const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * A single "reconciliation run" for a Bank Account — records what the real bank statement
 * said the closing balance was for a period, how many book (WalletEntry) transactions were
 * matched off against it, and whether the book and statement balances agreed at the time.
 * The actual match state lives on each `WalletEntry` (`isReconciled`/`reconciledSessionId`)
 * — this document is the audit trail / "last reconciled on X to Rs Y" history, not the
 * source of truth for any individual transaction's status.
 */
const bankReconciliationSessionSchema = new mongoose.Schema(
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
    bankAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: true,
      index: true,
    },
    // Denormalized wallet.type so history stays readable even if the account is renamed.
    bankAccountName: {
      type: String,
      trim: true,
    },
    statementStartDate: {
      type: Date,
    },
    statementEndDate: {
      type: Date,
      required: true,
    },
    statementClosingBalance: {
      type: Number,
      required: true,
    },
    // Book (WalletEntry-derived) closing balance as of statementEndDate, snapshotted at
    // confirmation time for the audit trail.
    bookClosingBalance: {
      type: Number,
      required: true,
    },
    // statementClosingBalance - bookClosingBalance — 0 means it balanced perfectly.
    difference: {
      type: Number,
      required: true,
      default: 0,
    },
    matchedCount: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

bankReconciliationSessionSchema.plugin(toJSON);
bankReconciliationSessionSchema.plugin(paginate);

bankReconciliationSessionSchema.index({ organizationId: 1, branchId: 1, bankAccountId: 1, statementEndDate: -1 });

const BankReconciliationSession = mongoose.model('BankReconciliationSession', bankReconciliationSessionSchema);

module.exports = BankReconciliationSession;
