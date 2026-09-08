const httpStatus = require('http-status');
const { TaxJurisdiction } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Walks the parentJurisdictionId chain starting at `candidateParentId`, rejecting
 * the assignment if it ever reaches `jurisdictionId` — i.e. if `jurisdictionId` is
 * an ancestor of the proposed parent, assigning it would create a cycle. Only
 * relevant on update (a brand-new jurisdiction can't already be part of a cycle,
 * since nothing can point to an id that doesn't exist yet).
 */
const assertNoJurisdictionCycle = async (organizationId, jurisdictionId, candidateParentId) => {
  if (String(candidateParentId) === String(jurisdictionId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A tax jurisdiction cannot be its own parent');
  }
  const visited = new Set();
  let currentId = candidateParentId;
  while (currentId) {
    if (String(currentId) === String(jurisdictionId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'This parent assignment would create a jurisdiction cycle');
    }
    if (visited.has(String(currentId))) break; // pre-existing cycle in data — stop, don't loop forever
    visited.add(String(currentId));
    // eslint-disable-next-line no-await-in-loop
    const parent = await TaxJurisdiction.findOne({ _id: currentId, organizationId }).select('parentJurisdictionId');
    currentId = parent ? parent.parentJurisdictionId : null;
  }
};

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
  if (updateBody.parentJurisdictionId) {
    await assertNoJurisdictionCycle(organizationId, id, updateBody.parentJurisdictionId);
  }
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
