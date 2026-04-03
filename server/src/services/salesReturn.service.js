const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { SalesReturn, Invoice, Product, CustomerLedger, Customer, CashBookEntry } = require('../models');
const ApiError = require('../utils/ApiError');
const cashBookService = require('./cashBook.service');

/**
 * Validate that return quantities do not exceed what was originally sold.
 * Also accounts for quantities already returned in previous partial returns.
 */
const validateReturnQuantities = async (invoice, returnItems) => {
  // Build a map of already-returned quantities for this invoice
  const previousReturns = await SalesReturn.find({
    invoiceId: invoice._id,
    status: { $ne: 'rejected' },
  });

  const alreadyReturnedMap = {};
  for (const ret of previousReturns) {
    for (const item of ret.items) {
      const key = item.productId.toString();
      alreadyReturnedMap[key] = (alreadyReturnedMap[key] || 0) + item.quantity;
    }
  }

  // Build a map of sold quantities from the invoice items
  const soldMap = {};
  for (const item of invoice.items) {
    const key = item.productId.toString();
    soldMap[key] = (soldMap[key] || 0) + item.quantity;
  }

  for (const returnItem of returnItems) {
    const key = returnItem.productId.toString();
    const soldQty = soldMap[key] || 0;
    const alreadyReturned = alreadyReturnedMap[key] || 0;
    const returnable = soldQty - alreadyReturned;

    if (returnItem.quantity > returnable) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Cannot return ${returnItem.quantity} units of product ${returnItem.name}. ` +
          `Only ${returnable} unit(s) are returnable (sold: ${soldQty}, already returned: ${alreadyReturned}).`
      );
    }
  }
};

/**
 * Create a sales return (customer return).
 * - Increases stock for each returned product.
 * - Creates a CashBook entry based on refund method.
 * - Stores credit note info when refundMethod === 'adjustment'.
 */
const createSalesReturn = async (returnBody) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Validate the original invoice
    const invoice = await Invoice.findById(returnBody.invoiceId).session(session);
    if (!invoice) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found');
    }
    if (invoice.status === 'cancelled') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot create return for a cancelled invoice');
    }

    // 2. Validate return quantities
    await validateReturnQuantities(invoice, returnBody.items);

    // 3. Persist the return document
    const [salesReturn] = await SalesReturn.create([returnBody], { session });

    // 4. Increase stock for each returned item (atomic increment)
    for (const item of returnBody.items) {
      const updated = await Product.findOneAndUpdate(
        {
          _id: item.productId,
          organizationId: returnBody.organizationId,
        },
        { $inc: { stockQuantity: item.quantity } },
        { session, new: true }
      );
      if (!updated) {
        throw new ApiError(httpStatus.NOT_FOUND, `Product ${item.productId} not found`);
      }
    }

    // 5. Update invoice status to 'refunded' if all items are returned
    const allReturnedAfterThis = await _isFullyReturned(invoice, salesReturn.items);
    if (allReturnedAfterThis) {
      await Invoice.findByIdAndUpdate(
        invoice._id,
        { status: 'refunded' },
        { session }
      );
    }

    // 6. Customer Ledger entry (inside transaction)
    await _createCustomerLedgerEntry(salesReturn, session);

    // 7. CashBook entry (inside transaction)
    await _createCashBookEntryInSession(salesReturn, session);

    await session.commitTransaction();

    return salesReturn;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

/**
 * Check whether the invoice is fully returned (all sold quantities accounted for).
 */
const _isFullyReturned = async (invoice, newItems) => {
  const previousReturns = await SalesReturn.find({
    invoiceId: invoice._id,
    status: { $ne: 'rejected' },
  });

  const returnedMap = {};
  for (const ret of previousReturns) {
    for (const item of ret.items) {
      const key = item.productId.toString();
      returnedMap[key] = (returnedMap[key] || 0) + item.quantity;
    }
  }
  // Include the current return's items
  for (const item of newItems) {
    const key = item.productId.toString();
    returnedMap[key] = (returnedMap[key] || 0) + item.quantity;
  }

  for (const soldItem of invoice.items) {
    const returned = returnedMap[soldItem.productId.toString()] || 0;
    if (returned < soldItem.quantity) {
      return false;
    }
  }
  return true;
};

/**
 * Create a CustomerLedger entry for a sales return (transactional).
 * - cash/jazzcash/easypaisa: debit (money going out to customer)
 * - adjustment: credit (store as customer credit / reduce their outstanding balance)
 */
const _createCustomerLedgerEntry = async (salesReturn, session) => {
  if (!salesReturn.customerId) return;

  // Get the running balance for this customer
  const lastEntry = await CustomerLedger.findOne({ customer: salesReturn.customerId })
    .sort({ transactionDate: -1, createdAt: -1 })
    .select('balance')
    .session(session);

  const currentBalance = lastEntry ? lastEntry.balance : 0;
  let debit = 0;
  let credit = 0;
  let newBalance = currentBalance;

  // Sales return always REDUCES what the customer owes us → Credit column
  credit = salesReturn.totalAmount;
  newBalance = currentBalance - salesReturn.totalAmount;

  await CustomerLedger.create(
    [
      {
        organizationId: salesReturn.organizationId,
        branchId: salesReturn.branchId,
        customer: salesReturn.customerId,
        transactionType: 'sales_return',
        transactionDate: salesReturn.date || new Date(),
        reference: salesReturn.returnNumber,
        referenceId: salesReturn._id,
        description: `Sales return ${salesReturn.returnNumber}${salesReturn.reason ? ` - ${salesReturn.reason}` : ''}`,
        debit,
        credit,
        balance: newBalance,
        paymentMethod: { cash: 'Cash', jazzcash: 'Bank Transfer', easypaisa: 'Bank Transfer', adjustment: 'Credit' }[salesReturn.refundMethod],
        createdBy: salesReturn.createdBy,
      },
    ],
    { session }
  );

  // Keep Customer.balance in sync so the balance card is always accurate
  await Customer.findByIdAndUpdate(
    salesReturn.customerId,
    { $inc: { balance: -salesReturn.totalAmount } },
    { session }
  );
};

/**
 * Create a CashBook entry for a sales return inside a transaction session.
 * Sales returns are an expense (money going back to customer).
 */
const _createCashBookEntryInSession = async (salesReturn, session) => {
  if (salesReturn.refundMethod === 'adjustment') {
    // No cash movement – recorded as customer credit in ledger
    return;
  }

  const methodMap = {
    cash: 'cash',
    jazzcash: 'jazzcash',
    easypaisa: 'easypaisa',
  };

  await CashBookEntry.create(
    [
      {
        organizationId: salesReturn.organizationId,
        branchId: salesReturn.branchId,
        type: 'expense',
        source: 'sales_return',
        amount: salesReturn.totalAmount,
        paymentMethod: methodMap[salesReturn.refundMethod] || 'cash',
        referenceId: salesReturn._id,
        referenceModel: 'SalesReturn',
        description: `Sales return ${salesReturn.returnNumber} - Refund to customer`,
        date: salesReturn.date,
        createdBy: salesReturn.createdBy,
      },
    ],
    { session }
  );
};

/**
 * Query sales returns with pagination and date/product/customer filters.
 */
const querySalesReturns = async (filter, options) => {
  const queryFilter = { ...filter };
  const queryOptions = { ...options };

  if (queryOptions.startDate || queryOptions.endDate) {
    queryFilter.date = {};
    if (queryOptions.startDate) {
      queryFilter.date.$gte = new Date(queryOptions.startDate);
      delete queryOptions.startDate;
    }
    if (queryOptions.endDate) {
      queryFilter.date.$lte = new Date(queryOptions.endDate);
      delete queryOptions.endDate;
    }
  }

  if (queryOptions.search) {
    queryFilter.$or = [
      { returnNumber: { $regex: queryOptions.search, $options: 'i' } },
      { reason: { $regex: queryOptions.search, $options: 'i' } },
      { customerName: { $regex: queryOptions.search, $options: 'i' } },
    ];
    delete queryOptions.search;
  }

  return SalesReturn.paginate(queryFilter, {
    ...queryOptions,
    sortBy: queryOptions.sortBy || 'date:desc',
    populate: 'invoiceId customerId createdBy',
  });
};

const getSalesReturnById = async (id) => {
  const ret = await SalesReturn.findById(id)
    .populate('invoiceId')
    .populate('customerId')
    .populate('createdBy', 'name email');
  if (!ret) throw new ApiError(httpStatus.NOT_FOUND, 'Sales return not found');
  return ret;
};

/**
 * Approve or reject a pending sales return.
 */
const updateSalesReturnStatus = async (id, status, userId, rejectionReason) => {
  const ret = await SalesReturn.findById(id);
  if (!ret) throw new ApiError(httpStatus.NOT_FOUND, 'Sales return not found');
  if (ret.status !== 'pending') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Only pending returns can be approved or rejected');
  }

  ret.status = status;
  ret.approvedBy = userId;
  ret.approvedAt = new Date();
  if (status === 'rejected' && rejectionReason) {
    ret.rejectionReason = rejectionReason;
  }
  await ret.save();

  if (status === 'approved') {
    // Stock already increased on creation — create cash entry now
    await _createCashBookEntry(ret);
  } else if (status === 'rejected') {
    // Reverse stock that was added at creation time
    for (const item of ret.items) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { stockQuantity: -item.quantity },
      });
    }
  }

  return ret;
};

const deleteSalesReturn = async (id) => {
  const ret = await SalesReturn.findById(id);
  if (!ret) throw new ApiError(httpStatus.NOT_FOUND, 'Sales return not found');

  // Reverse stock
  for (const item of ret.items) {
    await Product.findByIdAndUpdate(item.productId, {
      $inc: { stockQuantity: -item.quantity },
    });
  }

  // Remove cash book entry if any
  await cashBookService.deleteEntriesByReference(ret._id, 'SalesReturn');

  await SalesReturn.findByIdAndDelete(id);
};

module.exports = {
  createSalesReturn,
  querySalesReturns,
  getSalesReturnById,
  updateSalesReturnStatus,
  deleteSalesReturn,
};
