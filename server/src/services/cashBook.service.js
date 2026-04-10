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
  baseMatch.paymentMethod = { $ne: 'wallet' };

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

  // Run both aggregations in parallel
  const [periodResult, openingResult] = await Promise.all([
    CashBookEntry.aggregate([{ $match: periodMatch }, { $group: aggregateGroup }]),
    filter.startDate
      ? CashBookEntry.aggregate([{ $match: openingMatch }, { $group: aggregateGroup }])
      : Promise.resolve([]),
  ]);

  const period = periodResult[0] || { totalIncome: 0, totalExpense: 0 };
  const opening = openingResult[0] || { totalIncome: 0, totalExpense: 0 };

  const openingBalance = opening.totalIncome - opening.totalExpense;
  const closingBalance = openingBalance + period.totalIncome - period.totalExpense;

  return {
    openingBalance,
    totalIncome: period.totalIncome,
    totalExpense: period.totalExpense,
    closingBalance,
  };
};

module.exports = {
  normalizePaymentMethod,
  createEntry,
  upsertReferenceEntry,
  deleteEntriesByReference,
  queryEntries,
  getSummary,
};
