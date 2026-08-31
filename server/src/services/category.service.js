const httpStatus = require('http-status');
const { Category } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a category
 * @param {Object} categoryBody
 * @returns {Promise<Category>}
 */
const createCategory = async (categoryBody) => {
  const category = new Category(categoryBody);
  return category.save();
};

/**
 * Query for categories
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @param {string} [options.search] - Search query
 * @param {string} [options.fieldName] - Field name to search
 * @returns {Promise<QueryResult>}
 */
const queryCategories = async (filter, options) => {
  const categories = await Category.paginate(filter, options);
  return categories;
};

/**
 * Get all categories (without pagination)
 * @param {Object} filter - Mongo filter
 * @returns {Promise<Category[]>}
 */
const getAllCategories = async (filter) => {
  const { search, fieldName, ...rest } = filter;
  let query = { ...rest };

  if (search && fieldName) {
    query[fieldName] = { $regex: search, $options: 'i' };
  }

  return Category.find(query).sort({ name: 1 });
};

/**
 * Get category by id
 * @param {ObjectId} id
 * @returns {Promise<Category>}
 */
const getCategoryById = async (id) => {
  return Category.findById(id);
};

/**
 * Update category by id
 * @param {ObjectId} categoryId
 * @param {Object} updateBody
 * @returns {Promise<Category>}
 */
const updateCategoryById = async (categoryId, updateBody) => {
  const category = await getCategoryById(categoryId);
  if (!category) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Category not found');
  }
  Object.assign(category, updateBody);
  await category.save();
  return category;
};

/**
 * Delete category by id
 * @param {ObjectId} categoryId
 * @returns {Promise<Category>}
 */
const deleteCategoryById = async (categoryId) => {
  const category = await getCategoryById(categoryId);
  if (!category) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Category not found');
  }
  await category.deleteOne();
  return category;
};

const BULK_IMPORT_CHUNK_SIZE = 500;

/**
 * Bulk add categories (Excel/CSV import). Categories have no unique index on name, so
 * without an explicit check here a re-import (or a file with the same name twice) would
 * silently double up every row — instead, a name that already exists for this org/branch
 * (case-insensitive) is skipped and reported as a warning rather than duplicated.
 * @param {Array<{name: string, nameUrdu?: string}>} categoriesToAdd
 * @param {Object} branchContext - { organizationId, branchId, createdBy }
 * @returns {Promise<Object>}
 */
const bulkAddCategories = async (categoriesToAdd, branchContext = {}) => {
  const { organizationId, branchId, createdBy } = branchContext;

  const existing = await Category.find({ organizationId, branchId }).select('name').lean();
  const existingNames = new Set(existing.map((c) => c.name.trim().toLowerCase()));

  const errors = [];
  const warnings = [];
  const validDocs = [];
  const seenInBatch = new Set();

  categoriesToAdd.forEach((category, index) => {
    const name = (category.name || '').toString().trim();
    if (!name) {
      errors.push({ index, name: '', error: 'Category name is required' });
      return;
    }

    const key = name.toLowerCase();
    if (existingNames.has(key)) {
      warnings.push({ index, name, message: `Category "${name}" already exists — skipped` });
      return;
    }
    if (seenInBatch.has(key)) {
      warnings.push({ index, name, message: `Duplicate "${name}" in this file — skipped` });
      return;
    }
    seenInBatch.add(key);

    validDocs.push({
      name,
      ...(category.nameUrdu ? { nameUrdu: category.nameUrdu.toString().trim() } : {}),
      organizationId,
      branchId,
      createdBy,
    });
  });

  const insertedCategories = [];
  for (let i = 0; i < validDocs.length; i += BULK_IMPORT_CHUNK_SIZE) {
    const chunk = validDocs.slice(i, i + BULK_IMPORT_CHUNK_SIZE);
    const inserted = await Category.insertMany(chunk, { ordered: false });
    insertedCategories.push(...inserted);
  }

  return {
    success: insertedCategories.length > 0,
    insertedCount: insertedCategories.length,
    categories: insertedCategories,
    errors,
    warnings,
  };
};

/**
 * Delete many categories by id, skipping ones that don't exist rather than failing
 * the whole batch.
 * @param {string[]} ids
 * @returns {Promise<{deleted: Category[], notFoundIds: string[]}>}
 */
const bulkDeleteCategoriesByIds = async (ids) => {
  const categories = await Category.find({ _id: { $in: ids } });
  const foundIds = new Set(categories.map((category) => category._id.toString()));
  const notFoundIds = ids.filter((id) => !foundIds.has(id));

  await Category.deleteMany({ _id: { $in: categories.map((category) => category._id) } });

  return { deleted: categories, notFoundIds };
};

module.exports = {
  createCategory,
  queryCategories,
  getAllCategories,
  getCategoryById,
  updateCategoryById,
  deleteCategoryById,
  bulkAddCategories,
  bulkDeleteCategoriesByIds,
};
