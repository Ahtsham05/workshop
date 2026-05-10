const httpStatus = require('http-status');
const { PersonalLedger } = require('../models');
const ApiError = require('../utils/ApiError');
const cashBookService = require('./cashBook.service');

/**
 * Map My Wallet payment method to cash book paymentMethod (not 'wallet' — that flag is reserved
 * for internal mobile-shop wallet settlements which are excluded from cash book totals).
 */
const mapPersonalLedgerPaymentToCashBook = (paymentMethod) => {
  const m = String(paymentMethod || 'Cash').trim().toLowerCase();
  if (m === 'bank transfer') return 'bank';
  if (m === 'card') return 'card';
  if (m === 'cheque') return 'cheque';
  if (m === 'cash') return 'cash';
  return 'cash';
};

const buildCashBookDescription = (entry) => {
  const cat = entry.category ? String(entry.category).trim() : '';
  const desc = entry.description ? String(entry.description).trim() : '';
  if (cat && desc) return `${cat} — ${desc}`;
  return desc || cat || 'My Wallet';
};

/**
 * Derive income/expense for Cash Book from a personal ledger row.
 */
const resolveCashBookLine = (entry) => {
  const debit = Number(entry.debit) || 0;
  const credit = Number(entry.credit) || 0;
  const t = String(entry.transactionType || '').toLowerCase();

  if (t === 'income' || t === 'opening_balance') {
    if (credit <= 0) return null;
    return { type: 'income', amount: credit };
  }
  if (t === 'expense') {
    if (debit <= 0) return null;
    return { type: 'expense', amount: debit };
  }
  if (t === 'transfer' || t === 'adjustment') {
    if (debit > 0) return { type: 'expense', amount: debit };
    if (credit > 0) return { type: 'income', amount: credit };
    return null;
  }
  return null;
};

/**
 * Mirror My Wallet movements into Cash Book (Source: wallet) using real payment channel as Payment.
 */
const syncCashBookFromPersonalLedger = async (entry) => {
  if (!entry || !entry._id) {
    return null;
  }

  await cashBookService.deleteEntriesByReference(entry._id, 'PersonalLedger');

  const line = resolveCashBookLine(entry);
  if (!line) {
    return null;
  }

  return cashBookService.upsertReferenceEntry({
    organizationId: entry.organizationId,
    branchId: entry.branchId,
    type: line.type,
    source: 'wallet',
    amount: line.amount,
    paymentMethod: mapPersonalLedgerPaymentToCashBook(entry.paymentMethod),
    referenceId: entry._id,
    referenceModel: 'PersonalLedger',
    description: buildCashBookDescription(entry),
    notes: entry.notes,
    date: entry.transactionDate,
    createdBy: entry.createdBy,
  });
};

/**
 * Re-create cash book lines for every personal ledger entry (e.g. after deploy).
 */
const resyncCashBookForAllPersonalLedgers = async () => {
  const entries = await PersonalLedger.find({});
  let n = 0;
  for (const entry of entries) {
    await syncCashBookFromPersonalLedger(entry);
    n += 1;
  }
  return { processed: n };
};

/**
 * Recalculate running balances from a given date onwards for a branch
 */
const recalculateBalances = async (organizationId, branchId, fromDate) => {
  const allEntries = await PersonalLedger.find({ organizationId, branchId })
    .sort({ transactionDate: 1, createdAt: 1 });

  let runningBalance = 0;
  let shouldUpdate = false;

  for (const entry of allEntries) {
    if (entry.transactionDate >= fromDate) {
      shouldUpdate = true;
    }

    if (shouldUpdate) {
      const newBalance = runningBalance + (entry.credit || 0) - (entry.debit || 0);
      if (entry.balance !== newBalance) {
        entry.balance = newBalance;
        await entry.save();
      }
    }

    runningBalance += (entry.credit || 0) - (entry.debit || 0);
  }
};

/**
 * Create a personal ledger entry
 */
const createEntry = async (body) => {
  const entry = await PersonalLedger.create({ ...body, balance: 0 });
  await recalculateBalances(body.organizationId, body.branchId, body.transactionDate);
  const saved = await PersonalLedger.findById(entry._id);
  await syncCashBookFromPersonalLedger(saved);
  return saved;
};

/**
 * Query personal ledger entries (paginated)
 */
const queryEntries = async (filter, options) => {
  if (options.search) {
    filter.$or = [
      { description: { $regex: options.search, $options: 'i' } },
      { reference: { $regex: options.search, $options: 'i' } },
      { category: { $regex: options.search, $options: 'i' } },
    ];
    delete options.search;
  }

  if (options.startDate || options.endDate) {
    filter.transactionDate = {};
    if (options.startDate) {
      const startDate = new Date(options.startDate);
      startDate.setHours(0, 0, 0, 0);
      filter.transactionDate.$gte = startDate;
      delete options.startDate;
    }
    if (options.endDate) {
      const endDate = new Date(options.endDate);
      endDate.setHours(23, 59, 59, 999);
      filter.transactionDate.$lte = endDate;
      delete options.endDate;
    }
  }

  options.sort = options.sortBy || 'transactionDate:asc';
  delete options.sortBy;

  return PersonalLedger.paginate(filter, options);
};

/**
 * Get a single entry by ID
 */
const getEntryById = async (id) => {
  return PersonalLedger.findById(id);
};

/**
 * Get current balance (latest entry's balance)
 */
const getCurrentBalance = async (organizationId, branchId) => {
  const latest = await PersonalLedger.findOne({ organizationId, branchId })
    .sort({ transactionDate: -1, createdAt: -1 });
  return latest ? latest.balance : 0;
};

/**
 * Get summary (total income, total expenses, net balance)
 */
const getSummary = async (organizationId, branchId) => {
  const entries = await PersonalLedger.find({ organizationId, branchId });

  const summary = {
    totalCredit: 0,
    totalDebit: 0,
    netBalance: 0,
    transactionCount: entries.length,
  };

  entries.forEach(entry => {
    summary.totalCredit += entry.credit || 0;
    summary.totalDebit += entry.debit || 0;
  });

  summary.netBalance = summary.totalCredit - summary.totalDebit;
  return summary;
};

/**
 * Update an entry (only metadata, not amounts)
 */
const updateEntry = async (id, updateBody) => {
  const entry = await getEntryById(id);
  if (!entry) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ledger entry not found');
  }

  delete updateBody.debit;
  delete updateBody.credit;
  delete updateBody.balance;
  delete updateBody.organizationId;
  delete updateBody.branchId;

  Object.assign(entry, updateBody);
  await entry.save();
  const refreshed = await PersonalLedger.findById(id);
  await syncCashBookFromPersonalLedger(refreshed);
  return refreshed;
};

/**
 * Delete an entry and recalculate balances
 */
const deleteEntry = async (id) => {
  const entry = await getEntryById(id);
  if (!entry) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ledger entry not found');
  }

  const { organizationId, branchId, transactionDate } = entry;
  await cashBookService.deleteEntriesByReference(entry._id, 'PersonalLedger');
  await entry.deleteOne();
  await recalculateBalances(organizationId, branchId, transactionDate);
  return entry;
};

module.exports = {
  createEntry,
  queryEntries,
  getEntryById,
  getCurrentBalance,
  getSummary,
  updateEntry,
  deleteEntry,
  syncCashBookFromPersonalLedger,
  resyncCashBookForAllPersonalLedgers,
};
