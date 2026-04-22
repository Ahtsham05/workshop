/**
 * Parent Portal Controller
 * All endpoints are scoped to the logged-in parent's linked children.
 */
const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { Student, Mark, SchoolAttendance, SchoolFee, Exam } = require('../models');
const { schoolReportService } = require('../services');

const getScope = (req) => ({
  organizationId: req.organizationId,
  branchId: req.branchId,
});

/**
 * Return the list of studentIds this parent owns.
 */
const getLinkedStudentIds = (req) => {
  const ids = req.user.linkedStudentIds || [];
  return ids.map ? ids.map(String) : [String(ids)];
};

const assertHasStudents = (ids) => {
  if (!ids.length) throw new ApiError(httpStatus.FORBIDDEN, 'No students linked to this parent account');
};

/** GET /parent-portal/children — full student profiles */
const getMyChildren = catchAsync(async (req, res) => {
  const studentIds = getLinkedStudentIds(req);
  assertHasStudents(studentIds);

  const scope = getScope(req);
  const students = await Student.find({ ...scope, _id: { $in: studentIds } })
    .populate('classId', 'name')
    .populate('sectionId', 'name')
    .lean();
  res.send(students);
});

/** GET /parent-portal/results?studentId=&examId= */
const getMyChildResults = catchAsync(async (req, res) => {
  const studentIds = getLinkedStudentIds(req);
  assertHasStudents(studentIds);

  const { studentId, examId } = req.query;
  if (studentId && !studentIds.includes(String(studentId))) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied');
  }

  const scope = getScope(req);
  const filter = { ...scope, studentId: studentId ? studentId : { $in: studentIds } };
  if (examId) filter.examId = examId;

  const marks = await Mark.find(filter)
    .populate('subjectId', 'name code')
    .populate('examId', 'name type startDate totalMarks passingMarks')
    .sort({ createdAt: -1 })
    .lean();
  res.send(marks);
});

/** GET /parent-portal/attendance?studentId= */
const getMyChildAttendance = catchAsync(async (req, res) => {
  const studentIds = getLinkedStudentIds(req);
  assertHasStudents(studentIds);

  const { studentId } = req.query;
  if (studentId && !studentIds.includes(String(studentId))) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied');
  }

  const scope = getScope(req);
  const filter = { ...scope, studentId: studentId ? studentId : { $in: studentIds } };
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = new Date(req.query.from);
    if (req.query.to) filter.date.$lte = new Date(req.query.to);
  }

  const records = await SchoolAttendance.find(filter)
    .populate('studentId', 'firstName lastName admissionNumber')
    .sort({ date: -1 })
    .limit(365)
    .lean();
  res.send(records);
});

/** GET /parent-portal/fees?studentId= */
const getMyChildFees = catchAsync(async (req, res) => {
  const studentIds = getLinkedStudentIds(req);
  assertHasStudents(studentIds);

  const { studentId } = req.query;
  if (studentId && !studentIds.includes(String(studentId))) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied');
  }

  const scope = getScope(req);
  const filter = { ...scope, studentId: studentId ? studentId : { $in: studentIds } };

  const fees = await SchoolFee.find(filter)
    .populate('studentId', 'firstName lastName admissionNumber')
    .sort({ dueDate: -1 })
    .lean();
  res.send(fees);
});

/** GET /parent-portal/report/:studentId — full progress report */
const getMyChildReport = catchAsync(async (req, res) => {
  const studentIds = getLinkedStudentIds(req);
  assertHasStudents(studentIds);

  if (!studentIds.includes(String(req.params.studentId))) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied');
  }

  const report = await schoolReportService.getStudentProgressReport(
    req.params.studentId,
    getScope(req),
    req.query.examId || null
  );
  if (!report) throw new ApiError(httpStatus.NOT_FOUND, 'Student not found');
  res.send(report);
});

module.exports = { getMyChildren, getMyChildResults, getMyChildAttendance, getMyChildFees, getMyChildReport };
