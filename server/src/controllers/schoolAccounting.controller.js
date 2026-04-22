const catchAsync = require('../utils/catchAsync');
const { schoolAccountingService } = require('../services');

const getAccountingDashboard = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const { month, year } = req.query;
  const dashboard = await schoolAccountingService.getAccountingDashboard(scope, month, year ? parseInt(year, 10) : undefined);
  res.send(dashboard);
});

const getMonthlyReport = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const year = parseInt(req.query.year || new Date().getFullYear(), 10);
  const report = await schoolAccountingService.getMonthlyReport(scope, year);
  res.send(report);
});

const getStudentFeeReport = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const { studentId } = req.params;
  const year = req.query.year ? parseInt(req.query.year, 10) : undefined;
  const report = await schoolAccountingService.getStudentFeeReport(scope, studentId, year);
  res.send(report);
});

const getCategoryReport = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const now = new Date();
  const startDate = req.query.startDate || new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const endDate = req.query.endDate || new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
  const report = await schoolAccountingService.getCategoryReport(scope, startDate, endDate);
  res.send(report);
});

const getTeacherSalaryReport = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const year = req.query.year ? parseInt(req.query.year, 10) : undefined;
  const { month } = req.query;
  const report = await schoolAccountingService.getTeacherSalaryReport(scope, year, month);
  res.send(report);
});

module.exports = {
  getAccountingDashboard,
  getMonthlyReport,
  getStudentFeeReport,
  getCategoryReport,
  getTeacherSalaryReport,
};
