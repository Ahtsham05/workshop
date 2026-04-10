const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { CashBookEntry } = require('../models');
const ApiError = require('../utils/ApiError');

const normalizePaymentMethod = (paymentMethod = 'cash') => {
  const value = String(paymentMethod).trim().toLowerCase();

  if (value === 'bank transfer') {
    return 'bank';
  }

  return value;
};

const createEntry = async (entryBody) => {
  return CashBookEntry.create({
    ...entryBody,
    paymentMethod: normalizePaymentMethod(entryBody.paymentMethod),
  });
};

const upsertReferenceEntry = async (entryBody) => {
  if (!entryBody.referenceId || !entryBody.referenceModel) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'referenceId and referenceModel are required');
  }

  return CashBookEntry.findOneAndUpdate(
    {
      referenceId: entryBody.referenceId,
      referenceModel: entryBody.referenceModel,
      type: entryBody.type,
      source: entryBody.source,
    },
    {
      ...entryBody,
      paymentMethod: normalizePaymentMethod(entryBody.paymentMethod),
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );
};

const deleteEntriesByReference = async (referenceId, referenceModel) => {
  return CashBookEntry.deleteMany({ referenceId, referenceModel });
};

const queryEntries = async (filter, options) => {
  const queryFilter = { ...filter };
  const queryOptions = { ...options };

  if (queryOptions.search) {
    queryFilter.$or = [
      { description: { $regex: queryOptions.search, $options: 'i' } },
      { notes: { $regex: queryOptions.search, $options: 'i' } },
      { source: { $regex: queryOptions.search, $options: 'i' } },
    ];
    delete queryOptions.search;
  }

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

  return CashBookEntry.paginate(queryFilter, {
    ...queryOptions,
    sortBy: queryOptions.sortBy || 'date:desc',
  });
};

const getSummary = async (filter = {}) => {
  const baseMatch = {};

  if (filter.organizationId) {
    baseMatch.organizationId = mongoose.Types.ObjectId.isValid(filter.organizationId)
      ? new mongoose.Types.ObjectId(String(filter.organizationId))
      : filter.organizationId;
  }
  if (filter.branchId) {
    baseMatch.branchId = mongoose.Types.ObjectId.isValid(filter.branchId)
      ? new mongoose.Types.ObjectId(String(filter.branchId))
      : filter.branchId;
  }

  // Exclude wallet entries — they are internal transfers that cancel out
  // Exclude opening_balance entries — handled separately below
  baseMatch.paymentMethod = { $ne: 'wallet' };
  baseMatch.source = { $ne: 'opening_balance' };

  // Build the date-range match for the selected period
  const periodMatch = { ...baseMatch };
  if (filter.startDate || filter.endDate) {
    periodMatch.date = {};
    if (filter.startDate) {
      periodMatch.date.$gte = new Date(filter.startDate);
    }
    if (filter.endDate) {
      periodMatch.date.$lte = new Date(filter.endDate);
    }
  }

  // Build the opening balance match (all entries BEFORE startDate)
  const openingMatch = { ...baseMatch };
  if (filter.startDate) {
    openingMatch.date = { $lt: new Date(filter.startDate) };
  }

  const aggregateGroup = {
    _id: null,
    totalIncome: {
      $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] },
    },
    totalExpense: {
      $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] },
    },
  };

  // Run aggregations + manual opening balance fetch in parallel
  const manualObFilter = {};
  if (filter.organizationId) manualObFilter.organizationId = mongoose.Types.ObjectId.isValid(filter.organizationId) ? new mongoose.Types.ObjectId(String(filter.organizationId)) : filter.organizationId;
  if (filter.branchId) manualObFilter.branchId = mongoose.Types.ObjectId.isValid(filter.branchId) ? new mongoose.Types.ObjectId(String(filter.branchId)) : filter.branchId;

  const [periodResult, openingResult, manualObEntry] = await Promise.all([
    CashBookEntry.aggregate([{ $match: periodMatch }, { $group: aggregateGroup }]),
    filter.startDate
      ? CashBookEntry.aggregate([{ $match: openingMatch }, { $group: aggregateGroup }])
      : Promise.resolve([]),
    CashBookEntry.findOne({ ...manualObFilter, source: 'opening_balance' }),
  ]);

  const period = periodResult[0] || { totalIncome: 0, totalExpense: 0 };
  const opening = openingResult[0] || { totalIncome: 0, totalExpense: 0 };
  const manualOpeningBalance = manualObEntry ? manualObEntry.amount : 0;

  const openingBalance = manualOpeningBalance + (opening.totalIncome - opening.totalExpense);
  const closingBalance = openingBalance + period.totalIncome - period.totalExpense;

  return {
    openingBalance,
    totalIncome: period.totalIncome,
    totalExpense: period.totalExpense,
    closingBalance,
  };
};

const getOpeningBalance = async (filter = {}) => {
  const query = { source: 'opening_balance' };
  if (filter.organizationId) query.organizationId = filter.organizationId;
  if (filter.branchId) query.branchId = filter.branchId;
  const entry = await CashBookEntry.findOne(query);
  return entry ? { amount: entry.amount, id: entry.id } : { amount: 0, id: null };
};

const setOpeningBalance = async (filter = {}, amount) => {
  const query = { source: 'opening_balance' };
  if (filter.organizationId) query.organizationId = filter.organizationId;
  if (filter.branchId) query.branchId = filter.branchId;

  if (amount === 0) {
    await CashBookEntry.deleteOne(query);
    return { amount: 0, id: null };
  }

  const entry = await CashBookEntry.findOneAndUpdate(
    query,
    {
      ...query,
      type: 'income',
      amount,
      paymentMethod: 'cash',
      description: 'Opening Balance',
      // Use epoch so it always precedes all real transactions
      date: new Date('1900-01-01T00:00:00.000Z'),
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return { amount: entry.amount, id: entry.id };
};

module.exports = {
  normalizePaymentMethod,
  createEntry,
  upsertReferenceEntry,
  deleteEntriesByReference,
  queryEntries,
  getSummary,
  setOpeningBalance,
  getOpeningBalance,
};
