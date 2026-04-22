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

const updateCashWithdrawal = catchAsync(async (req, res) => {
  const withdrawal = await cashWithdrawalService.updateCashWithdrawal(req.params.withdrawalId, req.body);
  res.send(withdrawal);
});

const createCashWithdrawalsBatch = catchAsync(async (req, res) => {
  const result = await cashWithdrawalService.createCashWithdrawalsBatch({
    ...req.body,
    ...getBranchContext(req),
  });
  res.status(httpStatus.CREATED).send(result);
});

const deleteCashWithdrawal = catchAsync(async (req, res) => {
  await cashWithdrawalService.deleteCashWithdrawal(req.params.withdrawalId);
  res.status(httpStatus.NO_CONTENT).send();
});

const deleteCashWithdrawalsBatch = catchAsync(async (req, res) => {
  const result = await cashWithdrawalService.deleteCashWithdrawalsBatch(req.body.ids);
  res.send(result);
});

module.exports = {
  createCashWithdrawal,
  createCashWithdrawalsBatch,
  getCashWithdrawals,
  updateCashWithdrawal,
  deleteCashWithdrawal,
  deleteCashWithdrawalsBatch,
};
