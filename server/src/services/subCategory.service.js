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

module.exports = {
  createSubCategory,
  bulkCreateSubCategories,
  querySubCategories,
  getAllSubCategories,
  getSubCategoryById,
  updateSubCategoryById,
  deleteSubCategoryById,
};
