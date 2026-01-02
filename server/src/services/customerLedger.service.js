const httpStatus = require('http-status');
const { CustomerLedger, Customer } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a customer ledger entry
 * @param {Object} ledgerBody
 * @returns {Promise<CustomerLedger>}
 */
const createLedgerEntry = async (ledgerBody) => {
  // Get the last balance for this customer based on transaction date (or creation order)
  const lastEntry = await CustomerLedger.findOne({ customer: ledgerBody.customer })
    .sort({ transactionDate: -1, createdAt: -1 });

  const previousBalance = lastEntry ? lastEntry.balance : 0;

  // Calculate new balance (debit increases balance, credit decreases it)
  const newBalance = previousBalance + (ledgerBody.debit || 0) - (ledgerBody.credit || 0);

  const entry = await CustomerLedger.create({
    ...ledgerBody,
    balance: newBalance,
  });

  // Update customer balance
  await Customer.findByIdAndUpdate(ledgerBody.customer, { balance: newBalance });

  return entry;
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

  options.populate = 'customer';
  options.sort = options.sort || '-transactionDate';
  
  const entries = await CustomerLedger.paginate(filter, options);
  return entries;
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

  // Don't allow changing customer or amounts after creation for audit trail
  delete updateBody.customer;
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
 * @returns {Promise<CustomerLedger>}
 */
const deleteLedgerEntry = async (id) => {
  const entry = await getLedgerEntryById(id);
  if (!entry) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ledger entry not found');
  }

  // Recalculate all balances after this entry
  const laterEntries = await CustomerLedger.find({
    customer: entry.customer,
    createdAt: { $gt: entry.createdAt },
  }).sort({ createdAt: 1 });

  await entry.remove();

  // Get the previous balance before the deleted entry
  const previousEntry = await CustomerLedger.findOne({
    customer: entry.customer,
    createdAt: { $lt: entry.createdAt },
  }).sort({ createdAt: -1 });

  let runningBalance = previousEntry ? previousEntry.balance : 0;

  // Update all later entries
  for (const laterEntry of laterEntries) {
    runningBalance = runningBalance + laterEntry.debit - laterEntry.credit;
    laterEntry.balance = runningBalance;
    await laterEntry.save();
  }

  // Update customer balance
  await Customer.findByIdAndUpdate(entry.customer, { balance: runningBalance });

  return entry;
};

/**
 * Get all customers with balances
 * @returns {Promise<Array>}
 */
const getAllCustomersWithBalances = async () => {
  const customers = await Customer.find().select('name phone email balance');
  
  const customersWithBalances = await Promise.all(
    customers.map(async (customer) => {
      const lastTransaction = await CustomerLedger.findOne({ customer: customer._id })
        .sort({ transactionDate: -1 })
        .select('transactionDate');
      
      return {
        _id: customer._id,
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        balance: customer.balance || 0,
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
  const { total, paidAmount, invoiceNumber, invoiceDate, paymentMethod } = updateData;
  
  // Find all entries related to this invoice
  const entries = await CustomerLedger.find({ referenceId }).sort({ transactionDate: 1 });
  
  if (entries.length === 0) {
    console.log('No ledger entries found for reference:', referenceId);
    return;
  }

  const customerId = entries[0].customer;
  
  // Find the sale entry (debit)
  const saleEntry = entries.find(e => e.transactionType === 'sale');
  // Find the payment entry (credit) if it exists
  const paymentEntry = entries.find(e => e.transactionType === 'payment_received');

  // Update sale entry if amount changed
  if (saleEntry && saleEntry.debit !== total) {
    console.log(`Updating sale entry: ${saleEntry.debit} -> ${total}`);
    
    // Delete old entry
    await deleteLedgerEntry(saleEntry._id);
    
    // Create new entry
    await createLedgerEntry({
      customer: customerId,
      transactionType: 'sale',
      transactionDate: invoiceDate || saleEntry.transactionDate,
      reference: invoiceNumber,
      referenceId: referenceId,
      description: `Sale Invoice #${invoiceNumber} (Updated)`,
      debit: total,
      credit: 0,
      paymentMethod: paymentMethod,
      notes: `Invoice updated`
    });
  }

  // Handle payment entry updates
  if (paidAmount > 0) {
    const paymentDate = new Date(invoiceDate || new Date());
    paymentDate.setSeconds(paymentDate.getSeconds() + 1);

    if (paymentEntry) {
      // Payment entry exists - check if amount changed
      if (paymentEntry.credit !== paidAmount) {
        console.log(`Updating payment entry: ${paymentEntry.credit} -> ${paidAmount}`);
        
        // Delete old payment entry
        await deleteLedgerEntry(paymentEntry._id);
        
        // Create new payment entry
        await createLedgerEntry({
          customer: customerId,
          transactionType: 'payment_received',
          transactionDate: paymentDate,
          reference: invoiceNumber,
          referenceId: referenceId,
          description: `Payment for Invoice #${invoiceNumber} (Updated)`,
          debit: 0,
          credit: paidAmount,
          paymentMethod: paymentMethod || 'Cash',
          notes: `Amount paid: Rs${paidAmount.toFixed(2)}`
        });
      }
    } else {
      // Payment entry doesn't exist - create new one
      console.log(`Creating new payment entry: ${paidAmount}`);
      await createLedgerEntry({
        customer: customerId,
        transactionType: 'payment_received',
        transactionDate: paymentDate,
        reference: invoiceNumber,
        referenceId: referenceId,
        description: `Payment for Invoice #${invoiceNumber} (Updated)`,
        debit: 0,
        credit: paidAmount,
        paymentMethod: paymentMethod || 'Cash',
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
};
