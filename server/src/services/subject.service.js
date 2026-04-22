const httpStatus = require('http-status');
const { Subject } = require('../models');
const ApiError = require('../utils/ApiError');

const getTenantFilter = (data = {}) => {
  const filter = {};
  if (data.organizationId) filter.organizationId = data.organizationId;
  if (data.branchId) filter.branchId = data.branchId;
  return filter;
};

const createSubject = async (body) => {
  return Subject.create(body);
};

const querySubjects = async (filter, options) => {
  return Subject.paginate(filter, options);
};

const getSubjectById = async (id, scope = {}) => {
  return Subject.findOne({ _id: id, ...getTenantFilter(scope) }).populate('classId');
};

const updateSubjectById = async (id, updateBody, scope = {}) => {
  const doc = await getSubjectById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Subject not found');
  Object.assign(doc, updateBody);
  await doc.save();
  return doc;
};

const deleteSubjectById = async (id, scope = {}) => {
  const doc = await getSubjectById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Subject not found');
  await doc.deleteOne();
  return doc;
};

module.exports = {
  createSubject,
  querySubjects,
  getSubjectById,
  updateSubjectById,
  deleteSubjectById,
};
