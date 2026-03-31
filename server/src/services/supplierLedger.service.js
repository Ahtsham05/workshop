const httpStatus = require('http-status');
const { SupplierLedger, Supplier } = require('../models');
const ApiError = require('../utils/ApiError');
const cashBookService = require('./cashBook.service');

const syncCashBookFromSupplierLedger = async (entry) => {
  if (!entry) {
    return null;
  }

  const transactionType = String(entry.transactionType || '').toLowerCase();

  if (transactionType !== 'payment_made' && transactionType !== 'payment_received') {
    await cashBookService.deleteEntriesByReference(entry._id, 'SupplierLedger');
    return null;
  }

  const isPaymentMade = transactionType === 'payment_made';
  const amount = Number(isPaymentMade ? entry.debit : entry.credit) || 0;

  if (amount <= 0) {
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
const recalculateBalances = async (supplierId, fromTransactionDate) => {
  // Get all entries for this supplier ordered by transaction date and then by creation order
  const allEntries = await SupplierLedger.find({ supplier: supplierId })
    .sort({ transactionDate: 1, createdAt: 1 });

  let runningBalance = 0;
  let shouldUpdate = false;

  for (const entry of allEntries) {
    // Check if this is where we should start recalculating
    if (entry.transactionDate >= fromTransactionDate) {
      shouldUpdate = true;
    }

    if (shouldUpdate) {
      const newBalance = runningBalance + (entry.credit || 0) - (entry.debit || 0);
      
      if (entry.balance !== newBalance) {
        entry.balance = newBalance;
        await entry.save();
      }
    }

    runningBalance += (entry.credit || 0) - (entry.debit || 0);
  }

  // Update supplier balance to the final running balance
  await Supplier.findByIdAndUpdate(supplierId, { balance: runningBalance });
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
  await syncCashBookFromSupplierLedger(updatedEntry);
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
  if (options.startDate || options.endDate) {
    filter.transactionDate = {};
    if (options.startDate) {
      filter.transactionDate.$gte = new Date(options.startDate);
      delete options.startDate;
    }
    if (options.endDate) {
      filter.transactionDate.$lte = new Date(options.endDate);
      delete options.endDate;
    }
  }

  options.populate = 'supplier';
  options.sort = options.sort || '-transactionDate';
  
  const entries = await SupplierLedger.paginate(filter, options);
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

  // Don't allow changing supplier or amounts after creation for audit trail
  delete updateBody.supplier;
  delete updateBody.debit;
  delete updateBody.credit;
  delete updateBody.balance;

  Object.assign(entry, updateBody);
  await entry.save();
  await syncCashBookFromSupplierLedger(entry);
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
  await cashBookService.deleteEntriesByReference(entry._id, 'SupplierLedger');

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
  const suppliers = await Supplier.find(filter).select('name phone email balance');
  
  const suppliersWithBalances = await Promise.all(
    suppliers.map(async (supplier) => {
      const lastTransaction = await SupplierLedger.findOne({ supplier: supplier._id })
        .sort({ transactionDate: -1 })
        .select('transactionDate');
      
      return {
        _id: supplier._id,
        id: supplier.id,
        name: supplier.name,
        phone: supplier.phone,
        email: supplier.email,
        balance: supplier.balance || 0,
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
    itemsCount,
    organizationId,
    branchId,
    supplierId,
  } = updateData;
  
  // Find all entries related to this purchase
  const entries = await SupplierLedger.find({ referenceId }).sort({ transactionDate: 1 });
  
  if (entries.length === 0) {
    if (!supplierId) {
      console.log('No ledger entries found and supplier is missing for reference:', referenceId);
      return;
    }

    console.log('No ledger entries found. Creating fresh entries for reference:', referenceId);

    await createLedgerEntry({
      organizationId,
      branchId,
      supplier: supplierId,
      transactionType: 'purchase',
      transactionDate: purchaseDate || new Date(),
      reference: invoiceNumber,
      referenceId,
      description: `Purchase Invoice #${invoiceNumber}`,
      debit: 0,
      credit: totalAmount,
      paymentMethod,
      notes: `Purchase of ${itemsCount || 0} items`,
    });

    if (paidAmount > 0) {
      const paymentDate = new Date(purchaseDate || new Date());
      paymentDate.setSeconds(paymentDate.getSeconds() + 1);

      await createLedgerEntry({
        organizationId,
        branchId,
        supplier: supplierId,
        transactionType: 'payment_made',
        transactionDate: paymentDate,
        reference: invoiceNumber,
        referenceId,
        description: `Payment for Purchase #${invoiceNumber}`,
        debit: paidAmount,
        credit: 0,
        paymentMethod,
        notes: `Amount paid: Rs${paidAmount.toFixed(2)}`,
      });
    }
    return;
  }

  const entrySupplierId = entries[0].supplier;
  
  // Find the purchase entry (credit)
  const purchaseEntry = entries.find(e => e.transactionType === 'purchase');
  // Find the payment entry (debit) if it exists
  const paymentEntry = entries.find(e => e.transactionType === 'payment_made');

  // Update purchase entry if amount changed
  if (purchaseEntry && purchaseEntry.credit !== totalAmount) {
    console.log(`Updating purchase entry: ${purchaseEntry.credit} -> ${totalAmount}`);
    
    // Delete old entry
    await deleteLedgerEntry(purchaseEntry._id);
    
    // Create new entry
    await createLedgerEntry({
      organizationId: purchaseEntry.organizationId,
      branchId: purchaseEntry.branchId,
      supplier: entrySupplierId,
      transactionType: 'purchase',
      transactionDate: purchaseDate || purchaseEntry.transactionDate,
      reference: invoiceNumber,
      referenceId: referenceId,
      description: `Purchase Invoice #${invoiceNumber} (Updated)`,
      debit: 0,
      credit: totalAmount,
      paymentMethod: paymentMethod,
      notes: `Purchase of ${itemsCount} items (Updated)`
    });
  }

  // Handle payment entry updates
  if (paidAmount > 0) {
    const paymentDate = new Date(purchaseDate || new Date());
    paymentDate.setSeconds(paymentDate.getSeconds() + 1);

    if (paymentEntry) {
      // Payment entry exists - check if amount changed
      if (paymentEntry.debit !== paidAmount) {
        console.log(`Updating payment entry: ${paymentEntry.debit} -> ${paidAmount}`);
        
        // Delete old payment entry
        await deleteLedgerEntry(paymentEntry._id);
        
        // Create new payment entry
        await createLedgerEntry({
          organizationId: paymentEntry.organizationId,
          branchId: paymentEntry.branchId,
          supplier: entrySupplierId,
          transactionType: 'payment_made',
          transactionDate: paymentDate,
          reference: invoiceNumber,
          referenceId: referenceId,
          description: `Payment for Purchase #${invoiceNumber} (Updated)`,
          debit: paidAmount,
          credit: 0,
          paymentMethod: paymentMethod,
          notes: `Amount paid: Rs${paidAmount.toFixed(2)}`
        });
      }
    } else {
      // Payment entry doesn't exist - create new one
      console.log(`Creating new payment entry: ${paidAmount}`);
      await createLedgerEntry({
        organizationId: purchaseEntry ? purchaseEntry.organizationId : organizationId,
        branchId: purchaseEntry ? purchaseEntry.branchId : branchId,
        supplier: entrySupplierId,
        transactionType: 'payment_made',
        transactionDate: paymentDate,
        reference: invoiceNumber,
        referenceId: referenceId,
        description: `Payment for Purchase #${invoiceNumber} (Updated)`,
        debit: paidAmount,
        credit: 0,
        paymentMethod: paymentMethod,
        notes: `Amount paid: Rs${paidAmount.toFixed(2)}`
      });
    }
  } else if (paymentEntry) {
    // No payment in update but entry exists - delete it
    console.log(`Deleting payment entry - no payment in update`);
    await deleteLedgerEntry(paymentEntry._id);
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
};
