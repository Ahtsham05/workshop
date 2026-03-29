const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { attendanceService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const parseDateOnlyAsLocal = (dateString, endOfDay = false) => {
  if (!dateString) return null;

  // Handle YYYY-MM-DD without timezone drift from Date('YYYY-MM-DD').
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [year, month, day] = dateString.split('-').map(Number);
    return endOfDay
      ? new Date(year, month - 1, day, 23, 59, 59, 999)
      : new Date(year, month - 1, day, 0, 0, 0, 0);
  }

  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return null;

  if (endOfDay) {
    parsed.setHours(23, 59, 59, 999);
  } else {
    parsed.setHours(0, 0, 0, 0);
  }
  return parsed;
};

const createAttendance = catchAsync(async (req, res) => {
  const attendance = await attendanceService.createAttendance({ ...req.body, ...getBranchContext(req) });
  res.status(httpStatus.CREATED).send(attendance);
});

const getAttendances = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['employee', 'status', 'startDate', 'endDate']);
  applyBranchFilter(filter, req);
  if (filter.startDate || filter.endDate) {
    filter.date = {};

    if (filter.startDate) {
      const startDate = parseDateOnlyAsLocal(filter.startDate, false);
      if (startDate) {
        filter.date.$gte = startDate;
      }
    }

    if (filter.endDate) {
      const endDate = parseDateOnlyAsLocal(filter.endDate, true);
      if (endDate) {
        filter.date.$lte = endDate;
      }
    }

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
  const attendance = await attendanceService.markCheckIn(req.body.employee, { location: req.body.location, ...getBranchContext(req) });
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
