const httpStatus = require('http-status');
const { Mark } = require('../models');
const ApiError = require('../utils/ApiError');

const getTenantFilter = (data = {}) => {
  const filter = {};
  if (data.organizationId) filter.organizationId = data.organizationId;
  if (data.branchId) filter.branchId = data.branchId;
  return filter;
};

const createMark = async (body) => {
  return Mark.create(body);
};

const calcGrade = (obtained, total, isAbsent) => {
  if (isAbsent) return { percentage: 0, grade: 'AB' };
  if (!total || total <= 0) return { percentage: 0, grade: '' };
  const pct = Math.round((obtained / total) * 100);
  let grade = 'F';
  if (pct >= 90) grade = 'A+';
  else if (pct >= 80) grade = 'A';
  else if (pct >= 70) grade = 'B';
  else if (pct >= 60) grade = 'C';
  else if (pct >= 50) grade = 'D';
  else if (pct >= 33) grade = 'E';
  return { percentage: pct, grade };
};

const createBulkMarks = async (records, context) => {
  const docs = records.map((r) => {
    const { percentage, grade } = calcGrade(r.obtainedMarks, r.totalMarks, r.isAbsent);
    return {
      ...r,
      percentage,
      grade,
      organizationId: context.organizationId,
      branchId: context.branchId,
      createdBy: context.createdBy,
    };
  });
  return Mark.insertMany(docs, { ordered: false }).catch((err) => {
    if (err.code === 11000) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Duplicate marks entries found');
    }
    throw err;
  });
};

const queryMarks = async (filter, options) => {
  return Mark.paginate(filter, options);
};

const getMarkById = async (id, scope = {}) => {
  return Mark.findOne({ _id: id, ...getTenantFilter(scope) })
    .populate('studentId')
    .populate('subjectId')
    .populate('examId');
};

const getMarksByExam = async (examId, scope = {}) => {
  return Mark.find({ ...getTenantFilter(scope), examId })
    .populate('studentId')
    .populate('subjectId')
    .lean();
};

const getStudentResult = async (studentId, examId, scope = {}) => {
  return Mark.find({ ...getTenantFilter(scope), studentId, examId })
    .populate('subjectId')
    .lean();
};

const updateMarkById = async (id, updateBody, scope = {}) => {
  const doc = await getMarkById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Mark not found');
  Object.assign(doc, updateBody);
  await doc.save();
  return doc;
};

const deleteMarkById = async (id, scope = {}) => {
  const doc = await getMarkById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Mark not found');
  await doc.deleteOne();
  return doc;
};

module.exports = {
  createMark,
  createBulkMarks,
  queryMarks,
  getMarkById,
  getMarksByExam,
  getStudentResult,
  updateMarkById,
  deleteMarkById,
};
