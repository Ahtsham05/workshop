const httpStatus = require('http-status');
const { WalletTransfer, PersonalLedger } = require('../models');
const ApiError = require('../utils/ApiError');
const walletService = require('./wallet.service');
const walletEntryService = require('./walletEntry.service');
const personalLedgerService = require('./personalLedger.service');

const REFERENCE_MODEL = 'WalletTransfer';

const describeTransfer = (walletType, direction) =>
  direction === 'wallet_to_account'
    ? `Transfer: ${walletType} wallet → My Personal Account`
    : `Transfer: My Personal Account → ${walletType} wallet`;

/**
 * Moves money between a Wallet and "My Account" (PersonalLedger) — the reverse of each
 * other's balance effect. This is what actually runs when "My Account" is picked as the
 * pseudo-customer on the Cash Management Received/Send form. Unlike a real customer
 * CashWithdrawal, neither leg is physical cash or a bank transaction — it's purely digital
 * money moving between two internal trackers, so this never touches Cash Book (see
 * personalLedger.service.js#syncCashBookFromPersonalLedger, which explicitly skips
 * WalletTransfer-linked entries).
 *  - Wallet.balance is adjusted via walletService.adjustWalletBalance (throws if it would
 *    go negative).
 *  - A WalletEntry row is written so the Wallet Balance Statement report's day-by-day
 *    reconstruction includes this movement.
 *  - A PersonalLedger entry (transactionType: 'transfer') is written for the My Account leg,
 *    categorized by the wallet's own name so "Income/Expense by Category" breaks transfers
 *    out per-wallet instead of lumping them into one generic bucket.
 */
const createWalletTransfer = async (body) => {
  const { organizationId, branchId, walletId, walletType, direction, amount, notes, date, createdBy } = body;
  const numericAmount = Number(amount);
  const transferDate = date || new Date();
  const description = describeTransfer(walletType, direction);

  const wallet = await walletService.getWalletById(walletId);
  if (!wallet || String(wallet.organizationId) !== String(organizationId) || String(wallet.branchId) !== String(branchId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Wallet not found');
  }

  const isWalletToAccount = direction === 'wallet_to_account';

  const transfer = await WalletTransfer.create({
    organizationId,
    branchId,
    walletId,
    walletType,
    direction,
    amount: numericAmount,
    notes,
    date: transferDate,
    createdBy,
  });

  await walletService.adjustWalletBalance({
    organizationId,
    branchId,
    type: walletType,
    amount: numericAmount,
    operation: isWalletToAccount ? 'deduct' : 'add',
    userId: createdBy,
  });

  await walletEntryService.upsertReferenceEntry({
    organizationId,
    branchId,
    walletType,
    type: isWalletToAccount ? 'out' : 'in',
    amount: numericAmount,
    referenceId: transfer._id,
    referenceModel: REFERENCE_MODEL,
    description,
    date: transferDate,
    createdBy,
  });

  await personalLedgerService.createEntry({
    organizationId,
    branchId,
    transactionType: 'transfer',
    transactionDate: transferDate,
    description,
    category: walletType,
    debit: isWalletToAccount ? 0 : numericAmount,
    credit: isWalletToAccount ? numericAmount : 0,
    notes,
    referenceId: transfer._id,
    referenceModel: REFERENCE_MODEL,
    createdBy,
  });

  return transfer;
};

const queryWalletTransfers = async (filter, options) => {
  const queryFilter = { ...filter };
  const queryOptions = { ...options };

  if (queryOptions.startDate || queryOptions.endDate) {
    queryFilter.date = {};
    if (queryOptions.startDate) {
      queryFilter.date.$gte = new Date(queryOptions.startDate);
      delete queryOptions.startDate;
    }
    if (queryOptions.endDate) {
      queryFilter.date.$lte = new Date(queryOptions.endDate);
      delete queryOptions.endDate;
    }
  }

  return WalletTransfer.paginate(queryFilter, {
    ...queryOptions,
    sortBy: queryOptions.sortBy || 'date:desc,createdAt:desc',
  });
};

const getWalletTransferById = async (id) => {
  const transfer = await WalletTransfer.findById(id);
  if (!transfer) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Wallet transfer not found');
  }
  return transfer;
};

const deleteWalletTransfer = async (id) => {
  const transfer = await getWalletTransferById(id);
  const isWalletToAccount = transfer.direction === 'wallet_to_account';

  // Reverse the wallet-balance effect.
  await walletService.adjustWalletBalance({
    organizationId: transfer.organizationId,
    branchId: transfer.branchId,
    type: transfer.walletType,
    amount: transfer.amount,
    operation: isWalletToAccount ? 'add' : 'deduct',
    userId: transfer.createdBy,
  });

  await walletEntryService.deleteEntriesByReference(transfer._id, REFERENCE_MODEL);

  const ledgerEntry = await PersonalLedger.findOne({ referenceId: transfer._id, referenceModel: REFERENCE_MODEL });
  if (ledgerEntry) {
    await personalLedgerService.deleteEntry(ledgerEntry._id);
  }

  await transfer.deleteOne();
  return transfer;
};

module.exports = {
  createWalletTransfer,
  queryWalletTransfers,
  getWalletTransferById,
  deleteWalletTransfer,
};
