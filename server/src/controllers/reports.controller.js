const httpStatus = require('http-status');
const mongoose = require('mongoose');
const catchAsync = require('../utils/catchAsync');
const { Invoice, Product, Customer, Purchase, Supplier, Expense } = require('../models');

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

  const [revenueData, expenseData] = await Promise.all([
    Invoice.aggregate([
      { $match: { ...scope, invoiceDate: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, totalRevenue: { $sum: '$total' }, totalCost: { $sum: { $ifNull: ['$totalCost', 0] } }, grossProfit: { $sum: { $ifNull: ['$totalProfit', 0] } } } },
    ]),
    Expense.aggregate([
      { $match: { ...scope, date: { $gte: start, $lte: end } } },
      { $group: { _id: null, totalExpenses: { $sum: '$amount' } } },
    ]),
  ]);

  const rev = revenueData[0] || { totalRevenue: 0, totalCost: 0, grossProfit: 0 };
  const exp = expenseData[0] || { totalExpenses: 0 };
  const grossProfit = rev.grossProfit || (rev.totalRevenue - rev.totalCost);
  const netProfit = grossProfit - exp.totalExpenses;

  res.status(httpStatus.OK).send({
    revenue: { totalRevenue: rev.totalRevenue, costOfGoodsSold: rev.totalCost, grossProfit, grossProfitMargin: rev.totalRevenue > 0 ? (grossProfit / rev.totalRevenue) * 100 : 0 },
    expenses: { totalExpenses: exp.totalExpenses },
    netProfit: { amount: netProfit, margin: rev.totalRevenue > 0 ? (netProfit / rev.totalRevenue) * 100 : 0 },
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

module.exports = {
  getSalesReport, getPurchaseReport, getProductReport, getProductDetailReport,
  getCustomerReport, getSupplierReport, getExpenseReport,
  getProfitLossReport, getInventoryReport, getTaxReport,
};
