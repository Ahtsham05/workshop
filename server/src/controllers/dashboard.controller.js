const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { Invoice, Product, Customer, Purchase, Supplier } = require('../models');

/**
 * Get dashboard statistics
 * @route GET /v1/dashboard/stats
 */
const getDashboardStats = catchAsync(async (req, res) => {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate());

  // Current month revenue and sales
  const currentMonthInvoices = await Invoice.find({
    createdAt: { $gte: lastMonth },
    status: { $ne: 'cancelled' }
  });

  const totalRevenue = currentMonthInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const totalSales = currentMonthInvoices.length;

  // Previous month for comparison
  const previousMonthInvoices = await Invoice.find({
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
  const allProducts = await Product.find({});
  const lowStockCount = allProducts.filter(p => p.stockQuantity > 0 && p.stockQuantity <= 10).length;
  const outOfStockCount = allProducts.filter(p => p.stockQuantity === 0).length;

  // Calculate total inventory stock value
  const totalInventoryValue = allProducts.reduce((sum, product) => {
    const productValue = (product.stockQuantity || 0) * (product.cost || product.price || 0);
    return sum + productValue;
  }, 0);

  // Pending invoices
  const pendingInvoices = await Invoice.find({
    status: 'pending',
    type: { $in: ['credit', 'pending'] }
  });

  const pendingInvoicesAmount = pendingInvoices.reduce((sum, inv) => sum + (inv.balance || 0), 0);

  // Today's revenue
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayInvoices = await Invoice.find({
    createdAt: { $gte: startOfToday },
    status: { $ne: 'cancelled' }
  });
  const todayRevenue = todayInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);

  // Yesterday's revenue for comparison
  const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterdayInvoices = await Invoice.find({
    createdAt: { $gte: startOfYesterday, $lt: startOfToday },
    status: { $ne: 'cancelled' }
  });
  const yesterdayRevenue = yesterdayInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);

  const todayRevenueChange = yesterdayRevenue > 0 
    ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100 
    : 0;

  // Total customers and products
  const totalCustomers = await Customer.countDocuments();
  const totalProducts = await Product.countDocuments();

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
  });
});

/**
 * Get revenue data for charts
 * @route GET /v1/dashboard/revenue?period=week
 */
const getRevenueData = catchAsync(async (req, res) => {
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
        createdAt: { $gte: startDate },
        status: { $ne: 'cancelled' }
      }
    },
    {
      $group: {
        _id: groupBy,
        revenue: { $sum: '$total' },
        sales: { $sum: 1 },
        profit: { $sum: '$totalProfit' }
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
  const { limit = 5 } = req.query;
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

  const topProducts = await Invoice.aggregate([
    {
      $match: {
        createdAt: { $gte: lastMonth },
        status: { $ne: 'cancelled' }
      }
    },
    { $unwind: '$items' },
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
      $lookup: {
        from: 'products',
        localField: '_id',
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
  const { limit = 5 } = req.query;
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

  const topCustomers = await Invoice.aggregate([
    {
      $match: {
        createdAt: { $gte: lastMonth },
        status: { $ne: 'cancelled' },
        customerId: { $exists: true, $ne: 'walk-in' }
      }
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
      $lookup: {
        from: 'customers',
        localField: '_id',
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
  const products = await Product.find({
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
    category: product.category?.name || 'Uncategorized'
  }));

  res.status(httpStatus.OK).send(lowStockProducts);
});

/**
 * Get recent activities
 * @route GET /v1/dashboard/recent-activities?limit=10
 */
const getRecentActivities = catchAsync(async (req, res) => {
  const { limit = 10 } = req.query;

  // Get recent invoices
  const recentInvoices = await Invoice.find()
    .sort({ createdAt: -1 })
    .limit(parseInt(limit) / 2)
    .populate('customerId', 'name')
    .lean();

  // Get recent purchases
  const recentPurchases = await Purchase.find()
    .sort({ createdAt: -1 })
    .limit(parseInt(limit) / 2)
    .populate('supplier', 'name')
    .lean();

  // Combine and format activities
  const invoiceActivities = recentInvoices.map(inv => ({
    id: inv._id,
    type: 'invoice',
    description: `Invoice ${inv.invoiceNumber} - ${inv.customerId?.name || inv.walkInCustomerName || 'Walk-in Customer'}`,
    amount: inv.total,
    timestamp: inv.createdAt,
    status: inv.status || 'completed'
  }));

  const purchaseActivities = recentPurchases.map(pur => ({
    id: pur._id,
    type: 'purchase',
    description: `Purchase ${pur.invoiceNumber} - ${pur.supplier?.name || 'Supplier'}`,
    amount: pur.totalAmount,
    timestamp: pur.createdAt,
    status: 'completed'
  }));

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
