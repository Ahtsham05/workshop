const httpStatus = require('http-status');
const mongoose = require('mongoose');
const catchAsync = require('../utils/catchAsync');
const { Invoice, Product, Customer, Purchase, Supplier, Expense, SalesReturn, PurchaseReturn, LoadTransaction, LoadPurchase, Wallet, RepairJob, ServiceInvoice, CashWithdrawal, BillPayment, SimSale, InstallmentPlan, InstallmentPayment, CustomerLedger, SupplierLedger, PersonalLedger, ProductVariant, Batch, Inventory, StockAdjustment, InventoryTransfer, Imei, WalletTransfer, SalesmanCommissionLedger } = require('../models');
const { cashBookService, stockAdjustmentService, mobileDashboardService } = require('../services');
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

/**
 * Pipeline stages that collect every `${itemsField}.variantId` referenced across the
 * matched documents' item arrays and look up the real ProductVariant docs, so the
 * final $project can attach a human-readable variant label (e.g. "Red / Large") to
 * each line item — see docs/architecture/universal-product-migration.md. Reused by
 * the Sales, Purchase, and Product-detail reports, which all carry `items.variantId`
 * but no label of their own.
 */
const variantLookupStages = (itemsField = 'items') => [
  {
    $addFields: {
      _variantIds: {
        $filter: { input: `$${itemsField}.variantId`, as: 'v', cond: { $ne: ['$$v', null] } },
      },
    },
  },
  {
    $lookup: {
      from: ProductVariant.collection.name,
      localField: '_variantIds',
      foreignField: '_id',
      as: '_variantDocs',
    },
  },
];

/** Same idea as variantLookupStages, but for Batch docs — used where the items only
 * carry a `batchId` (Sales/Invoice items) and need the Batch looked up for its
 * `expiryDate` (Purchase items store `expiryDate` directly and never need this). */
const batchLookupStages = (itemsField = 'items') => [
  {
    $addFields: {
      _batchIds: {
        $filter: { input: `$${itemsField}.batchId`, as: 'b', cond: { $ne: ['$$b', null] } },
      },
    },
  },
  {
    $lookup: {
      from: Batch.collection.name,
      localField: '_batchIds',
      foreignField: '_id',
      as: '_batchDocs',
    },
  },
];

/** Builds the "Red / Large" style label for `itemVar.variantId` from the looked-up
 * `_variantDocs` array (see variantLookupStages). Returns null when the item has no
 * variant or the variant wasn't found (e.g. since deleted). */
const variantLabelExpr = (itemVar) => ({
  $let: {
    vars: {
      variantDoc: {
        $arrayElemAt: [
          { $filter: { input: '$_variantDocs', as: 'v', cond: { $eq: ['$$v._id', `$$${itemVar}.variantId`] } } },
          0,
        ],
      },
    },
    in: {
      $cond: [
        { $eq: ['$$variantDoc', null] },
        null,
        {
          $reduce: {
            input: { $objectToArray: { $ifNull: ['$$variantDoc.attributes', {}] } },
            initialValue: '',
            in: {
              $cond: [
                { $eq: ['$$value', ''] },
                '$$this.v',
                { $concat: ['$$value', ' / ', '$$this.v'] },
              ],
            },
          },
        },
      ],
    },
  },
});

/** Looks up `itemVar.batchId`'s expiryDate from the `_batchDocs` array (see
 * batchLookupStages). Returns null when the item has no batchId. */
const batchExpiryExpr = (itemVar) => ({
  $let: {
    vars: {
      batchDoc: {
        $arrayElemAt: [
          { $filter: { input: '$_batchDocs', as: 'b', cond: { $eq: ['$$b._id', `$$${itemVar}.batchId`] } } },
          0,
        ],
      },
    },
    in: '$$batchDoc.expiryDate',
  },
});

const { parseBusinessDateBoundary: parseDateBoundary, BUSINESS_TZ } = require('../utils/businessTimezone');

const businessDateGroup = (field = '$date') => ({
  $dateToString: { format: '%Y-%m-%d', date: field, timezone: BUSINESS_TZ },
});

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
    ...variantLookupStages('items'),
    ...batchLookupStages('items'),
    {
      $project: {
        invoiceNumber: 1,
        invoiceDate: 1,
        type: 1,
        status: 1,
        subtotal: 1,
        discount: { $ifNull: ['$discount', 0] },
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
              discountAmount: { $ifNull: ['$$item.discountAmount', 0] },
              imeis: { $ifNull: ['$$item.imeis', []] },
              variantId: { $ifNull: ['$$item.variantId', null] },
              batchNumber: { $ifNull: ['$$item.batchNumber', null] },
              // A line split across several batches only mirrors the *first* one onto
              // batchNumber above (see invoice.model.js) — surface the real per-batch
              // breakdown too, so a report can show what actually sold instead of
              // attributing the whole line's quantity to a single batch.
              batchAllocations: { $ifNull: ['$$item.batchAllocations', []] },
              variantLabel: variantLabelExpr('item'),
              expiryDate: batchExpiryExpr('item'),
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
      $lookup: {
        from: ProductVariant.collection.name,
        let: { vid: '$items.variantId' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$_id', '$$vid'] }, { $ne: ['$$vid', null] }] } } },
          { $project: { attributes: 1 } },
        ],
        as: 'variantDoc',
      },
    },
    { $unwind: { path: '$variantDoc', preserveNullAndEmptyArrays: true } },
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
                imeis: { $ifNull: ['$items.imeis', []] },
                variantId: { $ifNull: ['$items.variantId', null] },
                batchNumber: { $ifNull: ['$items.batchNumber', null] },
                expiryDate: { $ifNull: ['$items.expiryDate', null] },
                variantLabel: {
                  $cond: [
                    { $eq: ['$variantDoc', null] },
                    null,
                    {
                      $reduce: {
                        input: { $objectToArray: { $ifNull: ['$variantDoc.attributes', {}] } },
                        initialValue: '',
                        in: {
                          $cond: [
                            { $eq: ['$$value', ''] },
                            '$$this.v',
                            { $concat: ['$$value', ' / ', '$$this.v'] },
                          ],
                        },
                      },
                    },
                  ],
                },
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
        totalDiscount: { $sum: { $ifNull: ['$items.discountAmount', 0] } },
        // Net of any per-item discount — divides the same net line total used for
        // totalRevenue above by quantity, not the raw listed unitPrice, so a discounted
        // line doesn't inflate "average selling price".
        avgSellingPrice: {
          $avg: {
            $divide: [
              { $ifNull: ['$items.subtotal', { $multiply: ['$items.quantity', { $ifNull: ['$items.price', '$items.unitPrice', 0] }] }] },
              { $cond: [{ $gt: ['$items.quantity', 0] }, '$items.quantity', 1] },
            ],
          },
        },
        currentStock: { $first: '$product.stockQuantity' },
        unit: { $first: '$product.unit' },
        // Collected so the caller can search this list by variant/batch/serial, not
        // just product name — see the searchTags $project below. Pulled straight off
        // the sold items already being unwound here rather than a second pass over
        // Batch/Imei/ProductVariant, since every value that could ever match a sale in
        // this period necessarily appears on one of its line items.
        _batchNumbers: { $addToSet: '$items.batchNumber' },
        _batchIds: { $addToSet: '$items.batchId' },
        _variantIds: { $addToSet: '$items.variantId' },
        _imeiLists: { $push: { $ifNull: ['$items.imeis', []] } },
      } },
      {
        $addFields: {
          _batchNumbers: { $filter: { input: '$_batchNumbers', cond: { $ne: ['$$this', null] } } },
          _batchIds: { $filter: { input: '$_batchIds', cond: { $ne: ['$$this', null] } } },
          _variantIds: { $filter: { input: '$_variantIds', cond: { $ne: ['$$this', null] } } },
          _imeis: { $reduce: { input: '$_imeiLists', initialValue: [], in: { $setUnion: ['$$value', '$$this'] } } },
        },
      },
      {
        $lookup: {
          from: ProductVariant.collection.name,
          localField: '_variantIds',
          foreignField: '_id',
          as: '_variantDocs',
        },
      },
      {
        $lookup: {
          from: Batch.collection.name,
          localField: '_batchIds',
          foreignField: '_id',
          as: '_batchDocs',
        },
      },
      {
        $addFields: {
          _variantLabels: {
            $map: {
              input: '$_variantDocs',
              as: 'v',
              in: {
                $reduce: {
                  input: { $objectToArray: { $ifNull: ['$$v.attributes', {}] } },
                  initialValue: '',
                  in: { $cond: [{ $eq: ['$$value', ''] }, '$$this.v', { $concat: ['$$value', ' / ', '$$this.v'] }] },
                },
              },
            },
          },
          _expiryDates: {
            $map: {
              input: { $filter: { input: '$_batchDocs', cond: { $ne: ['$$this.expiryDate', null] } } },
              as: 'b',
              in: { $dateToString: { format: '%Y-%m-%d', date: '$$b.expiryDate' } },
            },
          },
        },
      },
      {
        $project: {
          productName: 1, productNameUrdu: 1, category: 1, totalQuantitySold: 1, totalRevenue: 1,
          totalProfit: 1, totalDiscount: 1, avgSellingPrice: 1, currentStock: 1, unit: 1,
          searchTags: {
            $setUnion: ['$_batchNumbers', '$_imeis', '$_variantLabels', '$_expiryDates'],
          },
        },
      },
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
                          { $convert: { input: '$$cid', to: 'objectId', onError: null, onNull: null } },
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
      { $lookup: {
        from: ProductVariant.collection.name,
        let: { vid: '$items.variantId' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$_id', '$$vid'] }, { $ne: ['$$vid', null] }] } } },
          { $project: { attributes: 1 } },
        ],
        as: 'variantDoc',
      } },
      { $unwind: { path: '$variantDoc', preserveNullAndEmptyArrays: true } },
      { $lookup: {
        from: Batch.collection.name,
        let: { bid: '$items.batchId' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$_id', '$$bid'] }, { $ne: ['$$bid', null] }] } } },
          { $project: { expiryDate: 1 } },
        ],
        as: 'batchDoc',
      } },
      { $unwind: { path: '$batchDoc', preserveNullAndEmptyArrays: true } },
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
        variantId: { $ifNull: ['$items.variantId', null] },
        batchNumber: { $ifNull: ['$items.batchNumber', null] },
        // See getSalesInvoiceDetails above — a split line's real per-batch breakdown
        // lives here, not in the single batchNumber mirror.
        batchAllocations: { $ifNull: ['$items.batchAllocations', []] },
        imeis: { $ifNull: ['$items.imeis', []] },
        expiryDate: { $ifNull: ['$batchDoc.expiryDate', null] },
        variantLabel: {
          $cond: [
            { $eq: ['$variantDoc', null] },
            null,
            {
              $reduce: {
                input: { $objectToArray: { $ifNull: ['$variantDoc.attributes', {}] } },
                initialValue: '',
                in: { $cond: [{ $eq: ['$$value', ''] }, '$$this.v', { $concat: ['$$value', ' / ', '$$this.v'] }] },
              },
            },
          ],
        },
      } },
      { $sort: { date: -1 } },
    ]),
    Purchase.aggregate([
      { $match: purchaseMatch },
      { $unwind: '$items' },
      { $match: { 'items.product': productObjId } },
      { $lookup: { from: 'suppliers', localField: 'supplier', foreignField: '_id', as: 'supplierInfo' } },
      { $lookup: {
        from: ProductVariant.collection.name,
        let: { vid: '$items.variantId' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$_id', '$$vid'] }, { $ne: ['$$vid', null] }] } } },
          { $project: { attributes: 1 } },
        ],
        as: 'variantDoc',
      } },
      { $unwind: { path: '$variantDoc', preserveNullAndEmptyArrays: true } },
      { $project: {
        purchaseNumber: { $ifNull: ['$invoiceNumber', 'N/A'] },
        date: '$purchaseDate',
        supplierName: { $arrayElemAt: ['$supplierInfo.name', 0] },
        supplierNameUrdu: { $ifNull: [{ $arrayElemAt: ['$supplierInfo.nameUrdu', 0] }, ''] },
        supplierPhone: { $arrayElemAt: ['$supplierInfo.phone', 0] },
        quantity: '$items.quantity',
        price: { $ifNull: ['$items.priceAtPurchase', '$items.price'] },
        subtotal: { $ifNull: ['$items.total', { $multiply: ['$items.quantity', { $ifNull: ['$items.priceAtPurchase', 0] }] }] },
        variantId: { $ifNull: ['$items.variantId', null] },
        batchNumber: { $ifNull: ['$items.batchNumber', null] },
        imeis: { $ifNull: ['$items.imeis', []] },
        expiryDate: { $ifNull: ['$items.expiryDate', null] },
        variantLabel: {
          $cond: [
            { $eq: ['$variantDoc', null] },
            null,
            {
              $reduce: {
                input: { $objectToArray: { $ifNull: ['$variantDoc.attributes', {}] } },
                initialValue: '',
                in: { $cond: [{ $eq: ['$$value', ''] }, '$$this.v', { $concat: ['$$value', ' / ', '$$this.v'] }] },
              },
            },
          ],
        },
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
      // Product's own fields are `cost`/`price` (not purchasePrice/sellingPrice, which
      // don't exist on the schema) — those always resolved to undefined, so this card
      // showed "Rs 0.00" for every product regardless of its real cost/price.
      purchasePrice: product.cost,
      sellingPrice: product.price,
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
        totalPaid: { $sum: { $ifNull: ['$paidAmount', 0] } },
        totalBalance: { $sum: { $ifNull: ['$balance', 0] } },
        avgPurchaseValue: { $avg: '$total' },
        lastPurchase: { $max: '$invoiceDate' },
        firstPurchase: { $min: '$invoiceDate' },
      } },
      { $sort: { totalSpent: -1 } },
      { $limit: top },
    ]),
    Invoice.aggregate([
      { $match: { ...baseMatch, ...dateMatch } },
      { $group: {
        _id: null,
        uniqueCustomers: { $addToSet: customerGroupExpr },
        totalTransactions: { $sum: 1 },
        totalRevenue: { $sum: '$total' },
        totalBalance: { $sum: { $ifNull: ['$balance', 0] } },
      } },
      { $project: { uniqueCustomers: { $size: '$uniqueCustomers' }, totalTransactions: 1, totalRevenue: 1, totalBalance: 1, avgTransactionValue: { $cond: [{ $gt: ['$totalTransactions', 0] }, { $divide: ['$totalRevenue', '$totalTransactions'] }, 0] } } },
    ]),
  ]);

  res.status(httpStatus.OK).send({ data: customerData, summary: summary[0] || {}, period: { startDate: start, endDate: end } });
});

/* ── Customer Aging (Accounts Receivable) ─────────────────────────────────────
 * Buckets every currently-outstanding credit/pending invoice by how overdue it
 * is against `asOfDate`. Invoices with no `dueDate` are treated as due on their
 * `invoiceDate` (age from day 1) — the conservative "no terms specified" default. */
const getCustomerAgingReport = catchAsync(async (req, res) => {
  const scope = buildScope(req);
  const asOfDate = parseDateBoundary(req.query.asOfDate, true) || new Date();

  const baseMatch = {
    ...scope,
    type: { $in: ['credit', 'pending'] },
    balance: { $gt: 0 },
    status: { $ne: 'cancelled' },
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

  const bucketExpr = {
    $switch: {
      branches: [
        { case: { $lte: ['$daysOverdue', 0] }, then: 'current' },
        { case: { $lte: ['$daysOverdue', 30] }, then: 'days1to30' },
        { case: { $lte: ['$daysOverdue', 60] }, then: 'days31to60' },
        { case: { $lte: ['$daysOverdue', 90] }, then: 'days61to90' },
      ],
      default: 'days90plus',
    },
  };

  const bucketSum = (bucket) => ({ $sum: { $cond: [{ $eq: ['$bucket', bucket] }, '$balance', 0] } });

  const customerData = await Invoice.aggregate([
    { $match: baseMatch },
    { $addFields: { effectiveDueDate: { $ifNull: ['$dueDate', '$invoiceDate'] } } },
    {
      $addFields: {
        daysOverdue: {
          $floor: { $divide: [{ $subtract: [asOfDate, '$effectiveDueDate'] }, 1000 * 60 * 60 * 24] },
        },
      },
    },
    { $addFields: { bucket: bucketExpr } },
    {
      $lookup: {
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
      },
    },
    { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: customerGroupExpr,
        customerId: { $first: '$customerId' },
        customerName: { $first: { $ifNull: ['$customer.name', '$walkInCustomerName', 'Walk-in Customer'] } },
        customerNameUrdu: { $first: { $ifNull: ['$customer.nameUrdu', ''] } },
        phone: { $first: '$customer.phone' },
        whatsapp: { $first: '$customer.whatsapp' },
        email: { $first: '$customer.email' },
        current: bucketSum('current'),
        days1to30: bucketSum('days1to30'),
        days31to60: bucketSum('days31to60'),
        days61to90: bucketSum('days61to90'),
        days90plus: bucketSum('days90plus'),
        totalOutstanding: { $sum: '$balance' },
        invoiceCount: { $sum: 1 },
        maxDaysOverdue: { $max: '$daysOverdue' },
        invoices: {
          $push: {
            _id: '$_id',
            invoiceNumber: '$invoiceNumber',
            invoiceDate: '$invoiceDate',
            dueDate: '$effectiveDueDate',
            total: '$total',
            paidAmount: '$paidAmount',
            balance: '$balance',
            daysOverdue: '$daysOverdue',
            bucket: '$bucket',
          },
        },
      },
    },
    { $sort: { totalOutstanding: -1 } },
  ]);

  const summary = customerData.reduce(
    (acc, row) => {
      acc.current += row.current;
      acc.days1to30 += row.days1to30;
      acc.days31to60 += row.days31to60;
      acc.days61to90 += row.days61to90;
      acc.days90plus += row.days90plus;
      acc.totalOutstanding += row.totalOutstanding;
      acc.totalCustomers += 1;
      if (row.totalOutstanding - row.current > 0) acc.customersOverdue += 1;
      return acc;
    },
    {
      current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0,
      totalOutstanding: 0, totalCustomers: 0, customersOverdue: 0,
    }
  );

  res.status(httpStatus.OK).send({ data: customerData, summary, asOfDate });
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

/* ── Supplier Aging (Accounts Payable) ────────────────────────────────────────
 * Mirrors getCustomerAgingReport, adapted for Purchase's shape: `supplier` is
 * always a real ObjectId (no walk-in equivalent, so no synthetic group key is
 * needed), there's no `dueDate` field at all (aging always runs off
 * `purchaseDate`), and `status` is an unused boolean rather than a string enum
 * — "still owed" is `paymentType !== 'Cash'` with a positive `balance`. */
const getSupplierAgingReport = catchAsync(async (req, res) => {
  const scope = buildScope(req);
  const asOfDate = parseDateBoundary(req.query.asOfDate, true) || new Date();

  const baseMatch = {
    ...scope,
    paymentType: { $ne: 'Cash' },
    balance: { $gt: 0 },
  };

  const bucketExpr = {
    $switch: {
      branches: [
        { case: { $lte: ['$daysOverdue', 0] }, then: 'current' },
        { case: { $lte: ['$daysOverdue', 30] }, then: 'days1to30' },
        { case: { $lte: ['$daysOverdue', 60] }, then: 'days31to60' },
        { case: { $lte: ['$daysOverdue', 90] }, then: 'days61to90' },
      ],
      default: 'days90plus',
    },
  };

  const bucketSum = (bucket) => ({ $sum: { $cond: [{ $eq: ['$bucket', bucket] }, '$balance', 0] } });

  const supplierData = await Purchase.aggregate([
    { $match: baseMatch },
    { $addFields: { effectiveDueDate: { $ifNull: ['$dueDate', '$purchaseDate'] } } },
    {
      $addFields: {
        daysOverdue: {
          $floor: { $divide: [{ $subtract: [asOfDate, '$effectiveDueDate'] }, 1000 * 60 * 60 * 24] },
        },
      },
    },
    { $addFields: { bucket: bucketExpr } },
    { $lookup: { from: 'suppliers', localField: 'supplier', foreignField: '_id', as: 'supplierDoc' } },
    { $unwind: { path: '$supplierDoc', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$supplier',
        supplierName: { $first: { $ifNull: ['$supplierDoc.name', 'Unknown Supplier'] } },
        supplierNameUrdu: { $first: { $ifNull: ['$supplierDoc.nameUrdu', ''] } },
        phone: { $first: '$supplierDoc.phone' },
        whatsapp: { $first: '$supplierDoc.whatsapp' },
        email: { $first: '$supplierDoc.email' },
        current: bucketSum('current'),
        days1to30: bucketSum('days1to30'),
        days31to60: bucketSum('days31to60'),
        days61to90: bucketSum('days61to90'),
        days90plus: bucketSum('days90plus'),
        totalOutstanding: { $sum: '$balance' },
        purchaseCount: { $sum: 1 },
        maxDaysOverdue: { $max: '$daysOverdue' },
        purchases: {
          $push: {
            _id: '$_id',
            invoiceNumber: '$invoiceNumber',
            purchaseDate: '$purchaseDate',
            dueDate: '$effectiveDueDate',
            totalAmount: '$totalAmount',
            paidAmount: '$paidAmount',
            balance: '$balance',
            daysOverdue: '$daysOverdue',
            bucket: '$bucket',
          },
        },
      },
    },
    { $sort: { totalOutstanding: -1 } },
  ]);

  const summary = supplierData.reduce(
    (acc, row) => {
      acc.current += row.current;
      acc.days1to30 += row.days1to30;
      acc.days31to60 += row.days31to60;
      acc.days61to90 += row.days61to90;
      acc.days90plus += row.days90plus;
      acc.totalOutstanding += row.totalOutstanding;
      acc.totalSuppliers += 1;
      if (row.totalOutstanding - row.current > 0) acc.suppliersOverdue += 1;
      return acc;
    },
    {
      current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0,
      totalOutstanding: 0, totalSuppliers: 0, suppliersOverdue: 0,
    }
  );

  res.status(httpStatus.OK).send({ data: supplierData, summary, asOfDate });
});

/* ── Expenses ──────────────────────────────────────────────────────────────── */
const getExpenseReport = catchAsync(async (req, res) => {
  const scope = buildScope(req);
  const { start, end } = parseRange(req.query);
  const { category, groupRecurring } = req.query;

  const baseMatch = { ...scope, date: { $gte: start, $lte: end } };
  if (category) baseMatch.category = category;

  // Auto-generated recurring expenses are tagged with a reference like "AUTO-XXXXXX"
  // (see recurringExpense.service.js). When requested (Complete Report only), split
  // them into their own breakdown, separate from manually-entered expenses, without
  // touching the expense's own stored category.
  const splitRecurring = groupRecurring === 'true';

  const [expenseData, categoryBreakdown, recurringBreakdown, summary, categoryExpenses] = await Promise.all([
    Expense.aggregate([
      { $match: baseMatch },
      { $group: { _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, category: '$category' }, totalAmount: { $sum: '$amount' }, expenseCount: { $sum: 1 } } },
      { $sort: { '_id.date': -1 } },
    ]),
    Expense.aggregate([
      { $match: splitRecurring ? { ...scope, date: { $gte: start, $lte: end }, reference: { $not: /^AUTO-/ } } : { ...scope, date: { $gte: start, $lte: end } } },
      { $group: { _id: '$category', totalAmount: { $sum: '$amount' }, expenseCount: { $sum: 1 }, avgAmount: { $avg: '$amount' } } },
      { $sort: { totalAmount: -1 } },
    ]),
    splitRecurring
      ? Expense.aggregate([
        { $match: { ...scope, date: { $gte: start, $lte: end }, reference: { $regex: /^AUTO-/ } } },
        { $group: { _id: '$category', totalAmount: { $sum: '$amount' }, expenseCount: { $sum: 1 }, avgAmount: { $avg: '$amount' } } },
        { $sort: { totalAmount: -1 } },
      ])
      : Promise.resolve([]),
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
    recurringBreakdown,
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

  // Every product in scope is fetched unfiltered here — the status filter (below,
  // after batch correction) can no longer run as a Mongo $match on the raw
  // Product.stockQuantity field, because that field silently drifts out of sync
  // with the real batch-tracked quantity (see the correction below). Filtering
  // and sorting both happen in JS once the corrected numbers are known, so a
  // product that's actually in stock never gets miscategorized as "Out of Stock"
  // just because its legacy field went stale.
  const inventoryData = await Product.aggregate([
    { $match: { ...scope } },
    { $project: {
      name: 1,
      nameUrdu: { $ifNull: ['$nameUrdu', ''] },
      barcode: 1, unit: 1,
      category: { $ifNull: ['$category', 'N/A'] },
      stockQuantity: 1, cost: 1, price: 1,
      trackImei: { $ifNull: ['$trackImei', false] },
      trackSerial: { $ifNull: ['$trackSerial', false] },
    } },
  ]);

  // Attach each product's active batches (if it — or its hidden default variant for
  // simple products — has trackBatch/trackExpiry enabled), so the report can show
  // expiry/FEFO detail instead of just a stock total. See
  // docs/architecture/universal-product-migration.md.
  const productIds = inventoryData.map((p) => p._id);
  const trackedVariants = productIds.length
    ? await ProductVariant.find({
        productId: { $in: productIds },
        $or: [{ trackBatch: true }, { trackExpiry: true }],
      }).lean()
    : [];
  const variantIds = trackedVariants.map((v) => v._id);
  const variantInventories = variantIds.length
    ? await Inventory.find({ variantId: { $in: variantIds } }).lean()
    : [];
  const inventoryByVariant = new Map(variantInventories.map((inv) => [inv.variantId.toString(), inv]));
  const inventoryIds = variantInventories.map((inv) => inv._id);
  const batchDocs = inventoryIds.length
    ? await Batch.find({ inventoryId: { $in: inventoryIds }, status: 'active' }).sort({ expiryDate: 1 }).lean()
    : [];
  const batchesByInventory = new Map();
  batchDocs.forEach((b) => {
    const key = b.inventoryId.toString();
    if (!batchesByInventory.has(key)) batchesByInventory.set(key, []);
    batchesByInventory.get(key).push({
      batchNumber: b.batchNumber,
      quantity: b.quantity,
      expiryDate: b.expiryDate,
      costPerUnit: b.costPerUnit,
      sellingPrice: b.sellingPrice,
      value: b.quantity * (b.costPerUnit || 0),
    });
  });
  const variantsByProduct = new Map();
  trackedVariants.forEach((v) => {
    const key = v.productId.toString();
    if (!variantsByProduct.has(key)) variantsByProduct.set(key, []);
    variantsByProduct.get(key).push(v);
  });

  // Same idea as batches above, but for IMEI/serial-tracked products — "which units are
  // actually available" is the one thing a plain stock number can't answer for these,
  // so pull the real in-stock numbers instead of just the count. Capped per product so
  // one heavily-serialized product (hundreds of phones) can't blow up the response for
  // every other row in the report; the client gets the true total separately and can
  // say "+N more" instead of silently truncating with no indication.
  const IMEI_PREVIEW_LIMIT = 100;
  const serializedProductIds = inventoryData.filter((p) => p.trackImei || p.trackSerial).map((p) => p._id);
  const [imeiDocs, imeiCounts] = serializedProductIds.length
    ? await Promise.all([
        Imei.find({ productId: { $in: serializedProductIds }, status: 'in_stock' })
          .sort({ createdAt: 1 })
          .limit(serializedProductIds.length * IMEI_PREVIEW_LIMIT)
          .select('productId imei')
          .lean(),
        Imei.aggregate([
          { $match: { productId: { $in: serializedProductIds }, status: 'in_stock' } },
          { $group: { _id: '$productId', count: { $sum: 1 } } },
        ]),
      ])
    : [[], []];
  const imeisByProduct = new Map();
  imeiDocs.forEach((d) => {
    const key = d.productId.toString();
    if (!imeisByProduct.has(key)) imeisByProduct.set(key, []);
    const list = imeisByProduct.get(key);
    if (list.length < IMEI_PREVIEW_LIMIT) list.push(d.imei);
  });
  const imeiTotalByProduct = new Map(imeiCounts.map((c) => [c._id.toString(), c.count]));

  // Batch-tracked products keep their real stock ledger in Batch/Inventory, not
  // Product.stockQuantity/cost/price — those legacy fields are meant to mirror it
  // via dual-write during the migration (see inventory.model.js) but can drift out
  // of sync (a product can show 0/negative stockQuantity while its batches still
  // hold real, positive quantity). Recomputing stockQuantity/cost/price/stockValue
  // from the batches whenever any exist is the fix: it's the same data already
  // rendered in the expandable batch rows below, just summed up to the parent row
  // instead of trusting the possibly-stale product-level snapshot.
  const dataWithBatches = inventoryData.map((p) => {
    const productVariants = variantsByProduct.get(p._id.toString()) || [];
    const batches = productVariants.flatMap((v) => {
      const inv = inventoryByVariant.get(v._id.toString());
      return inv ? batchesByInventory.get(inv._id.toString()) || [] : [];
    });
    const key = p._id.toString();

    let stockQuantity = p.stockQuantity || 0;
    let cost = p.cost || 0;
    let price = p.price || 0;
    let stockValue = stockQuantity * cost;
    let potentialRevenue = stockQuantity * price;

    if (batches.length > 0) {
      const batchQuantity = batches.reduce((sum, b) => sum + (b.quantity || 0), 0);
      const batchCostValue = batches.reduce((sum, b) => sum + (b.quantity || 0) * (b.costPerUnit || 0), 0);
      const batchRevenueValue = batches.reduce(
        (sum, b) => sum + (b.quantity || 0) * (b.sellingPrice != null ? b.sellingPrice : price),
        0
      );
      stockQuantity = batchQuantity;
      stockValue = batchCostValue;
      potentialRevenue = batchRevenueValue;
      cost = batchQuantity > 0 ? batchCostValue / batchQuantity : cost;
      price = batchQuantity > 0 ? batchRevenueValue / batchQuantity : price;
    }

    const status = stockQuantity <= 0 ? 'Out of Stock' : stockQuantity <= 10 ? 'Low Stock' : 'In Stock';

    return {
      ...p,
      stockQuantity,
      cost,
      price,
      stockValue,
      potentialRevenue,
      status,
      batches,
      imeis: imeisByProduct.get(key) || [],
      imeisTotalCount: imeiTotalByProduct.get(key) || 0,
    };
  });

  const summary = dataWithBatches.reduce(
    (acc, p) => {
      acc.totalProducts += 1;
      acc.totalStockQuantity += p.stockQuantity;
      acc.totalStockValue += p.stockValue;
      if (p.status === 'Low Stock') acc.lowStockCount += 1;
      else if (p.status === 'Out of Stock') acc.outOfStockCount += 1;
      return acc;
    },
    { totalProducts: 0, totalStockQuantity: 0, totalStockValue: 0, lowStockCount: 0, outOfStockCount: 0 }
  );

  const filteredData = (status === 'low'
    ? dataWithBatches.filter((p) => p.status === 'Low Stock')
    : status === 'out'
    ? dataWithBatches.filter((p) => p.status === 'Out of Stock')
    : dataWithBatches
  ).sort((a, b) => a.stockQuantity - b.stockQuantity);

  res.status(httpStatus.OK).send({ data: filteredData, summary });
});

/* ── Batch & Expiry (FEFO) ─────────────────────────────────────────────────── */
const getBatchExpiryReport = catchAsync(async (req, res) => {
  const scope = buildScope(req);
  const { days } = req.query;

  const inventoryMatch = {};
  if (scope.organizationId) inventoryMatch.organizationId = scope.organizationId;
  if (scope.branchId) inventoryMatch.branchId = scope.branchId;

  const inventories = await Inventory.find(inventoryMatch).select('_id productId variantId').lean();
  const inventoryIds = inventories.map((inv) => inv._id);
  if (inventoryIds.length === 0) {
    return res.status(httpStatus.OK).send({
      data: [],
      summary: { activeBatches: 0, totalBatchValue: 0, expiringSoonCount: 0, expiredCount: 0 },
    });
  }
  const inventoryById = new Map(inventories.map((inv) => [inv._id.toString(), inv]));

  const batchMatch = { inventoryId: { $in: inventoryIds }, status: 'active' };
  // Without `days`, every active batch is returned (org-wide FEFO view); with it,
  // only batches expiring within that window — same shape as
  // batchService.getExpiringBatches, just not limited to "expiring soon" by default.
  if (days) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + Number(days));
    batchMatch.expiryDate = { $ne: null, $lte: cutoff };
  }

  const batches = await Batch.find(batchMatch).populate('supplierId', 'name').lean();

  const productIds = [...new Set(inventories.map((inv) => inv.productId?.toString()).filter(Boolean))];
  const variantIds = [...new Set(inventories.map((inv) => inv.variantId?.toString()).filter(Boolean))];
  const [products, variants] = await Promise.all([
    Product.find({ _id: { $in: productIds } }).select('name nameUrdu').lean(),
    ProductVariant.find({ _id: { $in: variantIds } }).select('attributes sku').lean(),
  ]);
  const productById = new Map(products.map((p) => [p._id.toString(), p]));
  const variantById = new Map(variants.map((v) => [v._id.toString(), v]));

  const now = Date.now();
  const rows = batches.map((b) => {
    const inv = inventoryById.get(b.inventoryId.toString());
    const product = inv?.productId ? productById.get(inv.productId.toString()) : null;
    const variant = inv?.variantId ? variantById.get(inv.variantId.toString()) : null;
    const variantLabel = variant?.attributes && Object.keys(variant.attributes).length
      ? Object.values(variant.attributes).join(' / ')
      : null;
    const daysUntilExpiry = b.expiryDate
      ? Math.ceil((new Date(b.expiryDate).getTime() - now) / (1000 * 60 * 60 * 24))
      : null;
    return {
      id: b._id,
      productName: product?.name || 'Unknown',
      productNameUrdu: product?.nameUrdu || '',
      variantLabel,
      batchNumber: b.batchNumber,
      quantity: b.quantity,
      costPerUnit: b.costPerUnit,
      sellingPrice: b.sellingPrice,
      expiryDate: b.expiryDate,
      daysUntilExpiry,
      supplierName: b.supplierId?.name || null,
      batchValue: (b.quantity || 0) * (b.costPerUnit || 0),
    };
  });

  // FEFO order — soonest expiry first, batches without an expiry date last.
  rows.sort((a, b) => {
    if (a.expiryDate == null && b.expiryDate == null) return 0;
    if (a.expiryDate == null) return 1;
    if (b.expiryDate == null) return -1;
    return new Date(a.expiryDate) - new Date(b.expiryDate);
  });

  const summary = {
    activeBatches: rows.length,
    totalBatchValue: rows.reduce((s, r) => s + r.batchValue, 0),
    expiringSoonCount: rows.filter((r) => r.daysUntilExpiry != null && r.daysUntilExpiry >= 0 && r.daysUntilExpiry <= 30).length,
    expiredCount: rows.filter((r) => r.daysUntilExpiry != null && r.daysUntilExpiry < 0).length,
  };

  res.status(httpStatus.OK).send({ data: rows, summary });
});

/* ── Stock Adjustments (damage / theft / expired / lost / found / correction) ─── */
const getStockAdjustmentReport = catchAsync(async (req, res) => {
  const scope = buildScope(req);
  const { start, end } = parseRange(req.query);
  const { type, productId } = req.query;

  const baseMatch = { ...scope, createdAt: { $gte: start, $lte: end }, status: 'completed' };
  if (type) baseMatch.type = type;
  if (productId && mongoose.Types.ObjectId.isValid(productId)) {
    baseMatch.productId = new mongoose.Types.ObjectId(productId);
  }

  const [stats, datewise, lineItems] = await Promise.all([
    stockAdjustmentService.getAdjustmentStats({
      organizationId: scope.organizationId,
      branchId: scope.branchId,
      dateFrom: start,
      dateTo: end,
    }),
    StockAdjustment.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: businessDateGroup('$createdAt'),
          count: { $sum: 1 },
          lossValue: { $sum: { $cond: [{ $eq: ['$direction', 'decrease'] }, '$totalValue', 0] } },
          gainValue: { $sum: { $cond: [{ $eq: ['$direction', 'increase'] }, '$totalValue', 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    StockAdjustment.find(baseMatch)
      .sort({ createdAt: -1 })
      .limit(500)
      .populate('createdBy', 'name')
      // variantId/batchId are set whenever the adjustment targeted a real (or batch/
      // expiry-tracked) variant — see resolveTarget in stockAdjustment.service.js —
      // but the report never surfaced them, so an adjustment against a specific batch
      // looked identical to one against the whole product.
      .populate('variantId', 'attributes')
      .populate('batchId', 'batchNumber expiryDate')
      .lean(),
  ]);

  const formattedLineItems = lineItems.map((adj) => ({
    id: adj._id,
    date: adj.createdAt,
    productName: adj.productName,
    type: adj.type,
    direction: adj.direction,
    quantity: adj.quantity,
    previousQuantity: adj.previousQuantity,
    newQuantity: adj.newQuantity,
    unitCost: adj.unitCost,
    totalValue: adj.totalValue,
    reason: adj.reason || '',
    status: adj.status,
    createdByName: adj.createdBy?.name || '',
    variantLabel: adj.variantId?.attributes
      ? Object.values(adj.variantId.attributes).join(' / ') || null
      : null,
    batchNumber: adj.batchId?.batchNumber || null,
    expiryDate: adj.batchId?.expiryDate || null,
    imeis: adj.imeis || [],
  }));

  res.status(httpStatus.OK).send({
    summary: { totalAdjustments: stats.totalAdjustments, totalLossValue: stats.totalLossValue },
    byType: stats.byType,
    datewise,
    lineItems: formattedLineItems,
    period: { startDate: start, endDate: end },
  });
});

/* ── Stock Transfers (inter-branch inventory movement) ────────────────────────
 * InventoryTransfer isn't branch-scoped the way most collections are — it has
 * fromBranchId/toBranchId, not a single branchId — so buildScope()'s branchId can't be
 * spread onto the match like every other report does; it has to become an explicit
 * $or (or a single-side match when `direction` narrows it), mirroring queryTransfers
 * in inventoryTransfer.service.js. */
const getStockTransferReport = catchAsync(async (req, res) => {
  const scope = buildScope(req);
  const { start, end } = parseRange(req.query);
  const { status, direction, productId } = req.query;

  const baseMatch = { organizationId: scope.organizationId, createdAt: { $gte: start, $lte: end } };
  if (scope.branchId) {
    if (direction === 'outgoing') baseMatch.fromBranchId = scope.branchId;
    else if (direction === 'incoming') baseMatch.toBranchId = scope.branchId;
    else baseMatch.$or = [{ fromBranchId: scope.branchId }, { toBranchId: scope.branchId }];
  }
  if (status) baseMatch.status = status;
  if (productId && mongoose.Types.ObjectId.isValid(productId)) {
    const pid = new mongoose.Types.ObjectId(productId);
    const productMatch = { $or: [{ fromProductId: pid }, { toProductId: pid }] };
    // Branch scoping above may already own the top-level $or — combine both with $and
    // instead of letting the second one silently overwrite the first.
    if (baseMatch.$or) {
      baseMatch.$and = [{ $or: baseMatch.$or }, productMatch];
      delete baseMatch.$or;
    } else {
      Object.assign(baseMatch, productMatch);
    }
  }

  const [datewise, statusAgg, transfers] = await Promise.all([
    InventoryTransfer.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: businessDateGroup('$createdAt'),
          count: { $sum: 1 },
          quantity: { $sum: '$quantity' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    // Separate aggregate for status/quantity totals — the line-item list below is
    // capped at 500 for display, and summing off that capped list would silently
    // undercount an org with more transfers than that in range.
    InventoryTransfer.aggregate([
      { $match: baseMatch },
      { $group: { _id: '$status', count: { $sum: 1 }, quantity: { $sum: '$quantity' } } },
    ]),
    InventoryTransfer.find(baseMatch)
      .sort({ createdAt: -1 })
      .limit(500)
      .populate('fromBranchId', 'name')
      .populate('toBranchId', 'name')
      .populate('decidedBy', 'name')
      .lean(),
  ]);

  const statusCounts = {};
  let totalTransfers = 0;
  let totalUnitsMoved = 0;
  statusAgg.forEach((s) => {
    statusCounts[s._id] = s.count;
    totalTransfers += s.count;
    totalUnitsMoved += s.quantity || 0;
  });

  // Only meaningful when scoped to one product — a transfer where this product was
  // the source ('out') vs the destination ('in'), so a caller like the Product Details
  // dialog can sum how much of this specific product's stock moved each way. Left
  // undefined for the unscoped report (a transfer has no single "product" to be
  // relative to there).
  const productFilter = productId && mongoose.Types.ObjectId.isValid(productId) ? String(productId) : null;

  const lineItems = transfers.map((tr) => ({
    id: tr._id,
    date: tr.createdAt,
    productName: tr.productName,
    fromBranchName: tr.fromBranchId?.name || '',
    toBranchName: tr.toBranchId?.name || '',
    quantity: tr.quantity,
    imeis: tr.imeis || [],
    batchNumber: tr.batchSnapshot?.batchNumber || '',
    reason: tr.reason || '',
    status: tr.status,
    decidedByName: tr.decidedBy?.name || '',
    completedAt: tr.completedAt || null,
    productDirection: productFilter ? (String(tr.fromProductId) === productFilter ? 'out' : 'in') : undefined,
  }));

  res.status(httpStatus.OK).send({
    summary: { totalTransfers, totalUnitsMoved, statusCounts },
    datewise,
    lineItems,
    period: { startDate: start, endDate: end },
  });
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
    // Only expenses actually paid count against profit — auto-generated recurring
    // cycles sit as isPaid:false placeholders until confirmed paid (see expense.model.js).
    aggregateSum(Expense, { ...scope, date: { $gte: from, $lte: to }, isPaid: { $ne: false } }, '$amount'),
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
    loadPurchaseProfit,
    loadSaleProfit,
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
    // Load profit has two sources: supplier commission/discount captured when buying load...
    aggregateSum(LoadPurchase, { ...scope, date: { $gte: from, $lte: to } }, { $ifNull: ['$profit', 0] }),
    // ...and any extra charge captured when selling load to a customer.
    aggregateSum(LoadTransaction, { ...scope, date: { $gte: from, $lte: to } }, { $ifNull: ['$profit', 0] }),
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

  const loadProfit = loadPurchaseProfit + loadSaleProfit;

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
    loadPurchaseProfitByMonth,
    loadSaleProfitByMonth,
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
    // Only expenses actually paid count against profit — see isPaid note above.
    monthlySum(Expense, 'date', '$amount', { isPaid: { $ne: false } }),
    monthlySum(Invoice, 'invoiceDate', { $ifNull: ['$totalProfit', 0] }, { status: { $ne: 'cancelled' } }),
    // Load profit has two sources: supplier commission/discount at purchase time...
    monthlySum(LoadPurchase, 'date', { $ifNull: ['$profit', 0] }),
    // ...and extra charge captured at sale time.
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
    ...Object.keys(loadPurchaseProfitByMonth),
    ...Object.keys(loadSaleProfitByMonth),
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
      + (loadPurchaseProfitByMonth[month] || 0)
      + (loadSaleProfitByMonth[month] || 0)
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
    unpaidExpenseAgg,
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
    // Expenses — only ones actually paid count against profit. Auto-generated
    // recurring cycles sit as isPaid:false placeholders until confirmed paid
    // (see expense.model.js), so they shouldn't drag profit down before that.
    Expense.aggregate([
      { $match: { ...scope, date: { $gte: from, $lte: to }, isPaid: { $ne: false } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    // Pending recurring expenses due this period but not yet marked paid —
    // informational only, so the user can see what's coming without it
    // dragging down the profit figure above.
    Expense.aggregate([
      { $match: { ...scope, date: { $gte: from, $lte: to }, isPaid: false } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
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
  const unpaidExp = unpaidExpenseAgg[0] || { total: 0, count: 0 };
  const pur     = purchaseAgg[0]       || { total: 0 };
  const currentInventoryValue = stockAgg[0]?.total  || 0;
  const currentWalletBalance  = walletAgg[0]?.total || 0;

  const totalRevenue      = inv.totalRevenue;
  const salesReturns      = sr.total;
  const netRevenue        = totalRevenue - salesReturns;
  const costOfGoodsSold   = inv.totalCost;
  const grossProfit       = netRevenue - costOfGoodsSold;

  const loadProfit        = ld.total + ldp.total;
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
    unpaidExpenses:      parseFloat(unpaidExp.total.toFixed(2)),
    unpaidExpensesCount: unpaidExp.count,
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

  const [datewise, summary, productwise, lineItems] = await Promise.all([
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

    // Per-line detail (which variant/batch was actually returned), newest first.
    SalesReturn.aggregate([
      { $match: baseMatch },
      { $unwind: '$items' },
      ...(productId && mongoose.Types.ObjectId.isValid(productId)
        ? [{ $match: { 'items.productId': new mongoose.Types.ObjectId(productId) } }]
        : []),
      {
        $lookup: {
          from: ProductVariant.collection.name,
          let: { vid: '$items.variantId' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$_id', '$$vid'] }, { $ne: ['$$vid', null] }] } } },
            { $project: { attributes: 1 } },
          ],
          as: 'variantDoc',
        },
      },
      { $unwind: { path: '$variantDoc', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: Batch.collection.name,
          let: { bid: '$items.batchId' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$_id', '$$bid'] }, { $ne: ['$$bid', null] }] } } },
            { $project: { expiryDate: 1 } },
          ],
          as: 'batchDoc',
        },
      },
      { $unwind: { path: '$batchDoc', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          returnNumber: 1,
          date: 1,
          productName: '$items.name',
          productNameUrdu: { $ifNull: ['$items.nameUrdu', ''] },
          quantity: '$items.quantity',
          total: '$items.total',
          variantId: { $ifNull: ['$items.variantId', null] },
          batchNumber: { $ifNull: ['$items.batchNumber', null] },
          expiryDate: { $ifNull: ['$batchDoc.expiryDate', null] },
          variantLabel: { $let: { vars: { item: '$items' }, in: variantLabelExpr('item') } },
        },
      },
      { $sort: { date: -1 } },
      { $limit: 200 },
    ]),
  ]);

  res.status(httpStatus.OK).send({
    summary: summary[0] || { totalReturnsAmount: 0, totalReturns: 0, totalItemsReturned: 0 },
    datewise,
    productwise,
    lineItems,
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

  const [datewise, summary, productwise, lineItems] = await Promise.all([
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

    // Per-line detail (which variant/batch was actually returned), newest first.
    // Purchase items store expiryDate directly — no Batch lookup needed.
    PurchaseReturn.aggregate([
      { $match: baseMatch },
      { $unwind: '$items' },
      ...(productId && mongoose.Types.ObjectId.isValid(productId)
        ? [{ $match: { 'items.productId': new mongoose.Types.ObjectId(productId) } }]
        : []),
      {
        $lookup: {
          from: ProductVariant.collection.name,
          let: { vid: '$items.variantId' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$_id', '$$vid'] }, { $ne: ['$$vid', null] }] } } },
            { $project: { attributes: 1 } },
          ],
          as: 'variantDoc',
        },
      },
      { $unwind: { path: '$variantDoc', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          returnNumber: 1,
          date: 1,
          productName: '$items.name',
          productNameUrdu: { $ifNull: ['$items.nameUrdu', ''] },
          quantity: '$items.quantity',
          total: '$items.total',
          variantId: { $ifNull: ['$items.variantId', null] },
          batchNumber: { $ifNull: ['$items.batchNumber', null] },
          expiryDate: { $ifNull: ['$items.expiryDate', null] },
          variantLabel: { $let: { vars: { item: '$items' }, in: variantLabelExpr('item') } },
        },
      },
      { $sort: { date: -1 } },
      { $limit: 200 },
    ]),
  ]);

  res.status(httpStatus.OK).send({
    summary: summary[0] || { totalReturnsAmount: 0, totalReturns: 0, totalItemsReturned: 0 },
    datewise,
    productwise,
    lineItems,
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
      { $group: { _id: businessDateGroup('$date'), transactions: { $sum: 1 }, totalSold: { $sum: '$amount' }, totalProfit: { $sum: '$profit' } } },
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
          _id: businessDateGroup('$date'),
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

/* ── Wallet-wise (Sim-wise) Report ─────────────────────────────────────────── */
/**
 * Combines Cash Management (CashWithdrawal), Load (LoadTransaction/LoadPurchase)
 * and Sim Sale records into one wallet-by-wallet ("sim-wise") breakdown with
 * full transaction detail, for every wallet in one pass (no per-wallet loop).
 */
async function getWalletWiseReport(req, res) {
  const scope = buildScope(req);
  const { start, end } = parseRange(req.query);
  const dateMatch = { ...scope, date: { $gte: start, $lte: end } };

  const [wallets, cashRows, loadRows, loadPurchaseRows, simSaleRows, walletTransferRows] = await Promise.all([
    Wallet.find(scope).sort({ type: 1 }).lean(),
    CashWithdrawal.find(dateMatch)
      .select('walletType transactionType amount cashAmount profit customerName customerNumber customerCNIC customerAccountType date')
      .sort({ date: -1 })
      .lean(),
    LoadTransaction.find(dateMatch)
      .select('walletType mobileNumber customerName network amount profit paymentMethod date')
      .sort({ date: -1 })
      .lean(),
    LoadPurchase.find(dateMatch)
      .select('walletType supplierName amount profit date')
      .sort({ date: -1 })
      .lean(),
    SimSale.find(dateMatch)
      .select('walletType productName customerName customerMobile customerCNIC loadAmount purchaseAmount saleAmount commission date')
      .sort({ date: -1 })
      .lean(),
    WalletTransfer.find(dateMatch)
      .select('walletType direction amount notes date')
      .sort({ date: -1 })
      .lean(),
  ]);

  const bucket = () => ({
    cash: { withdrawals: 0, deposits: 0, withdrawalAmount: 0, depositAmount: 0, profit: 0, transactions: [] },
    load: { sold: 0, purchased: 0, profit: 0, transactions: [] },
    simSale: { count: 0, saleAmount: 0, loadAmount: 0, purchaseAmount: 0, commission: 0, transactions: [] },
  });
  const byWalletType = new Map();
  const getBucket = (walletType) => {
    const key = walletType || 'unknown';
    if (!byWalletType.has(key)) byWalletType.set(key, bucket());
    return byWalletType.get(key);
  };

  cashRows.forEach((row) => {
    const b = getBucket(row.walletType).cash;
    const isWithdrawal = row.transactionType === 'withdrawal';
    if (isWithdrawal) {
      b.withdrawals += 1;
      b.withdrawalAmount += row.amount || 0;
    } else {
      b.deposits += 1;
      b.depositAmount += row.amount || 0;
    }
    b.profit += row.profit || 0;
    b.transactions.push({
      id: String(row._id),
      date: row.date,
      type: row.transactionType,
      customerName: row.customerName || '',
      customerNumber: row.customerNumber || '',
      customerCNIC: row.customerCNIC || '',
      accountType: row.customerAccountType || '',
      amount: row.amount || 0,
      cashAmount: row.cashAmount || 0,
      profit: row.profit || 0,
    });
  });

  // Wallet ⇄ My Account transfers land in the same per-wallet "cash" bucket as customer
  // withdrawals/deposits — 'account_to_wallet' increases the wallet (like a withdrawal),
  // 'wallet_to_account' decreases it (like a deposit) — with "My Account" standing in for
  // the customer, so this wallet's full send/receive history stays in one place.
  walletTransferRows.forEach((row) => {
    const b = getBucket(row.walletType).cash;
    const isWithdrawal = row.direction === 'account_to_wallet';
    if (isWithdrawal) {
      b.withdrawals += 1;
      b.withdrawalAmount += row.amount || 0;
    } else {
      b.deposits += 1;
      b.depositAmount += row.amount || 0;
    }
    b.transactions.push({
      id: String(row._id),
      date: row.date,
      type: isWithdrawal ? 'withdrawal' : 'deposit',
      customerName: 'My Personal Account',
      customerNumber: '',
      customerCNIC: '',
      accountType: '',
      amount: row.amount || 0,
      cashAmount: 0,
      profit: 0,
    });
  });

  loadRows.forEach((row) => {
    const b = getBucket(row.walletType).load;
    b.sold += row.amount || 0;
    b.profit += row.profit || 0;
    b.transactions.push({
      id: String(row._id),
      date: row.date,
      kind: 'sale',
      customerName: row.customerName || '',
      mobileNumber: row.mobileNumber || '',
      network: row.network || '',
      amount: row.amount || 0,
      profit: row.profit || 0,
      paymentMethod: row.paymentMethod || '',
    });
  });

  loadPurchaseRows.forEach((row) => {
    const b = getBucket(row.walletType).load;
    b.purchased += row.amount || 0;
    b.profit += row.profit || 0;
    b.transactions.push({
      id: String(row._id),
      date: row.date,
      kind: 'purchase',
      customerName: row.supplierName || '',
      amount: row.amount || 0,
      profit: row.profit || 0,
    });
  });

  simSaleRows.forEach((row) => {
    const b = getBucket(row.walletType).simSale;
    b.count += 1;
    b.saleAmount += row.saleAmount || 0;
    b.loadAmount += row.loadAmount || 0;
    b.purchaseAmount += row.purchaseAmount || 0;
    b.commission += row.commission || 0;
    b.transactions.push({
      id: String(row._id),
      date: row.date,
      productName: row.productName || '',
      customerName: row.customerName || '',
      customerMobile: row.customerMobile || '',
      customerCNIC: row.customerCNIC || '',
      saleAmount: row.saleAmount || 0,
      loadAmount: row.loadAmount || 0,
      purchaseAmount: row.purchaseAmount || 0,
      commission: row.commission || 0,
    });
  });

  const walletList = wallets.map((wallet) => {
    const b = byWalletType.get(wallet.type) || bucket();
    const totalProfit = b.cash.profit + b.load.profit + b.simSale.commission;
    const totalTransactions =
      b.cash.transactions.length + b.load.transactions.length + b.simSale.transactions.length;
    byWalletType.delete(wallet.type);
    return {
      walletId: String(wallet._id),
      walletType: wallet.type,
      currentBalance: wallet.balance || 0,
      isLoadWallet: isLoadWalletName(wallet.type),
      cash: b.cash,
      load: b.load,
      simSale: b.simSale,
      totals: { transactions: totalTransactions, profit: totalProfit },
    };
  });

  // Wallet types referenced by transactions but with no matching Wallet doc (e.g. deleted wallet)
  byWalletType.forEach((b, walletType) => {
    const totalProfit = b.cash.profit + b.load.profit + b.simSale.commission;
    const totalTransactions =
      b.cash.transactions.length + b.load.transactions.length + b.simSale.transactions.length;
    walletList.push({
      walletId: null,
      walletType,
      currentBalance: 0,
      isLoadWallet: isLoadWalletName(walletType),
      cash: b.cash,
      load: b.load,
      simSale: b.simSale,
      totals: { transactions: totalTransactions, profit: totalProfit },
    });
  });

  res.status(httpStatus.OK).send({
    wallets: walletList,
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
    walletExpenses,
    walletTransfers,
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
    PersonalLedger.find({
      ...scope,
      ...dateMatch('transactionDate'),
      transactionType: 'expense',
    })
      .select('transactionType transactionDate description category reference debit credit balance paymentMethod notes')
      .lean(),
    WalletTransfer.find({ ...scope, ...dateMatch('date') })
      .select('walletType direction amount notes date')
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

  // Wallet ⇄ My Account transfers — grouped under the same "Cash Management" module as
  // CashWithdrawal (customer cash⇄wallet exchanges) so the Activity Summary shows every
  // wallet send/receive movement together, with "My Account" standing in for the customer.
  walletTransfers.forEach((wt) => {
    const isReceive = wt.direction === 'account_to_wallet';
    entries.push({
      id: String(wt._id),
      date: wt.date,
      module: 'Cash Management',
      subType: isReceive ? 'Transfer from My Personal Account' : 'Transfer to My Personal Account',
      reference: '',
      party: 'My Personal Account',
      partyPhone: '',
      paymentType: 'Wallet',
      direction: isReceive ? 'in' : 'out',
      totalAmount: wt.amount || 0,
      paidAmount: wt.amount || 0,
      balance: 0,
      description: `${isReceive ? 'Receive' : 'Send'} via ${wt.walletType || 'wallet'}`,
      details: `Wallet: ${wt.walletType || ''} | Account: My Personal Account${wt.notes ? ` | ${wt.notes}` : ''}`,
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

  walletExpenses.forEach((entry) => {
    const amount = entry.debit || 0;
    entries.push({
      id: String(entry._id),
      date: entry.transactionDate,
      module: 'My Wallet',
      subType: 'Wallet Expense',
      reference: entry.reference || '',
      party: entry.category || 'My Wallet',
      partyPhone: '',
      paymentType: capitalize(entry.paymentMethod) || 'Cash',
      direction: 'out',
      totalAmount: amount,
      paidAmount: amount,
      balance: 0,
      description: entry.description || 'Wallet expense',
      details: [entry.category, entry.notes].filter(Boolean).join(' | '),
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

const roundReportAmount = (value) => parseFloat((value || 0).toFixed(2));

const aggregateSumCount = async (Model, match, sumExpr) => {
  const result = await Model.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: sumExpr }, count: { $sum: 1 } } },
  ]);
  return { amount: result[0]?.total || 0, count: result[0]?.count || 0 };
};

const monthlyAmountMap = async (Model, dateField, sumExpr, match = {}) => {
  const results = await Model.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: `$${dateField}`, timezone: BUSINESS_TZ } },
        total: { $sum: sumExpr },
      },
    },
  ]);
  return results.reduce((acc, row) => {
    acc[row._id] = row.total || 0;
    return acc;
  }, {});
};

const mergeMonthlyTotals = (...maps) => {
  const merged = {};
  maps.forEach((map) => {
    Object.entries(map).forEach(([month, amount]) => {
      merged[month] = (merged[month] || 0) + (amount || 0);
    });
  });
  return merged;
};

const billPaymentDateMatch = (start, end) => ({
  $or: [
    { paymentDate: { $gte: start, $lte: end } },
    { paymentDate: { $in: [null, undefined] }, createdAt: { $gte: start, $lte: end } },
  ],
});

const getSalesPurchaseSummaryReport = catchAsync(async (req, res) => {
  const scope = buildScope(req);
  const { start, end } = parseRange(req.query);
  const dateRange = (field) => ({ [field]: { $gte: start, $lte: end } });

  const [
    salesInvoices,
    purchases,
    salesReturns,
    purchaseReturns,
    expenses,
    loadSales,
    loadPurchases,
    cashReceived,
    cashSent,
    simSales,
    simPurchases,
    repairSales,
    repairPurchases,
    services,
    billSales,
    billPurchases,
    installments,
    customerReceived,
    customerPaid,
    supplierReceived,
    supplierPaid,
    walletExpenses,
    walletTransferReceived,
    walletTransferSent,
  ] = await Promise.all([
    aggregateSumCount(
      Invoice,
      { ...scope, ...dateRange('invoiceDate'), status: { $ne: 'cancelled' } },
      '$total',
    ),
    aggregateSumCount(Purchase, { ...scope, ...dateRange('purchaseDate') }, '$totalAmount'),
    aggregateSumCount(
      SalesReturn,
      { ...scope, ...dateRange('date'), status: { $ne: 'rejected' } },
      '$totalAmount',
    ),
    aggregateSumCount(
      PurchaseReturn,
      { ...scope, ...dateRange('date'), status: { $ne: 'rejected' } },
      '$totalAmount',
    ),
    aggregateSumCount(Expense, { ...scope, ...dateRange('date') }, '$amount'),
    aggregateSumCount(LoadTransaction, { ...scope, ...dateRange('date') }, { $ifNull: ['$receivedAmount', '$amount'] }),
    aggregateSumCount(LoadPurchase, { ...scope, ...dateRange('date') }, '$amount'),
    aggregateSumCount(
      CashWithdrawal,
      { ...scope, ...dateRange('date'), transactionType: 'withdrawal' },
      '$amount',
    ),
    aggregateSumCount(
      CashWithdrawal,
      { ...scope, ...dateRange('date'), transactionType: 'deposit' },
      '$amount',
    ),
    aggregateSumCount(SimSale, { ...scope, ...dateRange('date') }, '$saleAmount'),
    aggregateSumCount(SimSale, { ...scope, ...dateRange('date') }, '$purchaseAmount'),
    aggregateSumCount(RepairJob, { ...scope, ...dateRange('date') }, '$charges'),
    aggregateSumCount(RepairJob, { ...scope, ...dateRange('date') }, { $ifNull: ['$cost', 0] }),
    aggregateSumCount(ServiceInvoice, { ...scope, ...dateRange('date') }, '$totalAmount'),
    aggregateSumCount(
      BillPayment,
      { ...scope, ...billPaymentDateMatch(start, end) },
      '$totalReceived',
    ),
    aggregateSumCount(
      BillPayment,
      { ...scope, ...billPaymentDateMatch(start, end) },
      '$billAmount',
    ),
    aggregateSumCount(InstallmentPayment, { ...scope, ...dateRange('date') }, '$amount'),
    aggregateSumCount(
      CustomerLedger,
      { ...scope, ...dateRange('transactionDate'), transactionType: 'payment_received' },
      '$credit',
    ),
    aggregateSumCount(
      CustomerLedger,
      { ...scope, ...dateRange('transactionDate'), transactionType: 'payment_made' },
      '$debit',
    ),
    aggregateSumCount(
      SupplierLedger,
      { ...scope, ...dateRange('transactionDate'), transactionType: 'payment_received' },
      '$credit',
    ),
    aggregateSumCount(
      SupplierLedger,
      { ...scope, ...dateRange('transactionDate'), transactionType: 'payment_made' },
      '$debit',
    ),
    aggregateSumCount(
      PersonalLedger,
      { ...scope, ...dateRange('transactionDate'), transactionType: 'expense' },
      '$debit',
    ),
    aggregateSumCount(
      WalletTransfer,
      { ...scope, ...dateRange('date'), direction: 'account_to_wallet' },
      '$amount',
    ),
    aggregateSumCount(
      WalletTransfer,
      { ...scope, ...dateRange('date'), direction: 'wallet_to_account' },
      '$amount',
    ),
  ]);

  const modules = [
    { module: 'Sales', sales: salesInvoices.amount, purchases: 0, salesCount: salesInvoices.count, purchaseCount: 0, mobileOnly: false },
    { module: 'Purchases', sales: 0, purchases: purchases.amount, salesCount: 0, purchaseCount: purchases.count, mobileOnly: false },
    { module: 'Sales Returns', sales: 0, purchases: salesReturns.amount, salesCount: 0, purchaseCount: salesReturns.count, mobileOnly: false },
    { module: 'Purchase Returns', sales: purchaseReturns.amount, purchases: 0, salesCount: purchaseReturns.count, purchaseCount: 0, mobileOnly: false },
    { module: 'Load Sale', sales: loadSales.amount, purchases: 0, salesCount: loadSales.count, purchaseCount: 0, mobileOnly: true },
    { module: 'Load Purchase', sales: 0, purchases: loadPurchases.amount, salesCount: 0, purchaseCount: loadPurchases.count, mobileOnly: true },
    // Wallet ⇄ My Account transfers are folded in here — an "account_to_wallet" transfer
    // increases the wallet just like a customer cash withdrawal does, and "wallet_to_account"
    // decreases it just like a customer deposit, so they belong in the same Received/Sent totals.
    { module: 'Cash Received', sales: cashReceived.amount + walletTransferReceived.amount, purchases: 0, salesCount: cashReceived.count + walletTransferReceived.count, purchaseCount: 0, mobileOnly: true },
    { module: 'Cash Sent', sales: 0, purchases: cashSent.amount + walletTransferSent.amount, salesCount: 0, purchaseCount: cashSent.count + walletTransferSent.count, mobileOnly: true },
    { module: 'Sim Sale', sales: simSales.amount, purchases: simPurchases.amount, salesCount: simSales.count, purchaseCount: simPurchases.count, mobileOnly: true },
    { module: 'Repairing', sales: repairSales.amount, purchases: repairPurchases.amount, salesCount: repairSales.count, purchaseCount: repairPurchases.count, mobileOnly: true },
    { module: 'Services', sales: services.amount, purchases: 0, salesCount: services.count, purchaseCount: 0, mobileOnly: true },
    { module: 'Bill Payments', sales: billSales.amount, purchases: billPurchases.amount, salesCount: billSales.count, purchaseCount: billPurchases.count, mobileOnly: true },
    { module: 'Installments', sales: installments.amount, purchases: 0, salesCount: installments.count, purchaseCount: 0, mobileOnly: true },
    { module: 'Expenses', sales: 0, purchases: expenses.amount, salesCount: 0, purchaseCount: expenses.count, mobileOnly: false },
    { module: 'Customer Payments', sales: customerReceived.amount, purchases: customerPaid.amount, salesCount: customerReceived.count, purchaseCount: customerPaid.count, mobileOnly: false },
    { module: 'Supplier Payments', sales: supplierReceived.amount, purchases: supplierPaid.amount, salesCount: supplierReceived.count, purchaseCount: supplierPaid.count, mobileOnly: false },
    { module: 'Wallet Expense', sales: 0, purchases: walletExpenses.amount, salesCount: 0, purchaseCount: walletExpenses.count, mobileOnly: true },
  ].map((row) => ({
    ...row,
    sales: roundReportAmount(row.sales),
    purchases: roundReportAmount(row.purchases),
  }));

  const totalSales = roundReportAmount(modules.reduce((sum, row) => sum + row.sales, 0));
  const totalPurchases = roundReportAmount(modules.reduce((sum, row) => sum + row.purchases, 0));
  const salesTransactions = modules.reduce((sum, row) => sum + row.salesCount, 0);
  const purchaseTransactions = modules.reduce((sum, row) => sum + row.purchaseCount, 0);

  const [
    salesByMonth,
    purchaseReturnsByMonth,
    loadSalesByMonth,
    cashReceivedByMonth,
    simSalesByMonth,
    repairSalesByMonth,
    servicesByMonth,
    billSalesByMonth,
    installmentsByMonth,
    customerReceivedByMonth,
    supplierReceivedByMonth,
    purchasesByMonth,
    salesReturnsByMonth,
    expensesByMonth,
    loadPurchasesByMonth,
    cashSentByMonth,
    simPurchasesByMonth,
    repairPurchasesByMonth,
    billPurchasesByMonth,
    customerPaidByMonth,
    supplierPaidByMonth,
    walletExpensesByMonth,
    walletTransferReceivedByMonth,
    walletTransferSentByMonth,
  ] = await Promise.all([
    monthlyAmountMap(Invoice, 'invoiceDate', '$total', { ...scope, ...dateRange('invoiceDate'), status: { $ne: 'cancelled' } }),
    monthlyAmountMap(PurchaseReturn, 'date', '$totalAmount', { ...scope, ...dateRange('date'), status: { $ne: 'rejected' } }),
    monthlyAmountMap(LoadTransaction, 'date', { $ifNull: ['$receivedAmount', '$amount'] }, { ...scope, ...dateRange('date') }),
    monthlyAmountMap(CashWithdrawal, 'date', '$amount', { ...scope, ...dateRange('date'), transactionType: 'withdrawal' }),
    monthlyAmountMap(SimSale, 'date', '$saleAmount', { ...scope, ...dateRange('date') }),
    monthlyAmountMap(RepairJob, 'date', '$charges', { ...scope, ...dateRange('date') }),
    monthlyAmountMap(ServiceInvoice, 'date', '$totalAmount', { ...scope, ...dateRange('date') }),
    monthlyAmountMap(BillPayment, 'paymentDate', '$totalReceived', { ...scope, ...billPaymentDateMatch(start, end) }),
    monthlyAmountMap(InstallmentPayment, 'date', '$amount', { ...scope, ...dateRange('date') }),
    monthlyAmountMap(CustomerLedger, 'transactionDate', '$credit', { ...scope, ...dateRange('transactionDate'), transactionType: 'payment_received' }),
    monthlyAmountMap(SupplierLedger, 'transactionDate', '$credit', { ...scope, ...dateRange('transactionDate'), transactionType: 'payment_received' }),
    monthlyAmountMap(Purchase, 'purchaseDate', '$totalAmount', { ...scope, ...dateRange('purchaseDate') }),
    monthlyAmountMap(SalesReturn, 'date', '$totalAmount', { ...scope, ...dateRange('date'), status: { $ne: 'rejected' } }),
    monthlyAmountMap(Expense, 'date', '$amount', { ...scope, ...dateRange('date') }),
    monthlyAmountMap(LoadPurchase, 'date', '$amount', { ...scope, ...dateRange('date') }),
    monthlyAmountMap(CashWithdrawal, 'date', '$amount', { ...scope, ...dateRange('date'), transactionType: 'deposit' }),
    monthlyAmountMap(SimSale, 'date', '$purchaseAmount', { ...scope, ...dateRange('date') }),
    monthlyAmountMap(RepairJob, 'date', { $ifNull: ['$cost', 0] }, { ...scope, ...dateRange('date') }),
    monthlyAmountMap(BillPayment, 'paymentDate', '$billAmount', { ...scope, ...billPaymentDateMatch(start, end) }),
    monthlyAmountMap(CustomerLedger, 'transactionDate', '$debit', { ...scope, ...dateRange('transactionDate'), transactionType: 'payment_made' }),
    monthlyAmountMap(SupplierLedger, 'transactionDate', '$debit', { ...scope, ...dateRange('transactionDate'), transactionType: 'payment_made' }),
    monthlyAmountMap(PersonalLedger, 'transactionDate', '$debit', { ...scope, ...dateRange('transactionDate'), transactionType: 'expense' }),
    monthlyAmountMap(WalletTransfer, 'date', '$amount', { ...scope, ...dateRange('date'), direction: 'account_to_wallet' }),
    monthlyAmountMap(WalletTransfer, 'date', '$amount', { ...scope, ...dateRange('date'), direction: 'wallet_to_account' }),
  ]);

  const monthlySalesMap = mergeMonthlyTotals(
    salesByMonth,
    purchaseReturnsByMonth,
    loadSalesByMonth,
    cashReceivedByMonth,
    simSalesByMonth,
    repairSalesByMonth,
    servicesByMonth,
    billSalesByMonth,
    installmentsByMonth,
    customerReceivedByMonth,
    supplierReceivedByMonth,
    walletTransferReceivedByMonth,
  );
  const monthlyPurchasesMap = mergeMonthlyTotals(
    purchasesByMonth,
    salesReturnsByMonth,
    expensesByMonth,
    loadPurchasesByMonth,
    cashSentByMonth,
    simPurchasesByMonth,
    repairPurchasesByMonth,
    billPurchasesByMonth,
    customerPaidByMonth,
    supplierPaidByMonth,
    walletExpensesByMonth,
    walletTransferSentByMonth,
  );

  const monthly = Array.from(
    new Set([...Object.keys(monthlySalesMap), ...Object.keys(monthlyPurchasesMap)]),
  )
    .sort()
    .map((month) => ({
      month,
      sales: roundReportAmount(monthlySalesMap[month] || 0),
      purchases: roundReportAmount(monthlyPurchasesMap[month] || 0),
    }));

  const organizationId = req.organizationId || req.user?.organizationId;
  // Scoped to the selected date range, not the all-time balance — so "Cash In Hand" here
  // reconciles with the rest of this report (which is all period-filtered), and the
  // opening balance doubles as "cash in hand as of the start of this period".
  const [cashBookSummary, cashByModule] = await Promise.all([
    cashBookService.getCashInHandSummary({
      organizationId,
      branchId: req.branchId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    }),
    cashBookService.getCashInHandByModule({
      organizationId,
      branchId: req.branchId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    }),
  ]);

  res.status(httpStatus.OK).send({
    summary: {
      totalSales,
      totalPurchases,
      totalExpenses: roundReportAmount(expenses.amount),
      expenseCount: expenses.count,
      myWalletExpense: roundReportAmount(walletExpenses.amount),
      myWalletExpenseCount: walletExpenses.count,
      previousCashInHand: roundReportAmount(cashBookSummary.openingBalance),
      cashInHand: roundReportAmount(cashBookSummary.closingBalance),
      periodCashIn: roundReportAmount(cashBookSummary.totalIncome),
      periodCashOut: roundReportAmount(cashBookSummary.totalExpense),
      salesTransactions,
      purchaseTransactions,
    },
    cashByModule: cashByModule.map((row) => ({
      module: row.module,
      income: roundReportAmount(row.income),
      expense: roundReportAmount(row.expense),
      net: roundReportAmount(row.net),
    })),
    modules,
    monthly,
    period: { startDate: start, endDate: end },
  });
});

/**
 * Compact, single-glance "what did I sell today" report — the sales-side subset of
 * getSalesPurchaseSummaryReport's modules (no purchases/expenses/ledger payments), plus
 * New/Used Mobile phone sales and Installment collections which that report doesn't cover.
 * Reuses mobileDashboardService's aggregation (rather than re-deriving amounts/profit here)
 * so these numbers always agree with the Dashboard's mobile-shop KPI cards.
 * New/Used Mobiles are informational sub-breakdowns of Products (phone sales are still
 * regular Invoices under the hood) — they're excluded from totalSales to avoid double-counting.
 */
const getDailySalesSummaryReport = catchAsync(async (req, res) => {
  const scope = buildScope(req);
  const { start, end } = parseRange(req.query);
  const organizationId = req.organizationId || req.user?.organizationId;
  const inRange = { $gte: start, $lte: end };

  const phoneProductIds = await Product.find({ ...scope, trackImei: true }).distinct('_id');
  const imeiSoldMatch = (extra) => ({
    ...scope,
    ...extra,
    status: 'sold',
    saleDate: inRange,
  });

  const [
    dashboard,
    installments,
    newMobilesRevenue,
    newMobilesCost,
    usedMobilesRevenue,
    usedMobilesCost,
    productItems,
    newMobileItems,
    usedMobileItems,
    loadItems,
    simSaleItems,
    repairItems,
    serviceItems,
    billPaymentItems,
    installmentItems,
    cashSentItems,
    cashReceivedItems,
    purchaseItems,
    expenseItems,
    loadPurchaseItems,
    cashInHandSummary,
  ] = await Promise.all([
    mobileDashboardService.getMobileDashboardSummary({
      organizationId,
      branchId: req.branchId,
      startDate: start,
      endDate: end,
    }),
    aggregateSumCount(InstallmentPayment, { ...scope, date: inRange }, '$amount'),
    aggregateSumCount(
      Imei,
      imeiSoldMatch({ productId: { $in: phoneProductIds }, acquisitionType: 'supplier_purchase' }),
      '$salePrice',
    ),
    aggregateSumCount(
      Imei,
      imeiSoldMatch({ productId: { $in: phoneProductIds }, acquisitionType: 'supplier_purchase' }),
      '$purchasePrice',
    ),
    aggregateSumCount(Imei, imeiSoldMatch({ acquisitionType: { $in: ['buyback', 'trade_in'] } }), '$salePrice'),
    aggregateSumCount(Imei, imeiSoldMatch({ acquisitionType: { $in: ['buyback', 'trade_in'] } }), '$purchasePrice'),
    // Which products sold today, and how many — grouped by product, not per-invoice.
    Invoice.aggregate([
      { $match: { ...scope, invoiceDate: inRange, status: { $ne: 'cancelled' } } },
      { $unwind: '$items' },
      { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'product' } },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$items.productId',
          name: { $first: { $ifNull: ['$product.name', '$items.name'] } },
          qty: { $sum: '$items.quantity' },
          amount: {
            $sum: {
              $ifNull: ['$items.subtotal', { $multiply: ['$items.quantity', { $ifNull: ['$items.price', '$items.unitPrice', 0] }] }],
            },
          },
        },
      },
      { $sort: { amount: -1 } },
      { $project: { _id: 0, name: 1, qty: 1, amount: 1 } },
    ]),
    Imei.find(imeiSoldMatch({ productId: { $in: phoneProductIds }, acquisitionType: 'supplier_purchase' }))
      .populate('productId', 'name')
      .select('productId imei salePrice saleDate')
      .sort('-saleDate')
      .lean(),
    Imei.find(imeiSoldMatch({ acquisitionType: { $in: ['buyback', 'trade_in'] } }))
      .populate('productId', 'name')
      .select('productId imei salePrice saleDate')
      .sort('-saleDate')
      .lean(),
    LoadTransaction.find({ ...scope, date: inRange })
      .select('walletType customerName mobileNumber amount receivedAmount profit date')
      .sort('-date')
      .lean(),
    SimSale.find({ ...scope, date: inRange })
      .select('customerName customerMobile productName saleAmount commission date')
      .sort('-date')
      .lean(),
    RepairJob.find({ ...scope, date: inRange })
      .select('customerName deviceModel issue charges status date')
      .sort('-date')
      .lean(),
    ServiceInvoice.aggregate([
      { $match: { ...scope, date: inRange } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.serviceId',
          name: { $first: '$items.serviceName' },
          qty: { $sum: '$items.quantity' },
          amount: { $sum: '$items.total' },
        },
      },
      { $sort: { amount: -1 } },
      { $project: { _id: 0, name: 1, qty: 1, amount: 1 } },
    ]),
    BillPayment.find({ ...scope, ...billPaymentDateMatch(start, end) })
      .select('customerName billType companyName totalReceived paymentDate createdAt')
      .sort('-paymentDate')
      .lean(),
    InstallmentPayment.find({ ...scope, date: inRange })
      .populate('installmentPlanId', 'customerName itemDescription')
      .select('installmentPlanId amount paymentNumber date')
      .sort('-date')
      .lean(),
    CashWithdrawal.find({ ...scope, date: inRange, transactionType: 'deposit' })
      .select('customerName customerNumber walletType amount profit date')
      .sort('-date')
      .lean(),
    CashWithdrawal.find({ ...scope, date: inRange, transactionType: 'withdrawal' })
      .select('customerName customerNumber walletType amount profit date')
      .sort('-date')
      .lean(),
    // Money OUT — what the shop paid suppliers today (cash/wallet actually handed
    // over, not the full invoice total, matching how Purchase syncs its own cash
    // book entry off `paidAmount` rather than `totalAmount`; see purchase.service.js).
    Purchase.find({ ...scope, purchaseDate: inRange })
      .populate('supplier', 'name')
      .select('supplier invoiceNumber totalAmount paidAmount purchaseDate')
      .sort('-purchaseDate')
      .lean(),
    // Money OUT — only paid expenses count as cash that actually left today; unpaid
    // (e.g. auto-generated recurring) obligations haven't moved any cash yet.
    Expense.find({ ...scope, date: inRange, isPaid: true })
      .select('category description amount date')
      .sort('-date')
      .lean(),
    // Money OUT — buying load/topup stock from a distributor, same paidAmount
    // convention as Purchase (see loadPurchase.service.js).
    LoadPurchase.find({ ...scope, date: inRange })
      .select('supplierName walletType amount paidAmount date')
      .sort('-date')
      .lean(),
    // The exact same physical Cash In Hand shown on the Cash Book / Accounting pages for
    // this date range — deliberately the real org-wide, cash-only ledger (not scoped to
    // just these modules) so this figure is never a different number than the one the
    // user already sees elsewhere in the app for "Cash In Hand".
    cashBookService.getCashInHandSummary({
      organizationId,
      branchId: req.branchId,
      startDate: start,
      endDate: end,
    }),
  ]);

  const imeiDetail = (rows) =>
    rows.map((r) => ({
      name: (r.productId && r.productId.name) || 'Phone',
      imei: r.imei || '',
      amount: roundReportAmount(r.salePrice),
      date: r.saleDate,
    }));

  const modules = [
    {
      key: 'products', label: 'Products',
      amount: roundReportAmount(dashboard.totalSales), count: null,
      profit: roundReportAmount(dashboard.salesProfit),
      items: productItems.map((p) => ({ name: p.name || 'Unknown', qty: p.qty, amount: roundReportAmount(p.amount) })),
    },
    {
      key: 'newMobiles', label: 'New Mobiles',
      amount: roundReportAmount(newMobilesRevenue.amount), count: newMobilesRevenue.count,
      profit: roundReportAmount(newMobilesRevenue.amount - newMobilesCost.amount),
      includedIn: 'products',
      items: imeiDetail(newMobileItems),
    },
    {
      key: 'usedMobiles', label: 'Used Mobiles',
      amount: roundReportAmount(usedMobilesRevenue.amount), count: usedMobilesRevenue.count,
      profit: roundReportAmount(usedMobilesRevenue.amount - usedMobilesCost.amount),
      includedIn: 'products',
      items: imeiDetail(usedMobileItems),
    },
    {
      key: 'load', label: 'Load Sold',
      amount: roundReportAmount(dashboard.totalLoadSold), count: null,
      profit: roundReportAmount(dashboard.totalLoadSoldProfit),
      items: loadItems.map((l) => ({
        name: [l.walletType, l.customerName].filter(Boolean).join(' — ') || l.walletType,
        detail: l.mobileNumber && l.mobileNumber !== 'N/A' ? l.mobileNumber : undefined,
        amount: roundReportAmount(l.amount),
        date: l.date,
      })),
    },
    {
      key: 'simSale', label: 'Sim Sale',
      amount: roundReportAmount(dashboard.totalSimSale), count: dashboard.simSaleCount,
      profit: roundReportAmount(dashboard.totalSimSaleProfit),
      items: simSaleItems.map((s) => ({
        name: s.customerName?.trim() || 'Walk-in Customer',
        detail: [s.productName, s.customerMobile].filter(Boolean).join(' · ') || undefined,
        amount: roundReportAmount(s.saleAmount),
        date: s.date,
      })),
    },
    {
      key: 'repairing', label: 'Repairing',
      amount: roundReportAmount(dashboard.totalRepairIncome), count: null,
      profit: roundReportAmount(dashboard.totalRepairProfit),
      items: repairItems.map((r) => ({
        name: r.customerName?.trim() || 'Walk-in Customer',
        detail: [r.deviceModel, r.issue].filter(Boolean).join(' · ') || undefined,
        amount: roundReportAmount(r.charges),
        date: r.date,
        status: r.status,
      })),
    },
    {
      key: 'services', label: 'Services',
      amount: roundReportAmount(dashboard.totalServiceIncome), count: dashboard.serviceInvoiceCount,
      profit: roundReportAmount(dashboard.totalServiceProfit),
      items: serviceItems.map((s) => ({ name: s.name || 'Service', qty: s.qty, amount: roundReportAmount(s.amount) })),
    },
    {
      key: 'billPayments', label: 'Bill Payments',
      amount: roundReportAmount(dashboard.totalBillCollection), count: null,
      profit: roundReportAmount(dashboard.billPaymentProfit),
      items: billPaymentItems.map((b) => ({
        name: b.customerName?.trim() || 'Customer',
        detail: [b.companyName, b.billType].filter(Boolean).join(' · ') || undefined,
        amount: roundReportAmount(b.totalReceived),
        date: b.paymentDate || b.createdAt,
      })),
    },
    {
      key: 'installments', label: 'Installments',
      amount: roundReportAmount(installments.amount), count: installments.count,
      profit: 0,
      items: installmentItems.map((i) => ({
        name: (i.installmentPlanId && i.installmentPlanId.customerName) || 'Customer',
        detail: (i.installmentPlanId && i.installmentPlanId.itemDescription) || `Payment #${i.paymentNumber}`,
        amount: roundReportAmount(i.amount),
        date: i.date,
      })),
    },
    {
      key: 'cashSent', label: 'Cash Sent',
      amount: roundReportAmount(dashboard.totalCashSend), count: dashboard.cashSendCount,
      profit: roundReportAmount(dashboard.totalCashSendProfit),
      items: cashSentItems.map((c) => ({
        name: c.customerName?.trim() || 'Customer',
        detail: [c.walletType, c.customerNumber].filter(Boolean).join(' · ') || undefined,
        amount: roundReportAmount(c.amount),
        date: c.date,
      })),
    },
    {
      // A "Cash Received" withdrawal means the CUSTOMER is withdrawing cash from their
      // wallet — the shop hands them physical cash, so this is money OUT of the till
      // (the reverse of "Cash Sent" above, which is a deposit — the shop receives cash).
      key: 'cashReceived', label: 'Cash Received', moneyOut: true,
      amount: roundReportAmount(dashboard.totalCashReceived), count: dashboard.cashReceivedCount,
      profit: roundReportAmount(dashboard.totalCashReceivedProfit),
      items: cashReceivedItems.map((c) => ({
        name: c.customerName?.trim() || 'Customer',
        detail: [c.walletType, c.customerNumber].filter(Boolean).join(' · ') || undefined,
        amount: roundReportAmount(c.amount),
        date: c.date,
      })),
    },
    {
      key: 'purchases', label: 'Purchases', moneyOut: true,
      amount: roundReportAmount(purchaseItems.reduce((sum, p) => sum + Number(p.paidAmount || 0), 0)),
      count: purchaseItems.length,
      profit: 0,
      items: purchaseItems.map((p) => ({
        name: (p.supplier && p.supplier.name) || 'Supplier',
        detail: p.invoiceNumber || undefined,
        amount: roundReportAmount(p.paidAmount || 0),
        date: p.purchaseDate,
      })),
    },
    {
      key: 'expenses', label: 'Expenses', moneyOut: true,
      amount: roundReportAmount(expenseItems.reduce((sum, e) => sum + Number(e.amount || 0), 0)),
      count: expenseItems.length,
      profit: 0,
      items: expenseItems.map((e) => ({
        name: e.category || 'Expense',
        detail: e.description || undefined,
        amount: roundReportAmount(e.amount || 0),
        date: e.date,
      })),
    },
    {
      key: 'loadPurchase', label: 'Load Purchase', moneyOut: true,
      amount: roundReportAmount(loadPurchaseItems.reduce((sum, l) => sum + Number(l.paidAmount || 0), 0)),
      count: loadPurchaseItems.length,
      profit: 0,
      items: loadPurchaseItems.map((l) => ({
        name: l.supplierName || 'Distributor',
        detail: l.walletType || undefined,
        amount: roundReportAmount(l.paidAmount || 0),
        date: l.date,
      })),
    },
  ];

  const totalSales = roundReportAmount(
    dashboard.totalSales +
      dashboard.totalLoadSold +
      dashboard.totalSimSale +
      dashboard.totalRepairIncome +
      dashboard.totalServiceIncome +
      dashboard.totalBillCollection +
      installments.amount,
  );
  const totalProfit = roundReportAmount(
    dashboard.salesProfit +
      dashboard.totalLoadSoldProfit +
      dashboard.totalSimSaleProfit +
      dashboard.totalRepairProfit +
      dashboard.totalServiceProfit +
      dashboard.billPaymentProfit +
      dashboard.totalCashSendProfit +
      dashboard.totalCashReceivedProfit,
  );

  // Sum straight off the modules actually flagged moneyOut (Purchases, Expenses, Load
  // Purchase, and Cash Received — a customer withdrawing from their wallet means the
  // shop hands over physical cash) so this total can never drift from what the "Money
  // Out" section above it actually lists.
  const totalMoneyOut = roundReportAmount(modules.filter((m) => m.moneyOut).reduce((sum, m) => sum + m.amount, 0));
  // Cash Sent (a customer depositing cash to top up their wallet) is money the shop
  // physically receives, so it adds to Total Sales here even though it isn't counted
  // as a "sale" above; Cash Received/Purchases/Expenses/Load Purchase are already
  // netted into totalMoneyOut.
  res.status(httpStatus.OK).send({
    modules,
    totalSales,
    totalProfit,
    totalMoneyOut,
    // Same figures as the Cash Book / Accounting page for this exact date range — the
    // real org-wide, cash-only ledger, not scoped to just this report's modules, so
    // "Cash In Hand" always means the same number everywhere in the app.
    cashInHand: {
      opening: cashInHandSummary.openingBalance,
      totalIn: roundReportAmount(cashInHandSummary.totalIncome),
      totalOut: roundReportAmount(cashInHandSummary.totalExpense),
      closing: cashInHandSummary.closingBalance,
    },
    period: { startDate: start, endDate: end },
  });
});

/* ── Salesman Commission ───────────────────────────────────────────────────── */
const getSalesmanCommissionReport = catchAsync(async (req, res) => {
  const scope = buildScope(req);
  const { start, end } = parseRange(req.query);
  const inRange = { $gte: start, $lte: end };

  const [byType, bySalesmanType, trend, currentBalances, invoiceDetail] = await Promise.all([
    // Overall totals within the period, one row per transaction type.
    SalesmanCommissionLedger.aggregate([
      { $match: { ...scope, transactionDate: inRange } },
      { $group: { _id: '$transactionType', credit: { $sum: '$credit' }, debit: { $sum: '$debit' }, count: { $sum: 1 }, saleAmount: { $sum: '$saleAmount' } } },
    ]),
    // Per-salesman breakdown within the period, one row per (salesman, type).
    SalesmanCommissionLedger.aggregate([
      { $match: { ...scope, transactionDate: inRange } },
      { $group: { _id: { salesmanUserId: '$salesmanUserId', type: '$transactionType' }, credit: { $sum: '$credit' }, debit: { $sum: '$debit' }, count: { $sum: 1 }, saleAmount: { $sum: '$saleAmount' } } },
      { $lookup: { from: 'users', localField: '_id.salesmanUserId', foreignField: '_id', as: 'salesman' } },
      { $unwind: { path: '$salesman', preserveNullAndEmptyArrays: true } },
      { $project: { salesmanUserId: '$_id.salesmanUserId', type: '$_id.type', credit: 1, debit: 1, count: 1, saleAmount: 1, name: '$salesman.name', email: '$salesman.email' } },
    ]),
    // Daily trend of commission earned within the period, for the chart.
    SalesmanCommissionLedger.aggregate([
      { $match: { ...scope, transactionDate: inRange, transactionType: 'commission_earned' } },
      { $group: { _id: businessDateGroup('$transactionDate'), earned: { $sum: '$credit' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    // Current (all-time, not period-bound) outstanding balance per salesman — a
    // salesman can owe money earned before this report's date range.
    SalesmanCommissionLedger.aggregate([
      { $match: scope },
      { $sort: { salesmanUserId: 1, transactionDate: 1, createdAt: 1 } },
      { $group: { _id: '$salesmanUserId', balance: { $last: '$balance' } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'salesman' } },
      { $unwind: { path: '$salesman', preserveNullAndEmptyArrays: true } },
      { $project: { salesmanUserId: '$_id', balance: 1, name: '$salesman.name', email: '$salesman.email' } },
    ]),
    // Invoice-level rows behind each salesman's totals, for the report's expandable
    // detail — `reference`/`saleAmount`/`rate` are already denormalized onto the ledger
    // entry at credit time, so no Invoice lookup is needed here.
    SalesmanCommissionLedger.find({
      ...scope,
      transactionDate: inRange,
      transactionType: { $in: ['commission_earned', 'commission_reversed'] },
    })
      .select('salesmanUserId transactionType transactionDate reference referenceId saleAmount rate credit debit notes')
      .sort({ transactionDate: -1 })
      .lean(),
  ]);

  const typeSummary = (type) => byType.find((b) => b._id === type) || { credit: 0, debit: 0, count: 0, saleAmount: 0 };
  const earned = typeSummary('commission_earned');
  const reversed = typeSummary('commission_reversed');
  const paid = typeSummary('commission_payment');

  const salesmenMap = new Map();
  for (const row of bySalesmanType) {
    const key = String(row.salesmanUserId);
    if (!salesmenMap.has(key)) {
      salesmenMap.set(key, {
        salesmanUserId: key,
        name: row.name || 'Unknown',
        email: row.email || '',
        salesCount: 0,
        salesAmount: 0,
        earned: 0,
        reversed: 0,
        paid: 0,
        currentBalance: 0,
        invoices: [],
      });
    }
    const entry = salesmenMap.get(key);
    if (row.type === 'commission_earned') {
      entry.salesCount = row.count;
      entry.salesAmount = roundReportAmount(row.saleAmount);
      entry.earned = roundReportAmount(row.credit);
    } else if (row.type === 'commission_reversed') {
      entry.reversed = roundReportAmount(row.debit);
    } else if (row.type === 'commission_payment') {
      entry.paid = roundReportAmount(row.debit);
    }
  }

  // Surface salesmen who owe a balance carried over from before this period, even if
  // they had no activity within it — otherwise a "This Month" view could silently hide
  // real outstanding money.
  for (const b of currentBalances) {
    const key = String(b.salesmanUserId);
    const rounded = roundReportAmount(b.balance);
    if (!salesmenMap.has(key)) {
      if (rounded === 0) continue;
      salesmenMap.set(key, {
        salesmanUserId: key,
        name: b.name || 'Unknown',
        email: b.email || '',
        salesCount: 0,
        salesAmount: 0,
        earned: 0,
        reversed: 0,
        paid: 0,
        currentBalance: rounded,
        invoices: [],
      });
    } else {
      salesmenMap.get(key).currentBalance = rounded;
    }
  }

  for (const row of invoiceDetail) {
    const entry = salesmenMap.get(String(row.salesmanUserId));
    if (!entry) continue;
    entry.invoices.push({
      transactionType: row.transactionType,
      date: row.transactionDate,
      reference: row.reference || '',
      referenceId: row.referenceId,
      saleAmount: roundReportAmount(row.saleAmount),
      rate: row.rate,
      amount: roundReportAmount(row.transactionType === 'commission_earned' ? row.credit : row.debit),
      notes: row.notes || '',
    });
  }

  const salesmen = Array.from(salesmenMap.values()).sort((a, b) => b.earned - a.earned);
  const totalOutstanding = currentBalances.reduce((sum, b) => sum + (b.balance || 0), 0);

  res.status(httpStatus.OK).send({
    summary: {
      totalEarned: roundReportAmount(earned.credit),
      totalReversed: roundReportAmount(reversed.debit),
      totalPaid: roundReportAmount(paid.debit),
      netCommission: roundReportAmount(earned.credit - reversed.debit),
      totalSalesAmount: roundReportAmount(earned.saleAmount),
      totalSalesCount: earned.count,
      activeSalesmenCount: salesmen.length,
      totalOutstanding: roundReportAmount(totalOutstanding),
    },
    trend: trend.map((t) => ({ date: t._id, earned: roundReportAmount(t.earned), count: t.count })),
    salesmen,
    period: { startDate: start, endDate: end },
  });
});

module.exports = {
  getSalesInvoiceDetails,
  getPurchaseInvoiceDetails,
  getSalesReport, getPurchaseReport, getProductReport, getProductDetailReport,
  getCustomerReport, getCustomerAgingReport, getSupplierReport, getSupplierAgingReport, getExpenseReport,
  getProfitLossReport, getProfitLossFullReport, getInventoryReport, getTaxReport,
  getBatchExpiryReport, getStockAdjustmentReport, getStockTransferReport,
  getSalesReturnsReport, getPurchaseReturnsReport,
  getLoadReport, getWalletWiseReport, getRepairReport, getServiceReport,
  getRoiReport, getMonthlyRoi,
  getSimSaleReport, getInstallmentReport,
  getActivitySummaryReport,
  getSalesPurchaseSummaryReport,
  getDailySalesSummaryReport,
  getSalesmanCommissionReport,
};
