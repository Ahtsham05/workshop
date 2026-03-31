const catchAsync = require('../utils/catchAsync');
const { mobileDashboardService } = require('../services');

const getSummary = catchAsync(async (req, res) => {
  const summary = await mobileDashboardService.getMobileDashboardSummary({
    organizationId: req.organizationId || req.user.organizationId,
    branchId: req.branchId,
    startDate: req.query.startDate,
    endDate: req.query.endDate,
  });

  res.send(summary);
});

module.exports = {
  getSummary,
};
