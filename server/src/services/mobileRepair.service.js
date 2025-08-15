const httpStatus = require('http-status');
const { MobileRepair } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a mobile repair record
 * @param {Object} repairBody
 * @returns {Promise<MobileRepair>}
 */
const createMobileRepair = async (repairBody) => {
  return MobileRepair.create(repairBody);
};

/**
 * Query mobile repairs with filters and pagination
 * @param {Object} filter
 * @param {Object} options
 * @returns {Promise<QueryResult>}
 */
const queryMobileRepairs = async (filter, options) => {
  const repairs = await MobileRepair.paginate(filter, options);
  return repairs;
};

/**
 * Get mobile repair by id
 * @param {ObjectId} id
 * @returns {Promise<MobileRepair>}
 */
const getMobileRepairById = async (id) => {
  return MobileRepair.findById(id);
};

/**
 * Update mobile repair by id
 * @param {ObjectId} repairId
 * @param {Object} updateBody
 * @returns {Promise<MobileRepair>}
 */
const updateMobileRepairById = async (repairId, updateBody) => {
  const repair = await getMobileRepairById(repairId);
  if (!repair) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Mobile Repair record not found');
  }
  Object.assign(repair, updateBody);
  await repair.save();
  return repair;
};

/**
 * Delete mobile repair by id
 * @param {ObjectId} repairId
 * @returns {Promise<MobileRepair>}
 */
const deleteMobileRepairById = async (repairId) => {
  const repair = await getMobileRepairById(repairId);
  if (!repair) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Mobile Repair record not found');
  }
  await repair.remove();
  return repair;
};

module.exports = {
  createMobileRepair,
  queryMobileRepairs,
  getMobileRepairById,
  updateMobileRepairById,
  deleteMobileRepairById,
};
