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
    lastWorkingDate: employee.lastWorkingDate,
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
    notes: `Present: ${stats.presentDays}, Absent: ${stats.absentDays}, Leave: ${stats.leaveDays}, Pending leave (awaiting decision, no deduction): ${stats.pendingLeaveDays}, Unpaid leave deduction days: ${stats.unpaidLeaveDays}`,
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
      type: 'pending',
      label: 'Awaiting approval — no salary impact yet',
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

/** Create or refresh the Payroll record for a given month so its numbers reflect the
 * latest attendance/leave data before it feeds into a settlement or ledger read. */
const ensureMonthPayroll = async (employee, month, year, userId, scope = {}) => {
  const tenantFilter = {};
  if (scope.organizationId) tenantFilter.organizationId = scope.organizationId;
  if (scope.branchId) tenantFilter.branchId = scope.branchId;

  const existing = await Payroll.findOne({ employee: employee._id, month, year, ...tenantFilter });
  if (existing) {
    return syncPayrollForMonth(employee._id, month, year, userId, scope);
  }
  return generatePayroll(employee._id, month, year, userId, scope);
};

/**
 * Final settlement due to (or owed by) a Terminated/Resigned employee as of their last
 * working day. Reuses the same attendance/leave-driven payroll math as a normal month
 * (proration naturally stops at lastWorkingDate via computeAttendanceStatsFromData) plus
 * the employee ledger balance, which already nets out everything paid/advanced to date —
 * this is the same "what does the company still owe" figure used everywhere else in HR,
 * just evaluated as of the exit month rather than the current one.
 */
const getEmployeeFinalSettlement = async (employeeId, scope = {}, userId = null) => {
  const employee = await Employee.findById(employeeId);
  if (!employee) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Employee not found');
  }

  const asOfDate = employee.lastWorkingDate ? new Date(employee.lastWorkingDate) : new Date();
  await ensureMonthPayroll(employee, asOfDate.getMonth() + 1, asOfDate.getFullYear(), userId, scope);

  const ledgerSummary = await employeeLedgerService.getEmployeeLedgerSummary(employeeId, scope);

  return {
    employee: {
      id: employee._id?.toString() || employee.id,
      employeeId: employee.employeeId,
      name: `${employee.firstName} ${employee.lastName}`.trim(),
      employmentStatus: employee.employmentStatus,
      lastWorkingDate: employee.lastWorkingDate || null,
      exitReason: employee.exitReason || '',
    },
    asOfDate,
    ...ledgerSummary,
  };
};

const PAYROLL_STATUSES = ['Pending', 'Processed', 'Paid', 'On Hold'];
const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const getPayrollSummary = async (scope = {}, { month, year } = {}) => {
  const tenantFilter = {};
  if (scope.organizationId) tenantFilter.organizationId = scope.organizationId;
  if (scope.branchId) tenantFilter.branchId = scope.branchId;

  const now = new Date();
  const targetMonth = Number(month) || now.getMonth() + 1;
  const targetYear = Number(year) || now.getFullYear();

  const totalActiveEmployees = await Employee.countDocuments({
    ...tenantFilter,
    employmentStatus: 'Active',
  });

  const statusAggRaw = await Payroll.aggregate([
    { $match: { ...tenantFilter, month: targetMonth, year: targetYear } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        netSalary: { $sum: '$netSalary' },
        grossSalary: { $sum: '$grossSalary' },
        totalDeductions: { $sum: '$totalDeductions' },
      },
    },
  ]);
  const statusMap = new Map(statusAggRaw.map((row) => [row._id, row]));
  const statusBreakdown = PAYROLL_STATUSES.map((status) => {
    const row = statusMap.get(status);
    return {
      status,
      count: row?.count || 0,
      netSalary: row?.netSalary || 0,
      grossSalary: row?.grossSalary || 0,
      totalDeductions: row?.totalDeductions || 0,
    };
  });

  const payrollRecordsCount = statusBreakdown.reduce((sum, row) => sum + row.count, 0);
  const totalPayable = statusBreakdown.reduce((sum, row) => sum + row.netSalary, 0);
  const totalGross = statusBreakdown.reduce((sum, row) => sum + row.grossSalary, 0);
  const totalDeductions = statusBreakdown.reduce((sum, row) => sum + row.totalDeductions, 0);

  const monthStart = new Date(targetYear, targetMonth - 1, 1);
  const monthEnd = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);
  const ledgerAggRaw = await EmployeeLedger.aggregate([
    {
      $match: {
        ...tenantFilter,
        transactionDate: { $gte: monthStart, $lte: monthEnd },
        transactionType: { $in: ['salary_payment', 'advance_payment'] },
      },
    },
    {
      $group: {
        _id: '$transactionType',
        total: { $sum: '$credit' },
      },
    },
  ]);
  const ledgerMap = new Map(ledgerAggRaw.map((row) => [row._id, row.total]));
  const totalPaid = ledgerMap.get('salary_payment') || 0;
  const totalAdvance = ledgerMap.get('advance_payment') || 0;
  const remainingPayable = Math.max(0, totalPayable - totalPaid - totalAdvance);

  const currentPeriod = new Date(targetYear, targetMonth - 1, 1);
  const trendStart = new Date(targetYear, targetMonth - 1 - 5, 1);
  const trendMonths = getMonthsInRange(trendStart, currentPeriod);
  const trendAggRaw = await Payroll.aggregate([
    {
      $match: {
        ...tenantFilter,
        $or: trendMonths.map(({ month: m, year: y }) => ({ month: m, year: y })),
      },
    },
    {
      $group: {
        _id: { month: '$month', year: '$year' },
        netSalary: { $sum: '$netSalary' },
        grossSalary: { $sum: '$grossSalary' },
        employeeCount: { $sum: 1 },
      },
    },
  ]);
  const trendMap = new Map(trendAggRaw.map((row) => [`${row._id.year}-${row._id.month}`, row]));
  const trend = trendMonths.map(({ month: m, year: y }) => {
    const row = trendMap.get(`${y}-${m}`);
    return {
      month: m,
      year: y,
      label: `${MONTH_LABELS[m - 1]} ${y}`,
      netSalary: row?.netSalary || 0,
      grossSalary: row?.grossSalary || 0,
      employeeCount: row?.employeeCount || 0,
    };
  });

  const departmentAggRaw = await Payroll.aggregate([
    { $match: { ...tenantFilter, month: targetMonth, year: targetYear } },
    {
      $lookup: {
        from: 'employees',
        localField: 'employee',
        foreignField: '_id',
        as: 'employeeInfo',
      },
    },
    { $unwind: { path: '$employeeInfo', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'departments',
        localField: 'employeeInfo.department',
        foreignField: '_id',
        as: 'departmentInfo',
      },
    },
    { $unwind: { path: '$departmentInfo', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: { $ifNull: ['$departmentInfo.name', 'Unassigned'] },
        netSalary: { $sum: '$netSalary' },
        count: { $sum: 1 },
      },
    },
    { $sort: { netSalary: -1 } },
  ]);
  const departmentBreakdown = departmentAggRaw.map((row) => ({
    department: row._id,
    netSalary: row.netSalary,
    count: row.count,
  }));

  return {
    month: targetMonth,
    year: targetYear,
    totalActiveEmployees,
    payrollRecordsCount,
    totals: {
      payable: totalPayable,
      paid: totalPaid,
      advance: totalAdvance,
      remaining: remainingPayable,
      gross: totalGross,
      deductions: totalDeductions,
    },
    statusBreakdown,
    trend,
    departmentBreakdown,
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
  getPayrollSummary,
  getEmployeeFinalSettlement,
  calculatePayrollSnapshot,
  computeLeaveSalaryImpact,
  syncPayrollForMonth,
  syncPayrollForLeave,
  getOverlappingLeaveDays,
  generateMonthlyPayrollForAll,
};
