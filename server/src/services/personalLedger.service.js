const httpStatus = require('http-status');
const { PersonalLedger } = require('../models');
const ApiError = require('../utils/ApiError');

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
  return PersonalLedger.findById(entry._id);
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
  return entry;
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
};
