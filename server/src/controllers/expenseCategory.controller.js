const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const expenseCategoryService = require('../services/expenseCategory.service');
const { resolveWriteBranchId } = require('../utils/branchFilter');

// Categories always belong to one branch. A phone that hasn't picked a branch yet sends
// no x-branch-id — fall back to the user's own branch (as imports and creates do) instead
// of answering with an empty list or failing the write.
const branchOf = async (req) => req.branchId || resolveWriteBranchId(req);

const getCategories = catchAsync(async (req, res) => {
  const organizationId = req.organizationId || req.user?.organizationId;
  const branchId       = await branchOf(req);
  const transactionType = req.query.transactionType;
  const categories = await expenseCategoryService.getCategories(
    organizationId,
    branchId,
    req.user?.id,
    transactionType,
  );
  res.status(httpStatus.OK).send(categories);
});

const createCategory = catchAsync(async (req, res) => {
  const organizationId = req.organizationId || req.user?.organizationId;
  const branchId       = await branchOf(req);
  const category = await expenseCategoryService.createCategory(req.body, organizationId, branchId, req.user?.id);
  res.status(httpStatus.CREATED).send(category);
});

const updateCategory = catchAsync(async (req, res) => {
  const organizationId = req.organizationId || req.user?.organizationId;
  const category = await expenseCategoryService.updateCategory(req.params.id, req.body, organizationId);
  res.status(httpStatus.OK).send(category);
});

const deleteCategory = catchAsync(async (req, res) => {
  const organizationId = req.organizationId || req.user?.organizationId;
  const moveToId = req.query.moveTo || req.body?.moveTo;
  const result = await expenseCategoryService.deleteCategory(req.params.id, organizationId, { moveToId });
  // 200 with what happened when expenses were moved; 204 as before otherwise.
  if (result.moved) return res.status(httpStatus.OK).send(result);
  res.status(httpStatus.NO_CONTENT).send();
});

const getCategoryUsage = catchAsync(async (req, res) => {
  const organizationId = req.organizationId || req.user?.organizationId;
  res.send(await expenseCategoryService.getCategoryUsage(organizationId, await branchOf(req)));
});

const removeUnusedCategories = catchAsync(async (req, res) => {
  const organizationId = req.organizationId || req.user?.organizationId;
  const result = await expenseCategoryService.removeUnusedCategories(organizationId, await branchOf(req), {
    onlyDefaults: req.body?.onlyDefaults !== false,
    ids: req.body?.ids,
  });
  res.send(result);
});

module.exports = { getCategories, createCategory, updateCategory, deleteCategory, getCategoryUsage, removeUnusedCategories };
