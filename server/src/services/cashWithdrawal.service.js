const { CashWithdrawal } = require('../models');
const ApiError = require('../utils/ApiError');
const httpStatus = require('http-status');
const walletService = require('./wallet.service');
const cashBookService = require('./cashBook.service');

const calculateWithdrawalProfit = ({ amount, commissionRate = 0, extraCharge = 0 }) => {
  const commissionProfit = (Number(amount || 0) * Number(commissionRate || 0)) / 100;
  return commissionProfit + Number(extraCharge || 0);
};

const createCashWithdrawal = async (body) => {
  const profit = calculateWithdrawalProfit(body);
  const withdrawal = await CashWithdrawal.create({ ...body, profit });

  const isWithdrawal = withdrawal.transactionType === 'withdrawal';

  // Withdrawal: customer sends digital money → our wallet INCREASES, we give cash
  // Deposit: customer gives cash → we send digital → our wallet DECREASES
  await walletService.adjustWalletBalance({
    organizationId: withdrawal.organizationId,
    branchId: withdrawal.branchId,
    type: withdrawal.walletType,
    amount: withdrawal.amount,
    operation: isWithdrawal ? 'add' : 'deduct',
    userId: withdrawal.createdBy,
  });

  const customerLabel = withdrawal.customerName
    ? `${withdrawal.customerName}${withdrawal.customerNumber ? ` (${withdrawal.customerNumber})` : ''}`
    : withdrawal.customerNumber || 'customer';

  if (isWithdrawal) {
    // Withdrawal: customer sends digital → our wallet increases (income)
    await cashBookService.createEntry({
      organizationId: withdrawal.organizationId,
      branchId: withdrawal.branchId,
      type: 'income',
      source: 'other',
      amount: withdrawal.amount,
      paymentMethod: 'wallet',
      referenceId: withdrawal._id,
      referenceModel: 'CashWithdrawal',
      description: `Withdrawal: digital received from ${customerLabel} via ${withdrawal.walletType}`,
      date: withdrawal.date,
      createdBy: withdrawal.createdBy,
    });
    // Withdrawal: we pay cash to customer (expense)
    await cashBookService.createEntry({
      organizationId: withdrawal.organizationId,
      branchId: withdrawal.branchId,
      type: 'expense',
      source: 'other',
      amount: withdrawal.amount,
      paymentMethod: 'cash',
      referenceId: withdrawal._id,
      referenceModel: 'CashWithdrawal',
      description: `Withdrawal: cash paid to ${customerLabel}`,
      date: withdrawal.date,
      createdBy: withdrawal.createdBy,
    });
  } else {
    // Deposit: we send digital → our wallet decreases (expense)
    await cashBookService.createEntry({
      organizationId: withdrawal.organizationId,
      branchId: withdrawal.branchId,
      type: 'expense',
      source: 'other',
      amount: withdrawal.amount,
      paymentMethod: 'wallet',
      referenceId: withdrawal._id,
      referenceModel: 'CashWithdrawal',
      description: `Deposit: digital sent to ${customerLabel} via ${withdrawal.walletType}`,
      date: withdrawal.date,
      createdBy: withdrawal.createdBy,
    });
    // Deposit: we receive cash from customer (income)
    await cashBookService.createEntry({
      organizationId: withdrawal.organizationId,
      branchId: withdrawal.branchId,
      type: 'income',
      source: 'other',
      amount: withdrawal.amount,
      paymentMethod: 'cash',
      referenceId: withdrawal._id,
      referenceModel: 'CashWithdrawal',
      description: `Deposit: cash received from ${customerLabel}`,
      date: withdrawal.date,
      createdBy: withdrawal.createdBy,
    });
  }

  // Commission profit recorded as cash income for both types
  if (profit > 0) {
    await cashBookService.createEntry({
      organizationId: withdrawal.organizationId,
      branchId: withdrawal.branchId,
      type: 'income',
      source: 'other',
      amount: profit,
      paymentMethod: 'cash',
      referenceId: withdrawal._id,
      referenceModel: 'CashWithdrawal',
      description: `${isWithdrawal ? 'Withdrawal' : 'Deposit'} commission from ${customerLabel}`,
      date: withdrawal.date,
      createdBy: withdrawal.createdBy,
    });
  }

  return withdrawal;
};

const queryCashWithdrawals = async (filter, options) => {
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

  return CashWithdrawal.paginate(queryFilter, {
    ...queryOptions,
    sortBy: queryOptions.sortBy || 'date:desc',
  });
};

const getCashWithdrawalById = async (withdrawalId) => {
  const withdrawal = await CashWithdrawal.findById(withdrawalId);
  if (!withdrawal) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Cash withdrawal not found');
  }
  return withdrawal;
};

const updateCashWithdrawal = async (withdrawalId, updateBody) => {
  const withdrawal = await getCashWithdrawalById(withdrawalId);
  const oldIsWithdrawal = withdrawal.transactionType === 'withdrawal';

  // Reverse old wallet adjustment
  await walletService.adjustWalletBalance({
    organizationId: withdrawal.organizationId,
    branchId: withdrawal.branchId,
    type: withdrawal.walletType,
    amount: withdrawal.amount,
    operation: oldIsWithdrawal ? 'deduct' : 'add',
    userId: withdrawal.createdBy,
  });

  await cashBookService.deleteEntriesByReference(withdrawal._id, 'CashWithdrawal');

  Object.assign(withdrawal, updateBody);
  withdrawal.profit = calculateWithdrawalProfit(withdrawal);
  await withdrawal.save();

  const isWithdrawal = withdrawal.transactionType === 'withdrawal';

  // Apply new wallet adjustment
  await walletService.adjustWalletBalance({
    organizationId: withdrawal.organizationId,
    branchId: withdrawal.branchId,
    type: withdrawal.walletType,
    amount: withdrawal.amount,
    operation: isWithdrawal ? 'add' : 'deduct',
    userId: withdrawal.createdBy,
  });

  const customerLabel = withdrawal.customerName
    ? `${withdrawal.customerName}${withdrawal.customerNumber ? ` (${withdrawal.customerNumber})` : ''}`
    : withdrawal.customerNumber || 'customer';

  if (isWithdrawal) {
    await cashBookService.createEntry({
      organizationId: withdrawal.organizationId, branchId: withdrawal.branchId,
      type: 'income', source: 'other', amount: withdrawal.amount, paymentMethod: 'wallet',
      referenceId: withdrawal._id, referenceModel: 'CashWithdrawal',
      description: `Withdrawal: digital received from ${customerLabel} via ${withdrawal.walletType}`,
      date: withdrawal.date, createdBy: withdrawal.createdBy,
    });
    await cashBookService.createEntry({
      organizationId: withdrawal.organizationId, branchId: withdrawal.branchId,
      type: 'expense', source: 'other', amount: withdrawal.amount, paymentMethod: 'cash',
      referenceId: withdrawal._id, referenceModel: 'CashWithdrawal',
      description: `Withdrawal: cash paid to ${customerLabel}`,
      date: withdrawal.date, createdBy: withdrawal.createdBy,
    });
  } else {
    await cashBookService.createEntry({
      organizationId: withdrawal.organizationId, branchId: withdrawal.branchId,
      type: 'expense', source: 'other', amount: withdrawal.amount, paymentMethod: 'wallet',
      referenceId: withdrawal._id, referenceModel: 'CashWithdrawal',
      description: `Deposit: digital sent to ${customerLabel} via ${withdrawal.walletType}`,
      date: withdrawal.date, createdBy: withdrawal.createdBy,
    });
    await cashBookService.createEntry({
      organizationId: withdrawal.organizationId, branchId: withdrawal.branchId,
      type: 'income', source: 'other', amount: withdrawal.amount, paymentMethod: 'cash',
      referenceId: withdrawal._id, referenceModel: 'CashWithdrawal',
      description: `Deposit: cash received from ${customerLabel}`,
      date: withdrawal.date, createdBy: withdrawal.createdBy,
    });
  }

  if (withdrawal.profit > 0) {
    await cashBookService.createEntry({
      organizationId: withdrawal.organizationId, branchId: withdrawal.branchId,
      type: 'income', source: 'other', amount: withdrawal.profit, paymentMethod: 'cash',
      referenceId: withdrawal._id, referenceModel: 'CashWithdrawal',
      description: `${isWithdrawal ? 'Withdrawal' : 'Deposit'} commission from ${customerLabel}`,
      date: withdrawal.date, createdBy: withdrawal.createdBy,
    });
  }

  return withdrawal;
};

const deleteCashWithdrawal = async (withdrawalId) => {
  const withdrawal = await getCashWithdrawalById(withdrawalId);
  const isWithdrawal = withdrawal.transactionType === 'withdrawal';

  // Reverse wallet adjustment
  await walletService.adjustWalletBalance({
    organizationId: withdrawal.organizationId,
    branchId: withdrawal.branchId,
    type: withdrawal.walletType,
    amount: withdrawal.amount,
    operation: isWithdrawal ? 'deduct' : 'add',
    userId: withdrawal.createdBy,
  });

  await cashBookService.deleteEntriesByReference(withdrawal._id, 'CashWithdrawal');
  await withdrawal.deleteOne();
  return withdrawal;
};

const createCashWithdrawalsBatch = async (body) => {
  const { walletId, walletType, transactionType, commissionRate, date, entries, organizationId, branchId, createdBy } = body;
  const results = [];
  for (const entry of entries) {
    const singleBody = {
      organizationId,
      branchId,
      createdBy,
      walletId,
      walletType,
      transactionType,
      commissionRate: Number(commissionRate || 0),
      amount: Number(entry.amount),
      customerName: entry.customerName || undefined,
      customerNumber: entry.customerNumber || undefined,
      extraCharge: Number(entry.extraCharge || 0),
      notes: entry.notes || undefined,
      date: date || new Date(),
    };
    const created = await createCashWithdrawal(singleBody);
    results.push(created);
  }
  return results;
};

const deleteCashWithdrawalsBatch = async (ids) => {
  const results = { deleted: 0, failed: 0 };
  for (const id of ids) {
    try {
      await deleteCashWithdrawal(id);
      results.deleted += 1;
    } catch {
      results.failed += 1;
    }
  }
  return results;
};

module.exports = {
  calculateWithdrawalProfit,
  createCashWithdrawal,
  createCashWithdrawalsBatch,
  queryCashWithdrawals,
  updateCashWithdrawal,
  deleteCashWithdrawal,
  deleteCashWithdrawalsBatch,
};
