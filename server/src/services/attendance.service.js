const httpStatus = require('http-status');
const { Attendance, Employee } = require('../models');
const ApiError = require('../utils/ApiError');

const createAttendance = async (attendanceBody) => {
  const employee = await Employee.findById(attendanceBody.employee);
  if (!employee) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Employee not found');
  }
  
  // Check if attendance already exists for this date
  const existingAttendance = await Attendance.findOne({
    employee: attendanceBody.employee,
    date: attendanceBody.date,
  });
  
  if (existingAttendance) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Attendance already marked for this date');
  }
  
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
  await attendance.remove();
  return attendance;
};

const markCheckIn = async (employeeId, locationData = {}) => {
  const employee = await Employee.findById(employeeId);
  if (!employee) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Employee not found');
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const existingAttendance = await Attendance.findOne({
    employee: employeeId,
    date: today,
  });
  
  if (existingAttendance && existingAttendance.checkIn) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Already checked in for today');
  }
  
  const attendanceData = {
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
    return existingAttendance;
  }
  
  return Attendance.create(attendanceData);
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
};
