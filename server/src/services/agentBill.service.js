const httpStatus = require('http-status');
const { AgentBill, Expense, PersonalLedger } = require('../models');
const walletEntryService = require('./walletEntry.service');
const cashBookService = require('./cashBook.service');
const personalLedgerService = require('./personalLedger.service');
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

    // Overdue → Expense table (auto-category "Overdue")
    if (overdue > 0) {
      await Expense.create({
        organizationId,
        branchId,
        category: 'Overdue',
        description: `Overdue charge: ${bill.customerName} – Ref# ${bill.referenceNumber}`,
        amount: overdue,
        paymentMethod: 'Cash',
        date: entryDate,
        reference: bill.referenceNumber,
        vendor: bill.customerName,
        referenceId: agentBill._id,
        referenceModel: 'AgentBill',
        createdBy,
      });
    }

    results.push(agentBill);
  }

  return results;
};

const getAgentBills = async (filter, options) =>
  AgentBill.paginate(filter, { ...options, sortBy: options.sortBy || 'createdAt:desc' });

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

  // Remove linked expenses (overdue)
  await Expense.deleteMany({ referenceId: bill._id, referenceModel: 'AgentBill' });

  await bill.deleteOne();
  return bill;
};

module.exports = { createAgentBillsBatch, getAgentBills, deleteAgentBillById };
