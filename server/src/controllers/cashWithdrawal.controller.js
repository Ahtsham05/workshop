const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const { cashWithdrawalService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const createCashWithdrawal = catchAsync(async (req, res) => {
  const withdrawal = await cashWithdrawalService.createCashWithdrawal({
    ...req.body,
    ...getBranchContext(req),
  });
  res.status(httpStatus.CREATED).send(withdrawal);
});

const getCashWithdrawals = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['walletType', 'customerName']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'startDate', 'endDate']);
  const result = await cashWithdrawalService.queryCashWithdrawals(filter, options);
  res.send(result);
});

module.exports = {
  createCashWithdrawal,
  getCashWithdrawals,
};
