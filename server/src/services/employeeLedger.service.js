const httpStatus = require('http-status');
const { EmployeeLedger, Employee } = require('../models');
const ApiError = require('../utils/ApiError');

const recalculateBalances = async (employeeId, fromTransactionDate) => {
  const entries = await EmployeeLedger.find({ employee: employeeId }).sort({ transactionDate: 1, createdAt: 1 });
  let runningBalance = 0;
  let shouldUpdate = false;

  for (const entry of entries) {
    if (entry.transactionDate >= fromTransactionDate) shouldUpdate = true;
    if (shouldUpdate) {
      const newBalance = runningBalance + (entry.debit || 0) - (entry.credit || 0);
      if (entry.balance !== newBalance) {
        entry.balance = newBalance;
        await entry.save();
      }
    }
    runningBalance += (entry.debit || 0) - (entry.credit || 0);
  }
};

const createLedgerEntry = async (ledgerBody) => {
  const employee = await Employee.findById(ledgerBody.employee);
  if (!employee) throw new ApiError(httpStatus.NOT_FOUND, 'Employee not found');

  const entry = await EmployeeLedger.create({
    ...ledgerBody,
    balance: 0,
  });
  await recalculateBalances(ledgerBody.employee, ledgerBody.transactionDate || new Date());
  return EmployeeLedger.findById(entry._id).populate('employee', 'firstName lastName employeeId');
};

const queryLedgerEntries = async (filter, options) => {
  if (options.search) {
    filter.$or = [
      { description: { $regex: options.search, $options: 'i' } },
      { reference: { $regex: options.search, $options: 'i' } },
      { paymentMethod: { $regex: options.search, $options: 'i' } },
    ];
    delete options.search;
  }

  if (options.startDate || options.endDate) {
    filter.transactionDate = {};
    if (options.startDate) filter.transactionDate.$gte = new Date(options.startDate);
    if (options.endDate) filter.transactionDate.$lte = new Date(options.endDate);
    delete options.startDate;
    delete options.endDate;
  }

  options.populate = 'employee';
  options.sort = options.sortBy || 'transactionDate:asc';
  delete options.sortBy;

  return EmployeeLedger.paginate(filter, options);
};

const getEmployeeLedgerSummary = async (employeeId, scope = {}) => {
  const filter = { employee: employeeId };
  if (scope.organizationId) filter.organizationId = scope.organizationId;
  if (scope.branchId) filter.branchId = scope.branchId;

  const entries = await EmployeeLedger.find(filter);
  let totalPayable = 0;
  let totalSalaryPaid = 0;
  let totalAdvancePaid = 0;

  entries.forEach((entry) => {
    if (entry.transactionType === 'salary_payable') totalPayable += Number(entry.debit || 0);
    if (entry.transactionType === 'salary_payment') totalSalaryPaid += Number(entry.credit || 0);
    if (entry.transactionType === 'advance_payment') totalAdvancePaid += Number(entry.credit || 0);
  });

  const remainingPayable = Math.max(0, totalPayable - totalSalaryPaid - totalAdvancePaid);
  return {
    totalPayable,
    totalSalaryPaid,
    totalAdvancePaid,
    remainingPayable,
    currentBalance: totalPayable - (totalSalaryPaid + totalAdvancePaid),
    transactionCount: entries.length,
  };
};

const getAllEmployeesWithBalances = async (scope = {}) => {
  const employeeFilter = {};
  if (scope.organizationId) employeeFilter.organizationId = scope.organizationId;
  if (scope.branchId) employeeFilter.branchId = scope.branchId;

  const employees = await Employee.find(employeeFilter).select('firstName lastName employeeId');
  const result = await Promise.all(
    employees.map(async (employee) => {
      const summary = await getEmployeeLedgerSummary(employee._id, scope);
      return {
        id: employee.id,
        _id: employee._id,
        employeeId: employee.employeeId,
        name: `${employee.firstName} ${employee.lastName}`,
        ...summary,
      };
    })
  );

  return result;
};

const createAdvancePayment = async (advanceBody) => {
  const { employee, amount, ...rest } = advanceBody;
  return createLedgerEntry({
    employee,
    debit: 0,
    credit: Number(amount),
    transactionType: 'advance_payment',
    description: rest.description || 'Advance paid to employee',
    ...rest,
  });
};

const payEmployee = async (paymentBody) => {
  const { employee, amount, transactionDate, paymentMethod, notes, organizationId, branchId, createdBy, updatedBy } = paymentBody;
  const numericAmount = Number(amount || 0);
  if (numericAmount <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payment amount must be greater than 0');
  }

  const summary = await getEmployeeLedgerSummary(employee, { organizationId, branchId });
  const outstandingPayable = Math.max(0, Number(summary.currentBalance || 0)); // company owes employee
  const salaryPaymentAmount = Math.min(numericAmount, outstandingPayable);
  const extraAdvanceAmount = Math.max(0, numericAmount - salaryPaymentAmount);

  let salaryEntry = null;
  let advanceEntry = null;

  if (salaryPaymentAmount > 0) {
    salaryEntry = await createLedgerEntry({
      organizationId,
      branchId,
      employee,
      transactionType: 'salary_payment',
      transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
      reference: 'MANUAL-PAYMENT',
      referenceModel: 'EmployeeLedger',
      description: 'Salary payment to employee',
      debit: 0,
      credit: salaryPaymentAmount,
      paymentMethod: paymentMethod || 'Cash',
      notes: notes || '',
      createdBy,
      updatedBy,
    });
  }

  if (extraAdvanceAmount > 0) {
    advanceEntry = await createLedgerEntry({
      organizationId,
      branchId,
      employee,
      transactionType: 'advance_payment',
      transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
      reference: 'MANUAL-ADVANCE',
      referenceModel: 'EmployeeLedger',
      description: 'Advance paid to employee',
      debit: 0,
      credit: extraAdvanceAmount,
      paymentMethod: paymentMethod || 'Cash',
      notes: notes || '',
      createdBy,
      updatedBy,
    });
  }

  return {
    salaryPaymentAmount,
    extraAdvanceAmount,
    salaryEntry,
    advanceEntry,
  };
};

const upsertSalaryPayableFromPayroll = async (payroll, userId) => {
  const existing = await EmployeeLedger.findOne({
    employee: payroll.employee,
    referenceId: payroll._id,
    transactionType: 'salary_payable',
  });

  const payload = {
    organizationId: payroll.organizationId,
    branchId: payroll.branchId,
    employee: payroll.employee,
    transactionType: 'salary_payable',
    transactionDate: new Date(payroll.year, payroll.month - 1, 1),
    reference: `PAYROLL-${payroll.month}-${payroll.year}`,
    referenceId: payroll._id,
    referenceModel: 'Payroll',
    description: `Salary payable for ${payroll.month}/${payroll.year}`,
    debit: Number(payroll.netSalary || 0),
    credit: 0,
    notes: payroll.notes || '',
    createdBy: userId,
    updatedBy: userId,
  };

  if (existing) {
    const fromDate = existing.transactionDate;
    Object.assign(existing, payload);
    await existing.save();
    await recalculateBalances(payroll.employee, fromDate);
    return existing;
  }

  return createLedgerEntry(payload);
};

const upsertSalaryPaymentFromPayroll = async (payroll, paymentDate, paymentMethod, userId, amount) => {
  const existing = await EmployeeLedger.findOne({
    employee: payroll.employee,
    referenceId: payroll._id,
    transactionType: 'salary_payment',
  });

  const payload = {
    organizationId: payroll.organizationId,
    branchId: payroll.branchId,
    employee: payroll.employee,
    transactionType: 'salary_payment',
    transactionDate: paymentDate ? new Date(paymentDate) : new Date(),
    reference: `PAYROLL-PAYMENT-${payroll.month}-${payroll.year}`,
    referenceId: payroll._id,
    referenceModel: 'Payroll',
    description: `Salary paid for ${payroll.month}/${payroll.year}`,
    debit: 0,
    credit: Number(amount || payroll.netSalary || 0),
    paymentMethod: paymentMethod || payroll.paymentMethod || 'Bank Transfer',
    notes: payroll.notes || '',
    createdBy: userId,
    updatedBy: userId,
  };

  if (existing) {
    const fromDate = existing.transactionDate;
    Object.assign(existing, payload);
    await existing.save();
    await recalculateBalances(payroll.employee, fromDate);
    return existing;
  }

  return createLedgerEntry(payload);
};

const upsertAdvancePaymentFromPayroll = async (payroll, paymentDate, paymentMethod, userId, amount) => {
  const existing = await EmployeeLedger.findOne({
    employee: payroll.employee,
    referenceId: payroll._id,
    transactionType: 'advance_payment',
  });

  const payload = {
    organizationId: payroll.organizationId,
    branchId: payroll.branchId,
    employee: payroll.employee,
    transactionType: 'advance_payment',
    transactionDate: paymentDate ? new Date(paymentDate) : new Date(),
    reference: `PAYROLL-ADVANCE-${payroll.month}-${payroll.year}`,
    referenceId: payroll._id,
    referenceModel: 'Payroll',
    description: `Advance paid with payroll ${payroll.month}/${payroll.year}`,
    debit: 0,
    credit: Number(amount || 0),
    paymentMethod: paymentMethod || payroll.paymentMethod || 'Cash',
    notes: payroll.notes || '',
    createdBy: userId,
    updatedBy: userId,
  };

  if (existing) {
    const fromDate = existing.transactionDate;
    if (payload.credit <= 0) {
      await existing.deleteOne();
      await recalculateBalances(payroll.employee, fromDate);
      return null;
    }
    Object.assign(existing, payload);
    await existing.save();
    await recalculateBalances(payroll.employee, fromDate);
    return existing;
  }

  if (payload.credit <= 0) return null;
  return createLedgerEntry(payload);
};

module.exports = {
  createLedgerEntry,
  queryLedgerEntries,
  getEmployeeLedgerSummary,
  getAllEmployeesWithBalances,
  createAdvancePayment,
  payEmployee,
  upsertSalaryPayableFromPayroll,
  upsertSalaryPaymentFromPayroll,
  upsertAdvancePaymentFromPayroll,
};
