const catchAsync = require('../utils/catchAsync');
const { purchaseSuggestionsService, supplierScoringService, salesInsightsService } = require('../services');
const { getBranchContext } = require('../utils/branchFilter');

const getPurchaseSuggestions = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  const horizonDays = req.query.horizonDays ? Number(req.query.horizonDays) : undefined;
  const result = await purchaseSuggestionsService.getPurchaseSuggestions({ organizationId, branchId, horizonDays });
  res.send(result);
});

const getInventoryInsights = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  const result = await salesInsightsService.getInsightsByCategory({ organizationId, branchId, category: 'inventory' });
  res.send(result);
});

const getSupplierRecommendations = catchAsync(async (req, res) => {
  const { organizationId } = getBranchContext(req);
  const result = await supplierScoringService.scoreSuppliersForProduct({ organizationId, productId: req.query.productId });
  res.send(result);
});

const getStockoutPredictions = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  const result = await purchaseSuggestionsService.getStockoutPredictions({ organizationId, branchId });
  res.send(result);
});

const getDeadStock = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  const result = await purchaseSuggestionsService.getDeadStock({ organizationId, branchId });
  res.send(result);
});

const getDemandTrends = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  const result = await purchaseSuggestionsService.getDemandTrends({ organizationId, branchId });
  res.send(result);
});

const getTransferSuggestions = catchAsync(async (req, res) => {
  const { organizationId } = getBranchContext(req);
  const result = await purchaseSuggestionsService.getTransferSuggestions({ organizationId });
  res.send(result);
});

/** Manually re-run the engine for the caller's current branch — mirrors insight.controller's runInsightsNow. */
const runNow = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  await purchaseSuggestionsService.recordStockoutSnapshots({ organizationId, branchId });
  const created = await purchaseSuggestionsService.runPurchaseSuggestionsForBranch({ organizationId, branchId });
  res.status(201).send({ generated: created.length, insights: created });
});

module.exports = {
  getPurchaseSuggestions,
  getInventoryInsights,
  getSupplierRecommendations,
  getStockoutPredictions,
  getDeadStock,
  getDemandTrends,
  getTransferSuggestions,
  runNow,
};
