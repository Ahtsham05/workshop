const httpStatus = require('http-status');
const mongoose = require('mongoose');
const catchAsync = require('../utils/catchAsync');
const { Invoice, Product, Customer, Purchase, Supplier, Expense, SalesReturn, PurchaseReturn, LoadTransaction, LoadPurchase, Wallet, RepairJob, ServiceInvoice, CashWithdrawal, BillPayment, SimSale, InstallmentPlan, InstallmentPayment, CustomerLedger, SupplierLedger } = require('../models');
const { normalizeInvoicePayment, normalizePurchasePayment } = require('../utils/invoice-display');

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

/** Wallets whose name contains "load" are load purchase/sale wallets (same rule as mobile-shop UI). */
const isLoadWalletName = (name) => /load/i.test(String(name || ''));

const { parseBusinessDateBoundary: parseDateBoundary } = require('../utils/businessTimezone');

const parseRange = (query) => {
  const end = parseDateBoundary(query.endDate, true) || new Date();
  const start =
    parseDateBoundary(query.startDate, false) ||
    new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

  return { start, end };
};

/* ── Sales Invoice Details ──────────────────────────────────────────────────── */
const getSalesInvoiceDetails = catchAsync(async (req, res) => {
  const scope = buildScope(req);
  const { start, end } = parseRange(req.query);

  const invoices = await Invoice.aggregate([
    {
      $match: {
        ...scope,
        invoiceDate: { $gte: start, $lte: end },
        status: { $ne: 'cancelled' },
      },
    },
    {
      $lookup: {
        from: 'customers',
        let: { cid: '$customerId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$_id', '$$cid'] },
                  { $ne: ['$$cid', null] },
                ],
              },
            },
          },
          { $project: { name: 1, phone: 1, nameUrdu: 1 } },
        ],
        as: 'customerDoc',
      },
    },
    { $unwind: { path: '$customerDoc', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        invoiceNumber: 1,
        invoiceDate: 1,
        type: 1,
        status: 1,
        total: 1,
        paidAmount: 1,
        balance: 1,
        customerName: {
          $ifNull: [
            '$walkInCustomerName',
            { $ifNull: ['$customerDoc.name', { $ifNull: ['$customerName', 'Walk-in'] }] },
          ],
        },
        customerNameUrdu: { $ifNull: ['$customerDoc.nameUrdu', ''] },
        customerPhone: { $ifNull: ['$customerDoc.phone', ''] },
        items: {
          $map: {
            input: '$items',
            as: 'item',
            in: {
              name: '$$item.name',
              nameUrdu: { $ifNull: ['$$item.nameUrdu', ''] },
              quantity: '$$item.quantity',
              unitPrice: '$$item.unitPrice',
              subtotal: '$$item.subtotal',
            },
          },
        },
      },
    },
    // Normalize cash vs credit: cash is always fully paid in UI/reports; credit shows unpaid until settled
    { $addFields: { _origPaid: { $ifNull: ['$paidAmount', 0] } } },
    {
      $addFields: {
        paidAmount: {
          $cond: [
            { $eq: ['$type', 'cash'] },
            '$total',
            { $min: ['$_origPaid', '$total'] },
          ],
        },
        balance: {
          $cond: [
            { $eq: ['$type', 'cash'] },
            0,
            {
              $max: [
                0,
                {
                  $subtract: [
                    '$total',
                    { $min: ['$_origPaid', '$total'] },
                  ],
                },
              ],
            },
          ],
        },
        status: {
          $cond: [
            { $eq: ['$type', 'cash'] },
            'paid',
            {
              $cond: [
                { $gte: [{ $min: ['$_origPaid', '$total'] }, '$total'] },
                'paid',
                'unpaid',
              ],
            },
          ],
        },
      },
    },
    { $unset: '_origPaid' },
    { $sort: { invoiceDate: 1, invoiceNumber: 1 } },
  ]);

  const totalSales = invoices.reduce((s, inv) => s + (inv.total || 0), 0);
  const totalItems = invoices.reduce(
    (s, inv) => s + inv.items.reduce((is, item) => is + (item.quantity || 0), 0),
    0,
  );

  res.status(httpStatus.OK).send({
    invoices,
    summary: { totalSales, totalInvoices: invoices.length, totalItems },
    period: { startDate: start, endDate: end },
  });
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
          supplierNameUrdu: { $first: { $ifNull: ['$supplierDetails.nameUrdu', ''] } },
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
          uniqueSuppliers: { $addToSet: '$supplier' },
          purchaseCount: { $sum: 1 },
          avgPurchaseValue: { $avg: '$totalAmount' },
        },
      },
      {
        $project: {
          totalPurchases: 1,
          totalPaid: 1,
          totalBalance: 1,
          totalCashPaid: 1,
          totalCreditBalance: 1,
          uniqueSuppliers: { $size: '$uniqueSuppliers' },
          purchaseCount: 1,
          avgPurchaseValue: 1,
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

/* ── Purchase Invoice Details ──────────────────────────────────────────────── */
const getPurchaseInvoiceDetails = catchAsync(async (req, res) => {
  const scope = buildScope(req);
  const { start, end } = parseRange(req.query);

  const purchases = await Purchase.aggregate([
    { $match: { ...scope, purchaseDate: { $gte: start, $lte: end } } },
    {
      $lookup: {
        from: 'suppliers',
        let: { sid: '$supplier' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$sid'] } } },
          { $project: { name: 1, phone: 1, nameUrdu: 1 } },
        ],
        as: 'supplierDoc',
      },
    },
    { $unwind: { path: '$supplierDoc', preserveNullAndEmptyArrays: true } },
    { $unwind: { path: '$items', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'products',
        let: { pid: '$items.product' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$pid'] } } },
          { $project: { name: 1, nameUrdu: 1 } },
        ],
        as: 'productDoc',
      },
    },
    { $unwind: { path: '$productDoc', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$_id',
        invoiceNumber: { $first: '$invoiceNumber' },
        purchaseDate: { $first: '$purchaseDate' },
        paymentType: { $first: '$paymentType' },
        totalAmount: { $first: '$totalAmount' },
        paidAmount: { $first: { $ifNull: ['$paidAmount', 0] } },
        balance: { $first: { $ifNull: ['$balance', 0] } },
        supplierName: { $first: { $ifNull: ['$supplierDoc.name', 'Unknown'] } },
        supplierNameUrdu: { $first: { $ifNull: ['$supplierDoc.nameUrdu', ''] } },
        supplierPhone: { $first: { $ifNull: ['$supplierDoc.phone', ''] } },
        items: {
          $push: {
            $cond: [
              { $ifNull: ['$items', false] },
              {
                name: { $ifNull: ['$productDoc.name', 'Unknown'] },
                nameUrdu: { $ifNull: ['$productDoc.nameUrdu', ''] },
                quantity: { $ifNull: ['$items.quantity', 0] },
                unit: { $ifNull: ['$items.unit', ''] },
                unitPrice: { $ifNull: ['$items.priceAtPurchase', 0] },
                subtotal: { $ifNull: ['$items.total', 0] },
              },
              '$$REMOVE',
            ],
          },
        },
      },
    },
    {
      $addFields: {
        effectivePaid: {
          $cond: [{ $eq: ['$paymentType', 'Cash'] }, '$totalAmount', { $min: ['$paidAmount', '$totalAmount'] }],
        },
        effectiveBalance: {
          $cond: [
            { $eq: ['$paymentType', 'Cash'] },
            0,
            { $max: [0, { $subtract: ['$totalAmount', { $min: ['$paidAmount', '$totalAmount'] }] }] },
          ],
        },
      },
    },
    {
      $addFields: {
        status: {
          $cond: [{ $gte: ['$effectivePaid', '$totalAmount'] }, 'paid', 'unpaid'],
        },
      },
    },
    {
      $project: {
        invoiceNumber: 1,
        purchaseDate: 1,
        paymentType: 1,
        totalAmount: 1,
        paidAmount: '$effectivePaid',
        balance: '$effectiveBalance',
        status: 1,
        supplierName: 1,
        supplierNameUrdu: 1,
        supplierPhone: 1,
        items: 1,
      },
    },
    { $sort: { purchaseDate: 1, invoiceNumber: 1 } },
  ]);

  const totalPurchases = purchases.reduce((s, p) => s + (p.totalAmount || 0), 0);
  const totalItems = purchases.reduce(
    (s, p) => s + (p.items || []).reduce((is, item) => is + (item.quantity || 0), 0),
    0
  );

  res.status(httpStatus.OK).send({
    purchases,
    summary: { totalPurchases, totalInvoices: purchases.length, totalItems },
    period: { startDate: start, endDate: end },
  });
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
        productNameUrdu: { $first: { $ifNull: ['$product.nameUrdu', '$items.nameUrdu', ''] } },
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
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: [
                  '$_id',
                  {
                    $cond: [
                      { $eq: [{ $type: '$$cid' }, 'objectId'] },
                      '$$cid',
                      {
                        $cond: [
                          {
                            $regexMatch: {
                              input: { $ifNull: ['$$cid', ''] },
                              regex: '^[0-9a-fA-F]{24}$',
                            },
                          },
                          { $toObjectId: '$$cid' },
                          null,
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          },
          { $project: { name: 1, phone: 1, nameUrdu: 1 } },
        ],
        as: 'customerInfo',
      } },
      { $project: {
        invoiceNumber: 1,
        date: '$invoiceDate',
        customerName: { $ifNull: [{ $arrayElemAt: ['$customerInfo.name', 0] }, '$walkInCustomerName', 'Walk-in Customer'] },
        customerNameUrdu: { $ifNull: [{ $arrayElemAt: ['$customerInfo.nameUrdu', 0] }, ''] },
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
        supplierNameUrdu: { $ifNull: [{ $arrayElemAt: ['$supplierInfo.nameUrdu', 0] }, ''] },
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
    product: {
      _id: product._id,
      name: product.name,
      nameUrdu: product.nameUrdu || '',
      barcode: product.barcode,
      currentStock: product.stockQuantity,
      purchasePrice: product.purchasePrice,
      sellingPrice: product.sellingPrice,
      minStockLevel: product.minStockLevel,
    },
    summary, sales: salesData, purchases: purchaseData,
    period: { startDate: start, endDate: end },
  });
});

/* ── Customers ─────────────────────────────────────────────────────────────── */
const getCustomerReport = catchAsync(async (req, res) => {
  const scope = buildScope(req);
  const { start, end } = parseRange(req.query);
  const top = parseInt(req.query.top) || 20;

  const baseMatch = { ...scope, status: { $ne: 'cancelled' } };
  const dateMatch = {
    $or: [
      { invoiceDate: { $gte: start, $lte: end } },
      { invoiceDate: null, createdAt: { $gte: start, $lte: end } },
      { invoiceDate: { $exists: false }, createdAt: { $gte: start, $lte: end } },
    ],
  };
  const customerGroupExpr = {
    $cond: [
      {
        $and: [
          { $ne: ['$customerId', null] },
          { $ne: [{ $type: '$customerId' }, 'missing'] },
        ],
      },
      { $concat: ['id:', { $toString: '$customerId' }] },
      { $concat: ['walkin:', { $ifNull: ['$walkInCustomerName', 'Walk-in Customer'] }] },
    ],
  };

  const [customerData, summary] = await Promise.all([
    Invoice.aggregate([
      { $match: { ...baseMatch, ...dateMatch } },
      { $lookup: {
        from: 'customers',
        let: { cid: '$customerId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $ne: ['$$cid', null] },
                  { $eq: [{ $toString: '$_id' }, { $toString: '$$cid' }] },
                ],
              },
            },
          },
        ],
        as: 'customer',
      } },
      { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
      { $group: {
        _id: customerGroupExpr,
        customerName: { $first: { $ifNull: ['$customer.name', '$walkInCustomerName', 'Walk-in Customer'] } },
        customerNameUrdu: { $first: { $ifNull: ['$customer.nameUrdu', ''] } },
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
      { $match: { ...baseMatch, ...dateMatch } },
      { $group: { _id: null, uniqueCustomers: { $addToSet: customerGroupExpr }, totalTransactions: { $sum: 1 }, totalRevenue: { $sum: '$total' } } },
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
        supplierNameUrdu: { $first: { $ifNull: ['$supplierDetails.nameUrdu', ''] } },
        phone: { $first: '$supplierDetails.phone' },
        email: { $first: '$supplierDetails.email' },
        totalPurchases: { $sum: 1 },
        totalAmount: { $sum: '$totalAmount' },
        totalPaid: { $sum: supEffPaid },
        totalCashPaid: { $sum: { $cond: [{ $eq: ['$paymentType', 'Cash'] }, '$totalAmount', 0] } },
        totalBalance: { $sum: supEffBal },
        avgPurchaseValue: { $avg: '$totalAmount' },
        lastPurchase: { $max: '$purchaseDate' },
      } },
      { $sort: { totalAmount: -1 } },
    ]),
    Purchase.aggregate([
      { $match: baseMatch },
      { $group: {
        _id: null,
        uniqueSuppliers: { $addToSet: '$supplier' },
        totalPurchases: { $sum: '$totalAmount' },
        totalPaid: { $sum: supEffPaid },
        totalCashPaid: { $sum: { $cond: [{ $eq: ['$paymentType', 'Cash'] }, '$totalAmount', 0] } },
        totalBalance: { $sum: supEffBal },
        purchaseCount: { $sum: 1 },
      } },
      { $project: {
        uniqueSuppliers: { $size: '$uniqueSuppliers' },
        totalPurchases: 1,
        totalPaid: 1,
        totalCashPaid: 1,
        totalBalance: 1,
        purchaseCount: 1,
        avgTransactionValue: { $cond: [{ $gt: ['$purchaseCount', 0] }, { $divide: ['$totalPurchases', '$purchaseCount'] }, 0] },
      } },
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

  const [expenseData, categoryBreakdown, summary, categoryExpenses] = await Promise.all([
    Expense.aggregate([
      { $match: baseMatch },
      { $group: { _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, category: '$category' }, totalAmount: { $sum: '$amount' }, expenseCount: { $sum: 1 } } },
      { $sort: { '_id.date': -1 } },
    ]),
    Expense.aggregate([
      { $match: { ...scope, date: { $gte: start, $lte: end } } },
      { $group: { _id: '$category', totalAmount: { $sum: '$amount' }, expenseCount: { $sum: 1 }, avgAmount: { $avg: '$amount' } } },
      { $sort: { totalAmount: -1 } },
    ]),
    Expense.aggregate([
      { $match: baseMatch },
      { $group: { _id: null, totalExpenses: { $sum: '$amount' }, expenseCount: { $sum: 1 }, avgExpense: { $avg: '$amount' }, maxExpense: { $max: '$amount' }, minExpense: { $min: '$amount' } } },
    ]),
    // When a specific category is requested, return individual expense rows for the detail sheet
    category
      ? Expense.find(baseMatch).sort({ date: -1 }).lean()
      : Promise.resolve([]),
  ]);

  res.status(httpStatus.OK).send({
    data: expenseData,
    categoryBreakdown,
    summary: summary[0] || {},
    categoryExpenses,
    period: { startDate: start, endDate: end },
  });
});

/* ── Profit & Loss ─────────────────────────────────────────────────────────── */
const getProfitLossReport = catchAsync(async (req, res) => {
  const scope = buildScope(req);
  const { start, end } = parseRange(req.query);

  const [revenueData, expenseData, salesReturnsData, purchaseReturnsData, serviceData, simSaleData] = await Promise.all([
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
    ServiceInvoice.aggregate([
      { $match: { ...scope, date: { $gte: start, $lte: end } } },
      { $group: { _id: null, totalServiceAmount: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
    ]),
    SimSale.aggregate([
      { $match: { ...scope, date: { $gte: start, $lte: end } } },
      { $group: { _id: null, totalSimSaleAmount: { $sum: '$saleAmount' }, totalSimCost: { $sum: '$purchaseAmount' }, simSaleProfit: { $sum: { $subtract: ['$saleAmount', '$purchaseAmount'] } }, count: { $sum: 1 } } },
    ]),
  ]);

  const rev = revenueData[0] || { totalRevenue: 0, totalCost: 0, grossProfit: 0 };
  const exp = expenseData[0] || { totalExpenses: 0 };
  const sr = salesReturnsData[0] || { totalSalesReturns: 0, count: 0 };
  const pr = purchaseReturnsData[0] || { totalPurchaseReturns: 0, count: 0 };
  const svc = serviceData[0] || { totalServiceAmount: 0, count: 0 };
  const sim = simSaleData[0] || { totalSimSaleAmount: 0, simSaleProfit: 0, count: 0 };

  const netRevenue = rev.totalRevenue - sr.totalSalesReturns;
  const grossProfit = (rev.grossProfit || (rev.totalRevenue - rev.totalCost)) - sr.totalSalesReturns + svc.totalServiceAmount + sim.simSaleProfit;
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
    services: {
      totalServiceAmount: svc.totalServiceAmount,
      totalServiceProfit: svc.totalServiceAmount,
      totalServed: svc.count,
    },
    simSales: {
      totalSimSaleAmount: sim.totalSimSaleAmount,
      totalSimSaleProfit: sim.simSaleProfit,
      totalSimSales: sim.count,
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
        name: 1,
        nameUrdu: { $ifNull: ['$nameUrdu', ''] },
        barcode: 1, unit: 1,
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
  const to = parseDateBoundary(query.to, true) || new Date();
  const from =
    parseDateBoundary(query.from, false) ||
    new Date(to.getTime() - 365 * 24 * 60 * 60 * 1000);
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
      return result[0] ? result[0].total : 0;
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
    serviceProfit,
    simSaleProfit,
    billPaymentProfit,
    billLatePaymentLoss,
    withdrawalProfit,
    depositProfit,
    salesReturnsImpact,
    purchaseReturnsRecovery,
  ] = await Promise.all([
    // Sales profit = sum of invoice-level totalProfit field
    aggregateSum(
      Invoice,
      { ...scope, invoiceDate: { $gte: from, $lte: to }, status: { $ne: 'cancelled' } },
      { $ifNull: ['$totalProfit', 0] }
    ),
    // Load profit = purchase savings only (supplier commission/discount)
    aggregateSum(LoadPurchase, { ...scope, date: { $gte: from, $lte: to } }, { $ifNull: ['$profit', 0] }),
    // Repair profit = charges collected minus parts cost
    (async () => {
      const result = await RepairJob.aggregate([
        { $match: { ...scope, date: { $gte: from, $lte: to }, status: { $in: ['completed', 'delivered'] } } },
        { $group: { _id: null, total: { $sum: { $subtract: ['$charges', { $ifNull: ['$cost', 0] }] } } } },
      ]);
      return result[0]?.total || 0;
    })(),
    aggregateSum(ServiceInvoice, { ...scope, date: { $gte: from, $lte: to } }, { $ifNull: ['$totalAmount', 0] }),
    // SimSale profit = saleAmount - purchaseAmount
    (async () => {
      const result = await SimSale.aggregate([
        { $match: { ...scope, date: { $gte: from, $lte: to } } },
        { $group: { _id: null, total: { $sum: { $subtract: ['$saleAmount', '$purchaseAmount'] } } } },
      ]);
      return result[0]?.total || 0;
    })(),
    // Bill payment profit = service charge earned
    aggregateSum(BillPayment, { ...scope, createdAt: { $gte: from, $lte: to } }, { $ifNull: ['$serviceCharge', 0] }),
    aggregateSum(
      BillPayment,
      { ...scope, createdAt: { $gte: from, $lte: to }, status: 'paid' },
      { $ifNull: ['$latePaymentLoss', 0] }
    ),
    // Cash withdrawal profit
    aggregateSum(CashWithdrawal, { ...scope, date: { $gte: from, $lte: to }, transactionType: 'withdrawal' }, { $ifNull: ['$profit', 0] }),
    // Cash deposit profit
    aggregateSum(CashWithdrawal, { ...scope, date: { $gte: from, $lte: to }, transactionType: 'deposit' }, { $ifNull: ['$profit', 0] }),
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
  const grossProfit = salesProfit + loadProfit + repairProfit + serviceProfit + simSaleProfit + billPaymentProfit - billLatePaymentLoss + withdrawalProfit + depositProfit;
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
        serviceProfit: parseFloat(serviceProfit.toFixed(2)),
        simSaleProfit: parseFloat(simSaleProfit.toFixed(2)),
        billPaymentProfit: parseFloat(billPaymentProfit.toFixed(2)),
        billLatePaymentLoss: parseFloat(billLatePaymentLoss.toFixed(2)),
        billPaymentNetProfit: parseFloat((billPaymentProfit - billLatePaymentLoss).toFixed(2)),
        withdrawalProfit: parseFloat(withdrawalProfit.toFixed(2)),
        depositProfit: parseFloat(depositProfit.toFixed(2)),
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
    serviceProfitByMonth,
    simSaleProfitByMonth,
    billPaymentProfitByMonth,
    billPaymentLateLossByMonth,
    withdrawalProfitByMonth,
    depositProfitByMonth,
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
    monthlySum(ServiceInvoice, 'date', { $ifNull: ['$totalAmount', 0] }),
    (async () => {
      const results = await SimSale.aggregate([
        { $match: { ...scope, date: { $gte: from, $lte: to } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$date' } },
            total: { $sum: { $subtract: ['$saleAmount', '$purchaseAmount'] } },
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
      const results = await BillPayment.aggregate([
        { $match: { ...scope, createdAt: { $gte: from, $lte: to }, status: 'paid' } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            total: { $sum: { $ifNull: ['$latePaymentLoss', 0] } },
          },
        },
      ]);
      return results.reduce((acc, r) => { acc[r._id] = r.total || 0; return acc; }, {});
    })(),
    monthlySum(CashWithdrawal, 'date', { $ifNull: ['$profit', 0] }, { transactionType: 'withdrawal' }),
    monthlySum(CashWithdrawal, 'date', { $ifNull: ['$profit', 0] }, { transactionType: 'deposit' }),
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
    ...Object.keys(serviceProfitByMonth),
    ...Object.keys(simSaleProfitByMonth),
    ...Object.keys(billPaymentProfitByMonth),
    ...Object.keys(billPaymentLateLossByMonth),
    ...Object.keys(withdrawalProfitByMonth),
    ...Object.keys(depositProfitByMonth),
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
      + (serviceProfitByMonth[month] || 0)
      + (simSaleProfitByMonth[month] || 0)
      + (billPaymentProfitByMonth[month] || 0)
      - (billPaymentLateLossByMonth[month] || 0)
      + (withdrawalProfitByMonth[month] || 0)
      + (depositProfitByMonth[month] || 0);
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
    loadPurchaseSavingsAgg,
    repairAgg,
    serviceAgg,
    simSaleAgg,
    billPaymentAgg,
    billLatePaymentLossAgg,
    cashWithdrawalProfitAgg,
    cashDepositProfitAgg,
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
    // Load transaction profit (sale commissions)
    LoadTransaction.aggregate([
      { $match: { ...scope, date: { $gte: from, $lte: to } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$profit', 0] } } } },
    ]),
    // Load purchase savings (supplier commission/discount)
    LoadPurchase.aggregate([
      { $match: { ...scope, date: { $gte: from, $lte: to } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$profit', 0] } } } },
    ]),
    // Repair profit = charges - cost
    RepairJob.aggregate([
      { $match: { ...scope, date: { $gte: from, $lte: to }, status: { $in: ['completed', 'delivered'] } } },
      { $group: { _id: null, charges: { $sum: '$charges' }, cost: { $sum: { $ifNull: ['$cost', 0] } } } },
    ]),
    // Service profit = full amount from service invoices
    ServiceInvoice.aggregate([
      { $match: { ...scope, date: { $gte: from, $lte: to } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
    ]),
    // SimSale profit = saleAmount - purchaseAmount
    SimSale.aggregate([
      { $match: { ...scope, date: { $gte: from, $lte: to } } },
      { $group: { _id: null, total: { $sum: { $subtract: ['$saleAmount', '$purchaseAmount'] } }, count: { $sum: 1 } } },
    ]),
    // Bill payment profit = service charge
    BillPayment.aggregate([
      { $match: { ...scope, createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$serviceCharge', 0] } } } },
    ]),
    BillPayment.aggregate([
      { $match: { ...scope, createdAt: { $gte: from, $lte: to }, status: 'paid' } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$latePaymentLoss', 0] } } } },
    ]),
    // Cash withdrawal profit
    CashWithdrawal.aggregate([
      { $match: { ...scope, date: { $gte: from, $lte: to }, transactionType: 'withdrawal' } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$profit', 0] } } } },
    ]),
    // Cash deposit profit
    CashWithdrawal.aggregate([
      { $match: { ...scope, date: { $gte: from, $lte: to }, transactionType: 'deposit' } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$profit', 0] } } } },
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
  const ldp     = loadPurchaseSavingsAgg[0] || { total: 0 };
  const rep     = repairAgg[0]         || { charges: 0, cost: 0 };
  const svc     = serviceAgg[0]        || { total: 0, count: 0 };
  const sim     = simSaleAgg[0]        || { total: 0, count: 0 };
  const bill    = billPaymentAgg[0]    || { total: 0 };
  const billLoss = billLatePaymentLossAgg[0] || { total: 0 };
  const cwW     = cashWithdrawalProfitAgg[0] || { total: 0 };
  const cwD     = cashDepositProfitAgg[0] || { total: 0 };
  const exp     = expenseAgg[0]        || { total: 0 };
  const pur     = purchaseAgg[0]       || { total: 0 };
  const currentInventoryValue = stockAgg[0]?.total  || 0;
  const currentWalletBalance  = walletAgg[0]?.total || 0;

  const totalRevenue      = inv.totalRevenue;
  const salesReturns      = sr.total;
  const netRevenue        = totalRevenue - salesReturns;
  const costOfGoodsSold   = inv.totalCost;
  const grossProfit       = netRevenue - costOfGoodsSold;

  const loadProfit        = ldp.total;
  const repairProfit      = rep.charges - rep.cost;
  const serviceProfit     = svc.total;
  const simSaleProfit     = sim.total;
  const billProfit        = bill.total;
  const billLatePaymentLoss = billLoss.total;
  const billNetProfit     = billProfit - billLatePaymentLoss;
  const withdrawalProfit  = cwW.total;
  const depositProfit     = cwD.total;
  const purchaseReturns   = pr.total;
  const expenses          = exp.total;

  const netProfit = grossProfit + loadProfit + repairProfit + serviceProfit + simSaleProfit + billNetProfit + withdrawalProfit + depositProfit - expenses;

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
      serviceProfit:      parseFloat(serviceProfit.toFixed(2)),
      simSaleProfit:      parseFloat(simSaleProfit.toFixed(2)),
      billProfit:         parseFloat(billProfit.toFixed(2)),
      billNetProfit:      parseFloat(billNetProfit.toFixed(2)),
      withdrawalProfit:   parseFloat(withdrawalProfit.toFixed(2)),
      depositProfit:      parseFloat(depositProfit.toFixed(2)),
    },
    adjustments: {
      purchaseReturns:       parseFloat(purchaseReturns.toFixed(2)),
      purchaseReturnsCount:  pr.count,
      billLatePaymentLoss:   parseFloat(billLatePaymentLoss.toFixed(2)),
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
          productNameUrdu: { $first: { $ifNull: ['$items.nameUrdu', ''] } },
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
          productNameUrdu: { $first: { $ifNull: ['$items.nameUrdu', ''] } },
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
  const simSaleMatch = { ...scope, date: { $gte: start, $lte: end } };
  if (walletType) {
    txMatch.walletType = walletType;
    purchaseMatch.walletType = walletType;
    withdrawalMatch.walletType = walletType;
    simSaleMatch.walletType = walletType;
  }

  const [
    summary,
    byWallet,
    datewise,
    purchases,
    wallets,
    withdrawalSummary,
    withdrawalDatewise,
    simSaleSummary,
    simSaleByWallet,
    simSaleDatewise,
  ] = await Promise.all([
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
      { $group: { _id: '$walletType', totalPurchased: { $sum: '$amount' }, totalPurchaseProfit: { $sum: { $ifNull: ['$profit', 0] } }, count: { $sum: 1 } } },
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
    SimSale.aggregate([
      { $match: simSaleMatch },
      {
        $group: {
          _id: null,
          totalTransactions: { $sum: 1 },
          totalSold: { $sum: '$loadAmount' },
        },
      },
    ]),
    SimSale.aggregate([
      { $match: simSaleMatch },
      {
        $group: {
          _id: '$walletType',
          transactions: { $sum: 1 },
          totalSold: { $sum: '$loadAmount' },
        },
      },
      { $sort: { totalSold: -1 } },
    ]),
    SimSale.aggregate([
      { $match: simSaleMatch },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          transactions: { $sum: 1 },
          totalSold: { $sum: '$loadAmount' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const totalPurchased = purchases.reduce((s, p) => s + p.totalPurchased, 0);
  const purchaseSavings = purchases.reduce((s, p) => s + (p.totalPurchaseProfit || 0), 0);
  const sm = summary[0] || { totalTransactions: 0, totalSold: 0, totalProfit: 0, totalExtraCharges: 0 };
  const simSm = simSaleSummary[0] || { totalTransactions: 0, totalSold: 0 };
  const ws = withdrawalSummary[0] || { totalCount: 0, totalWithdrawals: 0, totalDeposits: 0, totalWithdrawalAmount: 0, totalDepositAmount: 0, totalProfit: 0 };

  const byWalletMap = {};
  byWallet.forEach((row) => {
    const key = row._id || 'unknown';
    byWalletMap[key] = {
      _id: key,
      transactions: row.transactions || 0,
      totalSold: row.totalSold || 0,
      totalProfit: row.totalProfit || 0,
    };
  });
  simSaleByWallet.forEach((row) => {
    const key = row._id || 'unknown';
    if (!byWalletMap[key]) {
      byWalletMap[key] = { _id: key, transactions: 0, totalSold: 0, totalProfit: 0 };
    }
    byWalletMap[key].transactions += row.transactions || 0;
    byWalletMap[key].totalSold += row.totalSold || 0;
  });
  const mergedByWallet = Object.values(byWalletMap).sort((a, b) => b.totalSold - a.totalSold);

  const datewiseMap = {};
  datewise.forEach((row) => {
    const key = row._id;
    datewiseMap[key] = {
      _id: key,
      transactions: row.transactions || 0,
      totalSold: row.totalSold || 0,
      totalProfit: row.totalProfit || 0,
    };
  });
  simSaleDatewise.forEach((row) => {
    const key = row._id;
    if (!datewiseMap[key]) {
      datewiseMap[key] = { _id: key, transactions: 0, totalSold: 0, totalProfit: 0 };
    }
    datewiseMap[key].transactions += row.transactions || 0;
    datewiseMap[key].totalSold += row.totalSold || 0;
  });
  const mergedDatewise = Object.values(datewiseMap).sort((a, b) => (a._id > b._id ? 1 : -1));

  const totalSoldIncludingSimSale = sm.totalSold + simSm.totalSold;
  const totalTransactionsIncludingSimSale = sm.totalTransactions + simSm.totalTransactions;

  res.status(httpStatus.OK).send({
    summary: {
      ...sm,
      totalTransactions: totalTransactionsIncludingSimSale,
      totalSold: totalSoldIncludingSimSale,
      totalProfit: sm.totalProfit + purchaseSavings,
      purchaseSavings,
      totalPurchased,
      netBalance: totalPurchased - totalSoldIncludingSimSale,
      simSaleLoadSold: simSm.totalSold,
      simSaleTransactions: simSm.totalTransactions,
    },
    byWallet: mergedByWallet.filter((row) => isLoadWalletName(row._id)),
    datewise: mergedDatewise,
    purchases: purchases.filter((row) => isLoadWalletName(row._id)),
    wallets: wallets.filter((w) => isLoadWalletName(w.type)),
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

/* ── Service Report ─────────────────────────────────────────────────────────── */
async function getServiceReport(req, res) {
  const scope = buildScope(req);
  const { start, end } = parseRange(req.query);
  const { serviceName } = req.query;

  const baseMatch = { ...scope, date: { $gte: start, $lte: end } };
  const invoiceMatch = serviceName ? { ...baseMatch, 'items.serviceName': serviceName } : baseMatch;

  const serviceFilterStages = serviceName
    ? [{ $match: { 'items.serviceName': serviceName } }]
    : [];

  const [summary, byService, byPaymentMethod, datewise, recentInvoices] = await Promise.all([
    ServiceInvoice.aggregate([
      { $match: invoiceMatch },
      {
        $group: {
          _id: null,
          totalInvoices: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' },
          totalProfit: { $sum: '$totalAmount' },
          avgInvoice: { $avg: '$totalAmount' },
        },
      },
    ]),
    ServiceInvoice.aggregate([
      { $match: baseMatch },
      { $unwind: '$items' },
      ...serviceFilterStages,
      {
        $group: {
          _id: '$items.serviceName',
          totalQuantity: { $sum: '$items.quantity' },
          totalAmount: { $sum: '$items.total' },
          avgUnitPrice: { $avg: '$items.unitPrice' },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]),
    ServiceInvoice.aggregate([
      { $match: invoiceMatch },
      {
        $group: {
          _id: '$paymentMethod',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]),
    ServiceInvoice.aggregate([
      { $match: invoiceMatch },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          invoices: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    ServiceInvoice.find(invoiceMatch).sort({ date: -1 }).limit(25).lean(),
  ]);

  res.status(httpStatus.OK).send({
    summary: summary[0] || { totalInvoices: 0, totalAmount: 0, totalProfit: 0, avgInvoice: 0 },
    byService,
    byPaymentMethod,
    datewise,
    recentInvoices,
    period: { startDate: start, endDate: end },
  });
}

/* ── Sim Sale Report ─────────────────────────────────────────────────────────── */
const getSimSaleReport = catchAsync(async (req, res) => {
  const scope = buildScope(req);
  const { start, end } = parseRange(req.query);
  const { productId, walletType, productName } = req.query;

  const baseMatch = { ...scope, date: { $gte: start, $lte: end } };
  if (productId && mongoose.Types.ObjectId.isValid(productId)) {
    baseMatch.productId = new mongoose.Types.ObjectId(productId);
  }
  if (walletType) baseMatch.walletType = walletType;

  const detailMatch = { ...baseMatch };
  if (productName) detailMatch.productName = String(productName).trim();

  const orgOid = scope.organizationId;
  const productUrduStages =
    orgOid && mongoose.Types.ObjectId.isValid(String(orgOid))
      ? [
          {
            $lookup: {
              from: 'products',
              let: { pname: '$_id' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [{ $eq: ['$organizationId', orgOid] }, { $eq: ['$name', '$$pname'] }],
                    },
                  },
                },
                { $project: { nameUrdu: 1 } },
                { $limit: 1 },
              ],
              as: '_pUrdu',
            },
          },
          { $addFields: { productNameUrdu: { $ifNull: [{ $arrayElemAt: ['$_pUrdu.nameUrdu', 0] }, ''] } } },
          { $project: { _pUrdu: 0 } },
        ]
      : [];

  const [summary, byProduct, byWallet, datewise, recentSalesRaw, productSalesRaw] = await Promise.all([
    SimSale.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: null,
          totalSales: { $sum: 1 },
          totalSimAmount: { $sum: '$simAmount' },
          totalLoadAmount: { $sum: '$loadAmount' },
          totalPurchaseAmount: { $sum: '$purchaseAmount' },
          totalSaleAmount: { $sum: '$saleAmount' },
          totalCommission: { $sum: '$commission' },
        },
      },
    ]),
    SimSale.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: '$productName',
          count: { $sum: 1 },
          totalSaleAmount: { $sum: '$saleAmount' },
          totalSimAmount: { $sum: '$simAmount' },
          totalLoadAmount: { $sum: '$loadAmount' },
          totalCommission: { $sum: '$commission' },
        },
      },
      { $sort: { totalSaleAmount: -1 } },
      ...productUrduStages,
    ]),
    SimSale.aggregate([
      { $match: { ...baseMatch, walletType: { $exists: true, $ne: '' } } },
      {
        $group: {
          _id: '$walletType',
          count: { $sum: 1 },
          totalLoadAmount: { $sum: '$loadAmount' },
        },
      },
      { $sort: { totalLoadAmount: -1 } },
    ]),
    SimSale.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          count: { $sum: 1 },
          totalSaleAmount: { $sum: '$saleAmount' },
          totalCommission: { $sum: '$commission' },
          totalLoadAmount: { $sum: '$loadAmount' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    SimSale.find(baseMatch).sort({ date: -1 }).limit(20).lean(),
    productName
      ? SimSale.find(detailMatch).sort({ date: -1 }).lean()
      : Promise.resolve([]),
  ]);

  const enrichSimSaleRows = async (rows) => {
    let enriched = rows;
    const pids = [...new Set(enriched.map((s) => s.productId).filter(Boolean).map((id) => String(id)))];
    const cids = [...new Set(enriched.map((s) => s.customerId).filter(Boolean).map((id) => String(id)))];
    if (pids.length || cids.length) {
      const [prows, crows] = await Promise.all([
        pids.length ? Product.find({ _id: { $in: pids } }).select('nameUrdu').lean() : [],
        cids.length ? Customer.find({ _id: { $in: cids } }).select('nameUrdu').lean() : [],
      ]);
      const pm = Object.fromEntries(prows.map((p) => [String(p._id), p.nameUrdu || '']));
      const cm = Object.fromEntries(crows.map((c) => [String(c._id), c.nameUrdu || '']));
      enriched = enriched.map((s) => ({
        ...s,
        productNameUrdu: s.productId ? pm[String(s.productId)] || '' : '',
        customerNameUrdu: s.customerId ? cm[String(s.customerId)] || '' : '',
      }));
    }
    return enriched;
  };

  let recentSales = await enrichSimSaleRows(recentSalesRaw);
  const productSales = productName ? await enrichSimSaleRows(productSalesRaw) : [];

  const sm = summary[0] || {
    totalSales: 0, totalSimAmount: 0, totalLoadAmount: 0,
    totalPurchaseAmount: 0, totalSaleAmount: 0, totalCommission: 0,
  };

  res.status(httpStatus.OK).send({
    summary: sm,
    byProduct,
    byWallet,
    datewise,
    recentSales,
    productSales,
    period: { startDate: start, endDate: end },
  });
});

/* ── Installment Report ──────────────────────────────────────────────────────── */
const getInstallmentReport = catchAsync(async (req, res) => {
  const scope = buildScope(req);
  const { start, end } = parseRange(req.query);
  const { status } = req.query;

  const planMatch = { ...scope };
  if (status) planMatch.status = status;

  const paymentMatch = { ...scope, date: { $gte: start, $lte: end } };

  const [planSummary, byStatus, recentPlans, paymentSummary, paymentDatewise, overdueCount] = await Promise.all([
    InstallmentPlan.aggregate([
      { $match: planMatch },
      {
        $group: {
          _id: null,
          totalPlans: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' },
          totalPaid: { $sum: '$totalPaid' },
          totalOutstanding: { $sum: '$totalOutstanding' },
          totalDownPayment: { $sum: '$downPayment' },
        },
      },
    ]),
    InstallmentPlan.aggregate([
      { $match: planMatch },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' },
          totalOutstanding: { $sum: '$totalOutstanding' },
          totalPaid: { $sum: '$totalPaid' },
        },
      },
      { $sort: { count: -1 } },
    ]),
    InstallmentPlan.find(planMatch).sort({ startDate: -1 }).limit(20).lean(),
    InstallmentPayment.aggregate([
      { $match: paymentMatch },
      {
        $group: {
          _id: null,
          totalPayments: { $sum: 1 },
          totalCollected: { $sum: '$amount' },
        },
      },
    ]),
    InstallmentPayment.aggregate([
      { $match: paymentMatch },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          payments: { $sum: 1 },
          totalCollected: { $sum: '$amount' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    InstallmentPlan.countDocuments({
      ...scope,
      status: 'active',
      nextDueDate: { $lt: new Date() },
    }),
  ]);

  const ps = planSummary[0] || { totalPlans: 0, totalAmount: 0, totalPaid: 0, totalOutstanding: 0, totalDownPayment: 0 };
  const pmtS = paymentSummary[0] || { totalPayments: 0, totalCollected: 0 };

  res.status(httpStatus.OK).send({
    planSummary: ps,
    byStatus,
    paymentSummary: pmtS,
    paymentDatewise,
    overdueCount,
    recentPlans,
    period: { startDate: start, endDate: end },
  });
});

const formatItemsSummary = (items, nameKey = 'name', qtyKey = 'quantity') => {
  if (!items || items.length === 0) return '';
  const preview = items.slice(0, 3).map((item) => `${item[nameKey] || 'Item'} x${item[qtyKey] || 1}`);
  const suffix = items.length > 3 ? ` +${items.length - 3} more` : '';
  return preview.join(', ') + suffix;
};

const capitalize = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const isValidRefObjectId = (id) => {
  if (id == null || id === '' || id === 'walk-in') return false;
  const s = String(id);
  if (!/^[a-fA-F0-9]{24}$/.test(s)) return false;
  try {
    return String(new mongoose.Types.ObjectId(s)) === s;
  } catch {
    return false;
  }
};

const resolveCustomersById = async (docs, idField = 'customerId') => {
  const ids = [
    ...new Set(
      docs
        .map((doc) => doc[idField])
        .filter((id) => isValidRefObjectId(id))
        .map((id) => String(id)),
    ),
  ];
  if (ids.length === 0) return new Map();
  const customers = await Customer.find({ _id: { $in: ids } })
    .select('name phone nameUrdu')
    .lean();
  return new Map(customers.map((c) => [String(c._id), c]));
};

/* ── Activity Summary (all modules) ─────────────────────────────────────────── */
const getActivitySummaryReport = catchAsync(async (req, res) => {
  const scope = buildScope(req);
  const { start, end } = parseRange(req.query);
  const { module: moduleFilter } = req.query;

  const dateMatch = (field) => ({ [field]: { $gte: start, $lte: end } });

  const [
    invoices,
    purchases,
    salesReturns,
    purchaseReturns,
    expenses,
    loadSales,
    loadPurchases,
    cashWithdrawals,
    simSales,
    repairJobs,
    serviceInvoices,
    billPayments,
    installmentPayments,
    customerPayments,
    supplierPayments,
  ] = await Promise.all([
    Invoice.find({
      ...scope,
      ...dateMatch('invoiceDate'),
      status: { $ne: 'cancelled' },
    })
      .select('invoiceNumber invoiceDate type status total paidAmount balance walkInCustomerName customerName customerId items')
      .lean(),
    Purchase.find({ ...scope, ...dateMatch('purchaseDate') })
      .select('invoiceNumber purchaseDate paymentType status totalAmount paidAmount balance supplier items')
      .populate('supplier', 'name phone nameUrdu')
      .lean(),
    SalesReturn.find({
      ...scope,
      ...dateMatch('date'),
      status: { $ne: 'rejected' },
    })
      .select('returnNumber date totalAmount status customerName customerId invoiceId items')
      .lean(),
    PurchaseReturn.find({
      ...scope,
      ...dateMatch('date'),
      status: { $ne: 'rejected' },
    })
      .select('returnNumber date totalAmount status supplierId items')
      .populate('supplierId', 'name phone')
      .lean(),
    Expense.find({ ...scope, ...dateMatch('date') })
      .select('category description amount paymentMethod date referenceId')
      .lean(),
    LoadTransaction.find({ ...scope, ...dateMatch('date') })
      .select('walletType customerName mobileNumber amount receivedAmount paymentMethod paymentWalletType date notes')
      .lean(),
    LoadPurchase.find({ ...scope, ...dateMatch('date') })
      .select('walletType supplierName amount paidAmount paymentMethod paymentWalletType date notes')
      .lean(),
    CashWithdrawal.find({ ...scope, ...dateMatch('date') })
      .select('walletType transactionType amount customerName customerNumber customerAccountType cashAmount date notes')
      .lean(),
    SimSale.find({ ...scope, ...dateMatch('date') })
      .select('jobNumber date productName walletType simAmount loadAmount saleAmount purchaseAmount customerName customerPhone paymentMethod notes')
      .lean(),
    RepairJob.find({ ...scope, ...dateMatch('date') })
      .select('date customerName phone deviceModel issue status charges advanceAmount paymentMethod technician')
      .lean(),
    ServiceInvoice.find({ ...scope, ...dateMatch('date') })
      .select('invoiceNumber date customerName customerPhone totalAmount paymentMethod items')
      .lean(),
    BillPayment.find({
      ...scope,
      $or: [
        { paymentDate: { $gte: start, $lte: end } },
        { paymentDate: { $in: [null, undefined] }, createdAt: { $gte: start, $lte: end } },
      ],
    })
      .select('referenceNumber paymentDate createdAt customerName billType companyName billAmount serviceCharge totalReceived status paymentMethod')
      .lean(),
    InstallmentPayment.find({ ...scope, ...dateMatch('date') })
      .select('amount paymentNumber paymentMethod isDownPayment date notes installmentPlanId')
      .populate('installmentPlanId', 'customerName customerPhone planNumber')
      .lean(),
    CustomerLedger.find({
      ...scope,
      ...dateMatch('transactionDate'),
      transactionType: { $in: ['payment_received', 'payment_made'] },
    })
      .select('transactionType transactionDate reference description debit credit balance paymentMethod customer')
      .populate('customer', 'name phone nameUrdu')
      .lean(),
    SupplierLedger.find({
      ...scope,
      ...dateMatch('transactionDate'),
      transactionType: { $in: ['payment_made', 'payment_received'] },
    })
      .select('transactionType transactionDate reference description debit credit balance paymentMethod supplier')
      .populate('supplier', 'name phone nameUrdu')
      .lean(),
  ]);

  const [customerById, returnCustomerById] = await Promise.all([
    resolveCustomersById(invoices, 'customerId'),
    resolveCustomersById(salesReturns, 'customerId'),
  ]);

  const entries = [];

  invoices.forEach((inv) => {
    const pay = normalizeInvoicePayment(inv);
    const customer = isValidRefObjectId(inv.customerId)
      ? customerById.get(String(inv.customerId))
      : null;
    const party = customer?.name || inv.walkInCustomerName || inv.customerName || 'Walk-in Customer';
    const isCash = inv.type === 'cash';
    entries.push({
      id: String(inv._id),
      date: inv.invoiceDate,
      module: 'Sales',
      subType: isCash ? 'Cash Sale' : capitalize(inv.type) + ' Sale',
      reference: inv.invoiceNumber || '',
      party,
      partyPhone: customer?.phone || '',
      paymentType: isCash ? 'Cash' : capitalize(inv.type),
      direction: 'in',
      totalAmount: inv.total || 0,
      paidAmount: pay.paidAmount,
      balance: pay.balance,
      description: `Sale invoice ${inv.invoiceNumber || ''}`,
      details: formatItemsSummary(inv.items),
      status: pay.displayStatus === 'cash' ? 'paid' : (pay.balance > 0 ? 'partial' : 'paid'),
    });
  });

  purchases.forEach((pur) => {
    const pay = normalizePurchasePayment(pur);
    const supplier = pur.supplier && typeof pur.supplier === 'object' ? pur.supplier : null;
    const isCash = pur.paymentType === 'Cash';
    entries.push({
      id: String(pur._id),
      date: pur.purchaseDate,
      module: 'Purchases',
      subType: isCash ? 'Cash Purchase' : `${pur.paymentType || 'Credit'} Purchase`,
      reference: pur.invoiceNumber || '',
      party: supplier?.name || 'Supplier',
      partyPhone: supplier?.phone || '',
      paymentType: pur.paymentType || 'Cash',
      direction: 'out',
      totalAmount: pur.totalAmount || 0,
      paidAmount: pay.paidAmount,
      balance: pay.balance,
      description: `Purchase ${pur.invoiceNumber || ''}`,
      details: formatItemsSummary(pur.items),
      status: pay.displayStatus === 'cash' ? 'paid' : (pay.balance > 0 ? 'partial' : 'paid'),
    });
  });

  salesReturns.forEach((ret) => {
    const customer = isValidRefObjectId(ret.customerId)
      ? returnCustomerById.get(String(ret.customerId))
      : null;
    entries.push({
      id: String(ret._id),
      date: ret.date,
      module: 'Sales Returns',
      subType: 'Sales Return',
      reference: ret.returnNumber || '',
      party: customer?.name || ret.customerName || 'Customer',
      partyPhone: customer?.phone || '',
      paymentType: 'Refund',
      direction: 'out',
      totalAmount: ret.totalAmount || 0,
      paidAmount: ret.totalAmount || 0,
      balance: 0,
      description: `Sales return ${ret.returnNumber || ''}`,
      details: formatItemsSummary(ret.items, 'name', 'quantity'),
      status: ret.status || 'completed',
    });
  });

  purchaseReturns.forEach((ret) => {
    const supplier = ret.supplierId && typeof ret.supplierId === 'object' ? ret.supplierId : null;
    entries.push({
      id: String(ret._id),
      date: ret.date,
      module: 'Purchase Returns',
      subType: 'Purchase Return',
      reference: ret.returnNumber || '',
      party: supplier?.name || 'Supplier',
      partyPhone: supplier?.phone || '',
      paymentType: 'Refund',
      direction: 'in',
      totalAmount: ret.totalAmount || 0,
      paidAmount: ret.totalAmount || 0,
      balance: 0,
      description: `Purchase return ${ret.returnNumber || ''}`,
      details: formatItemsSummary(ret.items, 'name', 'quantity'),
      status: ret.status || 'completed',
    });
  });

  expenses.forEach((exp) => {
    entries.push({
      id: String(exp._id),
      date: exp.date,
      module: 'Expenses',
      subType: exp.category || 'Expense',
      reference: exp.referenceId ? String(exp.referenceId) : '',
      party: exp.category || 'Expense',
      partyPhone: '',
      paymentType: capitalize(exp.paymentMethod) || 'Cash',
      direction: 'out',
      totalAmount: exp.amount || 0,
      paidAmount: exp.amount || 0,
      balance: 0,
      description: exp.description || exp.category || 'Expense',
      details: exp.category || '',
      status: 'paid',
    });
  });

  loadSales.forEach((tx) => {
    entries.push({
      id: String(tx._id),
      date: tx.date,
      module: 'Load',
      subType: 'Load Sale',
      reference: tx.mobileNumber || '',
      party: tx.customerName || 'Customer',
      partyPhone: tx.mobileNumber || '',
      paymentType: capitalize(tx.paymentMethod) || 'Cash',
      direction: 'in',
      totalAmount: tx.receivedAmount || tx.amount || 0,
      paidAmount: tx.receivedAmount || tx.amount || 0,
      balance: 0,
      description: `Load sale on ${tx.walletType || 'wallet'}`,
      details: `Load: ${tx.amount || 0} | Wallet: ${tx.walletType || ''}${tx.notes ? ` | ${tx.notes}` : ''}`,
      status: 'completed',
    });
  });

  loadPurchases.forEach((lp) => {
    entries.push({
      id: String(lp._id),
      date: lp.date,
      module: 'Load',
      subType: 'Load Purchase',
      reference: lp.walletType || '',
      party: lp.supplierName || 'Supplier',
      partyPhone: '',
      paymentType: capitalize(lp.paymentMethod) || 'Cash',
      direction: 'out',
      totalAmount: lp.amount || 0,
      paidAmount: lp.paidAmount || lp.amount || 0,
      balance: 0,
      description: `Load purchase for ${lp.walletType || 'wallet'}`,
      details: `Amount: ${lp.amount || 0} | Wallet: ${lp.walletType || ''}${lp.notes ? ` | ${lp.notes}` : ''}`,
      status: 'completed',
    });
  });

  cashWithdrawals.forEach((cw) => {
    const isReceive = cw.transactionType === 'withdrawal';
    entries.push({
      id: String(cw._id),
      date: cw.date,
      module: 'Cash Management',
      subType: isReceive ? 'Cash Received' : 'Cash Sent',
      reference: cw.customerNumber || '',
      party: cw.customerName || 'Customer',
      partyPhone: cw.customerNumber || '',
      paymentType: capitalize(cw.customerAccountType) || 'Wallet',
      direction: isReceive ? 'in' : 'out',
      totalAmount: cw.amount || 0,
      paidAmount: cw.cashAmount || cw.amount || 0,
      balance: 0,
      description: `${isReceive ? 'Receive' : 'Send'} via ${cw.walletType || 'wallet'}`,
      details: `Wallet: ${cw.walletType || ''} | Account: ${cw.customerNumber || '—'}${cw.notes ? ` | ${cw.notes}` : ''}`,
      status: 'completed',
    });
  });

  simSales.forEach((sim) => {
    entries.push({
      id: String(sim._id),
      date: sim.date,
      module: 'Sim Sale',
      subType: 'Sim + Load Sale',
      reference: `SIM-${sim.jobNumber || ''}`,
      party: sim.customerName || 'Customer',
      partyPhone: sim.customerPhone || '',
      paymentType: capitalize(sim.paymentMethod) || 'Cash',
      direction: 'in',
      totalAmount: sim.saleAmount || 0,
      paidAmount: sim.saleAmount || 0,
      balance: 0,
      description: `Sim sale: ${sim.productName || 'SIM'}`,
      details: `SIM: ${sim.simAmount || 0} | Load: ${sim.loadAmount || 0} | Wallet: ${sim.walletType || ''}`,
      status: 'completed',
    });
  });

  repairJobs.forEach((job) => {
    entries.push({
      id: String(job._id),
      date: job.date,
      module: 'Repairing',
      subType: 'Repair Job',
      reference: String(job._id).slice(-6).toUpperCase(),
      party: job.customerName || 'Customer',
      partyPhone: job.phone || '',
      paymentType: capitalize(job.paymentMethod) || 'Cash',
      direction: 'in',
      totalAmount: job.charges || 0,
      paidAmount: job.advanceAmount || 0,
      balance: Math.max(0, (job.charges || 0) - (job.advanceAmount || 0)),
      description: `${job.deviceModel || 'Device'} — ${job.issue || 'Repair'}`,
      details: `Status: ${job.status || ''} | Technician: ${job.technician || '—'}`,
      status: job.status || 'pending',
    });
  });

  serviceInvoices.forEach((svc) => {
    entries.push({
      id: String(svc._id),
      date: svc.date,
      module: 'Services',
      subType: 'Service Invoice',
      reference: svc.invoiceNumber || '',
      party: svc.customerName || 'Customer',
      partyPhone: svc.customerPhone || '',
      paymentType: capitalize(svc.paymentMethod) || 'Cash',
      direction: 'in',
      totalAmount: svc.totalAmount || 0,
      paidAmount: svc.totalAmount || 0,
      balance: 0,
      description: `Service invoice ${svc.invoiceNumber || ''}`,
      details: formatItemsSummary(svc.items, 'serviceName', 'quantity'),
      status: 'paid',
    });
  });

  billPayments.forEach((bill) => {
    const billDate = bill.paymentDate || bill.createdAt;
    entries.push({
      id: String(bill._id),
      date: billDate,
      module: 'Bill Payments',
      subType: capitalize(bill.billType) + ' Bill',
      reference: bill.referenceNumber || '',
      party: bill.customerName || 'Customer',
      partyPhone: '',
      paymentType: capitalize(bill.paymentMethod) || 'Cash',
      direction: 'in',
      totalAmount: bill.totalReceived || 0,
      paidAmount: bill.billAmount || 0,
      balance: 0,
      description: `${bill.companyName || 'Utility'} bill payment`,
      details: `Bill: ${bill.billAmount || 0} | Service charge: ${bill.serviceCharge || 0}`,
      status: bill.status || 'completed',
    });
  });

  installmentPayments.forEach((pmt) => {
    const plan = pmt.installmentPlanId && typeof pmt.installmentPlanId === 'object'
      ? pmt.installmentPlanId
      : null;
    entries.push({
      id: String(pmt._id),
      date: pmt.date,
      module: 'Installments',
      subType: pmt.isDownPayment ? 'Down Payment' : 'Installment Payment',
      reference: plan?.planNumber ? `PLAN-${plan.planNumber}` : `PAY-${pmt.paymentNumber || ''}`,
      party: plan?.customerName || 'Customer',
      partyPhone: plan?.customerPhone || '',
      paymentType: capitalize(pmt.paymentMethod) || 'Cash',
      direction: 'in',
      totalAmount: pmt.amount || 0,
      paidAmount: pmt.amount || 0,
      balance: 0,
      description: pmt.isDownPayment ? 'Installment down payment' : `Installment payment #${pmt.paymentNumber || ''}`,
      details: pmt.notes || '',
      status: 'paid',
    });
  });

  customerPayments.forEach((entry) => {
    const customer = entry.customer && typeof entry.customer === 'object' ? entry.customer : null;
    const isReceived = entry.transactionType === 'payment_received';
    const amount = isReceived ? (entry.credit || 0) : (entry.debit || 0);
    entries.push({
      id: String(entry._id),
      date: entry.transactionDate,
      module: 'Customer Payments',
      subType: isReceived ? 'Cash Received' : 'Cash Paid',
      reference: entry.reference || '',
      party: customer?.name || 'Customer',
      partyPhone: customer?.phone || '',
      paymentType: capitalize(entry.paymentMethod) || 'Cash',
      direction: isReceived ? 'in' : 'out',
      totalAmount: amount,
      paidAmount: amount,
      balance: 0,
      description: entry.description || (isReceived ? 'Payment received from customer' : 'Payment made to customer'),
      details: entry.reference ? `Ref: ${entry.reference}` : '',
      status: 'completed',
    });
  });

  supplierPayments.forEach((entry) => {
    const supplier = entry.supplier && typeof entry.supplier === 'object' ? entry.supplier : null;
    const isPaid = entry.transactionType === 'payment_made';
    const amount = isPaid ? (entry.debit || 0) : (entry.credit || 0);
    entries.push({
      id: String(entry._id),
      date: entry.transactionDate,
      module: 'Supplier Payments',
      subType: isPaid ? 'Cash Paid' : 'Cash Received',
      reference: entry.reference || '',
      party: supplier?.name || 'Supplier',
      partyPhone: supplier?.phone || '',
      paymentType: capitalize(entry.paymentMethod) || 'Cash',
      direction: isPaid ? 'out' : 'in',
      totalAmount: amount,
      paidAmount: amount,
      balance: 0,
      description: entry.description || (isPaid ? 'Payment made to supplier' : 'Payment received from supplier'),
      details: entry.reference ? `Ref: ${entry.reference}` : '',
      status: 'completed',
    });
  });

  entries.sort((a, b) => new Date(b.date) - new Date(a.date));

  const filteredEntries = moduleFilter
    ? entries.filter((entry) => entry.module.toLowerCase() === String(moduleFilter).toLowerCase())
    : entries;

  const byModuleMap = {};
  filteredEntries.forEach((entry) => {
    if (!byModuleMap[entry.module]) {
      byModuleMap[entry.module] = { module: entry.module, count: 0, totalAmount: 0, cashIn: 0, cashOut: 0 };
    }
    const row = byModuleMap[entry.module];
    row.count += 1;
    row.totalAmount += entry.totalAmount || 0;
    if (entry.direction === 'in') row.cashIn += entry.paidAmount || 0;
    if (entry.direction === 'out') row.cashOut += entry.paidAmount || 0;
  });

  const summary = {
    totalEntries: filteredEntries.length,
    totalAmount: filteredEntries.reduce((sum, e) => sum + (e.totalAmount || 0), 0),
    cashReceived: filteredEntries.filter((e) => e.direction === 'in').reduce((sum, e) => sum + (e.paidAmount || 0), 0),
    cashPaid: filteredEntries.filter((e) => e.direction === 'out').reduce((sum, e) => sum + (e.paidAmount || 0), 0),
    creditSalesBalance: filteredEntries
      .filter((e) => e.module === 'Sales' && e.balance > 0)
      .reduce((sum, e) => sum + e.balance, 0),
    creditPurchaseBalance: filteredEntries
      .filter((e) => e.module === 'Purchases' && e.balance > 0)
      .reduce((sum, e) => sum + e.balance, 0),
    cashSales: filteredEntries
      .filter((e) => e.module === 'Sales' && e.paymentType === 'Cash')
      .reduce((sum, e) => sum + (e.totalAmount || 0), 0),
    creditSales: filteredEntries
      .filter((e) => e.module === 'Sales' && e.paymentType !== 'Cash')
      .reduce((sum, e) => sum + (e.totalAmount || 0), 0),
    cashPurchases: filteredEntries
      .filter((e) => e.module === 'Purchases' && e.paymentType === 'Cash')
      .reduce((sum, e) => sum + (e.totalAmount || 0), 0),
    creditPurchases: filteredEntries
      .filter((e) => e.module === 'Purchases' && e.paymentType !== 'Cash')
      .reduce((sum, e) => sum + (e.totalAmount || 0), 0),
  };

  res.status(httpStatus.OK).send({
    entries: filteredEntries,
    byModule: Object.values(byModuleMap).sort((a, b) => b.count - a.count),
    summary,
    period: { startDate: start, endDate: end },
  });
});

module.exports = {
  getSalesInvoiceDetails,
  getPurchaseInvoiceDetails,
  getSalesReport, getPurchaseReport, getProductReport, getProductDetailReport,
  getCustomerReport, getSupplierReport, getExpenseReport,
  getProfitLossReport, getProfitLossFullReport, getInventoryReport, getTaxReport,
  getSalesReturnsReport, getPurchaseReturnsReport,
  getLoadReport, getRepairReport, getServiceReport,
  getRoiReport, getMonthlyRoi,
  getSimSaleReport, getInstallmentReport,
  getActivitySummaryReport,
};
