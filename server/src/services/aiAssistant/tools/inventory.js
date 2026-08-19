const { Invoice, Product, StockAdjustment, InventoryTransfer } = require('../../../models');
const productService = require('../../product.service');
const { buildFilter, buildAggScope, resolveRange, validProductOrCustomerIdExpr, PERIOD_PARAM } = require('./shared');

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

  return { days, productCount: deadStock.length, products: deadStock.slice(0, limit) };
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

  return { productCount: lowStock.length, products: lowStock.slice(0, limit) };
}

async function getStockMovements(args, ctx) {
  const { period, startDate, endDate } = resolveRange({
    period: args.period || 'week',
    startDate: args.startDate,
    endDate: args.endDate,
  });

  // Reuses the same org/branch scope every other tool builds via buildAggScope — was previously
  // hand-rolled here with its own mongoose.Types.ObjectId.isValid checks, functionally identical
  // but duplicated logic that could silently drift out of sync if buildAggScope ever changes.
  const aggScope = buildAggScope(ctx);
  const branchObjId = aggScope.branchId || null;

  const adjustmentMatch = { ...aggScope, createdAt: { $gte: startDate, $lte: endDate } };

  // InventoryTransfer has no single `branchId` field — a transfer touches this branch if it's
  // either end, hence the $or (buildAggScope alone can't express that, so this part stays custom).
  const transferMatch = { status: 'completed', completedAt: { $gte: startDate, $lte: endDate } };
  if (aggScope.organizationId) transferMatch.organizationId = aggScope.organizationId;
  if (branchObjId) transferMatch.$or = [{ fromBranchId: branchObjId }, { toBranchId: branchObjId }];

  const [adjustmentRows, completedTransfersCount] = await Promise.all([
    StockAdjustment.aggregate([
      { $match: adjustmentMatch },
      { $group: { _id: '$type', quantity: { $sum: '$quantity' }, totalValue: { $sum: '$totalValue' }, count: { $sum: 1 } } },
      { $sort: { totalValue: -1 } },
    ]),
    InventoryTransfer.countDocuments(transferMatch),
  ]);

  return {
    period,
    adjustments: adjustmentRows.map((r) => ({ type: r._id, quantity: r.quantity, totalValue: r.totalValue, count: r.count })),
    completedTransfersCount,
  };
}

const declarations = [
  {
    name: 'get_dead_stock',
    description:
      "List in-stock products that have not sold in the given number of days. Use for \"products that haven't sold\", \"dead stock\", \"slow moving inventory\".",
    permission: 'viewProducts',
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Number of days with no sales, default 30' },
        limit: { type: 'number', description: 'Max products to return, default 20' },
      },
    },
    handler: getDeadStock,
  },
  {
    name: 'get_low_stock',
    description: 'List products that are low in stock (10 units or fewer) or out of stock, sorted lowest first.',
    permission: 'viewProducts',
    parameters: { type: 'object', properties: { limit: { type: 'number', description: 'Max products to return, default 20' } } },
    handler: getLowStock,
  },
  {
    name: 'get_stock_movements',
    description:
      'Get a summary of stock adjustments (damage, theft, loss, correction, found) and completed branch-to-branch transfers for a time period. Use for "stock adjustments", "inventory losses", "how much stock did I write off".',
    permission: 'viewProducts',
    parameters: { type: 'object', properties: { ...PERIOD_PARAM } },
    handler: getStockMovements,
  },
];

module.exports = { declarations };
