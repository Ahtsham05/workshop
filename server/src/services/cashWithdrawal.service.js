const { CashWithdrawal } = require('../models');
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

module.exports = {
  calculateWithdrawalProfit,
  createCashWithdrawal,
  queryCashWithdrawals,
};
