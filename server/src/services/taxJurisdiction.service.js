const httpStatus = require('http-status');
const { TaxJurisdiction } = require('../models');
const ApiError = require('../utils/ApiError');

const createTaxJurisdiction = async (jurisdictionBody) => {
  const jurisdiction = new TaxJurisdiction(jurisdictionBody);
  return jurisdiction.save();
};

/**
 * @param {Object} filter - Mongo filter (organizationId required by caller)
 * @param {Object} options - sortBy/limit/page/search/fieldName
 */
const queryTaxJurisdictions = async (filter, options) => {
  return TaxJurisdiction.paginate(filter, options);
};

const getTaxJurisdictionById = async (organizationId, id) => {
  const jurisdiction = await TaxJurisdiction.findOne({ _id: id, organizationId });
  if (!jurisdiction) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tax jurisdiction not found');
  }
  return jurisdiction;
};

const updateTaxJurisdictionById = async (organizationId, id, updateBody) => {
  const jurisdiction = await getTaxJurisdictionById(organizationId, id);
  Object.assign(jurisdiction, updateBody);
  await jurisdiction.save();
  return jurisdiction;
};

/** Soft delete — sets status to 'inactive' rather than removing the document, since
 * existing TaxRate rows may still reference this jurisdiction. */
const softDeleteTaxJurisdictionById = async (organizationId, id) => {
  const jurisdiction = await getTaxJurisdictionById(organizationId, id);
  jurisdiction.status = 'inactive';
  await jurisdiction.save();
  return jurisdiction;
};

module.exports = {
  createTaxJurisdiction,
  queryTaxJurisdictions,
  getTaxJurisdictionById,
  updateTaxJurisdictionById,
  softDeleteTaxJurisdictionById,
};
