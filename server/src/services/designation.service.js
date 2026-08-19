const httpStatus = require('http-status');
const { Designation } = require('../models');
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

const createDesignation = async (designationBody) => {
  const tenantFilter = getTenantFilter(designationBody);
  if (await Designation.findOne({ ...tenantFilter, title: designationBody.title })) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Designation title already exists');
  }
  if (await Designation.findOne({ ...tenantFilter, code: designationBody.code })) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Designation code already exists');
  }
  return Designation.create(designationBody);
};

const queryDesignations = async (filter, options) => {
  const designations = await Designation.paginate(filter, options);
  return designations;
};

const getDesignationById = async (id, scope = {}) => {
  const tenantFilter = getTenantFilter(scope);
  const designation = await Designation.findOne({ _id: id, ...tenantFilter }).populate('department');
  return designation;
};

const updateDesignationById = async (designationId, updateBody, scope = {}) => {
  const designation = await getDesignationById(designationId, scope);
  if (!designation) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Designation not found');
  }
  const tenantFilter = getTenantFilter(designation);
  if (
    updateBody.title
    && (await Designation.findOne({ ...tenantFilter, title: updateBody.title, _id: { $ne: designationId } }))
  ) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Designation title already exists');
  }
  if (
    updateBody.code
    && (await Designation.findOne({ ...tenantFilter, code: updateBody.code, _id: { $ne: designationId } }))
  ) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Designation code already exists');
  }
  Object.assign(designation, updateBody);
  await designation.save();
  return designation;
};

const deleteDesignationById = async (designationId, scope = {}) => {
  const designation = await getDesignationById(designationId, scope);
  if (!designation) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Designation not found');
  }
  await designation.deleteOne();
  return designation;
};

module.exports = {
  createDesignation,
  queryDesignations,
  getDesignationById,
  updateDesignationById,
  deleteDesignationById,
};
