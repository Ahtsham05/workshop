const httpStatus = require('http-status');
const { Leave, Employee, Attendance } = require('../models');
const ApiError = require('../utils/ApiError');
const payrollService = require('./payroll.service');

const AUTO_LEAVE_SYNC_NOTE = '[AUTO_LEAVE_SYNC]';

const normalizeDateOnly = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const eachDateInRange = (startDate, endDate) => {
  const dates = [];
  const cursor = normalizeDateOnly(startDate);
  const end = normalizeDateOnly(endDate);
  while (cursor <= end) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

const syncAttendanceForApprovedLeave = async (leave) => {
  const dates = eachDateInRange(leave.startDate, leave.endDate);
  for (const date of dates) {
    const existing = await Attendance.findOne({
      organizationId: leave.organizationId,
      branchId: leave.branchId,
      employee: leave.employee,
      date,
    });

    if (!existing) {
      await Attendance.create({
        organizationId: leave.organizationId,
        branchId: leave.branchId,
        employee: leave.employee,
        date,
        status: leave.isHalfDay ? 'Half-Day' : 'On Leave',
        notes: AUTO_LEAVE_SYNC_NOTE,
      });
      continue;
    }

    // Approved leave always overrides Present/Late unless employee has check-in/out.
    if (existing.checkIn || existing.checkOut) continue;
    existing.status = leave.isHalfDay ? 'Half-Day' : 'On Leave';
    existing.notes = existing.notes ? `${existing.notes} ${AUTO_LEAVE_SYNC_NOTE}` : AUTO_LEAVE_SYNC_NOTE;
    await existing.save();
  }
};

const cleanupAttendanceForLeave = async (leave) => {
  const dates = eachDateInRange(leave.startDate, leave.endDate);
  for (const date of dates) {
    const existing = await Attendance.findOne({
      organizationId: leave.organizationId,
      branchId: leave.branchId,
      employee: leave.employee,
      date,
    });
    if (!existing || existing.checkIn || existing.checkOut) continue;
    if (!String(existing.notes || '').includes(AUTO_LEAVE_SYNC_NOTE)) continue;

    const cleanedNotes = String(existing.notes || '').replace(AUTO_LEAVE_SYNC_NOTE, '').trim();
    if (cleanedNotes.length === 0) {
      await existing.deleteOne();
    } else {
      existing.notes = cleanedNotes;
      existing.status = 'Present';
      await existing.save();
    }
  }
};

const createLeave = async (leaveBody) => {
  const employee = await Employee.findOne({
    _id: leaveBody.employee,
    organizationId: leaveBody.organizationId,
    branchId: leaveBody.branchId,
  });
  if (!employee) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Employee not found');
  }
  
  // Calculate total days
  const startDate = normalizeDateOnly(leaveBody.startDate);
  const endDate = normalizeDateOnly(leaveBody.endDate);
  if (endDate < startDate) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'End date must be after start date');
  }
  const diffTime = Math.abs(endDate - startDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  leaveBody.startDate = startDate;
  leaveBody.endDate = endDate;
  leaveBody.reason = String(leaveBody.reason || '').trim();
  leaveBody.totalDays = leaveBody.isHalfDay ? 0.5 : diffDays;

  const maxEndDate = new Date(startDate);
  maxEndDate.setDate(maxEndDate.getDate() + Math.max(0, Math.ceil(leaveBody.totalDays) - 1));
  if (endDate > maxEndDate && !leaveBody.isHalfDay) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'End date does not match the number of leave days');
  }
  
  // Check for overlapping leaves
  const overlappingLeave = await Leave.findOne({
    organizationId: leaveBody.organizationId,
    branchId: leaveBody.branchId,
    employee: leaveBody.employee,
    status: { $in: ['Pending', 'Approved'] },
    $or: [
      { startDate: { $lte: endDate }, endDate: { $gte: startDate } },
    ],
  });
  
  if (overlappingLeave) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Leave already exists for this period');
  }

  const leave = await Leave.create(leaveBody);
  await payrollService.syncPayrollForLeave(leave, leaveBody.createdBy);
  return leave;
};

const queryLeaves = async (filter, options) => {
  const leaves = await Leave.paginate(filter, options);
  return leaves;
};

const getLeaveById = async (id) => {
  const leave = await Leave.findById(id).populate('employee').populate('approvedBy');
  return leave;
};

const updateLeaveById = async (leaveId, updateBody) => {
  const leave = await getLeaveById(leaveId);
  if (!leave) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Leave not found');
  }
  
  // Recalculate total days if dates are updated
  if (updateBody.startDate || updateBody.endDate || typeof updateBody.isHalfDay === 'boolean') {
    const startDate = normalizeDateOnly(updateBody.startDate || leave.startDate);
    const endDate = normalizeDateOnly(updateBody.endDate || leave.endDate);
    if (endDate < startDate) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'End date must be after start date');
    }
    const diffTime = Math.abs(endDate - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    updateBody.startDate = startDate;
    updateBody.endDate = endDate;
    updateBody.totalDays = (typeof updateBody.isHalfDay === 'boolean' ? updateBody.isHalfDay : leave.isHalfDay) ? 0.5 : diffDays;
  }

  if (typeof updateBody.reason === 'string') {
    updateBody.reason = updateBody.reason.trim();
    if (!updateBody.reason) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Reason is required');
    }
  }
  
  const wasApproved = leave.status === 'Approved';
  const oldLeaveRange = { startDate: leave.startDate, endDate: leave.endDate };
  Object.assign(leave, updateBody);
  await leave.save();
  if (wasApproved && (updateBody.startDate || updateBody.endDate || typeof updateBody.isHalfDay === 'boolean')) {
    await cleanupAttendanceForLeave({ ...leave.toObject(), ...oldLeaveRange });
    await syncAttendanceForApprovedLeave(leave);
  }
  await payrollService.syncPayrollForLeave(leave, updateBody.updatedBy);
  return leave;
};

const deleteLeaveById = async (leaveId) => {
  const leave = await getLeaveById(leaveId);
  if (!leave) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Leave not found');
  }
  if (leave.status === 'Approved') {
    await cleanupAttendanceForLeave(leave);
  }
  await payrollService.syncPayrollForLeave(leave, null);
  await leave.deleteOne();
  return leave;
};

const approveLeave = async (leaveId, approvedBy) => {
  const leave = await getLeaveById(leaveId);
  if (!leave) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Leave not found');
  }
  
  if (leave.status !== 'Pending') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Leave is not in pending status');
  }
  
  leave.status = 'Approved';
  leave.approvedBy = approvedBy;
  leave.approvalDate = new Date();
  await leave.save();
  await syncAttendanceForApprovedLeave(leave);
  await payrollService.syncPayrollForLeave(leave, approvedBy);
  return leave;
};

const rejectLeave = async (leaveId, rejectionReason, _approvedBy) => {
  const leave = await getLeaveById(leaveId);
  if (!leave) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Leave not found');
  }

  if (leave.status !== 'Pending') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Leave is not in pending status');
  }

  leave.status = 'Rejected';
  leave.rejectionReason = rejectionReason;
  leave.approvedBy = null;
  leave.approvalDate = null;
  await leave.save();
  await payrollService.syncPayrollForLeave(leave, _approvedBy);
  return leave;
};

const cancelLeave = async (leaveId) => {
  const leave = await getLeaveById(leaveId);
  if (!leave) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Leave not found');
  }
  
  const wasApproved = leave.status === 'Approved';
  if (leave.status === 'Cancelled') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Leave is already cancelled');
  }
  
  leave.status = 'Cancelled';
  await leave.save();
  if (wasApproved) {
    await cleanupAttendanceForLeave(leave);
  }
  await payrollService.syncPayrollForLeave(leave, null);
  return leave;
};

const getEmployeeLeaves = async (employeeId, status = null) => {
  const filter = { employee: employeeId };
  if (status) {
    filter.status = status;
  }
  return Leave.find(filter).sort({ createdAt: -1 });
};

const getLeaveBalance = async (employeeId, leaveType) => {
  const currentYear = new Date().getFullYear();
  const startDate = new Date(currentYear, 0, 1);
  const endDate = new Date(currentYear, 11, 31);
  
  const leaves = await Leave.find({
    employee: employeeId,
    leaveType,
    status: 'Approved',
    startDate: { $gte: startDate, $lte: endDate },
  });
  
  const totalUsed = leaves.reduce((sum, leave) => sum + leave.totalDays, 0);
  
  // Define leave quotas (can be made configurable)
  const leaveQuotas = {
    Casual: 10,
    Sick: 10,
    Annual: 14,
    Emergency: 5,
  };
  
  const quota = leaveQuotas[leaveType] || 0;
  const balance = quota - totalUsed;
  
  return {
    leaveType,
    quota,
    used: totalUsed,
    balance: Math.max(0, balance),
  };
};

module.exports = {
  createLeave,
  queryLeaves,
  getLeaveById,
  updateLeaveById,
  deleteLeaveById,
  approveLeave,
  rejectLeave,
  cancelLeave,
  getEmployeeLeaves,
  getLeaveBalance,
};
