const httpStatus = require('http-status');
const { Wallet } = require('../models');
const ApiError = require('../utils/ApiError');

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
  }

  return wallet;
};

const createOrUpdateWallet = async ({ organizationId, branchId, type, balance = 0, commissionRate = 0, withdrawalCommissionRate = 0, depositCommissionRate = 0, id, userId }) => {
  let wallet;

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
    wallet.updatedBy = userId;
  } else {
    wallet = await Wallet.findOne({ organizationId, branchId, type });
    if (wallet) {
      wallet.balance = balance;
      wallet.commissionRate = commissionRate;
      wallet.withdrawalCommissionRate = withdrawalCommissionRate;
      wallet.depositCommissionRate = depositCommissionRate;
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
        createdBy: userId,
        updatedBy: userId,
      });
    }
  }

  await wallet.save();
  return wallet;
};

const adjustWalletBalance = async ({ organizationId, branchId, type, amount, operation, userId }) => {
  const wallet = await ensureWallet({ organizationId, branchId, type, userId });
  const numericAmount = Number(amount || 0);
  const nextBalance = operation === 'deduct' ? wallet.balance - numericAmount : wallet.balance + numericAmount;

  if (nextBalance < 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, `${type} wallet balance is insufficient`);
  }

  wallet.balance = nextBalance;
  wallet.updatedBy = userId;
  await wallet.save();

  return wallet;
};

const queryWallets = async (filter, options = {}) => {
  return Wallet.paginate(filter, {
    ...options,
    sortBy: options.sortBy || 'createdAt:desc',
    limit: options.limit || 10,
    page: options.page || 1,
  });
};

const getWalletById = async (walletId) => {
  return Wallet.findById(walletId);
};

module.exports = {
  ensureWallet,
  createOrUpdateWallet,
  adjustWalletBalance,
  queryWallets,
  getWalletById,
};
