const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const productBranchSyncService = require('../services/productBranchSync.service');
const { auditLogService } = require('../services');

const requireBranch = (req) => {
  if (!req.branchId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Branch ID is required (x-branch-id header)');
  }
};

const previewBranchSync = catchAsync(async (req, res) => {
  requireBranch(req);
  const result = await productBranchSyncService.previewBranchSync({
    userId: req.user.id,
    organizationId: req.organizationId,
    branchId: req.branchId,
    productIds: req.body.productIds,
    scope: req.body.scope,
  });
  res.send(result);
});

const syncProductsToBranches = catchAsync(async (req, res) => {
  requireBranch(req);
  // Per-product and per-branch problems come back inside the result with a 200 — only a
  // request that should never have been made (a branch the caller may not use) is a 4xx.
  const result = await productBranchSyncService.syncProductsToBranches({
    userId: req.user.id,
    organizationId: req.organizationId,
    branchId: req.branchId,
    productIds: req.body.productIds,
    branchIds: req.body.branchIds,
  });

  const created = result.branches.reduce((sum, branch) => sum + branch.syncedCount, 0);
  if (created > 0) {
    // One entry for the whole action, not one per product per branch — a morning's import
    // synced to five branches would otherwise write thousands of audit rows.
    await auditLogService.recordAuditLog({
      req,
      action: 'create',
      module: 'Product',
      entityName: `Synced ${created} product copy(ies) to ${result.branches.filter((b) => b.syncedCount > 0).map((b) => b.branchName).join(', ')}`,
      metadata: {
        type: 'branch_sync',
        productCount: req.body.productIds.length,
        branches: result.branches.map(({ branchId, branchName, syncedCount, alreadyPresentCount, failedCount }) => ({
          branchId,
          branchName,
          syncedCount,
          alreadyPresentCount,
          failedCount,
        })),
      },
    });
  }
  res.send(result);
});

module.exports = {
  previewBranchSync,
  syncProductsToBranches,
};
