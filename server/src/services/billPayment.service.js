const mongoose = require('mongoose');
const httpStatus = require('http-status');
const { BillPayment } = require('../models');
const ApiError = require('../utils/ApiError');
const cashBookService = require('./cashBook.service');
const walletEntryService = require('./walletEntry.service');
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

/** Amount actually owed to the utility company once this bill is marked paid, else 0. */
const computeBillUtilityAmount = (billPayment) =>
  billPayment.status === 'paid' ? Number(billPayment.actualBillAmount || billPayment.billAmount || 0) : 0;

const syncBillCashEntry = async (billPayment, previous = null) => {
  const isWalletPayment = billPayment.paymentMethod === 'wallet' && billPayment.walletType;
  const utilityAmount = computeBillUtilityAmount(billPayment);

  const commonFields = {
    organizationId: billPayment.organizationId,
    branchId: billPayment.branchId,
    source: 'bill_payment',
    paymentMethod: billPayment.paymentMethod,
    referenceId: billPayment._id,
    referenceModel: 'BillPayment',
    createdBy: billPayment.createdBy,
  };

  if (isWalletPayment) {
    await cashBookService.deleteEntriesByReference(billPayment._id, 'BillPayment');
  } else {
    // INCOME: total collected from customer (bill amount + service charge)
    // Created as soon as bill is recorded — customer pays at the counter immediately
    const incomeEntry = cashBookService.upsertReferenceEntry({
      ...commonFields,
      type: 'income',
      amount: billPayment.totalReceived,
      date: billPayment.createdAt,
      description: `Bill collection: ${billPayment.companyName} – Ref# ${billPayment.referenceNumber} (${billPayment.customerName})`,
    });

    // EXPENSE: bill amount paid to utility company — only when bill is actually paid.
    // CashBook entries aren't leg-scoped, so reverting from paid means wiping both
    // entries first, then re-creating just the income leg.
    if (utilityAmount > 0) {
      const lateSuffix = billPayment.paidAfterDueDate && billPayment.latePaymentLoss > 0
        ? ' (includes late payment surcharge)'
        : '';
      await Promise.all([
        incomeEntry,
        cashBookService.upsertReferenceEntry({
          ...commonFields,
          type: 'expense',
          amount: utilityAmount,
          date: billPayment.paymentDate || billPayment.createdAt,
          description: `Bill paid to ${billPayment.companyName} – Ref# ${billPayment.referenceNumber} (${billPayment.customerName})${lateSuffix}`,
        }),
      ]);
    } else {
      await incomeEntry;
      await cashBookService.deleteEntriesByReference(billPayment._id, 'BillPayment');
      await cashBookService.upsertReferenceEntry({
        ...commonFields,
        type: 'income',
        amount: billPayment.totalReceived,
        date: billPayment.createdAt,
        description: `Bill collection: ${billPayment.companyName} – Ref# ${billPayment.referenceNumber} (${billPayment.customerName})`,
      });
    }
  }

  // Wallet ledger: both legs share the same wallet (paymentMethod/walletType).
  await walletEntryService.syncWalletPayment({
    organizationId: billPayment.organizationId,
    branchId: billPayment.branchId,
    referenceId: billPayment._id,
    referenceModel: 'BillPayment',
    direction: 'in',
    amount: billPayment.totalReceived,
    paymentMethod: billPayment.paymentMethod,
    walletType: billPayment.walletType,
    previousPaymentMethod: previous?.paymentMethod,
    previousWalletType: previous?.walletType,
    previousAmount: previous?.totalReceived,
    description: `Bill collection: ${billPayment.companyName} – Ref# ${billPayment.referenceNumber} (${billPayment.customerName})`,
    date: billPayment.createdAt,
    createdBy: billPayment.createdBy,
    updatedBy: billPayment.updatedBy,
  });

  await walletEntryService.syncWalletPayment({
    organizationId: billPayment.organizationId,
    branchId: billPayment.branchId,
    referenceId: billPayment._id,
    referenceModel: 'BillPayment',
    direction: 'out',
    amount: utilityAmount,
    paymentMethod: billPayment.paymentMethod,
    walletType: billPayment.walletType,
    previousPaymentMethod: previous?.paymentMethod,
    previousWalletType: previous?.walletType,
    previousAmount: previous?.utilityAmount,
    description: `Bill paid to ${billPayment.companyName} – Ref# ${billPayment.referenceNumber} (${billPayment.customerName})`,
    date: billPayment.paymentDate || billPayment.createdAt,
    createdBy: billPayment.createdBy,
    updatedBy: billPayment.updatedBy,
  });
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
  const { companyId, companyName, billType, serviceCharge, dueDate, paymentDate, paymentMethod, walletType, bills, organizationId, branchId, createdBy } = body;
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
      walletType,
      status: 'pending',
      billAmount: Number(bill.billAmount),
      expectedLateAmount: bill.expectedLateAmount != null ? Number(bill.expectedLateAmount) : undefined,
      customerName: bill.customerName || 'Walk-in',
      referenceNumber: bill.referenceNumber || '-',
    };
    const created = await createBillPayment(singleBody);
    results.push(created);
  }
  return results;
};

/**
 * Create a new bill and settle an older unpaid bill on the same Ref # as a single
 * combined cash event — for when the customer physically only hands over the net
 * difference (new bill total minus what's owed on the old one), rather than the
 * shop collecting the new bill's full amount and separately paying out the old
 * one. Both bills still get their own correct amount/profit/loss fields (for
 * receipts and reports), but only ONE net Cash Book/wallet entry is recorded
 * against the new bill, instead of two larger entries that happen to net out —
 * matching what actually moved in the till.
 */
const settleCombinedBill = async ({ newBill, oldBillId, actualOldBillAmount, userId }) => {
  const created = new BillPayment({
    ...newBill,
    dueDate: parseBusinessDateTime(newBill.dueDate) || newBill.dueDate,
    status: 'pending',
    paymentDate: null,
    createdBy: userId,
  });
  applyBillPaymentFinancials(created);
  await created.save();

  const oldBill = await getBillPaymentById(oldBillId);
  if (oldBill.status === 'paid') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'That old bill is already paid');
  }
  oldBill.status = 'paid';
  oldBill.paymentDate = new Date();
  oldBill.actualBillAmount = Number(actualOldBillAmount);
  oldBill.updatedBy = userId;
  applyBillPaymentFinancials(oldBill);
  await oldBill.save();
  // Deliberately skip syncBillCashEntry for both — the new bill's income leg and
  // the old bill's expense leg are folded into the single net entry below instead.

  const net = created.totalReceived - oldBill.actualBillAmount;
  const commonFields = {
    organizationId: created.organizationId,
    branchId: created.branchId,
    source: 'bill_payment',
    paymentMethod: created.paymentMethod,
    referenceId: created._id,
    referenceModel: 'BillPayment',
    createdBy: userId,
    date: new Date(),
  };
  const description = `Bill collection (net of old Ref# ${oldBill.referenceNumber} arrears): ${created.companyName} – Ref# ${created.referenceNumber} (${created.customerName})`;

  if (net !== 0) {
    await cashBookService.upsertReferenceEntry({
      ...commonFields,
      type: net > 0 ? 'income' : 'expense',
      amount: Math.abs(net),
      description,
    });
  }
  await walletEntryService.syncWalletPayment({
    organizationId: created.organizationId,
    branchId: created.branchId,
    referenceId: created._id,
    referenceModel: 'BillPayment',
    direction: net >= 0 ? 'in' : 'out',
    amount: Math.abs(net),
    paymentMethod: created.paymentMethod,
    walletType: created.walletType,
    description,
    date: new Date(),
    createdBy: userId,
  });

  return { newBill: created, oldBill };
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

/**
 * Settling the latest bill on a Ref # almost always means the cashier just paid the
 * utility company a combined figure that covers older, still-unpaid bills on the
 * same connection too — so paying the newest one auto-settles everything older
 * instead of leaving arrears that have to be closed out by hand, one by one.
 * Each older bill is paid using its own pre-recorded `expectedLateAmount` (the
 * "after due date" figure captured when it was created), falling back to its
 * original bill amount if none was set.
 */
const cascadeSettlePreviousBills = async (billPayment, userId) => {
  const olderUnpaid = await BillPayment.find({
    _id: { $ne: billPayment._id },
    organizationId: billPayment.organizationId,
    referenceNumber: billPayment.referenceNumber,
    companyId: billPayment.companyId,
    status: { $ne: 'paid' },
    dueDate: { $lt: billPayment.dueDate },
  });

  for (const old of olderUnpaid) {
    const previous = {
      paymentMethod: old.paymentMethod,
      walletType: old.walletType,
      totalReceived: old.totalReceived,
      utilityAmount: computeBillUtilityAmount(old),
    };
    old.status = 'paid';
    old.paymentDate = billPayment.paymentDate;
    old.actualBillAmount = old.expectedLateAmount ?? old.billAmount;
    old.updatedBy = userId;
    applyBillPaymentFinancials(old);
    await old.save();
    await syncBillCashEntry(old, previous);
  }
};

const updateBillPaymentById = async (id, updateBody, userId) => {
  const billPayment = await getBillPaymentById(id);
  const previous = {
    paymentMethod: billPayment.paymentMethod,
    walletType: billPayment.walletType,
    totalReceived: billPayment.totalReceived,
    utilityAmount: computeBillUtilityAmount(billPayment),
  };
  const wasAlreadyPaid = billPayment.status === 'paid';

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
  await syncBillCashEntry(billPayment, previous);

  if (billPayment.status === 'paid' && !wasAlreadyPaid) {
    await cascadeSettlePreviousBills(billPayment, userId);
  }

  return billPayment;
};

/**
 * Find the most recent unpaid bill sharing this reference number (excluding the bill
 * itself) — surfaced on a new bill's receipt so the customer sees the old arrears
 * alongside the new charges, instead of the two getting mixed up.
 */
const getPreviousOutstandingBill = async (billPayment) => {
  return BillPayment.findOne({
    _id: { $ne: billPayment._id },
    organizationId: billPayment.organizationId,
    referenceNumber: billPayment.referenceNumber,
    status: { $ne: 'paid' },
  })
    .sort({ dueDate: 1 })
    .lean();
};

const deleteBillPaymentById = async (id) => {
  const billPayment = await getBillPaymentById(id);
  await cashBookService.deleteEntriesByReference(billPayment._id, 'BillPayment');
  const userId = billPayment.updatedBy || billPayment.createdBy;
  await walletEntryService.reverseWalletPayment({
    organizationId: billPayment.organizationId,
    branchId: billPayment.branchId,
    referenceId: billPayment._id,
    referenceModel: 'BillPayment',
    direction: 'in',
    amount: billPayment.totalReceived,
    paymentMethod: billPayment.paymentMethod,
    walletType: billPayment.walletType,
    userId,
  });
  await walletEntryService.reverseWalletPayment({
    organizationId: billPayment.organizationId,
    branchId: billPayment.branchId,
    referenceId: billPayment._id,
    referenceModel: 'BillPayment',
    direction: 'out',
    amount: computeBillUtilityAmount(billPayment),
    paymentMethod: billPayment.paymentMethod,
    walletType: billPayment.walletType,
    userId,
  });
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
  settleCombinedBill,
  queryBillPayments,
  getBillPaymentById,
  updateBillPaymentById,
  deleteBillPaymentById,
  getBillsDueToday,
  getOverdueBills,
  getPreviousOutstandingBill,
  getBillPaymentReport,
  getDueDateRangeSummary,
  refreshOverdueStatuses,
};
