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
  res.send({
    ...result,
    results: result.results.map((doc) => (typeof doc.toJSON === 'function' ? doc.toJSON() : doc)),
  });
});

const deleteWallet = catchAsync(async (req, res) => {
  await walletService.deleteWallet({
    walletId: req.params.walletId,
    ...getBranchContext(req),
  });
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  upsertWallet,
  getWallets,
  deleteWallet,
};
