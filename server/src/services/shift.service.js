const httpStatus = require('http-status');
const { Shift } = require('../models');
const ApiError = require('../utils/ApiError');

const createShift = async (shiftBody) => {
  if (await Shift.findOne({ name: shiftBody.name })) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Shift name already exists');
  }
  if (await Shift.findOne({ code: shiftBody.code })) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Shift code already exists');
  }
  return Shift.create(shiftBody);
};

const queryShifts = async (filter, options) => {
  const shifts = await Shift.paginate(filter, options);
  return shifts;
};

const getShiftById = async (id) => {
  return Shift.findById(id);
};

const updateShiftById = async (shiftId, updateBody) => {
  const shift = await getShiftById(shiftId);
  if (!shift) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Shift not found');
  }
  if (updateBody.name && (await Shift.findOne({ name: updateBody.name, _id: { $ne: shiftId } }))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Shift name already exists');
  }
  if (updateBody.code && (await Shift.findOne({ code: updateBody.code, _id: { $ne: shiftId } }))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Shift code already exists');
  }
  Object.assign(shift, updateBody);
  await shift.save();
  return shift;
};

const deleteShiftById = async (shiftId) => {
  const shift = await getShiftById(shiftId);
  if (!shift) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Shift not found');
  }
  await shift.remove();
  return shift;
};

module.exports = {
  createShift,
  queryShifts,
  getShiftById,
  updateShiftById,
  deleteShiftById,
};
