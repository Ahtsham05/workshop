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
  const rows = await masterProductService.getImportableMasterProducts({
    organizationId: req.organizationId,
    branchId: req.branchId,
  });
  res.send(rows);
});

const importMasterProducts = catchAsync(async (req, res) => {
  requireBranch(req);
  const products = await masterProductService.importMasterProducts({
    organizationId: req.organizationId,
    branchId: req.branchId,
    createdBy: req.user.id,
    items: req.body.items,
  });
  res.send(products);
});

module.exports = {
  getImportableMasterProducts,
  importMasterProducts,
};
