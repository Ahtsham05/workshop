const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { leaveService, payrollService } = require('../services');
const { Employee } = require('../models');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const createLeave = catchAsync(async (req, res) => {
  const leave = await leaveService.createLeave({ ...req.body, ...getBranchContext(req) });
  res.status(httpStatus.CREATED).send(leave);
});

const getLeaves = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['employee', 'leaveType', 'status', 'startDate', 'endDate']);
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
  if (req.query.startDate || req.query.endDate) {
    delete filter.startDate;
    delete filter.endDate;

    if (req.query.startDate) {
      const rangeStart = new Date(req.query.startDate);
      rangeStart.setHours(0, 0, 0, 0);
      filter.endDate = { $gte: rangeStart };
    }
    if (req.query.endDate) {
      const rangeEnd = new Date(req.query.endDate);
      rangeEnd.setHours(23, 59, 59, 999);
      filter.startDate = { $lte: rangeEnd };
    }
  }
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  options.populate = [
    { path: 'employee', select: 'firstName lastName employeeId salary' },
    { path: 'approvedBy', select: 'name email' },
  ];
  const result = await leaveService.queryLeaves(filter, options);

  if (result?.results?.length) {
    result.results = await Promise.all(
      result.results.map(async (leave) => {
        const plain = leave.toObject ? leave.toObject() : leave;
        const employeeDoc = plain.employee;
        const leaveId = plain.id || plain._id?.toString?.() || String(plain._id || '');
        let salaryImpact = { amount: 0, type: 'none', label: '-' };
        try {
          salaryImpact = await payrollService.computeLeaveSalaryImpact(plain, employeeDoc);
        } catch (err) {
          logger.warn(`Leave salary impact failed for ${leaveId}:`, err.message);
        }
        return {
          ...plain,
          id: leaveId,
          salaryImpact,
        };
      })
    );
  }

  res.send(result);
});

const getLeave = catchAsync(async (req, res) => {
  const leave = await leaveService.getLeaveById(req.params.leaveId);
  if (!leave) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Leave not found');
  }
  res.send(leave);
});

const updateLeave = catchAsync(async (req, res) => {
  const leave = await leaveService.updateLeaveById(req.params.leaveId, req.body);
  res.send(leave);
});

const deleteLeave = catchAsync(async (req, res) => {
  await leaveService.deleteLeaveById(req.params.leaveId);
  res.status(httpStatus.NO_CONTENT).send();
});

const approveLeave = catchAsync(async (req, res) => {
  const leave = await leaveService.approveLeave(req.params.leaveId, req.user.id);
  res.send(leave);
});

const rejectLeave = catchAsync(async (req, res) => {
  const leave = await leaveService.rejectLeave(req.params.leaveId, req.body.rejectionReason, req.user.id);
  res.send(leave);
});

const cancelLeave = catchAsync(async (req, res) => {
  const leave = await leaveService.cancelLeave(req.params.leaveId);
  res.send(leave);
});

const getEmployeeLeaves = catchAsync(async (req, res) => {
  const leaves = await leaveService.getEmployeeLeaves(req.params.employeeId, req.query.status);
  res.send(leaves);
});

const getLeaveBalance = catchAsync(async (req, res) => {
  const balance = await leaveService.getLeaveBalance(req.params.employeeId, req.params.leaveType);
  res.send(balance);
});

module.exports = {
  createLeave,
  getLeaves,
  getLeave,
  updateLeave,
  deleteLeave,
  approveLeave,
  rejectLeave,
  cancelLeave,
  getEmployeeLeaves,
  getLeaveBalance,
};
