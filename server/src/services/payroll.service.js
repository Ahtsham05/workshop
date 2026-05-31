const httpStatus = require('http-status');
const { Payroll, Employee, Attendance, Leave, EmployeeLedger } = require('../models');
const ApiError = require('../utils/ApiError');
const employeeLedgerService = require('./employeeLedger.service');

const getOverlappingLeaveDays = (leave, periodStart, periodEnd) => {
  const leaveStart = new Date(leave.startDate);
  const leaveEnd = new Date(leave.endDate);
  const overlapStart = leaveStart > periodStart ? leaveStart : periodStart;
  const overlapEnd = leaveEnd < periodEnd ? leaveEnd : periodEnd;

  if (overlapStart > overlapEnd) return 0;

  const diffTime = overlapEnd.getTime() - overlapStart.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  if (leave.isHalfDay) return Math.min(0.5, diffDays);
  return diffDays;
};

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
  await employeeLedgerService.upsertSalaryPayableFromPayroll(
    payroll,
    payroll.updatedBy || payroll.processedBy || payroll.createdBy
  );
  return payroll;
};

const deletePayrollById = async (payrollId) => {
  const payroll = await getPayrollById(payrollId);
  if (!payroll) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Payroll not found');
  }
  await payroll.deleteOne();
  return payroll;
};

const generatePayroll = async (employeeId, month, year, processedBy, scope = {}) => {
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
  
  const leaveDays = leaves.reduce((sum, leave) => sum + getOverlappingLeaveDays(leave, startDate, endDate), 0);
  
  // Calculate overtime
  const overtimeHours = attendances.reduce((sum, a) => sum + (a.overtime || 0), 0);
  
  // Calculate salary components
  const basicSalary = employee.salary.basicSalary;
  const perDaySalary = basicSalary / daysInMonth;
  const absentDeduction = perDaySalary * absentDays;
  const leaveDeduction = perDaySalary * leaveDays;
  const currentLedgerSummary = await employeeLedgerService.getEmployeeLedgerSummary(employeeId, {
    organizationId: scope.organizationId || employee.organizationId,
    branchId: scope.branchId || employee.branchId,
  });
  const carryForwardAdvance = Math.max(0, -Number(currentLedgerSummary.currentBalance || 0));
  
  const payrollData = {
    organizationId: scope.organizationId || employee.organizationId,
    branchId: scope.branchId || employee.branchId,
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
      other: leaveDeduction,
      advance: carryForwardAdvance,
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
  payrollData.netSalary = Math.max(0, payrollData.grossSalary - totalDeductions);
  
  const payroll = await Payroll.create(payrollData);
  await employeeLedgerService.upsertSalaryPayableFromPayroll(payroll, processedBy);
  return payroll;
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

const markPayrollPaid = async (payrollId, paymentDate, paymentMethod, amount) => {
  const payroll = await getPayrollById(payrollId);
  if (!payroll) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Payroll not found');
  }

  const paidAmount = Number(amount || 0);
  if (paidAmount <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payment amount must be greater than 0');
  }

  const payableAmount = Number(payroll.netSalary || 0);
  const salaryPaymentAmount = Math.min(paidAmount, payableAmount);
  const advanceAmount = Math.max(0, paidAmount - payableAmount);

  payroll.status = salaryPaymentAmount >= payableAmount ? 'Paid' : 'Processed';
  payroll.paymentDate = paymentDate;
  payroll.paymentMethod = paymentMethod;
  await payroll.save();
  await employeeLedgerService.upsertSalaryPaymentFromPayroll(
    payroll,
    paymentDate,
    paymentMethod,
    payroll.processedBy || payroll.updatedBy || payroll.createdBy,
    salaryPaymentAmount
  );
  await employeeLedgerService.upsertAdvancePaymentFromPayroll(
    payroll,
    paymentDate,
    paymentMethod,
    payroll.processedBy || payroll.updatedBy || payroll.createdBy,
    advanceAmount
  );
  return payroll;
};

const getEmployeeMonthlyPayrollSummary = async (employeeId, year, scope = {}) => {
  const employee = await Employee.findById(employeeId);
  if (!employee) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Employee not found');
  }

  const tenantFilter = {};
  if (scope.organizationId) tenantFilter.organizationId = scope.organizationId;
  if (scope.branchId) tenantFilter.branchId = scope.branchId;

  const entriesBeforeYear = await EmployeeLedger.find({
    employee: employeeId,
    ...tenantFilter,
    transactionDate: { $lt: new Date(year, 0, 1) },
  }).sort({ transactionDate: 1, createdAt: 1 });

  let runningBalance = 0;
  entriesBeforeYear.forEach((entry) => {
    runningBalance += Number(entry.debit || 0) - Number(entry.credit || 0);
  });

  const months = [];

  for (let month = 1; month <= 12; month += 1) {
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
    const daysInMonth = monthEnd.getDate();

    const payroll = await Payroll.findOne({
      employee: employeeId,
      month,
      year,
      ...tenantFilter,
    });

    const ledgerEntries = await EmployeeLedger.find({
      employee: employeeId,
      ...tenantFilter,
      transactionDate: { $gte: monthStart, $lte: monthEnd },
    }).sort({ transactionDate: 1, createdAt: 1 });

    const openingBalance = runningBalance;
    const overpaymentFromPreviousMonth = Math.max(0, -openingBalance);

    let workingDays = daysInMonth;
    let presentDays = 0;
    let absentDays = 0;
    let leaveDays = 0;

    if (payroll) {
      workingDays = payroll.workingDays || daysInMonth;
      presentDays = payroll.presentDays || 0;
      absentDays = payroll.absentDays || 0;
      leaveDays = payroll.leaveDays || 0;
    } else {
      const attendances = await Attendance.find({
        employee: employeeId,
        date: { $gte: monthStart, $lte: monthEnd },
      });
      presentDays = attendances.filter((a) => a.status === 'Present' || a.status === 'Late').length;
      absentDays = attendances.filter((a) => a.status === 'Absent').length;

      const leaves = await Leave.find({
        employee: employeeId,
        status: 'Approved',
        startDate: { $lte: monthEnd },
        endDate: { $gte: monthStart },
      });
      leaveDays = leaves.reduce(
        (sum, leave) => sum + getOverlappingLeaveDays(leave, monthStart, monthEnd),
        0,
      );
    }

    const payableFromLedger = ledgerEntries
      .filter((entry) => entry.transactionType === 'salary_payable')
      .reduce((sum, entry) => sum + Number(entry.debit || 0), 0);

    const grossSalary = payroll
      ? Number(payroll.grossSalary || 0)
      : Number(employee.salary?.basicSalary || 0) + Number(employee.salary?.allowances || 0);

    const totalSalary = payroll ? Number(payroll.netSalary || 0) : payableFromLedger;

    const salaryPaid = ledgerEntries
      .filter((entry) => entry.transactionType === 'salary_payment')
      .reduce((sum, entry) => sum + Number(entry.credit || 0), 0);

    const advancePaid = ledgerEntries
      .filter((entry) => entry.transactionType === 'advance_payment')
      .reduce((sum, entry) => sum + Number(entry.credit || 0), 0);

    const advanceDeduction = payroll ? Number(payroll.deductions?.advance || 0) : 0;

    ledgerEntries.forEach((entry) => {
      runningBalance += Number(entry.debit || 0) - Number(entry.credit || 0);
    });

    const closingBalance = runningBalance;
    const totalPaid = salaryPaid + advancePaid;
    const remainingPayable = Math.max(0, closingBalance);
    const extraPaidThisMonth = Math.max(
      0,
      totalPaid - Math.max(0, totalSalary - overpaymentFromPreviousMonth),
    );

    months.push({
      month,
      year,
      payrollId: payroll?._id?.toString() || payroll?.id || null,
      status: payroll?.status || (totalSalary > 0 || totalPaid > 0 ? 'Ledger Only' : 'No Record'),
      grossSalary,
      totalSalary,
      salaryPaid,
      advancePaid,
      totalPaid,
      advanceDeduction,
      overpaymentFromPreviousMonth,
      extraPaidThisMonth,
      overpaymentToNextMonth: Math.max(0, -closingBalance),
      workingDays,
      presentDays,
      absentDays,
      leaveDays,
      openingBalance,
      closingBalance,
      remainingPayable,
      hasActivity: Boolean(payroll || ledgerEntries.length > 0 || presentDays > 0 || absentDays > 0),
    });
  }

  return {
    employee: {
      id: employee._id?.toString() || employee.id,
      employeeId: employee.employeeId,
      name: `${employee.firstName} ${employee.lastName}`.trim(),
      basicSalary: Number(employee.salary?.basicSalary || 0),
    },
    year,
    months,
    currentBalance: runningBalance,
  };
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
  getEmployeeMonthlyPayrollSummary,
};
