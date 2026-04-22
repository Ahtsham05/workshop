const catchAsync = require('../utils/catchAsync');
const { schoolDashboardService } = require('../services');

const getDashboardStats = catchAsync(async (req, res) => {
  const stats = await schoolDashboardService.getDashboardStats({
    organizationId: req.organizationId,
    branchId: req.branchId,
  });
  res.send(stats);
});

const getTeacherAttendanceTodayStats = catchAsync(async (req, res) => {
  const stats = await schoolDashboardService.getTeacherAttendanceTodayStats({
    organizationId: req.organizationId,
    branchId: req.branchId,
  });
  res.send(stats);
});

module.exports = { getDashboardStats, getTeacherAttendanceTodayStats };
