const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');
const installmentService = require('../services/installment.service');

// ── Plans ─────────────────────────────────────────────────────────────────────

const createInstallmentPlan = catchAsync(async (req, res) => {
  const plan = await installmentService.createInstallmentPlan({
    ...req.body,
    ...getBranchContext(req),
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });
  res.status(httpStatus.CREATED).send(plan);
});

const getInstallmentPlans = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['status', 'customerPhone']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'startDate', 'endDate', 'search']);
  const result = await installmentService.queryInstallmentPlans(filter, options);
  res.send(result);
});

const getInstallmentPlan = catchAsync(async (req, res) => {
  const plan = await installmentService.getInstallmentPlanById(req.params.planId);
  res.send(plan);
});

const updateInstallmentPlan = catchAsync(async (req, res) => {
  const plan = await installmentService.updateInstallmentPlan(req.params.planId, req.body, req.user.id);
  res.send(plan);
});

const deleteInstallmentPlan = catchAsync(async (req, res) => {
  await installmentService.deleteInstallmentPlan(req.params.planId);
  res.status(httpStatus.NO_CONTENT).send();
});

// ── Payments ──────────────────────────────────────────────────────────────────

const recordPayment = catchAsync(async (req, res) => {
  const result = await installmentService.recordPayment(req.params.planId, req.body, req.user.id);
  res.status(httpStatus.CREATED).send(result);
});

const getPaymentsByPlan = catchAsync(async (req, res) => {
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await installmentService.getPaymentsByPlan(req.params.planId, options);
  res.send(result);
});

const deletePayment = catchAsync(async (req, res) => {
  await installmentService.deletePayment(req.params.planId, req.params.paymentId, req.user.id);
  res.status(httpStatus.NO_CONTENT).send();
});

// ── Summary ───────────────────────────────────────────────────────────────────

const getInstallmentSummary = catchAsync(async (req, res) => {
  const scope = {};
  applyBranchFilter(scope, req);
  const summary = await installmentService.getInstallmentSummary(scope);
  res.send(summary);
});

module.exports = {
  createInstallmentPlan,
  getInstallmentPlans,
  getInstallmentPlan,
  updateInstallmentPlan,
  deleteInstallmentPlan,
  recordPayment,
  getPaymentsByPlan,
  deletePayment,
  getInstallmentSummary,
};
