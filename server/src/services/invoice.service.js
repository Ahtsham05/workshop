const httpStatus = require('http-status');
const { Invoice, Product, Customer } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create an invoice
 * @param {Object} invoiceBody
 * @param {string} userId
 * @returns {Promise<Invoice>}
 */
const createInvoice = async (invoiceBody, userId) => {
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
  }

  // Validate products and calculate totals
  const validatedItems = [];
  for (const item of invoiceBody.items) {
    if (!item.productId) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Product ID is required for all items');
    }

    const product = await Product.findById(item.productId);
    if (!product) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Product with ID ${item.productId} not found`);
    }

    // Check stock availability
    if (product.stockQuantity < item.quantity) {
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

  // Update product stock quantities
  for (const item of validatedItems) {
    await Product.findByIdAndUpdate(
      item.productId,
      { $inc: { stockQuantity: -item.quantity } },
      { new: true }
    );
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

  return invoice;
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
  // First get invoices without population
  const invoices = await Invoice.paginate(filter, {
    ...options,
    populate: [
      { path: 'items.productId', select: 'name barcode category' },
      { path: 'createdBy updatedBy', select: 'name email' }
    ]
  });

  // Then conditionally populate customer for each invoice
  if (invoices.results) {
    for (const invoice of invoices.results) {
      if (invoice.customerId && invoice.customerId !== 'walk-in') {
        await invoice.populate({ path: 'customerId', select: 'name phone email' });
      }
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
  
  return invoice;
};

/**
 * Update invoice by id
 * @param {ObjectId} invoiceId
 * @param {Object} updateBody
 * @param {string} userId
 * @returns {Promise<Invoice>}
 */
const updateInvoiceById = async (invoiceId, updateBody, userId) => {
  const invoice = await getInvoiceById(invoiceId);
  
  // Prevent updating finalized invoices unless specifically allowed
  if (invoice.status === 'finalized' || invoice.status === 'paid') {
    if (!updateBody.allowUpdateFinalized) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot update finalized or paid invoice');
    }
  }

  // If updating items, validate stock again
  if (updateBody.items) {
    // Restore original stock quantities
    for (const item of invoice.items) {
      await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { stockQuantity: item.quantity } },
        { new: true }
      );
    }

    // Validate new items and stock
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

    updateBody.items = validatedItems;

    // Update stock quantities for new items
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
  
  // Recalculate totals
  invoice.calculateTotals();
  
  await invoice.save();
  return invoice;
};

/**
 * Delete invoice by id
 * @param {ObjectId} invoiceId
 * @returns {Promise<Invoice>}
 */
const deleteInvoiceById = async (invoiceId) => {
  const invoice = await getInvoiceById(invoiceId);
  
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
  const invoice = await getInvoiceById(invoiceId);
  
  if (invoice.status !== 'draft') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Only draft invoices can be finalized');
  }

  invoice.finalize();
  invoice.updatedBy = userId;
  await invoice.save();
  
  return invoice;
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
  
  const invoice = await getInvoiceById(invoiceId);
  
  if (amount <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payment amount must be greater than 0');
  }
  
  if (amount > invoice.balance) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payment amount cannot exceed balance');
  }

  invoice.markAsPaid(amount, method, reference);
  invoice.updatedBy = userId;
  await invoice.save();
  
  return invoice;
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

module.exports = {
  createInvoice,
  queryInvoices,
  getInvoiceById,
  updateInvoiceById,
  deleteInvoiceById,
  finalizeInvoice,
  processPayment,
  getInvoiceStatistics,
  getDailySalesReport
};
