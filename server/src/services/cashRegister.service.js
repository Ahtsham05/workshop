const httpStatus = require('http-status');
const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const CashBookEntry = require('../models/cashBookEntry.model');
const CashRegisterState = require('../models/cashRegisterState.model');
const CashRegisterSnapshot = require('../models/cashRegisterSnapshot.model');
const cashBookService = require('./cashBook.service');
const { endOfBusinessDay, startOfBusinessDay, toBusinessCalendarDate } = require('../utils/businessTimezone');
const {
  PKR_DENOMINATIONS,
  computeTotalFromCounts,
  normalizeCounts,
} = require('../utils/pkrDenominations');

const buildScopeFilter = (organizationId, branchId) => {
  const filter = { organizationId };
  if (branchId) filter.branchId = branchId;
  return filter;
};

const getExpectedCashAmount = async (organizationId, branchId) => {
  // Bound to end of today (business timezone) — a cash-affecting record mis-dated in
  // the future would otherwise inflate "Expected" ahead of what's physically in the
  // drawer today, creating a phantom variance against the Track Cash count.
  const summary = await cashBookService.getCashInHandSummary({
    organizationId,
    branchId,
    endDate: toBusinessCalendarDate(new Date()),
  });
  return Number(summary?.closingBalance || 0);
};

/** Most entries a movement list returns — totals always cover every entry. */
const MOVEMENT_ENTRY_LIMIT = 500;

const toObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(String(value)) ? new mongoose.Types.ObjectId(String(value)) : value;

const moduleLabel = (referenceModel) => cashBookService.CASH_MODULE_LABELS[referenceModel] || referenceModel || 'Other';

const serializeMovementEntry = (entry) => ({
  id: String(entry._id),
  date: entry.date,
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
  type: entry.type,
  source: entry.source,
  amount: entry.amount,
  description: entry.description || '',
  referenceModel: entry.referenceModel || null,
  module: moduleLabel(entry.referenceModel),
});

/** Expected is rounded to whole rupees at both counts, so up to Re 1 of drift is rounding. */
const computeUnexplainedChange = (expectedAtStart, expectedAtEnd, net) => {
  const raw = expectedAtEnd - expectedAtStart - net;
  return Math.abs(raw) <= 1 ? 0 : Math.round(raw);
};

/**
 * Cash lines recorded in (from, to] — exactly what moved "Expected" between two counts.
 * Bounded by the same end-of-day rule as getExpectedCashAmount, so expected-at-start + net
 * equals expected-at-end unless a line recorded before `from` was edited or deleted
 * afterwards (lines edited in the window are returned separately).
 */
const summarizeMovements = async (organizationId, branchId, from, to) => {
  const match = {
    organizationId: toObjectId(organizationId),
    paymentMethod: 'cash',
    source: { $ne: 'opening_balance' },
    date: { $lte: endOfBusinessDay(toBusinessCalendarDate(to)) },
  };
  if (branchId) match.branchId = toObjectId(branchId);

  const [entries, editedEntries] = await Promise.all([
    CashBookEntry.find({ ...match, createdAt: { $gt: from, $lte: to } })
      .sort({ createdAt: 1, _id: 1 })
      .lean(),
    CashBookEntry.find({ ...match, createdAt: { $lte: from }, updatedAt: { $gt: from, $lte: to } })
      .sort({ updatedAt: 1 })
      .limit(MOVEMENT_ENTRY_LIMIT)
      .lean(),
  ]);

  let income = 0;
  let expense = 0;
  const byModule = new Map();
  entries.forEach((entry) => {
    const module = moduleLabel(entry.referenceModel);
    const row = byModule.get(module) || { module, income: 0, expense: 0, count: 0 };
    if (entry.type === 'income') {
      income += entry.amount;
      row.income += entry.amount;
    } else {
      expense += entry.amount;
      row.expense += entry.amount;
    }
    row.count += 1;
    byModule.set(module, row);
  });

  return {
    from,
    to,
    income,
    expense,
    net: income - expense,
    entryCount: entries.length,
    truncated: entries.length > MOVEMENT_ENTRY_LIMIT,
    byModule: Array.from(byModule.values())
      .map((row) => ({ ...row, net: row.income - row.expense }))
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net)),
    entries: entries.slice(-MOVEMENT_ENTRY_LIMIT).map(serializeMovementEntry),
    editedEntries: editedEntries.map(serializeMovementEntry),
  };
};

const getRegister = async (organizationId, branchId) => {
  const filter = buildScopeFilter(organizationId, branchId);
  const [state, expectedCashAmount, lastSnapshot] = await Promise.all([
    CashRegisterState.findOne(filter),
    getExpectedCashAmount(organizationId, branchId),
    CashRegisterSnapshot.findOne(filter).sort({ createdAt: -1 }).lean(),
  ]);

  const counts = normalizeCounts(state?.counts || []);
  const totalAmount = computeTotalFromCounts(counts);
  const variance = totalAmount - expectedCashAmount;

  // The saved count is a moment in the past while Expected is live, so comparing the two
  // drifts with every entry recorded since. Report the count's own difference plus what has
  // moved since, so the page can show both instead of a phantom, ever-growing variance.
  let sinceLastCount = null;
  if (lastSnapshot) {
    const movement = await summarizeMovements(organizationId, branchId, lastSnapshot.createdAt, new Date());
    sinceLastCount = {
      countedAt: lastSnapshot.createdAt,
      countedAmount: lastSnapshot.totalAmount,
      expectedAtCount: lastSnapshot.expectedCashAmount,
      varianceAtCount: lastSnapshot.variance,
      income: movement.income,
      expense: movement.expense,
      net: movement.net,
      entryCount: movement.entryCount,
      editedCount: movement.editedEntries.length,
      unexplainedChange: computeUnexplainedChange(lastSnapshot.expectedCashAmount, expectedCashAmount, movement.net),
    };
  }

  return {
    sinceLastCount,
    denominations: PKR_DENOMINATIONS,
    counts,
    totalAmount,
    expectedCashAmount,
    variance,
    notes: state?.notes || '',
    lastCountedAt: state?.lastCountedAt || null,
    lastCountedBy: state?.lastCountedBy || null,
  };
};

const saveRegister = async (organizationId, branchId, userId, body) => {
  const filter = buildScopeFilter(organizationId, branchId);
  const counts = normalizeCounts(body.counts || []);
  const totalAmount = computeTotalFromCounts(counts);
  const expectedCashAmount = await getExpectedCashAmount(organizationId, branchId);
  const variance = totalAmount - expectedCashAmount;
  const notes = body.notes ? String(body.notes).trim() : '';

  const now = new Date();
  const state = await CashRegisterState.findOneAndUpdate(
    filter,
    {
      ...filter,
      counts,
      totalAmount,
      notes,
      lastCountedAt: now,
      lastCountedBy: userId,
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  await CashRegisterSnapshot.create({
    organizationId,
    branchId,
    counts,
    totalAmount,
    expectedCashAmount,
    variance,
    notes,
    createdBy: userId,
  });

  return {
    denominations: PKR_DENOMINATIONS,
    counts: normalizeCounts(state.counts),
    totalAmount: state.totalAmount,
    expectedCashAmount,
    variance,
    notes: state.notes || '',
    lastCountedAt: state.lastCountedAt,
    lastCountedBy: state.lastCountedBy,
  };
};

const clearRegister = async (organizationId, branchId, userId) =>
  saveRegister(organizationId, branchId, userId, {
    counts: PKR_DENOMINATIONS.map((d) => ({ value: d.value, kind: d.kind, quantity: 0 })),
    notes: '',
  });

/**
 * Everything that moved expected cash between one count and the one before it — or, with
 * no snapshotId, since the latest count until now. A count that doesn't match can only be
 * explained by an entry in this window (or an earlier entry changed during it).
 */
const getMovements = async (organizationId, branchId, { snapshotId } = {}) => {
  const filter = buildScopeFilter(organizationId, branchId);

  let closingCount = null;
  if (snapshotId) {
    closingCount = await CashRegisterSnapshot.findOne({ _id: snapshotId, ...filter }).lean();
    if (!closingCount) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Cash count entry not found');
    }
  }

  const to = closingCount ? closingCount.createdAt : new Date();
  const previous = await CashRegisterSnapshot.findOne({ ...filter, createdAt: { $lt: to } })
    .sort({ createdAt: -1 })
    .lean();
  // No earlier count to anchor on — fall back to that business day's movement.
  const from = previous ? previous.createdAt : startOfBusinessDay(toBusinessCalendarDate(to));

  const [movement, expectedAtEnd] = await Promise.all([
    summarizeMovements(organizationId, branchId, from, to),
    closingCount ? closingCount.expectedCashAmount : getExpectedCashAmount(organizationId, branchId),
  ]);

  return {
    ...movement,
    previousCount: previous
      ? {
          id: String(previous._id),
          countedAt: previous.createdAt,
          countedAmount: previous.totalAmount,
          expectedCashAmount: previous.expectedCashAmount,
          variance: previous.variance,
        }
      : null,
    expectedAtStart: previous ? previous.expectedCashAmount : null,
    expectedAtEnd,
    unexplainedChange: previous ? computeUnexplainedChange(previous.expectedCashAmount, expectedAtEnd, movement.net) : null,
  };
};

const queryHistory = async (filter, options) => {
  const queryFilter = { ...filter };
  return CashRegisterSnapshot.paginate(queryFilter, {
    ...options,
    sortBy: options.sortBy || 'createdAt:desc',
    populate: 'createdBy',
  });
};

// Undoes what saveRegister did: removes the history row, and if it was the
// count currently reflected as the live state, rewinds the live state to
// whatever the next-most-recent remaining snapshot held (or to an empty,
// never-counted state if none remain) — a full reverse of "create".
const deleteSnapshot = async (organizationId, branchId, snapshotId) => {
  const filter = buildScopeFilter(organizationId, branchId);
  const snapshot = await CashRegisterSnapshot.findOne({ _id: snapshotId, ...filter });
  if (!snapshot) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Cash count entry not found');
  }

  const latestSnapshot = await CashRegisterSnapshot.findOne(filter).sort({ createdAt: -1 });
  const isCurrent = latestSnapshot && String(latestSnapshot._id) === String(snapshot._id);

  await snapshot.deleteOne();

  if (isCurrent) {
    const previousSnapshot = await CashRegisterSnapshot.findOne(filter).sort({ createdAt: -1 });
    if (previousSnapshot) {
      await CashRegisterState.findOneAndUpdate(
        filter,
        {
          ...filter,
          counts: previousSnapshot.counts,
          totalAmount: previousSnapshot.totalAmount,
          notes: previousSnapshot.notes || '',
          lastCountedAt: previousSnapshot.createdAt,
          lastCountedBy: previousSnapshot.createdBy,
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
    } else {
      await CashRegisterState.findOneAndUpdate(
        filter,
        {
          ...filter,
          counts: PKR_DENOMINATIONS.map((d) => ({ value: d.value, kind: d.kind, quantity: 0 })),
          totalAmount: 0,
          notes: '',
          lastCountedAt: null,
          lastCountedBy: null,
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
    }
  }

  return getRegister(organizationId, branchId);
};

module.exports = {
  getRegister,
  getMovements,
  saveRegister,
  clearRegister,
  queryHistory,
  deleteSnapshot,
};
