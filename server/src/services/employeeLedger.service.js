const httpStatus = require('http-status');
const { EmployeeLedger, Employee } = require('../models');
const ApiError = require('../utils/ApiError');
const cashBookService = require('./cashBook.service');
const expenseService = require('./expense.service');
const expenseCategoryService = require('./expenseCategory.service');

const PAYMENT_TRANSACTION_TYPES = new Set(['salary_payment', 'advance_payment']);

const shouldSyncCashBook = (entry) => {
  if (!entry) return false;
  return PAYMENT_TRANSACTION_TYPES.has(String(entry.transactionType || '').toLowerCase());
};

const getCashBookAmount = (entry) => {
  if (!entry) return 0;
  return Number(entry.credit || 0);
};

const syncCashBookFromEmployeeLedger = async (entry) => {
  if (!entry) return null;

  if (!shouldSyncCashBook(entry)) {
    await cashBookService.deleteEntriesByReference(entry._id, 'EmployeeLedger');
    return null;
  }

  const amount = getCashBookAmount(entry);
  if (amount <= 0) {
    await cashBookService.deleteEntriesByReference(entry._id, 'EmployeeLedger');
    return null;
  }

  const employeeName = entry.employee?.firstName
    ? `${entry.employee.firstName} ${entry.employee.lastName || ''}`.trim()
    : 'Employee';
  const label = entry.transactionType === 'advance_payment' ? 'Advance payment' : 'Salary payment';
  const referenceText = entry.reference ? ` (${entry.reference})` : '';

  return cashBookService.upsertReferenceEntry({
    organizationId: entry.organizationId,
    branchId: entry.branchId,
    type: 'expense',
    source: 'expense',
    amount,
    paymentMethod: entry.paymentMethod || 'cash',
    referenceId: entry._id,
    referenceModel: 'EmployeeLedger',
    description: `${label} to ${employeeName}${referenceText}`,
    notes: entry.notes || '',
    date: entry.transactionDate || new Date(),
    createdBy: entry.updatedBy || entry.createdBy,
  });
};

const syncExpenseFromEmployeePayment = async ({ ledgerEntry, employeeDoc }) => {
  if (!ledgerEntry || !employeeDoc) return null;
  if (!PAYMENT_TRANSACTION_TYPES.has(String(ledgerEntry.transactionType || '').toLowerCase())) {
    return null;
  }
  const employeeName = `${employeeDoc.firstName} ${employeeDoc.lastName}`.trim();
  await expenseCategoryService.findOrCreateEmployeeCategory(
    ledgerEntry.organizationId,
    ledgerEntry.branchId,
    ledgerEntry.updatedBy || ledgerEntry.createdBy,
    employeeName,
  );
  return expenseService.upsertExpenseFromEmployeeLedger(ledgerEntry, employeeDoc);
};

const syncExpenseForLedgerEntry = async (entry) => {
  if (!entry || !PAYMENT_TRANSACTION_TYPES.has(String(entry.transactionType || '').toLowerCase())) {
    return null;
  }
  const employeeId = entry.employee?._id || entry.employee;
  const employeeDoc = entry.employee?.firstName
    ? entry.employee
    : await Employee.findById(employeeId);
  if (!employeeDoc) return null;
  return syncExpenseFromEmployeePayment({ ledgerEntry: entry, employeeDoc });
};

const recalculateBalances = async (employeeId) => {
  const entries = await EmployeeLedger.find({ employee: employeeId }).sort({ transactionDate: 1, createdAt: 1 });
  let runningBalance = 0;

  for (const entry of entries) {
    runningBalance += Number(entry.debit || 0) - Number(entry.credit || 0);
    if (entry.balance !== runningBalance) {
      entry.balance = runningBalance;
      await entry.save();
    }
  }
};

const createLedgerEntry = async (ledgerBody) => {
  const employee = await Employee.findById(ledgerBody.employee);
  if (!employee) throw new ApiError(httpStatus.NOT_FOUND, 'Employee not found');

  const entry = await EmployeeLedger.create({
    ...ledgerBody,
    balance: 0,
  });
  await recalculateBalances(ledgerBody.employee);
  const updatedEntry = await EmployeeLedger.findById(entry._id).populate('employee', 'firstName lastName employeeId');
  await syncCashBookFromEmployeeLedger(updatedEntry);
  return updatedEntry;
};

const updateLedgerEntryById = async (ledgerId, updateBody) => {
  const entry = await EmployeeLedger.findById(ledgerId).populate('employee', 'firstName lastName employeeId');
  if (!entry) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ledger entry not found');
  }

  Object.assign(entry, updateBody);
  await entry.save();

  const employeeId = entry.employee?._id || entry.employee;
  await recalculateBalances(employeeId);
  const updatedEntry = await EmployeeLedger.findById(entry._id).populate('employee', 'firstName lastName employeeId');
  await syncCashBookFromEmployeeLedger(updatedEntry);
  await syncExpenseForLedgerEntry(updatedEntry);
  return updatedEntry;
};

const deleteLedgerEntryById = async (ledgerId) => {
  const entry = await EmployeeLedger.findById(ledgerId).populate('employee', 'firstName lastName employeeId');
  if (!entry) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ledger entry not found');
  }

  const employeeId = entry.employee?._id || entry.employee;
  const employeeName = entry.employee?.firstName
    ? `${entry.employee.firstName} ${entry.employee.lastName || ''}`.trim()
    : '';

  await cashBookService.deleteEmployeeLedgerPaymentCashBook(entry, employeeName);
  await expenseService.deleteExpenseByLedgerReference(entry._id, entry, entry.employee);
  await entry.deleteOne();
  await recalculateBalances(employeeId);
  return entry;
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

  const employeeDoc = await Employee.findById(employee);
  if (!employeeDoc) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Employee not found');
  }

  let salaryEntry = null;
  let advanceEntry = null;

  if (salaryPaymentAmount > 0) {
    const normalizedNotes = String(notes || '').trim();
    salaryEntry = await createLedgerEntry({
      organizationId,
      branchId,
      employee,
      transactionType: 'salary_payment',
      transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
      reference: normalizedNotes || 'MANUAL-PAYMENT',
      referenceModel: 'EmployeeLedger',
      description: 'Salary payment to employee',
      debit: 0,
      credit: salaryPaymentAmount,
      paymentMethod: paymentMethod || 'Cash',
      notes: normalizedNotes,
      createdBy,
      updatedBy,
    });
  }

  if (extraAdvanceAmount > 0) {
    const normalizedNotes = String(notes || '').trim();
    advanceEntry = await createLedgerEntry({
      organizationId,
      branchId,
      employee,
      transactionType: 'advance_payment',
      transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
      reference: normalizedNotes || 'MANUAL-ADVANCE',
      referenceModel: 'EmployeeLedger',
      description: 'Advance paid to employee',
      debit: 0,
      credit: extraAdvanceAmount,
      paymentMethod: paymentMethod || 'Cash',
      notes: normalizedNotes,
      createdBy,
      updatedBy,
    });
  }

  if (salaryPaymentAmount > 0) {
    await syncExpenseFromEmployeePayment({
      ledgerEntry: salaryEntry,
      employeeDoc,
    });
  }

  if (extraAdvanceAmount > 0) {
    await syncExpenseFromEmployeePayment({
      ledgerEntry: advanceEntry,
      employeeDoc,
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
    Object.assign(existing, payload);
    await existing.save();
    await recalculateBalances(payroll.employee);
    return existing;
  }

  const created = await createLedgerEntry(payload);
  await recalculateBalances(payroll.employee);
  return created;
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
    Object.assign(existing, payload);
    await existing.save();
    await recalculateBalances(payroll.employee);
    return existing;
  }

  const created = await createLedgerEntry(payload);
  await recalculateBalances(payroll.employee);
  return created;
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
    if (payload.credit <= 0) {
      await cashBookService.deleteEntriesByReference(existing._id, 'EmployeeLedger');
      await existing.deleteOne();
      await recalculateBalances(payroll.employee);
      return null;
    }
    Object.assign(existing, payload);
    await existing.save();
    await recalculateBalances(payroll.employee);
    return existing;
  }

  if (payload.credit <= 0) return null;
  const created = await createLedgerEntry(payload);
  await recalculateBalances(payroll.employee);
  return created;
};

module.exports = {
  createLedgerEntry,
  updateLedgerEntryById,
  deleteLedgerEntryById,
  queryLedgerEntries,
  getEmployeeLedgerSummary,
  getAllEmployeesWithBalances,
  createAdvancePayment,
  payEmployee,
  recalculateBalances,
  upsertSalaryPayableFromPayroll,
  upsertSalaryPaymentFromPayroll,
  upsertAdvancePaymentFromPayroll,
};
