const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { attendanceService } = require('../services');

const createAttendance = catchAsync(async (req, res) => {
  const attendance = await attendanceService.createAttendance(req.body);
  res.status(httpStatus.CREATED).send(attendance);
});

const getAttendances = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['employee', 'status', 'startDate', 'endDate']);
  if (filter.startDate || filter.endDate) {
    filter.date = {};
    if (filter.startDate) filter.date.$gte = new Date(filter.startDate);
    if (filter.endDate) filter.date.$lte = new Date(filter.endDate);
    delete filter.startDate;
    delete filter.endDate;
  }
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  options.populate = 'employee,shift';
  const result = await attendanceService.queryAttendances(filter, options);
  res.send(result);
});

const getAttendance = catchAsync(async (req, res) => {
  const attendance = await attendanceService.getAttendanceById(req.params.attendanceId);
  if (!attendance) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Attendance not found');
  }
  res.send(attendance);
});

const updateAttendance = catchAsync(async (req, res) => {
  const attendance = await attendanceService.updateAttendanceById(req.params.attendanceId, req.body);
  res.send(attendance);
});

const deleteAttendance = catchAsync(async (req, res) => {
  await attendanceService.deleteAttendanceById(req.params.attendanceId);
  res.status(httpStatus.NO_CONTENT).send();
});

const markCheckIn = catchAsync(async (req, res) => {
  const attendance = await attendanceService.markCheckIn(req.body.employee, { location: req.body.location });
  res.status(httpStatus.CREATED).send(attendance);
});

const markCheckOut = catchAsync(async (req, res) => {
  const attendance = await attendanceService.markCheckOut(req.body.employee);
  res.send(attendance);
});

const getEmployeeAttendance = catchAsync(async (req, res) => {
  const { employeeId } = req.params;
  const { startDate, endDate } = req.query;
  const attendances = await attendanceService.getEmployeeAttendance(
    employeeId,
    new Date(startDate),
    new Date(endDate)
  );
  res.send(attendances);
});

module.exports = {
  createAttendance,
  getAttendances,
  getAttendance,
  updateAttendance,
  deleteAttendance,
  markCheckIn,
  markCheckOut,
  getEmployeeAttendance,
};
