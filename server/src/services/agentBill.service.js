const mongoose = require('mongoose');
const httpStatus = require('http-status');
const { AgentBill, Expense, PersonalLedger, CashBookEntry } = require('../models');
const walletEntryService = require('./walletEntry.service');
const cashBookService = require('./cashBook.service');
const personalLedgerService = require('./personalLedger.service');
const expenseService = require('./expense.service');
const ApiError = require('../utils/ApiError');

const toObjectId = (id) =>
  id && mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(String(id)) : id;

/**
 * Accounting per bill row:
 *   currentBillAmount      → cash book income (if cash/bank) or wallet-in (if wallet)
 *   previousBillAmount     → PersonalLedger income entry ("My Wallet" tab in Accounts)
 *   overdueAmount          → Expense table (auto-category "Overdue"), charged later by
 *                            scheduler once this bill's own due date passes unpaid
 *   previousOverdueAmount  → Expense table (auto-category "Overdue"), charged instantly
 *                            since it's arrears already overdue from a prior cycle
 */
const createAgentBillsBatch = async ({
  bills,
  companyId,
  companyName,
  collectionDate,
  dueDate,
  paymentMethod,
  walletType,
  organizationId,
  branchId,
  createdBy,
}) => {
  const results = [];

  for (const bill of bills) {
    const currentBill = Number(bill.currentBillAmount || 0);
    const previousBill = Number(bill.previousBillAmount || 0);
    const overdue = Number(bill.overdueAmount || 0);
    const previousOverdue = Number(bill.previousOverdueAmount || 0);
    const profit = Number(bill.profit || 0);
    const total = currentBill + previousBill + overdue + previousOverdue;
    const entryDate = dueDate ? new Date(dueDate) : new Date();
    const collectedOn = collectionDate ? new Date(collectionDate) : new Date();

    const agentBill = new AgentBill({
      organizationId,
      branchId,
      companyId,
      companyName,
      collectionDate: collectedOn,
      dueDate: entryDate,
      paymentMethod,
      walletType,
      customerName: bill.customerName,
      referenceNumber: bill.referenceNumber,
      mobileNo: bill.mobileNo,
      currentBillAmount: currentBill,
      previousBillAmount: previousBill,
      overdueAmount: overdue,
      previousOverdueAmount: previousOverdue,
      profit,
      totalAmount: total,
      createdBy,
    });
    await agentBill.save();

    const commonRef = {
      organizationId,
      branchId,
      referenceId: agentBill._id,
      referenceModel: 'AgentBill',
      source: 'agent_bill',
      createdBy,
    };

    // Current bill → cash in hand (cash book income) or wallet-in
    // Dated on the collection date (when the cash actually changed hands), not the
    // due date, so it shows up in "today"/date-range reports immediately.
    if (currentBill > 0) {
      const isWallet = paymentMethod === 'wallet' && walletType;
      if (isWallet) {
        await walletEntryService.syncWalletPayment({
          organizationId,
          branchId,
          referenceId: agentBill._id,
          referenceModel: 'AgentBill',
          direction: 'in',
          amount: currentBill,
          paymentMethod: 'wallet',
          walletType,
          description: `Current bill: ${bill.customerName} – Ref# ${bill.referenceNumber}`,
          date: collectedOn,
          createdBy,
        });
      } else {
        await cashBookService.upsertReferenceEntry({
          ...commonRef,
          type: 'income',
          paymentMethod: paymentMethod || 'cash',
          amount: currentBill,
          date: collectedOn,
          description: `Current bill (cash): ${bill.customerName} – Ref# ${bill.referenceNumber}`,
        });
      }
    }

    // Previous bill → PersonalLedger income (My Wallet page only, NOT cash book)
    if (previousBill > 0) {
      const ledgerEntry = await personalLedgerService.createEntry({
        organizationId,
        branchId,
        transactionType: 'income',
        transactionDate: collectedOn,
        description: `Previous bill: ${bill.customerName} – Ref# ${bill.referenceNumber}`,
        category: 'Bill Collection',
        reference: bill.referenceNumber,
        credit: previousBill,
        debit: 0,
        paymentMethod: 'Cash',
        referenceId: agentBill._id,
        referenceModel: 'AgentBill',
        createdBy,
      });
      // personalLedgerService.createEntry auto-syncs to cash book — remove that mirror
      // so the previous-bill amount only appears in My Wallet, not in Cash Book
      if (ledgerEntry?._id) {
        await cashBookService.deleteEntriesByReference(ledgerEntry._id, 'PersonalLedger');
      }
    }

    // Previous overdue → charged instantly (arrears already overdue at creation time)
    if (previousOverdue > 0) {
      await expenseService.createExpense({
        organizationId,
        branchId,
        category: 'Overdue',
        description: `Previous overdue charge: ${bill.customerName} – Ref# ${bill.referenceNumber}`,
        amount: previousOverdue,
        paymentMethod: 'Cash',
        date: collectedOn,
        reference: bill.referenceNumber,
        vendor: bill.customerName,
        referenceId: agentBill._id,
        referenceModel: 'AgentBill',
        createdBy,
      }, { skipCashBookSync: true });
    }

    // Current-cycle overdue → charged later by scheduler when due date passes, not on save

    results.push(agentBill);
  }

  return results;
};

const getAgentBills = async (filter, options) => {
  if (options.search) {
    const re = { $regex: options.search, $options: 'i' };
    filter.$or = [{ customerName: re }, { referenceNumber: re }, { mobileNo: re }];
    delete options.search;
  }
  if (options.startDate || options.endDate) {
    filter.dueDate = {};
    if (options.startDate) { filter.dueDate.$gte = new Date(options.startDate); delete options.startDate; }
    if (options.endDate) {
      const end = new Date(options.endDate);
      end.setHours(23, 59, 59, 999);
      filter.dueDate.$lte = end;
      delete options.endDate;
    }
  }
  return AgentBill.paginate(filter, { ...options, sortBy: options.sortBy || 'createdAt:desc' });
};

const updateAgentBillById = async (id, updateBody) => {
  const bill = await AgentBill.findById(id);
  if (!bill) throw new ApiError(httpStatus.NOT_FOUND, 'Agent bill not found');

  const isBeingPaid = updateBody.isPaid === true && !bill.isPaid;
  const hasUnchargedOverdue = bill.overdueAmount > 0 && !bill.overdueCharged;

  const isBeingUnpaid = updateBody.isPaid === false && bill.isPaid === true;

  if (isBeingPaid) {
    const now = new Date();
    const duePassed = bill.dueDate && new Date(bill.dueDate) <= now;
    const overdueApplies = duePassed && bill.overdueAmount > 0;

    // Total paid to government:
    //   always            → current + previous + previous overdue (already-due arrears)
    //   after due date    → + current-cycle overdue (penalty applies once due date passes)
    const overdueOut = overdueApplies ? bill.overdueAmount : 0;
    const totalPaid = bill.currentBillAmount + bill.previousBillAmount + bill.previousOverdueAmount + overdueOut;

    // Create a DEBIT entry (cashbook decreases — agent paid to government)
    // Uses source 'agent_bill_payment' so it is separate from the income entry created at collection time.
    if (totalPaid > 0) {
      await cashBookService.upsertReferenceEntry({
        organizationId: bill.organizationId,
        branchId: bill.branchId,
        referenceId: bill._id,
        referenceModel: 'AgentBill',
        source: 'agent_bill_payment',
        createdBy: bill.createdBy,
        type: 'expense',
        paymentMethod: 'cash',
        amount: totalPaid,
        date: now,
        description: `Bill paid to govt: ${bill.customerName} – Ref# ${bill.referenceNumber}`,
      });
    }

    // Record overdue as expense (no cashbook sync — already in the debit total above).
    if (overdueApplies && !bill.overdueCharged) {
      const claimed = await AgentBill.findOneAndUpdate(
        { _id: id, overdueCharged: false },
        { $set: { overdueCharged: true } },
        { new: false },
      );
      if (claimed) {
        await expenseService.createExpense({
          organizationId: bill.organizationId,
          branchId: bill.branchId,
          category: 'Overdue',
          description: `Overdue charge: ${bill.customerName} – Ref# ${bill.referenceNumber}`,
          amount: bill.overdueAmount,
          paymentMethod: 'Cash',
          date: now,
          reference: bill.referenceNumber,
          vendor: bill.customerName,
          referenceId: bill._id,
          referenceModel: 'AgentBill',
          createdBy: bill.createdBy,
        }, { skipCashBookSync: true });
      }
      updateBody.overdueCharged = true;
    }
  }

  // Unpay: reverse the payment debit entry (restore cashbook)
  if (isBeingUnpaid) {
    await CashBookEntry.deleteMany({
      referenceId: bill._id,
      referenceModel: 'AgentBill',
      source: 'agent_bill_payment',
    });
  }

  Object.assign(bill, updateBody);
  await bill.save();
  return bill;
};

const deleteAgentBillById = async (id) => {
  const bill = await AgentBill.findById(id);
  if (!bill) throw new ApiError(httpStatus.NOT_FOUND, 'Agent bill not found');

  // Reverse cash book / wallet entry for current bill
  await cashBookService.deleteEntriesByReference(bill._id, 'AgentBill');
  if (bill.paymentMethod === 'wallet' && bill.walletType) {
    await walletEntryService.reverseWalletPayment({
      organizationId: bill.organizationId,
      branchId: bill.branchId,
      referenceId: bill._id,
      referenceModel: 'AgentBill',
      direction: 'in',
      amount: bill.currentBillAmount || 0,
      paymentMethod: 'wallet',
      walletType: bill.walletType,
      userId: bill.createdBy,
    });
  }

  // Remove PersonalLedger entries (previous bill → My Wallet) and their cash book mirrors
  const ledgerEntries = await PersonalLedger.find({ referenceId: bill._id, referenceModel: 'AgentBill' });
  for (const entry of ledgerEntries) {
    await cashBookService.deleteEntriesByReference(entry._id, 'PersonalLedger');
    await personalLedgerService.deleteEntry(entry._id);
  }

  // Remove linked expenses (overdue) and their cashbook entries
  const linkedExpenses = await Expense.find({ referenceId: bill._id, referenceModel: 'AgentBill' });
  for (const exp of linkedExpenses) {
    await cashBookService.deleteEntriesByReference(exp._id, 'Expense');
    await exp.deleteOne();
  }

  await bill.deleteOne();
  return bill;
};

/**
 * Called daily by scheduler: finds all bills whose due date has passed,
 * overdue amount is > 0, and overdue hasn't been charged yet.
 * Creates an Expense entry and marks overdueCharged = true.
 */
const chargeOverdueBills = async () => {
  // Charge overdue for any bill whose due date is today or earlier
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const dueBills = await AgentBill.find({
    overdueAmount: { $gt: 0 },
    overdueCharged: false,
    isPaid: false, // skip bills already paid (overdue handled at payment time)
    dueDate: { $lte: endOfToday },
  });

  let charged = 0;
  let errors = 0;
  const now = new Date();
  for (const bill of dueBills) {
    try {
      // skipCashBookSync: cashbook will be updated when user pays the bill
      await expenseService.createExpense({
        organizationId: bill.organizationId,
        branchId: bill.branchId,
        category: 'Overdue',
        description: `Overdue charge: ${bill.customerName} – Ref# ${bill.referenceNumber}`,
        amount: bill.overdueAmount,
        paymentMethod: 'Cash',
        date: now,
        reference: bill.referenceNumber,
        vendor: bill.customerName,
        referenceId: bill._id,
        referenceModel: 'AgentBill',
        createdBy: bill.createdBy,
      }, { skipCashBookSync: true });
      bill.overdueCharged = true;
      await bill.save();
      charged++;
    } catch (err) {
      errors++;
    }
  }
  return { charged, errors, total: dueBills.length };
};

/**
 * Aggregated report for agent bills — summary cards, daily trend, and
 * breakdown by company. Date range filters on collectionDate, since that's
 * when the cash actually changed hands (dueDate is only the remittance
 * deadline to the utility company).
 */
const getAgentBillReport = async ({ organizationId, branchId, startDate, endDate, companyId }) => {
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
  const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

  const baseFilter = { organizationId: toObjectId(organizationId) };
  if (branchId) baseFilter.branchId = toObjectId(branchId);
  if (companyId) baseFilter.companyId = toObjectId(companyId);

  const rangeFilter = { ...baseFilter };
  if (startDate || endDate) {
    rangeFilter.collectionDate = {};
    if (startDate) rangeFilter.collectionDate.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      rangeFilter.collectionDate.$lte = end;
    }
  }

  // A bill's overdue portion counts once it's already been charged to Expense
  // (overdueCharged), or once its due date has passed even if not yet charged.
  const overdueAppliesExpr = {
    $or: [
      '$overdueCharged',
      { $and: [{ $gt: ['$overdueAmount', 0] }, { $lt: ['$dueDate', today] }] },
    ],
  };

  const [
    summaryAgg,
    trendAgg,
    byCompanyAgg,
    pendingCount,
    dueTodayCount,
    overdueCount,
    bills,
    pendingPayableAgg,
    overduePaidAgg,
  ] = await Promise.all([
    AgentBill.aggregate([
      { $match: rangeFilter },
      {
        $addFields: { overdueApplies: overdueAppliesExpr },
      },
      {
        $addFields: {
          billTotal: {
            $add: [
              '$currentBillAmount',
              '$previousBillAmount',
              '$previousOverdueAmount',
              { $cond: ['$overdueApplies', '$overdueAmount', 0] },
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          totalBills: { $sum: 1 },
          totalCurrentBill: { $sum: '$currentBillAmount' },
          totalPreviousBill: { $sum: '$previousBillAmount' },
          totalOverdue: { $sum: '$overdueAmount' },
          totalPreviousOverdue: { $sum: '$previousOverdueAmount' },
          totalCollection: { $sum: '$billTotal' },
          totalPayable: { $sum: { $cond: ['$isPaid', 0, '$billTotal'] } },
          totalProfit: { $sum: '$profit' },
        },
      },
    ]),
    AgentBill.aggregate([
      { $match: rangeFilter },
      {
        $addFields: { overdueApplies: overdueAppliesExpr },
      },
      {
        $addFields: {
          billTotal: {
            $add: [
              '$currentBillAmount',
              '$previousBillAmount',
              '$previousOverdueAmount',
              { $cond: ['$overdueApplies', '$overdueAmount', 0] },
            ],
          },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$collectionDate' } },
          billCount: { $sum: 1 },
          totalCollection: { $sum: '$billTotal' },
          totalProfit: { $sum: '$profit' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    AgentBill.aggregate([
      { $match: rangeFilter },
      {
        $addFields: { overdueApplies: overdueAppliesExpr },
      },
      {
        $addFields: {
          billTotal: {
            $add: [
              '$currentBillAmount',
              '$previousBillAmount',
              '$previousOverdueAmount',
              { $cond: ['$overdueApplies', '$overdueAmount', 0] },
            ],
          },
        },
      },
      {
        $group: {
          _id: '$companyName',
          billCount: { $sum: 1 },
          totalCollection: { $sum: '$billTotal' },
          totalOverdue: { $sum: '$overdueAmount' },
          totalPayable: { $sum: { $cond: ['$isPaid', 0, '$billTotal'] } },
          totalProfit: { $sum: '$profit' },
        },
      },
      { $sort: { totalCollection: -1 } },
      { $limit: 10 },
    ]),
    AgentBill.countDocuments({ ...baseFilter, isPaid: false }),
    AgentBill.countDocuments({ ...baseFilter, isPaid: false, dueDate: { $gte: startOfToday, $lte: endOfToday } }),
    AgentBill.countDocuments({ ...baseFilter, isPaid: false, dueDate: { $lt: startOfToday } }),
    // Full bill list for the detailed report table
    AgentBill.find(rangeFilter).sort({ collectionDate: -1, createdAt: -1 }),
    // Pending bills: what's actually payable right now — overdue only counted
    // in once its own due date has passed (or it's already been charged).
    AgentBill.aggregate([
      { $match: { ...baseFilter, isPaid: false } },
      { $addFields: { overdueApplies: overdueAppliesExpr } },
      {
        $group: {
          _id: null,
          totalPendingPayable: {
            $sum: {
              $add: [
                '$currentBillAmount',
                '$previousBillAmount',
                '$previousOverdueAmount',
                { $cond: ['$overdueApplies', '$overdueAmount', 0] },
              ],
            },
          },
          totalPendingOverdueIncluded: { $sum: { $cond: ['$overdueApplies', '$overdueAmount', 0] } },
        },
      },
    ]),
    // Paid bills: how much of the overdue amount has actually been remitted already.
    AgentBill.aggregate([
      { $match: { ...baseFilter, isPaid: true } },
      {
        $group: {
          _id: null,
          totalOverduePaid: {
            $sum: { $add: ['$previousOverdueAmount', { $cond: ['$overdueCharged', '$overdueAmount', 0] }] },
          },
        },
      },
    ]),
  ]);

  const summary = summaryAgg[0] || {
    totalBills: 0,
    totalCurrentBill: 0,
    totalPreviousBill: 0,
    totalOverdue: 0,
    totalPreviousOverdue: 0,
    totalCollection: 0,
    totalPayable: 0,
    totalProfit: 0,
  };

  const pendingPayable = pendingPayableAgg[0] || { totalPendingPayable: 0, totalPendingOverdueIncluded: 0 };
  const overduePaid = overduePaidAgg[0] || { totalOverduePaid: 0 };

  return {
    totalBills: summary.totalBills,
    totalCurrentBill: summary.totalCurrentBill,
    totalPreviousBill: summary.totalPreviousBill,
    totalOverdue: summary.totalOverdue,
    totalPreviousOverdue: summary.totalPreviousOverdue,
    totalCollection: summary.totalCollection,
    totalPayable: summary.totalPayable,
    totalProfit: summary.totalProfit,
    totalPending: pendingCount,
    totalDueToday: dueTodayCount,
    totalOverdueBills: overdueCount,
    totalPendingPayable: pendingPayable.totalPendingPayable,
    totalPendingOverdueIncluded: pendingPayable.totalPendingOverdueIncluded,
    totalOverduePaid: overduePaid.totalOverduePaid,
    trend: trendAgg,
    byCompany: byCompanyAgg,
    bills,
  };
};

module.exports = {
  createAgentBillsBatch,
  getAgentBills,
  updateAgentBillById,
  deleteAgentBillById,
  chargeOverdueBills,
  getAgentBillReport,
};
