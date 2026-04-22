const httpStatus = require('http-status');
const { FeeCategory } = require('../models');
const ApiError = require('../utils/ApiError');

const getTenantFilter = (scope = {}) => {
  const filter = {};
  if (scope.organizationId) filter.organizationId = scope.organizationId;
  if (scope.branchId) filter.branchId = scope.branchId;
  return filter;
};

const createCategory = async (body) => {
  return FeeCategory.create(body);
};

const queryCategories = async (filter, options) => {
  return FeeCategory.paginate(filter, options);
};

const getCategoryById = async (id, scope = {}) => {
  return FeeCategory.findOne({ _id: id, ...getTenantFilter(scope) });
};

const getIncomeCategories = async (scope = {}) => {
  return FeeCategory.find({ ...getTenantFilter(scope), type: 'INCOME', isActive: true }).lean();
};

const getExpenseCategories = async (scope = {}) => {
  return FeeCategory.find({ ...getTenantFilter(scope), type: 'EXPENSE', isActive: true }).lean();
};

const updateCategoryById = async (id, updateBody, scope = {}) => {
  const doc = await getCategoryById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Category not found');
  Object.assign(doc, updateBody);
  await doc.save();
  return doc;
};

const deleteCategoryById = async (id, scope = {}) => {
  const doc = await getCategoryById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Category not found');
  await doc.deleteOne();
  return doc;
};

/**
 * Seed default fee categories for a new organization/branch
 */
const seedDefaultCategories = async (organizationId, branchId, createdBy) => {
  const defaults = [
    { name: 'Tuition Fee', type: 'INCOME' },
    { name: 'Admission Fee', type: 'INCOME' },
    { name: 'Exam Fee', type: 'INCOME' },
    { name: 'Transport Fee', type: 'INCOME' },
    { name: 'Library Fee', type: 'INCOME' },
    { name: 'Sports Fee', type: 'INCOME' },
    { name: 'Laboratory Fee', type: 'INCOME' },
    { name: 'Computer Fee', type: 'INCOME' },
    { name: 'Paper Fund', type: 'INCOME' },
    { name: 'Miscellaneous Fee', type: 'INCOME' },
    { name: 'Teacher Salary', type: 'EXPENSE' },
    { name: 'Staff Salary', type: 'EXPENSE' },
    { name: 'Electricity Bill', type: 'EXPENSE' },
    { name: 'Water Bill', type: 'EXPENSE' },
    { name: 'Rent', type: 'EXPENSE' },
    { name: 'Maintenance', type: 'EXPENSE' },
    { name: 'Stationery', type: 'EXPENSE' },
    { name: 'Other Expense', type: 'EXPENSE' },
  ];

  const docs = defaults.map((d) => ({
    ...d,
    organizationId,
    branchId,
    createdBy,
  }));

  // Use upsert to avoid duplicates on re-seed
  const ops = docs.map((d) => ({
    updateOne: {
      filter: { organizationId, branchId, name: d.name },
      update: { $setOnInsert: d },
      upsert: true,
    },
  }));

  return FeeCategory.bulkWrite(ops);
};

module.exports = {
  createCategory,
  queryCategories,
  getCategoryById,
  getIncomeCategories,
  getExpenseCategories,
  updateCategoryById,
  deleteCategoryById,
  seedDefaultCategories,
};
