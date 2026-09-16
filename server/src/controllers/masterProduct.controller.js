const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const masterProductService = require('../services/masterProduct.service');

const requireBranch = (req) => {
  if (!req.branchId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Branch ID is required (x-branch-id header)');
  }
};

const getImportableMasterProducts = catchAsync(async (req, res) => {
  requireBranch(req);
  const { search, page, limit } = req.query;
  const rows = await masterProductService.getImportableMasterProducts({
    organizationId: req.organizationId,
    branchId: req.branchId,
    search,
    page,
    limit,
  });
  res.send(rows);
});

const getImportableMasterProductIds = catchAsync(async (req, res) => {
  requireBranch(req);
  const result = await masterProductService.getImportableMasterProductIds({
    organizationId: req.organizationId,
    branchId: req.branchId,
    search: req.query.search,
  });
  res.send(result);
});

const importMasterProducts = catchAsync(async (req, res) => {
  requireBranch(req);
  // Per-product problems come back in `failed` with a 200, not as a 4xx for the whole
  // request — see masterProduct.service.js#importMasterProducts.
  const result = await masterProductService.importMasterProducts({
    organizationId: req.organizationId,
    branchId: req.branchId,
    createdBy: req.user.id,
    items: req.body.items,
    activate: req.body.activate,
  });
  res.send(result);
});

module.exports = {
  getImportableMasterProducts,
  getImportableMasterProductIds,
  importMasterProducts,
};
