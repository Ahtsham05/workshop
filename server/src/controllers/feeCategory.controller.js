const httpStatus = require('http-status');
const pick = require('../utils/pick');
const catchAsync = require('../utils/catchAsync');
const { feeCategoryService } = require('../services');

const createCategory = catchAsync(async (req, res) => {
  const category = await feeCategoryService.createCategory({
    ...req.body,
    organizationId: req.user.organizationId,
    branchId: req.branchId,
    createdBy: req.user._id,
  });
  res.status(httpStatus.CREATED).send(category);
});

const getCategories = catchAsync(async (req, res) => {
  const filter = {
    organizationId: req.user.organizationId,
    branchId: req.branchId,
  };
  const query = pick(req.query, ['type', 'isActive']);
  Object.assign(filter, query);

  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await feeCategoryService.queryCategories(filter, options);
  res.send(result);
});

const getCategory = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const category = await feeCategoryService.getCategoryById(req.params.categoryId, scope);
  if (!category) {
    return res.status(httpStatus.NOT_FOUND).send({ message: 'Category not found' });
  }
  res.send(category);
});

const getIncomeCategories = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const categories = await feeCategoryService.getIncomeCategories(scope);
  res.send(categories);
});

const getExpenseCategories = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const categories = await feeCategoryService.getExpenseCategories(scope);
  res.send(categories);
});

const updateCategory = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const category = await feeCategoryService.updateCategoryById(req.params.categoryId, req.body, scope);
  res.send(category);
});

const deleteCategory = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  await feeCategoryService.deleteCategoryById(req.params.categoryId, scope);
  res.status(httpStatus.NO_CONTENT).send();
});

const seedCategories = catchAsync(async (req, res) => {
  await feeCategoryService.seedDefaultCategories(
    req.user.organizationId,
    req.branchId,
    req.user._id
  );
  res.send({ message: 'Default categories seeded successfully' });
});

module.exports = {
  createCategory,
  getCategories,
  getCategory,
  getIncomeCategories,
  getExpenseCategories,
  updateCategory,
  deleteCategory,
  seedCategories,
};
