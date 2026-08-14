const { Purchase } = require('../../../models');
const { buildFilter, resolveRange, buildDateMatch, PERIOD_PARAM } = require('./shared');

async function getPurchaseSummary(args, ctx) {
  const { period, startDate, endDate } = resolveRange(args);
  const bf = buildFilter(ctx);

  const purchases = await Purchase.find({ ...bf, ...buildDateMatch('purchaseDate', startDate, endDate) });

  return {
    period,
    purchaseCount: purchases.length,
    totalAmount: purchases.reduce((s, p) => s + (p.totalAmount || 0), 0),
    totalPaid: purchases.reduce((s, p) => s + (p.paidAmount || 0), 0),
    totalOutstanding: purchases.reduce((s, p) => s + (p.balance || 0), 0),
  };
}

const declarations = [
  {
    name: 'get_purchase_summary',
    description:
      'Get total purchases made from suppliers (amount, count, paid vs still-outstanding) for a time period. Use for "how much did I buy this month", "purchases summary".',
    permission: 'viewPurchases',
    parameters: { type: 'object', properties: { ...PERIOD_PARAM } },
    handler: getPurchaseSummary,
  },
];

module.exports = { declarations };
