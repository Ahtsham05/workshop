const httpStatus = require('http-status');
const { CustomerLedger, Customer } = require('../models');
const ApiError = require('../utils/ApiError');
const { normalizeCustomerInvoiceType } = require('../utils/ledgerInvoiceType');
const cashBookService = require('./cashBook.service');
const walletService = require('./wallet.service');
const walletEntryService = require('./walletEntry.service');

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
const recalculateBalances = async (customerId, fromTransactionDate) => {
  // Get all entries for this customer ordered by transaction date and then by creation order
  const allEntries = await CustomerLedger.find({ customer: customerId })
    .sort({ transactionDate: 1, createdAt: 1 });

  let runningBalance = 0;
  let shouldUpdate = false;

  for (const entry of allEntries) {
    // Check if this is where we should start recalculating
    if (entry.transactionDate >= fromTransactionDate) {
      shouldUpdate = true;
    }

    if (shouldUpdate) {
      const newBalance = runningBalance + (entry.debit || 0) - (entry.credit || 0);
      
      if (entry.balance !== newBalance) {
        entry.balance = newBalance;
        await entry.save();
      }
    }

    runningBalance += (entry.debit || 0) - (entry.credit || 0);
  }

  // Update customer balance to the final running balance
  await Customer.findByIdAndUpdate(customerId, { balance: runningBalance });
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
    'name nameUrdu phone email balance picture idCardFront idCardBack',
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
  } = updateData;
  
  // Find all entries related to this invoice
  const entries = await CustomerLedger.find({ referenceId }).sort({ transactionDate: 1 });
  
  if (entries.length === 0) {
    // Backfill missing ledger entries (e.g. pending->credit conversion or old broken writes)
    if (!customerId || customerId === 'walk-in') {
      console.log('No ledger entries found and customer is invalid/walk-in for reference:', referenceId);
      return;
    }

    console.log('No ledger entries found. Creating fresh entries for reference:', referenceId);

    await createLedgerEntry({
      organizationId,
      branchId,
      customer: customerId,
      transactionType: 'sale',
      transactionDate: invoiceDate || new Date(),
      reference: invoiceNumber,
      referenceId,
      description: `Sale Invoice #${invoiceNumber}`,
      debit: total,
      credit: 0,
      paymentMethod,
      invoiceType: normalizeCustomerInvoiceType(invoiceType),
      notes: notes || 'Invoice ledger backfilled',
    });

    if (paidAmount > 0) {
      const paymentDate = new Date(invoiceDate || new Date());
      paymentDate.setSeconds(paymentDate.getSeconds() + 1);

      await createLedgerEntry({
        organizationId,
        branchId,
        customer: customerId,
        transactionType: 'payment_received',
        transactionDate: paymentDate,
        reference: invoiceNumber,
        referenceId,
        description: `Payment for Invoice #${invoiceNumber}`,
        debit: 0,
        credit: paidAmount,
        paymentMethod: paymentMethod || 'Cash',
        invoiceType: normalizeCustomerInvoiceType(invoiceType),
        notes: `Amount paid: Rs${paidAmount.toFixed(2)}`,
      });
    }

    const normalizedType = normalizeCustomerInvoiceType(invoiceType);
    if (normalizedType) {
      await CustomerLedger.updateMany({ referenceId }, { $set: { invoiceType: normalizedType } });
    }
    return;
  }

  const entryCustomerId = entries[0].customer;
  
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
          organizationId: saleEntry.organizationId,
          branchId: saleEntry.branchId,
      customer: entryCustomerId,
      transactionType: 'sale',
      transactionDate: invoiceDate || saleEntry.transactionDate,
      reference: invoiceNumber,
      referenceId: referenceId,
      description: `Sale Invoice #${invoiceNumber} (Updated)`,
      debit: total,
      credit: 0,
      paymentMethod: paymentMethod,
      invoiceType: normalizeCustomerInvoiceType(invoiceType),
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
          organizationId: paymentEntry.organizationId,
          branchId: paymentEntry.branchId,
          customer: entryCustomerId,
          transactionType: 'payment_received',
          transactionDate: paymentDate,
          reference: invoiceNumber,
          referenceId: referenceId,
          description: `Payment for Invoice #${invoiceNumber} (Updated)`,
          debit: 0,
          credit: paidAmount,
          paymentMethod: paymentMethod || 'Cash',
          invoiceType: normalizeCustomerInvoiceType(invoiceType),
          notes: `Amount paid: Rs${paidAmount.toFixed(2)}`
        });
      }
    } else {
      // Payment entry doesn't exist - create new one
      console.log(`Creating new payment entry: ${paidAmount}`);
      await createLedgerEntry({
        organizationId: saleEntry ? saleEntry.organizationId : organizationId,
        branchId: saleEntry ? saleEntry.branchId : branchId,
        customer: entryCustomerId,
        transactionType: 'payment_received',
        transactionDate: paymentDate,
        reference: invoiceNumber,
        referenceId: referenceId,
        description: `Payment for Invoice #${invoiceNumber} (Updated)`,
        debit: 0,
        credit: paidAmount,
        paymentMethod: paymentMethod || 'Cash',
        invoiceType: normalizeCustomerInvoiceType(invoiceType),
        notes: `Amount paid: Rs${paidAmount.toFixed(2)}`
      });
    }
  } else if (paymentEntry) {
    // No payment in update but entry exists - delete it
    console.log(`Deleting payment entry - no payment in update`);
    await deleteLedgerEntry(paymentEntry._id);
  }

  const normalizedType = normalizeCustomerInvoiceType(invoiceType);
  if (normalizedType) {
    await CustomerLedger.updateMany({ referenceId }, { $set: { invoiceType: normalizedType } });
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
};
