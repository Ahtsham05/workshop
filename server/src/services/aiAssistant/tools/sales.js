const { Invoice } = require('../../../models');
const {
  buildFilter,
  buildAggScope,
  resolveRange,
  validProductOrCustomerIdExpr,
  buildDateMatch,
  PERIOD_PARAM,
} = require('./shared');

async function getProfitSummary(args, ctx) {
  const { period, startDate, endDate, compareStart, compareEnd } = resolveRange(args);
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
    revenueChangePercent:
      previousRevenue > 0 ? Math.round(((revenue - previousRevenue) / previousRevenue) * 1000) / 10 : null,
    profitChangePercent: previousProfit > 0 ? Math.round(((profit - previousProfit) / previousProfit) * 1000) / 10 : null,
  };
}

async function getTopProducts(args, ctx) {
  const { period, startDate, endDate } = resolveRange(args);
  const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 20);
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
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    { $project: { _id: 0, name: '$product.name', quantitySold: 1, revenue: 1 } },
  ]);

  return { period, products: rows };
}

async function getTopCustomers(args, ctx) {
  const { period, startDate, endDate } = resolveRange(args);
  const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 20);
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
    { $group: { _id: '$customerId', totalPurchases: { $sum: 1 }, totalAmount: { $sum: '$total' } } },
    { $sort: { totalAmount: -1 } },
    { $limit: limit },
    // Invoice.customerId is `Mixed` (so it can also hold the literal string 'walk-in'), so it's
    // often stored as a plain string even for a real customer, not a BSON ObjectId — a
    // localField/foreignField $lookup does an exact BSON type+value match and silently returns
    // nothing when the types differ, which is why this previously came back with every customer
    // name blank (verified: 3/3 rows had no name in a live test). Comparing both sides as
    // strings via a pipeline $lookup matches regardless of which type this particular invoice's
    // customerId happened to be saved as.
    {
      $lookup: {
        from: 'customers',
        let: { customerId: '$_id' },
        pipeline: [{ $match: { $expr: { $eq: [{ $toString: '$_id' }, { $toString: '$$customerId' }] } } }],
        as: 'customer',
      },
    },
    { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
    { $project: { _id: 0, name: '$customer.name', totalPurchases: 1, totalAmount: 1 } },
  ]);

  return { period, customers: rows };
}

const declarations = [
  {
    name: 'get_profit_summary',
    description:
      "Get the business's revenue, profit and sales count for a time period, compared to the previous equivalent period.",
    permission: 'viewProfitLossReports',
    parameters: { type: 'object', properties: { ...PERIOD_PARAM } },
    handler: getProfitSummary,
  },
  {
    name: 'get_top_products',
    description: 'List the best-selling products by revenue for a time period.',
    // Was missing entirely — buildToolset() in tools/index.js treats an absent `permission` as
    // "always allowed" (`if (!tool.permission) return true`), so this and get_top_customers
    // below were reachable by anyone who could open the assistant at all, regardless of role.
    // Found in the 2026-08-19 security audit.
    permission: 'viewSalesReports',
    parameters: {
      type: 'object',
      properties: { ...PERIOD_PARAM, limit: { type: 'number', description: 'Max products to return, default 5' } },
    },
    handler: getTopProducts,
  },
  {
    name: 'get_top_customers',
    description: 'List the customers who spent the most for a time period.',
    permission: 'viewSalesReports',
    parameters: {
      type: 'object',
      properties: { ...PERIOD_PARAM, limit: { type: 'number', description: 'Max customers to return, default 5' } },
    },
    handler: getTopCustomers,
  },
];

module.exports = { declarations };
