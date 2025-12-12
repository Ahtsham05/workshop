const httpStatus = require('http-status');
const { Payroll, Employee, Attendance, Leave } = require('../models');
const ApiError = require('../utils/ApiError');

const createPayroll = async (payrollBody) => {
  const employee = await Employee.findById(payrollBody.employee);
  if (!employee) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Employee not found');
  }
  
  // Check if payroll already exists for this month
  const existingPayroll = await Payroll.findOne({
    employee: payrollBody.employee,
    month: payrollBody.month,
    year: payrollBody.year,
  });
  
  if (existingPayroll) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payroll already exists for this month');
  }
  
  // Calculate totals
  const totalAllowances = Object.values(payrollBody.allowances || {}).reduce((sum, val) => sum + (val || 0), 0);
  const totalDeductions = Object.values(payrollBody.deductions || {}).reduce((sum, val) => sum + (val || 0), 0);
  
  payrollBody.totalAllowances = totalAllowances;
  payrollBody.totalDeductions = totalDeductions;
  payrollBody.grossSalary = payrollBody.basicSalary + totalAllowances;
  payrollBody.netSalary = payrollBody.grossSalary - totalDeductions;
  
  return Payroll.create(payrollBody);
};

const queryPayrolls = async (filter, options) => {
  const payrolls = await Payroll.paginate(filter, options);
  return payrolls;
};

const getPayrollById = async (id) => {
  const payroll = await Payroll.findById(id).populate('employee').populate('processedBy');
  return payroll;
};

const updatePayrollById = async (payrollId, updateBody) => {
  const payroll = await getPayrollById(payrollId);
  if (!payroll) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Payroll not found');
  }
  
  // Recalculate totals if allowances or deductions are updated
  if (updateBody.allowances || updateBody.deductions || updateBody.basicSalary) {
    const allowances = updateBody.allowances || payroll.allowances;
    const deductions = updateBody.deductions || payroll.deductions;
    const basicSalary = updateBody.basicSalary || payroll.basicSalary;
    
    const totalAllowances = Object.values(allowances).reduce((sum, val) => sum + (val || 0), 0);
    const totalDeductions = Object.values(deductions).reduce((sum, val) => sum + (val || 0), 0);
    
    updateBody.totalAllowances = totalAllowances;
    updateBody.totalDeductions = totalDeductions;
    updateBody.grossSalary = basicSalary + totalAllowances;
    updateBody.netSalary = updateBody.grossSalary - totalDeductions;
  }
  
  Object.assign(payroll, updateBody);
  await payroll.save();
  return payroll;
};

const deletePayrollById = async (payrollId) => {
  const payroll = await getPayrollById(payrollId);
  if (!payroll) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Payroll not found');
  }
  await payroll.remove();
  return payroll;
};

const generatePayroll = async (employeeId, month, year, processedBy) => {
  const employee = await Employee.findById(employeeId);
  if (!employee) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Employee not found');
  }
  
  // Check if payroll already exists
  const existingPayroll = await Payroll.findOne({
    employee: employeeId,
    month,
    year,
  });
  
  if (existingPayroll) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payroll already exists for this month');
  }
  
  // Get attendance data for the month
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  const daysInMonth = endDate.getDate();
  
  const attendances = await Attendance.find({
    employee: employeeId,
    date: { $gte: startDate, $lte: endDate },
  });
  
  const presentDays = attendances.filter(a => a.status === 'Present' || a.status === 'Late').length;
  const absentDays = attendances.filter(a => a.status === 'Absent').length;
  
  // Get leave data
  const leaves = await Leave.find({
    employee: employeeId,
    status: 'Approved',
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  });
  
  const leaveDays = leaves.reduce((sum, leave) => sum + leave.totalDays, 0);
  
  // Calculate overtime
  const overtimeHours = attendances.reduce((sum, a) => sum + (a.overtime || 0), 0);
  
  // Calculate salary components
  const basicSalary = employee.salary.basicSalary;
  const perDaySalary = basicSalary / daysInMonth;
  const absentDeduction = perDaySalary * absentDays;
  
  const payrollData = {
    employee: employeeId,
    month,
    year,
    basicSalary,
    allowances: {
      houseRent: employee.salary.allowances || 0,
      overtime: overtimeHours * 100, // 100 per hour overtime
    },
    deductions: {
      absent: absentDeduction,
    },
    workingDays: daysInMonth,
    presentDays,
    absentDays,
    leaveDays,
    overtimeHours,
    status: 'Pending',
    processedBy,
  };
  
  // Calculate totals
  const totalAllowances = Object.values(payrollData.allowances).reduce((sum, val) => sum + (val || 0), 0);
  const totalDeductions = Object.values(payrollData.deductions).reduce((sum, val) => sum + (val || 0), 0);
  
  payrollData.totalAllowances = totalAllowances;
  payrollData.totalDeductions = totalDeductions;
  payrollData.grossSalary = basicSalary + totalAllowances;
  payrollData.netSalary = payrollData.grossSalary - totalDeductions;
  
  return Payroll.create(payrollData);
};

const processPayroll = async (payrollId, processedBy) => {
  const payroll = await getPayrollById(payrollId);
  if (!payroll) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Payroll not found');
  }
  
  if (payroll.status !== 'Pending') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payroll is not in pending status');
  }
  
  payroll.status = 'Processed';
  payroll.processedBy = processedBy;
  await payroll.save();
  return payroll;
};

const markPayrollPaid = async (payrollId, paymentDate, paymentMethod) => {
  const payroll = await getPayrollById(payrollId);
  if (!payroll) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Payroll not found');
  }
  
  payroll.status = 'Paid';
  payroll.paymentDate = paymentDate;
  payroll.paymentMethod = paymentMethod;
  await payroll.save();
  return payroll;
};

module.exports = {
  createPayroll,
  queryPayrolls,
  getPayrollById,
  updatePayrollById,
  deletePayrollById,
  generatePayroll,
  processPayroll,
  markPayrollPaid,
};
