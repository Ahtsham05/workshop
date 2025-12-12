const httpStatus = require('http-status');
const { Designation } = require('../models');
const ApiError = require('../utils/ApiError');

const createDesignation = async (designationBody) => {
  if (await Designation.findOne({ title: designationBody.title })) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Designation title already exists');
  }
  if (await Designation.findOne({ code: designationBody.code })) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Designation code already exists');
  }
  return Designation.create(designationBody);
};

const queryDesignations = async (filter, options) => {
  const designations = await Designation.paginate(filter, options);
  return designations;
};

const getDesignationById = async (id) => {
  const designation = await Designation.findById(id).populate('department');
  return designation;
};

const updateDesignationById = async (designationId, updateBody) => {
  const designation = await getDesignationById(designationId);
  if (!designation) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Designation not found');
  }
  if (updateBody.title && (await Designation.findOne({ title: updateBody.title, _id: { $ne: designationId } }))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Designation title already exists');
  }
  if (updateBody.code && (await Designation.findOne({ code: updateBody.code, _id: { $ne: designationId } }))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Designation code already exists');
  }
  Object.assign(designation, updateBody);
  await designation.save();
  return designation;
};

const deleteDesignationById = async (designationId) => {
  const designation = await getDesignationById(designationId);
  if (!designation) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Designation not found');
  }
  await designation.remove();
  return designation;
};

module.exports = {
  createDesignation,
  queryDesignations,
  getDesignationById,
  updateDesignationById,
  deleteDesignationById,
};
