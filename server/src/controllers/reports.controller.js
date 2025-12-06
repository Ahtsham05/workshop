const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { Invoice, Product, Customer, Purchase, Supplier, Expense } = require('../models');

/**
 * Get Sales Report
 * @route GET /v1/reports/sales
 */
const getSalesReport = catchAsync(async (req, res) => {
  const { startDate, endDate, groupBy = 'day' } = req.query;

  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date();

  // Group format based on groupBy parameter
  let groupFormat;
  switch (groupBy) {
    case 'day':
      groupFormat = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
      break;
    case 'week':
      groupFormat = { $isoWeek: '$createdAt' };
      break;
    case 'month':
      groupFormat = { $dateToString: { format: '%Y-%m', date: '$createdAt' } };
      break;
    case 'year':
      groupFormat = { $year: '$createdAt' };
      break;
    default:
      groupFormat = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
  }

  const salesData = await Invoice.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end },
        status: { $ne: 'cancelled' }
      }
    },
    {
      $group: {
        _id: groupFormat,
        totalSales: { $sum: '$total' },
        totalProfit: { $sum: '$totalProfit' },
        totalCost: { $sum: '$totalCost' },
        invoiceCount: { $sum: 1 },
        avgSale: { $avg: '$total' }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);

  // Get summary statistics
  const summary = await Invoice.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end },
        status: { $ne: 'cancelled' }
      }
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$total' },
        totalProfit: { $sum: '$totalProfit' },
        totalCost: { $sum: '$totalCost' },
        totalInvoices: { $sum: 1 },
        avgInvoiceValue: { $avg: '$total' },
        maxInvoiceValue: { $max: '$total' },
        minInvoiceValue: { $min: '$total' }
      }
    }
  ]);

  res.status(httpStatus.OK).send({
    data: salesData,
    summary: summary[0] || {},
    period: { startDate: start, endDate: end }
  });
});

/**
 * Get Purchase Report
 * @route GET /v1/reports/purchases
 */
const getPurchaseReport = catchAsync(async (req, res) => {
  const { startDate, endDate, supplierId } = req.query;

  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date();

  const matchQuery = {
    createdAt: { $gte: start, $lte: end }
  };

  if (supplierId) {
    matchQuery.supplier = supplierId;
  }

  const purchaseData = await Purchase.aggregate([
    { $match: matchQuery },
    {
      $lookup: {
        from: 'suppliers',
        localField: 'supplier',
        foreignField: '_id',
        as: 'supplierDetails'
      }
    },
    { $unwind: '$supplierDetails' },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          supplier: '$supplierDetails.name'
        },
        totalAmount: { $sum: '$totalAmount' },
        paidAmount: { $sum: '$paidAmount' },
        balance: { $sum: '$balance' },
        purchaseCount: { $sum: 1 }
      }
    },
    {
      $sort: { '_id.date': 1 }
    }
  ]);

  const summary = await Purchase.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalPurchases: { $sum: '$totalAmount' },
        totalPaid: { $sum: '$paidAmount' },
        totalBalance: { $sum: '$balance' },
        purchaseCount: { $sum: 1 },
        avgPurchaseValue: { $avg: '$totalAmount' }
      }
    }
  ]);

  res.status(httpStatus.OK).send({
    data: purchaseData,
    summary: summary[0] || {},
    period: { startDate: start, endDate: end }
  });
});

/**
 * Get Product Report
 * @route GET /v1/reports/products
 */
const getProductReport = catchAsync(async (req, res) => {
  const { startDate, endDate, categoryId } = req.query;

  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date();

  // Get product sales data
  const productSales = await Invoice.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end },
        status: { $ne: 'cancelled' }
      }
    },
    { $unwind: '$items' },
    {
      $lookup: {
        from: 'products',
        localField: 'items.productId',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: '$product' },
    ...(categoryId ? [{ $match: { 'product.categories._id': mongoose.Types.ObjectId(categoryId) } }] : []),
    {
      $group: {
        _id: '$items.productId',
        productName: { $first: '$product.name' },
        category: { 
          $first: { 
            $cond: [
              { $and: [
                { $isArray: '$product.categories' },
                { $gt: [{ $size: '$product.categories' }, 0] }
              ]},
              { $arrayElemAt: ['$product.categories.name', 0] },
              { $ifNull: ['$product.category', 'N/A'] }
            ]
          }
        },
        totalQuantitySold: { $sum: '$items.quantity' },
        totalRevenue: { $sum: '$items.subtotal' },
        totalProfit: { $sum: '$items.profit' },
        avgSellingPrice: { $avg: '$items.price' },
        currentStock: { $first: '$product.stockQuantity' },
        minStockLevel: { $first: '$product.minStockLevel' }
      }
    },
    {
      $sort: { totalRevenue: -1 }
    }
  ]);

  // Get stock summary
  const stockSummary = await Product.aggregate([
    {
      $group: {
        _id: null,
        totalProducts: { $sum: 1 },
        totalStockValue: { $sum: { $multiply: ['$stockQuantity', '$purchasePrice'] } },
        lowStockProducts: {
          $sum: {
            $cond: [{ $lte: ['$stockQuantity', 10] }, 1, 0]
          }
        },
        outOfStockProducts: {
          $sum: {
            $cond: [{ $eq: ['$stockQuantity', 0] }, 1, 0]
          }
        }
      }
    }
  ]);

  res.status(httpStatus.OK).send({
    data: productSales,
    stockSummary: stockSummary[0] || {},
    period: { startDate: start, endDate: end }
  });
});

/**
 * Get Single Product Detail Report
 * @route GET /v1/reports/products/:productId
 */
const getProductDetailReport = catchAsync(async (req, res) => {
  const { productId } = req.params;
  const { startDate, endDate } = req.query;

  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date();

  // Get product basic info
  const product = await Product.findById(productId);
  if (!product) {
    return res.status(httpStatus.NOT_FOUND).send({ message: 'Product not found' });
  }

  // Get sales to customers (invoices)
  const salesData = await Invoice.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end },
        status: { $ne: 'cancelled' }
      }
    },
    { $unwind: '$items' },
    {
      $match: {
        'items.productId': product._id
      }
    },
    {
      $lookup: {
        from: 'customers',
        localField: 'customerId',
        foreignField: '_id',
        as: 'customer'
      }
    },
    { $unwind: '$customer' },
    {
      $project: {
        _id: 1,
        invoiceNumber: 1,
        date: '$createdAt',
        customerName: '$customer.name',
        customerPhone: '$customer.phone',
        quantity: '$items.quantity',
        price: '$items.price',
        subtotal: '$items.subtotal',
        profit: '$items.profit',
        type: { $literal: 'sale' }
      }
    },
    {
      $sort: { date: -1 }
    }
  ]);

  // Get purchases from suppliers
  const purchaseData = await Purchase.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end },
        status: { $ne: 'cancelled' }
      }
    },
    { $unwind: '$items' },
    {
      $match: {
        'items.productId': product._id
      }
    },
    {
      $lookup: {
        from: 'suppliers',
        localField: 'supplierId',
        foreignField: '_id',
        as: 'supplier'
      }
    },
    { $unwind: '$supplier' },
    {
      $project: {
        _id: 1,
        purchaseNumber: 1,
        date: '$createdAt',
        supplierName: '$supplier.name',
        supplierPhone: '$supplier.phone',
        quantity: '$items.quantity',
        price: '$items.unitPrice',
        subtotal: { $multiply: ['$items.quantity', '$items.unitPrice'] },
        type: { $literal: 'purchase' }
      }
    },
    {
      $sort: { date: -1 }
    }
  ]);

  // Calculate summary
  const summary = {
    totalSold: salesData.reduce((sum, item) => sum + item.quantity, 0),
    totalPurchased: purchaseData.reduce((sum, item) => sum + item.quantity, 0),
    totalRevenue: salesData.reduce((sum, item) => sum + item.subtotal, 0),
    totalCost: purchaseData.reduce((sum, item) => sum + item.subtotal, 0),
    totalProfit: salesData.reduce((sum, item) => sum + item.profit, 0),
    uniqueCustomers: new Set(salesData.map(item => item.customerName)).size,
    uniqueSuppliers: new Set(purchaseData.map(item => item.supplierName)).size,
  };

  res.status(httpStatus.OK).send({
    product: {
      _id: product._id,
      name: product.name,
      barcode: product.barcode,
      currentStock: product.stockQuantity,
      purchasePrice: product.purchasePrice,
      sellingPrice: product.sellingPrice,
      minStockLevel: product.minStockLevel
    },
    summary,
    sales: salesData,
    purchases: purchaseData,
    period: { startDate: start, endDate: end }
  });
});

/**
 * Get Customer Report
 * @route GET /v1/reports/customers
 */
const getCustomerReport = catchAsync(async (req, res) => {
  const { startDate, endDate, top = 20 } = req.query;

  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date();

  const customerData = await Invoice.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end },
        status: { $ne: 'cancelled' },
        customerId: { $exists: true, $ne: 'walk-in' }
      }
    },
    {
      $lookup: {
        from: 'customers',
        localField: 'customerId',
        foreignField: '_id',
        as: 'customer'
      }
    },
    { $unwind: '$customer' },
    {
      $group: {
        _id: '$customerId',
        customerName: { $first: '$customer.name' },
        phone: { $first: '$customer.phone' },
        email: { $first: '$customer.email' },
        totalPurchases: { $sum: 1 },
        totalSpent: { $sum: '$total' },
        totalProfit: { $sum: '$totalProfit' },
        avgPurchaseValue: { $avg: '$total' },
        lastPurchase: { $max: '$createdAt' },
        firstPurchase: { $min: '$createdAt' }
      }
    },
    {
      $sort: { totalSpent: -1 }
    },
    {
      $limit: parseInt(top)
    }
  ]);

  const summary = await Invoice.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end },
        status: { $ne: 'cancelled' }
      }
    },
    {
      $group: {
        _id: null,
        uniqueCustomers: { $addToSet: '$customerId' },
        totalTransactions: { $sum: 1 },
        totalRevenue: { $sum: '$total' }
      }
    },
    {
      $project: {
        uniqueCustomers: { $size: '$uniqueCustomers' },
        totalTransactions: 1,
        totalRevenue: 1,
        avgTransactionValue: { $divide: ['$totalRevenue', '$totalTransactions'] }
      }
    }
  ]);

  res.status(httpStatus.OK).send({
    data: customerData,
    summary: summary[0] || {},
    period: { startDate: start, endDate: end }
  });
});

/**
 * Get Supplier Report
 * @route GET /v1/reports/suppliers
 */
const getSupplierReport = catchAsync(async (req, res) => {
  const { startDate, endDate } = req.query;

  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date();

  const supplierData = await Purchase.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end }
      }
    },
    {
      $lookup: {
        from: 'suppliers',
        localField: 'supplier',
        foreignField: '_id',
        as: 'supplierDetails'
      }
    },
    { $unwind: '$supplierDetails' },
    {
      $group: {
        _id: '$supplier',
        supplierName: { $first: '$supplierDetails.name' },
        phone: { $first: '$supplierDetails.phone' },
        email: { $first: '$supplierDetails.email' },
        totalPurchases: { $sum: 1 },
        totalAmount: { $sum: '$totalAmount' },
        totalPaid: { $sum: '$paidAmount' },
        totalBalance: { $sum: '$balance' },
        avgPurchaseValue: { $avg: '$totalAmount' },
        lastPurchase: { $max: '$createdAt' }
      }
    },
    {
      $sort: { totalAmount: -1 }
    }
  ]);

  const summary = await Purchase.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end }
      }
    },
    {
      $group: {
        _id: null,
        totalPurchases: { $sum: '$totalAmount' },
        totalPaid: { $sum: '$paidAmount' },
        totalBalance: { $sum: '$balance' },
        purchaseCount: { $sum: 1 }
      }
    }
  ]);

  res.status(httpStatus.OK).send({
    data: supplierData,
    summary: summary[0] || {},
    period: { startDate: start, endDate: end }
  });
});

/**
 * Get Expense Report
 * @route GET /v1/reports/expenses
 */
const getExpenseReport = catchAsync(async (req, res) => {
  const { startDate, endDate, category } = req.query;

  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date();

  const matchQuery = {
    date: { $gte: start, $lte: end }
  };

  if (category) {
    matchQuery.category = category;
  }

  const expenseData = await Expense.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          category: '$category'
        },
        totalAmount: { $sum: '$amount' },
        expenseCount: { $sum: 1 }
      }
    },
    {
      $sort: { '_id.date': 1 }
    }
  ]);

  const categoryBreakdown = await Expense.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$category',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
        avgAmount: { $avg: '$amount' }
      }
    },
    {
      $sort: { totalAmount: -1 }
    }
  ]);

  const summary = await Expense.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalExpenses: { $sum: '$amount' },
        expenseCount: { $sum: 1 },
        avgExpense: { $avg: '$amount' },
        maxExpense: { $max: '$amount' },
        minExpense: { $min: '$amount' }
      }
    }
  ]);

  res.status(httpStatus.OK).send({
    data: expenseData,
    categoryBreakdown,
    summary: summary[0] || {},
    period: { startDate: start, endDate: end }
  });
});

/**
 * Get Profit & Loss Report
 * @route GET /v1/reports/profit-loss
 */
const getProfitLossReport = catchAsync(async (req, res) => {
  const { startDate, endDate } = req.query;

  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date();

  // Calculate revenue from sales
  const revenueData = await Invoice.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end },
        status: { $ne: 'cancelled' }
      }
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$total' },
        totalCost: { $sum: '$totalCost' },
        grossProfit: { $sum: '$totalProfit' }
      }
    }
  ]);

  // Calculate expenses
  const expenseData = await Expense.aggregate([
    {
      $match: {
        date: { $gte: start, $lte: end }
      }
    },
    {
      $group: {
        _id: null,
        totalExpenses: { $sum: '$amount' }
      }
    }
  ]);

  const revenue = revenueData[0] || { totalRevenue: 0, totalCost: 0, grossProfit: 0 };
  const expenses = expenseData[0] || { totalExpenses: 0 };

  const netProfit = revenue.grossProfit - expenses.totalExpenses;
  const profitMargin = revenue.totalRevenue > 0 ? (netProfit / revenue.totalRevenue) * 100 : 0;

  res.status(httpStatus.OK).send({
    revenue: {
      totalRevenue: revenue.totalRevenue,
      costOfGoodsSold: revenue.totalCost,
      grossProfit: revenue.grossProfit,
      grossProfitMargin: revenue.totalRevenue > 0 ? (revenue.grossProfit / revenue.totalRevenue) * 100 : 0
    },
    expenses: {
      totalExpenses: expenses.totalExpenses
    },
    netProfit: {
      amount: netProfit,
      margin: profitMargin
    },
    period: { startDate: start, endDate: end }
  });
});

/**
 * Get Inventory Report
 * @route GET /v1/reports/inventory
 */
const getInventoryReport = catchAsync(async (req, res) => {
  const { status } = req.query;

  let matchQuery = {};
  
  if (status === 'low') {
    matchQuery = { $expr: { $lte: ['$stockQuantity', 10] } };
  } else if (status === 'out') {
    matchQuery = { stockQuantity: 0 };
  }

  const inventoryData = await Product.aggregate([
    { $match: matchQuery },
    {
      $lookup: {
        from: 'categories',
        localField: 'category',
        foreignField: '_id',
        as: 'categoryDetails'
      }
    },
    {
      $unwind: {
        path: '$categoryDetails',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $project: {
        name: 1,
        barcode: 1,
        category: '$categoryDetails.name',
        stockQuantity: 1,
        minStockLevel: 1,
        purchasePrice: 1,
        sellingPrice: 1,
        stockValue: { $multiply: ['$stockQuantity', '$purchasePrice'] },
        potentialRevenue: { $multiply: ['$stockQuantity', '$sellingPrice'] },
        status: {
          $cond: [
            { $eq: ['$stockQuantity', 0] },
            'Out of Stock',
            {
              $cond: [
                { $lte: ['$stockQuantity', 10] },
                'Low Stock',
                'In Stock'
              ]
            }
          ]
        }
      }
    },
    {
      $sort: { stockQuantity: 1 }
    }
  ]);

  const summary = await Product.aggregate([
    {
      $group: {
        _id: null,
        totalProducts: { $sum: 1 },
        totalStockQuantity: { $sum: '$stockQuantity' },
        totalStockValue: { $sum: { $multiply: ['$stockQuantity', '$purchasePrice'] } },
        totalPotentialRevenue: { $sum: { $multiply: ['$stockQuantity', '$sellingPrice'] } },
        lowStockCount: {
          $sum: {
            $cond: [{ $and: [{ $gt: ['$stockQuantity', 0] }, { $lte: ['$stockQuantity', 10] }] }, 1, 0]
          }
        },
        outOfStockCount: {
          $sum: {
            $cond: [{ $eq: ['$stockQuantity', 0] }, 1, 0]
          }
        }
      }
    }
  ]);

  res.status(httpStatus.OK).send({
    data: inventoryData,
    summary: summary[0] || {}
  });
});

/**
 * Get Tax Report
 * @route GET /v1/reports/tax
 */
const getTaxReport = catchAsync(async (req, res) => {
  const { startDate, endDate } = req.query;

  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date();

  const taxData = await Invoice.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end },
        status: { $ne: 'cancelled' }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
        totalSales: { $sum: '$total' },
        totalTax: { $sum: '$taxAmount' },
        invoiceCount: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);

  const summary = await Invoice.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end },
        status: { $ne: 'cancelled' }
      }
    },
    {
      $group: {
        _id: null,
        totalTaxCollected: { $sum: '$taxAmount' },
        totalSales: { $sum: '$total' },
        avgTaxRate: { $avg: { $divide: ['$taxAmount', '$total'] } }
      }
    }
  ]);

  res.status(httpStatus.OK).send({
    data: taxData,
    summary: summary[0] || {},
    period: { startDate: start, endDate: end }
  });
});

module.exports = {
  getSalesReport,
  getPurchaseReport,
  getProductReport,
  getProductDetailReport,
  getCustomerReport,
  getSupplierReport,
  getExpenseReport,
  getProfitLossReport,
  getInventoryReport,
  getTaxReport,
};
