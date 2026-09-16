const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const { productAnalyticsService } = require('../services');

const scopeOf = (req) => ({ organizationId: req.organizationId, branchId: req.branchId });

const RANKING_QUERY_FIELDS = [
  'startDate',
  'endDate',
  'sortBy',
  'sortOrder',
  'page',
  'limit',
  'search',
  'categoryId',
  'brandId',
  'abcClass',
  'movement',
  'status',
  'stock',
];

const getOverview = catchAsync(async (req, res) => {
  const result = await productAnalyticsService.getAnalyticsOverview({
    ...scopeOf(req),
    query: pick(req.query, ['startDate', 'endDate']),
  });
  res.send(result);
});

const getRankings = catchAsync(async (req, res) => {
  const query = pick(req.query, RANKING_QUERY_FIELDS);
  const result =
    req.query.export === 'true' || req.query.export === true
      ? await productAnalyticsService.getProductRankingsExport({ ...scopeOf(req), query })
      : await productAnalyticsService.getProductRankings({ ...scopeOf(req), query });
  res.send(result);
});

const getMetrics = catchAsync(async (req, res) => {
  const productIds = String(req.query.ids || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (productIds.length > 500) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Too many product ids (max 500)');
  }
  const result = await productAnalyticsService.getMetricsForProducts({
    ...scopeOf(req),
    productIds,
    query: pick(req.query, ['startDate', 'endDate']),
  });
  res.send(result);
});

const getProductAnalytics = catchAsync(async (req, res) => {
  const result = await productAnalyticsService.getProductAnalytics({
    ...scopeOf(req),
    productId: req.params.productId,
    query: pick(req.query, ['startDate', 'endDate']),
  });
  res.send(result);
});

const getProductActivity = catchAsync(async (req, res) => {
  const result = await productAnalyticsService.getProductActivity({
    ...scopeOf(req),
    productId: req.params.productId,
    query: pick(req.query, ['startDate', 'endDate', 'type', 'page', 'limit']),
  });
  res.send(result);
});

module.exports = {
  getOverview,
  getRankings,
  getMetrics,
  getProductAnalytics,
  getProductActivity,
};
