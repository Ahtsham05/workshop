const mongoose = require('mongoose');
const {
  Invoice,
  Product,
  Expense,
} = require('../../models');
const customerLedgerService = require('../customerLedger.service');
const supplierLedgerService = require('../supplierLedger.service');
const productService = require('../product.service');
const { resolveDashboardDateRange, buildDateMatch } = require('../../utils/dashboardDateRange');

/**
 * Scope helpers — every tool handler MUST use these instead of trusting
 * anything the model passes in args, so a user can never read another
 * organization/branch's data via a crafted prompt.
 */
const buildFilter = (ctx) => {
  const filter = { organizationId: ctx.organizationId };
  if (ctx.branchId) filter.branchId = ctx.branchId;
  return filter;
};

const buildAggScope = (ctx) => {
  const scope = {};
  if (ctx.organizationId && mongoose.Types.ObjectId.isValid(ctx.organizationId)) {
    scope.organizationId = new mongoose.Types.ObjectId(String(ctx.organizationId));
  }
  if (ctx.branchId && mongoose.Types.ObjectId.isValid(ctx.branchId)) {
    scope.branchId = new mongoose.Types.ObjectId(String(ctx.branchId));
  }
  return scope;
};

const PERIOD_ENUM = ['today', 'week', 'month'];
const normalizePeriod = (period) => (PERIOD_ENUM.includes(period) ? period : 'month');

const validProductOrCustomerIdExpr = (field) => ({
  $expr: {
    $or: [
      { $eq: [{ $type: field }, 'objectId'] },
      {
        $and: [
          { $eq: [{ $type: field }, 'string'] },
          { $regexMatch: { input: field, regex: /^[a-fA-F0-9]{24}$/ } },
        ],
      },
    ],
  },
});

async function getProfitSummary(args, ctx) {
  const period = normalizePeriod(args.period);
  const { startDate, endDate, compareStart, compareEnd } = resolveDashboardDateRange({ period });
  const bf = buildFilter(ctx);

  const [current, previous] = await Promise.all([
    Invoice.find({ ...bf, ...buildDateMatch('invoiceDate', startDate, endDate), status: { $ne: 'cancelled' } }),
    Invoice.find({ ...bf, ...buildDateMatch('invoiceDate', compareStart, compareEnd), status: { $ne: 'cancelled' } }),
  ]);

  const sum = (rows, key) => rows.reduce((s, r) => s + (r[key] || 0), 0);
  const revenue = sum(current, 'total');
  const profit = sum(current, 'totalProfit');
  const previousRevenue = sum(previous, 'total');
  const previousProfit = sum(previous, 'totalProfit');

  return {
    period,
    revenue,
    profit,
    salesCount: current.length,
    previousRevenue,
    previousProfit,
    revenueChangePercent: previousRevenue > 0 ? Math.round(((revenue - previousRevenue) / previousRevenue) * 1000) / 10 : null,
    profitChangePercent: previousProfit > 0 ? Math.round(((profit - previousProfit) / previousProfit) * 1000) / 10 : null,
  };
}

async function getUnpaidCustomers(args, ctx) {
  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
  const customers = await customerLedgerService.getAllCustomersWithBalances(buildFilter(ctx));
  const unpaid = customers
    .filter((c) => (c.balance || 0) > 0)
    .sort((a, b) => b.balance - a.balance);

  return {
    totalOutstanding: unpaid.reduce((s, c) => s + c.balance, 0),
    customerCount: unpaid.length,
    customers: unpaid.slice(0, limit).map((c) => ({
      name: c.name,
      phone: c.phone,
      balance: c.balance,
      lastTransactionDate: c.lastTransactionDate,
    })),
  };
}

async function getPayablesToSuppliers(args, ctx) {
  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
  const suppliers = await supplierLedgerService.getAllSuppliersWithBalances(buildFilter(ctx));
  const payable = suppliers
    .filter((s) => (s.balance || 0) > 0)
    .sort((a, b) => b.balance - a.balance);

  return {
    totalPayable: payable.reduce((s, x) => s + x.balance, 0),
    supplierCount: payable.length,
    suppliers: payable.slice(0, limit).map((s) => ({
      name: s.name,
      phone: s.phone,
      balance: s.balance,
    })),
  };
}

async function getDeadStock(args, ctx) {
  const days = Math.min(Math.max(Number(args.days) || 30, 1), 365);
  const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
  const aggScope = buildAggScope(ctx);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const soldRows = await Invoice.aggregate([
    { $match: { ...aggScope, invoiceDate: { $gte: cutoff }, status: { $ne: 'cancelled' } } },
    { $unwind: '$items' },
    { $match: validProductOrCustomerIdExpr('$items.productId') },
    { $group: { _id: '$items.productId' } },
  ]);
  const soldIds = soldRows.map((r) => r._id);

  const products = await Product.find({ ...buildFilter(ctx), _id: { $nin: soldIds } }).populate('category', 'name');
  const withAggregates = await productService.attachVariantAggregates(products);

  const deadStock = withAggregates
    .map((p) => ({
      name: p.name,
      category: p.category && p.category.name ? p.category.name : 'Uncategorized',
      stockQuantity: p.hasVariants ? (p.variantStockTotal ?? 0) : p.stockQuantity,
    }))
    .filter((p) => p.stockQuantity > 0)
    .sort((a, b) => b.stockQuantity - a.stockQuantity);

  return {
    days,
    productCount: deadStock.length,
    products: deadStock.slice(0, limit),
  };
}

async function getLowStock(args, ctx) {
  const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50);
  const products = await Product.find(buildFilter(ctx)).populate('category', 'name');
  const withAggregates = await productService.attachVariantAggregates(products);

  const lowStock = withAggregates
    .map((p) => ({
      name: p.name,
      category: p.category && p.category.name ? p.category.name : 'Uncategorized',
      stockQuantity: p.hasVariants ? (p.variantStockTotal ?? 0) : p.stockQuantity,
    }))
    .filter((p) => p.stockQuantity <= 10)
    .sort((a, b) => a.stockQuantity - b.stockQuantity);

  return {
    productCount: lowStock.length,
    products: lowStock.slice(0, limit),
  };
}

async function getTopProducts(args, ctx) {
  const period = normalizePeriod(args.period);
  const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 20);
  const { startDate, endDate } = resolveDashboardDateRange({ period });
  const aggScope = buildAggScope(ctx);

  const rows = await Invoice.aggregate([
    { $match: { ...aggScope, ...buildDateMatch('invoiceDate', startDate, endDate), status: { $ne: 'cancelled' } } },
    { $unwind: '$items' },
    { $match: validProductOrCustomerIdExpr('$items.productId') },
    {
      $group: {
        _id: '$items.productId',
        quantitySold: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.subtotal' },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: limit },
    {
      $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' },
    },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        name: '$product.name',
        quantitySold: 1,
        revenue: 1,
      },
    },
  ]);

  return { period, products: rows };
}

async function getTopCustomers(args, ctx) {
  const period = normalizePeriod(args.period);
  const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 20);
  const { startDate, endDate } = resolveDashboardDateRange({ period });
  const aggScope = buildAggScope(ctx);

  const rows = await Invoice.aggregate([
    {
      $match: {
        ...aggScope,
        ...buildDateMatch('invoiceDate', startDate, endDate),
        status: { $ne: 'cancelled' },
        ...validProductOrCustomerIdExpr('$customerId'),
      },
    },
    {
      $group: {
        _id: '$customerId',
        totalPurchases: { $sum: 1 },
        totalAmount: { $sum: '$total' },
      },
    },
    { $sort: { totalAmount: -1 } },
    { $limit: limit },
    {
      $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' },
    },
    { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        name: '$customer.name',
        totalPurchases: 1,
        totalAmount: 1,
      },
    },
  ]);

  return { period, customers: rows };
}

async function getExpenseSummary(args, ctx) {
  const period = normalizePeriod(args.period);
  const { startDate, endDate } = resolveDashboardDateRange({ period });

  const rows = await Expense.aggregate([
    { $match: { ...buildAggScope(ctx), ...buildDateMatch('date', startDate, endDate) } },
    { $group: { _id: '$category', total: { $sum: '$amount' } } },
    { $sort: { total: -1 } },
  ]);

  return {
    period,
    totalExpenses: rows.reduce((s, r) => s + r.total, 0),
    byCategory: rows.map((r) => ({ category: r._id, total: r.total })),
  };
}

const TOOL_DECLARATIONS = [
  {
    name: 'get_profit_summary',
    description: "Get the business's revenue, profit and sales count for a time period, compared to the previous equivalent period.",
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: PERIOD_ENUM, description: 'today, week (last 7 days), or month (month to date)' },
      },
    },
  },
  {
    name: 'get_unpaid_customers',
    description: 'List customers who currently owe the business money (positive ledger balance), sorted by amount owed, descending. Use for "unpaid customers", "who owes me money", "outstanding receivables".',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Max customers to return, default 10' } },
    },
  },
  {
    name: 'get_payables_to_suppliers',
    description: 'List suppliers the business currently owes money to, sorted by amount owed, descending. Use for "who do I owe", "supplier payables".',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Max suppliers to return, default 10' } },
    },
  },
  {
    name: 'get_dead_stock',
    description: "List in-stock products that have not sold in the given number of days. Use for \"products that haven't sold\", \"dead stock\", \"slow moving inventory\".",
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Number of days with no sales, default 30' },
        limit: { type: 'number', description: 'Max products to return, default 20' },
      },
    },
  },
  {
    name: 'get_low_stock',
    description: 'List products that are low in stock (10 units or fewer) or out of stock, sorted lowest first.',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Max products to return, default 20' } },
    },
  },
  {
    name: 'get_top_products',
    description: 'List the best-selling products by revenue for a time period.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: PERIOD_ENUM },
        limit: { type: 'number', description: 'Max products to return, default 5' },
      },
    },
  },
  {
    name: 'get_top_customers',
    description: 'List the customers who spent the most for a time period.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: PERIOD_ENUM },
        limit: { type: 'number', description: 'Max customers to return, default 5' },
      },
    },
  },
  {
    name: 'get_expense_summary',
    description: 'Get total business expenses for a time period, broken down by category.',
    parameters: {
      type: 'object',
      properties: { period: { type: 'string', enum: PERIOD_ENUM } },
    },
  },
];

const TOOL_HANDLERS = {
  get_profit_summary: getProfitSummary,
  get_unpaid_customers: getUnpaidCustomers,
  get_payables_to_suppliers: getPayablesToSuppliers,
  get_dead_stock: getDeadStock,
  get_low_stock: getLowStock,
  get_top_products: getTopProducts,
  get_top_customers: getTopCustomers,
  get_expense_summary: getExpenseSummary,
};

module.exports = { TOOL_DECLARATIONS, TOOL_HANDLERS };
