const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { branchOverviewService } = require('../services');
const { resolveDashboardDateRange } = require('../utils/dashboardDateRange');

/**
 * GET /v1/branch-overview/summary
 * Org-wide, per-branch performance snapshot — for the super admin who wants to
 * monitor every branch at once without switching their active branch. Deliberately
 * gated on systemRole here rather than a delegable permission: this is an
 * owner-level view of every branch's numbers, not a role a business can hand to staff.
 */
const getSummary = catchAsync(async (req, res) => {
  if (req.user.systemRole !== 'superAdmin' && req.user.systemRole !== 'system_admin') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Only the organization owner can view the branch overview');
  }

  const organizationId = req.user.organizationId;
  if (!organizationId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'User has no organization.');
  }

  const { startDate, endDate, period, startCalendar, endCalendar } = resolveDashboardDateRange(req.query);
  const summary = await branchOverviewService.getBranchOverviewSummary({ organizationId, startDate, endDate });

  res.status(httpStatus.OK).send({
    ...summary,
    period: { preset: period, startDate: startCalendar, endDate: endCalendar },
  });
});

module.exports = { getSummary };
