const httpStatus = require('http-status');
const mongoose = require('mongoose');
const catchAsync = require('../utils/catchAsync');
const { Invoice, Product, Customer, Purchase, Supplier, Expense, SalesReturn, PurchaseReturn, LoadTransaction, LoadPurchase, Wallet, RepairJob, CashWithdrawal, BillPayment } = require('../models');

/**
 * Build a scoped match with properly cast ObjectIds for aggregate pipelines.
 */
const buildScope = (req) => {
  const scope = {};
  const orgId = req.organizationId || (req.user && req.user.organizationId);
  const branchId = req.branchId;
  if (orgId) {
    scope.organizationId = mongoose.Types.ObjectId.isValid(orgId)
      ? new mongoose.Types.ObjectId(String(orgId))
      : orgId;
  }
  if (branchId) {
    scope.branchId = mongoose.Types.ObjectId.isValid(branchId)
      ? new mongoose.Types.ObjectId(String(branchId))
      : branchId;
  }
  return scope;
};

const parseRange = (query) => ({
  start: query.startDate ? new Date(query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  end: query.endDate ? new Date(query.endDate) : new Date(),
});

/* ── Sales ─────────────────────────────────────────────────────────────────── */
const getSalesReport = catchAsync(async (req, res) => {
  const scope = buildScope(req);
  const { start, end } = parseRange(req.query);
  const { groupBy = 'day' } = req.query;

  const groupFormats = {
    week:  { $dateToString: { format: '%Y-W%V', date: '$invoiceDate' } },
    month: { $dateToString: { format: '%Y-%m',  date: '$invoiceDate' } },
    year:  { $dateToString: { format: '%Y',     date: '$invoiceDate' } },
  };
  const groupFormat = groupFormats[groupBy] || { $dateToString: { format: '%Y-%m-%d', date: '$invoiceDate' } };

  const baseMatch = { ...scope, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } };

  const [salesData, summary] = await Promise.all([
    Invoice.aggregate([
      { $match: baseMatch },
      { $group: { _id: groupFormat, totalSales: { $sum: '$total' }, totalProfit: { $sum: { $ifNull: ['$totalProfit', 0] } }, totalCost: { $sum: { $ifNull: ['$totalCost', 0] } }, invoiceCount: { $sum: 1 }, avgSale: { $avg: '$total' } } },
      { $sort: { _id: 1 } },
    ]),
    Invoice.aggregate([
      { $match: baseMatch },
      { $group: { _id: null, totalRevenue: { $sum: '$total' }, totalProfit: { $sum: { $ifNull: ['$totalProfit', 0] } }, totalCost: { $sum: { $ifNull: ['$totalCost', 0] } }, totalInvoices: { $sum: 1 }, avgInvoiceValue: { $avg: '$total' }, maxInvoiceValue: { $max: '$total' }, minInvoiceValue: { $min: '$total' } } },
    ]),
  ]);

  res.status(httpStatus.OK).send({ data: salesData, summary: summary[0] || {}, period: { startDate: start, endDate: end } });
});

/* ── Purchases ─────────────────────────────────────────────────────────────── */
const getPurchaseReport = catchAsync(async (req, res) => {
  const scope = buildScope(req);
  const { start, end } = parseRange(req.query);
  const { supplierId } = req.query;

  const baseMatch = { ...scope, purchaseDate: { $gte: start, $lte: end } };
  if (supplierId && mongoose.Types.ObjectId.isValid(supplierId)) {
    baseMatch.supplier = new mongoose.Types.ObjectId(supplierId);
  }

  // effectivePaid: Cash purchases are always fully paid at time of purchase
  const effectivePaid = {
    $cond: [{ $eq: ['$paymentType', 'Cash'] }, '$totalAmount', { $ifNull: ['$paidAmount', 0] }],
  };
  const effectiveBalance = {
    $cond: [{ $eq: ['$paymentType', 'Cash'] }, 0, { $ifNull: ['$balance', { $subtract: ['$totalAmount', { $ifNull: ['$paidAmount', 0] }] }] }],
  };

  const [purchaseData, summary, paymentBreakdown] = await Promise.all([
    Purchase.aggregate([
      { $match: baseMatch },
      { $lookup: { from: 'suppliers', localField: 'supplier', foreignField: '_id', as: 'supplierDetails' } },
      { $unwind: { path: '$supplierDetails', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$purchaseDate' } }, supplier: { $ifNull: ['$supplierDetails.name', 'Unknown'] } },
          totalAmount: { $sum: '$totalAmount' },
          paidAmount: { $sum: effectivePaid },
          balance: { $sum: effectiveBalance },
          cashPaid: { $sum: { $cond: [{ $eq: ['$paymentType', 'Cash'] }, '$totalAmount', 0] } },
          creditBalance: { $sum: { $cond: [{ $ne: ['$paymentType', 'Cash'] }, effectiveBalance, 0] } },
          purchaseCount: { $sum: 1 },
          paymentTypes: { $addToSet: '$paymentType' },
        },
      },
      { $sort: { '_id.date': -1 } },
    ]),
    Purchase.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: null,
          totalPurchases: { $sum: '$totalAmount' },
          totalPaid: { $sum: effectivePaid },
          totalBalance: { $sum: effectiveBalance },
          totalCashPaid: { $sum: { $cond: [{ $eq: ['$paymentType', 'Cash'] }, '$totalAmount', 0] } },
          totalCreditBalance: { $sum: { $cond: [{ $ne: ['$paymentType', 'Cash'] }, effectiveBalance, 0] } },
          purchaseCount: { $sum: 1 },
          avgPurchaseValue: { $avg: '$totalAmount' },
        },
      },
    ]),
    Purchase.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: '$paymentType',
          totalAmount: { $sum: '$totalAmount' },
          paidAmount: { $sum: effectivePaid },
          balance: { $sum: effectiveBalance },
          count: { $sum: 1 },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]),
  ]);

  res.status(httpStatus.OK).send({ data: purchaseData, summary: summary[0] || {}, paymentBreakdown, period: { startDate: start, endDate: end } });
});

/* ── Products ──────────────────────────────────────────────────────────────── */
const getProductReport = catchAsync(async (req, res) => {
  const scope = buildScope(req);
  const { start, end } = parseRange(req.query);

  const invoiceMatch = { ...scope, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } };

  const [productSales, stockSummary] = await Promise.all([
    Invoice.aggregate([
      { $match: invoiceMatch },
      { $unwind: '$items' },
      { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'product' } },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id: '$items.productId',
        productName: { $first: { $ifNull: ['$product.name', '$items.name'] } },
        category: { $first: '$product.category' },
        totalQuantitySold: { $sum: '$items.quantity' },
        totalRevenue: { $sum: { $ifNull: ['$items.subtotal', { $multiply: ['$items.quantity', { $ifNull: ['$items.price', '$items.unitPrice', 0] }] }] } },
        totalProfit: { $sum: { $ifNull: ['$items.profit', 0] } },
        avgSellingPrice: { $avg: { $ifNull: ['$items.price', '$items.unitPrice'] } },
        currentStock: { $first: '$product.stockQuantity' },
        minStockLevel: { $first: '$product.minStockLevel' },
        unit: { $first: '$product.unit' },
      } },
      { $sort: { totalRevenue: -1 } },
    ]),
    Product.aggregate([
      { $match: { ...scope } },
      { $group: {
        _id: null,
        totalProducts: { $sum: 1 },
        totalStockValue: { $sum: { $multiply: ['$stockQuantity', { $ifNull: ['$cost', 0] }] } },
        lowStockProducts: { $sum: { $cond: [{ $and: [{ $gt: ['$stockQuantity', 0] }, { $lte: ['$stockQuantity', 10] }] }, 1, 0] } },
        outOfStockProducts: { $sum: { $cond: [{ $eq: ['$stockQuantity', 0] }, 1, 0] } },
      } },
    ]),
  ]);

  res.status(httpStatus.OK).send({ data: productSales, stockSummary: stockSummary[0] || {}, period: { startDate: start, endDate: end } });
});

/* ── Product Detail ─────────────────────────────────────────────────────────── */
const getProductDetailReport = catchAsync(async (req, res) => {
  const scope = buildScope(req);
  const { productId } = req.params;
  const { start, end } = parseRange(req.query);

  const product = await Product.findById(productId);
  if (!product) return res.status(httpStatus.NOT_FOUND).send({ message: 'Product not found' });

  const productObjId = new mongoose.Types.ObjectId(productId);
  const invoiceMatch = { ...scope, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } };
  const purchaseMatch = { ...scope, purchaseDate: { $gte: start, $lte: end } };

  const [salesData, purchaseData] = await Promise.all([
    Invoice.aggregate([
      { $match: invoiceMatch },
      { $unwind: '$items' },
      { $match: { 'items.productId': productObjId } },
      { $lookup: {
        from: 'customers',
        let: { cid: '$customerId' },
        pipeline: [{ $match: { $expr: { $eq: ['$_id', { $cond: [{ $eq: [{ $type: '$$cid' }, 'objectId'] }, '$$cid', { $cond: [{ $regexMatch: { input: { $ifNull: ['$$cid', ''] }, regex: '^[0-9a-fA-F]{24}$' } }, { $toObjectId: '$$cid' }, null] }] }] } } }],
        as: 'customerInfo',
      } },
      { $project: {
        invoiceNumber: 1,
        date: '$invoiceDate',
        customerName: { $ifNull: [{ $arrayElemAt: ['$customerInfo.name', 0] }, '$walkInCustomerName', 'Walk-in Customer'] },
        customerPhone: { $arrayElemAt: ['$customerInfo.phone', 0] },
        quantity: '$items.quantity',
        price: { $ifNull: ['$items.price', '$items.unitPrice'] },
        subtotal: { $ifNull: ['$items.subtotal', { $multiply: ['$items.quantity', { $ifNull: ['$items.price', '$items.unitPrice', 0] }] }] },
        profit: { $ifNull: ['$items.profit', 0] },
      } },
      { $sort: { date: -1 } },
    ]),
    Purchase.aggregate([
      { $match: purchaseMatch },
      { $unwind: '$items' },
      { $match: { 'items.product': productObjId } },
      { $lookup: { from: 'suppliers', localField: 'supplier', foreignField: '_id', as: 'supplierInfo' } },
      { $project: {
        purchaseNumber: { $ifNull: ['$invoiceNumber', 'N/A'] },
        date: '$purchaseDate',
        supplierName: { $arrayElemAt: ['$supplierInfo.name', 0] },
        supplierPhone: { $arrayElemAt: ['$supplierInfo.phone', 0] },
        quantity: '$items.quantity',
        price: { $ifNull: ['$items.priceAtPurchase', '$items.price'] },
        subtotal: { $ifNull: ['$items.total', { $multiply: ['$items.quantity', { $ifNull: ['$items.priceAtPurchase', 0] }] }] },
      } },
      { $sort: { date: -1 } },
    ]),
  ]);

  const summary = {
    totalSold: salesData.reduce((s, i) => s + (i.quantity || 0), 0),
    totalPurchased: purchaseData.reduce((s, i) => s + (i.quantity || 0), 0),
    totalRevenue: salesData.reduce((s, i) => s + (i.subtotal || 0), 0),
    totalCost: purchaseData.reduce((s, i) => s + (i.subtotal || 0), 0),
    totalProfit: salesData.reduce((s, i) => s + (i.profit || 0), 0),
    uniqueCustomers: new Set(salesData.map((i) => i.customerName)).size,
    uniqueSuppliers: new Set(purchaseData.map((i) => i.supplierName)).size,
  };

  res.status(httpStatus.OK).send({
    product: { _id: product._id, name: product.name, barcode: product.barcode, currentStock: product.stockQuantity, purchasePrice: product.purchasePrice, sellingPrice: product.sellingPrice, minStockLevel: product.minStockLevel },
    summary, sales: salesData, purchases: purchaseData,
    period: { startDate: start, endDate: end },
  });
});

/* ── Customers ─────────────────────────────────────────────────────────────── */
const getCustomerReport = catchAsync(async (req, res) => {
  const scope = buildScope(req);
  const { start, end } = parseRange(req.query);
  const top = parseInt(req.query.top) || 20;

  const baseMatch = { ...scope, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } };

  const [customerData, summary] = await Promise.all([
    Invoice.aggregate([
      { $match: baseMatch },
      { $lookup: {
        from: 'customers',
        let: { cid: '$customerId' },
        pipeline: [{ $match: { $expr: { $eq: ['$_id', { $cond: [{ $eq: [{ $type: '$$cid' }, 'objectId'] }, '$$cid', { $cond: [{ $regexMatch: { input: { $ifNull: ['$$cid', ''] }, regex: '^[0-9a-fA-F]{24}$' } }, { $toObjectId: '$$cid' }, null] }] }] } } }],
        as: 'customer',
      } },
      { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id: '$customerId',
        customerName: { $first: { $ifNull: ['$customer.name', '$walkInCustomerName', 'Walk-in Customer'] } },
        phone: { $first: '$customer.phone' },
        email: { $first: '$customer.email' },
        totalPurchases: { $sum: 1 },
        totalSpent: { $sum: '$total' },
        totalProfit: { $sum: { $ifNull: ['$totalProfit', 0] } },
        avgPurchaseValue: { $avg: '$total' },
        lastPurchase: { $max: '$invoiceDate' },
        firstPurchase: { $min: '$invoiceDate' },
      } },
      { $sort: { totalSpent: -1 } },
      { $limit: top },
    ]),
    Invoice.aggregate([
      { $match: baseMatch },
      { $group: { _id: null, uniqueCustomers: { $addToSet: '$customerId' }, totalTransactions: { $sum: 1 }, totalRevenue: { $sum: '$total' } } },
      { $project: { uniqueCustomers: { $size: '$uniqueCustomers' }, totalTransactions: 1, totalRevenue: 1, avgTransactionValue: { $cond: [{ $gt: ['$totalTransactions', 0] }, { $divide: ['$totalRevenue', '$totalTransactions'] }, 0] } } },
    ]),
  ]);

  res.status(httpStatus.OK).send({ data: customerData, summary: summary[0] || {}, period: { startDate: start, endDate: end } });
});

/* ── Suppliers ─────────────────────────────────────────────────────────────── */
const getSupplierReport = catchAsync(async (req, res) => {
  const scope = buildScope(req);
  const { start, end } = parseRange(req.query);

  const baseMatch = { ...scope, purchaseDate: { $gte: start, $lte: end } };

  const supEffPaid = { $cond: [{ $eq: ['$paymentType', 'Cash'] }, '$totalAmount', { $ifNull: ['$paidAmount', 0] }] };
  const supEffBal  = { $cond: [{ $eq: ['$paymentType', 'Cash'] }, 0, { $ifNull: ['$balance', { $subtract: ['$totalAmount', { $ifNull: ['$paidAmount', 0] }] }] }] };

  const [supplierData, summary] = await Promise.all([
    Purchase.aggregate([
      { $match: baseMatch },
      { $lookup: { from: 'suppliers', localField: 'supplier', foreignField: '_id', as: 'supplierDetails' } },
      { $unwind: { path: '$supplierDetails', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id: '$supplier',
        supplierName: { $first: { $ifNull: ['$supplierDetails.name', 'Unknown'] } },
        phone: { $first: '$supplierDetails.phone' },
        email: { $first: '$supplierDetails.email' },
        totalPurchases: { $sum: 1 },
        totalAmount: { $sum: '$totalAmount' },
        totalPaid: { $sum: supEffPaid },
        totalCashPaid: { $sum: { $cond: [{ $eq: ['$paymentType', 'Cash'] }, '$totalAmount', 0] } },
        totalBalance: { $sum: supEffBal },
        lastPurchase: { $max: '$purchaseDate' },
      } },
      { $sort: { totalAmount: -1 } },
    ]),
    Purchase.aggregate([
      { $match: baseMatch },
      { $group: { _id: null, totalPurchases: { $sum: '$totalAmount' }, totalPaid: { $sum: supEffPaid }, totalCashPaid: { $sum: { $cond: [{ $eq: ['$paymentType', 'Cash'] }, '$totalAmount', 0] } }, totalBalance: { $sum: supEffBal }, purchaseCount: { $sum: 1 } } },
    ]),
  ]);

  res.status(httpStatus.OK).send({ data: supplierData, summary: summary[0] || {}, period: { startDate: start, endDate: end } });
});

/* ── Expenses ──────────────────────────────────────────────────────────────── */
const getExpenseReport = catchAsync(async (req, res) => {
  const scope = buildScope(req);
  const { start, end } = parseRange(req.query);
  const { category } = req.query;

  const baseMatch = { ...scope, date: { $gte: start, $lte: end } };
  if (category) baseMatch.category = category;

  const [expenseData, categoryBreakdown, summary] = await Promise.all([
    Expense.aggregate([
      { $match: baseMatch },
      { $group: { _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, category: '$category' }, totalAmount: { $sum: '$amount' }, expenseCount: { $sum: 1 } } },
      { $sort: { '_id.date': -1 } },
    ]),
    Expense.aggregate([
      { $match: baseMatch },
      { $group: { _id: '$category', totalAmount: { $sum: '$amount' }, expenseCount: { $sum: 1 }, avgAmount: { $avg: '$amount' } } },
      { $sort: { totalAmount: -1 } },
    ]),
    Expense.aggregate([
      { $match: baseMatch },
      { $group: { _id: null, totalExpenses: { $sum: '$amount' }, expenseCount: { $sum: 1 }, avgExpense: { $avg: '$amount' }, maxExpense: { $max: '$amount' }, minExpense: { $min: '$amount' } } },
    ]),
  ]);

  res.status(httpStatus.OK).send({ data: expenseData, categoryBreakdown, summary: summary[0] || {}, period: { startDate: start, endDate: end } });
});

/* ── Profit & Loss ─────────────────────────────────────────────────────────── */
const getProfitLossReport = catchAsync(async (req, res) => {
  const scope = buildScope(req);
  const { start, end } = parseRange(req.query);

  const [revenueData, expenseData, salesReturnsData, purchaseReturnsData] = await Promise.all([
    Invoice.aggregate([
      { $match: { ...scope, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, totalRevenue: { $sum: '$total' }, totalCost: { $sum: { $ifNull: ['$totalCost', 0] } }, grossProfit: { $sum: { $ifNull: ['$totalProfit', 0] } } } },
    ]),
    Expense.aggregate([
      { $match: { ...scope, date: { $gte: start, $lte: end } } },
      { $group: { _id: null, totalExpenses: { $sum: '$amount' } } },
    ]),
    SalesReturn.aggregate([
      { $match: { ...scope, date: { $gte: start, $lte: end }, status: { $ne: 'rejected' } } },
      { $group: { _id: null, totalSalesReturns: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
    ]),
    PurchaseReturn.aggregate([
      { $match: { ...scope, date: { $gte: start, $lte: end }, status: { $ne: 'rejected' } } },
      { $group: { _id: null, totalPurchaseReturns: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
    ]),
  ]);

  const rev = revenueData[0] || { totalRevenue: 0, totalCost: 0, grossProfit: 0 };
  const exp = expenseData[0] || { totalExpenses: 0 };
  const sr = salesReturnsData[0] || { totalSalesReturns: 0, count: 0 };
  const pr = purchaseReturnsData[0] || { totalPurchaseReturns: 0, count: 0 };

  const netRevenue = rev.totalRevenue - sr.totalSalesReturns;
  const grossProfit = (rev.grossProfit || (rev.totalRevenue - rev.totalCost)) - sr.totalSalesReturns;
  const netProfit = grossProfit - exp.totalExpenses;

  res.status(httpStatus.OK).send({
    revenue: {
      totalRevenue: rev.totalRevenue,
      salesReturns: sr.totalSalesReturns,
      salesReturnsCount: sr.count,
      netRevenue,
      costOfGoodsSold: rev.totalCost,
      grossProfit,
      grossProfitMargin: netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0,
    },
    purchases: {
      purchaseReturns: pr.totalPurchaseReturns,
      purchaseReturnsCount: pr.count,
    },
    expenses: { totalExpenses: exp.totalExpenses },
    netProfit: { amount: netProfit, margin: netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0 },
    period: { startDate: start, endDate: end },
  });
});

/* ── Inventory ─────────────────────────────────────────────────────────────── */
const getInventoryReport = catchAsync(async (req, res) => {
  const scope = buildScope(req);
  const { status } = req.query;

  let baseMatch = { ...scope };
  if (status === 'low') {
    baseMatch.$expr = { $and: [{ $gt: ['$stockQuantity', 0] }, { $lte: ['$stockQuantity', { $ifNull: ['$minStockLevel', 10] }] }] };
  } else if (status === 'out') {
    baseMatch.stockQuantity = 0;
  }

  const [inventoryData, summary] = await Promise.all([
    Product.aggregate([
      { $match: baseMatch },
      { $project: {
        name: 1, barcode: 1, unit: 1,
        category: { $ifNull: ['$category', 'N/A'] },
        stockQuantity: 1, cost: 1, price: 1,
        stockValue: { $multiply: ['$stockQuantity', { $ifNull: ['$cost', 0] }] },
        potentialRevenue: { $multiply: ['$stockQuantity', { $ifNull: ['$price', 0] }] },
        status: { $cond: [{ $eq: ['$stockQuantity', 0] }, 'Out of Stock', { $cond: [{ $lte: ['$stockQuantity', 10] }, 'Low Stock', 'In Stock'] }] },
      } },
      { $sort: { stockQuantity: 1 } },
    ]),
    Product.aggregate([
      { $match: { ...scope } },
      { $group: {
        _id: null,
        totalProducts: { $sum: 1 },
        totalStockQuantity: { $sum: '$stockQuantity' },
        totalStockValue: { $sum: { $multiply: ['$stockQuantity', { $ifNull: ['$cost', 0] }] } },
        lowStockCount: { $sum: { $cond: [{ $and: [{ $gt: ['$stockQuantity', 0] }, { $lte: ['$stockQuantity', 10] }] }, 1, 0] } },
        outOfStockCount: { $sum: { $cond: [{ $eq: ['$stockQuantity', 0] }, 1, 0] } },
      } },
    ]),
  ]);

  res.status(httpStatus.OK).send({ data: inventoryData, summary: summary[0] || {} });
});

/* ── Tax ────────────────────────────────────────────────────────────────────── */
const getTaxReport = catchAsync(async (req, res) => {
  const scope = buildScope(req);
  const { start, end } = parseRange(req.query);

  const baseMatch = { ...scope, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } };

  const [taxData, summary] = await Promise.all([
    Invoice.aggregate([
      { $match: baseMatch },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$invoiceDate' } }, totalSales: { $sum: '$total' }, totalTax: { $sum: { $ifNull: ['$taxAmount', 0] } }, invoiceCount: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Invoice.aggregate([
      { $match: baseMatch },
      { $group: { _id: null, totalTaxCollected: { $sum: { $ifNull: ['$taxAmount', 0] } }, totalSales: { $sum: '$total' }, invoiceCount: { $sum: 1 } } },
    ]),
  ]);

  res.status(httpStatus.OK).send({ data: taxData, summary: summary[0] || {}, period: { startDate: start, endDate: end } });
});

/* ── ROI ─────────────────────────────────────────────────────────────────── */

/**
 * Parse the from/to query params used by the ROI endpoints.
 * Defaults to last 12 months when not provided.
 */
const parseRoiRange = (query) => {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from
    ? new Date(query.from)
    : new Date(to.getTime() - 365 * 24 * 60 * 60 * 1000);
  return { from, to };
};

/**
 * Aggregate a single sum from a collection within the date range.
 * @param {mongoose.Model} Model
 * @param {object} scope  - org/branch filter
 * @param {object} dateFilter - e.g. { invoiceDate: { $gte, $lte } }
 * @param {object} extraMatch - additional match conditions
 * @param {string} field  - the dollar-prefixed field to sum
 */
const aggregateSum = async (Model, match, field) => {
  const result = await Model.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: field } } },
  ]);
  return result[0]?.total || 0;
};

const getRoiReport = catchAsync(async (req, res) => {
  const scope = buildScope(req);
  const { from, to } = parseRoiRange(req.query);

  // ── Investment aggregations ──────────────────────────────────────────────
  const [
    totalExpenses,
    currentInventoryValue,
    currentWalletBalance,
  ] = await Promise.all([
    aggregateSum(Expense, { ...scope, date: { $gte: from, $lte: to } }, '$amount'),
    // Real-time inventory value: current stock quantity × cost (already reflects all purchases/sales/returns)
    (async () => {
      const result = await Product.aggregate([
        { $match: { ...scope } },
        { $group: { _id: null, total: { $sum: { $multiply: ['$stockQuantity', { $ifNull: ['$cost', 0] }] } } } },
      ]);
      return result[0]?.total || 0;
    })(),
    // Current digital wallet balances (JazzCash, EasyPaisa, etc.)
    (async () => {
      const result = await Wallet.aggregate([
        { $match: { ...scope, isActive: true } },
        { $group: { _id: null, total: { $sum: '$balance' } } },
      ]);
      return result[0]?.total || 0;
    })(),
  ]);

  // ── Profit aggregations ──────────────────────────────────────────────────
  const [
    salesProfit,
    loadProfit,
    repairProfit,
    billPaymentProfit,
    salesReturnsImpact,
    purchaseReturnsRecovery,
  ] = await Promise.all([
    // Sales profit = sum of invoice-level totalProfit field
    aggregateSum(
      Invoice,
      { ...scope, invoiceDate: { $gte: from, $lte: to }, status: { $ne: 'cancelled' } },
      { $ifNull: ['$totalProfit', 0] }
    ),
    // Load profit = commission + extra charges earned on transactions
    aggregateSum(LoadTransaction, { ...scope, date: { $gte: from, $lte: to } }, { $ifNull: ['$profit', 0] }),
    // Repair profit = charges collected minus parts cost
    (async () => {
      const result = await RepairJob.aggregate([
        { $match: { ...scope, date: { $gte: from, $lte: to }, status: { $in: ['completed', 'delivered'] } } },
        { $group: { _id: null, total: { $sum: { $subtract: ['$charges', { $ifNull: ['$cost', 0] }] } } } },
      ]);
      return result[0]?.total || 0;
    })(),
    // Bill payment profit = service charge earned
    aggregateSum(BillPayment, { ...scope, createdAt: { $gte: from, $lte: to } }, { $ifNull: ['$serviceCharge', 0] }),
    // Sales returns reduce profit (customers returned goods)
    aggregateSum(
      SalesReturn,
      { ...scope, date: { $gte: from, $lte: to }, status: { $ne: 'rejected' } },
      '$totalAmount'
    ),
    // Purchase returns recover some investment cost
    aggregateSum(
      PurchaseReturn,
      { ...scope, createdAt: { $gte: from, $lte: to } },
      '$totalAmount'
    ),
  ]);

  // investment = real-time inventory value + current wallet balances + period expenses
  const investment = currentInventoryValue + currentWalletBalance + totalExpenses;
  const grossProfit = salesProfit + loadProfit + repairProfit + billPaymentProfit;
  const profit = grossProfit - totalExpenses - salesReturnsImpact;
  const roi = investment > 0 ? parseFloat(((profit / investment) * 100).toFixed(2)) : 0;

  res.status(httpStatus.OK).send({
    investment: parseFloat(investment.toFixed(2)),
    inventoryValue: parseFloat(currentInventoryValue.toFixed(2)),
    walletBalance: parseFloat(currentWalletBalance.toFixed(2)),
    profit: parseFloat(profit.toFixed(2)),
    roi,
    breakdown: {
      investment: {
        inventoryValue: parseFloat(currentInventoryValue.toFixed(2)),
        walletBalance: parseFloat(currentWalletBalance.toFixed(2)),
        expenses: parseFloat(totalExpenses.toFixed(2)),
        purchaseReturnsRecovery: parseFloat(purchaseReturnsRecovery.toFixed(2)),
      },
      profit: {
        salesProfit: parseFloat(salesProfit.toFixed(2)),
        loadProfit: parseFloat(loadProfit.toFixed(2)),
        repairProfit: parseFloat(repairProfit.toFixed(2)),
        billPaymentProfit: parseFloat(billPaymentProfit.toFixed(2)),
        expenseDeduction: parseFloat(totalExpenses.toFixed(2)),
        salesReturnsImpact: parseFloat(salesReturnsImpact.toFixed(2)),
      },
    },
    period: { from, to },
  });
});

const getMonthlyRoi = catchAsync(async (req, res) => {
  const scope = buildScope(req);
  const { from, to } = parseRoiRange(req.query);

  const monthFormat = { $dateToString: { format: '%Y-%m', date: '$$date' } };

  // Helper: group-by-month aggregate
  const monthlySum = async (Model, dateField, valueExpr, extraMatch = {}) => {
    const results = await Model.aggregate([
      { $match: { ...scope, [dateField]: { $gte: from, $lte: to }, ...extraMatch } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: `$${dateField}` } },
          total: { $sum: valueExpr },
        },
      },
    ]);
    return results.reduce((acc, r) => { acc[r._id] = r.total || 0; return acc; }, {});
  };

  const [
    purchasesByMonth,
    loadPurchasesByMonth,
    expensesByMonth,
    salesProfitByMonth,
    loadProfitByMonth,
    salesReturnsByMonth,
    repairProfitByMonth,
    billPaymentProfitByMonth,
    purchaseReturnsByMonth,
  ] = await Promise.all([
    monthlySum(Purchase, 'purchaseDate', '$totalAmount'),
    monthlySum(LoadPurchase, 'date', '$amount'),
    monthlySum(Expense, 'date', '$amount'),
    monthlySum(Invoice, 'invoiceDate', { $ifNull: ['$totalProfit', 0] }, { status: { $ne: 'cancelled' } }),
    monthlySum(LoadTransaction, 'date', { $ifNull: ['$profit', 0] }),
    monthlySum(SalesReturn, 'date', '$totalAmount', { status: { $ne: 'rejected' } }),
    (async () => {
      const results = await RepairJob.aggregate([
        { $match: { ...scope, date: { $gte: from, $lte: to }, status: { $in: ['completed', 'delivered'] } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$date' } },
            total: { $sum: { $subtract: ['$charges', { $ifNull: ['$cost', 0] }] } },
          },
        },
      ]);
      return results.reduce((acc, r) => { acc[r._id] = r.total || 0; return acc; }, {});
    })(),
    (async () => {
      const results = await BillPayment.aggregate([
        { $match: { ...scope, createdAt: { $gte: from, $lte: to } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            total: { $sum: { $ifNull: ['$serviceCharge', 0] } },
          },
        },
      ]);
      return results.reduce((acc, r) => { acc[r._id] = r.total || 0; return acc; }, {});
    })(),
    (async () => {
      const results = await PurchaseReturn.aggregate([
        { $match: { ...scope, createdAt: { $gte: from, $lte: to } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            total: { $sum: '$totalAmount' },
          },
        },
      ]);
      return results.reduce((acc, r) => { acc[r._id] = r.total || 0; return acc; }, {});
    })(),
  ]);

  // Build sorted list of all months present in the range
  const allMonths = new Set([
    ...Object.keys(purchasesByMonth),
    ...Object.keys(loadPurchasesByMonth),
    ...Object.keys(expensesByMonth),
    ...Object.keys(salesProfitByMonth),
    ...Object.keys(loadProfitByMonth),
    ...Object.keys(salesReturnsByMonth),
    ...Object.keys(repairProfitByMonth),
    ...Object.keys(billPaymentProfitByMonth),
    ...Object.keys(purchaseReturnsByMonth),
  ]);

  const monthly = Array.from(allMonths).sort().map((month) => {
    const inv = (purchasesByMonth[month] || 0)
      + (loadPurchasesByMonth[month] || 0)
      + (expensesByMonth[month] || 0)
      - (purchaseReturnsByMonth[month] || 0);
    const gross = (salesProfitByMonth[month] || 0)
      + (loadProfitByMonth[month] || 0)
      + (repairProfitByMonth[month] || 0)
      + (billPaymentProfitByMonth[month] || 0);
    const pft = gross - (expensesByMonth[month] || 0) - (salesReturnsByMonth[month] || 0);
    const roi = inv > 0 ? parseFloat(((pft / inv) * 100).toFixed(2)) : 0;
    return { month, investment: parseFloat(inv.toFixed(2)), profit: parseFloat(pft.toFixed(2)), roi };
  });

  res.status(httpStatus.OK).send({ monthly, period: { from, to } });
});

/* ── Full Profit & Loss (all modules) ───────────────────────────────────────── */
const getProfitLossFullReport = catchAsync(async (req, res) => {
  const scope = buildScope(req);
  const { from, to } = parseRoiRange(req.query);

  const [
    invoiceAgg,
    salesReturnsAgg,
    purchaseReturnsAgg,
    loadProfitAgg,
    repairAgg,
    billPaymentAgg,
    expenseAgg,
    purchaseAgg,
    stockAgg,
    walletAgg,
  ] = await Promise.all([
    // Revenue + COGS from invoices
    Invoice.aggregate([
      { $match: { ...scope, invoiceDate: { $gte: from, $lte: to }, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, totalRevenue: { $sum: '$total' }, totalCost: { $sum: { $ifNull: ['$totalCost', 0] } }, salesProfit: { $sum: { $ifNull: ['$totalProfit', 0] } } } },
    ]),
    // Sales returns impact
    SalesReturn.aggregate([
      { $match: { ...scope, date: { $gte: from, $lte: to }, status: { $ne: 'rejected' } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
    ]),
    // Purchase returns recovery
    PurchaseReturn.aggregate([
      { $match: { ...scope, createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
    ]),
    // Load transaction profit
    LoadTransaction.aggregate([
      { $match: { ...scope, date: { $gte: from, $lte: to } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$profit', 0] } } } },
    ]),
    // Repair profit = charges - cost
    RepairJob.aggregate([
      { $match: { ...scope, date: { $gte: from, $lte: to }, status: { $in: ['completed', 'delivered'] } } },
      { $group: { _id: null, charges: { $sum: '$charges' }, cost: { $sum: { $ifNull: ['$cost', 0] } } } },
    ]),
    // Bill payment profit = service charge
    BillPayment.aggregate([
      { $match: { ...scope, createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$serviceCharge', 0] } } } },
    ]),
    // Expenses
    Expense.aggregate([
      { $match: { ...scope, date: { $gte: from, $lte: to } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    // Total Purchases (informational only — not in investment formula)
    Purchase.aggregate([
      { $match: { ...scope, purchaseDate: { $gte: from, $lte: to } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]),
    // Real-time inventory value: current stock × cost
    Product.aggregate([
      { $match: { ...scope } },
      { $group: { _id: null, total: { $sum: { $multiply: ['$stockQuantity', { $ifNull: ['$cost', 0] }] } } } },
    ]),
    // Current digital wallet balances (JazzCash, EasyPaisa, etc.)
    Wallet.aggregate([
      { $match: { ...scope, isActive: true } },
      { $group: { _id: null, total: { $sum: '$balance' } } },
    ]),
  ]);

  const inv     = invoiceAgg[0]        || { totalRevenue: 0, totalCost: 0, salesProfit: 0 };
  const sr      = salesReturnsAgg[0]   || { total: 0, count: 0 };
  const pr      = purchaseReturnsAgg[0]|| { total: 0, count: 0 };
  const ld      = loadProfitAgg[0]     || { total: 0 };
  const rep     = repairAgg[0]         || { charges: 0, cost: 0 };
  const bill    = billPaymentAgg[0]    || { total: 0 };
  const exp     = expenseAgg[0]        || { total: 0 };
  const pur     = purchaseAgg[0]       || { total: 0 };
  const currentInventoryValue = stockAgg[0]?.total  || 0;
  const currentWalletBalance  = walletAgg[0]?.total || 0;

  const totalRevenue      = inv.totalRevenue;
  const salesReturns      = sr.total;
  const netRevenue        = totalRevenue - salesReturns;
  const costOfGoodsSold   = inv.totalCost;
  const grossProfit       = netRevenue - costOfGoodsSold;

  const loadProfit        = ld.total;
  const repairProfit      = rep.charges - rep.cost;
  const billProfit        = bill.total;
  const purchaseReturns   = pr.total;
  const expenses          = exp.total;

  const netProfit = grossProfit + loadProfit + repairProfit + billProfit - expenses;

  // investment = real-time inventory value + current wallet balances + period expenses
  const investment = currentInventoryValue + currentWalletBalance + expenses;
  const roi        = investment > 0 ? parseFloat(((netProfit / investment) * 100).toFixed(2)) : 0;

  const grossProfitMargin = netRevenue > 0 ? parseFloat(((grossProfit / netRevenue) * 100).toFixed(2)) : 0;
  const netProfitMargin   = netRevenue > 0 ? parseFloat(((netProfit  / netRevenue) * 100).toFixed(2)) : 0;

  res.status(httpStatus.OK).send({
    revenue: {
      totalRevenue:       parseFloat(totalRevenue.toFixed(2)),
      salesReturns:       parseFloat(salesReturns.toFixed(2)),
      salesReturnsCount:  sr.count,
      netRevenue:         parseFloat(netRevenue.toFixed(2)),
      costOfGoodsSold:    parseFloat(costOfGoodsSold.toFixed(2)),
      grossProfit:        parseFloat(grossProfit.toFixed(2)),
      grossProfitMargin,
    },
    additionalProfits: {
      loadProfit:         parseFloat(loadProfit.toFixed(2)),
      repairProfit:       parseFloat(repairProfit.toFixed(2)),
      billProfit:         parseFloat(billProfit.toFixed(2)),
    },
    adjustments: {
      purchaseReturns:       parseFloat(purchaseReturns.toFixed(2)),
      purchaseReturnsCount:  pr.count,
    },
    expenses:   parseFloat(expenses.toFixed(2)),
    netProfit:  parseFloat(netProfit.toFixed(2)),
    netProfitMargin,
    roi,
    investment:     parseFloat(investment.toFixed(2)),
    inventoryValue: parseFloat(currentInventoryValue.toFixed(2)),
    walletBalance:  parseFloat(currentWalletBalance.toFixed(2)),
    period: { from, to },
  });
});

module.exports = {
  getSalesReport, getPurchaseReport, getProductReport, getProductDetailReport,
  getCustomerReport, getSupplierReport, getExpenseReport,
  getProfitLossReport, getProfitLossFullReport, getInventoryReport, getTaxReport,
  getSalesReturnsReport, getPurchaseReturnsReport,
  getLoadReport, getRepairReport,
  getRoiReport, getMonthlyRoi,
};

/* ── Sales Returns Report ───────────────────────────────────────────────────── */
async function getSalesReturnsReport(req, res) {
  const scope = buildScope(req);
  const { start, end } = parseRange(req.query);
  const { customerId, productId } = req.query;

  const baseMatch = { ...scope, date: { $gte: start, $lte: end }, status: { $ne: 'rejected' } };
  if (customerId && mongoose.Types.ObjectId.isValid(customerId)) {
    baseMatch.customerId = new mongoose.Types.ObjectId(customerId);
  }

  const [datewise, summary, productwise] = await Promise.all([
    // Date-wise totals
    SalesReturn.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          totalAmount: { $sum: '$totalAmount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    // Overall summary
    SalesReturn.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: null,
          totalReturnsAmount: { $sum: '$totalAmount' },
          totalReturns: { $sum: 1 },
          totalItemsReturned: { $sum: { $sum: '$items.quantity' } },
        },
      },
    ]),

    // Product-wise breakdown
    SalesReturn.aggregate([
      { $match: baseMatch },
      { $unwind: '$items' },
      ...(productId && mongoose.Types.ObjectId.isValid(productId)
        ? [{ $match: { 'items.productId': new mongoose.Types.ObjectId(productId) } }]
        : []),
      {
        $group: {
          _id: '$items.productId',
          productName: { $first: '$items.name' },
          totalQty: { $sum: '$items.quantity' },
          totalValue: { $sum: '$items.total' },
          returnCount: { $sum: 1 },
        },
      },
      { $sort: { totalValue: -1 } },
      { $limit: 50 },
    ]),
  ]);

  res.status(httpStatus.OK).send({
    summary: summary[0] || { totalReturnsAmount: 0, totalReturns: 0, totalItemsReturned: 0 },
    datewise,
    productwise,
    period: { startDate: start, endDate: end },
  });
}

/* ── Purchase Returns Report ────────────────────────────────────────────────── */
async function getPurchaseReturnsReport(req, res) {
  const scope = buildScope(req);
  const { start, end } = parseRange(req.query);
  const { supplierId, productId } = req.query;

  const baseMatch = { ...scope, date: { $gte: start, $lte: end }, status: { $ne: 'rejected' } };
  if (supplierId && mongoose.Types.ObjectId.isValid(supplierId)) {
    baseMatch.supplierId = new mongoose.Types.ObjectId(supplierId);
  }

  const [datewise, summary, productwise] = await Promise.all([
    // Date-wise totals
    PurchaseReturn.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          totalAmount: { $sum: '$totalAmount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    // Overall summary
    PurchaseReturn.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: null,
          totalReturnsAmount: { $sum: '$totalAmount' },
          totalReturns: { $sum: 1 },
          totalItemsReturned: { $sum: { $sum: '$items.quantity' } },
        },
      },
    ]),

    // Product-wise breakdown
    PurchaseReturn.aggregate([
      { $match: baseMatch },
      { $unwind: '$items' },
      ...(productId && mongoose.Types.ObjectId.isValid(productId)
        ? [{ $match: { 'items.productId': new mongoose.Types.ObjectId(productId) } }]
        : []),
      {
        $group: {
          _id: '$items.productId',
          productName: { $first: '$items.name' },
          totalQty: { $sum: '$items.quantity' },
          totalValue: { $sum: '$items.total' },
          returnCount: { $sum: 1 },
        },
      },
      { $sort: { totalValue: -1 } },
      { $limit: 50 },
    ]),
  ]);

  res.status(httpStatus.OK).send({
    summary: summary[0] || { totalReturnsAmount: 0, totalReturns: 0, totalItemsReturned: 0 },
    datewise,
    productwise,
    period: { startDate: start, endDate: end },
  });
}

/* ── Load Management Report ─────────────────────────────────────────────────── */
async function getLoadReport(req, res) {
  const scope = buildScope(req);
  const { start, end } = parseRange(req.query);
  const { walletType } = req.query;

  const txMatch = { ...scope, date: { $gte: start, $lte: end } };
  const purchaseMatch = { ...scope, date: { $gte: start, $lte: end } };
  const withdrawalMatch = { ...scope, date: { $gte: start, $lte: end } };
  if (walletType) { txMatch.walletType = walletType; purchaseMatch.walletType = walletType; withdrawalMatch.walletType = walletType; }

  const [summary, byWallet, datewise, purchases, wallets, withdrawalSummary, withdrawalDatewise] = await Promise.all([
    LoadTransaction.aggregate([
      { $match: txMatch },
      { $group: { _id: null, totalTransactions: { $sum: 1 }, totalSold: { $sum: '$amount' }, totalProfit: { $sum: '$profit' }, totalExtraCharges: { $sum: { $ifNull: ['$extraCharge', 0] } } } },
    ]),
    LoadTransaction.aggregate([
      { $match: txMatch },
      { $group: { _id: '$walletType', transactions: { $sum: 1 }, totalSold: { $sum: '$amount' }, totalProfit: { $sum: '$profit' } } },
      { $sort: { totalSold: -1 } },
    ]),
    LoadTransaction.aggregate([
      { $match: txMatch },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, transactions: { $sum: 1 }, totalSold: { $sum: '$amount' }, totalProfit: { $sum: '$profit' } } },
      { $sort: { _id: 1 } },
    ]),
    LoadPurchase.aggregate([
      { $match: purchaseMatch },
      { $group: { _id: '$walletType', totalPurchased: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { totalPurchased: -1 } },
    ]),
    Wallet.find(scope).lean(),
    CashWithdrawal.aggregate([
      { $match: withdrawalMatch },
      { $group: {
        _id: null,
        totalCount: { $sum: 1 },
        totalWithdrawals: { $sum: { $cond: [{ $eq: ['$transactionType', 'withdrawal'] }, 1, 0] } },
        totalDeposits: { $sum: { $cond: [{ $eq: ['$transactionType', 'deposit'] }, 1, 0] } },
        totalWithdrawalAmount: { $sum: { $cond: [{ $eq: ['$transactionType', 'withdrawal'] }, '$amount', 0] } },
        totalDepositAmount: { $sum: { $cond: [{ $eq: ['$transactionType', 'deposit'] }, '$amount', 0] } },
        totalProfit: { $sum: '$profit' },
      } },
    ]),
    CashWithdrawal.aggregate([
      { $match: withdrawalMatch },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
        count: { $sum: 1 },
        totalWithdrawalAmount: { $sum: { $cond: [{ $eq: ['$transactionType', 'withdrawal'] }, '$amount', 0] } },
        totalDepositAmount: { $sum: { $cond: [{ $eq: ['$transactionType', 'deposit'] }, '$amount', 0] } },
        totalProfit: { $sum: '$profit' },
      } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const totalPurchased = purchases.reduce((s, p) => s + p.totalPurchased, 0);
  const sm = summary[0] || { totalTransactions: 0, totalSold: 0, totalProfit: 0, totalExtraCharges: 0 };
  const ws = withdrawalSummary[0] || { totalCount: 0, totalWithdrawals: 0, totalDeposits: 0, totalWithdrawalAmount: 0, totalDepositAmount: 0, totalProfit: 0 };
  res.status(httpStatus.OK).send({
    summary: { ...sm, totalPurchased, netBalance: totalPurchased - sm.totalSold },
    byWallet, datewise, purchases, wallets,
    withdrawalSummary: ws,
    withdrawalDatewise,
    period: { startDate: start, endDate: end },
  });
}

/* ── Repair Report ──────────────────────────────────────────────────────────── */
async function getRepairReport(req, res) {
  const scope = buildScope(req);
  const { start, end } = parseRange(req.query);
  const { status } = req.query;

  const baseMatch = { ...scope, date: { $gte: start, $lte: end } };
  if (status) baseMatch.status = status;

  const [summary, byStatus, datewise, byTechnician, recentJobs] = await Promise.all([
    RepairJob.aggregate([
      { $match: baseMatch },
      { $group: { _id: null, totalJobs: { $sum: 1 }, totalRevenue: { $sum: '$charges' }, totalCost: { $sum: { $ifNull: ['$cost', 0] } }, totalProfit: { $sum: { $subtract: ['$charges', { $ifNull: ['$cost', 0] }] } }, totalAdvance: { $sum: { $ifNull: ['$advanceAmount', 0] } }, completedJobs: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }, deliveredJobs: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } }, pendingJobs: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } } } },
    ]),
    RepairJob.aggregate([
      { $match: { ...scope, date: { $gte: start, $lte: end } } },
      { $group: { _id: '$status', count: { $sum: 1 }, revenue: { $sum: '$charges' }, cost: { $sum: { $ifNull: ['$cost', 0] } } } },
    ]),
    RepairJob.aggregate([
      { $match: baseMatch },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, jobs: { $sum: 1 }, revenue: { $sum: '$charges' }, cost: { $sum: { $ifNull: ['$cost', 0] } }, profit: { $sum: { $subtract: ['$charges', { $ifNull: ['$cost', 0] }] } } } },
      { $sort: { _id: 1 } },
    ]),
    RepairJob.aggregate([
      { $match: { ...baseMatch, technician: { $exists: true, $ne: '' } } },
      { $group: { _id: '$technician', jobs: { $sum: 1 }, revenue: { $sum: '$charges' }, cost: { $sum: { $ifNull: ['$cost', 0] } }, profit: { $sum: { $subtract: ['$charges', { $ifNull: ['$cost', 0] }] } } } },
      { $sort: { profit: -1 } },
    ]),
    RepairJob.find(baseMatch).sort({ date: -1 }).limit(20).lean(),
  ]);

  res.status(httpStatus.OK).send({
    summary: summary[0] || { totalJobs: 0, totalRevenue: 0, totalCost: 0, totalProfit: 0, totalAdvance: 0, completedJobs: 0, deliveredJobs: 0, pendingJobs: 0 },
    byStatus, datewise, byTechnician, recentJobs,
    period: { startDate: start, endDate: end },
  });
}
