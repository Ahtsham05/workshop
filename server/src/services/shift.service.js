const httpStatus = require('http-status');
const { Shift } = require('../models');
const ApiError = require('../utils/ApiError');

const getTenantFilter = (data = {}) => {
  const filter = {};
  if (data.organizationId) {
    filter.organizationId = data.organizationId;
  }
  if (data.branchId) {
    filter.branchId = data.branchId;
  }
  return filter;
};

const createShift = async (shiftBody) => {
  const tenantFilter = getTenantFilter(shiftBody);
  if (await Shift.findOne({ ...tenantFilter, name: shiftBody.name })) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Shift name already exists');
  }
  if (await Shift.findOne({ ...tenantFilter, code: shiftBody.code })) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Shift code already exists');
  }
  return Shift.create(shiftBody);
};

const queryShifts = async (filter, options) => {
  const shifts = await Shift.paginate(filter, options);
  return shifts;
};

const getShiftById = async (id, scope = {}) => {
  const tenantFilter = getTenantFilter(scope);
  return Shift.findOne({ _id: id, ...tenantFilter });
};

const updateShiftById = async (shiftId, updateBody, scope = {}) => {
  const shift = await getShiftById(shiftId, scope);
  if (!shift) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Shift not found');
  }
  const tenantFilter = getTenantFilter(shift);
  if (
    updateBody.name
    && (await Shift.findOne({ ...tenantFilter, name: updateBody.name, _id: { $ne: shiftId } }))
  ) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Shift name already exists');
  }
  if (
    updateBody.code
    && (await Shift.findOne({ ...tenantFilter, code: updateBody.code, _id: { $ne: shiftId } }))
  ) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Shift code already exists');
  }
  Object.assign(shift, updateBody);
  await shift.save();
  return shift;
};

const deleteShiftById = async (shiftId, scope = {}) => {
  const shift = await getShiftById(shiftId, scope);
  if (!shift) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Shift not found');
  }
  await shift.deleteOne();
  return shift;
};

module.exports = {
  createShift,
  queryShifts,
  getShiftById,
  updateShiftById,
  deleteShiftById,
};
