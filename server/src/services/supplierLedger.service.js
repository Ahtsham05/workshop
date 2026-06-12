const httpStatus = require('http-status');
const { SupplierLedger, Supplier } = require('../models');
const ApiError = require('../utils/ApiError');
const { normalizeCustomerInvoiceType } = require('../utils/ledgerInvoiceType');
const { buildSupplierPurchaseLedgerEntries } = require('../utils/ledgerSettlement');
const { consolidateSupplierCashEntries } = require('../utils/ledgerConsolidation');
const cashBookService = require('./cashBook.service');
const walletService = require('./wallet.service');
const walletEntryService = require('./walletEntry.service');
const accountsSystemService = require('./accountsSystem.service');

/**
 * Post a manual supplier payment to the double-entry system.
 * Only standalone payments (no source document reference) are posted here —
 * payments embedded in a purchase are already accounted for by the purchase.
 */
const postSupplierLedgerToAccounts = (entry) => {
  if (!entry) return;
  const scope = { organizationId: entry.organizationId, branchId: entry.branchId, createdBy: entry.createdBy };
  const isManualPayment = entry.transactionType === 'payment_made' && !entry.referenceId;
  if (!isManualPayment) return;
  accountsSystemService
    .postSupplierPayment(scope, {
      amount: entry.debit,
      paymentMethod: entry.paymentMethod,
      ledgerId: entry._id,
      supplierId: entry.supplier,
      description: entry.description || 'Supplier payment made',
      date: entry.transactionDate,
    })
    .catch(() => {});
};

const isWalletLedgerMethod = (paymentMethod) => {
  const method = String(paymentMethod || '').trim().toLowerCase();
  return method.includes('wallet') || method.includes('jazzcash') || method.includes('easypaisa');
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
  if (transactionType !== 'payment_made' && transactionType !== 'payment_received') {
    return { isPayment: false, amount: 0, direction: null, walletType: null };
  }
  const isPaymentMade = transactionType === 'payment_made';
  const amount = Number(isPaymentMade ? entryLike?.debit : entryLike?.credit) || 0;
  const walletType = parseWalletType(entryLike?.paymentMethod);
  return {
    isPayment: amount > 0,
    amount,
    direction: isPaymentMade ? 'out' : 'in',
    walletType,
  };
};

const syncWalletFromSupplierLedger = async (entry, previousSnapshot) => {
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
      referenceModel: 'SupplierLedger',
      description: entry.description || 'Supplier ledger wallet payment',
      date: entry.transactionDate || new Date(),
      createdBy: entry.createdBy,
      updatedBy: entry.updatedBy || entry.createdBy,
    });
  } else {
    await walletEntryService.deleteEntriesByReference(entry._id, 'SupplierLedger');
  }
};

const syncCashBookFromSupplierLedger = async (entry) => {
  if (!entry) {
    return null;
  }

  const transactionType = String(entry.transactionType || '').toLowerCase();

  if (transactionType !== 'payment_made' && transactionType !== 'payment_received') {
    await cashBookService.deleteEntriesByReference(entry._id, 'SupplierLedger');
    return null;
  }

  // Parent-module-linked entries (Purchase, LoadPurchase, …) already create their
  // own cashbook line. Mirroring from the supplier ledger here would double-count
  // the same cash movement, so we never write a SupplierLedger mirror in that case.
  if (entry.referenceId) {
    await cashBookService.deleteEntriesByReference(entry._id, 'SupplierLedger');
    return null;
  }

  const isPaymentMade = transactionType === 'payment_made';
  const amount = Number(isPaymentMade ? entry.debit : entry.credit) || 0;

  if (amount <= 0 || isWalletLedgerMethod(entry.paymentMethod)) {
    await cashBookService.deleteEntriesByReference(entry._id, 'SupplierLedger');
    return null;
  }

  return cashBookService.upsertReferenceEntry({
    organizationId: entry.organizationId,
    branchId: entry.branchId,
    type: isPaymentMade ? 'expense' : 'income',
    source: 'purchase',
    amount,
    paymentMethod: entry.paymentMethod || 'cash',
    referenceId: entry._id,
    referenceModel: 'SupplierLedger',
    description: entry.description || 'Supplier payment entry',
    date: entry.transactionDate,
    createdBy: entry.createdBy,
  });
};

/**
 * Recalculate balances for all entries after a specific transaction date
 * @param {ObjectId} supplierId
 * @param {Date} fromTransactionDate
 * @returns {Promise<void>}
 */
const recalculateBalances = async (supplierId, _fromTransactionDate) => {
  await consolidateSupplierCashEntries(supplierId, SupplierLedger);

  const allEntries = await SupplierLedger.find({ supplier: supplierId })
    .sort({ transactionDate: 1, createdAt: 1 });

  let runningBalance = 0;

  for (const entry of allEntries) {
    const debit = Number(entry.debit) || 0;
    const credit = Number(entry.credit) || 0;
    runningBalance += credit - debit;

    if (entry.balance !== runningBalance) {
      entry.balance = runningBalance;
      await entry.save();
    }
  }

  await Supplier.findByIdAndUpdate(supplierId, { balance: runningBalance });
};

const getBalanceBeforePage = async (filter, page, limit) => {
  if (!filter.supplier || page <= 1) {
    return 0;
  }

  const skip = (page - 1) * limit;
  if (skip <= 0) {
    return 0;
  }

  const lastBeforePage = await SupplierLedger.find(filter)
    .sort({ transactionDate: 1, createdAt: 1 })
    .skip(skip - 1)
    .limit(1)
    .select('balance');

  return lastBeforePage[0]?.balance ?? 0;
};

const getOpeningBalanceBeforeDate = async (baseFilter, startDate) => {
  if (!startDate || !baseFilter.supplier) {
    return 0;
  }

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const filter = { ...baseFilter };
  delete filter.transactionDate;
  filter.transactionDate = { $lt: start };

  const lastBefore = await SupplierLedger.find(filter)
    .sort({ transactionDate: -1, createdAt: -1 })
    .limit(1)
    .select('balance');

  return lastBefore[0]?.balance ?? 0;
};

/**
 * Create a supplier ledger entry
 * @param {Object} ledgerBody
 * @returns {Promise<SupplierLedger>}
 */
const createLedgerEntry = async (ledgerBody) => {
  // Create the entry first
  const entry = await SupplierLedger.create({
    ...ledgerBody,
    balance: 0, // Temporary, will be recalculated
  });

  // Recalculate all balances from this transaction date onwards
  await recalculateBalances(ledgerBody.supplier, ledgerBody.transactionDate);

  // Fetch, sync cashbook and return the updated entry
  const updatedEntry = await SupplierLedger.findById(entry._id);
  await syncWalletFromSupplierLedger(updatedEntry, null);
  await syncCashBookFromSupplierLedger(updatedEntry);
  postSupplierLedgerToAccounts(updatedEntry);
  return updatedEntry;
};

/**
 * Query supplier ledger entries
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

  options.populate = 'supplier';
  options.sortBy = options.sortBy || 'transactionDate:asc,createdAt:asc';

  const page = options.page && parseInt(options.page, 10) > 0 ? parseInt(options.page, 10) : 1;
  const limit = options.limit && parseInt(options.limit, 10) > 0 ? parseInt(options.limit, 10) : 10;

  if (filter.supplier) {
    await recalculateBalances(filter.supplier);
  }

  const balanceBeforePage = rangeStartDate && page <= 1
    ? await getOpeningBalanceBeforeDate(filter, rangeStartDate)
    : await getBalanceBeforePage(filter, page, limit);
  const entries = await SupplierLedger.paginate(filter, options);
  entries.balanceBeforePage = balanceBeforePage;
  entries.openingBalance = rangeStartDate ? balanceBeforePage : undefined;
  return entries;
};

/**
 * Get ledger entry by id
 * @param {ObjectId} id
 * @returns {Promise<SupplierLedger>}
 */
const getLedgerEntryById = async (id) => {
  return SupplierLedger.findById(id).populate('supplier');
};

/**
 * Get supplier balance
 * @param {ObjectId} supplierId
 * @returns {Promise<Number>}
 */
const getSupplierBalance = async (supplierId) => {
  const supplier = await Supplier.findById(supplierId);
  if (!supplier) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Supplier not found');
  }
  return supplier.balance || 0;
};

/**
 * Get supplier ledger summary
 * @param {ObjectId} supplierId
 * @returns {Promise<Object>}
 */
const getSupplierLedgerSummary = async (supplierId) => {
  const entries = await SupplierLedger.find({ supplier: supplierId });
  
  const summary = {
    totalCredit: 0,
    totalDebit: 0,
    currentBalance: 0,
    transactionCount: entries.length,
  };

  entries.forEach(entry => {
    summary.totalCredit += entry.credit;
    summary.totalDebit += entry.debit;
  });

  summary.currentBalance = summary.totalCredit - summary.totalDebit;

  return summary;
};

/**
 * Update ledger entry
 * @param {ObjectId} id
 * @param {Object} updateBody
 * @returns {Promise<SupplierLedger>}
 */
const updateLedgerEntry = async (id, updateBody) => {
  const entry = await getLedgerEntryById(id);
  if (!entry) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ledger entry not found');
  }

  const previousSnapshot = resolvePaymentSnapshot(entry);

  // Don't allow changing supplier or amounts after creation for audit trail
  delete updateBody.supplier;
  delete updateBody.debit;
  delete updateBody.credit;
  delete updateBody.balance;

  Object.assign(entry, updateBody);
  await entry.save();
  await syncWalletFromSupplierLedger(entry, previousSnapshot);
  await syncCashBookFromSupplierLedger(entry);
  postSupplierLedgerToAccounts(entry);
  return entry;
};

/**
 * Delete ledger entry
 * @param {ObjectId} id
 * @returns {Promise<SupplierLedger>}
 */
const deleteLedgerEntry = async (id) => {
  const entry = await getLedgerEntryById(id);
  if (!entry) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ledger entry not found');
  }

  const supplierId = entry.supplier;
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
  await walletEntryService.deleteEntriesByReference(entry._id, 'SupplierLedger');
  await cashBookService.deleteEntriesByReference(entry._id, 'SupplierLedger');
  accountsSystemService
    .removePostingsForReference(
      { organizationId: entry.organizationId, branchId: entry.branchId },
      'SupplierLedger',
      entry._id
    )
    .catch(() => {});

  await entry.deleteOne();

  // Recalculate all balances from the deleted entry's transaction date
  await recalculateBalances(supplierId, transactionDate);

  return entry;
};

/**
 * Get all suppliers with balances
 * @param {Object} filter - Organization and branch filter
 * @returns {Promise<Array>}
 */
const getAllSuppliersWithBalances = async (filter = {}) => {
  const suppliers = await Supplier.find(filter).select(
    'name nameUrdu phone email balance picture idCardFront idCardBack',
  );
  
  const suppliersWithBalances = await Promise.all(
    suppliers.map(async (supplier) => {
      const lastTransaction = await SupplierLedger.findOne({ supplier: supplier._id })
        .sort({ transactionDate: -1 })
        .select('transactionDate');
      
      return {
        _id: supplier._id,
        id: supplier.id,
        name: supplier.name,
        nameUrdu: supplier.nameUrdu,
        phone: supplier.phone,
        email: supplier.email,
        balance: supplier.balance || 0,
        picture: supplier.picture,
        idCardFront: supplier.idCardFront,
        idCardBack: supplier.idCardBack,
        lastTransactionDate: lastTransaction ? lastTransaction.transactionDate : null,
      };
    })
  );
  
  return suppliersWithBalances;
};

/**
 * Update ledger entries by reference ID (purchase ID)
 * @param {ObjectId} referenceId - The purchase ID
 * @param {Object} updateData - New purchase data
 * @returns {Promise<void>}
 */
const updateLedgerEntriesByReference = async (referenceId, updateData) => {
  const {
    totalAmount,
    paidAmount,
    invoiceNumber,
    purchaseDate,
    paymentMethod,
    invoiceType,
    paymentType,
    itemsCount,
    organizationId,
    branchId,
    supplierId,
    balance,
  } = updateData;

  if (!supplierId) {
    console.log('No supplier for ledger update on reference:', referenceId);
    return;
  }

  const existingEntries = await SupplierLedger.find({ referenceId }).sort({ transactionDate: 1 });
  const isUpdate = existingEntries.length > 0;

  if (isUpdate) {
    await deleteLedgerEntriesByReference(referenceId);
  } else {
    console.log('No ledger entries found. Creating fresh entries for reference:', referenceId);
  }

  const ledgerEntries = buildSupplierPurchaseLedgerEntries({
    organizationId: organizationId || existingEntries[0]?.organizationId,
    branchId: branchId || existingEntries[0]?.branchId,
    supplierId,
    referenceId,
    invoiceNumber,
    transactionDate: purchaseDate || existingEntries[0]?.transactionDate,
    totalAmount,
    paidAmount,
    paymentType,
    invoiceType: normalizeCustomerInvoiceType(invoiceType),
    paymentMethod,
    itemsCount: itemsCount || 0,
    balance: balance ?? (Number(totalAmount || 0) - Number(paidAmount || 0)),
    suffix: isUpdate ? ' (Updated)' : '',
  });

  for (const entry of ledgerEntries) {
    await createLedgerEntry(entry);
  }
};

/**
 * Delete ledger entries by reference ID (purchase ID)
 * @param {ObjectId} referenceId - The purchase ID
 * @returns {Promise<void>}
 */
const deleteLedgerEntriesByReference = async (referenceId) => {
  const entries = await SupplierLedger.find({ referenceId });
  
  console.log(`Deleting ${entries.length} ledger entries for reference:`, referenceId);
  
  // Delete all entries related to this purchase
  for (const entry of entries) {
    await deleteLedgerEntry(entry._id);
  }
};

/**
 * Keep one opening_balance row in sync with Supplier.balance (positive = payable to supplier).
 * Mirrors customer ledger opening sync but uses supplier credit/debit convention (credit − debit).
 */
const syncOpeningBalanceEntry = async ({
  supplierId,
  amount,
  organizationId,
  branchId,
  transactionDate,
}) => {
  const numericAmount = Number(amount || 0);
  const openingDate = transactionDate ? new Date(transactionDate) : new Date();

  const existing = await SupplierLedger.findOne({
    supplier: supplierId,
    transactionType: 'opening_balance',
  }).sort({ transactionDate: 1, createdAt: 1 });

  let recalcFrom = openingDate;

  if (numericAmount === 0) {
    if (existing) {
      recalcFrom = existing.transactionDate;
      await existing.deleteOne();
      await recalculateBalances(supplierId, recalcFrom);
    }
    return;
  }

  const credit = numericAmount > 0 ? numericAmount : 0;
  const debit = numericAmount < 0 ? Math.abs(numericAmount) : 0;

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
    const entry = await SupplierLedger.create({
      organizationId,
      branchId,
      supplier: supplierId,
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

  await recalculateBalances(supplierId, recalcFrom);
};

module.exports = {
  createLedgerEntry,
  queryLedgerEntries,
  getLedgerEntryById,
  getSupplierBalance,
  getSupplierLedgerSummary,
  updateLedgerEntry,
  deleteLedgerEntry,
  getAllSuppliersWithBalances,
  updateLedgerEntriesByReference,
  deleteLedgerEntriesByReference,
  syncOpeningBalanceEntry,
  recalculateBalances,
};
