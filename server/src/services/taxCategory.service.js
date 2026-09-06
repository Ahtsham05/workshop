const httpStatus = require('http-status');
const { TaxCategory, Organization } = require('../models');
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

// taxCalculator.service.js resolves the org-wide fallback category by reading
// Organization.defaultTaxCategoryId directly (a denormalized pointer, kept for a cheap
// single-field read on every tax calculation instead of a TaxCategory query per line) — so
// it must be kept in lockstep with TaxCategory.isDefault here, the only place that flag is
// ever written, or the calculator silently falls back to "no category" (zero tax) even
// though a default category exists.
const syncOrganizationDefaultTaxCategoryId = async (organizationId, taxCategoryId) => {
  await Organization.findByIdAndUpdate(organizationId, { defaultTaxCategoryId: taxCategoryId });
};

const createTaxCategory = async (categoryBody) => {
  if (categoryBody.isDefault) {
    await clearOtherDefaults(categoryBody.organizationId);
  }
  const category = new TaxCategory(categoryBody);
  await category.save();
  if (categoryBody.isDefault) {
    await syncOrganizationDefaultTaxCategoryId(categoryBody.organizationId, category._id);
  }
  return category;
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
  const wasDefault = category.isDefault;
  if (updateBody.isDefault) {
    await clearOtherDefaults(organizationId, category._id);
  }
  Object.assign(category, updateBody);
  await category.save();
  if (updateBody.isDefault) {
    await syncOrganizationDefaultTaxCategoryId(organizationId, category._id);
  } else if (wasDefault && updateBody.isDefault === false) {
    await syncOrganizationDefaultTaxCategoryId(organizationId, null);
  }
  return category;
};

/** Soft delete — sets status to 'inactive' rather than removing the document, since
 * existing products/invoices may still reference this category. */
const softDeleteTaxCategoryById = async (organizationId, id) => {
  const category = await getTaxCategoryById(organizationId, id);
  category.status = 'inactive';
  await category.save();
  if (category.isDefault) {
    // An inactive category can no longer be the org-wide fallback — leaving the pointer in
    // place would make every line with no explicit category silently resolve rates against
    // a deactivated classification instead of the "no category" (zero tax) path.
    await syncOrganizationDefaultTaxCategoryId(organizationId, null);
  }
  return category;
};

module.exports = {
  createTaxCategory,
  queryTaxCategories,
  getTaxCategoryById,
  updateTaxCategoryById,
  softDeleteTaxCategoryById,
};
