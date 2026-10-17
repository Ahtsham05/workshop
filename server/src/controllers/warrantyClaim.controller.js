const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const warrantyClaimService = require('../services/warrantyClaim.service');
const { getBranchContext, resolveWriteBranchId } = require('../utils/branchFilter');

const scopeOf = async (req) => {
  await resolveWriteBranchId(req);
  const { organizationId, branchId } = getBranchContext(req);
  return { organizationId, branchId };
};

const action = (fn, status = httpStatus.OK) =>
  catchAsync(async (req, res) => {
    res.status(status).send(await fn(await scopeOf(req), req));
  });

module.exports = {
  lookupUnit: action((scope, req) => warrantyClaimService.lookupUnit(scope, req.query.serial)),
  getStats: action((scope) => warrantyClaimService.getClaimStats(scope)),
  queryClaims: action((scope, req) => warrantyClaimService.queryClaims(scope, req.query)),
  getClaim: action((scope, req) => warrantyClaimService.getClaim(scope, req.params.claimId)),
  createClaim: action((scope, req) => warrantyClaimService.createClaim(scope, req.body, req.user.id), httpStatus.CREATED),
  sendToSupplier: action((scope, req) => warrantyClaimService.sendToSupplier(scope, req.params.claimId, req.body, req.user.id)),
  giveReplacement: action((scope, req) => warrantyClaimService.giveReplacementFromStock(scope, req.params.claimId, req.body, req.user.id)),
  receiveBack: action((scope, req) => warrantyClaimService.receiveBack(scope, req.params.claimId, req.body, req.user.id)),
  closeClaim: action((scope, req) => warrantyClaimService.closeClaim(scope, req.params.claimId, req.body, req.user.id)),
  cancelClaim: action((scope, req) => warrantyClaimService.cancelClaim(scope, req.params.claimId, req.body, req.user.id)),
};
