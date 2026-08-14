const mongoose = require('mongoose');
const { resolveDashboardDateRange, buildDateMatch } = require('../../../utils/dashboardDateRange');

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

const PERIOD_ENUM = ['today', 'week', 'month', 'custom'];
const normalizePeriod = (period) => (PERIOD_ENUM.includes(period) ? period : 'month');

/** Every period-based tool's `parameters.properties` should spread this in. */
const PERIOD_PARAM = {
  period: {
    type: 'string',
    enum: PERIOD_ENUM,
    description: 'today, week (last 7 days), month (month to date), or custom (requires startDate and endDate)',
  },
  startDate: { type: 'string', description: 'YYYY-MM-DD — only used when period is "custom"' },
  endDate: { type: 'string', description: 'YYYY-MM-DD — only used when period is "custom"' },
};

/**
 * Resolves a tool's {period, startDate, endDate} args into concrete date bounds,
 * reusing the same date-range logic the Dashboard/Reports pages use so the
 * assistant's numbers for "this month" etc. always match what the user sees
 * elsewhere in the app. Falls back to 'month' if period is 'custom' but the
 * model didn't supply both dates.
 */
const resolveRange = (args = {}) => {
  const period = normalizePeriod(args.period);
  if (period === 'custom' && !(args.startDate && args.endDate)) {
    return resolveDashboardDateRange({ period: 'month' });
  }
  return resolveDashboardDateRange({ period, startDate: args.startDate, endDate: args.endDate });
};

const validProductOrCustomerIdExpr = (field) => ({
  $expr: {
    $or: [
      { $eq: [{ $type: field }, 'objectId'] },
      {
        $and: [{ $eq: [{ $type: field }, 'string'] }, { $regexMatch: { input: field, regex: /^[a-fA-F0-9]{24}$/ } }],
      },
    ],
  },
});

module.exports = {
  buildFilter,
  buildAggScope,
  PERIOD_ENUM,
  normalizePeriod,
  PERIOD_PARAM,
  resolveRange,
  validProductOrCustomerIdExpr,
  buildDateMatch,
};
