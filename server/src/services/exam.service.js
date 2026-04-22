const httpStatus = require('http-status');
const { Exam } = require('../models');
const ApiError = require('../utils/ApiError');

const getTenantFilter = (data = {}) => {
  const filter = {};
  if (data.organizationId) filter.organizationId = data.organizationId;
  if (data.branchId) filter.branchId = data.branchId;
  return filter;
};

const createExam = async (body) => {
  return Exam.create(body);
};

const queryExams = async (filter, options) => {
  // paginate plugin supports array of populate objects for nested paths
  const populateOptions = [
    { path: 'classId', select: 'name' },
    { path: 'subjects.subjectId', select: 'name code' },
  ];
  options.populate = populateOptions;
  return Exam.paginate(filter, options);
};

const getExamById = async (id, scope = {}) => {
  return Exam.findOne({ _id: id, ...getTenantFilter(scope) })
    .populate('classId', 'name')
    .populate({ path: 'subjects.subjectId', select: 'name code' });
};

const updateExamById = async (id, updateBody, scope = {}) => {
  const doc = await getExamById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Exam not found');
  Object.assign(doc, updateBody);
  await doc.save();
  return doc;
};

const deleteExamById = async (id, scope = {}) => {
  const doc = await getExamById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Exam not found');
  await doc.deleteOne();
  return doc;
};

module.exports = {
  createExam,
  queryExams,
  getExamById,
  updateExamById,
  deleteExamById,
};
