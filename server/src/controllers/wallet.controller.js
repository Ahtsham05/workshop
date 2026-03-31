const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const { walletService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const upsertWallet = catchAsync(async (req, res) => {
  const wallet = await walletService.createOrUpdateWallet({
    ...getBranchContext(req),
    ...req.body,
    userId: req.user.id,
  });
  res.status(httpStatus.CREATED).send(wallet);
});

const getWallets = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['type']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await walletService.queryWallets(filter, options);
  res.send(result);
});

module.exports = {
  upsertWallet,
  getWallets,
};
