const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { timetableService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const getScope = (req) => ({
  organizationId: req.organizationId,
  branchId: req.branchId,
});

const createTimetable = catchAsync(async (req, res) => {
  const doc = await timetableService.createTimetable({ ...req.body, ...getBranchContext(req) });
  res.status(httpStatus.CREATED).send(doc);
});

const getTimetables = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['classId', 'sectionId', 'day', 'isActive']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  options.populate = 'classId,sectionId';
  const result = await timetableService.queryTimetables(filter, options);
  res.send(result);
});

const getTimetable = catchAsync(async (req, res) => {
  const doc = await timetableService.getTimetableById(req.params.id, getScope(req));
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Timetable not found');
  res.send(doc);
});

const getTimetableByClass = catchAsync(async (req, res) => {
  const data = await timetableService.getTimetableByClass(req.params.classId, getScope(req));
  res.send(data);
});

/**
 * GET /timetables/teacher/:teacherId
 * Returns the teacher's full weekly schedule grouped by day.
 */
const getTimetableByTeacher = catchAsync(async (req, res) => {
  const schedule = await timetableService.getTimetableByTeacher(
    req.params.teacherId,
    getScope(req)
  );
  res.send(schedule);
});

/**
 * GET /timetables/teacher/:teacherId/availability/:day
 * Returns free + busy slots for a teacher on a given day.
 */
const getTeacherAvailability = catchAsync(async (req, res) => {
  const { teacherId, day } = req.params;
  const availability = await timetableService.getTeacherAvailability(
    teacherId,
    day,
    getScope(req)
  );
  res.send(availability);
});

/**
 * POST /timetables/check-conflict
 * Stateless conflict check — call before manual entry to pre-validate.
 * Body: { teacherId, classId, sectionId, day, timeSlotId?, periodNo? }
 */
const checkConflict = catchAsync(async (req, res) => {
  const scope = getScope(req);
  const result = await timetableService.checkConflict({ ...req.body, ...scope });
  // Always return 200 — the `conflict` boolean tells the client the outcome
  res.send(result);
});

/**
 * POST /timetables/auto-generate
 * Run the smart algorithm for one class+section.
 * Body: { classId, sectionId, days?, shuffle?, save?, subjectOverrides? }
 */
const autoGenerateTimetable = catchAsync(async (req, res) => {
  const scope = getScope(req);
  // `overwrite: true` from the front-end is an alias for `save: true`
  const body = { ...req.body };
  if (body.overwrite !== undefined) {
    body.save = body.save ?? body.overwrite;
    delete body.overwrite;
  }
  const result = await timetableService.autoGenerateTimetable({
    ...body,
    ...scope,
    createdBy: req.user?._id,
  });
  res.status(httpStatus.OK).send(result);
});

/**
 * POST /timetables/bulk-generate
 * Generate timetables for ALL classes in the org/branch in one operation.
 * Body: { days?, shuffle?, save?, continueOnError?, subjectDefaults?, classIds? }
 */
const bulkGenerateTimetables = catchAsync(async (req, res) => {
  const scope = getScope(req);
  const result = await timetableService.bulkGenerateTimetables({
    ...req.body,
    ...scope,
    createdBy: req.user?._id,
  });

  // Use 207 Multi-Status when partially succeeded
  const status = result.success
    ? httpStatus.OK
    : result.partialSuccess
    ? 207
    : httpStatus.UNPROCESSABLE_ENTITY;

  res.status(status).send(result);
});

const updateTimetable = catchAsync(async (req, res) => {
  const doc = await timetableService.updateTimetableById(req.params.id, req.body, getScope(req));
  res.send(doc);
});

const deleteTimetable = catchAsync(async (req, res) => {
  await timetableService.deleteTimetableById(req.params.id, getScope(req));
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createTimetable,
  getTimetables,
  getTimetable,
  getTimetableByClass,
  getTimetableByTeacher,
  getTeacherAvailability,
  checkConflict,
  autoGenerateTimetable,
  bulkGenerateTimetables,
  updateTimetable,
  deleteTimetable,
};
