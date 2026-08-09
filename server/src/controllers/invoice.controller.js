const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { invoiceService, auditLogService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const TRACKED_INVOICE_FIELDS = ['status', 'total', 'paidAmount', 'balance', 'discount', 'items'];

const createInvoice = catchAsync(async (req, res) => {
  const invoice = await invoiceService.createInvoice({ ...req.body, ...getBranchContext(req) }, req.user.id);
  // recordAuditLog never throws (failures are logged internally) — don't make the
  // client wait on it, it has no bearing on whether the invoice was saved.
  auditLogService.recordAuditLog({
    req,
    action: 'create',
    module: 'Invoice',
    entityId: invoice._id,
    entityName: invoice.invoiceNumber,
    after: invoice.toObject ? invoice.toObject() : invoice,
    fields: TRACKED_INVOICE_FIELDS,
    metadata: { total: invoice.total, type: invoice.type },
  });
  res.status(httpStatus.CREATED).send(invoice);
});

const getInvoices = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['customerId', 'type', 'status', 'invoiceNumber']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  
  // Set default options if not provided
  if (!options.limit) {
    options.limit = 100; // Increase default limit to show more results
  }
  if (!options.page) {
    options.page = 1;
  }
  if (!options.sortBy) {
    options.sortBy = 'createdAt:desc'; // Default sort by newest first
  }
  
  console.log('Invoice search - Query params:', req.query);
  console.log('Invoice search - Filter:', filter);
  console.log('Invoice search - Options:', options);
  
  // Handle isConvertedToBill filter explicitly
  if (req.query.isConvertedToBill !== undefined) {
    // If explicitly provided in query, use it
    filter.isConvertedToBill = req.query.isConvertedToBill === 'true';
    console.log('Explicitly filtering by isConvertedToBill:', filter.isConvertedToBill);
  } else if (filter.type === 'pending') {
    // If viewing pending invoices without explicit isConvertedToBill, filter to show only those not yet converted
    filter.isConvertedToBill = false;
    console.log('Auto-filtering pending invoices to show only unconverted');
  }
  
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
  
  // Enhanced search functionality
  if (req.query.search) {
    const searchTerm = req.query.search.trim();
    console.log('Searching for term:', searchTerm);
    
    // First, find customers that match the search term
    const { Customer } = require('../models');
    const matchingCustomers = await Customer.find({
      $or: [
        { name: { $regex: searchTerm, $options: 'i' } },
        { phone: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } }
      ]
    }).select('_id name');
    
    console.log('Found matching customers:', matchingCustomers.length);
    matchingCustomers.forEach(customer => {
      console.log('Customer:', customer.name, 'ID:', customer._id);
    });
    
    const customerIds = matchingCustomers.map(customer => customer._id);
    const customerIdsString = customerIds.map(id => id.toString());
    
    // Debug: Let's see what invoices exist for this customer
    if (customerIds.length > 0) {
      const { Invoice } = require('../models');
      const allInvoicesForCustomer = await Invoice.find({ 
        customerId: { $in: customerIds } 
      }).select('_id invoiceNumber customerId customerName');
      
      console.log('All invoices for matching customers (direct ID match):', allInvoicesForCustomer.length);
      allInvoicesForCustomer.forEach(inv => {
        console.log('Invoice:', inv.invoiceNumber, 'CustomerID:', inv.customerId, 'CustomerName:', inv.customerName);
      });
      
      // Also check for string version of IDs
      const allInvoicesForCustomerString = await Invoice.find({ 
        customerId: { $in: customerIdsString } 
      }).select('_id invoiceNumber customerId customerName');
      
      console.log('All invoices for matching customers (string ID match):', allInvoicesForCustomerString.length);
    }
    
    // Build comprehensive search filter
    filter.$or = [
      { invoiceNumber: { $regex: searchTerm, $options: 'i' } },
      { walkInCustomerName: { $regex: searchTerm, $options: 'i' } },
      { customerName: { $regex: searchTerm, $options: 'i' } }, // Add direct customer name search
      { 'items.name': { $regex: searchTerm, $options: 'i' } },
      { notes: { $regex: searchTerm, $options: 'i' } }
    ];
    
    // Add customer ID search if we found matching customers (try both ObjectId and string versions)
    if (customerIds.length > 0) {
      filter.$or.push({ customerId: { $in: customerIds } });
      filter.$or.push({ customerId: { $in: customerIdsString } });
    }
    
    console.log('Final search filter:', JSON.stringify(filter, null, 2));
  }
  
  const result = await invoiceService.queryInvoices(filter, options);
  console.log('Search results:', {
    total: result.totalResults,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
    resultsCount: result.results?.length
  });
  
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
  const before = await invoiceService.getInvoiceById(req.params.invoiceId);
  const beforeSnapshot = before && before.toObject ? before.toObject() : before;
  const invoice = await invoiceService.updateInvoiceById(req.params.invoiceId, req.body, req.user.id);
  await auditLogService.recordAuditLog({
    req,
    action: 'update',
    module: 'Invoice',
    entityId: invoice._id,
    entityName: invoice.invoiceNumber,
    before: beforeSnapshot,
    after: invoice.toObject ? invoice.toObject() : invoice,
    fields: TRACKED_INVOICE_FIELDS,
  });
  res.send(invoice);
});

const deleteInvoice = catchAsync(async (req, res) => {
  const invoice = await invoiceService.getInvoiceById(req.params.invoiceId);
  await invoiceService.deleteInvoiceById(req.params.invoiceId);
  await auditLogService.recordAuditLog({
    req,
    action: 'delete',
    module: 'Invoice',
    entityId: req.params.invoiceId,
    entityName: invoice?.invoiceNumber,
    metadata: { total: invoice?.total, type: invoice?.type, customerName: invoice?.customerName },
  });
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
  applyBranchFilter(filter, req);
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
  applyBranchFilter(filter, req);
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
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await invoiceService.queryInvoices(filter, options);
  res.send(result);
});

const cancelInvoice = catchAsync(async (req, res) => {
  const before = await invoiceService.getInvoiceById(req.params.invoiceId);
  const invoice = await invoiceService.updateInvoiceById(
    req.params.invoiceId,
    { status: 'cancelled', allowUpdateFinalized: true },
    req.user.id
  );
  await auditLogService.recordAuditLog({
    req,
    action: 'status_change',
    module: 'Invoice',
    entityId: invoice._id,
    entityName: invoice.invoiceNumber,
    before: before && before.toObject ? before.toObject() : before,
    after: invoice.toObject ? invoice.toObject() : invoice,
    fields: ['status'],
  });
  res.send(invoice);
});

const duplicateInvoice = catchAsync(async (req, res) => {
  const originalInvoice = await invoiceService.getInvoiceById(req.params.invoiceId);
  
  // Create a copy without id and timestamps
  const duplicateData = {
    items: originalInvoice.items.map(item => ({
      productId: item.productId,
      name: item.name,
      nameUrdu: item.nameUrdu,
      image: item.image,
      quantity: item.quantity,
      unit: item.unit,
      conversionFactor: item.conversionFactor,
      stockQuantity: item.stockQuantity,
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

const generateBillNumber = catchAsync(async (req, res) => {
  const billNumber = await invoiceService.generateBillNumber();
  // Prevent caching to ensure unique bill numbers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.send({ billNumber });
});

const convertQuotation = catchAsync(async (req, res) => {
  const invoice = await invoiceService.convertQuotationToInvoice(
    req.params.invoiceId,
    req.body,
    req.user.id,
  );
  res.send(invoice);
});

const getCustomerProductHistory = catchAsync(async (req, res) => {
  const { customerId, productId } = req.params;
  const history = await invoiceService.getCustomerProductHistory(customerId, productId);
  res.send(history);
});

// One row per customer who currently has unconverted pending (goods-handoff) invoices —
// feeds the customer-picker list on the Convert Pending Invoices page, so a cashier can see
// at a glance who owes a bill and roughly how much before opening their invoice list.
const getPendingInvoiceSummaryByCustomer = catchAsync(async (req, res) => {
  const mongoose = require('mongoose');
  const { Invoice, Customer, CustomerLedger } = require('../models');

  // Model.aggregate() sends the pipeline to MongoDB as-is — unlike find()/paginate(),
  // Mongoose does NOT cast query values against the schema first. req.organizationId/
  // req.branchId come through as plain strings, so without this cast a $match against
  // the (real) ObjectId fields on Invoice would silently match nothing.
  const toObjectId = (id) =>
    id && mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(String(id)) : id;

  const matchFilter = {
    type: 'pending',
    isConvertedToBill: { $ne: true },
  };
  if (req.organizationId) matchFilter.organizationId = toObjectId(req.organizationId);
  if (req.branchId) matchFilter.branchId = toObjectId(req.branchId);

  const grouped = await Invoice.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: '$customerId',
        pendingCount: { $sum: 1 },
        pendingTotal: { $sum: '$total' },
      },
    },
  ]);

  // Walk-in / missing customerId can't be picked from this list — pending handoffs
  // without a real customer record have nowhere to be billed to.
  const pendingByCustomerId = new Map();
  grouped.forEach((g) => {
    if (g._id && mongoose.Types.ObjectId.isValid(g._id)) {
      pendingByCustomerId.set(String(g._id), { pendingCount: g.pendingCount, pendingTotal: g.pendingTotal });
    }
  });

  // The list isn't just "who has a pending invoice" — every customer carrying a balance
  // is relevant here too, so the page stays useful even on a day nobody has a pending
  // handoff waiting. Customers with neither a balance nor a pending invoice are noise
  // and left out.
  const customerFilter = {
    isEmployeeAccount: { $ne: true },
    isSupplierAccount: { $ne: true },
    $or: [{ balance: { $ne: 0 } }, { _id: { $in: [...pendingByCustomerId.keys()].map(toObjectId) } }],
  };
  applyBranchFilter(customerFilter, req);
  const customerDocs = await Customer.find(customerFilter).select('name nameUrdu phone whatsapp picture balance');

  // Pending invoices never post to the ledger (see invoice.service.js), so "last bill"
  // has to come from CustomerLedger's 'sale' entries — those are only written once a
  // pending handoff is actually converted to a bill (or for cash/credit invoices sold
  // directly). 'payment_received' entries are cash collected against the balance.
  const ledgerMatchFilter = { transactionType: { $in: ['sale', 'payment_received'] } };
  if (req.organizationId) ledgerMatchFilter.organizationId = toObjectId(req.organizationId);
  if (req.branchId) ledgerMatchFilter.branchId = toObjectId(req.branchId);

  const lastLedgerDates = await CustomerLedger.aggregate([
    { $match: ledgerMatchFilter },
    {
      $group: {
        _id: { customer: '$customer', transactionType: '$transactionType' },
        lastDate: { $max: '$transactionDate' },
      },
    },
  ]);

  const lastBillDateByCustomerId = new Map();
  const lastCashReceivedDateByCustomerId = new Map();
  lastLedgerDates.forEach((row) => {
    const key = String(row._id.customer);
    if (row._id.transactionType === 'sale') {
      lastBillDateByCustomerId.set(key, row.lastDate);
    } else if (row._id.transactionType === 'payment_received') {
      lastCashReceivedDateByCustomerId.set(key, row.lastDate);
    }
  });

  const summary = customerDocs
    .map((customer) => {
      const pending = pendingByCustomerId.get(String(customer._id)) || { pendingCount: 0, pendingTotal: 0 };
      const previousBalance = customer.balance || 0;
      return {
        customerId: String(customer._id),
        name: customer.name,
        nameUrdu: customer.nameUrdu,
        phone: customer.phone,
        whatsapp: customer.whatsapp,
        picture: customer.picture,
        pendingCount: pending.pendingCount,
        pendingTotal: pending.pendingTotal,
        previousBalance,
        currentBalance: previousBalance + pending.pendingTotal,
        lastBillDate: lastBillDateByCustomerId.get(String(customer._id)) || null,
        lastCashReceivedDate: lastCashReceivedDateByCustomerId.get(String(customer._id)) || null,
      };
    })
    .sort((a, b) => b.pendingCount - a.pendingCount || b.pendingTotal - a.pendingTotal || b.currentBalance - a.currentBalance);

  const totals = summary.reduce(
    (acc, row) => {
      acc.pendingCount += row.pendingCount;
      acc.pendingTotal += row.pendingTotal;
      acc.previousBalance += row.previousBalance;
      acc.currentBalance += row.currentBalance;
      return acc;
    },
    { pendingCount: 0, pendingTotal: 0, previousBalance: 0, currentBalance: 0 },
  );

  res.send({ results: summary, totals });
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
  duplicateInvoice,
  convertQuotation,
  generateBillNumber,
  getCustomerProductHistory,
  getPendingInvoiceSummaryByCustomer,
};
