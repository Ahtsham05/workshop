const httpStatus = require('http-status');
const { SalesmanCommissionPayment, Expense, SalesmanProfile } = require('../models');
const ApiError = require('../utils/ApiError');
const cashBookService = require('./cashBook.service');
const walletEntryService = require('./walletEntry.service');
const salesmanCommissionLedgerService = require('./salesmanCommissionLedger.service');
const expenseService = require('./expense.service');
const expenseCategoryService = require('./expenseCategory.service');

// Shared category (not one-per-salesman like employeeLedger's per-employee category) so
// Expense Reports / Profit & Loss show a single "Salesman Commission" line to total against.
const EXPENSE_CATEGORY_NAME = 'Salesman Commission';

const EXPENSE_PAYMENT_METHOD = { cash: 'Cash', bank: 'Bank Transfer', wallet: 'Wallet' };

/**
 * Mirror this payout into the Expense collection — purely for Expense Report / Profit &
 * Loss visibility (both aggregate off Expense.amount, not Cash Book), NOT a second cash
 * movement: `skipCashBookSync` keeps createExpense from posting its own Cash Book/Wallet/
 * accounts entries, since syncPaymentCashEntry already recorded the real one above.
 * Same pattern employeeLedger.service.js uses to make salary payments show as expenses.
 */
const syncExpenseForPayment = async (payment) => {
  await expenseCategoryService.findOrCreateEmployeeCategory(
    payment.organizationId,
    payment.branchId,
    payment.createdBy,
    EXPENSE_CATEGORY_NAME,
  );

  return expenseService.createExpense(
    {
      organizationId: payment.organizationId,
      branchId: payment.branchId,
      category: EXPENSE_CATEGORY_NAME,
      description: `Commission payment${payment.salesmanName ? ` — ${payment.salesmanName}` : ''}`,
      amount: payment.amount,
      paymentMethod: EXPENSE_PAYMENT_METHOD[payment.paymentMethod] || 'Cash',
      walletType: payment.paymentMethod === 'wallet' ? payment.walletType : undefined,
      date: payment.paymentDate || payment.createdAt,
      reference: payment.reference || undefined,
      notes: payment.notes || '',
      referenceId: payment._id,
      referenceModel: 'SalesmanCommissionPayment',
      isPaid: true,
      createdBy: payment.createdBy,
    },
    { skipCashBookSync: true }
  );
};

const deleteExpenseForPayment = async (paymentId) => {
  await Expense.deleteMany({ referenceId: paymentId, referenceModel: 'SalesmanCommissionPayment' });
};

/**
 * Cash Book (cash/bank) or Wallet (wallet) leg for a commission payout — single direction
 * (money leaving the business), unlike billPayment's two-leg collection+payout pattern.
 */
const syncPaymentCashEntry = async (payment) => {
  const isWallet = payment.paymentMethod === 'wallet' && payment.walletType;
  const commonFields = {
    organizationId: payment.organizationId,
    branchId: payment.branchId,
    referenceId: payment._id,
    referenceModel: 'SalesmanCommissionPayment',
  };
  const description = `Commission payment${payment.salesmanName ? ` — ${payment.salesmanName}` : ''}`;

  if (isWallet) {
    await cashBookService.deleteEntryByReferenceAndType(payment._id, 'SalesmanCommissionPayment', 'expense', 'commission_payment');
  } else {
    await cashBookService.upsertReferenceEntry({
      ...commonFields,
      type: 'expense',
      source: 'commission_payment',
      paymentMethod: payment.paymentMethod,
      amount: payment.amount,
      date: payment.paymentDate || payment.createdAt,
      description,
      createdBy: payment.createdBy,
    });
  }

  await walletEntryService.syncWalletPayment({
    ...commonFields,
    direction: 'out',
    amount: payment.amount,
    paymentMethod: payment.paymentMethod,
    walletType: payment.walletType,
    description,
    date: payment.paymentDate || payment.createdAt,
    createdBy: payment.createdBy,
  });
};

/**
 * Pay out (some or all of) a salesman's outstanding commission balance.
 * @param {Object} paymentBody
 * @param {ObjectId} userId
 * @returns {Promise<SalesmanCommissionPayment>}
 */
const createPayment = async (paymentBody, userId) => {
  const amount = Number(paymentBody.amount);
  if (!amount || amount <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payment amount must be greater than zero');
  }

  const balance = await salesmanCommissionLedgerService.getCurrentBalance(paymentBody.salesmanId, paymentBody.organizationId);
  if (amount > balance) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Cannot pay more than the outstanding balance of Rs ${balance.toFixed(2)}`);
  }

  const salesman = await SalesmanProfile.findById(paymentBody.salesmanId).select('name');

  const payment = await SalesmanCommissionPayment.create({
    ...paymentBody,
    amount,
    salesmanName: salesman?.name,
    createdBy: userId,
  });

  await salesmanCommissionLedgerService.recordCommissionPayment({ payment, userId });
  await syncPaymentCashEntry(payment);
  await syncExpenseForPayment(payment);

  return payment;
};

/**
 * Query for commission payments
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const queryPayments = async (filter, options) => {
  const opts = { ...options, sortBy: options.sortBy || 'paymentDate:desc' };
  return SalesmanCommissionPayment.paginate(filter, opts);
};

const getPaymentById = async (id) => {
  return SalesmanCommissionPayment.findById(id);
};

/**
 * Void a commission payment — reverses the ledger debit (repairing every later entry's
 * running balance) and the Cash Book/Wallet legs, then removes the payment record.
 * @param {ObjectId} paymentId
 * @returns {Promise<SalesmanCommissionPayment>}
 */
const deletePaymentById = async (paymentId) => {
  const payment = await SalesmanCommissionPayment.findById(paymentId);
  if (!payment) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Commission payment not found');
  }

  await salesmanCommissionLedgerService.deleteEntriesByReference(
    payment._id,
    'SalesmanCommissionPayment',
    payment.salesmanId,
    payment.organizationId
  );

  await cashBookService.deleteEntriesByReference(payment._id, 'SalesmanCommissionPayment');
  await deleteExpenseForPayment(payment._id);
  await walletEntryService.reverseWalletPayment({
    organizationId: payment.organizationId,
    branchId: payment.branchId,
    referenceId: payment._id,
    referenceModel: 'SalesmanCommissionPayment',
    direction: 'out',
    amount: payment.amount,
    paymentMethod: payment.paymentMethod,
    walletType: payment.walletType,
    userId: payment.createdBy,
  });

  await payment.deleteOne();
  return payment;
};

module.exports = {
  createPayment,
  queryPayments,
  getPaymentById,
  deletePaymentById,
};
