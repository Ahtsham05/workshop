const httpStatus = require('http-status');
const { SchoolClass } = require('../models');
const ApiError = require('../utils/ApiError');

const getTenantFilter = (data = {}) => {
  const filter = {};
  if (data.organizationId) filter.organizationId = data.organizationId;
  if (data.branchId) filter.branchId = data.branchId;
  return filter;
};

const createClass = async (body) => {
  const tenantFilter = getTenantFilter(body);
  if (await SchoolClass.findOne({ ...tenantFilter, name: body.name }).lean()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Class name already exists');
  }
  return SchoolClass.create(body);
};

const queryClasses = async (filter, options) => {
  return SchoolClass.paginate(filter, options);
};

const getClassById = async (id, scope = {}) => {
  return SchoolClass.findOne({ _id: id, ...getTenantFilter(scope) });
};

const updateClassById = async (id, updateBody, scope = {}) => {
  const doc = await getClassById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Class not found');
  Object.assign(doc, updateBody);
  await doc.save();
  return doc;
};

const deleteClassById = async (id, scope = {}) => {
  const doc = await getClassById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Class not found');
  await doc.deleteOne();
  return doc;
};

module.exports = {
  createClass,
  queryClasses,
  getClassById,
  updateClassById,
  deleteClassById,
};
