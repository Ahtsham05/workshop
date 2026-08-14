const { Expense } = require('../../../models');
const { buildAggScope, resolveRange, buildDateMatch, PERIOD_PARAM } = require('./shared');

async function getExpenseSummary(args, ctx) {
  const { period, startDate, endDate } = resolveRange(args);

  const rows = await Expense.aggregate([
    { $match: { ...buildAggScope(ctx), ...buildDateMatch('date', startDate, endDate), isPaid: { $ne: false } } },
    { $group: { _id: '$category', total: { $sum: '$amount' } } },
    { $sort: { total: -1 } },
  ]);

  return {
    period,
    totalExpenses: rows.reduce((s, r) => s + r.total, 0),
    byCategory: rows.map((r) => ({ category: r._id, total: r.total })),
  };
}

const declarations = [
  {
    name: 'get_expense_summary',
    description: 'Get total business expenses for a time period, broken down by category.',
    permission: 'viewAccounting',
    parameters: { type: 'object', properties: { ...PERIOD_PARAM } },
    handler: getExpenseSummary,
  },
];

module.exports = { declarations };
