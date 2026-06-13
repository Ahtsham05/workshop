const httpStatus = require('http-status');
const { Payroll, Employee, Attendance, Leave, EmployeeLedger } = require('../models');
const ApiError = require('../utils/ApiError');
const employeeLedgerService = require('./employeeLedger.service');
const { computeAttendanceStatsFromData } = require('../utils/attendanceStats');

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

const getMonthsInRange = (startDate, endDate) => {
  const months = [];
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  while (cursor <= end) {
    months.push({ month: cursor.getMonth() + 1, year: cursor.getFullYear() });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
};

const calculatePayrollSnapshot = async (employee, month, year, scope = {}, options = {}) => {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);

  const attendances = await Attendance.find({
    employee: employee._id,
    date: { $gte: startDate, $lte: endDate },
  });

  const leaves = await Leave.find({
    employee: employee._id,
    status: { $in: ['Approved', 'Pending', 'Rejected'] },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  });

  const stats = computeAttendanceStatsFromData({
    periodStart: startDate,
    periodEnd: endDate,
    joiningDate: employee.joiningDate,
    attendances,
    leaves,
  });

  const basicSalary = Number(
    options.basicSalary ?? employee.salary?.basicSalary ?? 0
  );
  const perDaySalary = stats.workingDays > 0 ? basicSalary / stats.workingDays : 0;
  const absentDeduction = perDaySalary * stats.absentDays;
  const leaveDeduction = perDaySalary * stats.unpaidLeaveDays;
  const overtimeAllowance = stats.overtimeHours * 100;
  const allowances = {
    houseRent: Number(employee.salary?.allowances || 0),
    overtime: overtimeAllowance,
  };
  const totalAllowances = Object.values(allowances).reduce((sum, val) => sum + (val || 0), 0);
  const grossSalary = basicSalary + totalAllowances;

  return {
    ...stats,
    basicSalary,
    perDaySalary,
    absentDeduction,
    leaveDeduction,
    allowances,
    grossSalary,
    totalAllowances,
    notes: `Present: ${stats.presentDays}, Absent: ${stats.absentDays}, Leave: ${stats.leaveDays}, Pending leave (absent): ${stats.pendingLeaveDays}, Unpaid leave deduction days: ${stats.unpaidLeaveDays}`,
  };
};

const getBasicSalaryForMonth = async (employee, month, year) => {
  if (!employee) return 0;
  const payroll = await Payroll.findOne({
    employee: employee._id || employee.id,
    month,
    year,
  }).select('basicSalary');
  if (payroll?.basicSalary != null) {
    return Number(payroll.basicSalary);
  }
  return Number(employee?.salary?.basicSalary || 0);
};

const computeLeaveSalaryImpact = async (leave, employee) => {
  if (!employee) {
    return {
      amount: 0,
      type: 'none',
      label: '-',
    };
  }
  const startDate = new Date(leave.startDate);
  const endDate = new Date(leave.endDate);
  const months = getMonthsInRange(startDate, endDate);
  let totalAmount = 0;

  for (const { month, year } of months) {
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
    const overlapDays = getOverlappingLeaveDays(leave, monthStart, monthEnd);
    if (!overlapDays) continue;
    const basicSalary = await getBasicSalaryForMonth(employee, month, year);
    const workingDays = monthEnd.getDate();
    const perDaySalary = workingDays > 0 ? basicSalary / workingDays : 0;
    totalAmount += perDaySalary * overlapDays;
  }

  if (leave.status === 'Pending') {
    return {
      amount: totalAmount,
      type: 'deduction',
      label: 'Absent until approved',
    };
  }
  if (leave.status === 'Approved' && leave.leaveType === 'Unpaid') {
    return {
      amount: totalAmount,
      type: 'deduction',
      label: 'Salary deduction',
    };
  }
  if (leave.status === 'Approved') {
    return {
      amount: totalAmount,
      type: 'paid',
      label: 'Paid leave amount',
    };
  }
  if (leave.status === 'Rejected') {
    return {
      amount: totalAmount,
      type: 'deduction',
      label: 'Rejected — deducted from salary',
    };
  }
  return {
    amount: 0,
    type: 'none',
    label: '-',
  };
};

const syncPayrollForMonth = async (employeeId, month, year, userId, scope = {}) => {
  const tenantFilter = {};
  if (scope.organizationId) tenantFilter.organizationId = scope.organizationId;
  if (scope.branchId) tenantFilter.branchId = scope.branchId;

  const payroll = await Payroll.findOne({ employee: employeeId, month, year, ...tenantFilter });
  if (!payroll) return null;

  const employee = await Employee.findById(employeeId);
  if (!employee) return null;

  const lockedBasicSalary = Number(payroll.basicSalary ?? employee.salary?.basicSalary ?? 0);
  const snapshot = await calculatePayrollSnapshot(employee, month, year, scope, {
    basicSalary: lockedBasicSalary,
  });

  const deductions = {
    absent: snapshot.absentDeduction,
    other: snapshot.leaveDeduction,
    advance: Number(payroll.deductions?.advance || 0),
  };
  const totalDeductions = Object.values(deductions).reduce((sum, val) => sum + (val || 0), 0);

  // Keep the salary locked on this payroll record (do not overwrite with current employee salary).
  payroll.allowances = snapshot.allowances;
  payroll.deductions = deductions;
  payroll.workingDays = snapshot.workingDays;
  payroll.presentDays = snapshot.presentDays;
  payroll.absentDays = snapshot.absentDays;
  payroll.leaveDays = snapshot.leaveDays;
  payroll.overtimeHours = snapshot.overtimeHours;
  payroll.totalAllowances = snapshot.totalAllowances;
  payroll.totalDeductions = totalDeductions;
  payroll.grossSalary = snapshot.grossSalary;
  payroll.netSalary = Math.max(0, snapshot.grossSalary - totalDeductions);
  payroll.notes = snapshot.notes;
  payroll.updatedBy = userId;
  await payroll.save();
  await employeeLedgerService.upsertSalaryPayableFromPayroll(
    payroll,
    userId || payroll.processedBy || payroll.createdBy,
  );
  return payroll;
};

const syncPayrollForLeave = async (leave, userId) => {
  const months = getMonthsInRange(new Date(leave.startDate), new Date(leave.endDate));
  const scope = {
    organizationId: leave.organizationId,
    branchId: leave.branchId,
  };
  const results = [];
  for (const { month, year } of months) {
    const synced = await syncPayrollForMonth(leave.employee, month, year, userId, scope);
    if (synced) results.push(synced);
  }
  if (results.length > 0) {
    await employeeLedgerService.recalculateBalances(leave.employee);
  }
  return results;
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
  
  // Calculate payroll from live attendance + leave data
  const snapshot = await calculatePayrollSnapshot(employee, month, year, scope);
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
    basicSalary: snapshot.basicSalary,
    allowances: snapshot.allowances,
    deductions: {
      absent: snapshot.absentDeduction,
      other: snapshot.leaveDeduction,
      advance: carryForwardAdvance,
    },
    workingDays: snapshot.workingDays,
    presentDays: snapshot.presentDays,
    absentDays: snapshot.absentDays,
    leaveDays: snapshot.leaveDays,
    overtimeHours: snapshot.overtimeHours,
    status: 'Processed',
    processedBy,
    notes: snapshot.notes,
  };
  
  // Calculate totals
  const totalAllowances = Object.values(payrollData.allowances).reduce((sum, val) => sum + (val || 0), 0);
  const totalDeductions = Object.values(payrollData.deductions).reduce((sum, val) => sum + (val || 0), 0);
  
  payrollData.totalAllowances = totalAllowances;
  payrollData.totalDeductions = totalDeductions;
  payrollData.grossSalary = payrollData.basicSalary + totalAllowances;
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
    let pendingLeaveDays = 0;

    const basicSalaryForMonth = payroll?.basicSalary ?? employee.salary?.basicSalary;
    const snapshot = await calculatePayrollSnapshot(employee, month, year, tenantFilter, {
      basicSalary: basicSalaryForMonth,
    });
    workingDays = snapshot.workingDays;
    presentDays = snapshot.presentDays;
    absentDays = snapshot.absentDays;
    leaveDays = snapshot.leaveDays;
    pendingLeaveDays = snapshot.pendingLeaveDays;

    const payableFromLedger = ledgerEntries
      .filter((entry) => entry.transactionType === 'salary_payable')
      .reduce((sum, entry) => sum + Number(entry.debit || 0), 0);

    const grossSalary = snapshot.grossSalary;
    const advanceDeduction = payroll ? Number(payroll.deductions?.advance || 0) : 0;
    const absentDeduction = snapshot.absentDeduction;
    const leaveDeduction = snapshot.leaveDeduction;
    const paidLeaveAmount = snapshot.perDaySalary * (snapshot.paidLeaveDays || 0);
    const netFromSnapshot = Math.max(
      0,
      snapshot.grossSalary - snapshot.absentDeduction - snapshot.leaveDeduction - advanceDeduction,
    );
    const totalSalary = payroll ? netFromSnapshot : payableFromLedger;

    const salaryPaid = ledgerEntries
      .filter((entry) => entry.transactionType === 'salary_payment')
      .reduce((sum, entry) => sum + Number(entry.credit || 0), 0);

    const advancePaid = ledgerEntries
      .filter((entry) => entry.transactionType === 'advance_payment')
      .reduce((sum, entry) => sum + Number(entry.credit || 0), 0);

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
      pendingLeaveDays,
      absentDeduction,
      leaveDeduction,
      paidLeaveAmount,
      openingBalance,
      closingBalance,
      remainingPayable,
      hasActivity: Boolean(payroll || ledgerEntries.length > 0 || absentDays > 0 || leaveDays > 0),
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

const generateMonthlyPayrollForAll = async (month, year, processedBy = null) => {
  const employees = await Employee.find({ employmentStatus: 'Active' });
  const results = { created: 0, skipped: 0, errors: [] };

  for (const employee of employees) {
    try {
      await generatePayroll(employee._id, month, year, processedBy, {
        organizationId: employee.organizationId,
        branchId: employee.branchId,
      });
      results.created += 1;
    } catch (err) {
      if (err.statusCode === httpStatus.BAD_REQUEST && String(err.message).includes('already exists')) {
        results.skipped += 1;
      } else {
        results.errors.push({
          employeeId: employee.employeeId,
          message: err.message,
        });
      }
    }
  }

  return results;
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
  calculatePayrollSnapshot,
  computeLeaveSalaryImpact,
  syncPayrollForMonth,
  syncPayrollForLeave,
  getOverlappingLeaveDays,
  generateMonthlyPayrollForAll,
};
