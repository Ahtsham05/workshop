const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { attendanceService } = require('../services');
const { Employee } = require('../models');
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
  if (req.query.search) {
    const regex = new RegExp(req.query.search, 'i');
    const tenantFilter = {};
    if (filter.organizationId) tenantFilter.organizationId = filter.organizationId;
    if (filter.branchId) tenantFilter.branchId = filter.branchId;
    const employees = await Employee.find({
      ...tenantFilter,
      $or: [{ firstName: regex }, { lastName: regex }, { employeeId: regex }, { email: regex }],
    }).select('_id');
    const employeeIds = employees.map((emp) => emp._id);
    filter.employee = filter.employee
      ? { $in: employeeIds.filter((id) => String(id) === String(filter.employee)) }
      : { $in: employeeIds };
  }
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
  const attendance = await attendanceService.updateAttendanceById(req.params.attendanceId, {
    ...req.body,
    updatedBy: req.user?.id,
  });
  res.send(attendance);
});

const deleteAttendance = catchAsync(async (req, res) => {
  await attendanceService.deleteAttendanceById(req.params.attendanceId, req.user?.id);
  res.status(httpStatus.NO_CONTENT).send();
});

const markCheckIn = catchAsync(async (req, res) => {
  const attendance = await attendanceService.markCheckIn(req.body.employee, {
    location: req.body.location,
    userId: req.user?.id,
    ...getBranchContext(req),
  });
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

const markBulkAttendance = catchAsync(async (req, res) => {
  const result = await attendanceService.markBulkAttendance(req.body.records, {
    ...getBranchContext(req),
    userId: req.user?.id,
  });
  res.status(httpStatus.OK).send(result);
});

const getDailySummary = catchAsync(async (req, res) => {
  const summary = await attendanceService.getDailyAttendanceSummary(req.query.date, getBranchContext(req));
  res.send(summary);
});

const getEmployeeStats = catchAsync(async (req, res) => {
  const { employeeId } = req.params;
  const { startDate, endDate } = req.query;
  const stats = await attendanceService.computeEmployeeAttendanceStats(
    employeeId,
    startDate,
    endDate,
    getBranchContext(req),
  );
  res.send(stats);
});

const getEmployeeDailyBreakdown = catchAsync(async (req, res) => {
  const { employeeId } = req.params;
  const { month, year } = req.query;
  const breakdown = await attendanceService.getEmployeeDailyBreakdown(
    employeeId,
    Number(month),
    Number(year),
    getBranchContext(req),
  );
  res.send(breakdown);
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
  markBulkAttendance,
  getDailySummary,
  getEmployeeStats,
  getEmployeeDailyBreakdown,
};
