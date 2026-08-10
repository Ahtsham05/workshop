const catchAsync = require('../utils/catchAsync');
const { partnerProfitShareLedgerService } = require('../services');
const pick = require('../utils/pick');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const getLedgerEntries = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['partnerId', 'productId', 'transactionType']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await partnerProfitShareLedgerService.queryLedgerEntries(filter, options);
  res.send(result);
});

const getBalance = catchAsync(async (req, res) => {
  const { organizationId } = getBranchContext(req);
  const balance = await partnerProfitShareLedgerService.getCurrentBalance(req.query.partnerId, organizationId);
  res.send({ partnerId: req.query.partnerId, balance });
});

module.exports = {
  getLedgerEntries,
  getBalance,
};
