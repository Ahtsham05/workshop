const httpStatus = require('http-status');
const { SubCategory, Category } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a sub-category
 * @param {Object} subCategoryBody
 * @returns {Promise<SubCategory>}
 */
const createSubCategory = async (subCategoryBody) => {
  const subCategory = new SubCategory(subCategoryBody);
  return subCategory.save();
};

/**
 * Create many sub-categories under a single parent category in one go.
 * @param {string} categoryId
 * @param {Array<{name: string, nameUrdu?: string}>} items
 * @param {Object} branchContext - { organizationId, branchId, createdBy }
 * @returns {Promise<SubCategory[]>}
 */
const bulkCreateSubCategories = async (categoryId, items, branchContext = {}) => {
  const category = await Category.findOne({
    _id: categoryId,
    ...(branchContext.organizationId ? { organizationId: branchContext.organizationId } : {}),
  });
  if (!category) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Category not found');
  }

  const docs = items.map((item) => ({
    name: item.name,
    nameUrdu: item.nameUrdu || '',
    category: categoryId,
    organizationId: branchContext.organizationId,
    branchId: branchContext.branchId,
    createdBy: branchContext.createdBy,
  }));

  return SubCategory.insertMany(docs, { ordered: true });
};

/**
 * Query for sub-categories
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const querySubCategories = async (filter, options) => {
  const subCategories = await SubCategory.paginate(filter, { ...options, populate: 'category' });
  return subCategories;
};

/**
 * Get all sub-categories (without pagination)
 * @param {Object} filter - Mongo filter
 * @returns {Promise<SubCategory[]>}
 */
const getAllSubCategories = async (filter) => {
  const { search, fieldName, ...rest } = filter;
  let query = { ...rest };

  if (search && fieldName) {
    query[fieldName] = { $regex: search, $options: 'i' };
  }

  return SubCategory.find(query).populate('category').sort({ name: 1 });
};

/**
 * Get sub-category by id
 * @param {ObjectId} id
 * @returns {Promise<SubCategory>}
 */
const getSubCategoryById = async (id) => {
  return SubCategory.findById(id).populate('category');
};

/**
 * Update sub-category by id
 * @param {ObjectId} subCategoryId
 * @param {Object} updateBody
 * @returns {Promise<SubCategory>}
 */
const updateSubCategoryById = async (subCategoryId, updateBody) => {
  const subCategory = await SubCategory.findById(subCategoryId);
  if (!subCategory) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Sub-category not found');
  }
  Object.assign(subCategory, updateBody);
  await subCategory.save();
  return subCategory.populate('category');
};

/**
 * Delete sub-category by id
 * @param {ObjectId} subCategoryId
 * @returns {Promise<SubCategory>}
 */
const deleteSubCategoryById = async (subCategoryId) => {
  const subCategory = await SubCategory.findById(subCategoryId);
  if (!subCategory) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Sub-category not found');
  }
  await subCategory.deleteOne();
  return subCategory;
};

const BULK_IMPORT_CHUNK_SIZE = 500;

/**
 * Bulk import sub-categories from a spreadsheet. Unlike bulkCreateSubCategories above
 * (the tag-field UI's "add several names under one already-selected category" flow),
 * every row here carries its own free-text parent category name — resolved
 * case-insensitively against existing categories and auto-created when it doesn't exist
 * yet, the same behavior product import already uses for category/sub-category names.
 * A (category, name) pair that already exists is skipped and reported as a warning
 * rather than duplicated, same reasoning as bulkAddCategories.
 * @param {Array<{name: string, nameUrdu?: string, category: string}>} items
 * @param {Object} branchContext - { organizationId, branchId, createdBy }
 * @returns {Promise<Object>}
 */
const bulkImportSubCategories = async (items, branchContext = {}) => {
  const { organizationId, branchId, createdBy } = branchContext;

  const categoryNames = [...new Set(items.map((item) => (item.category || '').toString().trim()).filter(Boolean))];

  const existingCategories = await Category.find({ organizationId, branchId }).select('name').lean();
  const categoryByLower = new Map(existingCategories.map((c) => [c.name.trim().toLowerCase(), c]));

  const createdCategories = [];
  const missingCategoryNames = categoryNames.filter((name) => !categoryByLower.has(name.toLowerCase()));
  if (missingCategoryNames.length) {
    const docs = missingCategoryNames.map((name) => ({ name, organizationId, branchId, createdBy }));
    const inserted = await Category.insertMany(docs, { ordered: false });
    inserted.forEach((c) => {
      categoryByLower.set(c.name.trim().toLowerCase(), c);
      createdCategories.push(c.name);
    });
  }

  const existingSubCategories = await SubCategory.find({ organizationId, branchId }).select('name category').lean();
  const subByKey = new Map(existingSubCategories.map((s) => [`${s.category}::${s.name.trim().toLowerCase()}`, s]));

  const errors = [];
  const warnings = [];
  const validDocs = [];
  const seenInBatch = new Set();

  items.forEach((item, index) => {
    const name = (item.name || '').toString().trim();
    const categoryName = (item.category || '').toString().trim();

    if (!name) {
      errors.push({ index, name: '', error: 'Sub-category name is required' });
      return;
    }
    if (!categoryName) {
      errors.push({ index, name, error: 'Parent category is required' });
      return;
    }

    const category = categoryByLower.get(categoryName.toLowerCase());
    if (!category) {
      // Shouldn't happen — every referenced name was just resolved/created above.
      errors.push({ index, name, error: `Category "${categoryName}" could not be resolved` });
      return;
    }

    const key = `${category._id}::${name.toLowerCase()}`;
    if (subByKey.has(key)) {
      warnings.push({ index, name, message: `Sub-category "${name}" already exists under "${category.name}" — skipped` });
      return;
    }
    if (seenInBatch.has(key)) {
      warnings.push({ index, name, message: `Duplicate "${name}" under "${category.name}" in this file — skipped` });
      return;
    }
    seenInBatch.add(key);

    validDocs.push({
      name,
      ...(item.nameUrdu ? { nameUrdu: item.nameUrdu.toString().trim() } : {}),
      category: category._id,
      organizationId,
      branchId,
      createdBy,
    });
  });

  const insertedSubCategories = [];
  for (let i = 0; i < validDocs.length; i += BULK_IMPORT_CHUNK_SIZE) {
    const chunk = validDocs.slice(i, i + BULK_IMPORT_CHUNK_SIZE);
    const inserted = await SubCategory.insertMany(chunk, { ordered: false });
    insertedSubCategories.push(...inserted);
  }

  return {
    success: insertedSubCategories.length > 0,
    insertedCount: insertedSubCategories.length,
    subCategories: insertedSubCategories,
    errors,
    warnings,
    createdCategories,
  };
};

/**
 * Delete many sub-categories by id, skipping ones that don't exist rather than failing
 * the whole batch.
 * @param {string[]} ids
 * @returns {Promise<{deleted: SubCategory[], notFoundIds: string[]}>}
 */
const bulkDeleteSubCategoriesByIds = async (ids) => {
  const subCategories = await SubCategory.find({ _id: { $in: ids } });
  const foundIds = new Set(subCategories.map((subCategory) => subCategory._id.toString()));
  const notFoundIds = ids.filter((id) => !foundIds.has(id));

  await SubCategory.deleteMany({ _id: { $in: subCategories.map((subCategory) => subCategory._id) } });

  return { deleted: subCategories, notFoundIds };
};

module.exports = {
  createSubCategory,
  bulkCreateSubCategories,
  querySubCategories,
  getAllSubCategories,
  getSubCategoryById,
  updateSubCategoryById,
  deleteSubCategoryById,
  bulkImportSubCategories,
  bulkDeleteSubCategoriesByIds,
};
