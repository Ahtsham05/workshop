const httpStatus = require('http-status');
const { Attendance, Employee, Leave } = require('../models');
const ApiError = require('../utils/ApiError');
const { normalizeDateOnly, computeAttendanceStatsFromData, resolveDayStatus, eachDateInRange } = require('../utils/attendanceStats');
const payrollService = require('./payroll.service');

const createAttendance = async (attendanceBody) => {
  const employee = await Employee.findOne({
    _id: attendanceBody.employee,
    organizationId: attendanceBody.organizationId,
    branchId: attendanceBody.branchId,
  });
  if (!employee) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Employee not found');
  }

  const attendanceDate = normalizeDateOnly(attendanceBody.date);

  // Check if attendance already exists for this date
  const existingAttendance = await Attendance.findOne({
    organizationId: attendanceBody.organizationId,
    branchId: attendanceBody.branchId,
    employee: attendanceBody.employee,
    date: attendanceDate,
  });

  if (existingAttendance) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Attendance already marked for this date');
  }

  attendanceBody.date = attendanceDate;

  // Calculate working hours if checkIn and checkOut exist
  if (attendanceBody.checkIn && attendanceBody.checkOut) {
    const checkIn = new Date(attendanceBody.checkIn);
    const checkOut = new Date(attendanceBody.checkOut);
    const hours = (checkOut - checkIn) / (1000 * 60 * 60); // Convert to hours
    attendanceBody.workingHours = Math.max(0, hours);
  }
  
  return Attendance.create(attendanceBody);
};

const queryAttendances = async (filter, options) => {
  const attendances = await Attendance.paginate(filter, options);
  return attendances;
};

const getAttendanceById = async (id) => {
  const attendance = await Attendance.findById(id).populate('employee').populate('shift');
  return attendance;
};

const updateAttendanceById = async (attendanceId, updateBody) => {
  const attendance = await getAttendanceById(attendanceId);
  if (!attendance) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Attendance not found');
  }
  
  // Recalculate working hours if check times are updated
  if ((updateBody.checkIn || updateBody.checkOut) && (attendance.checkIn || attendance.checkOut)) {
    const checkIn = new Date(updateBody.checkIn || attendance.checkIn);
    const checkOut = new Date(updateBody.checkOut || attendance.checkOut);
    const hours = (checkOut - checkIn) / (1000 * 60 * 60);
    updateBody.workingHours = Math.max(0, hours);
  }
  
  Object.assign(attendance, updateBody);
  await attendance.save();
  return attendance;
};

const deleteAttendanceById = async (attendanceId) => {
  const attendance = await getAttendanceById(attendanceId);
  if (!attendance) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Attendance not found');
  }
  await attendance.deleteOne();
  return attendance;
};

const markCheckIn = async (employeeId, locationData = {}) => {
  const employeeFilter = { _id: employeeId };
  if (locationData.organizationId) employeeFilter.organizationId = locationData.organizationId;
  if (locationData.branchId) employeeFilter.branchId = locationData.branchId;
  const employee = await Employee.findOne(employeeFilter);
  if (!employee) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Employee not found');
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const existingAttendance = await Attendance.findOne({
    organizationId: locationData.organizationId || employee.organizationId,
    branchId: locationData.branchId || employee.branchId,
    employee: employeeId,
    date: today,
  });
  
  if (existingAttendance && existingAttendance.checkIn) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Already checked in for today');
  }

  const approvedLeave = await getApprovedLeaveForDate(
    employeeId,
    today,
    { organizationId: locationData.organizationId || employee.organizationId, branchId: locationData.branchId || employee.branchId },
  );
  if (approvedLeave) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Employee is on approved leave for this date');
  }
  
  const attendanceData = {
    organizationId: locationData.organizationId || employee.organizationId,
    branchId: locationData.branchId || employee.branchId,
    employee: employeeId,
    date: today,
    checkIn: new Date(),
    status: 'Present',
    shift: employee.shift,
    ...locationData,
  };
  
  if (existingAttendance) {
    Object.assign(existingAttendance, attendanceData);
    await existingAttendance.save();
    await existingAttendance.populate('employee shift');
    return existingAttendance;
  }
  
  const newAttendance = await Attendance.create(attendanceData);
  await newAttendance.populate('employee shift');
  return newAttendance;
};

const markCheckOut = async (employeeId) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const attendance = await Attendance.findOne({
    employee: employeeId,
    date: today,
  });
  
  if (!attendance) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No check-in found for today');
  }
  
  if (attendance.checkOut) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Already checked out for today');
  }
  
  attendance.checkOut = new Date();
  
  // Calculate working hours
  if (attendance.checkIn) {
    const hours = (attendance.checkOut - attendance.checkIn) / (1000 * 60 * 60);
    attendance.workingHours = Math.max(0, hours);
  }
  
  await attendance.save();
  await attendance.populate('employee shift');
  return attendance;
};

const getEmployeeAttendance = async (employeeId, startDate, endDate) => {
  return Attendance.find({
    employee: employeeId,
    date: { $gte: startDate, $lte: endDate },
  }).sort({ date: -1 });
};

const getMonthlyAttendanceReport = async (month, year) => {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  
  return Attendance.find({
    date: { $gte: startDate, $lte: endDate },
  }).populate('employee');
};

const getApprovedLeaveForDate = async (employeeId, date, scope = {}) => {
  const dayStart = normalizeDateOnly(date);
  const dayEnd = new Date(dayStart);
  dayEnd.setHours(23, 59, 59, 999);

  const filter = {
    employee: employeeId,
    status: 'Approved',
    startDate: { $lte: dayEnd },
    endDate: { $gte: dayStart },
  };
  if (scope.organizationId) filter.organizationId = scope.organizationId;
  if (scope.branchId) filter.branchId = scope.branchId;

  return Leave.findOne(filter);
};

const getPendingLeaveForDate = async (employeeId, date, scope = {}) => {
  const dayStart = normalizeDateOnly(date);
  const dayEnd = new Date(dayStart);
  dayEnd.setHours(23, 59, 59, 999);

  const filter = {
    employee: employeeId,
    status: 'Pending',
    startDate: { $lte: dayEnd },
    endDate: { $gte: dayStart },
  };
  if (scope.organizationId) filter.organizationId = scope.organizationId;
  if (scope.branchId) filter.branchId = scope.branchId;

  return Leave.findOne(filter);
};

const formatDateKey = (date) => {
  const d = normalizeDateOnly(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const markAttendanceStatus = async (body, scope = {}) => {
  const employee = await Employee.findOne({
    _id: body.employee,
    organizationId: scope.organizationId || body.organizationId,
    branchId: scope.branchId || body.branchId,
  });
  if (!employee) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Employee not found');
  }

  const attendanceDate = normalizeDateOnly(body.date || new Date());
  const filter = {
    organizationId: scope.organizationId || employee.organizationId,
    branchId: scope.branchId || employee.branchId,
    employee: body.employee,
    date: attendanceDate,
  };

  let status = body.status || 'Present';
  const approvedLeave = await getApprovedLeaveForDate(body.employee, attendanceDate, scope);
  const pendingLeave = await getPendingLeaveForDate(body.employee, attendanceDate, scope);
  const explicitStatuses = ['Absent', 'Late', 'Half-Day', 'On Leave', 'Holiday'];
  if (approvedLeave && !explicitStatuses.includes(status)) {
    status = approvedLeave.isHalfDay ? 'Half-Day' : 'On Leave';
  } else if (pendingLeave && !explicitStatuses.includes(status)) {
    status = pendingLeave.isHalfDay ? 'Half-Day' : 'Absent';
  }

  const update = {
    status,
    notes: body.notes || '',
    shift: employee.shift,
    location: body.location || 'Office',
  };

  if (body.checkIn) update.checkIn = body.checkIn;
  if (body.checkOut) update.checkOut = body.checkOut;

  const existing = await Attendance.findOne(filter);
  if (existing) {
    Object.assign(existing, update);
    if (existing.checkIn && existing.checkOut) {
      const hours = (new Date(existing.checkOut) - new Date(existing.checkIn)) / (1000 * 60 * 60);
      existing.workingHours = Math.max(0, hours);
    }
    await existing.save();
    await existing.populate('employee shift');
    return existing;
  }

  const created = await Attendance.create({
    ...filter,
    ...update,
  });
  await created.populate('employee shift');
  return created;
};

const markBulkAttendance = async (records, scope = {}) => {
  if (!Array.isArray(records) || records.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No attendance records provided');
  }

  const results = [];
  const syncKeys = new Set();
  for (const record of records) {
    const saved = await markAttendanceStatus(
      {
        employee: record.employee,
        date: record.date,
        status: record.status || 'Present',
        notes: record.notes,
        location: record.location,
      },
      scope,
    );
    results.push(saved);
    const d = normalizeDateOnly(record.date);
    syncKeys.add(`${record.employee}:${d.getFullYear()}:${d.getMonth() + 1}`);
  }

  for (const key of syncKeys) {
    const [employeeId, year, month] = key.split(':');
    await payrollService.syncPayrollForMonth(
      employeeId,
      Number(month),
      Number(year),
      scope.userId,
      scope,
    );
  }

  return { count: results.length, results };
};

const getDailyAttendanceSummary = async (date, scope = {}) => {
  const attendanceDate = normalizeDateOnly(date);
  const nextDay = new Date(attendanceDate);
  nextDay.setDate(nextDay.getDate() + 1);

  const employeeFilter = { employmentStatus: 'Active' };
  if (scope.organizationId) employeeFilter.organizationId = scope.organizationId;
  if (scope.branchId) employeeFilter.branchId = scope.branchId;

  const employees = await Employee.find(employeeFilter).select('_id');
  const employeeIds = employees.map((emp) => emp._id);

  const attendances = await Attendance.find({
    ...scope,
    employee: { $in: employeeIds },
    date: { $gte: attendanceDate, $lt: nextDay },
  });

  const dayEnd = new Date(attendanceDate);
  dayEnd.setHours(23, 59, 59, 999);
  const approvedLeaves = await Leave.find({
    ...scope,
    employee: { $in: employeeIds },
    status: { $in: ['Approved', 'Pending'] },
    startDate: { $lte: dayEnd },
    endDate: { $gte: attendanceDate },
  });

  const attendanceMap = new Map(attendances.map((record) => [String(record.employee), record]));
  const leaveMap = new Map(approvedLeaves.map((leave) => [String(leave.employee), leave]));

  const summary = {
    totalEmployees: employeeIds.length,
    present: 0,
    absent: 0,
    late: 0,
    onLeave: 0,
    halfDay: 0,
    holiday: 0,
  };

  employeeIds.forEach((employeeId) => {
    const record = attendanceMap.get(String(employeeId));
    const leave = leaveMap.get(String(employeeId));
    const status = resolveDayStatus(record, leave);

    switch (status) {
      case 'Absent':
        summary.absent += 1;
        break;
      case 'Late':
        summary.late += 1;
        summary.present += 1;
        break;
      case 'On Leave':
        summary.onLeave += 1;
        break;
      case 'Half-Day':
        summary.halfDay += 1;
        break;
      case 'Holiday':
        summary.holiday += 1;
        break;
      default:
        summary.present += 1;
        break;
    }
  });

  return summary;
};

const computeEmployeeAttendanceStats = async (employeeId, periodStart, periodEnd, scope = {}) => {
  const employee = await Employee.findById(employeeId);
  if (!employee) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Employee not found');
  }

  const startDate = normalizeDateOnly(periodStart);
  const endDate = normalizeDateOnly(periodEnd);
  endDate.setHours(23, 59, 59, 999);

  const attendances = await Attendance.find({
    employee: employeeId,
    date: { $gte: startDate, $lte: endDate },
  });

  const { Leave } = require('../models');
  const leaves = await Leave.find({
    employee: employeeId,
    status: { $in: ['Approved', 'Pending'] },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  });

  return computeAttendanceStatsFromData({
    periodStart: startDate,
    periodEnd: endDate,
    joiningDate: employee.joiningDate,
    attendances,
    leaves,
  });
};

const getEmployeeDailyBreakdown = async (employeeId, month, year, scope = {}) => {
  const employee = await Employee.findById(employeeId);
  if (!employee) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Employee not found');
  }

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

  let effectiveStart = normalizeDateOnly(monthStart);
  if (employee.joiningDate) {
    const joining = normalizeDateOnly(employee.joiningDate);
    if (joining > effectiveStart) effectiveStart = joining;
  }

  const attendances = await Attendance.find({
    employee: employeeId,
    date: { $gte: monthStart, $lte: monthEnd },
  });

  const leaves = await Leave.find({
    employee: employeeId,
    status: { $in: ['Approved', 'Pending'] },
    startDate: { $lte: monthEnd },
    endDate: { $gte: monthStart },
  });

  const stats = computeAttendanceStatsFromData({
    periodStart: monthStart,
    periodEnd: monthEnd,
    joiningDate: employee.joiningDate,
    attendances,
    leaves,
  });

  const attendanceMap = new Map();
  attendances.forEach((record) => {
    attendanceMap.set(normalizeDateOnly(record.date).getTime(), record);
  });

  const leaveOnDate = new Map();
  leaves
    .filter((leave) => leave.status === 'Approved')
    .forEach((leave) => {
      const overlapStart = normalizeDateOnly(leave.startDate) > effectiveStart
        ? normalizeDateOnly(leave.startDate)
        : effectiveStart;
      const overlapEnd = normalizeDateOnly(leave.endDate) < monthEnd
        ? normalizeDateOnly(leave.endDate)
        : monthEnd;
      eachDateInRange(overlapStart, overlapEnd).forEach((date) => {
        leaveOnDate.set(date.getTime(), leave);
      });
    });
  leaves
    .filter((leave) => leave.status === 'Pending')
    .forEach((leave) => {
      const overlapStart = normalizeDateOnly(leave.startDate) > effectiveStart
        ? normalizeDateOnly(leave.startDate)
        : effectiveStart;
      const overlapEnd = normalizeDateOnly(leave.endDate) < monthEnd
        ? normalizeDateOnly(leave.endDate)
        : monthEnd;
      eachDateInRange(overlapStart, overlapEnd).forEach((date) => {
        if (!leaveOnDate.has(date.getTime())) {
          leaveOnDate.set(date.getTime(), leave);
        }
      });
    });

  const days = eachDateInRange(effectiveStart, monthEnd).map((date) => {
    const record = attendanceMap.get(date.getTime());
    const leave = leaveOnDate.get(date.getTime());
    const status = resolveDayStatus(record, leave);
    return {
      date: formatDateKey(date),
      status,
      checkIn: record?.checkIn || null,
      checkOut: record?.checkOut || null,
      workingHours: Number(record?.workingHours || 0),
      overtime: Number(record?.overtime || 0),
      leaveType: leave?.leaveType || null,
      leaveStatus: leave?.status || null,
    };
  });

  return {
    employee: {
      id: employee._id?.toString() || employee.id,
      name: `${employee.firstName} ${employee.lastName}`.trim(),
      employeeId: employee.employeeId,
    },
    month,
    year,
    stats,
    days,
  };
};

module.exports = {
  createAttendance,
  queryAttendances,
  getAttendanceById,
  updateAttendanceById,
  deleteAttendanceById,
  markCheckIn,
  markCheckOut,
  getEmployeeAttendance,
  getMonthlyAttendanceReport,
  markAttendanceStatus,
  markBulkAttendance,
  getDailyAttendanceSummary,
  computeEmployeeAttendanceStats,
  getEmployeeDailyBreakdown,
};
