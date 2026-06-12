const httpStatus = require('http-status');
const { CustomerLedger, Customer, Invoice } = require('../models');
const ApiError = require('../utils/ApiError');
const { normalizeCustomerInvoiceType } = require('../utils/ledgerInvoiceType');
const { buildCustomerSaleLedgerEntries } = require('../utils/ledgerSettlement');
const { consolidateCustomerCashEntries } = require('../utils/ledgerConsolidation');
const cashBookService = require('./cashBook.service');
const walletService = require('./wallet.service');
const walletEntryService = require('./walletEntry.service');
const accountsSystemService = require('./accountsSystem.service');

/**
 * Post a manual customer payment to the double-entry system.
 * Only standalone payments (no source document reference) are posted here —
 * payments embedded in an invoice are already accounted for by the invoice.
 */
const postCustomerLedgerToAccounts = (entry) => {
  if (!entry) return;
  const scope = { organizationId: entry.organizationId, branchId: entry.branchId, createdBy: entry.createdBy };
  const isManualPayment = entry.transactionType === 'payment_received' && !entry.referenceId;
  if (!isManualPayment) return;
  accountsSystemService
    .postCustomerPayment(scope, {
      amount: entry.credit,
      paymentMethod: entry.paymentMethod,
      ledgerId: entry._id,
      customerId: entry.customer,
      description: entry.description || 'Customer payment received',
      date: entry.transactionDate,
    })
    .catch(() => {});
};

const isWalletLedgerMethod = (paymentMethod) => {
  const method = String(paymentMethod || '').trim().toLowerCase();
  return method.includes('wallet') || method.includes('jazzcash') || method.includes('easypaisa');
};

/** On-account / credit sale — no cash movement */
const isCreditLedgerPayment = (paymentMethod) => {
  const m = String(paymentMethod || '').trim().toLowerCase();
  return m === 'credit';
};

const parseWalletType = (paymentMethod) => {
  const original = String(paymentMethod || '').trim();
  const normalized = original.toLowerCase();
  const walletMatch = original.match(/wallet\s*\((.+)\)/i);
  if (walletMatch && walletMatch[1]) {
    return walletMatch[1].trim();
  }
  if (normalized.includes('jazzcash')) return 'JazzCash';
  if (normalized.includes('easypaisa')) return 'EasyPaisa';
  return null;
};

const resolvePaymentSnapshot = (entryLike) => {
  const transactionType = String(entryLike?.transactionType || '').toLowerCase();
  if (transactionType !== 'payment_received' && transactionType !== 'payment_made') {
    return { isPayment: false, amount: 0, direction: null, walletType: null };
  }
  const isReceived = transactionType === 'payment_received';
  const amount = Number(isReceived ? entryLike?.credit : entryLike?.debit) || 0;
  const walletType = parseWalletType(entryLike?.paymentMethod);
  return {
    isPayment: amount > 0,
    amount,
    direction: isReceived ? 'in' : 'out',
    walletType,
  };
};

const syncWalletFromCustomerLedger = async (entry, previousSnapshot) => {
  const currentSnapshot = resolvePaymentSnapshot(entry);

  if (previousSnapshot?.isPayment && previousSnapshot.walletType) {
    await walletService.adjustWalletBalance({
      organizationId: entry.organizationId,
      branchId: entry.branchId,
      type: previousSnapshot.walletType,
      amount: previousSnapshot.amount,
      operation: previousSnapshot.direction === 'in' ? 'deduct' : 'add',
      userId: entry.updatedBy || entry.createdBy,
    });
  }

  if (currentSnapshot.isPayment && currentSnapshot.walletType) {
    await walletService.adjustWalletBalance({
      organizationId: entry.organizationId,
      branchId: entry.branchId,
      type: currentSnapshot.walletType,
      amount: currentSnapshot.amount,
      operation: currentSnapshot.direction === 'in' ? 'add' : 'deduct',
      userId: entry.updatedBy || entry.createdBy,
    });

    await walletEntryService.upsertReferenceEntry({
      organizationId: entry.organizationId,
      branchId: entry.branchId,
      walletType: currentSnapshot.walletType,
      type: currentSnapshot.direction === 'in' ? 'in' : 'out',
      amount: currentSnapshot.amount,
      referenceId: entry._id,
      referenceModel: 'CustomerLedger',
      description: entry.description || 'Customer ledger wallet payment',
      date: entry.transactionDate || new Date(),
      createdBy: entry.createdBy,
      updatedBy: entry.updatedBy || entry.createdBy,
    });
  } else {
    await walletEntryService.deleteEntriesByReference(entry._id, 'CustomerLedger');
  }
};

const syncCashBookFromCustomerLedger = async (entry) => {
  if (!entry) {
    return null;
  }

  await cashBookService.deleteEntriesByReference(entry._id, 'CustomerLedger');

  const transactionType = String(entry.transactionType || '').toLowerCase();
  const debitAmt = Number(entry.debit) || 0;
  const creditAmt = Number(entry.credit) || 0;

  const cashLike =
    Boolean(entry.paymentMethod && String(entry.paymentMethod).trim()) &&
    !isWalletLedgerMethod(entry.paymentMethod) &&
    !isCreditLedgerPayment(entry.paymentMethod);

  const createCashBookLine = ({ type, amount, source }) =>
    cashBookService.createEntry({
      organizationId: entry.organizationId,
      branchId: entry.branchId,
      type,
      source,
      amount,
      paymentMethod: entry.paymentMethod || 'cash',
      referenceId: entry._id,
      referenceModel: 'CustomerLedger',
      description: entry.description || 'Customer ledger',
      date: entry.transactionDate,
      createdBy: entry.createdBy,
    });

  // Parent-module-linked entries (Invoice, LoadTransaction, SimSale, CashWithdrawal,
  // SalesReturn, …) already write their own cashbook lines. Mirroring those here
  // would double-count the cash movement, so we always skip when referenceId is
  // present. Manual ledger entries (no referenceId) still flow through below.
  if (entry.referenceId) {
    return null;
  }

  // Opening balance is not a cash movement
  if (transactionType === 'opening_balance') {
    return null;
  }

  if (!cashLike) {
    return null;
  }

  // Manual "Sale" from customer ledger: amount is on the ledger debit column — mirror it as cash book
  // expense (Cash paid out column). Invoice-linked sales stay excluded; invoice module owns those cash lines.
  if (transactionType === 'sale') {
    if (debitAmt <= 0) {
      return null;
    }
    return createCashBookLine({
      type: 'expense',
      amount: debitAmt,
      source: 'other',
    });
  }

  if (transactionType === 'payment_received') {
    if (creditAmt <= 0) {
      return null;
    }
    return createCashBookLine({
      type: 'income',
      amount: creditAmt,
      source: 'sale',
    });
  }

  if (transactionType === 'payment_made') {
    if (debitAmt <= 0) {
      return null;
    }
    return createCashBookLine({
      type: 'expense',
      amount: debitAmt,
      source: 'sale',
    });
  }

  // Debit note / adjustments: amount on ledger DEBIT + cash/bank = cash paid out (cash book expense column)
  if (transactionType === 'debit_note' || transactionType === 'adjustment') {
    if (debitAmt > 0) {
      return createCashBookLine({
        type: 'expense',
        amount: debitAmt,
        source: 'other',
      });
    }
    if (creditAmt > 0) {
      return createCashBookLine({
        type: 'income',
        amount: creditAmt,
        source: 'other',
      });
    }
    return null;
  }

  if (transactionType === 'credit_note') {
    if (creditAmt <= 0) {
      return null;
    }
    return createCashBookLine({
      type: 'income',
      amount: creditAmt,
      source: 'other',
    });
  }

  if (['refund', 'purchase', 'sales_return'].includes(transactionType)) {
    if (debitAmt > 0) {
      return createCashBookLine({
        type: 'expense',
        amount: debitAmt,
        source: 'other',
      });
    }
    if (creditAmt > 0) {
      return createCashBookLine({
        type: 'income',
        amount: creditAmt,
        source: 'other',
      });
    }
    return null;
  }

  return null;
};

/**
 * Recalculate balances for all entries after a specific transaction date
 * @param {ObjectId} customerId
 * @param {Date} fromTransactionDate
 * @returns {Promise<void>}
 */
const recalculateBalances = async (customerId, _fromTransactionDate) => {
  await consolidateCustomerCashEntries(customerId, CustomerLedger);

  const allEntries = await CustomerLedger.find({ customer: customerId })
    .sort({ transactionDate: 1, createdAt: 1 });

  let runningBalance = 0;

  for (const entry of allEntries) {
    const debit = Number(entry.debit) || 0;
    const credit = Number(entry.credit) || 0;
    runningBalance += debit - credit;

    if (entry.balance !== runningBalance) {
      entry.balance = runningBalance;
      await entry.save();
    }
  }

  await Customer.findByIdAndUpdate(customerId, { balance: runningBalance });
};

const getBalanceBeforePage = async (filter, page, limit) => {
  if (!filter.customer || page <= 1) {
    return 0;
  }

  const skip = (page - 1) * limit;
  if (skip <= 0) {
    return 0;
  }

  const lastBeforePage = await CustomerLedger.find(filter)
    .sort({ transactionDate: 1, createdAt: 1 })
    .skip(skip - 1)
    .limit(1)
    .select('balance');

  return lastBeforePage[0]?.balance ?? 0;
};

const getOpeningBalanceBeforeDate = async (baseFilter, startDate) => {
  if (!startDate || !baseFilter.customer) {
    return 0;
  }

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const filter = { ...baseFilter };
  delete filter.transactionDate;
  filter.transactionDate = { $lt: start };

  const lastBefore = await CustomerLedger.find(filter)
    .sort({ transactionDate: -1, createdAt: -1 })
    .limit(1)
    .select('balance');

  return lastBefore[0]?.balance ?? 0;
};

/**
 * Create a customer ledger entry
 * @param {Object} ledgerBody
 * @returns {Promise<CustomerLedger>}
 */
const createLedgerEntry = async (ledgerBody) => {
  // Create the entry first
  const entry = await CustomerLedger.create({
    ...ledgerBody,
    balance: 0, // Temporary, will be recalculated
  });

  // Recalculate all balances from this transaction date onwards
  await recalculateBalances(ledgerBody.customer, ledgerBody.transactionDate);

  // Fetch, sync cashbook and return the updated entry
  const updatedEntry = await CustomerLedger.findById(entry._id);
  await syncWalletFromCustomerLedger(updatedEntry, null);
  await syncCashBookFromCustomerLedger(updatedEntry);
  postCustomerLedgerToAccounts(updatedEntry);
  return updatedEntry;
};

/**
 * Query customer ledger entries
 * @param {Object} filter
 * @param {Object} options
 * @returns {Promise<QueryResult>}
 */
const queryLedgerEntries = async (filter, options) => {
  // Handle search query
  if (options.search) {
    filter.$or = [
      { reference: { $regex: options.search, $options: 'i' } },
      { description: { $regex: options.search, $options: 'i' } },
    ];
    delete options.search;
  }

  // Handle date range filter
  const rangeStartDate = options.startDate || null;
  if (options.startDate || options.endDate) {
    filter.transactionDate = {};
    if (options.startDate) {
      const start = new Date(options.startDate);
      start.setHours(0, 0, 0, 0);
      filter.transactionDate.$gte = start;
      delete options.startDate;
    }
    if (options.endDate) {
      const end = new Date(options.endDate);
      end.setHours(23, 59, 59, 999);
      filter.transactionDate.$lte = end;
      delete options.endDate;
    }
  }

  options.populate = 'customer';
  options.sortBy = options.sortBy || 'transactionDate:asc,createdAt:asc';

  const page = options.page && parseInt(options.page, 10) > 0 ? parseInt(options.page, 10) : 1;
  const limit = options.limit && parseInt(options.limit, 10) > 0 ? parseInt(options.limit, 10) : 10;

  if (filter.customer) {
    await cleanupLedgerForConvertedPendingInvoices(filter.customer);
    await recalculateBalances(filter.customer);
  }

  const balanceBeforePage = rangeStartDate && page <= 1
    ? await getOpeningBalanceBeforeDate(filter, rangeStartDate)
    : await getBalanceBeforePage(filter, page, limit);
  const entries = await CustomerLedger.paginate(filter, options);
  entries.balanceBeforePage = balanceBeforePage;
  entries.openingBalance = rangeStartDate ? balanceBeforePage : undefined;
  return entries;
};

/**
 * Remove ledger rows for pending invoices that were converted to a credit bill.
 * Those amounts belong only on the credit invoice ledger line.
 */
const cleanupLedgerForConvertedPendingInvoices = async (customerId) => {
  if (!customerId) return;

  const convertedPending = await Invoice.find({
    customerId,
    type: 'pending',
    isConvertedToBill: true,
  }).select('_id');

  for (const inv of convertedPending) {
    const count = await CustomerLedger.countDocuments({ referenceId: inv._id });
    if (count > 0) {
      await deleteLedgerEntriesByReference(inv._id);
    }
  }
};

/**
 * Running balance immediately before a sale/payment linked to referenceId.
 */
const getBalanceBeforeReference = async (customerId, referenceId) => {
  if (!customerId || customerId === 'walk-in' || !referenceId) {
    return 0;
  }

  await cleanupLedgerForConvertedPendingInvoices(customerId);

  const saleEntry = await CustomerLedger.findOne({
    customer: customerId,
    referenceId,
    transactionType: 'sale',
  }).sort({ transactionDate: 1, createdAt: 1 });

  if (saleEntry) {
    return saleEntry.balance - (Number(saleEntry.debit) || 0) + (Number(saleEntry.credit) || 0);
  }

  const invoice = await Invoice.findById(referenceId).select('invoiceDate total paidAmount customerId');
  if (!invoice || String(invoice.customerId) !== String(customerId)) {
    return 0;
  }

  const invoiceDate = invoice.invoiceDate || new Date();
  const priorEntry = await CustomerLedger.findOne({
    customer: customerId,
    transactionDate: { $lt: invoiceDate },
  }).sort({ transactionDate: -1, createdAt: -1 });

  return priorEntry ? priorEntry.balance : 0;
};

/**
 * Get ledger entry by id
 * @param {ObjectId} id
 * @returns {Promise<CustomerLedger>}
 */
const getLedgerEntryById = async (id) => {
  return CustomerLedger.findById(id).populate('customer');
};

/**
 * Get customer balance
 * @param {ObjectId} customerId
 * @returns {Promise<Number>}
 */
const getCustomerBalance = async (customerId) => {
  const customer = await Customer.findById(customerId);
  if (!customer) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
  }
  await cleanupLedgerForConvertedPendingInvoices(customerId);
  return customer.balance || 0;
};

/**
 * Get customer ledger summary
 * @param {ObjectId} customerId
 * @returns {Promise<Object>}
 */
const getCustomerLedgerSummary = async (customerId) => {
  const entries = await CustomerLedger.find({ customer: customerId });
  
  const summary = {
    totalDebit: 0,
    totalCredit: 0,
    currentBalance: 0,
    transactionCount: entries.length,
  };

  entries.forEach(entry => {
    summary.totalDebit += entry.debit;
    summary.totalCredit += entry.credit;
  });

  summary.currentBalance = summary.totalDebit - summary.totalCredit;

  return summary;
};

/**
 * Update ledger entry
 * @param {ObjectId} id
 * @param {Object} updateBody
 * @returns {Promise<CustomerLedger>}
 */
const updateLedgerEntry = async (id, updateBody) => {
  const entry = await getLedgerEntryById(id);
  if (!entry) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ledger entry not found');
  }

  const previousSnapshot = resolvePaymentSnapshot(entry);

  // Don't allow changing customer or amounts after creation for audit trail
  delete updateBody.customer;
  delete updateBody.debit;
  delete updateBody.credit;
  delete updateBody.balance;

  Object.assign(entry, updateBody);
  await entry.save();
  await syncWalletFromCustomerLedger(entry, previousSnapshot);
  await syncCashBookFromCustomerLedger(entry);
  postCustomerLedgerToAccounts(entry);
  return entry;
};

/**
 * Delete ledger entry
 * @param {ObjectId} id
 * @returns {Promise<CustomerLedger>}
 */
const deleteLedgerEntry = async (id) => {
  const entry = await getLedgerEntryById(id);
  if (!entry) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ledger entry not found');
  }

  const customerId = entry.customer;
  const transactionDate = entry.transactionDate;
  const previousSnapshot = resolvePaymentSnapshot(entry);
  if (previousSnapshot.isPayment && previousSnapshot.walletType) {
    await walletService.adjustWalletBalance({
      organizationId: entry.organizationId,
      branchId: entry.branchId,
      type: previousSnapshot.walletType,
      amount: previousSnapshot.amount,
      operation: previousSnapshot.direction === 'in' ? 'deduct' : 'add',
      userId: entry.updatedBy || entry.createdBy,
    });
  }
  await walletEntryService.deleteEntriesByReference(entry._id, 'CustomerLedger');
  await cashBookService.deleteEntriesByReference(entry._id, 'CustomerLedger');
  accountsSystemService
    .removePostingsForReference(
      { organizationId: entry.organizationId, branchId: entry.branchId },
      'CustomerLedger',
      entry._id
    )
    .catch(() => {});

  await entry.deleteOne();

  // Recalculate all balances from the deleted entry's transaction date
  await recalculateBalances(customerId, transactionDate);

  return entry;
};

/**
 * Get all customers with balances
 * @param {Object} filter - Organization and branch filter
 * @returns {Promise<Array>}
 */
const getAllCustomersWithBalances = async (filter = {}) => {
  const customers = await Customer.find(filter).select(
    'name nameUrdu phone whatsapp email balance picture idCardFront idCardBack',
  );
  
  const customersWithBalances = await Promise.all(
    customers.map(async (customer) => {
      const lastTransaction = await CustomerLedger.findOne({ customer: customer._id })
        .sort({ transactionDate: -1 })
        .select('transactionDate');
      
      return {
        _id: customer._id,
        id: customer.id,
        name: customer.name,
        nameUrdu: customer.nameUrdu,
        phone: customer.phone,
        whatsapp: customer.whatsapp,
        email: customer.email,
        balance: customer.balance || 0,
        picture: customer.picture,
        idCardFront: customer.idCardFront,
        idCardBack: customer.idCardBack,
        lastTransactionDate: lastTransaction ? lastTransaction.transactionDate : null,
      };
    })
  );
  
  return customersWithBalances;
};

/**
 * Update ledger entries by reference ID (invoice ID)
 * @param {ObjectId} referenceId - The invoice ID
 * @param {Object} updateData - New invoice data
 * @returns {Promise<void>}
 */
const updateLedgerEntriesByReference = async (referenceId, updateData) => {
  const {
    total,
    paidAmount,
    invoiceNumber,
    invoiceDate,
    paymentMethod,
    organizationId,
    branchId,
    customerId,
    invoiceType,
    notes,
    displayReference,
    description,
    balance,
  } = updateData;

  if (!customerId || customerId === 'walk-in') {
    console.log('No valid customer for ledger update on reference:', referenceId);
    return;
  }

  const existingEntries = await CustomerLedger.find({ referenceId }).sort({ transactionDate: 1 });
  const isUpdate = existingEntries.length > 0;

  if (!isUpdate) {
    const linkedInvoice = await Invoice.findById(referenceId).select('type isConvertedToBill billNumber');
    if (linkedInvoice?.type === 'pending') {
      console.log('Skipping ledger backfill for pending invoice:', referenceId);
      return;
    }
    console.log('No ledger entries found. Creating fresh entries for reference:', referenceId);
  } else {
    await deleteLedgerEntriesByReference(referenceId);
  }

  const ledgerEntries = buildCustomerSaleLedgerEntries({
    organizationId: organizationId || existingEntries[0]?.organizationId,
    branchId: branchId || existingEntries[0]?.branchId,
    customerId,
    referenceId,
    invoiceNumber,
    displayReference: displayReference || existingEntries[0]?.reference || invoiceNumber,
    description:
      description ||
      (isUpdate
        ? `Sale Invoice #${invoiceNumber} (Updated)`
        : `Sale Invoice #${invoiceNumber}`),
    transactionDate: invoiceDate || existingEntries[0]?.transactionDate,
    total,
    paidAmount,
    invoiceType: normalizeCustomerInvoiceType(invoiceType),
    paymentMethod: paymentMethod || 'Cash',
    notes: notes || (isUpdate ? 'Invoice updated' : 'Invoice ledger backfilled'),
    balance: balance ?? (Number(total || 0) - Number(paidAmount || 0)),
    suffix: isUpdate ? ' (Updated)' : '',
  });

  for (const entry of ledgerEntries) {
    await createLedgerEntry(entry);
  }
};

/**
 * Delete ledger entries by reference ID (invoice ID)
 * @param {ObjectId} referenceId - The invoice ID
 * @returns {Promise<void>}
 */
const deleteLedgerEntriesByReference = async (referenceId) => {
  const entries = await CustomerLedger.find({ referenceId });
  
  console.log(`Deleting ${entries.length} ledger entries for reference:`, referenceId);
  
  // Delete all entries related to this invoice
  for (const entry of entries) {
    await deleteLedgerEntry(entry._id);
  }
};

/**
 * Create or update opening balance entry and keep running balances consistent
 * @param {Object} params
 * @param {ObjectId} params.customerId
 * @param {number} params.amount
 * @param {ObjectId} params.organizationId
 * @param {ObjectId} params.branchId
 * @param {Date} [params.transactionDate]
 * @returns {Promise<void>}
 */
const syncOpeningBalanceEntry = async ({ customerId, amount, organizationId, branchId, transactionDate }) => {
  const numericAmount = Number(amount || 0);
  const openingDate = transactionDate ? new Date(transactionDate) : new Date();

  const existing = await CustomerLedger.findOne({
    customer: customerId,
    transactionType: 'opening_balance',
  }).sort({ transactionDate: 1, createdAt: 1 });

  let recalcFrom = openingDate;

  if (numericAmount === 0) {
    if (existing) {
      recalcFrom = existing.transactionDate;
      await existing.deleteOne();
      await recalculateBalances(customerId, recalcFrom);
    }
    return;
  }

  const debit = numericAmount > 0 ? numericAmount : 0;
  const credit = numericAmount < 0 ? Math.abs(numericAmount) : 0;

  if (existing) {
    existing.organizationId = existing.organizationId || organizationId;
    existing.branchId = existing.branchId || branchId;
    existing.transactionDate = openingDate;
    existing.description = 'Opening Balance';
    existing.debit = debit;
    existing.credit = credit;
    existing.reference = 'OPENING-BALANCE';
    recalcFrom = existing.transactionDate;
    await existing.save();
  } else {
    const entry = await CustomerLedger.create({
      organizationId,
      branchId,
      customer: customerId,
      transactionType: 'opening_balance',
      transactionDate: openingDate,
      reference: 'OPENING-BALANCE',
      description: 'Opening Balance',
      debit,
      credit,
      balance: 0,
    });
    recalcFrom = entry.transactionDate;
  }

  await recalculateBalances(customerId, recalcFrom);
};

module.exports = {
  createLedgerEntry,
  queryLedgerEntries,
  getLedgerEntryById,
  getCustomerBalance,
  getCustomerLedgerSummary,
  updateLedgerEntry,
  deleteLedgerEntry,
  getAllCustomersWithBalances,
  updateLedgerEntriesByReference,
  deleteLedgerEntriesByReference,
  syncOpeningBalanceEntry,
  cleanupLedgerForConvertedPendingInvoices,
  getBalanceBeforeReference,
  recalculateBalances,
};
