const mongoose = require('mongoose');
const { Supplier } = require('../models');

const escapeRegex = (raw) => String(raw).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toObjectId = (value) => {
  if (!value) return undefined;
  return mongoose.Types.ObjectId.isValid(value)
    ? new mongoose.Types.ObjectId(String(value))
    : value;
};

/**
 * Search list documents by direct text fields and linked supplier name/phone.
 * Removes search/fieldName from options so paginate does not apply them twice.
 */
const applySupplierLinkedListSearch = async (
  filter,
  options,
  { documentFields = [], supplierRefField = 'supplier' } = {}
) => {
  const raw = options.search ? String(options.search).trim() : '';
  if (!raw) return;

  const escaped = escapeRegex(raw);
  const orConditions = documentFields.map((field) => ({
    [field]: { $regex: escaped, $options: 'i' },
  }));

  const supplierFilter = {
    $or: [
      { name: { $regex: escaped, $options: 'i' } },
      { nameUrdu: { $regex: escaped, $options: 'i' } },
      { phone: { $regex: escaped, $options: 'i' } },
    ],
  };
  const orgId = toObjectId(filter.organizationId);
  const branchId = toObjectId(filter.branchId);
  if (orgId) supplierFilter.organizationId = orgId;
  if (branchId) supplierFilter.branchId = branchId;

  const suppliers = await Supplier.find(supplierFilter).select('_id').lean();
  if (suppliers.length > 0) {
    orConditions.push({
      [supplierRefField]: { $in: suppliers.map((s) => s._id) },
    });
  }

  if (orConditions.length > 0) {
    filter.$or = orConditions;
  }

  delete options.search;
  delete options.fieldName;
};

module.exports = {
  applySupplierLinkedListSearch,
  escapeRegex,
};
