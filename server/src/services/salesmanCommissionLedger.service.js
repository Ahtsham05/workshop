const mongoose = require('mongoose');
const { SalesmanCommissionLedger } = require('../models');
const commissionRuleService = require('./commissionRule.service');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const getLastBalance = async (salesmanUserId, organizationId, session) => {
  const query = SalesmanCommissionLedger.findOne({ salesmanUserId, organizationId })
    .sort({ transactionDate: -1, createdAt: -1 })
    .select('balance');
  if (session) query.session(session);
  const last = await query;
  return last ? last.balance : 0;
};

/**
 * Append one ledger row and stamp its running balance from the salesman's last entry —
 * see the model comment for why this is an incremental update, not a full recompute.
 */
const writeEntry = async (entryBody, session) => {
  const currentBalance = await getLastBalance(entryBody.salesmanUserId, entryBody.organizationId, session);
  const balance = round2(currentBalance + (entryBody.credit || 0) - (entryBody.debit || 0));
  const [entry] = await SalesmanCommissionLedger.create(
    [{ ...entryBody, transactionDate: entryBody.transactionDate || new Date(), balance }],
    session ? { session } : undefined
  );
  return entry;
};

/**
 * Net commission currently standing for one invoice (credited minus already reversed) —
 * used both to avoid double-crediting and to cap how much a return can claw back.
 */
const getNetCommissionForInvoice = async (invoiceId, session) => {
  const pipeline = [
    {
      $match: {
        referenceId: new mongoose.Types.ObjectId(invoiceId),
        referenceModel: 'Invoice',
        transactionType: { $in: ['commission_earned', 'commission_reversed'] },
      },
    },
    { $group: { _id: null, credit: { $sum: '$credit' }, debit: { $sum: '$debit' } } },
  ];
  const aggQuery = SalesmanCommissionLedger.aggregate(pipeline);
  if (session) aggQuery.session(session);
  const [result] = await aggQuery;
  if (!result) return 0;
  return round2(result.credit - result.debit);
};

const getOriginalCommissionEntry = async (invoiceId, session) => {
  const query = SalesmanCommissionLedger.findOne({
    referenceId: invoiceId,
    referenceModel: 'Invoice',
    transactionType: 'commission_earned',
  }).select('credit rate');
  if (session) query.session(session);
  return query;
};

/**
 * Credit commission for a completed sale. Idempotent — a second call for the same
 * invoice (e.g. re-finalize, edit-triggered re-save) is a no-op once an entry exists.
 * @param {Object} params
 * @param {Object} params.invoice - Mongoose Invoice document (needs salesmanId, total, etc.)
 * @param {ObjectId} params.userId
 * @param {import('mongoose').ClientSession} [session]
 */
const creditCommissionEarned = async ({ invoice, userId }, session) => {
  if (!invoice || !invoice.salesmanId) return null;

  const existing = await getOriginalCommissionEntry(invoice._id, session);
  if (existing) return existing;

  const { rate } = await commissionRuleService.resolveCommissionRate({
    organizationId: invoice.organizationId,
    branchId: invoice.branchId,
    salesmanUserId: invoice.salesmanId,
    date: invoice.invoiceDate || invoice.createdAt || new Date(),
  });
  if (!rate || rate <= 0) return null;

  const amount = round2(invoice.total * (rate / 100));
  if (amount <= 0) return null;

  return writeEntry(
    {
      organizationId: invoice.organizationId,
      branchId: invoice.branchId,
      salesmanUserId: invoice.salesmanId,
      transactionType: 'commission_earned',
      transactionDate: invoice.invoiceDate || new Date(),
      reference: invoice.invoiceNumber,
      referenceId: invoice._id,
      referenceModel: 'Invoice',
      credit: amount,
      rate,
      saleAmount: invoice.total,
      createdBy: userId,
    },
    session
  );
};

/**
 * Fully reverse whatever commission is still outstanding for an invoice (cancel/delete).
 */
const reverseCommissionForInvoice = async ({ invoiceId, organizationId, branchId, salesmanUserId, reason, userId }, session) => {
  if (!salesmanUserId) return null;
  const net = await getNetCommissionForInvoice(invoiceId, session);
  if (net <= 0) return null;

  return writeEntry(
    {
      organizationId,
      branchId,
      salesmanUserId,
      transactionType: 'commission_reversed',
      referenceId: invoiceId,
      referenceModel: 'Invoice',
      debit: net,
      notes: reason,
      createdBy: userId,
    },
    session
  );
};

/**
 * Proportionally claw back commission for a (possibly partial) sales return, capped at
 * whatever's still outstanding for the invoice so repeated/overlapping returns can never
 * push the invoice's net commission below zero.
 * @param {Object} salesReturn - Mongoose SalesReturn document
 * @param {Object} invoice - the original Invoice document
 * @param {import('mongoose').ClientSession} [session]
 */
const reverseCommissionForSalesReturn = async (salesReturn, invoice, session) => {
  if (!invoice || !invoice.salesmanId || !invoice.total) return null;

  const original = await getOriginalCommissionEntry(invoice._id, session);
  if (!original || original.credit <= 0) return null;

  const proportion = Math.min(1, Number(salesReturn.totalAmount || 0) / Number(invoice.total));
  const proportionalAmount = round2(original.credit * proportion);
  if (proportionalAmount <= 0) return null;

  const net = await getNetCommissionForInvoice(invoice._id, session);
  const reversalAmount = Math.min(proportionalAmount, net);
  if (reversalAmount <= 0) return null;

  return writeEntry(
    {
      organizationId: salesReturn.organizationId,
      branchId: salesReturn.branchId,
      salesmanUserId: invoice.salesmanId,
      transactionType: 'commission_reversed',
      transactionDate: salesReturn.date || new Date(),
      reference: salesReturn.returnNumber,
      referenceId: invoice._id,
      referenceModel: 'Invoice',
      debit: reversalAmount,
      rate: original.rate,
      saleAmount: salesReturn.totalAmount,
      notes: `Sales return ${salesReturn.returnNumber}`,
      createdBy: salesReturn.createdBy,
    },
    session
  );
};

/**
 * Query for commission ledger entries
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const queryLedgerEntries = async (filter, options) => {
  const opts = {
    ...options,
    sortBy: options.sortBy || 'transactionDate:desc',
    populate: [{ path: 'salesmanUserId', select: 'name email' }],
  };
  return SalesmanCommissionLedger.paginate(filter, opts);
};

const getCurrentBalance = async (salesmanUserId, organizationId) => {
  return getLastBalance(salesmanUserId, organizationId);
};

/**
 * Debit the ledger for a commission payout — the caller (salesmanCommissionPayment.service)
 * is responsible for validating the amount against the current balance first.
 * @param {Object} params
 * @param {Object} params.payment - Mongoose SalesmanCommissionPayment document
 * @param {ObjectId} params.userId
 */
const recordCommissionPayment = async ({ payment, userId }) => {
  return writeEntry({
    organizationId: payment.organizationId,
    branchId: payment.branchId,
    salesmanUserId: payment.salesmanUserId,
    transactionType: 'commission_payment',
    transactionDate: payment.paymentDate || new Date(),
    reference: payment.reference,
    referenceId: payment._id,
    referenceModel: 'SalesmanCommissionPayment',
    debit: payment.amount,
    notes: payment.notes,
    createdBy: userId,
  });
};

/**
 * Re-stamp every entry's running balance for one salesman from scratch, in chronological
 * order. Only needed after a mid-ledger row is deleted (voiding a payment) — the
 * incremental writeEntry() path never needs this since it only ever appends.
 */
const recalculateBalances = async (salesmanUserId, organizationId) => {
  const entries = await SalesmanCommissionLedger.find({ salesmanUserId, organizationId }).sort({
    transactionDate: 1,
    createdAt: 1,
  });
  let balance = 0;
  for (const entry of entries) {
    balance = round2(balance + (entry.credit || 0) - (entry.debit || 0));
    if (entry.balance !== balance) {
      entry.balance = balance;
      // eslint-disable-next-line no-await-in-loop
      await entry.save();
    }
  }
};

/**
 * Delete the ledger row(s) written for a given reference (e.g. a voided payment) and
 * repair every later entry's running balance for that salesman.
 */
const deleteEntriesByReference = async (referenceId, referenceModel, salesmanUserId, organizationId) => {
  await SalesmanCommissionLedger.deleteMany({ referenceId, referenceModel });
  await recalculateBalances(salesmanUserId, organizationId);
};

module.exports = {
  creditCommissionEarned,
  reverseCommissionForInvoice,
  reverseCommissionForSalesReturn,
  recordCommissionPayment,
  recalculateBalances,
  deleteEntriesByReference,
  getNetCommissionForInvoice,
  queryLedgerEntries,
  getCurrentBalance,
};
