const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { invoiceService } = require('../services');

const createInvoice = catchAsync(async (req, res) => {
  const invoice = await invoiceService.createInvoice(req.body, req.user.id);
  res.status(httpStatus.CREATED).send(invoice);
});

const getInvoices = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['customerId', 'type', 'status', 'invoiceNumber']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  
  // Add date range filter if provided
  if (req.query.dateFrom || req.query.dateTo) {
    filter.invoiceDate = {};
    if (req.query.dateFrom) {
      filter.invoiceDate.$gte = new Date(req.query.dateFrom);
    }
    if (req.query.dateTo) {
      filter.invoiceDate.$lte = new Date(req.query.dateTo);
    }
  }
  
  // Add search functionality
  if (req.query.search) {
    filter.$or = [
      { invoiceNumber: { $regex: req.query.search, $options: 'i' } },
      { customerName: { $regex: req.query.search, $options: 'i' } },
      { 'items.name': { $regex: req.query.search, $options: 'i' } }
    ];
  }
  
  const result = await invoiceService.queryInvoices(filter, options);
  res.send(result);
});

const getInvoice = catchAsync(async (req, res) => {
  const invoice = await invoiceService.getInvoiceById(req.params.invoiceId);
  if (!invoice) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found');
  }
  res.send(invoice);
});

const updateInvoice = catchAsync(async (req, res) => {
  const invoice = await invoiceService.updateInvoiceById(req.params.invoiceId, req.body, req.user.id);
  res.send(invoice);
});

const deleteInvoice = catchAsync(async (req, res) => {
  await invoiceService.deleteInvoiceById(req.params.invoiceId);
  res.status(httpStatus.NO_CONTENT).send();
});

const finalizeInvoice = catchAsync(async (req, res) => {
  const invoice = await invoiceService.finalizeInvoice(req.params.invoiceId, req.user.id);
  res.send(invoice);
});

const processPayment = catchAsync(async (req, res) => {
  const { amount, method, reference } = req.body;
  
  if (!amount || amount <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Valid payment amount is required');
  }
  
  const invoice = await invoiceService.processPayment(
    req.params.invoiceId, 
    { amount, method, reference }, 
    req.user.id
  );
  res.send(invoice);
});

const getInvoiceStatistics = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['dateFrom', 'dateTo', 'customerId', 'type']);
  const stats = await invoiceService.getInvoiceStatistics(filter);
  res.send(stats);
});

const getDailySalesReport = catchAsync(async (req, res) => {
  const date = req.query.date ? new Date(req.query.date) : new Date();
  const report = await invoiceService.getDailySalesReport(date);
  res.send(report);
});

const getInvoicesByCustomer = catchAsync(async (req, res) => {
  const filter = { customerId: req.params.customerId };
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await invoiceService.queryInvoices(filter, options);
  res.send(result);
});

const getOutstandingInvoices = catchAsync(async (req, res) => {
  const filter = { 
    type: { $in: ['credit', 'pending'] },
    balance: { $gt: 0 },
    status: { $ne: 'cancelled' }
  };
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await invoiceService.queryInvoices(filter, options);
  res.send(result);
});

const cancelInvoice = catchAsync(async (req, res) => {
  const invoice = await invoiceService.updateInvoiceById(
    req.params.invoiceId, 
    { status: 'cancelled', allowUpdateFinalized: true }, 
    req.user.id
  );
  res.send(invoice);
});

const duplicateInvoice = catchAsync(async (req, res) => {
  const originalInvoice = await invoiceService.getInvoiceById(req.params.invoiceId);
  
  // Create a copy without id and timestamps
  const duplicateData = {
    items: originalInvoice.items.map(item => ({
      productId: item.productId,
      name: item.name,
      image: item.image,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      cost: item.cost,
      subtotal: item.subtotal,
      profit: item.profit,
      isManualEntry: item.isManualEntry
    })),
    customerId: originalInvoice.customerId,
    customerName: originalInvoice.customerName,
    type: originalInvoice.type,
    subtotal: originalInvoice.subtotal,
    tax: originalInvoice.tax,
    discount: originalInvoice.discount,
    total: originalInvoice.total,
    totalProfit: originalInvoice.totalProfit,
    totalCost: originalInvoice.totalCost,
    paidAmount: 0,
    balance: originalInvoice.total,
    deliveryCharge: originalInvoice.deliveryCharge,
    serviceCharge: originalInvoice.serviceCharge,
    roundingAdjustment: originalInvoice.roundingAdjustment,
    loyaltyPoints: originalInvoice.loyaltyPoints,
    notes: originalInvoice.notes ? `Copy of ${originalInvoice.invoiceNumber}: ${originalInvoice.notes}` : `Copy of ${originalInvoice.invoiceNumber}`
  };
  
  const duplicatedInvoice = await invoiceService.createInvoice(duplicateData, req.user.id);
  res.status(httpStatus.CREATED).send(duplicatedInvoice);
});

module.exports = {
  createInvoice,
  getInvoices,
  getInvoice,
  updateInvoice,
  deleteInvoice,
  finalizeInvoice,
  processPayment,
  getInvoiceStatistics,
  getDailySalesReport,
  getInvoicesByCustomer,
  getOutstandingInvoices,
  cancelInvoice,
  duplicateInvoice
};
