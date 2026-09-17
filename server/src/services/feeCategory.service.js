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

/**
 * Create several categories in one shot (the "Add Multiple Categories"
 * dialog). Uses the same upsert-by-name pattern as seedDefaultCategories so a
 * name that already exists for this org/branch is silently skipped rather
 * than erroring the whole batch out on the schema's unique index.
 */
const createCategoriesBulk = async (organizationId, branchId, createdBy, categories) => {
  const docs = categories.map((c) => ({
    name: c.name.trim(),
    type: c.type,
    description: c.description || undefined,
    color: c.color || undefined,
    organizationId,
    branchId,
    createdBy,
  }));

  const ops = docs.map((d) => ({
    updateOne: {
      filter: { organizationId, branchId, name: d.name },
      update: { $setOnInsert: d },
      upsert: true,
    },
  }));

  const result = await FeeCategory.bulkWrite(ops);
  // bulkWrite's upsertedIds is keyed by the op's index (as a string) — only
  // ops that actually inserted a new document appear here; a name that
  // already existed for this org/branch matched instead and is left out.
  const upsertedIndexes = new Set(Object.keys(result.upsertedIds || {}).map(Number));
  const created = [];
  const skipped = [];
  docs.forEach((d, idx) => {
    (upsertedIndexes.has(idx) ? created : skipped).push(d.name);
  });

  return { created, skipped };
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
    { name: 'Tuition Fee', type: 'INCOME', color: '#22c55e' },
    { name: 'Admission Fee', type: 'INCOME', color: '#16a34a' },
    { name: 'Exam Fee', type: 'INCOME', color: '#0ea5e9' },
    { name: 'Transport Fee', type: 'INCOME', color: '#14b8a6' },
    { name: 'Library Fee', type: 'INCOME', color: '#84cc16' },
    { name: 'Sports Fee', type: 'INCOME', color: '#22d3ee' },
    { name: 'Laboratory Fee', type: 'INCOME', color: '#4ade80' },
    { name: 'Computer Fee', type: 'INCOME', color: '#2dd4bf' },
    { name: 'Paper Fund', type: 'INCOME', color: '#a3e635' },
    { name: 'Miscellaneous Fee', type: 'INCOME', color: '#10b981' },
    { name: 'Teacher Salary', type: 'EXPENSE', color: '#ef4444' },
    { name: 'Staff Salary', type: 'EXPENSE', color: '#f97316' },
    { name: 'Electricity Bill', type: 'EXPENSE', color: '#eab308' },
    { name: 'Water Bill', type: 'EXPENSE', color: '#0ea5e9' },
    { name: 'Rent', type: 'EXPENSE', color: '#a855f7' },
    { name: 'Maintenance', type: 'EXPENSE', color: '#f43f5e' },
    { name: 'Stationery', type: 'EXPENSE', color: '#ec4899' },
    { name: 'Other Expense', type: 'EXPENSE', color: '#6366f1' },
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
  createCategoriesBulk,
  queryCategories,
  getCategoryById,
  getIncomeCategories,
  getExpenseCategories,
  updateCategoryById,
  deleteCategoryById,
  seedDefaultCategories,
};
