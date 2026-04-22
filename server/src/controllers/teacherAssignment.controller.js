const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { teacherAssignmentService } = require('../services');
const pick = require('../utils/pick');

const getScope = (req) => ({
  organizationId: req.organizationId,
  branchId: req.branchId,
});

const createAssignment = catchAsync(async (req, res) => {
  const doc = await teacherAssignmentService.createAssignment({
    ...req.body,
    ...getScope(req),
    createdBy: req.user.id,
  });
  res.status(httpStatus.CREATED).send(doc);
});

const getAssignments = catchAsync(async (req, res) => {
  const filter = {
    ...getScope(req),
    ...pick(req.query, ['teacherId', 'classId', 'sectionId', 'subjectId', 'isClassTeacher']),
  };
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await teacherAssignmentService.queryAssignments(filter, options);
  res.send(result);
});

const getAssignment = catchAsync(async (req, res) => {
  const doc = await teacherAssignmentService.getAssignmentById(req.params.id, getScope(req));
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Assignment not found');
  res.send(doc);
});

const deleteAssignment = catchAsync(async (req, res) => {
  await teacherAssignmentService.deleteAssignmentById(req.params.id, getScope(req));
  res.status(httpStatus.NO_CONTENT).send();
});

const getClassOverview = catchAsync(async (req, res) => {
  const overview = await teacherAssignmentService.getClassOverview(getScope(req));
  res.send(overview);
});

const getTeacherAssignments = catchAsync(async (req, res) => {
  const { teacherId } = req.params;
  const result = await teacherAssignmentService.getAssignmentsByTeacher(teacherId, getScope(req));
  res.send(result);
});

module.exports = {
  createAssignment,
  getAssignments,
  getAssignment,
  deleteAssignment,
  getClassOverview,
  getTeacherAssignments,
};
