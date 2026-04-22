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

module.exports = { getStudentProgressReport, getExamResultSheet };
