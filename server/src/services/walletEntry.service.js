const { WalletEntry } = require('../models');
const walletService = require('./wallet.service');

const upsertReferenceEntry = async (entryBody) => {
  return WalletEntry.findOneAndUpdate(
    {
      referenceId: entryBody.referenceId,
      referenceModel: entryBody.referenceModel,
      type: entryBody.type || 'in',
    },
    {
      ...entryBody,
      type: entryBody.type || 'in',
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );
};

const deleteEntriesByReference = async (referenceId, referenceModel) => {
  return WalletEntry.deleteMany({ referenceId, referenceModel });
};

/** Delete just one leg (type 'in' or 'out') of a reference's wallet entries. */
const deleteEntryByReferenceAndType = async (referenceId, referenceModel, type) => {
  return WalletEntry.deleteOne({ referenceId, referenceModel, type });
};

/**
 * Sync one leg (direction 'in' or 'out') of a cash movement against the
 * wallet ledger when paid via a wallet, and reverse the previous wallet
 * effect if the payment method/wallet/amount changed since the last sync.
 * Used by features (RepairJob, BillPayment, InstallmentPayment, ...) that
 * have a single paymentMethod field shared across create/update instead of
 * a bespoke wallet-sync routine like Invoice/Expense have.
 *
 * Callers are responsible for the non-wallet side (CashBook) — this only
 * owns the WalletEntry ledger + Wallet.balance for the given leg.
 */
const syncWalletPayment = async ({
  organizationId,
  branchId,
  referenceId,
  referenceModel,
  direction, // 'in' | 'out' — effect on the wallet balance when this leg is active
  amount,
  paymentMethod,
  walletType,
  previousPaymentMethod,
  previousWalletType,
  previousAmount,
  description,
  date,
  createdBy,
  updatedBy,
}) => {
  const isWallet = paymentMethod === 'wallet' && walletType;
  const wasWallet = previousPaymentMethod === 'wallet' && previousWalletType;
  const numericAmount = Number(amount || 0);
  const prevAmount = Number(previousAmount || 0);
  const userId = updatedBy || createdBy;

  if (isWallet && numericAmount > 0) {
    await upsertReferenceEntry({
      organizationId,
      branchId,
      walletType: String(walletType).trim(),
      type: direction,
      amount: numericAmount,
      referenceId,
      referenceModel,
      description,
      date,
      createdBy,
      updatedBy,
    });
  } else {
    await deleteEntryByReferenceAndType(referenceId, referenceModel, direction);
  }

  const addOp = direction === 'in' ? 'add' : 'deduct';
  const removeOp = direction === 'in' ? 'deduct' : 'add';

  if (wasWallet) {
    const prevWalletName = String(previousWalletType).trim();
    if (isWallet) {
      const walletName = String(walletType).trim();
      if (prevWalletName !== walletName) {
        if (prevAmount > 0) {
          await walletService.adjustWalletBalance({ organizationId, branchId, type: prevWalletName, amount: prevAmount, operation: removeOp, userId });
        }
        if (numericAmount > 0) {
          await walletService.adjustWalletBalance({ organizationId, branchId, type: walletName, amount: numericAmount, operation: addOp, userId });
        }
      } else {
        const delta = numericAmount - prevAmount;
        if (delta !== 0) {
          await walletService.adjustWalletBalance({
            organizationId,
            branchId,
            type: walletName,
            amount: Math.abs(delta),
            operation: delta > 0 ? addOp : removeOp,
            userId,
          });
        }
      }
    } else if (prevAmount > 0) {
      await walletService.adjustWalletBalance({ organizationId, branchId, type: prevWalletName, amount: prevAmount, operation: removeOp, userId });
    }
  } else if (isWallet && numericAmount > 0) {
    await walletService.adjustWalletBalance({ organizationId, branchId, type: String(walletType).trim(), amount: numericAmount, operation: addOp, userId });
  }
};

/** Reverse a wallet-paid leg entirely (used when deleting the source document). */
const reverseWalletPayment = async ({ organizationId, branchId, referenceId, referenceModel, direction, amount, paymentMethod, walletType, userId }) => {
  await deleteEntryByReferenceAndType(referenceId, referenceModel, direction);
  const numericAmount = Number(amount || 0);
  if (paymentMethod === 'wallet' && walletType && numericAmount > 0) {
    await walletService.adjustWalletBalance({
      organizationId,
      branchId,
      type: String(walletType).trim(),
      amount: numericAmount,
      operation: direction === 'in' ? 'deduct' : 'add',
      userId,
    });
  }
};

module.exports = {
  upsertReferenceEntry,
  deleteEntriesByReference,
  deleteEntryByReferenceAndType,
  syncWalletPayment,
  reverseWalletPayment,
};
