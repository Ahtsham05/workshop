const httpStatus = require('http-status');
const { SupplierLedger, Supplier } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a supplier ledger entry
 * @param {Object} ledgerBody
 * @returns {Promise<SupplierLedger>}
 */
const createLedgerEntry = async (ledgerBody) => {
  // Get the last balance for this supplier based on transaction date (or creation order)
  const lastEntry = await SupplierLedger.findOne({ supplier: ledgerBody.supplier })
    .sort({ transactionDate: -1, createdAt: -1 });

  const previousBalance = lastEntry ? lastEntry.balance : 0;

  // Calculate new balance (credit increases balance owed, debit decreases it)
  const newBalance = previousBalance + (ledgerBody.credit || 0) - (ledgerBody.debit || 0);

  const entry = await SupplierLedger.create({
    ...ledgerBody,
    balance: newBalance,
  });

  // Update supplier balance
  await Supplier.findByIdAndUpdate(ledgerBody.supplier, { balance: newBalance });

  return entry;
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

  // Recalculate all balances after this entry
  const laterEntries = await SupplierLedger.find({
    supplier: entry.supplier,
    createdAt: { $gt: entry.createdAt },
  }).sort({ createdAt: 1 });

  await entry.remove();

  // Get the previous balance before the deleted entry
  const previousEntry = await SupplierLedger.findOne({
    supplier: entry.supplier,
    createdAt: { $lt: entry.createdAt },
  }).sort({ createdAt: -1 });

  let runningBalance = previousEntry ? previousEntry.balance : 0;

  // Update all later entries
  for (const laterEntry of laterEntries) {
    runningBalance = runningBalance + laterEntry.credit - laterEntry.debit;
    laterEntry.balance = runningBalance;
    await laterEntry.save();
  }

  // Update supplier balance
  await Supplier.findByIdAndUpdate(entry.supplier, { balance: runningBalance });

  return entry;
};

/**
 * Get all suppliers with balances
 * @returns {Promise<Array>}
 */
const getAllSuppliersWithBalances = async () => {
  const suppliers = await Supplier.find().select('name phone email balance');
  
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
  const { totalAmount, paidAmount, invoiceNumber, purchaseDate, paymentMethod, itemsCount } = updateData;
  
  // Find all entries related to this purchase
  const entries = await SupplierLedger.find({ referenceId }).sort({ transactionDate: 1 });
  
  if (entries.length === 0) {
    console.log('No ledger entries found for reference:', referenceId);
    return;
  }

  const supplierId = entries[0].supplier;
  
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
      supplier: supplierId,
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
          supplier: supplierId,
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
        supplier: supplierId,
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
