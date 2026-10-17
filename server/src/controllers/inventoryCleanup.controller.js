const catchAsync = require('../utils/catchAsync');
const inventoryCleanupService = require('../services/inventoryCleanup.service');
const { getBranchContext, resolveWriteBranchId } = require('../utils/branchFilter');

const scopeOf = async (req) => {
  await resolveWriteBranchId(req);
  const { organizationId, branchId } = getBranchContext(req);
  return { organizationId, branchId };
};

/** Category-wise clean-up buckets for the Products page's "Clean up" view. */
const getCleanupOverview = catchAsync(async (req, res) => {
  res.send(
    await inventoryCleanupService.getCleanupOverview({ ...(await scopeOf(req)), idleDays: req.query.idleDays, fresh: !!req.query.nonce })
  );
});

/** The products in one clean-up bucket (optionally one category), paged. */
const getCleanupItems = catchAsync(async (req, res) => {
  const { nonce, ...query } = req.query;
  res.send(await inventoryCleanupService.getCleanupItems({ ...(await scopeOf(req)), ...query, fresh: !!nonce }));
});

module.exports = { getCleanupOverview, getCleanupItems };
