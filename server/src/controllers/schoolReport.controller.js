const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { schoolReportService } = require('../services');

const getScope = (req) => ({
  organizationId: req.organizationId,
  branchId: req.branchId,
});

/**
 * GET /school-reports/student/:studentId
 * Full progress report for one student.
 * Optional query: ?examId=xxx
 */
const getStudentProgressReport = catchAsync(async (req, res) => {
  const report = await schoolReportService.getStudentProgressReport(
    req.params.studentId,
    getScope(req),
    req.query.examId || null
  );
  if (!report) throw new ApiError(httpStatus.NOT_FOUND, 'Student not found');
  res.send(report);
});

/**
 * GET /school-reports/exam/:examId/result-sheet
 * Full class result spreadsheet for one exam.
 */
const getExamResultSheet = catchAsync(async (req, res) => {
  const sheet = await schoolReportService.getExamResultSheet(req.params.examId, getScope(req));
  if (!sheet) throw new ApiError(httpStatus.NOT_FOUND, 'Exam not found');
  res.send(sheet);
});

const parseStudentIds = (value) => {
  if (!value) return undefined;
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

/**
 * GET /school-reports/class/:classId/bulk?examId=xxx&sectionId=&studentIds=id1,id2
 * All progress reports for one class + exam in a single response.
 */
const getClassProgressReportsBulk = catchAsync(async (req, res) => {
  const { examId } = req.query;
  if (!examId) throw new ApiError(httpStatus.BAD_REQUEST, 'examId is required');

  const result = await schoolReportService.getClassProgressReportsBulk(
    {
      classId: req.params.classId,
      examId,
      sectionId: req.query.sectionId || undefined,
      studentIds: parseStudentIds(req.query.studentIds),
    },
    getScope(req)
  );

  if (!result) throw new ApiError(httpStatus.NOT_FOUND, 'Class or exam not found');
  if (result.error) throw new ApiError(httpStatus.BAD_REQUEST, result.error);

  res.send(result);
});

module.exports = { getStudentProgressReport, getClassProgressReportsBulk, getExamResultSheet };
