const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { RepairStockItem } = require('../models');
const ApiError = require('../utils/ApiError');
const cashBookService = require('./cashBook.service');

/**
 * Create a PURCHASE entry (debit).
 * Automatically creates an expense entry in the cashbook.
 */
const createPurchaseEntry = async (body) => {
  const entry = await RepairStockItem.create({ ...body, type: 'purchase' });

  if (entry.amount > 0) {
    await cashBookService.upsertReferenceEntry({
      organizationId: entry.organizationId,
      branchId: entry.branchId,
      type: 'expense',
      source: 'purchase',
      amount: entry.amount,
      paymentMethod: entry.paymentMethod || 'cash',
      referenceId: entry._id,
      referenceModel: 'RepairStockItem',
      description: `Repair Stock: ${entry.description}`,
      date: entry.date,
      createdBy: entry.createdBy,
    });
  }

  return entry;
};

/**
 * Create a REPAIR_USAGE entry (credit).
 * No cashbook entry — the repair job already records the income/cost.
 */
const createUsageEntry = async (body) => {
  return RepairStockItem.create({ ...body, type: 'repair_usage' });
};

/**
 * Get paginated ledger entries sorted by date ascending.
 */
const getLedger = async (filter, options) => {
  const queryFilter = { ...filter };
  const queryOptions = { ...options };

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

  return RepairStockItem.paginate(queryFilter, {
    ...queryOptions,
    sortBy: queryOptions.sortBy || 'date:asc',
  });
};

/**
 * Aggregate summary: total purchased (debit), total used (credit), balance.
 */
const getLedgerSummary = async (filter) => {
  // Aggregate bypasses Mongoose auto-casting — manually cast string IDs to ObjectId
  const matchFilter = { ...filter };
  if (matchFilter.organizationId) matchFilter.organizationId = new mongoose.Types.ObjectId(matchFilter.organizationId);
  if (matchFilter.branchId) matchFilter.branchId = new mongoose.Types.ObjectId(matchFilter.branchId);

  const results = await RepairStockItem.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: null,
        totalPurchased: {
          $sum: { $cond: [{ $eq: ['$type', 'purchase'] }, '$amount', 0] },
        },
        totalUsed: {
          $sum: { $cond: [{ $eq: ['$type', 'repair_usage'] }, '$amount', 0] },
        },
      },
    },
  ]);

  if (!results.length) {
    return { totalPurchased: 0, totalUsed: 0, balance: 0 };
  }

  const { totalPurchased, totalUsed } = results[0];
  return { totalPurchased, totalUsed, balance: totalPurchased - totalUsed };
};

const getEntryById = async (id) => {
  const entry = await RepairStockItem.findById(id);
  if (!entry) throw new ApiError(httpStatus.NOT_FOUND, 'Stock entry not found');
  return entry;
};

/**
 * Delete an entry. Reverses cashbook expense for purchase entries.
 */
const deleteEntry = async (id) => {
  const entry = await getEntryById(id);
  if (entry.type === 'purchase') {
    await cashBookService.deleteEntriesByReference(entry._id, 'RepairStockItem');
  }
  await entry.deleteOne();
  return entry;
};

module.exports = {
  createPurchaseEntry,
  createUsageEntry,
  getLedger,
  getLedgerSummary,
  getEntryById,
  deleteEntry,
};
