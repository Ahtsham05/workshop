const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const { cashBookService } = require('../services');
const { applyBranchFilter } = require('../utils/branchFilter');

const getCashBookEntries = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['type', 'source', 'paymentMethod']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'startDate', 'endDate']);
  const result = await cashBookService.queryEntries(filter, options);
  res.send(result);
});

const getCashBookSummary = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['startDate', 'endDate']);
  applyBranchFilter(filter, req);
  const result = await cashBookService.getSummary(filter);
  res.send(result);
});

module.exports = {
  getCashBookEntries,
  getCashBookSummary,
};
