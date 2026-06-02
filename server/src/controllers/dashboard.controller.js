const httpStatus = require('http-status');
const mongoose = require('mongoose');
const catchAsync = require('../utils/catchAsync');
const { Invoice, Product, Customer, Purchase, Supplier, SalesReturn, PurchaseReturn, Organization } = require('../models');
const { applyBranchFilter } = require('../utils/branchFilter');
const { mobileDashboardService, cashBookService } = require('../services');
const { normalizeBusinessType } = require('../config/businessTypes');
const { normalizeInvoicePayment, normalizePurchasePayment } = require('../utils/invoice-display');
const { resolveDashboardDateRange, buildDateMatch } = require('../utils/dashboardDateRange');

/**
 * Build an aggregate $match scope with properly cast ObjectIds.
 * applyBranchFilter works for Mongoose .find() (auto-casts) but NOT for
 * aggregate pipelines which hit the raw MongoDB driver.
 */
const buildAggregateScope = (req) => {
  const scope = {};
  const orgId = req.organizationId || (req.user && req.user.organizationId);
  const branchId = req.branchId;
  if (orgId && mongoose.Types.ObjectId.isValid(orgId)) {
    scope.organizationId = new mongoose.Types.ObjectId(String(orgId));
  }
  if (branchId && mongoose.Types.ObjectId.isValid(branchId)) {
    scope.branchId = new mongoose.Types.ObjectId(String(branchId));
  }
  return scope;
};

/** True if value can be used as Customer/Product _id (excludes walk-in and bad strings). */
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

/**
 * Get dashboard statistics
 * @route GET /v1/dashboard/stats
 */
const getDashboardStats = catchAsync(async (req, res) => {
  const bf = applyBranchFilter({}, req);
  const dateRange = resolveDashboardDateRange(req.query);
  const { startDate, endDate, compareStart, compareEnd } = dateRange;

  const invoiceDateFilter = buildDateMatch('invoiceDate', startDate, endDate);
  const invoiceCompareFilter = buildDateMatch('invoiceDate', compareStart, compareEnd);
  const purchaseDateFilter = buildDateMatch('purchaseDate', startDate, endDate);
  const returnDateFilter = buildDateMatch('date', startDate, endDate);
  const returnCompareFilter = buildDateMatch('date', compareStart, compareEnd);

  // Revenue and sales in selected period
  const currentInvoices = await Invoice.find({
    ...bf,
    ...invoiceDateFilter,
    status: { $ne: 'cancelled' },
  });

  const totalRevenue = currentInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const totalSales = currentInvoices.length;

  // Previous period for comparison
  const previousInvoices = await Invoice.find({
    ...bf,
    ...invoiceCompareFilter,
    status: { $ne: 'cancelled' },
  });

  const previousRevenue = previousInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const previousSales = previousInvoices.length;

  const totalRevenueChange =
    previousRevenue > 0 ? ((totalRevenue - previousRevenue) / previousRevenue) * 100 : 0;
  const totalSalesChange =
    previousSales > 0 ? ((totalSales - previousSales) / previousSales) * 100 : 0;

  // Low stock and out of stock products (current snapshot)
  const allProducts = await Product.find({ ...bf });
  const lowStockCount = allProducts.filter((p) => p.stockQuantity > 0 && p.stockQuantity <= 10).length;
  const outOfStockCount = allProducts.filter((p) => p.stockQuantity === 0).length;

  const totalInventoryValue = allProducts.reduce((sum, product) => {
    const productValue = (product.stockQuantity || 0) * (product.cost || product.price || 0);
    return sum + productValue;
  }, 0);

  // Pending invoices (current snapshot)
  const pendingInvoices = await Invoice.find({
    ...bf,
    status: 'pending',
    type: { $in: ['credit', 'pending'] },
  });

  const pendingInvoicesAmount = pendingInvoices.reduce((sum, inv) => sum + (inv.balance || 0), 0);

  // Period revenue (same as totalRevenue for filtered dashboard)
  const todayRevenue = totalRevenue;
  const todayRevenueChange = totalRevenueChange;

  const totalCustomers = await Customer.countDocuments({ ...bf });
  const totalProducts = await Product.countDocuments({ ...bf });

  const aggScopeEarly = buildAggregateScope(req);
  const purchasesAgg = await Purchase.aggregate([
    { $match: { ...aggScopeEarly, ...purchaseDateFilter } },
    { $group: { _id: null, totalPurchases: { $sum: '$totalAmount' } } },
  ]);
  const totalPurchases = purchasesAgg[0]?.totalPurchases || 0;

  let mobileSummary = {
    totalLoadSold: 0,
    totalRepairIncome: 0,
    totalBillCollection: 0,
    billPaymentProfit: 0,
    totalProfit: totalRevenue,
    cashInHand: 0,
    jazzcashBalance: 0,
    easypaisaBalance: 0,
    walletBalance: 0,
    billsDueToday: 0,
    billsDueInPeriod: 0,
    billsOverdue: 0,
    totalSimSale: 0,
    totalSimSaleProfit: 0,
    simSaleCount: 0,
    totalCashSend: 0,
    totalCashSendProfit: 0,
    cashSendCount: 0,
    totalCashReceived: 0,
    totalCashReceivedProfit: 0,
    cashReceivedCount: 0,
    totalServiceIncome: 0,
    serviceInvoiceCount: 0,
  };

  const organizationId = req.organizationId || req.user.organizationId;
  let businessType = normalizeBusinessType(req.user.businessType);
  if (organizationId) {
    const org = await Organization.findById(organizationId).select('businessType');
    if (org?.businessType) {
      businessType = normalizeBusinessType(org.businessType);
    }
  }

  if (businessType === 'mobile_shop') {
    const { branchId } = req;

    const [summary, cashBookSummary] = await Promise.all([
      mobileDashboardService.getMobileDashboardSummary({
        organizationId,
        branchId,
        startDate,
        endDate,
      }),
      cashBookService.getCashInHandSummary({ organizationId, branchId }),
    ]);

    mobileSummary = {
      ...summary,
      cashInHand: cashBookSummary.closingBalance,
    };
  }

  const aggScope = buildAggregateScope(req);
  const [salesReturnsAgg, purchaseReturnsAgg] = await Promise.all([
    SalesReturn.aggregate([
      {
        $match: {
          ...aggScope,
          status: { $ne: 'rejected' },
          ...returnDateFilter,
        },
      },
      {
        $group: {
          _id: null,
          totalSalesReturns: { $sum: '$totalAmount' },
          salesReturnCount: { $sum: 1 },
        },
      },
    ]),
    PurchaseReturn.aggregate([
      {
        $match: {
          ...aggScope,
          status: { $ne: 'rejected' },
          ...returnDateFilter,
        },
      },
      {
        $group: {
          _id: null,
          totalPurchaseReturns: { $sum: '$totalAmount' },
          purchaseReturnCount: { $sum: 1 },
        },
      },
    ]),
  ]);

  const totalSalesReturns = salesReturnsAgg[0]?.totalSalesReturns || 0;
  const salesReturnCount = salesReturnsAgg[0]?.salesReturnCount || 0;
  const totalPurchaseReturns = purchaseReturnsAgg[0]?.totalPurchaseReturns || 0;
  const purchaseReturnCount = purchaseReturnsAgg[0]?.purchaseReturnCount || 0;

  const netSales = totalRevenue - totalSalesReturns;
  const netPurchase = totalPurchases - totalPurchaseReturns;

  res.status(httpStatus.OK).send({
    totalRevenue,
    totalRevenueChange,
    totalSales,
    totalSalesChange,
    lowStockCount,
    outOfStockCount,
    totalInventoryValue,
    pendingInvoices: pendingInvoices.length,
    pendingInvoicesAmount,
    todayRevenue,
    todayRevenueChange,
    totalCustomers,
    totalProducts,
    totalPurchases,
    totalSalesReturns,
    salesReturnCount,
    totalPurchaseReturns,
    purchaseReturnCount,
    netSales,
    netPurchase,
    period: {
      preset: dateRange.period,
      startDate: dateRange.startCalendar,
      endDate: dateRange.endCalendar,
    },
    ...mobileSummary,
  });
});

/**
 * Get revenue data for charts
 * @route GET /v1/dashboard/revenue?period=week
 */
const getRevenueData = catchAsync(async (req, res) => {
  const aggScope = buildAggregateScope(req);
  const dateRange = resolveDashboardDateRange(req.query);
  const { startDate, endDate, startCalendar, endCalendar } = dateRange;
  const isSingleDay = startCalendar === endCalendar;

  const groupBy = isSingleDay
    ? { $dateToString: { format: '%H:00', date: '$invoiceDate', timezone: 'Asia/Karachi' } }
    : { $dateToString: { format: '%Y-%m-%d', date: '$invoiceDate', timezone: 'Asia/Karachi' } };

  const revenueData = await Invoice.aggregate([
    {
      $match: {
        ...aggScope,
        ...buildDateMatch('invoiceDate', startDate, endDate),
        status: { $ne: 'cancelled' },
      },
    },
    {
      $group: {
        _id: groupBy,
        revenue: { $sum: '$total' },
        sales: { $sum: 1 },
        profit: { $sum: { $ifNull: ['$totalProfit', 0] } },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ]);

  const formattedData = revenueData.map((item) => {
    let formattedDate = item._id;

    if (isSingleDay) {
      formattedDate = item._id;
    } else {
      const date = new Date(`${item._id}T12:00:00`);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      formattedDate = `${date.getDate().toString().padStart(2, '0')} ${months[date.getMonth()]}`;
    }

    return {
      date: formattedDate,
      revenue: item.revenue || 0,
      sales: item.sales || 0,
      profit: item.profit || 0,
    };
  });

  res.status(httpStatus.OK).send(formattedData);
});

/**
 * Get top selling products
 * @route GET /v1/dashboard/top-products?limit=5
 */
const getTopProducts = catchAsync(async (req, res) => {
  const aggScope = buildAggregateScope(req);
  const { limit = 5 } = req.query;
  const { startDate, endDate } = resolveDashboardDateRange(req.query);

  const topProducts = await Invoice.aggregate([
    {
      $match: {
        ...aggScope,
        ...buildDateMatch('invoiceDate', startDate, endDate),
        status: { $ne: 'cancelled' },
      },
    },
    { $unwind: '$items' },
    {
      $match: {
        $expr: {
          $or: [
            { $eq: [{ $type: '$items.productId' }, 'objectId'] },
            {
              $and: [
                { $eq: [{ $type: '$items.productId' }, 'string'] },
                { $regexMatch: { input: '$items.productId', regex: /^[a-fA-F0-9]{24}$/ } },
              ],
            },
          ],
        },
      },
    },
    {
      $group: {
        _id: '$items.productId',
        totalQuantity: { $sum: '$items.quantity' },
        totalRevenue: { $sum: '$items.subtotal' }
      }
    },
    { $sort: { totalRevenue: -1 } },
    { $limit: parseInt(limit) },
    {
      $addFields: {
        productLookupId: {
          $convert: {
            input: '$_id',
            to: 'objectId',
            onError: null,
            onNull: null,
          },
        },
      },
    },
    { $match: { productLookupId: { $ne: null } } },
    {
      $lookup: {
        from: 'products',
        localField: 'productLookupId',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: '$product' },
    {
      $project: {
        id: '$_id',
        name: '$product.name',
        image: '$product.image',
        totalQuantity: 1,
        totalRevenue: 1,
        stockQuantity: '$product.stockQuantity',
        _id: 0
      }
    }
  ]);

  res.status(httpStatus.OK).send(topProducts);
});

/**
 * Get top customers
 * @route GET /v1/dashboard/top-customers?limit=5
 */
const getTopCustomers = catchAsync(async (req, res) => {
  const aggScope = buildAggregateScope(req);
  const { limit = 5 } = req.query;
  const { startDate, endDate } = resolveDashboardDateRange(req.query);

  const topCustomers = await Invoice.aggregate([
    {
      $match: {
        ...aggScope,
        ...buildDateMatch('invoiceDate', startDate, endDate),
        status: { $ne: 'cancelled' },
        $expr: {
          $or: [
            { $eq: [{ $type: '$customerId' }, 'objectId'] },
            {
              $and: [
                { $eq: [{ $type: '$customerId' }, 'string'] },
                { $regexMatch: { input: '$customerId', regex: /^[a-fA-F0-9]{24}$/ } },
              ],
            },
          ],
        },
      },
    },
    {
      $group: {
        _id: '$customerId',
        totalPurchases: { $sum: 1 },
        totalAmount: { $sum: '$total' },
        lastPurchase: { $max: '$createdAt' }
      }
    },
    { $sort: { totalAmount: -1 } },
    { $limit: parseInt(limit) },
    {
      $addFields: {
        customerLookupId: {
          $convert: {
            input: '$_id',
            to: 'objectId',
            onError: null,
            onNull: null,
          },
        },
      },
    },
    { $match: { customerLookupId: { $ne: null } } },
    {
      $lookup: {
        from: 'customers',
        localField: 'customerLookupId',
        foreignField: '_id',
        as: 'customer'
      }
    },
    { $unwind: '$customer' },
    {
      $project: {
        id: '$_id',
        name: '$customer.name',
        phone: '$customer.phone',
        totalPurchases: 1,
        totalAmount: 1,
        lastPurchase: 1,
        _id: 0
      }
    }
  ]);

  res.status(httpStatus.OK).send(topCustomers);
});

/**
 * Get low stock products
 * @route GET /v1/dashboard/low-stock
 */
const getLowStockProducts = catchAsync(async (req, res) => {
  const bf = applyBranchFilter({}, req);
  const products = await Product.find({
    ...bf,
    $or: [
      { stockQuantity: { $lte: 10 } },
      { stockQuantity: 0 }
    ]
  })
    .populate('category', 'name')
    .sort({ stockQuantity: 1 })
    .limit(20);

  const lowStockProducts = products.map(product => ({
    id: product._id,
    name: product.name,
    image: product.image,
    stockQuantity: product.stockQuantity,
    minStockLevel: 10,
    category: product.category && product.category.name ? product.category.name : 'Uncategorized'
  }));

  res.status(httpStatus.OK).send(lowStockProducts);
});

/**
 * Get recent activities
 * @route GET /v1/dashboard/recent-activities?limit=10
 */
const getRecentActivities = catchAsync(async (req, res) => {
  const bf = applyBranchFilter({}, req);
  const { limit = 10 } = req.query;
  const { startDate, endDate } = resolveDashboardDateRange(req.query);
  const half = Math.max(1, Math.ceil(parseInt(limit, 10) / 2));

  const recentInvoices = await Invoice.find({
    ...bf,
    ...buildDateMatch('invoiceDate', startDate, endDate),
  })
    .sort({ createdAt: -1 })
    .limit(half)
    .select('invoiceNumber total createdAt status walkInCustomerName customerId type paidAmount balance')
    .lean();

  const customerIdsToResolve = [
    ...new Set(
      recentInvoices
        .map((inv) => inv.customerId)
        .filter((id) => isValidRefObjectId(id))
        .map((id) => String(id)),
    ),
  ];
  const customerDocs =
    customerIdsToResolve.length > 0
      ? await Customer.find({ _id: { $in: customerIdsToResolve } })
          .select('name')
          .lean()
      : [];
  const customerNameById = new Map(customerDocs.map((c) => [String(c._id), c.name]));

  const recentPurchases = await Purchase.find({
    ...bf,
    ...buildDateMatch('purchaseDate', startDate, endDate),
  })
    .sort({ createdAt: -1 })
    .limit(half)
    .select('invoiceNumber totalAmount paidAmount balance paymentType createdAt supplier')
    .populate('supplier', 'name')
    .lean();

  // Combine and format activities
  const invoiceActivities = recentInvoices.map((inv) => {
    const cid = inv.customerId;
    const resolvedName =
      cid && isValidRefObjectId(cid) ? customerNameById.get(String(cid)) : null;
    const label =
      resolvedName || inv.walkInCustomerName || 'Walk-in Customer';
    const pay = normalizeInvoicePayment(inv);
    return {
      id: inv._id,
      type: 'invoice',
      description: `Invoice ${inv.invoiceNumber} - ${label}`,
      amount: inv.total,
      paidAmount: pay.paidAmount,
      balance: pay.balance,
      timestamp: inv.createdAt,
      status: pay.displayStatus,
    };
  });

  const purchaseActivities = recentPurchases.map((pur) => {
    const pay = normalizePurchasePayment(pur);
    return {
      id: pur._id,
      type: 'purchase',
      description: `Purchase ${pur.invoiceNumber} - ${pur.supplier?.name || 'Supplier'}`,
      amount: pur.totalAmount,
      paidAmount: pay.paidAmount,
      balance: pay.balance,
      timestamp: pur.createdAt,
      status: pay.displayStatus,
    };
  });

  // Combine and sort by timestamp
  const activities = [...invoiceActivities, ...purchaseActivities]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, parseInt(limit));

  res.status(httpStatus.OK).send(activities);
});

module.exports = {
  getDashboardStats,
  getRevenueData,
  getTopProducts,
  getTopCustomers,
  getLowStockProducts,
  getRecentActivities,
};
