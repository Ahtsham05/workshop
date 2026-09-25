const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const { feeCollectionReportService } = require('../services');

const FILTER_KEYS = ['startDate', 'endDate', 'classId', 'sectionId', 'studentId', 'paymentMethod', 'collectedBy'];

const scopeOf = (req) => ({ organizationId: req.user.organizationId, branchId: req.branchId });

const getDashboard = catchAsync(async (req, res) => {
  const result = await feeCollectionReportService.getDashboardSummary(scopeOf(req), pick(req.query, FILTER_KEYS));
  res.send(result);
});

const getMonthly = catchAsync(async (req, res) => {
  const result = await feeCollectionReportService.getMonthlyCollectionReport(scopeOf(req), pick(req.query, FILTER_KEYS));
  res.send(result);
});

const getDaily = catchAsync(async (req, res) => {
  const result = await feeCollectionReportService.getDailyCollectionReport(scopeOf(req), pick(req.query, FILTER_KEYS));
  res.send(result);
});

const getYearly = catchAsync(async (req, res) => {
  const { year, classId, sectionId } = req.query;
  const result = await feeCollectionReportService.getYearlyCollectionReport(scopeOf(req), {
    year: year || new Date().getFullYear(),
    classId,
    sectionId,
  });
  res.send(result);
});

const getTransactions = catchAsync(async (req, res) => {
  const options = pick(req.query, ['page', 'limit']);
  const result = await feeCollectionReportService.getTransactions(scopeOf(req), pick(req.query, FILTER_KEYS), options);
  res.send(result);
});

const getPaymentMethods = catchAsync(async (req, res) => {
  const result = await feeCollectionReportService.getPaymentMethodReport(scopeOf(req), pick(req.query, FILTER_KEYS));
  res.send(result);
});

const getStaff = catchAsync(async (req, res) => {
  const result = await feeCollectionReportService.getStaffCollectionReport(scopeOf(req), pick(req.query, FILTER_KEYS));
  res.send(result);
});

const getDiscounts = catchAsync(async (req, res) => {
  const result = await feeCollectionReportService.getDiscountReport(scopeOf(req), pick(req.query, FILTER_KEYS));
  res.send(result);
});

const getRefunds = catchAsync(async (req, res) => {
  const result = await feeCollectionReportService.getRefundReport(scopeOf(req), pick(req.query, FILTER_KEYS));
  res.send(result);
});

module.exports = {
  getDashboard,
  getMonthly,
  getDaily,
  getYearly,
  getTransactions,
  getPaymentMethods,
  getStaff,
  getDiscounts,
  getRefunds,
};
