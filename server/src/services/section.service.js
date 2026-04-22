const httpStatus = require('http-status');
const { Section } = require('../models');
const ApiError = require('../utils/ApiError');

const getTenantFilter = (data = {}) => {
  const filter = {};
  if (data.organizationId) filter.organizationId = data.organizationId;
  if (data.branchId) filter.branchId = data.branchId;
  return filter;
};

const createSection = async (body) => {
  return Section.create(body);
};

const querySections = async (filter, options) => {
  return Section.paginate(filter, options);
};

const getSectionById = async (id, scope = {}) => {
  return Section.findOne({ _id: id, ...getTenantFilter(scope) }).populate('classId');
};

const updateSectionById = async (id, updateBody, scope = {}) => {
  const doc = await getSectionById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Section not found');
  Object.assign(doc, updateBody);
  await doc.save();
  return doc;
};

const deleteSectionById = async (id, scope = {}) => {
  const doc = await getSectionById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Section not found');
  await doc.deleteOne();
  return doc;
};

module.exports = {
  createSection,
  querySections,
  getSectionById,
  updateSectionById,
  deleteSectionById,
};
