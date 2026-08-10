const httpStatus = require('http-status');
const { PartnerPayment, Partner, Expense } = require('../models');
const ApiError = require('../utils/ApiError');
const cashBookService = require('./cashBook.service');
const walletEntryService = require('./walletEntry.service');
const partnerProfitShareLedgerService = require('./partnerProfitShareLedger.service');
const expenseService = require('./expense.service');
const expenseCategoryService = require('./expenseCategory.service');

// Shared category so Expense Reports / Profit & Loss show a single "Partner Profit Share"
// line to total against — mirrors salesmanCommissionPayment.service.js's EXPENSE_CATEGORY_NAME.
const EXPENSE_CATEGORY_NAME = 'Partner Profit Share';

const EXPENSE_PAYMENT_METHOD = { cash: 'Cash', bank: 'Bank Transfer', wallet: 'Wallet' };

/**
 * Mirror this payout into the Expense collection — purely for Expense Report / Profit &
 * Loss visibility, NOT a second cash movement: `skipCashBookSync` keeps createExpense from
 * posting its own Cash Book/Wallet/accounts entries, since syncPaymentCashEntry already
 * recorded the real one. Same pattern salesmanCommissionPayment.service.js uses.
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
      description: `Profit share payment${payment.partnerName ? ` — ${payment.partnerName}` : ''}`,
      amount: payment.amount,
      paymentMethod: EXPENSE_PAYMENT_METHOD[payment.paymentMethod] || 'Cash',
      walletType: payment.paymentMethod === 'wallet' ? payment.walletType : undefined,
      date: payment.paymentDate || payment.createdAt,
      reference: payment.reference || undefined,
      notes: payment.notes || '',
      referenceId: payment._id,
      referenceModel: 'PartnerPayment',
      isPaid: true,
      createdBy: payment.createdBy,
    },
    { skipCashBookSync: true }
  );
};

const deleteExpenseForPayment = async (paymentId) => {
  await Expense.deleteMany({ referenceId: paymentId, referenceModel: 'PartnerPayment' });
};

/**
 * Cash Book (cash/bank) or Wallet (wallet) leg for a profit-share payout — single direction
 * (money leaving the business), same pattern as salesmanCommissionPayment.service.js.
 */
const syncPaymentCashEntry = async (payment) => {
  const isWallet = payment.paymentMethod === 'wallet' && payment.walletType;
  const commonFields = {
    organizationId: payment.organizationId,
    branchId: payment.branchId,
    referenceId: payment._id,
    referenceModel: 'PartnerPayment',
  };
  const description = `Profit share payment${payment.partnerName ? ` — ${payment.partnerName}` : ''}`;

  if (isWallet) {
    await cashBookService.deleteEntryByReferenceAndType(payment._id, 'PartnerPayment', 'expense', 'partner_share_payment');
  } else {
    await cashBookService.upsertReferenceEntry({
      ...commonFields,
      type: 'expense',
      source: 'partner_share_payment',
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
 * Pay out (some or all of) a partner's outstanding profit-share balance.
 * @param {Object} paymentBody
 * @param {ObjectId} userId
 * @returns {Promise<PartnerPayment>}
 */
const createPayment = async (paymentBody, userId) => {
  const amount = Number(paymentBody.amount);
  if (!amount || amount <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payment amount must be greater than zero');
  }

  const balance = await partnerProfitShareLedgerService.getCurrentBalance(paymentBody.partnerId, paymentBody.organizationId);
  if (amount > balance) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Cannot pay more than the outstanding balance of Rs ${balance.toFixed(2)}`);
  }

  const partner = await Partner.findById(paymentBody.partnerId).select('name');

  const payment = await PartnerPayment.create({
    ...paymentBody,
    amount,
    partnerName: partner?.name,
    createdBy: userId,
  });

  await partnerProfitShareLedgerService.recordSharePayment({ payment, userId });
  await syncPaymentCashEntry(payment);
  await syncExpenseForPayment(payment);

  return payment;
};

/**
 * Query for partner payments
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const queryPayments = async (filter, options) => {
  const opts = { ...options, sortBy: options.sortBy || 'paymentDate:desc' };
  return PartnerPayment.paginate(filter, opts);
};

const getPaymentById = async (id) => {
  return PartnerPayment.findById(id);
};

/**
 * Void a partner payment — reverses the ledger debit (repairing every later entry's
 * running balance) and the Cash Book/Wallet/Expense legs, then removes the payment record.
 * @param {ObjectId} paymentId
 * @returns {Promise<PartnerPayment>}
 */
const deletePaymentById = async (paymentId) => {
  const payment = await PartnerPayment.findById(paymentId);
  if (!payment) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Partner payment not found');
  }

  await partnerProfitShareLedgerService.deleteEntriesByReference(
    payment._id,
    'PartnerPayment',
    payment.partnerId,
    payment.organizationId
  );

  await cashBookService.deleteEntriesByReference(payment._id, 'PartnerPayment');
  await deleteExpenseForPayment(payment._id);
  await walletEntryService.reverseWalletPayment({
    organizationId: payment.organizationId,
    branchId: payment.branchId,
    referenceId: payment._id,
    referenceModel: 'PartnerPayment',
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
