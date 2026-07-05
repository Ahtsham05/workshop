const httpStatus = require('http-status');
const { EmployeeLedger, Employee, Customer } = require('../models');
const ApiError = require('../utils/ApiError');
const cashBookService = require('./cashBook.service');
const expenseService = require('./expense.service');
const expenseCategoryService = require('./expenseCategory.service');

const EXPENSE_SYNC_TYPES = new Set(['salary_payment']);
const CASHBOOK_SYNC_TYPES = new Set(['salary_payment', 'advance_payment']);

const shouldSyncCashBook = (entry) => {
  if (!entry) return false;
  // Explicit opt-out (the "Affect Expense & Cash Book" switch on Pay Employee)
  // — the cash side of this payment was already recorded elsewhere.
  if (entry.affectsBooks === false) return false;
  // Goods/services sold to an employee on account never had cash leave the
  // register at the time of the "advance" — any cash actually collected was
  // already recorded by the Invoice itself. Skip, or this would double-count.
  if (entry.referenceModel === 'Invoice') return false;
  return CASHBOOK_SYNC_TYPES.has(String(entry.transactionType || '').toLowerCase());
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
  if (!EXPENSE_SYNC_TYPES.has(String(ledgerEntry.transactionType || '').toLowerCase())) {
    return null;
  }
  if (ledgerEntry.affectsBooks === false) {
    await expenseService.deleteExpenseByLedgerReference(ledgerEntry._id, ledgerEntry, employeeDoc);
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
  if (!entry || !EXPENSE_SYNC_TYPES.has(String(entry.transactionType || '').toLowerCase())) {
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
    // advance_recovery is a bookkeeping memo (no new cash movement, already
    // accounted for when the advance_payment credit hit the balance), so it
    // must not reduce the running balance a second time.
    if (entry.transactionType !== 'advance_recovery') {
      runningBalance += Number(entry.debit || 0) - Number(entry.credit || 0);
    }
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
  let totalAdvanceRecovered = 0;

  entries.forEach((entry) => {
    if (entry.transactionType === 'salary_payable') totalPayable += Number(entry.debit || 0);
    if (entry.transactionType === 'salary_payment') totalSalaryPaid += Number(entry.credit || 0);
    if (entry.transactionType === 'advance_payment') totalAdvancePaid += Number(entry.credit || 0);
    if (entry.transactionType === 'advance_recovery') totalAdvanceRecovered += Number(entry.credit || 0);
  });

  // Advance is real cash paid out, so it reduces the running ledger balance
  // immediately (same as a salary payment). advance_recovery is a bookkeeping
  // memo only used to track how much of that advance is considered "settled" —
  // it does not touch the balance again (that would double-count the cash).
  const outstandingAdvance = Math.max(0, totalAdvancePaid - totalAdvanceRecovered);
  const currentBalance = totalPayable - totalSalaryPaid - totalAdvancePaid;
  // payableNow is the actual cash cap the Pay button enforces — it accounts for
  // advances already given, so the same cash can't be paid out twice.
  const payableNow = Math.max(0, currentBalance);
  // remainingPayable is a display-only figure: gross salary that hasn't gone
  // through a salary_payment yet, deliberately ignoring any advance given.
  const remainingPayable = Math.max(0, totalPayable - totalSalaryPaid);
  return {
    totalPayable,
    totalSalaryPaid,
    totalAdvancePaid,
    totalAdvanceRecovered,
    outstandingAdvance,
    remainingPayable,
    payableNow,
    currentBalance,
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
  const {
    employee,
    amount,
    advanceRecovery,
    recoverySource,
    transactionDate,
    paymentMethod,
    notes,
    organizationId,
    branchId,
    createdBy,
    updatedBy,
    affectsBooks = true,
  } = paymentBody;
  const numericAmount = Number(amount || 0);
  const recoveryAmount = Number(advanceRecovery || 0);

  if (numericAmount <= 0 && recoveryAmount <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Enter a payment amount or an advance recovery amount');
  }

  const summary = await getEmployeeLedgerSummary(employee, { organizationId, branchId });
  const outstandingPayable = Math.max(0, Number(summary.currentBalance || 0)); // company owes employee
  const outstandingAdvance = Math.max(0, Number(summary.outstandingAdvance || 0));

  if (numericAmount > outstandingPayable) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Amount exceeds payable salary of Rs ${outstandingPayable}. Use the Advance button to pay extra.`
    );
  }

  if (recoveryAmount > outstandingAdvance) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Advance recovery exceeds outstanding advance of Rs ${outstandingAdvance}`);
  }

  const employeeDoc = await Employee.findById(employee);
  if (!employeeDoc) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Employee not found');
  }

  let salaryEntry = null;
  let recoveryEntry = null;
  const normalizedNotes = String(notes || '').trim();
  const entryDate = transactionDate ? new Date(transactionDate) : new Date();

  if (numericAmount > 0) {
    salaryEntry = await createLedgerEntry({
      organizationId,
      branchId,
      employee,
      transactionType: 'salary_payment',
      transactionDate: entryDate,
      reference: normalizedNotes || 'MANUAL-PAYMENT',
      referenceModel: 'EmployeeLedger',
      description: 'Salary payment to employee',
      debit: 0,
      credit: numericAmount,
      paymentMethod: paymentMethod || 'Cash',
      notes: normalizedNotes,
      affectsBooks,
      createdBy,
      updatedBy,
    });
    await syncExpenseFromEmployeePayment({ ledgerEntry: salaryEntry, employeeDoc });
  }

  if (recoveryAmount > 0) {
    // A recovery entered alongside a Pay is "salary paid from advance" and
    // belongs in the Ledger view too. A standalone recovery (from the Advances
    // tab's "Recover Advance" button, with no salary payment attached) is an
    // advance-only adjustment and should stay out of the Ledger view.
    const isStandalone = recoverySource === 'standalone';
    recoveryEntry = await createLedgerEntry({
      organizationId,
      branchId,
      employee,
      transactionType: 'advance_recovery',
      transactionDate: entryDate,
      reference: normalizedNotes || (isStandalone ? 'ADVANCE-RECOVERY' : 'SALARY-FROM-ADVANCE'),
      referenceModel: 'EmployeeLedger',
      description: isStandalone ? 'Advance recovery adjustment' : 'Salary paid from advance',
      debit: 0,
      credit: recoveryAmount,
      paymentMethod: paymentMethod || 'Cash',
      notes: normalizedNotes,
      affectsBooks,
      createdBy,
      updatedBy,
    });
  }

  return {
    salaryPaymentAmount: numericAmount,
    advanceRecoveryAmount: recoveryAmount,
    salaryEntry,
    recoveryEntry,
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

/**
 * Remove any purchase-advance ledger entry mirrored from a source document
 * (e.g. it was voided, fully refunded, or reassigned away from an employee).
 * @param {ObjectId} referenceId
 * @param {string} referenceModel - e.g. 'Invoice', 'LoadTransaction', 'SimSale', 'ServiceInvoice'
 */
const deletePurchaseAdvanceForReference = async (referenceId, referenceModel) => {
  const existing = await EmployeeLedger.findOne({ referenceId, referenceModel });
  if (!existing) return null;
  const employeeId = existing.employee;
  await existing.deleteOne();
  await recalculateBalances(employeeId);
  return null;
};

/**
 * Mirror an employee's unpaid store purchase — from ANY sale-to-customer
 * module (Invoice, mobile Load top-up, SIM sale, Service/repair invoice,
 * etc.) sold to their shadow Customer account — into their ledger as a debt
 * against future salary, the same way a cash advance is recovered. Fully
 * paid amounts don't touch the balance (nothing is owed); the source
 * document itself is the history. Safe to call on every save of the source
 * document — it's a no-op for non-employee customers and keeps the mirrored
 * entry in sync as that document is edited.
 * @param {Object} params
 * @param {string} params.customerId
 * @param {ObjectId} params.referenceId - id of the source document (invoice, load transaction, etc.)
 * @param {string} params.referenceModel - e.g. 'Invoice', 'LoadTransaction', 'SimSale', 'ServiceInvoice'
 * @param {string} params.reference - short human label, e.g. "Invoice #123"
 * @param {string} params.description - what was bought, e.g. item/service names
 * @param {number} params.unpaidAmount
 * @param {Date} [params.transactionDate]
 * @param {ObjectId} params.organizationId
 * @param {ObjectId} params.branchId
 * @param {ObjectId} [params.createdBy]
 * @param {ObjectId} [params.updatedBy]
 */
const syncPurchaseFromCustomerSale = async ({
  organizationId,
  branchId,
  customerId,
  referenceId,
  referenceModel,
  reference,
  description,
  unpaidAmount,
  transactionDate,
  createdBy,
  updatedBy,
}) => {
  if (!customerId || customerId === 'walk-in') {
    return deletePurchaseAdvanceForReference(referenceId, referenceModel);
  }

  const customer = await Customer.findById(customerId).select('isEmployeeAccount linkedEmployeeId');
  if (!customer || !customer.isEmployeeAccount || !customer.linkedEmployeeId) {
    return deletePurchaseAdvanceForReference(referenceId, referenceModel);
  }

  const unpaid = Number(unpaidAmount || 0);
  if (unpaid <= 0) {
    return deletePurchaseAdvanceForReference(referenceId, referenceModel);
  }

  const existing = await EmployeeLedger.findOne({
    employee: customer.linkedEmployeeId,
    referenceId,
    referenceModel,
  });

  const payload = {
    organizationId,
    branchId,
    employee: customer.linkedEmployeeId,
    transactionType: 'advance_payment',
    transactionDate: transactionDate || new Date(),
    reference: reference || 'Store Purchase',
    referenceId,
    referenceModel,
    description: description || 'Store purchase',
    debit: 0,
    credit: unpaid,
    paymentMethod: 'Store Credit',
    notes: `Unpaid balance on ${reference || 'store purchase'}, deducted from salary`,
    createdBy: updatedBy || createdBy,
    updatedBy: updatedBy || createdBy,
  };

  if (existing) {
    Object.assign(existing, payload);
    await existing.save();
    await recalculateBalances(customer.linkedEmployeeId);
    return existing;
  }

  return createLedgerEntry(payload);
};

/**
 * Convenience wrapper for the Invoice module (see invoice.service.js).
 * @param {Invoice} invoice
 */
const syncPurchaseFromInvoice = async (invoice) => {
  const itemNames = (invoice.items || []).map((item) => item.name).filter(Boolean).join(', ');
  return syncPurchaseFromCustomerSale({
    organizationId: invoice.organizationId,
    branchId: invoice.branchId,
    customerId: invoice.customerId,
    referenceId: invoice._id,
    referenceModel: 'Invoice',
    reference: `Invoice #${invoice.invoiceNumber}`,
    description: itemNames ? `Store purchase: ${itemNames}` : `Store purchase - Invoice #${invoice.invoiceNumber}`,
    unpaidAmount: invoice.balance,
    transactionDate: invoice.invoiceDate,
    createdBy: invoice.createdBy,
    updatedBy: invoice.updatedBy,
  });
};

const deletePurchaseAdvanceForInvoice = (invoiceId) => deletePurchaseAdvanceForReference(invoiceId, 'Invoice');

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
  syncPurchaseFromInvoice,
  deletePurchaseAdvanceForInvoice,
  syncPurchaseFromCustomerSale,
  deletePurchaseAdvanceForReference,
};
