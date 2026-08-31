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

const BULK_IMPORT_CHUNK_SIZE = 500;

/**
 * Bulk add brands (Excel/CSV import). Brands are org-scoped (see the note above), so
 * duplicate checks here — both by name and by the slug that would be derived from it —
 * are against every brand in the organization, matching createBrand's own check. A row
 * that collides with an existing brand, or with another row earlier in the same file, is
 * skipped and reported as a warning rather than duplicated or left to fail against the
 * (organizationId, slug) unique index.
 * @param {Array<Object>} brandsToAdd
 * @param {Object} branchContext - { organizationId, branchId, createdBy }
 * @returns {Promise<Object>}
 */
const bulkAddBrands = async (brandsToAdd, branchContext = {}) => {
  const { organizationId, branchId, createdBy } = branchContext;

  const existing = await Brand.find({ organizationId }).select('name slug').lean();
  const existingNames = new Set(existing.map((b) => b.name.trim().toLowerCase()));
  const existingSlugs = new Set(existing.map((b) => b.slug).filter(Boolean));

  const errors = [];
  const warnings = [];
  const validDocs = [];
  const validMeta = [];
  const seenNames = new Set();
  const seenSlugs = new Set();

  brandsToAdd.forEach((brand, index) => {
    const name = (brand.name || '').toString().trim();
    if (!name) {
      errors.push({ index, name: '', error: 'Brand name is required' });
      return;
    }

    const nameKey = name.toLowerCase();
    const slug = Brand.slugify(name);

    if (existingNames.has(nameKey) || existingSlugs.has(slug)) {
      warnings.push({ index, name, message: `Brand "${name}" already exists — skipped` });
      return;
    }
    if (seenNames.has(nameKey) || seenSlugs.has(slug)) {
      warnings.push({ index, name, message: `Duplicate "${name}" in this file — skipped` });
      return;
    }
    seenNames.add(nameKey);
    seenSlugs.add(slug);

    validDocs.push({
      name,
      slug,
      ...(brand.description ? { description: brand.description.toString().trim() } : {}),
      ...(brand.website ? { website: brand.website.toString().trim() } : {}),
      ...(brand.contactPerson ? { contactPerson: brand.contactPerson.toString().trim() } : {}),
      ...(brand.email ? { email: brand.email.toString().trim() } : {}),
      ...(brand.phone ? { phone: brand.phone.toString().trim() } : {}),
      ...(brand.country ? { country: brand.country.toString().trim() } : {}),
      organizationId,
      branchId,
      createdBy,
    });
    validMeta.push({ index, name });
  });

  const insertedBrands = [];
  for (let i = 0; i < validDocs.length; i += BULK_IMPORT_CHUNK_SIZE) {
    const chunk = validDocs.slice(i, i + BULK_IMPORT_CHUNK_SIZE);
    const chunkMeta = validMeta.slice(i, i + BULK_IMPORT_CHUNK_SIZE);
    try {
      const inserted = await Brand.insertMany(chunk, { ordered: false });
      insertedBrands.push(...inserted);
    } catch (error) {
      // A slug collision that slipped past the pre-check above (e.g. a concurrent
      // import) still lands here — everything else was already filtered out before
      // reaching insertMany().
      if (!error.writeErrors) throw error;
      insertedBrands.push(...(error.insertedDocs || []));
      error.writeErrors.forEach((writeError) => {
        const raw = writeError.err || writeError;
        const meta = chunkMeta[writeError.index ?? raw.index];
        errors.push({
          index: meta?.index,
          name: meta?.name,
          error: raw.code === 11000
            ? `Brand "${meta?.name}" already exists — already used by another brand`
            : (raw.errmsg || 'Failed to import this brand'),
        });
      });
    }
  }

  return {
    success: insertedBrands.length > 0,
    insertedCount: insertedBrands.length,
    brands: insertedBrands,
    errors,
    warnings,
  };
};

/** Soft delete — sets status to 'inactive' rather than removing the document, since
 * existing products may still reference this brand. */
const softDeleteBrandById = async (brandId) => {
  const brand = await getBrandById(brandId);
  brand.status = 'inactive';
  await brand.save();
  return brand;
};

/**
 * Bulk soft delete — same 'inactive' semantics as softDeleteBrandById, just for many
 * brands at once. Ids that don't exist are skipped and reported rather than failing the
 * whole batch, matching bulkDeleteCategoriesByIds/bulkDeleteProductsByIds.
 * @param {string[]} ids
 * @returns {Promise<{deleted: Brand[], notFoundIds: string[]}>}
 */
const bulkSoftDeleteBrandsByIds = async (ids) => {
  const brands = await Brand.find({ _id: { $in: ids } });
  const foundIds = new Set(brands.map((brand) => brand._id.toString()));
  const notFoundIds = ids.filter((id) => !foundIds.has(id));

  await Brand.updateMany({ _id: { $in: brands.map((brand) => brand._id) } }, { status: 'inactive' });

  return { deleted: brands, notFoundIds };
};

module.exports = {
  createBrand,
  queryBrands,
  getAllBrands,
  getBrandById,
  updateBrandById,
  bulkAddBrands,
  softDeleteBrandById,
  bulkSoftDeleteBrandsByIds,
};
