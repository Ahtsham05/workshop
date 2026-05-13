const { CashWithdrawal, Customer } = require('../models');
const ApiError = require('../utils/ApiError');
const httpStatus = require('http-status');
const walletService = require('./wallet.service');
const cashBookService = require('./cashBook.service');
const customerLedgerService = require('./customerLedger.service');

const sanitizeCustomerId = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return value;
};

const resolveLinkedCustomer = async ({ customerId, organizationId, branchId }) => {
  const normalizedCustomerId = sanitizeCustomerId(customerId);
  if (!normalizedCustomerId) {
    return null;
  }

  const customer = await Customer.findOne({
    _id: normalizedCustomerId,
    organizationId,
    branchId,
  }).select('name');

  if (!customer) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Selected customer not found in this branch');
  }

  return customer;
};

const normalizeCashAmount = ({ amount, cashAmount }) => {
  const normalizedCashAmount = Number(cashAmount);
  if (!Number.isFinite(normalizedCashAmount) || normalizedCashAmount < 0) {
    return 0;
  }
  return normalizedCashAmount;
};

const calculateSettlementProfit = ({ amount, cashAmount, transactionType }) => {
  const totalAmount = Number(amount) || 0;
  const settledAmount = Number(cashAmount) || 0;
  if (transactionType === 'withdrawal') {
    // Wallet received amount - cash paid amount = margin
    return Math.max(0, totalAmount - settledAmount);
  }
  // Deposit: cash collected - wallet sent amount = margin
  return Math.max(0, settledAmount - totalAmount);
};

const calculateWithdrawalProfit = ({ amount, cashAmount, transactionType = 'withdrawal', commissionRate = 0, extraCharge = 0 }) => {
  const commissionProfit = (Number(amount || 0) * Number(commissionRate || 0)) / 100;
  const settlementProfit = calculateSettlementProfit({ amount, cashAmount, transactionType });
  return commissionProfit + Number(extraCharge || 0) + settlementProfit;
};

/** Cash book “commission/profit” line only when user entered commission % or extra charges */
const hasExplicitCommissionOrExtra = ({ commissionRate, extraCharge }) =>
  Number(commissionRate || 0) > 0 || Number(extraCharge || 0) > 0;

const syncCustomerLedgerForCashWithdrawal = async (withdrawal) => {
  await customerLedgerService.deleteLedgerEntriesByReference(withdrawal._id);

  if (!withdrawal.customerId) {
    return;
  }

  const isWithdrawal = withdrawal.transactionType === 'withdrawal';
  const settlementLabel = isWithdrawal ? 'Withdrawal' : 'Deposit';
  const reference = `${isWithdrawal ? 'CW-WITH' : 'CW-DEPO'}-${String(withdrawal._id).slice(-6).toUpperCase()}`;
  const cashAmount = Number(withdrawal.cashAmount) || 0;
  const settledAgainstPrincipal = Math.min(cashAmount, Number(withdrawal.amount) || 0);
  const remainingAmount = Math.max(0, (Number(withdrawal.amount) || 0) - cashAmount);
  if (isWithdrawal) {
    await customerLedgerService.createLedgerEntry({
      organizationId: withdrawal.organizationId,
      branchId: withdrawal.branchId,
      customer: withdrawal.customerId,
      transactionType: 'payment_made',
      transactionDate: withdrawal.date,
      reference,
      referenceId: withdrawal._id,
      description: `${settlementLabel}: cash paid`,
      debit: cashAmount,
      credit: 0,
      paymentMethod: 'Cash',
      notes: withdrawal.notes || `Wallet: ${withdrawal.walletType}`,
    });

    if (remainingAmount > 0) {
      const remainderDate = new Date(withdrawal.date);
      remainderDate.setSeconds(remainderDate.getSeconds() + 1);
      await customerLedgerService.createLedgerEntry({
        organizationId: withdrawal.organizationId,
        branchId: withdrawal.branchId,
        customer: withdrawal.customerId,
        transactionType: 'payment_made',
        transactionDate: remainderDate,
        reference,
        referenceId: withdrawal._id,
        description: `${settlementLabel}: cash payable remaining`,
        debit: remainingAmount,
        credit: 0,
        paymentMethod: 'Credit',
        notes: withdrawal.notes || `Wallet: ${withdrawal.walletType}`,
      });
    }
    return;
  }

  // Deposit: track full receivable then reduce by received cash
  await customerLedgerService.createLedgerEntry({
    organizationId: withdrawal.organizationId,
    branchId: withdrawal.branchId,
    customer: withdrawal.customerId,
    transactionType: 'sale',
    transactionDate: withdrawal.date,
    reference,
    referenceId: withdrawal._id,
    description: `${settlementLabel}: cash receivable`,
    debit: Number(withdrawal.amount) || 0,
    credit: 0,
    paymentMethod: 'Credit',
    notes: withdrawal.notes || `Wallet: ${withdrawal.walletType}`,
  });

  if (cashAmount > 0) {
    const paymentDate = new Date(withdrawal.date);
    paymentDate.setSeconds(paymentDate.getSeconds() + 1);
    await customerLedgerService.createLedgerEntry({
      organizationId: withdrawal.organizationId,
      branchId: withdrawal.branchId,
      customer: withdrawal.customerId,
      transactionType: 'payment_received',
      transactionDate: paymentDate,
      reference,
      referenceId: withdrawal._id,
      description: `${settlementLabel}: cash received`,
      debit: 0,
      credit: settledAgainstPrincipal,
      paymentMethod: 'Cash',
      notes: withdrawal.notes || `Wallet: ${withdrawal.walletType}`,
    });
  }
};

const createCashWithdrawal = async (body) => {
  const linkedCustomer = await resolveLinkedCustomer({
    customerId: body.customerId,
    organizationId: body.organizationId,
    branchId: body.branchId,
  });
  const cashAmount = normalizeCashAmount({ amount: body.amount, cashAmount: body.cashAmount ?? body.amount });
  if (cashAmount > Number(body.amount || 0)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cash paid/received must be less than or equal to amount');
  }
  const profit = calculateWithdrawalProfit({ ...body, cashAmount });
  const withdrawal = await CashWithdrawal.create({
    ...body,
    customerId: linkedCustomer ? linkedCustomer._id : undefined,
    customerName: linkedCustomer ? linkedCustomer.name : (body.customerName || ''),
    cashAmount,
    profit,
  });

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
    if (cashAmount > 0) {
      await cashBookService.createEntry({
        organizationId: withdrawal.organizationId,
        branchId: withdrawal.branchId,
        type: 'expense',
        source: 'other',
        amount: cashAmount,
        paymentMethod: 'cash',
        referenceId: withdrawal._id,
        referenceModel: 'CashWithdrawal',
        description: `Withdrawal: cash paid to ${customerLabel}`,
        date: withdrawal.date,
        createdBy: withdrawal.createdBy,
      });
    }
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
    if (cashAmount > 0) {
      await cashBookService.createEntry({
        organizationId: withdrawal.organizationId,
        branchId: withdrawal.branchId,
        type: 'income',
        source: 'other',
        amount: cashAmount,
        paymentMethod: 'cash',
        referenceId: withdrawal._id,
        referenceModel: 'CashWithdrawal',
        description: `Deposit: cash received from ${customerLabel}`,
        date: withdrawal.date,
        createdBy: withdrawal.createdBy,
      });
    }
  }

  // Commission / extra-charge profit as cash income (omit when both are zero — no phantom profit line)
  if (hasExplicitCommissionOrExtra(withdrawal) && profit > 0) {
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

  await syncCustomerLedgerForCashWithdrawal(withdrawal);

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
    sortBy: queryOptions.sortBy || 'date:desc,createdAt:desc',
    populate: 'customerId',
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
  const linkedCustomer = await resolveLinkedCustomer({
    customerId: Object.prototype.hasOwnProperty.call(updateBody, 'customerId')
      ? updateBody.customerId
      : withdrawal.customerId,
    organizationId: withdrawal.organizationId,
    branchId: withdrawal.branchId,
  });
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
  withdrawal.customerId = linkedCustomer ? linkedCustomer._id : undefined;
  withdrawal.customerName = linkedCustomer ? linkedCustomer.name : (withdrawal.customerName || '');
  withdrawal.cashAmount = normalizeCashAmount({
    amount: withdrawal.amount,
    cashAmount: withdrawal.cashAmount ?? withdrawal.amount,
  });
  if (Number(withdrawal.cashAmount || 0) > Number(withdrawal.amount || 0)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cash paid/received must be less than or equal to amount');
  }
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
    if (Number(withdrawal.cashAmount) > 0) {
      await cashBookService.createEntry({
        organizationId: withdrawal.organizationId, branchId: withdrawal.branchId,
        type: 'expense', source: 'other', amount: withdrawal.cashAmount, paymentMethod: 'cash',
        referenceId: withdrawal._id, referenceModel: 'CashWithdrawal',
        description: `Withdrawal: cash paid to ${customerLabel}`,
        date: withdrawal.date, createdBy: withdrawal.createdBy,
      });
    }
  } else {
    await cashBookService.createEntry({
      organizationId: withdrawal.organizationId, branchId: withdrawal.branchId,
      type: 'expense', source: 'other', amount: withdrawal.amount, paymentMethod: 'wallet',
      referenceId: withdrawal._id, referenceModel: 'CashWithdrawal',
      description: `Deposit: digital sent to ${customerLabel} via ${withdrawal.walletType}`,
      date: withdrawal.date, createdBy: withdrawal.createdBy,
    });
    if (Number(withdrawal.cashAmount) > 0) {
      await cashBookService.createEntry({
        organizationId: withdrawal.organizationId, branchId: withdrawal.branchId,
        type: 'income', source: 'other', amount: withdrawal.cashAmount, paymentMethod: 'cash',
        referenceId: withdrawal._id, referenceModel: 'CashWithdrawal',
        description: `Deposit: cash received from ${customerLabel}`,
        date: withdrawal.date, createdBy: withdrawal.createdBy,
      });
    }
  }

  if (hasExplicitCommissionOrExtra(withdrawal) && withdrawal.profit > 0) {
    await cashBookService.createEntry({
      organizationId: withdrawal.organizationId, branchId: withdrawal.branchId,
      type: 'income', source: 'other', amount: withdrawal.profit, paymentMethod: 'cash',
      referenceId: withdrawal._id, referenceModel: 'CashWithdrawal',
      description: `${isWithdrawal ? 'Withdrawal' : 'Deposit'} commission from ${customerLabel}`,
      date: withdrawal.date, createdBy: withdrawal.createdBy,
    });
  }

  await syncCustomerLedgerForCashWithdrawal(withdrawal);

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
  await customerLedgerService.deleteLedgerEntriesByReference(withdrawal._id);
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
      customerId: entry.customerId || undefined,
      cashAmount: Number(entry.cashAmount ?? entry.amount),
      customerName: entry.customerName || undefined,
      customerNumber: entry.customerNumber || undefined,
      customerAccountType: entry.customerAccountType || undefined,
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
