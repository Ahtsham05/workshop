const httpStatus = require('http-status');
const { Invoice, Product, Customer, CustomerLedger } = require('../models');
const ApiError = require('../utils/ApiError');
const customerLedgerService = require('./customerLedger.service');

/**
 * Create an invoice
 * @param {Object} invoiceBody
 * @param {string} userId
 * @returns {Promise<Invoice>}
 */
const createInvoice = async (invoiceBody, userId) => {
  console.log('=== Creating Invoice ===');
  console.log('Invoice type:', invoiceBody.type);
  console.log('Number of items:', invoiceBody.items?.length);
  console.log('Customer ID:', invoiceBody.customerId);
  
  // Validate required fields
  if (!invoiceBody.items || invoiceBody.items.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invoice must have at least one item');
  }

  // Validate customer if provided (but not for walk-in customers)
  if (invoiceBody.customerId && invoiceBody.customerId !== 'walk-in') {
    const customer = await Customer.findById(invoiceBody.customerId);
    if (!customer) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
    }
    console.log('Customer validated:', customer.name);
  }

  // Validate products and calculate totals
  const validatedItems = [];
  for (const item of invoiceBody.items) {
    if (!item.productId) {
      console.error('Missing productId for item:', item);
      throw new ApiError(httpStatus.BAD_REQUEST, 'Product ID is required for all items');
    }

    const product = await Product.findById(item.productId);
    if (!product) {
      console.error('Product not found:', item.productId);
      throw new ApiError(httpStatus.BAD_REQUEST, `Product with ID ${item.productId} not found`);
    }

    // Check stock availability for all invoice types
    if (product.stockQuantity < item.quantity) {
      console.error('Insufficient stock:', {
        product: product.name,
        available: product.stockQuantity,
        requested: item.quantity
      });
      throw new ApiError(
        httpStatus.BAD_REQUEST, 
        `Insufficient stock for ${product.name}. Available: ${product.stockQuantity}, Requested: ${item.quantity}`
      );
    }

    // Prepare validated item
    const validatedItem = {
      productId: item.productId,
      name: item.name || product.name,
      image: item.image || product.image,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      cost: item.cost || product.cost,
      subtotal: item.quantity * item.unitPrice,
      profit: item.quantity * (item.unitPrice - (item.cost || product.cost)),
      isManualEntry: item.isManualEntry || false
    };

    validatedItems.push(validatedItem);
  }

  // Create invoice
  const invoice = new Invoice({
    ...invoiceBody,
    items: validatedItems,
    createdBy: userId,
    updatedBy: userId
  });

  // Calculate totals
  invoice.calculateTotals();

  // Auto-finalize cash invoices
  if (invoice.type === 'cash') {
    invoice.finalize();
  }

  await invoice.save();
  console.log('Invoice saved with ID:', invoice._id);

  // Create customer ledger entry for non-walk-in customers
  if (invoice.customerId && invoice.customerId !== 'walk-in' && invoice.type !== 'pending') {
    try {
      // Determine reference and description based on whether this is a converted pending invoice with bill number
      const displayReference = invoice.billNumber ? `Bill #${invoice.billNumber}` : invoice.invoiceNumber;
      const description = invoice.billNumber 
        ? `Bill sent to party - Bill #${invoice.billNumber}` 
        : `Sale Invoice #${invoice.invoiceNumber}`;
      
      // For credit/cash invoices, create a sale entry (debit - customer owes us)
      await customerLedgerService.createLedgerEntry({
        customer: invoice.customerId,
        transactionType: 'sale',
        transactionDate: invoice.invoiceDate || new Date(),
        reference: displayReference,
        referenceId: invoice._id,
        description: description,
        debit: invoice.total,
        credit: 0,
        paymentMethod: invoice.type === 'cash' ? 'Cash' : undefined,
        notes: invoice.notes || `Invoice for ${validatedItems.length} items`
      });
      console.log('Customer ledger entry created for invoice:', displayReference);
      
      // If any amount is paid at the time of invoice, create payment entry (credit - customer paid us)
      if (invoice.paidAmount > 0) {
        // Add 1 second to payment date so it appears after the sale entry when sorted
        const paymentDate = new Date(invoice.invoiceDate || new Date());
        paymentDate.setSeconds(paymentDate.getSeconds() + 1);
        
        await customerLedgerService.createLedgerEntry({
          customer: invoice.customerId,
          transactionType: 'payment_received',
          transactionDate: paymentDate,
          reference: invoice.invoiceNumber,
          referenceId: invoice._id,
          description: `Payment received for Invoice #${invoice.invoiceNumber}${invoice.paidAmount < invoice.total ? ' (Partial)' : ''}`,
          debit: 0,
          credit: invoice.paidAmount,
          paymentMethod: invoice.type === 'cash' ? 'Cash' : 'Bank Transfer',
          notes: `Amount paid: $${invoice.paidAmount.toFixed(2)}${invoice.balance > 0 ? `, Balance: $${invoice.balance.toFixed(2)}` : ''}`
        });
        console.log('Payment ledger entry created for invoice:', invoice.invoiceNumber, 'Amount:', invoice.paidAmount);
      }
    } catch (error) {
      console.error('Failed to create customer ledger entry:', error);
      // Don't fail the invoice creation if ledger entry fails
    }
  }

  // Update product stock quantities for all invoice types
  console.log('Updating stock quantities for invoice type:', invoice.type);
  for (const item of validatedItems) {
    await Product.findByIdAndUpdate(
      item.productId,
      { $inc: { stockQuantity: -item.quantity } },
      { new: true }
    );
    console.log(`Stock reduced for product ${item.productId}: -${item.quantity}`);
  }

  // Populate references conditionally
  const populateOptions = [
    { path: 'items.productId', select: 'name barcode category' },
    { path: 'createdBy', select: 'name email' }
  ];

  // Only populate customer if it's not a walk-in customer
  if (invoice.customerId && invoice.customerId !== 'walk-in') {
    populateOptions.unshift({ path: 'customerId', select: 'name phone email' });
  }

  await invoice.populate(populateOptions);

  // Add customerName for consistency
  const invoiceObj = invoice.toObject();
  console.log("invoiceObj.customerId after population:", invoiceObj.customerId);
  
  if (invoice.customerId && invoice.customerId !== 'walk-in') {
    // Get the customer data directly from the database if population didn't work
    if (invoiceObj.customerId && typeof invoiceObj.customerId === 'object' && invoiceObj.customerId.name) {
      invoiceObj.customerName = invoiceObj.customerId.name;
    } else {
      // Fallback: fetch customer directly
      const customer = await Customer.findById(invoice.customerId).select('name');
      if (customer) {
        invoiceObj.customerName = customer.name;
        invoiceObj.customerId = customer; // Also set the populated customer object
      } else {
        invoiceObj.customerName = 'Unknown Customer';
      }
    }
  } else {
    invoiceObj.customerName = 'Walk-in Customer';
  }

  return invoiceObj;
};

/**
 * Query for invoices
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryInvoices = async (filter, options) => {
  // Get invoices with pagination
  const invoices = await Invoice.paginate(filter, options);

  // Manually populate customer data for each invoice
  if (invoices.results && invoices.results.length > 0) {
    const customerIds = invoices.results
      .filter(invoice => invoice.customerId && invoice.customerId !== 'walk-in')
      .map(invoice => invoice.customerId);

    if (customerIds.length > 0) {
      // Fetch all customers in one query
      const customers = await Customer.find({ _id: { $in: customerIds } }).select('name phone email');
      const customerMap = new Map();
      customers.forEach(customer => {
        customerMap.set(customer._id.toString(), customer);
      });

      // Add customer data to invoices
      invoices.results = invoices.results.map(invoice => {
        const invoiceObj = invoice.toObject ? invoice.toObject() : invoice;
        
        if (invoiceObj.customerId && invoiceObj.customerId !== 'walk-in') {
          const customer = customerMap.get(invoiceObj.customerId.toString());
          if (customer) {
            invoiceObj.customer = customer;
            invoiceObj.customerName = customer.name;
          } else {
            invoiceObj.customerName = 'Unknown Customer';
          }
        } else {
          invoiceObj.customerName = 'Walk-in Customer';
        }
        
        return invoiceObj;
      });
    } else {
      // If no customer IDs to populate, still add customerName for walk-in customers
      invoices.results = invoices.results.map(invoice => {
        const invoiceObj = invoice.toObject ? invoice.toObject() : invoice;
        invoiceObj.customerName = 'Walk-in Customer';
        return invoiceObj;
      });
    }
  }

  return invoices;
};

/**
 * Get invoice by id
 * @param {ObjectId} id
 * @returns {Promise<Invoice>}
 */
const getInvoiceById = async (id) => {
  const invoice = await Invoice.findById(id);
  
  if (!invoice) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found');
  }

  // Populate references conditionally
  const populateOptions = [
    { path: 'items.productId', select: 'name barcode category description' },
    { path: 'createdBy updatedBy', select: 'name email' }
  ];

  // Only populate customer if it's not a walk-in customer
  if (invoice.customerId && invoice.customerId !== 'walk-in') {
    populateOptions.unshift({ path: 'customerId', select: 'name phone email address' });
  }

  await invoice.populate(populateOptions);
  
  // Add customerName for consistency with query results
  const invoiceObj = invoice.toObject();
  if (invoiceObj.customerId && invoiceObj.customerId !== 'walk-in' && invoiceObj.customerId.name) {
    invoiceObj.customerName = invoiceObj.customerId.name;
  } else {
    invoiceObj.customerName = 'Walk-in Customer';
  }
  
  return invoiceObj;
};

/**
 * Update invoice by id
 * @param {ObjectId} invoiceId
 * @param {Object} updateBody
 * @param {string} userId
 * @returns {Promise<Invoice>}
 */
const updateInvoiceById = async (invoiceId, updateBody, userId) => {
  const invoice = await Invoice.findById(invoiceId);
  
  if (!invoice) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found');
  }
  
  // Capture original state before any changes
  const originalTotal = invoice.total;
  const originalPaidAmount = invoice.paidAmount || 0;
  const originalCustomerId = invoice.customerId ? invoice.customerId.toString() : null;
  const originalType = invoice.type;

  // If updating items, restore old stock then validate and apply new stock
  if (updateBody.items) {
    for (const item of invoice.items) {
      await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { stockQuantity: item.quantity } },
        { new: true }
      );
    }

    const validatedItems = [];
    for (const item of updateBody.items) {
      if (!item.productId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Product ID is required for all items');
      }

      const product = await Product.findById(item.productId);
      if (!product) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Product with ID ${item.productId} not found`);
      }

      if (product.stockQuantity < item.quantity) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Insufficient stock for ${product.name}. Available: ${product.stockQuantity}, Requested: ${item.quantity}`
        );
      }

      validatedItems.push({
        productId: item.productId,
        name: item.name || product.name,
        image: item.image || product.image,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        cost: item.cost || product.cost,
        subtotal: item.quantity * item.unitPrice,
        profit: item.quantity * (item.unitPrice - (item.cost || product.cost)),
        isManualEntry: item.isManualEntry || false
      });
    }

    updateBody.items = validatedItems;

    for (const item of validatedItems) {
      await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { stockQuantity: -item.quantity } },
        { new: true }
      );
    }
  }

  Object.assign(invoice, updateBody);
  invoice.updatedBy = userId;
  
  if (updateBody.items) {
    invoice.calculateTotals();
  }
  
  await invoice.save();
  console.log('Invoice updated successfully');
  
  // Determine ledger state before and after the update
  const newCustomerId = invoice.customerId ? invoice.customerId.toString() : null;
  const newType = invoice.type;
  const newTotal = invoice.total;
  const newPaidAmount = invoice.paidAmount || 0;

  const originalHadLedger = originalCustomerId && originalCustomerId !== 'walk-in' && originalType !== 'pending';
  const newShouldHaveLedger = newCustomerId && newCustomerId !== 'walk-in' && newType !== 'pending';

  try {
    if (originalHadLedger && !newShouldHaveLedger) {
      // Invoice transitioned out of ledger scope — delete all related entries
      console.log('Deleting ledger entries: invoice moved out of ledger scope');
      await customerLedgerService.deleteLedgerEntriesByReference(invoice._id);

    } else if (!originalHadLedger && newShouldHaveLedger) {
      // Invoice transitioned into ledger scope — create new entries
      console.log('Creating ledger entries: invoice moved into ledger scope');
      const displayReference = invoice.billNumber ? `Bill #${invoice.billNumber}` : invoice.invoiceNumber;

      await customerLedgerService.createLedgerEntry({
        customer: newCustomerId,
        transactionType: 'sale',
        transactionDate: invoice.invoiceDate || new Date(),
        reference: displayReference,
        referenceId: invoice._id,
        description: `Sale Invoice #${invoice.invoiceNumber}`,
        debit: newTotal,
        credit: 0,
        paymentMethod: invoice.type === 'cash' ? 'Cash' : undefined,
        notes: `Invoice created`
      });

      if (newPaidAmount > 0) {
        const paymentDate = new Date(invoice.invoiceDate || new Date());
        paymentDate.setSeconds(paymentDate.getSeconds() + 1);
        await customerLedgerService.createLedgerEntry({
          customer: newCustomerId,
          transactionType: 'payment_received',
          transactionDate: paymentDate,
          reference: invoice.invoiceNumber,
          referenceId: invoice._id,
          description: `Payment for Invoice #${invoice.invoiceNumber}${newPaidAmount < newTotal ? ' (Partial)' : ''}`,
          debit: 0,
          credit: newPaidAmount,
          paymentMethod: invoice.type === 'cash' ? 'Cash' : 'Bank Transfer',
          notes: `Amount paid: Rs${newPaidAmount.toFixed(2)}`
        });
      }

    } else if (originalHadLedger && newShouldHaveLedger) {
      // Both before and after have ledger — reconcile
      if (originalCustomerId !== newCustomerId) {
        // Customer changed: delete old entries, create new ones
        console.log('Customer changed — replacing ledger entries');
        await customerLedgerService.deleteLedgerEntriesByReference(invoice._id);

        await customerLedgerService.createLedgerEntry({
          customer: newCustomerId,
          transactionType: 'sale',
          transactionDate: invoice.invoiceDate || new Date(),
          reference: invoice.invoiceNumber,
          referenceId: invoice._id,
          description: `Sale Invoice #${invoice.invoiceNumber} (Updated)`,
          debit: newTotal,
          credit: 0,
          paymentMethod: invoice.type === 'cash' ? 'Cash' : undefined,
          notes: `Invoice updated`
        });

        if (newPaidAmount > 0) {
          const paymentDate = new Date(invoice.invoiceDate || new Date());
          paymentDate.setSeconds(paymentDate.getSeconds() + 1);
          await customerLedgerService.createLedgerEntry({
            customer: newCustomerId,
            transactionType: 'payment_received',
            transactionDate: paymentDate,
            reference: invoice.invoiceNumber,
            referenceId: invoice._id,
            description: `Payment for Invoice #${invoice.invoiceNumber} (Updated)`,
            debit: 0,
            credit: newPaidAmount,
            paymentMethod: invoice.type === 'cash' ? 'Cash' : 'Bank Transfer',
            notes: `Amount paid: Rs${newPaidAmount.toFixed(2)}`
          });
        }
      } else if (originalTotal !== newTotal || originalPaidAmount !== newPaidAmount) {
        // Same customer, amounts changed — update existing entries
        console.log('Amounts changed — updating ledger entries');
        await customerLedgerService.updateLedgerEntriesByReference(invoice._id, {
          total: newTotal,
          paidAmount: newPaidAmount,
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.invoiceDate,
          paymentMethod: invoice.type === 'cash' ? 'Cash' : 'Bank Transfer'
        });
      }
    }

    console.log('Customer ledger sync completed for invoice:', invoice.invoiceNumber);
  } catch (error) {
    console.error('Failed to sync customer ledger entries:', error.message);
  }
  
  return getInvoiceById(invoiceId);
};

/**
 * Delete invoice by id
 * @param {ObjectId} invoiceId
 * @returns {Promise<Invoice>}
 */
const deleteInvoiceById = async (invoiceId) => {
  // Get the actual Mongoose document, not the plain object
  const invoice = await Invoice.findById(invoiceId);
  
  if (!invoice) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found');
  }
  
  // Prevent deleting finalized invoices
  if (invoice.status === 'finalized' || invoice.status === 'paid') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot delete finalized or paid invoice');
  }

  // Restore stock quantities
  for (const item of invoice.items) {
    await Product.findByIdAndUpdate(
      item.productId,
      { $inc: { stockQuantity: item.quantity } },
      { new: true }
    );
  }

  // Delete related customer ledger entries
  if (invoice.customerId && invoice.customerId !== 'walk-in') {
    try {
      console.log('Deleting customer ledger entries for invoice:', invoice.invoiceNumber);
      await customerLedgerService.deleteLedgerEntriesByReference(invoice._id);
    } catch (error) {
      console.error('Failed to delete customer ledger entries:', error);
      // Don't fail the invoice deletion if ledger deletion fails
    }
  }

  await invoice.deleteOne();
  return invoice;
};

/**
 * Finalize invoice
 * @param {ObjectId} invoiceId
 * @param {string} userId
 * @returns {Promise<Invoice>}
 */
const finalizeInvoice = async (invoiceId, userId) => {
  const invoice = await Invoice.findById(invoiceId);
  
  if (!invoice) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found');
  }
  
  if (invoice.status !== 'draft') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Only draft invoices can be finalized');
  }

  invoice.finalize();
  invoice.updatedBy = userId;
  await invoice.save();
  
  return getInvoiceById(invoiceId);
};

/**
 * Process payment for invoice
 * @param {ObjectId} invoiceId
 * @param {Object} paymentData
 * @param {string} userId
 * @returns {Promise<Invoice>}
 */
const processPayment = async (invoiceId, paymentData, userId) => {
  const { amount, method = 'cash', reference } = paymentData;
  
  // Must use findById to get an actual Mongoose document (not a plain object)
  const invoice = await Invoice.findById(invoiceId);
  
  if (!invoice) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found');
  }
  
  if (amount <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payment amount must be greater than 0');
  }
  
  if (amount > invoice.balance) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Payment amount (Rs${amount}) cannot exceed outstanding balance (Rs${invoice.balance})`);
  }

  invoice.markAsPaid(amount, method, reference);
  invoice.updatedBy = userId;
  await invoice.save();
  
  // Create a payment_received entry in the customer ledger
  if (invoice.customerId && invoice.customerId.toString() !== 'walk-in') {
    try {
      const methodMap = { cash: 'Cash', card: 'Card', digital: 'Bank Transfer', check: 'Cheque' };
      const ledgerMethod = methodMap[method] || 'Cash';
      const remainingBalance = invoice.balance;

      await customerLedgerService.createLedgerEntry({
        customer: invoice.customerId,
        transactionType: 'payment_received',
        transactionDate: new Date(),
        reference: invoice.invoiceNumber,
        referenceId: invoice._id,
        description: `Payment received for Invoice #${invoice.invoiceNumber}${remainingBalance > 0 ? ' (Partial)' : ' (Full)'}`,
        debit: 0,
        credit: amount,
        paymentMethod: ledgerMethod,
        notes: `Paid: Rs${amount.toFixed(2)}${remainingBalance > 0 ? ` | Remaining: Rs${remainingBalance.toFixed(2)}` : ' | Fully settled'}`
      });
      console.log('Payment ledger entry created — Invoice:', invoice.invoiceNumber, 'Amount:', amount);
    } catch (error) {
      console.error('Failed to create payment ledger entry:', error.message);
    }
  }

  return getInvoiceById(invoiceId);
};

/**
 * Cancel invoice — restores stock and reverses all customer ledger entries
 * @param {ObjectId} invoiceId
 * @param {string} userId
 * @returns {Promise<Invoice>}
 */
const cancelInvoice = async (invoiceId, userId) => {
  const invoice = await Invoice.findById(invoiceId);
  
  if (!invoice) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found');
  }
  
  if (invoice.status === 'cancelled') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invoice is already cancelled');
  }

  // Restore stock quantities for all items
  for (const item of invoice.items) {
    await Product.findByIdAndUpdate(
      item.productId,
      { $inc: { stockQuantity: item.quantity } },
      { new: true }
    );
    console.log(`Stock restored for product ${item.productId}: +${item.quantity}`);
  }

  // Reverse all customer ledger entries linked to this invoice
  if (invoice.customerId && invoice.customerId.toString() !== 'walk-in' && invoice.type !== 'pending') {
    try {
      console.log('Reversing customer ledger entries for cancelled invoice:', invoice.invoiceNumber);
      await customerLedgerService.deleteLedgerEntriesByReference(invoice._id);
    } catch (error) {
      console.error('Failed to reverse customer ledger entries on cancel:', error.message);
    }
  }

  invoice.status = 'cancelled';
  invoice.updatedBy = userId;
  await invoice.save();

  return getInvoiceById(invoiceId);
};

/**
 * Get invoice statistics
 * @param {Object} filter
 * @returns {Promise<Object>}
 */
const getInvoiceStatistics = async (filter = {}) => {
  const { dateFrom, dateTo, customerId, type } = filter;
  
  return await Invoice.getStatistics(dateFrom, dateTo);
};

/**
 * Get daily sales report
 * @param {Date} date
 * @returns {Promise<Object>}
 */
const getDailySalesReport = async (date = new Date()) => {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const invoices = await Invoice.find({
    invoiceDate: { $gte: startOfDay, $lte: endOfDay },
    status: { $in: ['finalized', 'paid'] }
  });

  // Manually populate items.productId and conditionally populate customerId
  const populatedInvoices = [];
  for (const invoice of invoices) {
    const populateOptions = [{ path: 'items.productId' }];
    
    // Only populate customer if it's not a walk-in customer
    if (invoice.customerId && invoice.customerId !== 'walk-in') {
      populateOptions.push({ path: 'customerId' });
    }
    
    await invoice.populate(populateOptions);
    populatedInvoices.push(invoice);
  }
  
  const report = {
    date: date.toISOString().split('T')[0],
    totalInvoices: populatedInvoices.length,
    totalSales: 0,
    totalProfit: 0,
    totalCost: 0,
    cashSales: 0,
    creditSales: 0,
    topProducts: {},
    customerBreakdown: {}
  };
  
  populatedInvoices.forEach(invoice => {
    report.totalSales += invoice.total;
    report.totalProfit += invoice.totalProfit;
    report.totalCost += invoice.totalCost;
    
    if (invoice.type === 'cash') {
      report.cashSales += invoice.total;
    } else {
      report.creditSales += invoice.total;
    }
    
    // Top products
    invoice.items.forEach(item => {
      const productName = item.name;
      if (!report.topProducts[productName]) {
        report.topProducts[productName] = { quantity: 0, sales: 0 };
      }
      report.topProducts[productName].quantity += item.quantity;
      report.topProducts[productName].sales += item.subtotal;
    });
    
    // Customer breakdown
    if (invoice.customerId) {
      const customerName = invoice.customerId.name;
      if (!report.customerBreakdown[customerName]) {
        report.customerBreakdown[customerName] = { invoices: 0, sales: 0 };
      }
      report.customerBreakdown[customerName].invoices += 1;
      report.customerBreakdown[customerName].sales += invoice.total;
    }
  });
  
  return report;
};

/**
 * Generate unique bill number
 * @returns {Promise<string>}
 */
const generateBillNumber = async () => {
  return await Invoice.generateBillNumber();
};

/**
 * Get customer's product purchase history
 * @param {string} customerId
 * @param {string} productId
 * @returns {Promise<Object>}
 */
const getCustomerProductHistory = async (customerId, productId) => {
  // Find all invoices for this customer that contain this product
  const invoices = await Invoice.find({
    customerId,
    'items.productId': productId,
    status: { $ne: 'cancelled' } // Exclude cancelled invoices
  })
    .select('invoiceNumber items type createdAt invoiceDate')
    .sort({ createdAt: -1 }) // Most recent first
    .lean();

  // Extract product-specific data from each invoice
  const history = invoices.map(invoice => {
    const item = invoice.items.find(i => i.productId.toString() === productId);
    return {
      _id: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.invoiceDate || invoice.createdAt,
      type: invoice.type,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal
    };
  });

  // Calculate statistics
  const stats = {
    history,
    totalQuantity: history.reduce((sum, item) => sum + item.quantity, 0),
    lastPrice: history.length > 0 ? history[0].unitPrice : null,
    avgPrice: history.length > 0 
      ? history.reduce((sum, item) => sum + item.unitPrice, 0) / history.length 
      : null,
    minPrice: history.length > 0 
      ? Math.min(...history.map(item => item.unitPrice)) 
      : null,
    maxPrice: history.length > 0 
      ? Math.max(...history.map(item => item.unitPrice)) 
      : null
  };

  return stats;
};

module.exports = {
  createInvoice,
  queryInvoices,
  getInvoiceById,
  updateInvoiceById,
  deleteInvoiceById,
  finalizeInvoice,
  cancelInvoice,
  processPayment,
  getInvoiceStatistics,
  getDailySalesReport,
  generateBillNumber,
  getCustomerProductHistory
};
