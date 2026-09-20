const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const priceCheckerService = require('../services/priceChecker.service');
const pick = require('../utils/pick');
const { getBranchContext, resolveWriteBranchId } = require('../utils/branchFilter');

const createSource = catchAsync(async (req, res) => {
  await resolveWriteBranchId(req);
  const source = await priceCheckerService.createSource({ ...req.body, ...getBranchContext(req) });
  res.status(httpStatus.CREATED).send(source);
});

const getSources = catchAsync(async (req, res) => {
  const filter = { organizationId: req.organizationId, ...pick(req.query, ['status']) };
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'fieldName']);
  const result = await priceCheckerService.querySources(filter, options);
  res.send(result);
});

const getAllSources = catchAsync(async (req, res) => {
  const filter = { organizationId: req.organizationId, ...pick(req.query, ['status']) };
  const result = await priceCheckerService.getAllSources(filter);
  res.send(result);
});

const getSource = catchAsync(async (req, res) => {
  const source = await priceCheckerService.getSourceById(req.params.sourceId);
  res.send(source);
});

const updateSource = catchAsync(async (req, res) => {
  const source = await priceCheckerService.updateSourceById(req.params.sourceId, {
    ...req.body,
    updatedBy: req.user ? req.user.id : undefined,
  });
  res.send(source);
});

const deleteSource = catchAsync(async (req, res) => {
  await priceCheckerService.softDeleteSourceById(req.params.sourceId);
  res.status(httpStatus.NO_CONTENT).send();
});

// Runs one live scrape against an unsaved selector config — lets the Manage Competitor
// Sites dialog verify a site's CSS selectors actually work before the source is saved.
const testSource = catchAsync(async (req, res) => {
  const { query, ...sourceConfig } = req.body;
  const result = await priceCheckerService.testSource(sourceConfig, query);
  res.send(result);
});

// Given just a link to one real product page, works out CSS selectors on its own so an
// admin never has to write CSS by hand — see priceChecker.service.js#autoDetectSelectors.
const autoDetect = catchAsync(async (req, res) => {
  const result = await priceCheckerService.autoDetectSelectors(req.body.url);
  res.send(result);
});

const checkPrice = catchAsync(async (req, res) => {
  const result = await priceCheckerService.checkPrice({
    organizationId: req.organizationId,
    branchId: req.branchId,
    query: req.body.query,
    forceRefresh: req.body.forceRefresh,
    sourceId: req.body.sourceId,
  });
  res.send(result);
});

module.exports = {
  createSource,
  getSources,
  getAllSources,
  getSource,
  updateSource,
  deleteSource,
  testSource,
  autoDetect,
  checkPrice,
};
