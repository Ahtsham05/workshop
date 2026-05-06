const mongoose = require('mongoose');
const catchAsync = require('../utils/catchAsync');
const { schoolReportsService } = require('../services');

/**
 * Unified report endpoint — dispatches by ?type= param
 * GET /school-reports-engine?type=financial-monthly&year=2026
 */
const getReport = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const { type, period, year, month, classId, teacherId, startDate, endDate, status } = req.query;
  const report = await schoolReportsService.getReport(scope, {
    type, period, year, month, classId, teacherId, startDate, endDate, status,
  });
  res.send(report);
});

/** Financial reports */
const getMonthlyIncomeExpense = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const year = parseInt(req.query.year || new Date().getFullYear(), 10);
  res.send(await schoolReportsService.getMonthlyIncomeExpense(scope, year));
});

const getDailyCollection = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const year = parseInt(req.query.year || new Date().getFullYear(), 10);
  const month = req.query.month || new Date().toLocaleString('default', { month: 'long' });
  res.send(await schoolReportsService.getDailyCollection(scope, year, month));
});

const getCategoryReport = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  res.send(await schoolReportsService.getCategoryWiseReport(scope, req.query.startDate, req.query.endDate));
});

const getProfitAndLoss = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const year = parseInt(req.query.year || new Date().getFullYear(), 10);
  res.send(await schoolReportsService.getProfitAndLoss(scope, year));
});

/** Student reports */
const getStudentList = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  res.send(await schoolReportsService.getStudentListByClass(scope, req.query.classId));
});

const getStudentFeeStatus = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const year = parseInt(req.query.year || new Date().getFullYear(), 10);
  const month = req.query.month || new Date().toLocaleString('default', { month: 'long' });
  res.send(await schoolReportsService.getStudentFeeStatus(scope, year, month, req.query.classId));
});

const getStudentAttendance = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const year = parseInt(req.query.year || new Date().getFullYear(), 10);
  const month = req.query.month || new Date().toLocaleString('default', { month: 'long' });
  res.send(await schoolReportsService.getStudentAttendanceSummary(scope, year, month, req.query.classId));
});

/** Teacher reports */
const getTeacherSalary = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const year = parseInt(req.query.year || new Date().getFullYear(), 10);
  res.send(await schoolReportsService.getTeacherSalaryReport(scope, year));
});

const getTeacherWorkload = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  res.send(await schoolReportsService.getTeacherWorkload(scope));
});

/** Voucher reports */
const getVoucherReport = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const year = parseInt(req.query.year || new Date().getFullYear(), 10);
  const month = req.query.month || new Date().toLocaleString('default', { month: 'long' });
  res.send(await schoolReportsService.getVouchersByStatus(scope, req.query.status || null, year, month, req.query.classId));
});

/** Analytics */
const getAnalytics = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const year = parseInt(req.query.year || new Date().getFullYear(), 10);
  res.send(await schoolReportsService.getAnalytics(scope, year));
});

/** Fee Collection: Yearly per-student report */
const getYearlyFeeReport = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const year = parseInt(req.query.year || new Date().getFullYear(), 10);
  const classId = req.query.classId || null;
  res.send(await schoolReportsService.getYearlyFeeReport(scope, year, classId));
});

/** Fee Collection: Receivable summary (arrears + wallet). Optional ?classId= for per-class totals */
const getReceivableSummary = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const year = parseInt(req.query.year || new Date().getFullYear(), 10);
  const month = req.query.month || new Date().toLocaleString('default', { month: 'long' });
  const raw = req.query.classId;
  const classId = raw && mongoose.Types.ObjectId.isValid(raw) ? raw : null;
  res.send(await schoolReportsService.getReceivableSummary(scope, year, month, classId));
});

module.exports = {
  getReport,
  getMonthlyIncomeExpense,
  getDailyCollection,
  getCategoryReport,
  getProfitAndLoss,
  getStudentList,
  getStudentFeeStatus,
  getStudentAttendance,
  getTeacherSalary,
  getTeacherWorkload,
  getVoucherReport,
  getAnalytics,
  getYearlyFeeReport,
  getReceivableSummary,
};
