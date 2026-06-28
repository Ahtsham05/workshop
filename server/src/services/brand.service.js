const httpStatus = require('http-status');
const { Brand } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Brands are scoped to the organization (not the branch) — unlike Category/Supplier,
 * a brand like "Samsung" is meant to be reused across every branch of the same
 * business, matching the multi-tenant spec ("Org A: Samsung, Org B: Samsung — both
 * allowed", with no mention of per-branch isolation). branchId is still recorded on
 * each Brand document (which branch created it) but list/lookup queries below filter
 * by organizationId only.
 */
const createBrand = async (brandBody) => {
  const exists = await Brand.findOne({ organizationId: brandBody.organizationId, name: brandBody.name });
  if (exists) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Brand "${brandBody.name}" already exists`);
  }
  const brand = new Brand(brandBody);
  return brand.save();
};

/**
 * @param {Object} filter - Mongo filter (organizationId required by caller)
 * @param {Object} options - sortBy/limit/page/search/fieldName/status
 */
const queryBrands = async (filter, options) => {
  return Brand.paginate(filter, options);
};

const getAllBrands = async (filter) => {
  const query = { organizationId: filter.organizationId, status: filter.status || 'active' };
  if (filter.search && filter.fieldName) {
    query[filter.fieldName] = { $regex: filter.search, $options: 'i' };
  }
  return Brand.find(query).sort({ name: 1 });
};

const getBrandById = async (id) => {
  const brand = await Brand.findById(id);
  if (!brand) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Brand not found');
  }
  return brand;
};

const updateBrandById = async (brandId, updateBody) => {
  const brand = await getBrandById(brandId);
  if (updateBody.name && updateBody.name !== brand.name) {
    const exists = await Brand.findOne({
      organizationId: brand.organizationId,
      name: updateBody.name,
      _id: { $ne: brand._id },
    });
    if (exists) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Brand "${updateBody.name}" already exists`);
    }
  }
  Object.assign(brand, updateBody);
  await brand.save();
  return brand;
};

/** Soft delete — sets status to 'inactive' rather than removing the document, since
 * existing products may still reference this brand. */
const softDeleteBrandById = async (brandId) => {
  const brand = await getBrandById(brandId);
  brand.status = 'inactive';
  await brand.save();
  return brand;
};

module.exports = {
  createBrand,
  queryBrands,
  getAllBrands,
  getBrandById,
  updateBrandById,
  softDeleteBrandById,
};
