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
 * Net commission currently standing for one sale (credited minus already reversed) — used
 * both to avoid double-crediting and to cap how much a reversal/return can claw back.
 * Works across any sale type — Invoice, SimSale, LoadTransaction, RepairJob,
 * ServiceInvoice — since `referenceModel` is what scopes the match, not a hardcoded type.
 */
const getNetCommissionForReference = async (referenceId, referenceModel, session) => {
  const pipeline = [
    {
      $match: {
        referenceId: new mongoose.Types.ObjectId(referenceId),
        referenceModel,
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

const getOriginalCommissionEntry = async (referenceId, referenceModel, session) => {
  const query = SalesmanCommissionLedger.findOne({
    referenceId,
    referenceModel,
    transactionType: 'commission_earned',
  }).select('credit rate');
  if (session) query.session(session);
  return query;
};

/**
 * Credit commission for a completed sale of any type. Idempotent — a second call for the
 * same reference (e.g. re-save on edit) is a no-op once an entry exists.
 * @param {Object} params
 * @param {ObjectId} params.organizationId
 * @param {ObjectId} params.branchId
 * @param {ObjectId} params.salesmanUserId
 * @param {ObjectId} params.referenceId - the sale document's _id
 * @param {string} params.referenceModel - 'Invoice' | 'SimSale' | 'LoadTransaction' | 'RepairJob' | 'ServiceInvoice'
 * @param {string} [params.reference] - human-readable number (invoice #, job #, etc.) for display
 * @param {number} params.saleAmount - the amount commission is calculated against
 * @param {Date} [params.date] - transaction date, and the date used to resolve the applicable rate
 * @param {ObjectId} params.userId
 * @param {import('mongoose').ClientSession} [session]
 */
const creditCommissionEarned = async (
  { organizationId, branchId, salesmanUserId, referenceId, referenceModel, reference, saleAmount, date, userId },
  session
) => {
  if (!salesmanUserId || !referenceId || !referenceModel) return null;

  const existing = await getOriginalCommissionEntry(referenceId, referenceModel, session);
  if (existing) return existing;

  const { rate } = await commissionRuleService.resolveCommissionRate({
    organizationId,
    branchId,
    salesmanUserId,
    date: date || new Date(),
    module: referenceModel,
  });
  if (!rate || rate <= 0) return null;

  const amount = round2(Number(saleAmount || 0) * (rate / 100));
  if (amount <= 0) return null;

  return writeEntry(
    {
      organizationId,
      branchId,
      salesmanUserId,
      transactionType: 'commission_earned',
      transactionDate: date || new Date(),
      reference,
      referenceId,
      referenceModel,
      credit: amount,
      rate,
      saleAmount,
      createdBy: userId,
    },
    session
  );
};

/**
 * Fully reverse whatever commission is still outstanding for a sale (cancel/delete) —
 * works across any sale type, see creditCommissionEarned.
 */
const reverseCommissionForReference = async (
  { referenceId, referenceModel, organizationId, branchId, salesmanUserId, reason, userId },
  session
) => {
  if (!salesmanUserId) return null;
  const net = await getNetCommissionForReference(referenceId, referenceModel, session);
  if (net <= 0) return null;

  return writeEntry(
    {
      organizationId,
      branchId,
      salesmanUserId,
      transactionType: 'commission_reversed',
      referenceId,
      referenceModel,
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
 * push the invoice's net commission below zero. Invoice-specific (sales returns only
 * exist against Invoice sales in this app) — other sale types just fully reverse via
 * reverseCommissionForReference on delete since they have no partial-return concept.
 * @param {Object} salesReturn - Mongoose SalesReturn document
 * @param {Object} invoice - the original Invoice document
 * @param {import('mongoose').ClientSession} [session]
 */
const reverseCommissionForSalesReturn = async (salesReturn, invoice, session) => {
  if (!invoice || !invoice.salesmanId || !invoice.total) return null;

  const original = await getOriginalCommissionEntry(invoice._id, 'Invoice', session);
  if (!original || original.credit <= 0) return null;

  const proportion = Math.min(1, Number(salesReturn.totalAmount || 0) / Number(invoice.total));
  const proportionalAmount = round2(original.credit * proportion);
  if (proportionalAmount <= 0) return null;

  const net = await getNetCommissionForReference(invoice._id, 'Invoice', session);
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
  reverseCommissionForReference,
  reverseCommissionForSalesReturn,
  recordCommissionPayment,
  recalculateBalances,
  deleteEntriesByReference,
  getNetCommissionForReference,
  queryLedgerEntries,
  getCurrentBalance,
};
