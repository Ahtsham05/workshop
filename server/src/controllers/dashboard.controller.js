const httpStatus = require('http-status');
const mongoose = require('mongoose');
const catchAsync = require('../utils/catchAsync');
const { Invoice, Product, Customer, Purchase, Supplier, SalesReturn, PurchaseReturn } = require('../models');
const { applyBranchFilter } = require('../utils/branchFilter');
const { mobileDashboardService, cashBookService } = require('../services');
const { normalizeBusinessType } = require('../config/businessTypes');
const { normalizeInvoicePayment, normalizePurchasePayment } = require('../utils/invoice-display');

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
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate());

  // Current month revenue and sales
  const currentMonthInvoices = await Invoice.find({
    ...bf,
    createdAt: { $gte: lastMonth },
    status: { $ne: 'cancelled' }
  });

  const totalRevenue = currentMonthInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const totalSales = currentMonthInvoices.length;

  // Previous month for comparison
  const previousMonthInvoices = await Invoice.find({
    ...bf,
    createdAt: { $gte: twoMonthsAgo, $lt: lastMonth },
    status: { $ne: 'cancelled' }
  });

  const previousRevenue = previousMonthInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const previousSales = previousMonthInvoices.length;

  // Calculate percentage changes
  const totalRevenueChange = previousRevenue > 0 
    ? ((totalRevenue - previousRevenue) / previousRevenue) * 100 
    : 0;
  const totalSalesChange = previousSales > 0 
    ? ((totalSales - previousSales) / previousSales) * 100 
    : 0;

  // Low stock and out of stock products
  const allProducts = await Product.find({ ...bf });
  const lowStockCount = allProducts.filter(p => p.stockQuantity > 0 && p.stockQuantity <= 10).length;
  const outOfStockCount = allProducts.filter(p => p.stockQuantity === 0).length;

  // Calculate total inventory stock value
  const totalInventoryValue = allProducts.reduce((sum, product) => {
    const productValue = (product.stockQuantity || 0) * (product.cost || product.price || 0);
    return sum + productValue;
  }, 0);

  // Pending invoices
  const pendingInvoices = await Invoice.find({
    ...bf,
    status: 'pending',
    type: { $in: ['credit', 'pending'] }
  });

  const pendingInvoicesAmount = pendingInvoices.reduce((sum, inv) => sum + (inv.balance || 0), 0);

  // Today's revenue
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayInvoices = await Invoice.find({
    ...bf,
    createdAt: { $gte: startOfToday },
    status: { $ne: 'cancelled' }
  });
  const todayRevenue = todayInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);

  // Yesterday's revenue for comparison
  const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterdayInvoices = await Invoice.find({
    ...bf,
    createdAt: { $gte: startOfYesterday, $lt: startOfToday },
    status: { $ne: 'cancelled' }
  });
  const yesterdayRevenue = yesterdayInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);

  const todayRevenueChange = yesterdayRevenue > 0 
    ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100 
    : 0;

  // Total customers and products
  const totalCustomers = await Customer.countDocuments({ ...bf });
  const totalProducts = await Product.countDocuments({ ...bf });

  // Total purchases (current month) – use aggScope so ObjectId fields cast correctly in pipeline
  const aggScopeEarly = buildAggregateScope(req);
  const purchasesAgg = await Purchase.aggregate([
    { $match: { ...aggScopeEarly, purchaseDate: { $gte: lastMonth } } },
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
    billsOverdue: 0,
  };

  if (normalizeBusinessType(req.user.businessType) === 'mobile_shop') {
    const organizationId = req.organizationId || req.user.organizationId;
    const { branchId } = req;

    const [summary, cashBookSummary] = await Promise.all([
      mobileDashboardService.getMobileDashboardSummary({ organizationId, branchId }),
      cashBookService.getSummary({ organizationId, branchId }),
    ]);

    mobileSummary = {
      ...summary,
      cashInHand: cashBookSummary.closingBalance,
    };
  }

  // Return metrics – use buildAggregateScope so ObjectId fields cast correctly
  const aggScope = buildAggregateScope(req);
  const [salesReturnsAgg, purchaseReturnsAgg] = await Promise.all([
    SalesReturn.aggregate([
      {
        $match: {
          ...aggScope,
          status: { $ne: 'rejected' },
          date: { $gte: lastMonth },
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
          date: { $gte: lastMonth },
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
    ...mobileSummary,
  });
});

/**
 * Get revenue data for charts
 * @route GET /v1/dashboard/revenue?period=week
 */
const getRevenueData = catchAsync(async (req, res) => {
  // Aggregates must use BSON ObjectIds — applyBranchFilter leaves branchId as strings,
  // which Mongoose fixes for .find() but NOT for aggregate $match (would return []).
  const aggScope = buildAggregateScope(req);
  const { period = 'week' } = req.query;
  const now = new Date();
  let startDate;
  let groupBy;

  switch (period) {
    case 'day':
      // Last 24 hours by hour
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      groupBy = { $dateToString: { format: '%Y-%m-%d-%H', date: '$createdAt' } };
      break;
    case 'week':
      // Last 7 days
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      groupBy = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
      break;
    case 'month':
      // Last 30 days
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      groupBy = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
      break;
    case 'year':
      // Last 12 months
      startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1);
      groupBy = { $dateToString: { format: '%Y-%m', date: '$createdAt' } };
      break;
    default:
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      groupBy = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
  }

  const revenueData = await Invoice.aggregate([
    {
      $match: {
        ...aggScope,
        createdAt: { $gte: startDate },
        status: { $ne: 'cancelled' }
      }
    },
    {
      $group: {
        _id: groupBy,
        revenue: { $sum: '$total' },
        sales: { $sum: 1 },
        profit: { $sum: { $ifNull: ['$totalProfit', 0] } },
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);

  // Format the dates based on period
  const formattedData = revenueData.map(item => {
    let formattedDate = item._id;
    
    if (period === 'day') {
      // Format: "14:00"
      const hour = item._id.split('-')[3];
      formattedDate = `${hour}:00`;
    } else if (period === 'week') {
      // Format: "Mon", "Tue", etc.
      const date = new Date(item._id);
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      formattedDate = days[date.getDay()];
    } else if (period === 'month') {
      // Format: "05 Dec"
      const date = new Date(item._id);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      formattedDate = `${date.getDate().toString().padStart(2, '0')} ${months[date.getMonth()]}`;
    } else if (period === 'year') {
      // Format: "Dec 2024"
      const [year, month] = item._id.split('-');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      formattedDate = `${months[parseInt(month) - 1]} ${year}`;
    }

    return {
      date: formattedDate,
      revenue: item.revenue || 0,
      sales: item.sales || 0,
      profit: item.profit || 0
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
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

  const topProducts = await Invoice.aggregate([
    {
      $match: {
        ...aggScope,
        createdAt: { $gte: lastMonth },
        status: { $ne: 'cancelled' }
      }
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
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

  const topCustomers = await Invoice.aggregate([
    {
      $match: {
        ...aggScope,
        createdAt: { $gte: lastMonth },
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
  const half = Math.max(1, Math.ceil(parseInt(limit, 10) / 2));

  // Do not .populate(customerId): walk-in invoices use customerId === 'walk-in', which is not a valid ObjectId
  const recentInvoices = await Invoice.find({ ...bf })
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

  // Get recent purchases (fields needed for paid/balance like purchase report)
  const recentPurchases = await Purchase.find({ ...bf })
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
