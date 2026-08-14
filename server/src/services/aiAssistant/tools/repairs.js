const { RepairJob } = require('../../../models');
const { buildAggScope, resolveRange, buildDateMatch, PERIOD_PARAM } = require('./shared');

const EMPTY = { count: 0, totalCharges: 0 };

async function getRepairJobsSummary(args, ctx) {
  const { period, startDate, endDate } = resolveRange({
    period: args.period || 'week',
    startDate: args.startDate,
    endDate: args.endDate,
  });

  const rows = await RepairJob.aggregate([
    { $match: { ...buildAggScope(ctx), ...buildDateMatch('date', startDate, endDate) } },
    { $group: { _id: '$status', count: { $sum: 1 }, totalCharges: { $sum: '$charges' } } },
  ]);

  const byStatus = {};
  rows.forEach((r) => {
    byStatus[r._id] = { count: r.count, totalCharges: r.totalCharges };
  });

  return {
    period,
    pending: byStatus.pending || EMPTY,
    inProgress: byStatus.in_progress || EMPTY,
    completed: byStatus.completed || EMPTY,
    delivered: byStatus.delivered || EMPTY,
  };
}

const declarations = [
  {
    name: 'get_repair_jobs_summary',
    description:
      'Get repair job counts and charges broken down by status (pending, in progress, completed, delivered) for a time period. Only relevant for phone/device repair shops.',
    permission: 'viewRepairs',
    businessTypes: ['mobile_shop'],
    parameters: { type: 'object', properties: { ...PERIOD_PARAM } },
    handler: getRepairJobsSummary,
  },
];

module.exports = { declarations };
