const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const { salesInsightsService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const getInsights = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['category', 'type', 'priority']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  options.sortBy = options.sortBy || 'generatedAt:desc';
  const result = await salesInsightsService.queryInsights(filter, options);
  res.send(result);
});

const getTodayInsights = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  const result = await salesInsightsService.getTodayInsights({ organizationId, branchId });
  res.send(result);
});

const getAlerts = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  const result = await salesInsightsService.getInsightsByCategory({ organizationId, branchId, category: 'alert' });
  res.send(result);
});

const getSalesInsights = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  const result = await salesInsightsService.getInsightsByCategory({ organizationId, branchId, category: 'sales' });
  res.send(result);
});

const getInventoryInsights = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  const result = await salesInsightsService.getInsightsByCategory({ organizationId, branchId, category: 'inventory' });
  res.send(result);
});

const getProfitInsights = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  const result = await salesInsightsService.getInsightsByCategory({ organizationId, branchId, category: 'profit' });
  res.send(result);
});

const getCustomerInsights = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  const result = await salesInsightsService.getInsightsByCategory({ organizationId, branchId, category: 'customer' });
  res.send(result);
});

/** Manually re-run the engine for the caller's current branch — handy for a "Refresh insights" UI action. */
const runInsightsNow = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  const created = await salesInsightsService.runInsightsForBranch({ organizationId, branchId });
  res.status(httpStatus.CREATED).send({ generated: created.length, insights: created });
});

const updateInsight = catchAsync(async (req, res) => {
  const insight = await salesInsightsService.updateInsightById(req.params.insightId, req.body);
  res.send(insight);
});

module.exports = {
  getInsights,
  getTodayInsights,
  getAlerts,
  getSalesInsights,
  getInventoryInsights,
  getProfitInsights,
  getCustomerInsights,
  runInsightsNow,
  updateInsight,
};
