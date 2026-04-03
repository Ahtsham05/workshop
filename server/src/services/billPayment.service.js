const mongoose = require('mongoose');
const httpStatus = require('http-status');
const { BillPayment } = require('../models');
const ApiError = require('../utils/ApiError');
const cashBookService = require('./cashBook.service');

const toObjectId = (id) =>
  id && mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(String(id)) : id;

/**
 * Auto-update overdue statuses for a given org/branch scope.
 * Called before any list/summary query that depends on status accuracy.
 */
const refreshOverdueStatuses = async (organizationId, branchId) => {
  const now = new Date();
  const filter = {
    organizationId,
    status: 'pending',
    dueDate: { $lt: now },
  };
  if (branchId) filter.branchId = branchId;
  await BillPayment.updateMany(filter, { $set: { status: 'overdue' } });
};

const syncBillCashEntry = async (billPayment) => {
  if (billPayment.status !== 'paid') {
    await cashBookService.deleteEntriesByReference(billPayment._id, 'BillPayment');
    return null;
  }

  return cashBookService.upsertReferenceEntry({
    organizationId: billPayment.organizationId,
    branchId: billPayment.branchId,
    type: 'income',
    source: 'bill_payment',
    amount: billPayment.totalReceived,
    paymentMethod: billPayment.paymentMethod,
    referenceId: billPayment._id,
    referenceModel: 'BillPayment',
    description: `Bill: ${billPayment.companyName} – Ref# ${billPayment.referenceNumber} (${billPayment.customerName})`,
    date: billPayment.paymentDate || billPayment.createdAt,
    createdBy: billPayment.createdBy,
  });
};

const createBillPayment = async (body) => {
  const totalReceived = Number(body.billAmount) + Number(body.serviceCharge || 0);
  const billPayment = await BillPayment.create({
    ...body,
    totalReceived,
    status: body.status || 'pending',
    paymentDate: body.status === 'paid' ? (body.paymentDate || new Date()) : (body.paymentDate || null),
  });
  await syncBillCashEntry(billPayment);
  return billPayment;
};

const queryBillPayments = async (filter, options) => {
  const queryFilter = { ...filter };
  const queryOptions = { ...options };

  if (queryOptions.search) {
    queryFilter.$or = [
      { referenceNumber: { $regex: queryOptions.search, $options: 'i' } },
      { customerName: { $regex: queryOptions.search, $options: 'i' } },
      { companyName: { $regex: queryOptions.search, $options: 'i' } },
    ];
    delete queryOptions.search;
  }

  // Filter by paymentDate range
  if (queryOptions.startDate || queryOptions.endDate) {
    queryFilter.paymentDate = {};
    if (queryOptions.startDate) {
      queryFilter.paymentDate.$gte = new Date(queryOptions.startDate);
      delete queryOptions.startDate;
    }
    if (queryOptions.endDate) {
      queryFilter.paymentDate.$lte = new Date(queryOptions.endDate);
      delete queryOptions.endDate;
    }
  }

  // Filter by dueDate range
  if (queryOptions.dueStartDate || queryOptions.dueEndDate) {
    queryFilter.dueDate = {};
    if (queryOptions.dueStartDate) {
      queryFilter.dueDate.$gte = new Date(queryOptions.dueStartDate);
      delete queryOptions.dueStartDate;
    }
    if (queryOptions.dueEndDate) {
      queryFilter.dueDate.$lte = new Date(queryOptions.dueEndDate);
      delete queryOptions.dueEndDate;
    }
  }

  return BillPayment.paginate(queryFilter, {
    ...queryOptions,
    sortBy: queryOptions.sortBy || (queryFilter.dueDate ? 'dueDate:asc' : 'createdAt:desc'),
    populate: 'companyId',
  });
};

const getBillPaymentById = async (id) => {
  const billPayment = await BillPayment.findById(id).populate('companyId');
  if (!billPayment) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Bill payment not found');
  }
  return billPayment;
};

const updateBillPaymentById = async (id, updateBody, userId) => {
  const billPayment = await getBillPaymentById(id);
  Object.assign(billPayment, updateBody, { updatedBy: userId });

  if (billPayment.status === 'paid' && !billPayment.paymentDate) {
    billPayment.paymentDate = new Date();
  }

  // Recalculate total if amounts changed
  billPayment.totalReceived = Number(billPayment.billAmount) + Number(billPayment.serviceCharge || 0);

  await billPayment.save();
  await syncBillCashEntry(billPayment);
  return billPayment;
};

const deleteBillPaymentById = async (id) => {
  const billPayment = await getBillPaymentById(id);
  await cashBookService.deleteEntriesByReference(billPayment._id, 'BillPayment');
  await billPayment.deleteOne();
  return billPayment;
};

/**
 * Bills with dueDate = today and status = pending
 */
const getBillsDueToday = async (organizationId, branchId) => {
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

  const filter = {
    organizationId,
    status: 'pending',
    dueDate: { $gte: startOfDay, $lte: endOfDay },
  };
  if (branchId) filter.branchId = branchId;

  return BillPayment.find(filter).sort({ dueDate: 1 });
};

/**
 * Bills where dueDate < today and status is not paid
 */
const getOverdueBills = async (organizationId, branchId) => {
  // Refresh statuses first
  await refreshOverdueStatuses(organizationId, branchId);

  const filter = {
    organizationId,
    status: 'overdue',
  };
  if (branchId) filter.branchId = branchId;

  return BillPayment.find(filter).sort({ dueDate: 1 });
};

/**
 * Aggregated report for bill payments
 * Returns summary, daily trend, breakdown by bill type, and breakdown by company.
 */
const getBillPaymentReport = async ({ organizationId, branchId, startDate, endDate, billType, companyId }) => {
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
  const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

  const baseFilter = { organizationId: toObjectId(organizationId) };
  if (branchId) baseFilter.branchId = toObjectId(branchId);
  if (billType) baseFilter.billType = billType;
  if (companyId) baseFilter.companyId = toObjectId(companyId);

  const paidFilter = { ...baseFilter, status: 'paid' };
  if (startDate) paidFilter.paymentDate = { $gte: new Date(startDate) };
  if (endDate) {
    paidFilter.paymentDate = paidFilter.paymentDate
      ? { ...paidFilter.paymentDate, $lte: new Date(endDate) }
      : { $lte: new Date(endDate) };
  }

  const [
    paidAgg,
    dueTodayCount,
    overdueCount,
    trendAgg,
    byBillTypeAgg,
    byCompanyAgg,
    pendingAgg,
  ] = await Promise.all([
    // Overall summary of paid bills
    BillPayment.aggregate([
      { $match: paidFilter },
      {
        $group: {
          _id: null,
          totalBills: { $sum: 1 },
          totalBillAmount: { $sum: '$billAmount' },
          totalServiceCharges: { $sum: '$serviceCharge' },
          totalCollection: { $sum: '$totalReceived' },
        },
      },
    ]),
    // Pending bills due today
    BillPayment.countDocuments({
      ...baseFilter,
      status: 'pending',
      dueDate: { $gte: startOfToday, $lte: endOfToday },
    }),
    // Overdue count
    BillPayment.countDocuments({ ...baseFilter, status: 'overdue' }),
    // Daily trend of paid bills in the date range
    BillPayment.aggregate([
      { $match: paidFilter },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$paymentDate' },
          },
          billCount: { $sum: 1 },
          totalBillAmount: { $sum: '$billAmount' },
          totalServiceCharges: { $sum: '$serviceCharge' },
          totalCollection: { $sum: '$totalReceived' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    // Breakdown by bill type (paid in range)
    BillPayment.aggregate([
      { $match: paidFilter },
      {
        $group: {
          _id: '$billType',
          billCount: { $sum: 1 },
          totalBillAmount: { $sum: '$billAmount' },
          totalServiceCharges: { $sum: '$serviceCharge' },
          totalCollection: { $sum: '$totalReceived' },
        },
      },
      { $sort: { totalCollection: -1 } },
    ]),
    // Top companies by collection (paid in range)
    BillPayment.aggregate([
      { $match: paidFilter },
      {
        $group: {
          _id: '$companyName',
          billCount: { $sum: 1 },
          totalBillAmount: { $sum: '$billAmount' },
          totalServiceCharges: { $sum: '$serviceCharge' },
          totalCollection: { $sum: '$totalReceived' },
        },
      },
      { $sort: { totalCollection: -1 } },
      { $limit: 10 },
    ]),
    // Pending/overdue bills summary (outstanding)
    BillPayment.aggregate([
      { $match: { ...baseFilter, status: { $in: ['pending', 'overdue'] } } },
      {
        $group: {
          _id: null,
          totalPending: { $sum: 1 },
          totalPendingAmount: { $sum: '$billAmount' },
          totalPendingServiceCharges: { $sum: '$serviceCharge' },
        },
      },
    ]),
  ]);

  const result = paidAgg[0] || {
    totalBills: 0,
    totalBillAmount: 0,
    totalServiceCharges: 0,
    totalCollection: 0,
  };

  const outstanding = pendingAgg[0] || {
    totalPending: 0,
    totalPendingAmount: 0,
    totalPendingServiceCharges: 0,
  };

  return {
    // Summary
    totalBills: result.totalBills,
    totalBillAmount: result.totalBillAmount,
    totalServiceCharges: result.totalServiceCharges,
    totalCollection: result.totalCollection,
    totalDueToday: dueTodayCount,
    totalOverdue: overdueCount,
    // Outstanding
    totalPending: outstanding.totalPending,
    totalPendingAmount: outstanding.totalPendingAmount,
    totalPendingServiceCharges: outstanding.totalPendingServiceCharges,
    // Breakdowns
    trend: trendAgg,
    byBillType: byBillTypeAgg,
    byCompany: byCompanyAgg,
  };
};

/**
 * Summary of pending/overdue bills within a dueDate range.
 * Used by the "Due Date Filter" panel on the frontend.
 */
const getDueDateRangeSummary = async ({ organizationId, branchId, dueStartDate, dueEndDate }) => {
  const filter = { organizationId: toObjectId(organizationId), status: { $in: ['pending', 'overdue'] } };
  if (branchId) filter.branchId = toObjectId(branchId);
  if (dueStartDate || dueEndDate) {
    filter.dueDate = {};
    if (dueStartDate) filter.dueDate.$gte = new Date(dueStartDate);
    if (dueEndDate) filter.dueDate.$lte = new Date(dueEndDate);
  }

  const agg = await BillPayment.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalBills: { $sum: 1 },
        totalBillAmount: { $sum: '$billAmount' },
        totalServiceCharges: { $sum: '$serviceCharge' },
        totalReceived: { $sum: '$totalReceived' },
      },
    },
  ]);

  return agg[0] || { totalBills: 0, totalBillAmount: 0, totalServiceCharges: 0, totalReceived: 0 };
};

module.exports = {
  createBillPayment,
  queryBillPayments,
  getBillPaymentById,
  updateBillPaymentById,
  deleteBillPaymentById,
  getBillsDueToday,
  getOverdueBills,
  getBillPaymentReport,
  getDueDateRangeSummary,
  refreshOverdueStatuses,
};
