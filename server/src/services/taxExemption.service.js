const httpStatus = require('http-status');
const { TaxExemption, Customer } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Real tenant-isolation check (not decoration): a TaxExemption must point at a Customer
 * that actually belongs to the same organization, so org A can never grant/see an
 * exemption against org B's customer just by guessing/sending a foreign customerId.
 */
const assertCustomerInOrganization = async (organizationId, customerId) => {
  const customer = await Customer.findById(customerId);
  if (!customer || String(customer.organizationId) !== String(organizationId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Customer not found in this organization');
  }
};

const createTaxExemption = async (exemptionBody) => {
  await assertCustomerInOrganization(exemptionBody.organizationId, exemptionBody.customerId);
  const exemption = new TaxExemption(exemptionBody);
  return exemption.save();
};

/**
 * @param {Object} filter - Mongo filter (organizationId required by caller)
 * @param {Object} options - sortBy/limit/page/search/fieldName
 */
const queryTaxExemptions = async (filter, options) => {
  return TaxExemption.paginate(filter, options);
};

const getTaxExemptionById = async (organizationId, id) => {
  const exemption = await TaxExemption.findOne({ _id: id, organizationId });
  if (!exemption) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tax exemption not found');
  }
  return exemption;
};

const updateTaxExemptionById = async (organizationId, id, updateBody) => {
  const exemption = await getTaxExemptionById(organizationId, id);
  if (updateBody.customerId && String(updateBody.customerId) !== String(exemption.customerId)) {
    await assertCustomerInOrganization(organizationId, updateBody.customerId);
  }
  Object.assign(exemption, updateBody);
  await exemption.save();
  return exemption;
};

/** Soft delete — sets status to 'inactive' rather than removing the document, preserving
 * the audit trail (reason/certificate/effective window) this record exists to keep. */
const softDeleteTaxExemptionById = async (organizationId, id) => {
  const exemption = await getTaxExemptionById(organizationId, id);
  exemption.status = 'inactive';
  await exemption.save();
  return exemption;
};

module.exports = {
  createTaxExemption,
  queryTaxExemptions,
  getTaxExemptionById,
  updateTaxExemptionById,
  softDeleteTaxExemptionById,
};
