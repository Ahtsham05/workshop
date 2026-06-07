const mongoose = require('mongoose');
const httpStatus = require('http-status');
const { BillPayment } = require('../models');
const ApiError = require('../utils/ApiError');
const cashBookService = require('./cashBook.service');
const {
  parseBusinessDateBoundary,
  parseBusinessDateTime,
  startOfBusinessDay,
  endOfBusinessDay,
  toBusinessCalendarDate,
} = require('../utils/businessTimezone');

const toObjectId = (id) =>
  id && mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(String(id)) : id;

/** Filter bills by collection date (createdAt) or utility due date (dueDate). */
const buildBillDateRange = (startDate, endDate, dateFilterBy = 'due') => {
  if (!startDate && !endDate) return null;

  const range = {};
  if (startDate) {
    const start = parseBusinessDateBoundary(startDate, false);
    if (start) range.$gte = start;
  }
  if (endDate) {
    const end = parseBusinessDateBoundary(endDate, true);
    if (end) range.$lte = end;
  }
  if (Object.keys(range).length === 0) return null;

  const field = dateFilterBy === 'recorded' ? 'createdAt' : 'dueDate';
  return { [field]: range };
};

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

const isPaidAfterDueDate = (dueDate, paymentDate) => {
  if (!dueDate || !paymentDate) return false;
  const dueEnd = endOfBusinessDay(toBusinessCalendarDate(dueDate));
  const paidAt = parseBusinessDateTime(paymentDate) || new Date(paymentDate);
  return paidAt > dueEnd;
};

const applyBillPaymentFinancials = (billPayment) => {
  const billAmount = Number(billPayment.billAmount || 0);
  const serviceCharge = Number(billPayment.serviceCharge || 0);
  billPayment.totalReceived = billAmount + serviceCharge;

  if (billPayment.status !== 'paid') {
    billPayment.actualBillAmount = undefined;
    billPayment.latePaymentLoss = 0;
    billPayment.netBillProfit = serviceCharge;
    billPayment.paidAfterDueDate = false;
    return billPayment;
  }

  const paymentDate = billPayment.paymentDate || new Date();
  const paidLate = isPaidAfterDueDate(billPayment.dueDate, paymentDate);
  billPayment.paidAfterDueDate = paidLate;

  if (paidLate) {
    const actualBillAmount = Math.max(
      Number(billPayment.actualBillAmount ?? billAmount),
      billAmount,
    );
    billPayment.actualBillAmount = actualBillAmount;
    billPayment.latePaymentLoss = Math.max(0, actualBillAmount - billAmount);
  } else {
    billPayment.actualBillAmount = billAmount;
    billPayment.latePaymentLoss = 0;
  }

  billPayment.netBillProfit = serviceCharge - billPayment.latePaymentLoss;
  return billPayment;
};

const syncBillCashEntry = async (billPayment) => {
  const commonFields = {
    organizationId: billPayment.organizationId,
    branchId: billPayment.branchId,
    source: 'bill_payment',
    paymentMethod: billPayment.paymentMethod,
    referenceId: billPayment._id,
    referenceModel: 'BillPayment',
    createdBy: billPayment.createdBy,
  };

  // INCOME: total collected from customer (bill amount + service charge)
  // Created as soon as bill is recorded — customer pays at the counter immediately
  const incomeEntry = cashBookService.upsertReferenceEntry({
    ...commonFields,
    type: 'income',
    amount: billPayment.totalReceived,
    date: billPayment.createdAt,
    description: `Bill collection: ${billPayment.companyName} – Ref# ${billPayment.referenceNumber} (${billPayment.customerName})`,
  });

  // EXPENSE: bill amount paid to utility company — only when bill is actually paid
  let expenseEntry;
  if (billPayment.status === 'paid') {
    const utilityAmount = Number(billPayment.actualBillAmount || billPayment.billAmount);
    const lateSuffix = billPayment.paidAfterDueDate && billPayment.latePaymentLoss > 0
      ? ' (includes late payment surcharge)'
      : '';
    expenseEntry = cashBookService.upsertReferenceEntry({
      ...commonFields,
      type: 'expense',
      amount: utilityAmount,
      date: billPayment.paymentDate || billPayment.createdAt,
      description: `Bill paid to ${billPayment.companyName} – Ref# ${billPayment.referenceNumber} (${billPayment.customerName})${lateSuffix}`,
    });
  } else {
    // Remove expense entry if bill reverted from paid
    expenseEntry = cashBookService.deleteEntriesByReference(billPayment._id, 'BillPayment')
      .then(() => null);
    // Re-create only income after deleting all
    return expenseEntry.then(() =>
      cashBookService.upsertReferenceEntry({
        ...commonFields,
        type: 'income',
        amount: billPayment.totalReceived,
        date: billPayment.createdAt,
        description: `Bill collection: ${billPayment.companyName} – Ref# ${billPayment.referenceNumber} (${billPayment.customerName})`,
      })
    );
  }

  const [income, expense] = await Promise.all([incomeEntry, expenseEntry]);
  return { income, expense };
};

const createBillPayment = async (body) => {
  const status = body.status || 'pending';
  const billPayment = new BillPayment({
    ...body,
    dueDate: parseBusinessDateTime(body.dueDate) || body.dueDate,
    status,
    paymentDate:
      status === 'paid' ? parseBusinessDateTime(body.paymentDate) || body.paymentDate || new Date() : null,
  });
  applyBillPaymentFinancials(billPayment);
  await billPayment.save();
  await syncBillCashEntry(billPayment);
  return billPayment;
};

const createBillPaymentsBatch = async (body) => {
  const { companyId, companyName, billType, serviceCharge, dueDate, paymentDate, paymentMethod, bills, organizationId, branchId, createdBy } = body;
  const results = [];
  for (const bill of bills) {
    const singleBody = {
      organizationId,
      branchId,
      createdBy,
      companyId,
      companyName,
      billType,
      serviceCharge: Number(serviceCharge || 0),
      dueDate,
      paymentDate: null,
      paymentMethod,
      status: 'pending',
      billAmount: Number(bill.billAmount),
      customerName: bill.customerName || 'Walk-in',
      referenceNumber: bill.referenceNumber || '-',
    };
    const created = await createBillPayment(singleBody);
    results.push(created);
  }
  return results;
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

  const dateFilterBy = queryOptions.dateFilterBy === 'recorded' ? 'recorded' : 'due';
  const billDateRange = buildBillDateRange(queryOptions.dueStartDate, queryOptions.dueEndDate, dateFilterBy);
  if (billDateRange) {
    queryFilter.$and = [...(queryFilter.$and || []), billDateRange];
    delete queryOptions.dueStartDate;
    delete queryOptions.dueEndDate;
  }
  delete queryOptions.dateFilterBy;

  return BillPayment.paginate(queryFilter, {
    ...queryOptions,
    sortBy:
      queryOptions.sortBy ||
      (billDateRange
        ? dateFilterBy === 'recorded'
          ? 'createdAt:desc'
          : 'dueDate:asc'
        : 'createdAt:desc'),
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

  if (updateBody.dueDate) {
    billPayment.dueDate = parseBusinessDateTime(updateBody.dueDate) || updateBody.dueDate;
  }
  if (updateBody.paymentDate) {
    billPayment.paymentDate = parseBusinessDateTime(updateBody.paymentDate) || updateBody.paymentDate;
  }

  if (billPayment.status === 'paid' && !billPayment.paymentDate) {
    billPayment.paymentDate = new Date();
  }

  applyBillPaymentFinancials(billPayment);
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
          totalLatePaymentLoss: { $sum: { $ifNull: ['$latePaymentLoss', 0] } },
          totalNetBillProfit: { $sum: { $ifNull: ['$netBillProfit', '$serviceCharge'] } },
          totalActualBillAmount: { $sum: { $ifNull: ['$actualBillAmount', '$billAmount'] } },
          latePaidCount: {
            $sum: { $cond: [{ $gt: [{ $ifNull: ['$latePaymentLoss', 0] }, 0] }, 1, 0] },
          },
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
          totalLatePaymentLoss: { $sum: { $ifNull: ['$latePaymentLoss', 0] } },
          totalNetBillProfit: { $sum: { $ifNull: ['$netBillProfit', '$serviceCharge'] } },
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
          totalLatePaymentLoss: { $sum: { $ifNull: ['$latePaymentLoss', 0] } },
          totalNetBillProfit: { $sum: { $ifNull: ['$netBillProfit', '$serviceCharge'] } },
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
          totalLatePaymentLoss: { $sum: { $ifNull: ['$latePaymentLoss', 0] } },
          totalNetBillProfit: { $sum: { $ifNull: ['$netBillProfit', '$serviceCharge'] } },
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
    totalLatePaymentLoss: 0,
    totalNetBillProfit: 0,
    totalActualBillAmount: 0,
    latePaidCount: 0,
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
    totalLatePaymentLoss: result.totalLatePaymentLoss,
    totalNetBillProfit: result.totalNetBillProfit,
    totalActualBillAmount: result.totalActualBillAmount,
    latePaidCount: result.latePaidCount,
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
 * Used by summary cards and the due-date filter panel on the frontend.
 */
const getDueDateRangeSummary = async ({
  organizationId,
  branchId,
  dueStartDate,
  dueEndDate,
  dateFilterBy = 'due',
}) => {
  await refreshOverdueStatuses(organizationId, branchId);

  const filterMode = dateFilterBy === 'recorded' ? 'recorded' : 'due';
  const filter = { organizationId: toObjectId(organizationId), status: { $in: ['pending', 'overdue'] } };
  if (branchId) filter.branchId = toObjectId(branchId);

  const billDateRange = buildBillDateRange(dueStartDate, dueEndDate, filterMode);
  if (billDateRange) {
    filter.$and = [...(filter.$and || []), billDateRange];
  }

  const todayStr = toBusinessCalendarDate(new Date());
  const startOfToday = startOfBusinessDay(todayStr);
  const endOfToday = endOfBusinessDay(todayStr);

  const dueTodayFilter = {
    organizationId: toObjectId(organizationId),
    status: 'pending',
    dueDate: { $gte: startOfToday, $lte: endOfToday },
  };
  if (branchId) dueTodayFilter.branchId = toObjectId(branchId);

  const overdueFilter = {
    organizationId: toObjectId(organizationId),
    status: 'overdue',
  };
  if (branchId) overdueFilter.branchId = toObjectId(branchId);
  if (filterMode === 'due' && billDateRange) {
    overdueFilter.$and = [...(overdueFilter.$and || []), billDateRange];
  }

  const [agg, dueTodayCount, overdueCount] = await Promise.all([
    BillPayment.aggregate([
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
    ]),
    BillPayment.countDocuments(dueTodayFilter),
    BillPayment.countDocuments(overdueFilter),
  ]);

  const result = agg[0] || { totalBills: 0, totalBillAmount: 0, totalServiceCharges: 0, totalReceived: 0 };

  return {
    ...result,
    dueTodayCount,
    overdueCount,
  };
};

module.exports = {
  createBillPayment,
  createBillPaymentsBatch,
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
