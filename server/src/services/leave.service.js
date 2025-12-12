const httpStatus = require('http-status');
const { Leave, Employee } = require('../models');
const ApiError = require('../utils/ApiError');

const createLeave = async (leaveBody) => {
  const employee = await Employee.findById(leaveBody.employee);
  if (!employee) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Employee not found');
  }
  
  // Calculate total days
  const startDate = new Date(leaveBody.startDate);
  const endDate = new Date(leaveBody.endDate);
  const diffTime = Math.abs(endDate - startDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  leaveBody.totalDays = leaveBody.isHalfDay ? 0.5 : diffDays;
  
  // Check for overlapping leaves
  const overlappingLeave = await Leave.findOne({
    employee: leaveBody.employee,
    status: { $in: ['Pending', 'Approved'] },
    $or: [
      { startDate: { $lte: endDate }, endDate: { $gte: startDate } },
    ],
  });
  
  if (overlappingLeave) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Leave already exists for this period');
  }
  
  return Leave.create(leaveBody);
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
  if (updateBody.startDate || updateBody.endDate) {
    const startDate = new Date(updateBody.startDate || leave.startDate);
    const endDate = new Date(updateBody.endDate || leave.endDate);
    const diffTime = Math.abs(endDate - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    updateBody.totalDays = updateBody.isHalfDay ? 0.5 : diffDays;
  }
  
  Object.assign(leave, updateBody);
  await leave.save();
  return leave;
};

const deleteLeaveById = async (leaveId) => {
  const leave = await getLeaveById(leaveId);
  if (!leave) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Leave not found');
  }
  await leave.remove();
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
  return leave;
};

const rejectLeave = async (leaveId, rejectionReason, approvedBy) => {
  const leave = await getLeaveById(leaveId);
  if (!leave) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Leave not found');
  }
  
  if (leave.status !== 'Pending') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Leave is not in pending status');
  }
  
  leave.status = 'Rejected';
  leave.rejectionReason = rejectionReason;
  leave.approvedBy = approvedBy;
  leave.approvalDate = new Date();
  await leave.save();
  return leave;
};

const cancelLeave = async (leaveId) => {
  const leave = await getLeaveById(leaveId);
  if (!leave) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Leave not found');
  }
  
  if (leave.status === 'Cancelled') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Leave is already cancelled');
  }
  
  leave.status = 'Cancelled';
  await leave.save();
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
