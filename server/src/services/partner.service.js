const httpStatus = require('http-status');
const { Partner, PartnerProfitShareRule, PartnerProfitShareLedger } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a partner/investor contact. No shadow Customer/ledger opening-balance dance like
 * Supplier — a partner has no balance of its own; everything they're owed lives entirely
 * in PartnerProfitShareLedger, driven by their PartnerProfitShareRule(s).
 * @param {Object} partnerBody
 * @returns {Promise<Partner>}
 */
const createPartner = async (partnerBody) => {
  return Partner.create(partnerBody);
};

/**
 * Query for partners
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const queryPartners = async (filter, options) => {
  const opts = { ...options, sortBy: options.sortBy || 'name:asc' };
  return Partner.paginate(filter, opts);
};

const getPartnerById = async (id) => {
  return Partner.findById(id);
};

/**
 * Update partner by id
 * @param {ObjectId} partnerId
 * @param {Object} updateBody
 * @returns {Promise<Partner>}
 */
const updatePartnerById = async (partnerId, updateBody) => {
  const partner = await getPartnerById(partnerId);
  if (!partner) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Partner not found');
  }
  Object.assign(partner, updateBody);
  await partner.save();
  return partner;
};

/**
 * Delete partner by id. Blocked if the partner has any profit-share rules or ledger
 * history — deleting would orphan that data and silently lose track of money owed.
 * Deactivate (isActive: false) instead once a partner has any real activity.
 * @param {ObjectId} partnerId
 * @returns {Promise<Partner>}
 */
const deletePartnerById = async (partnerId) => {
  const partner = await getPartnerById(partnerId);
  if (!partner) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Partner not found');
  }

  const hasRules = await PartnerProfitShareRule.exists({ partnerId });
  if (hasRules) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot delete a partner with profit-share rules — deactivate the partner instead.');
  }
  const hasLedgerHistory = await PartnerProfitShareLedger.exists({ partnerId });
  if (hasLedgerHistory) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot delete a partner with ledger history — deactivate the partner instead.');
  }

  await partner.deleteOne();
  return partner;
};

const getAllPartners = async (filter = {}) => {
  return Partner.find(filter);
};

module.exports = {
  createPartner,
  queryPartners,
  getPartnerById,
  updatePartnerById,
  deletePartnerById,
  getAllPartners,
};
