const mongoose = require('mongoose');
const { Supplier } = require('../models');
const { tokenizeSearch } = require('./searchQuery');

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

  // Every word must match (any order): either a document field or the linked supplier's
  // name/phone, so "ali traders" can hit supplier "Ali" + a note saying "traders".
  const orgId = toObjectId(filter.organizationId);
  const branchId = toObjectId(filter.branchId);
  const wordClauses = await Promise.all(
    tokenizeSearch(raw).map(async (word) => {
      const escaped = escapeRegex(word);
      const conditions = documentFields.map((field) => ({ [field]: { $regex: escaped, $options: 'i' } }));
      const supplierFilter = {
        $or: [
          { name: { $regex: escaped, $options: 'i' } },
          { nameUrdu: { $regex: escaped, $options: 'i' } },
          { phone: { $regex: escaped, $options: 'i' } },
        ],
      };
      if (orgId) supplierFilter.organizationId = orgId;
      if (branchId) supplierFilter.branchId = branchId;
      const suppliers = await Supplier.find(supplierFilter).select('_id').lean();
      if (suppliers.length > 0) conditions.push({ [supplierRefField]: { $in: suppliers.map((s) => s._id) } });
      return { $or: conditions.length > 0 ? conditions : [{ _id: null }] };
    })
  );
  if (wordClauses.length > 0) filter.$and = [...(filter.$and || []), ...wordClauses];

  delete options.search;
  delete options.fieldName;
};

module.exports = {
  applySupplierLinkedListSearch,
  escapeRegex,
};
