const httpStatus = require('http-status');
const { TaxRate } = require('../models');
const ApiError = require('../utils/ApiError');

const createTaxRate = async (rateBody) => {
  const rate = new TaxRate(rateBody);
  return rate.save();
};

/**
 * @param {Object} filter - Mongo filter (organizationId required by caller)
 * @param {Object} options - sortBy/limit/page/search/fieldName
 */
const queryTaxRates = async (filter, options) => {
  return TaxRate.paginate(filter, options);
};

const getTaxRateById = async (organizationId, id) => {
  const rate = await TaxRate.findOne({ _id: id, organizationId });
  if (!rate) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tax rate not found');
  }
  return rate;
};

const updateTaxRateById = async (organizationId, id, updateBody) => {
  const rate = await getTaxRateById(organizationId, id);
  Object.assign(rate, updateBody);
  await rate.save();
  return rate;
};

/** Soft delete — sets status to 'inactive' rather than removing the document, since
 * historical invoices may have snapshotted a tax calculation derived from this rate. */
const softDeleteTaxRateById = async (organizationId, id) => {
  const rate = await getTaxRateById(organizationId, id);
  rate.status = 'inactive';
  await rate.save();
  return rate;
};

module.exports = {
  createTaxRate,
  queryTaxRates,
  getTaxRateById,
  updateTaxRateById,
  softDeleteTaxRateById,
};
