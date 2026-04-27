const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const expenseCategoryService = require('../services/expenseCategory.service');

const getCategories = catchAsync(async (req, res) => {
  const organizationId = req.organizationId || req.user?.organizationId;
  const branchId       = req.branchId;
  const categories = await expenseCategoryService.getCategories(organizationId, branchId, req.user?.id);
  res.status(httpStatus.OK).send(categories);
});

const createCategory = catchAsync(async (req, res) => {
  const organizationId = req.organizationId || req.user?.organizationId;
  const branchId       = req.branchId;
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
  await expenseCategoryService.deleteCategory(req.params.id, organizationId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = { getCategories, createCategory, updateCategory, deleteCategory };
