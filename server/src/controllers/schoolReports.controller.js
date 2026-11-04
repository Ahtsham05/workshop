const mongoose = require('mongoose');
const catchAsync = require('../utils/catchAsync');
const { schoolReportsService, feePositionService } = require('../services');

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

const getExpenseDetail = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const year = parseInt(req.query.year || new Date().getFullYear(), 10);
  const month = req.query.month || new Date().toLocaleString('default', { month: 'long' });
  res.send(await schoolReportsService.getExpenseDetailReport(scope, year, month));
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

const getStudentsLeft = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const { classId, reason, startDate, endDate } = req.query;
  res.send(await schoolReportsService.getLeftStudentsReport(scope, { classId, reason, startDate, endDate }));
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

const parseFeePositionFilters = (req) => {
  const { classId, sectionId } = req.query;
  return {
    classId: classId && mongoose.Types.ObjectId.isValid(classId) ? classId : undefined,
    sectionId: sectionId && mongoose.Types.ObjectId.isValid(sectionId) ? sectionId : undefined,
  };
};

/** Previous + this month's fees for one fee month. ?detail=classes|students adds rows. */
const getFeePosition = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const fallback = feePositionService.currentFeeMonth();
  const { month, year, detail } = req.query;
  res.send(
    await feePositionService.getFeePosition(scope, {
      month: feePositionService.MONTH_ORDER.includes(month) ? month : fallback.month,
      year: parseInt(year, 10) || fallback.year,
      detail: ['classes', 'students'].includes(detail) ? detail : 'summary',
      ...parseFeePositionFilters(req),
    })
  );
});

/** The same figures for each month of a year. */
const getFeePositionYear = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  res.send(
    await feePositionService.getFeePositionYear(scope, {
      year: parseInt(req.query.year, 10) || feePositionService.currentFeeMonth().year,
      ...parseFeePositionFilters(req),
    })
  );
});

/** Each fund: billed, the month money arrived, still owed. */
const getFundReport = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  res.send(
    await feePositionService.getFundReport(scope, {
      year: parseInt(req.query.year, 10) || feePositionService.currentFeeMonth().year,
      ...parseFeePositionFilters(req),
    })
  );
});

/** One fund in full: ?fund=Paper Fund. */
const getFundDetail = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  res.send(
    await feePositionService.getFundDetail(scope, {
      year: parseInt(req.query.year, 10) || feePositionService.currentFeeMonth().year,
      fund: String(req.query.fund || ''),
      ...parseFeePositionFilters(req),
    })
  );
});

/** Every fund, year by year. */
const getFundYears = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  res.send(await feePositionService.getFundYears(scope, parseFeePositionFilters(req)));
});

module.exports = {
  getReport,
  getMonthlyIncomeExpense,
  getDailyCollection,
  getCategoryReport,
  getExpenseDetail,
  getProfitAndLoss,
  getStudentList,
  getStudentFeeStatus,
  getStudentAttendance,
  getStudentsLeft,
  getTeacherSalary,
  getTeacherWorkload,
  getVoucherReport,
  getAnalytics,
  getYearlyFeeReport,
  getReceivableSummary,
  getFeePosition,
  getFeePositionYear,
  getFundReport,
  getFundDetail,
  getFundYears,
};
