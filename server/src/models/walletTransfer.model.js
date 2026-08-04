const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * Records a manual transfer of money between a Wallet (mobile-money account like
 * JazzCash/EasyPaisa, or a plain bank/cash wallet) and "My Account" (the owner's personal
 * ledger, PersonalLedger) — e.g. cashing out a wallet's digital balance into the owner's
 * own account, or topping a wallet back up from the owner's own funds. In the Cash
 * Management UI, "My Account" is offered as a selectable pseudo-customer alongside real
 * customers — this model is what actually backs that option once picked.
 */
const walletTransferSchema = new mongoose.Schema(
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
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: true,
      index: true,
    },
    walletType: {
      type: String,
      required: true,
      trim: true,
    },
    // 'wallet_to_account': wallet balance decreases, My Account increases (cashing wallet
    // money out into the owner's account — the "Send" side of Cash Management).
    // 'account_to_wallet': the reverse — funding/topping up the wallet from the owner's own
    // account (the "Received" side of Cash Management).
    direction: {
      type: String,
      enum: ['wallet_to_account', 'account_to_wallet'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    date: {
      type: Date,
      default: Date.now,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true },
);

walletTransferSchema.plugin(toJSON);
walletTransferSchema.plugin(paginate);

walletTransferSchema.index({ organizationId: 1, branchId: 1, date: -1 });

module.exports = mongoose.model('WalletTransfer', walletTransferSchema);
