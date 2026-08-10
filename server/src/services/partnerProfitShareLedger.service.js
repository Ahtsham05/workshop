const mongoose = require('mongoose');
const { PartnerProfitShareLedger } = require('../models');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const getLastBalance = async (partnerId, organizationId, session) => {
  const query = PartnerProfitShareLedger.findOne({ partnerId, organizationId })
    .sort({ transactionDate: -1, createdAt: -1 })
    .select('balance');
  if (session) query.session(session);
  const last = await query;
  return last ? last.balance : 0;
};

/**
 * Append one ledger row and stamp its running balance from the partner's last entry — same
 * incremental pattern as salesmanCommissionLedger.service.js's writeEntry, not a full
 * recompute, since entries are always appended in order, never edited in place.
 */
const writeEntry = async (entryBody, session) => {
  const currentBalance = await getLastBalance(entryBody.partnerId, entryBody.organizationId, session);
  const balance = round2(currentBalance + (entryBody.credit || 0) - (entryBody.debit || 0));
  const [entry] = await PartnerProfitShareLedger.create(
    [{ ...entryBody, transactionDate: entryBody.transactionDate || new Date(), balance }],
    session ? { session } : undefined
  );
  return entry;
};

/**
 * One invoice can credit several different (partner, rule) pairs at once — an org-wide
 * partner and one or more product investors can all earn off the same sale — so unlike the
 * salesman ledger, referenceId+referenceModel alone doesn't identify one entry; ruleId does.
 */
const getOriginalShareEntry = async (referenceId, referenceModel, ruleId, session) => {
  const query = PartnerProfitShareLedger.findOne({
    referenceId,
    referenceModel,
    ruleId,
    transactionType: 'share_earned',
  });
  if (session) query.session(session);
  return query;
};

const getNetShareForReference = async (referenceId, referenceModel, partnerId, ruleId, session) => {
  const pipeline = [
    {
      $match: {
        referenceId: new mongoose.Types.ObjectId(referenceId),
        referenceModel,
        partnerId: new mongoose.Types.ObjectId(partnerId),
        ruleId: new mongoose.Types.ObjectId(ruleId),
        transactionType: { $in: ['share_earned', 'share_reversed'] },
      },
    },
    { $group: { _id: null, credit: { $sum: '$credit' }, debit: { $sum: '$debit' } } },
  ];
  const aggQuery = PartnerProfitShareLedger.aggregate(pipeline);
  if (session) aggQuery.session(session);
  const [result] = await aggQuery;
  if (!result) return 0;
  return round2(result.credit - result.debit);
};

/**
 * Credit one partner's share for one already-resolved rule against a completed sale.
 * Idempotent — a second call for the same reference+rule (e.g. re-save on edit) is a no-op
 * once an entry exists. The caller (partnerProfitShareEngine.service) is responsible for
 * resolving which rule(s) apply and calling this once per rule — this function doesn't do
 * rule resolution itself, since a single sale can fire several independent rules.
 * @param {Object} params
 * @param {ObjectId} params.organizationId
 * @param {ObjectId} params.branchId
 * @param {ObjectId} params.partnerId
 * @param {ObjectId} params.ruleId
 * @param {ObjectId} params.referenceId - the sale document's _id
 * @param {string} params.referenceModel - 'Invoice'
 * @param {string} [params.reference] - human-readable number (invoice #) for display
 * @param {ObjectId} [params.productId] - set for product-scoped rules
 * @param {string} params.shareType - 'percentage_of_profit' | 'fixed_per_unit'
 * @param {number} params.rate
 * @param {number} params.saleProfit - the profit amount this was computed against
 * @param {number} [params.quantity] - required when shareType is fixed_per_unit
 * @param {Date} [params.date]
 * @param {ObjectId} params.userId
 * @param {import('mongoose').ClientSession} [session]
 */
const creditShareEarned = async (
  { organizationId, branchId, partnerId, ruleId, referenceId, referenceModel, reference, productId, shareType, rate, saleProfit, quantity, date, userId },
  session
) => {
  if (!partnerId || !ruleId || !referenceId || !referenceModel) return null;

  const existing = await getOriginalShareEntry(referenceId, referenceModel, ruleId, session);
  if (existing) return existing;

  let amount = 0;
  if (shareType === 'percentage_of_profit') {
    amount = round2(Number(saleProfit || 0) * (Number(rate || 0) / 100));
  } else if (shareType === 'fixed_per_unit') {
    amount = round2(Number(rate || 0) * Number(quantity || 0));
  }
  if (amount <= 0) return null;

  return writeEntry(
    {
      organizationId,
      branchId,
      partnerId,
      ruleId,
      transactionType: 'share_earned',
      transactionDate: date || new Date(),
      reference,
      referenceId,
      referenceModel,
      productId: productId || null,
      credit: amount,
      shareType,
      rate,
      saleProfit,
      createdBy: userId,
    },
    session
  );
};

/**
 * Fully reverse whatever share is still outstanding for one (partner, rule, reference)
 * combination — e.g. invoice cancelled.
 */
const reverseShareForReference = async (
  { referenceId, referenceModel, partnerId, ruleId, organizationId, branchId, reason, userId },
  session
) => {
  if (!partnerId || !ruleId) return null;
  const net = await getNetShareForReference(referenceId, referenceModel, partnerId, ruleId, session);
  if (net <= 0) return null;

  return writeEntry(
    {
      organizationId,
      branchId,
      partnerId,
      ruleId,
      transactionType: 'share_reversed',
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
 * Fully reverse EVERY (partner, rule) pair credited against one reference — e.g. an invoice
 * that's cancelled needs every partner/investor who earned off it clawed back, not just one.
 */
const reverseAllShareForReference = async ({ referenceId, referenceModel, organizationId, reason, userId }, session) => {
  const query = PartnerProfitShareLedger.find({ referenceId, referenceModel, transactionType: 'share_earned' });
  if (session) query.session(session);
  const earnedEntries = await query;

  const results = [];
  for (const entry of earnedEntries) {
    // eslint-disable-next-line no-await-in-loop
    const reversal = await reverseShareForReference(
      {
        referenceId,
        referenceModel,
        partnerId: entry.partnerId,
        ruleId: entry.ruleId,
        organizationId: organizationId || entry.organizationId,
        branchId: entry.branchId,
        reason,
        userId,
      },
      session
    );
    if (reversal) results.push(reversal);
  }
  return results;
};

/**
 * Proportionally claw back every partner's/rule's share for a (possibly partial) sales
 * return, capped at whatever's still outstanding per entry so repeated/overlapping returns
 * can never push net share below zero. Mirrors
 * salesmanCommissionLedger.service.js's reverseCommissionForSalesReturn, but applied across
 * every original share_earned entry for the invoice, not just one.
 * @param {Object} salesReturn - Mongoose SalesReturn document
 * @param {Object} invoice - the original Invoice document
 * @param {import('mongoose').ClientSession} [session]
 */
const reverseShareForSalesReturn = async (salesReturn, invoice, session) => {
  if (!invoice || !invoice.total) return [];

  const query = PartnerProfitShareLedger.find({ referenceId: invoice._id, referenceModel: 'Invoice', transactionType: 'share_earned' });
  if (session) query.session(session);
  const earnedEntries = await query;
  if (earnedEntries.length === 0) return [];

  const proportion = Math.min(1, Number(salesReturn.totalAmount || 0) / Number(invoice.total));
  const results = [];

  for (const original of earnedEntries) {
    const proportionalAmount = round2(original.credit * proportion);
    if (proportionalAmount <= 0) continue;

    // eslint-disable-next-line no-await-in-loop
    const net = await getNetShareForReference(invoice._id, 'Invoice', original.partnerId, original.ruleId, session);
    const reversalAmount = Math.min(proportionalAmount, net);
    if (reversalAmount <= 0) continue;

    // eslint-disable-next-line no-await-in-loop
    const reversal = await writeEntry(
      {
        organizationId: salesReturn.organizationId,
        branchId: salesReturn.branchId,
        partnerId: original.partnerId,
        ruleId: original.ruleId,
        productId: original.productId,
        transactionType: 'share_reversed',
        transactionDate: salesReturn.date || new Date(),
        reference: salesReturn.returnNumber,
        referenceId: invoice._id,
        referenceModel: 'Invoice',
        debit: reversalAmount,
        shareType: original.shareType,
        rate: original.rate,
        saleProfit: salesReturn.totalAmount,
        notes: `Sales return ${salesReturn.returnNumber}`,
        createdBy: salesReturn.createdBy,
      },
      session
    );
    results.push(reversal);
  }
  return results;
};

/**
 * Query for profit-share ledger entries
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const queryLedgerEntries = async (filter, options) => {
  const opts = {
    ...options,
    sortBy: options.sortBy || 'transactionDate:desc',
    populate: [
      { path: 'partnerId', select: 'name partnerType' },
      { path: 'productId', select: 'name' },
    ],
  };
  return PartnerProfitShareLedger.paginate(filter, opts);
};

const getCurrentBalance = async (partnerId, organizationId) => {
  return getLastBalance(partnerId, organizationId);
};

/**
 * Debit the ledger for a profit-share payout — the caller (partnerPayment.service) is
 * responsible for validating the amount against the current balance first. Not tied to a
 * specific ruleId — a payout settles the partner's overall balance, not one earning event.
 * @param {Object} params
 * @param {Object} params.payment - Mongoose PartnerPayment document
 * @param {ObjectId} params.userId
 */
const recordSharePayment = async ({ payment, userId }) => {
  return writeEntry({
    organizationId: payment.organizationId,
    branchId: payment.branchId,
    partnerId: payment.partnerId,
    transactionType: 'share_payment',
    transactionDate: payment.paymentDate || new Date(),
    reference: payment.reference,
    referenceId: payment._id,
    referenceModel: 'PartnerPayment',
    debit: payment.amount,
    notes: payment.notes,
    createdBy: userId,
  });
};

/**
 * Re-stamp every entry's running balance for one partner from scratch, in chronological
 * order. Only needed after a mid-ledger row is deleted (voiding a payment) — the
 * incremental writeEntry() path never needs this since it only ever appends.
 */
const recalculateBalances = async (partnerId, organizationId) => {
  const entries = await PartnerProfitShareLedger.find({ partnerId, organizationId }).sort({
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
 * repair every later entry's running balance for that partner.
 */
const deleteEntriesByReference = async (referenceId, referenceModel, partnerId, organizationId) => {
  await PartnerProfitShareLedger.deleteMany({ referenceId, referenceModel });
  await recalculateBalances(partnerId, organizationId);
};

module.exports = {
  creditShareEarned,
  reverseShareForReference,
  reverseAllShareForReference,
  reverseShareForSalesReturn,
  recordSharePayment,
  recalculateBalances,
  deleteEntriesByReference,
  getNetShareForReference,
  queryLedgerEntries,
  getCurrentBalance,
};
