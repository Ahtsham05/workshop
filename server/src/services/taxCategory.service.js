const httpStatus = require('http-status');
const { TaxCategory } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * At most one TaxCategory can be isDefault: true per organization — new products/invoice
 * lines with no explicit category fall back to it (see taxCalculator.service.js). Whenever
 * a category is created/updated with isDefault: true, every other category in the same
 * org is unset first, in the same call, so the invariant never has a window where it's
 * violated.
 */
const clearOtherDefaults = async (organizationId, exceptId = null) => {
  const filter = { organizationId, isDefault: true };
  if (exceptId) filter._id = { $ne: exceptId };
  await TaxCategory.updateMany(filter, { isDefault: false });
};

const createTaxCategory = async (categoryBody) => {
  if (categoryBody.isDefault) {
    await clearOtherDefaults(categoryBody.organizationId);
  }
  const category = new TaxCategory(categoryBody);
  return category.save();
};

/**
 * @param {Object} filter - Mongo filter (organizationId required by caller)
 * @param {Object} options - sortBy/limit/page/search/fieldName
 */
const queryTaxCategories = async (filter, options) => {
  return TaxCategory.paginate(filter, options);
};

const getTaxCategoryById = async (organizationId, id) => {
  const category = await TaxCategory.findOne({ _id: id, organizationId });
  if (!category) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tax category not found');
  }
  return category;
};

const updateTaxCategoryById = async (organizationId, id, updateBody) => {
  const category = await getTaxCategoryById(organizationId, id);
  if (updateBody.isDefault) {
    await clearOtherDefaults(organizationId, category._id);
  }
  Object.assign(category, updateBody);
  await category.save();
  return category;
};

/** Soft delete — sets status to 'inactive' rather than removing the document, since
 * existing products/invoices may still reference this category. */
const softDeleteTaxCategoryById = async (organizationId, id) => {
  const category = await getTaxCategoryById(organizationId, id);
  category.status = 'inactive';
  await category.save();
  return category;
};

module.exports = {
  createTaxCategory,
  queryTaxCategories,
  getTaxCategoryById,
  updateTaxCategoryById,
  softDeleteTaxCategoryById,
};
