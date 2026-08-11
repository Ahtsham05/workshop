const httpStatus = require('http-status');
const { Wallet, LoadPurchase, LoadTransaction, CashWithdrawal, SimSale, WalletTransfer } = require('../models');
const ApiError = require('../utils/ApiError');
const accountsSystemService = require('./accountsSystem.service');
const cashBookService = require('./cashBook.service');

/**
 * The "Cash in Hand" Bank Account (accountType: 'cash') is meant to always agree with the
 * Cash Book / Track Cash "Cash in Hand" figure — Cash Book already aggregates cash activity
 * from every module (sales, purchases, expenses, vouchers, ...), so it's the more complete,
 * trustworthy number. Called with no date range, `getCashInHandSummary` returns the all-time
 * running total (manual opening balance + every income/expense entry ever posted), i.e.
 * "cash in hand right now" — exactly what a cash-type wallet's balance should read.
 */
const resolveCashInHandBalance = async (organizationId, branchId) => {
  const summary = await cashBookService.getCashInHandSummary({ organizationId, branchId });
  return summary.closingBalance;
};

const getWalletFilter = ({ organizationId, branchId, type }) => ({
  organizationId,
  branchId,
  type,
});

const ensureWallet = async ({ organizationId, branchId, type, userId }) => {
  let wallet = await Wallet.findOne(getWalletFilter({ organizationId, branchId, type }));

  if (!wallet) {
    wallet = await Wallet.create({
      organizationId,
      branchId,
      type,
      balance: 0,
      createdBy: userId,
      updatedBy: userId,
    });
    accountsSystemService
      .ensureWalletAccount({ organizationId, branchId, createdBy: userId }, wallet)
      .catch(() => {});
  }

  return wallet;
};

const createOrUpdateWallet = async ({
  organizationId,
  branchId,
  type,
  balance = 0,
  commissionRate = 0,
  withdrawalCommissionRate = 0,
  depositCommissionRate = 0,
  accountType,
  bankName,
  accountNumber,
  branchName,
  id,
  userId,
}) => {
  let wallet;
  // '' (cleared select) must not hit Mongoose's enum validator — normalize to undefined.
  const normalizedAccountType = accountType || undefined;

  // Cash-type is meant to be a singular concept per branch — the "Cash in Hand" account
  // that Cash Book balance gets overlaid onto (see overlayCashInHandBalances/
  // resolveCashInHandBalance above). A second wallet accidentally marked cash-type would
  // silently start showing/using that same live Cash Book figure instead of its own real
  // balance, masking its true balance and, once any transaction touches it, corrupting its
  // stored balance too (adjustWalletBalance bases cash-type math on Cash Book, not the
  // stored field). Block it outright rather than letting it happen quietly.
  if (normalizedAccountType === 'cash') {
    const existingCashWallet = await Wallet.findOne({
      organizationId,
      branchId,
      accountType: 'cash',
      ...(id ? { _id: { $ne: id } } : {}),
    });
    if (existingCashWallet) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `"${existingCashWallet.type}" is already this branch's Cash account — only one Cash-type account is allowed per branch. Choose "Bank" or "Mobile Wallet" instead.`
      );
    }
  }

  if (id) {
    wallet = await Wallet.findOne({ _id: id, organizationId, branchId });
    if (!wallet) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Wallet not found');
    }
    wallet.type = type;
    wallet.balance = balance;
    wallet.commissionRate = commissionRate;
    wallet.withdrawalCommissionRate = withdrawalCommissionRate;
    wallet.depositCommissionRate = depositCommissionRate;
    wallet.accountType = normalizedAccountType;
    wallet.bankName = bankName || undefined;
    wallet.accountNumber = accountNumber || undefined;
    wallet.branchName = branchName || undefined;
    wallet.updatedBy = userId;
  } else {
    wallet = await Wallet.findOne({ organizationId, branchId, type });
    if (wallet) {
      wallet.balance = balance;
      wallet.commissionRate = commissionRate;
      wallet.withdrawalCommissionRate = withdrawalCommissionRate;
      wallet.depositCommissionRate = depositCommissionRate;
      wallet.accountType = normalizedAccountType;
      wallet.bankName = bankName || undefined;
      wallet.accountNumber = accountNumber || undefined;
      wallet.branchName = branchName || undefined;
      wallet.updatedBy = userId;
    } else {
      wallet = new Wallet({
        organizationId,
        branchId,
        type,
        balance,
        commissionRate,
        withdrawalCommissionRate,
        depositCommissionRate,
        accountType: normalizedAccountType,
        bankName: bankName || undefined,
        accountNumber: accountNumber || undefined,
        branchName: branchName || undefined,
        createdBy: userId,
        updatedBy: userId,
      });
    }
  }

  await wallet.save();

  // Give the wallet a dedicated ledger account so its transactions post real
  // double-entry journal lines. Fire-and-forget: accounting must never block
  // wallet management.
  accountsSystemService
    .ensureWalletAccount({ organizationId, branchId, createdBy: userId }, wallet)
    .catch(() => {});

  return wallet;
};

const adjustWalletBalance = async ({ organizationId, branchId, type, amount, operation, userId }) => {
  const wallet = await ensureWallet({ organizationId, branchId, type, userId });
  const numericAmount = Number(amount || 0);

  // A cash-type wallet's true available balance is Cash Book's, not the stored field (which
  // only reflects wallet-ledger-driven movements, not the full cash history every other
  // module has been posting to Cash Book all along) — basing the sufficiency check on the
  // stale stored value would falsely reject payments the business can actually afford.
  const baseBalance =
    wallet.accountType === 'cash' ? await resolveCashInHandBalance(organizationId, branchId) : wallet.balance;

  const nextBalance = operation === 'deduct' ? baseBalance - numericAmount : baseBalance + numericAmount;

  if (nextBalance < 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, `${type} wallet balance is insufficient`);
  }

  wallet.balance = nextBalance;
  wallet.updatedBy = userId;
  await wallet.save();

  return wallet;
};

const DEFAULT_CASH_WALLET_NAME = 'Cash in Hand';

/**
 * Every org/branch should always have a "Cash in Hand" bank account to pay from — auto-create
 * one the first time wallets are listed for a branch that doesn't have a cash-type wallet yet.
 * Checked by `accountType: 'cash'` specifically (not "branch has zero wallets") so branches that
 * already have other wallets (JazzCash, a bank account, ...) but never got a cash-type one still
 * receive it — this is the one auto-heal case intentionally allowed to keep firing indefinitely;
 * deleting other wallet types is never "healed" back, only a missing cash-type account is.
 */
const ensureDefaultCashWallet = async ({ organizationId, branchId, userId }) => {
  const hasCashWallet = await Wallet.exists({ organizationId, branchId, accountType: 'cash' });
  if (hasCashWallet) return;

  // A wallet literally named "Cash in Hand" may already exist without accountType set
  // (created before that field existed, or left blank in the manual form) — upgrade it in
  // place instead of creating a same-named duplicate.
  const existingByName = await Wallet.findOne({
    organizationId,
    branchId,
    type: { $regex: `^${DEFAULT_CASH_WALLET_NAME}$`, $options: 'i' },
  });
  if (existingByName) {
    existingByName.accountType = 'cash';
    existingByName.updatedBy = userId;
    await existingByName.save();
    return;
  }

  const wallet = await Wallet.create({
    organizationId,
    branchId,
    type: DEFAULT_CASH_WALLET_NAME,
    accountType: 'cash',
    balance: 0,
    createdBy: userId,
    updatedBy: userId,
  });
  accountsSystemService
    .ensureWalletAccount({ organizationId, branchId, createdBy: userId }, wallet)
    .catch(() => {});
};

/** Overlay the live Cash Book balance onto every cash-type wallet in `wallets` (in place). */
const overlayCashInHandBalances = async (wallets, organizationId, branchId) => {
  const cashWallets = wallets.filter((w) => w.accountType === 'cash');
  if (cashWallets.length === 0) return;

  const liveBalance = await resolveCashInHandBalance(organizationId, branchId);
  cashWallets.forEach((w) => {
    w.balance = liveBalance;
  });
};

const queryWallets = async (filter, options = {}) => {
  const result = await Wallet.paginate(filter, {
    ...options,
    sortBy: options.sortBy || 'createdAt:desc',
    limit: options.limit || 10,
    page: options.page || 1,
  });

  if (filter.organizationId && filter.branchId) {
    await overlayCashInHandBalances(result.results, filter.organizationId, filter.branchId);
  }

  return result;
};

const getWalletById = async (walletId) => {
  const wallet = await Wallet.findById(walletId);
  if (wallet && wallet.accountType === 'cash') {
    wallet.balance = await resolveCashInHandBalance(wallet.organizationId, wallet.branchId);
  }
  return wallet;
};

const deleteWallet = async ({ walletId, organizationId, branchId }) => {
  const wallet = await Wallet.findOne({ _id: walletId, organizationId, branchId });

  if (!wallet) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Wallet not found');
  }

  await Promise.all([
    LoadTransaction.deleteMany({ organizationId, branchId, $or: [{ walletId: wallet._id }, { walletType: wallet.type }] }),
    CashWithdrawal.deleteMany({ organizationId, branchId, $or: [{ walletId: wallet._id }, { walletType: wallet.type }] }),
    LoadPurchase.deleteMany({ organizationId, branchId, walletType: wallet.type }),
    SimSale.deleteMany({ organizationId, branchId, walletType: wallet.type }),
    WalletTransfer.deleteMany({ organizationId, branchId, $or: [{ walletId: wallet._id }, { walletType: wallet.type }] }),
  ]);

  await wallet.deleteOne();
  return wallet;
};

module.exports = {
  ensureWallet,
  ensureDefaultCashWallet,
  createOrUpdateWallet,
  adjustWalletBalance,
  queryWallets,
  getWalletById,
  deleteWallet,
  resolveCashInHandBalance,
};
