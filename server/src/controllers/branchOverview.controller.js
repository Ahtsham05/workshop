const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { branchOverviewService } = require('../services');
const { resolveDashboardDateRange } = require('../utils/dashboardDateRange');

/**
 * GET /v1/branch-overview/summary
 * Org-wide, per-branch performance snapshot — for the super admin who wants to
 * monitor every branch at once without switching their active branch. The owner always
 * sees it; anyone else needs the viewBranchPerformance permission (checked on the route).
 */
const getSummary = catchAsync(async (req, res) => {

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
