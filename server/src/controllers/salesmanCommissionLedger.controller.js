const catchAsync = require('../utils/catchAsync');
const { salesmanCommissionLedgerService } = require('../services');
const pick = require('../utils/pick');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const getLedgerEntries = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['salesmanUserId', 'transactionType']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await salesmanCommissionLedgerService.queryLedgerEntries(filter, options);
  res.send(result);
});

const getBalance = catchAsync(async (req, res) => {
  const { organizationId } = getBranchContext(req);
  const balance = await salesmanCommissionLedgerService.getCurrentBalance(req.query.salesmanUserId, organizationId);
  res.send({ salesmanUserId: req.query.salesmanUserId, balance });
});

module.exports = {
  getLedgerEntries,
  getBalance,
};
