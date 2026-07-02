const httpStatus = require('http-status');
const { AgentBill, Expense, PersonalLedger, CashBookEntry } = require('../models');
const walletEntryService = require('./walletEntry.service');
const cashBookService = require('./cashBook.service');
const personalLedgerService = require('./personalLedger.service');
const expenseService = require('./expense.service');
const ApiError = require('../utils/ApiError');

/**
 * Accounting per bill row:
 *   currentBillAmount  → cash book income (if cash/bank) or wallet-in (if wallet)
 *   previousBillAmount → PersonalLedger income entry ("My Wallet" tab in Accounts)
 *   overdueAmount      → Expense table (auto-category "Overdue")
 */
const createAgentBillsBatch = async ({
  bills,
  companyId,
  companyName,
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
    const profit = Number(bill.profit || 0);
    const total = currentBill + previousBill + overdue;
    const entryDate = dueDate ? new Date(dueDate) : new Date();

    const agentBill = new AgentBill({
      organizationId,
      branchId,
      companyId,
      companyName,
      dueDate: entryDate,
      paymentMethod,
      walletType,
      customerName: bill.customerName,
      referenceNumber: bill.referenceNumber,
      mobileNo: bill.mobileNo,
      currentBillAmount: currentBill,
      previousBillAmount: previousBill,
      overdueAmount: overdue,
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
          date: entryDate,
          createdBy,
        });
      } else {
        await cashBookService.upsertReferenceEntry({
          ...commonRef,
          type: 'income',
          paymentMethod: paymentMethod || 'cash',
          amount: currentBill,
          date: entryDate,
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
        transactionDate: entryDate,
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

    // Overdue → charged later by scheduler when due date passes, not on save

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
    //   before due date → current + previous (no penalty)
    //   after  due date → current + previous + overdue (penalty applies)
    const overdueOut = overdueApplies ? bill.overdueAmount : 0;
    const totalPaid = bill.currentBillAmount + bill.previousBillAmount + overdueOut;

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

module.exports = { createAgentBillsBatch, getAgentBills, updateAgentBillById, deleteAgentBillById, chargeOverdueBills };
