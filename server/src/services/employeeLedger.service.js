const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { EmployeeLedger, Employee, Customer, Wallet, Expense } = require('../models');
const { VOUCHER_REFERENCE_MODELS } = require('../models/employeeLedger.model');
const ApiError = require('../utils/ApiError');
const { formatMoney } = require('../utils/money');
const cashBookService = require('./cashBook.service');
const expenseService = require('./expense.service');
const expenseCategoryService = require('./expenseCategory.service');
const walletEntryService = require('./walletEntry.service');
const { addTokenSearch } = require('../utils/searchQuery');

const EXPENSE_SYNC_TYPES = new Set(['salary_payment']);
const CASHBOOK_SYNC_TYPES = new Set(['salary_payment', 'advance_payment', 'payment_received']);
const VOUCHER_MODELS = new Set(VOUCHER_REFERENCE_MODELS);

/** True for a row a Payment / Receipt Voucher posted (and therefore owns). */
const isVoucherOwned = (entry) => VOUCHER_MODELS.has(entry?.referenceModel);

/** Money comes IN for cash received from the employee; every other cash row pays them OUT. */
const cashDirection = (entry) => (entry?.transactionType === 'payment_received' ? 'in' : 'out');

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

/** The cash this row moved: a receipt is a debit, a payment a credit. */
const getCashBookAmount = (entry) => {
  if (!entry) return 0;
  return cashDirection(entry) === 'in' ? Number(entry.debit || 0) : Number(entry.credit || 0);
};

const entryLabel = (entry) => {
  if (entry.transactionType === 'payment_received') return 'Cash received';
  if (entry.transactionType === 'advance_payment') return 'Advance payment';
  return 'Salary payment';
};

const employeeNameOf = (entry) =>
  entry.employee?.firstName ? `${entry.employee.firstName} ${entry.employee.lastName || ''}`.trim() : 'Employee';

/**
 * Wording of the Cash Book / bank rows this ledger row owns. A voucher row already carries the
 * voucher's own wording ("Payment voucher PMT-000012 — Ali Raza (May salary)"), which is what a
 * person reading the Cash Book needs to find the voucher again.
 */
const bookDescription = (entry) => {
  if (isVoucherOwned(entry) && entry.description) return entry.description;
  const name = employeeNameOf(entry);
  const preposition = cashDirection(entry) === 'in' ? 'from' : 'to';
  const referenceText = entry.reference ? ` (${entry.reference})` : '';
  return `${entryLabel(entry)} ${preposition} ${name}${referenceText}`;
};

const getTenantFilter = (data = {}) => {
  const filter = {};
  if (data.organizationId) {
    filter.organizationId = data.organizationId;
  }
  if (data.branchId) {
    filter.branchId = data.branchId;
  }
  return filter;
};

/** True when this entry's paymentMethod names a real Bank Account/mobile wallet
 * (not the "Cash in Hand" cash-type account, which is genuinely cash). */
const isRealWalletPayment = async (entry) => {
  const method = String(entry.paymentMethod || '').trim().toLowerCase();
  if (method !== 'wallet' || !entry.walletType) return false;
  const wallet = await Wallet.findOne({
    organizationId: entry.organizationId,
    branchId: entry.branchId,
    type: entry.walletType,
  }).select('accountType');
  return !(wallet && wallet.accountType === 'cash');
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

  // A payment made from a real Bank Account/mobile wallet gets no Cash Book line — the
  // Wallet ledger (see syncWalletFromEmployeeLedger below) already captures that
  // movement. Only "Cash in Hand" (accountType 'cash') and any other non-wallet method
  // are genuinely cash and belong in Cash Book. Same pattern as customerLedger/
  // supplierLedger/simSale services.
  if (await isRealWalletPayment(entry)) {
    await cashBookService.deleteEntriesByReference(entry._id, 'EmployeeLedger');
    return null;
  }

  const incoming = cashDirection(entry) === 'in';
  return cashBookService.upsertReferenceEntry({
    organizationId: entry.organizationId,
    branchId: entry.branchId,
    type: incoming ? 'income' : 'expense',
    source: incoming ? 'other' : 'expense',
    amount,
    // Reaching this line means isRealWalletPayment was false — genuinely cash either way
    // (a plain cash payment, or a wallet payment from the cash-type "Cash in Hand"
    // account). Always tagged lowercase 'cash' — getCashInHandSummary/getSummary match
    // paymentMethod by exact string, so anything else (including the legacy capitalized
    // 'Cash' this dialog used to hardcode) silently never counted as cash-in-hand.
    paymentMethod: 'cash',
    referenceId: entry._id,
    referenceModel: 'EmployeeLedger',
    description: bookDescription(entry),
    notes: entry.notes || '',
    date: entry.transactionDate || new Date(),
    createdBy: entry.updatedBy || entry.createdBy,
  });
};

/** What a row's wallet leg looked like, for an edit to reverse exactly that. */
const walletSnapshotOf = (entry) => ({
  paymentMethod: entry.paymentMethod,
  walletType: entry.walletType,
  amount: shouldSyncCashBook(entry) ? getCashBookAmount(entry) : 0,
});

/**
 * Wallet ledger + real Wallet.balance leg for a salary/advance payment paid via a real
 * Bank Account/mobile wallet — mirrors salesmanCommissionPayment.service.js's
 * syncPaymentCashEntry. Obeys the exact same eligibility gate as Cash Book
 * (shouldSyncCashBook) — the "Affect Expense & Cash Book" switch means "this payment's
 * cash/wallet movement was already recorded elsewhere," so both legs must skip together.
 * `previousSnapshot` (paymentMethod/walletType/amount before this save) lets an edit
 * correctly reverse a stale wallet effect — see walletEntryService.syncWalletPayment.
 */
const syncWalletFromEmployeeLedger = async (entry, previousSnapshot = null) => {
  if (!entry) return null;
  const syncable = shouldSyncCashBook(entry);

  return walletEntryService.syncWalletPayment({
    organizationId: entry.organizationId,
    branchId: entry.branchId,
    referenceId: entry._id,
    referenceModel: 'EmployeeLedger',
    direction: cashDirection(entry),
    amount: syncable ? getCashBookAmount(entry) : 0,
    paymentMethod: syncable ? String(entry.paymentMethod || '').trim().toLowerCase() : undefined,
    walletType: syncable ? entry.walletType : undefined,
    previousPaymentMethod: previousSnapshot ? String(previousSnapshot.paymentMethod || '').trim().toLowerCase() : undefined,
    previousWalletType: previousSnapshot?.walletType,
    previousAmount: previousSnapshot?.amount,
    description: bookDescription(entry),
    date: entry.transactionDate || new Date(),
    createdBy: entry.createdBy,
    updatedBy: entry.updatedBy || entry.createdBy,
  });
};

/**
 * Post (or re-post) both money legs of a row — bank and Cash Book — in the order that keeps the
 * balance check honest, and all-or-nothing.
 *
 * Order matters for a cash-type account ("Cash in Hand"): its spendable balance IS the live Cash
 * Book. Money going OUT must pass the wallet check first — posting the Cash Book entry first would
 * subtract the same payment twice and refuse one the till can cover. Money coming IN is written to
 * the Cash Book first (nothing to check), then the wallet. Same order the vouchers use.
 *
 * `previousSnapshot` is the wallet leg as it was before an edit (null for a new row): a failure
 * puts the wallet back exactly there.
 */
const syncMoneyLegs = async (entry, previousSnapshot = null) => {
  const restoreWallet = async () => {
    if (previousSnapshot) {
      // Re-sync from what it is now back to what it was.
      await walletEntryService.syncWalletPayment({
        organizationId: entry.organizationId,
        branchId: entry.branchId,
        referenceId: entry._id,
        referenceModel: 'EmployeeLedger',
        direction: cashDirection(entry),
        amount: previousSnapshot.amount,
        paymentMethod: String(previousSnapshot.paymentMethod || '').trim().toLowerCase(),
        walletType: previousSnapshot.walletType,
        previousPaymentMethod: shouldSyncCashBook(entry) ? String(entry.paymentMethod || '').trim().toLowerCase() : undefined,
        previousWalletType: shouldSyncCashBook(entry) ? entry.walletType : undefined,
        previousAmount: shouldSyncCashBook(entry) ? getCashBookAmount(entry) : 0,
        description: bookDescription(entry),
        date: entry.transactionDate || new Date(),
        createdBy: entry.createdBy,
        updatedBy: entry.updatedBy || entry.createdBy,
      });
      return;
    }
    if (shouldSyncCashBook(entry)) {
      await walletEntryService.reverseWalletPayment({
        organizationId: entry.organizationId,
        branchId: entry.branchId,
        referenceId: entry._id,
        referenceModel: 'EmployeeLedger',
        direction: cashDirection(entry),
        amount: getCashBookAmount(entry),
        paymentMethod: String(entry.paymentMethod || '').trim().toLowerCase(),
        walletType: entry.walletType,
        userId: entry.updatedBy || entry.createdBy,
      });
    }
  };

  if (cashDirection(entry) === 'out') {
    try {
      await syncWalletFromEmployeeLedger(entry, previousSnapshot);
    } catch (error) {
      // A brand-new row's wallet entry is written before the balance moves; if the move is what
      // failed, don't leave a bank row for money that never left.
      if (!previousSnapshot) await walletEntryService.deleteEntriesByReference(entry._id, 'EmployeeLedger');
      throw error;
    }
    try {
      await syncCashBookFromEmployeeLedger(entry);
    } catch (error) {
      await restoreWallet().catch(() => {});
      throw error;
    }
    return;
  }

  await syncCashBookFromEmployeeLedger(entry);
  try {
    await syncWalletFromEmployeeLedger(entry, previousSnapshot);
  } catch (error) {
    if (!previousSnapshot) {
      await walletEntryService.deleteEntriesByReference(entry._id, 'EmployeeLedger');
      await cashBookService.deleteEntriesByReference(entry._id, 'EmployeeLedger');
    }
    throw error;
  }
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

/**
 * Add a ledger row and post its money legs. All-or-nothing: if the bank / Cash Book side is
 * refused (e.g. not enough balance) the row is taken back out, so nothing is left half-posted.
 */
const createLedgerEntry = async (ledgerBody) => {
  const employee = await Employee.findOne({ _id: ledgerBody.employee, ...getTenantFilter(ledgerBody) });
  if (!employee) throw new ApiError(httpStatus.NOT_FOUND, 'Employee not found');

  const entry = await EmployeeLedger.create({
    ...ledgerBody,
    balance: 0,
  });
  await recalculateBalances(ledgerBody.employee);
  const updatedEntry = await EmployeeLedger.findById(entry._id).populate('employee', 'firstName lastName employeeId');
  try {
    await syncMoneyLegs(updatedEntry);
  } catch (error) {
    await EmployeeLedger.deleteOne({ _id: entry._id });
    await recalculateBalances(ledgerBody.employee);
    throw error;
  }
  return updatedEntry;
};

const voucherOwnedError = (entry) =>
  new ApiError(
    httpStatus.CONFLICT,
    `This entry was posted by ${entry.referenceModel === 'ReceiptVoucher' ? 'Receipt' : 'Payment'} Voucher ${
      entry.reference || ''
    }`.trim() + ' — edit or delete it from Payments & Receipts'
  );

const updateLedgerEntryById = async (ledgerId, updateBody, scope = {}) => {
  const entry = await EmployeeLedger.findOne({ _id: ledgerId, ...getTenantFilter(scope) }).populate(
    'employee',
    'firstName lastName employeeId'
  );
  if (!entry) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ledger entry not found');
  }
  if (isVoucherOwned(entry)) throw voucherOwnedError(entry);

  // Captured before the save so the money legs can reverse whatever wallet effect the entry
  // actually had — not what its new paymentMethod/amount happen to be.
  const previousWalletSnapshot = walletSnapshotOf(entry);

  Object.assign(entry, updateBody);
  await entry.save();

  const employeeId = entry.employee?._id || entry.employee;
  await recalculateBalances(employeeId);
  const updatedEntry = await EmployeeLedger.findById(entry._id).populate('employee', 'firstName lastName employeeId');
  await syncMoneyLegs(updatedEntry, previousWalletSnapshot);
  await syncExpenseForLedgerEntry(updatedEntry);
  return updatedEntry;
};

/**
 * Remove a row and everything it posted (bank leg, Cash Book line, mirrored salary expense).
 * Money that came IN is taken back out first — that is the step that can be refused (already
 * spent), so nothing is deleted when it is.
 * @param {Object} [options]
 * @param {boolean} [options.fromVoucher] - the owning voucher is doing the delete
 */
const deleteLedgerEntryById = async (ledgerId, scope = {}, options = {}) => {
  const entry = await EmployeeLedger.findOne({ _id: ledgerId, ...getTenantFilter(scope) }).populate(
    'employee',
    'firstName lastName employeeId'
  );
  if (!entry) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Ledger entry not found');
  }
  const voucherOwned = isVoucherOwned(entry);
  if (voucherOwned && !options.fromVoucher) throw voucherOwnedError(entry);

  const employeeId = entry.employee?._id || entry.employee;
  // The description-matching fallbacks below exist for legacy rows that predate referenceId
  // links. A voucher row is always linked — and two lines of one voucher can share a wording, so
  // a fallback could take out its sibling's records.
  const employeeName = voucherOwned ? '' : employeeNameOf(entry);

  const reverseWallet = async () => {
    // Only if this entry was actually eligible to move it in the first place
    // (shouldSyncCashBook) — otherwise (e.g. "Affect Expense & Cash Book" was off)
    // no wallet movement was ever applied for it to reverse.
    if (!shouldSyncCashBook(entry)) return;
    await walletEntryService.reverseWalletPayment({
      organizationId: entry.organizationId,
      branchId: entry.branchId,
      referenceId: entry._id,
      referenceModel: 'EmployeeLedger',
      direction: cashDirection(entry),
      amount: getCashBookAmount(entry),
      paymentMethod: String(entry.paymentMethod || '').trim().toLowerCase(),
      walletType: entry.walletType,
      userId: entry.updatedBy || entry.createdBy,
    });
  };

  if (cashDirection(entry) === 'in') {
    await reverseWallet();
    await cashBookService.deleteEntriesByReference(entry._id, 'EmployeeLedger');
  } else {
    await cashBookService.deleteEmployeeLedgerPaymentCashBook(entry, employeeName);
    await reverseWallet();
  }
  await expenseService.deleteExpenseByLedgerReference(
    entry._id,
    voucherOwned ? null : entry,
    voucherOwned ? null : entry.employee
  );
  await entry.deleteOne();
  await recalculateBalances(employeeId);
  return entry;
};

/**
 * One voucher line → one ledger row (+ its mirrored salary expense). Used by the Payment and
 * Receipt Voucher services, which own these rows from then on.
 * @param {Object} params
 * @param {'salary_payment'|'advance_payment'|'payment_received'} params.transactionType
 * @param {Object} params.voucher - header: _id, voucherNumber, date, bankAccountName, notes, createdBy, updatedBy
 * @param {'PaymentVoucher'|'ReceiptVoucher'} params.referenceModel
 */
const postVoucherEntry = async ({ organizationId, branchId, employeeId, transactionType, amount, description, voucher, referenceModel }) => {
  const incoming = transactionType === 'payment_received';
  const entry = await createLedgerEntry({
    organizationId,
    branchId,
    employee: employeeId,
    transactionType,
    transactionDate: voucher.date || voucher.createdAt || new Date(),
    reference: voucher.voucherNumber,
    referenceId: voucher._id,
    referenceModel,
    description,
    debit: incoming ? Number(amount) : 0,
    credit: incoming ? 0 : Number(amount),
    // Always the account by name — a cash-type account is still routed to the Cash Book by
    // isRealWalletPayment, a bank / mobile wallet moves its own balance.
    paymentMethod: 'wallet',
    walletType: voucher.bankAccountName,
    notes: voucher.notes || '',
    createdBy: voucher.updatedBy || voucher.createdBy,
    updatedBy: voucher.updatedBy || voucher.createdBy,
  });
  if (EXPENSE_SYNC_TYPES.has(transactionType)) {
    try {
      await syncExpenseForLedgerEntry(entry);
    } catch (error) {
      await deleteLedgerEntryById(entry._id, { organizationId, branchId }, { fromVoucher: true });
      throw error;
    }
  }
  return entry;
};

/** Undo `postVoucherEntry`. A row that is already gone is not an error — there is nothing to undo. */
const removeVoucherEntry = async (ledgerId, scope = {}) => {
  if (!ledgerId) return null;
  const exists = await EmployeeLedger.exists({ _id: ledgerId, ...getTenantFilter(scope) });
  if (!exists) return null;
  return deleteLedgerEntryById(ledgerId, scope, { fromVoucher: true });
};

/**
 * Reword a voucher-owned row (and the bank / Cash Book / expense rows it owns) without moving any
 * money — the voucher's equivalent of supplierLedger's updateLedgerEntryText.
 */
const updateVoucherEntryText = async (ledgerId, { description, notes }, scope = {}) => {
  const entry = await EmployeeLedger.findOne({ _id: ledgerId, ...getTenantFilter(scope) }).populate(
    'employee',
    'firstName lastName employeeId'
  );
  if (!entry) return null;
  if (description !== undefined) entry.description = description;
  if (notes !== undefined) entry.notes = notes;
  await entry.save();
  const wording = bookDescription(entry);
  await walletEntryService.updateDescriptionByReference(entry._id, 'EmployeeLedger', wording);
  await cashBookService.updateDescriptionByReference(entry._id, 'EmployeeLedger', wording);
  if (notes !== undefined) {
    await Expense.updateMany({ referenceId: entry._id, referenceModel: 'EmployeeLedger' }, { $set: { notes } });
  }
  return entry;
};

const queryLedgerEntries = async (filter, options) => {
  if (options.search) {
    addTokenSearch(filter, options.search, ['description', 'reference', 'paymentMethod']);
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

/**
 * The figures every employee screen shows, from a list of ledger rows.
 *
 * Sign convention (same as the stored running balance): + = the business owes the employee
 * (salary payable), − = the employee owes the business (advance / loan outstanding).
 */
const summarizeEntries = (entries) => {
  let totalPayable = 0;
  let totalSalaryPaid = 0;
  let totalAdvancePaid = 0;
  let totalAdvanceRecovered = 0;
  let totalCashReceived = 0;
  let currentBalance = 0;

  entries.forEach((entry) => {
    const debit = Number(entry.debit || 0);
    const credit = Number(entry.credit || 0);
    if (entry.transactionType === 'salary_payable') totalPayable += debit;
    if (entry.transactionType === 'salary_payment') totalSalaryPaid += credit;
    if (entry.transactionType === 'advance_payment') totalAdvancePaid += credit;
    if (entry.transactionType === 'advance_recovery') totalAdvanceRecovered += credit;
    if (entry.transactionType === 'payment_received') totalCashReceived += debit;
    // advance_recovery is a memo (see recalculateBalances) — every other row moves the balance.
    if (entry.transactionType !== 'advance_recovery') currentBalance += debit - credit;
  });

  const round = (n) => Math.round(n * 100) / 100;
  currentBalance = round(currentBalance);
  // Advance is real cash paid out, so it reduces the running ledger balance
  // immediately (same as a salary payment). advance_recovery is a bookkeeping
  // memo only used to track how much of that advance is considered "settled" —
  // it does not touch the balance again (that would double-count the cash).
  // Cash the employee handed back settles their advance too.
  const outstandingAdvance = round(Math.max(0, totalAdvancePaid - totalAdvanceRecovered - totalCashReceived));
  // payableNow is the actual cash cap the Pay button enforces — it accounts for
  // advances already given, so the same cash can't be paid out twice.
  const payableNow = Math.max(0, currentBalance);
  // remainingPayable is a display-only figure: gross salary that hasn't gone
  // through a salary_payment yet, deliberately ignoring any advance given.
  const remainingPayable = round(Math.max(0, totalPayable - totalSalaryPaid));
  return {
    totalPayable: round(totalPayable),
    totalSalaryPaid: round(totalSalaryPaid),
    totalAdvancePaid: round(totalAdvancePaid),
    totalAdvanceRecovered: round(totalAdvanceRecovered),
    totalCashReceived: round(totalCashReceived),
    outstandingAdvance,
    remainingPayable,
    payableNow,
    // What the employee owes the business right now (the − side of the balance).
    receivableNow: Math.max(0, -currentBalance),
    currentBalance,
    transactionCount: entries.length,
  };
};

const getEmployeeLedgerSummary = async (employeeId, scope = {}) => {
  const filter = { employee: employeeId };
  if (scope.organizationId) filter.organizationId = scope.organizationId;
  if (scope.branchId) filter.branchId = scope.branchId;

  const entries = await EmployeeLedger.find(filter).select('transactionType debit credit').lean();
  return summarizeEntries(entries);
};

const toObjectId = (value) =>
  value && mongoose.Types.ObjectId.isValid(String(value)) ? new mongoose.Types.ObjectId(String(value)) : value;

/**
 * Every employee of the branch with their ledger figures — ONE query for the rows (it used to be
 * one query per employee, which made the employee picker on a voucher slow for a big staff).
 */
const getAllEmployeesWithBalances = async (scope = {}) => {
  const employeeFilter = {};
  if (scope.organizationId) employeeFilter.organizationId = scope.organizationId;
  if (scope.branchId) employeeFilter.branchId = scope.branchId;

  const employees = await Employee.find(employeeFilter)
    .select('firstName lastName employeeId phone employmentStatus designation department salary')
    .populate('designation', 'name title')
    .populate('department', 'name')
    .lean();
  if (employees.length === 0) return [];

  const match = { employee: { $in: employees.map((employee) => employee._id) } };
  if (scope.organizationId) match.organizationId = toObjectId(scope.organizationId);
  if (scope.branchId) match.branchId = toObjectId(scope.branchId);
  const rows = await EmployeeLedger.find(match).select('employee transactionType debit credit transactionDate').lean();

  const byEmployee = new Map();
  rows.forEach((row) => {
    const key = String(row.employee);
    if (!byEmployee.has(key)) byEmployee.set(key, []);
    byEmployee.get(key).push(row);
  });

  return employees.map((employee) => {
    const entries = byEmployee.get(String(employee._id)) || [];
    const lastActivity = entries.reduce((latest, row) => {
      const at = row.transactionDate ? new Date(row.transactionDate).getTime() : 0;
      return at > latest ? at : latest;
    }, 0);
    return {
      id: String(employee._id),
      _id: employee._id,
      employeeId: employee.employeeId,
      name: `${employee.firstName} ${employee.lastName || ''}`.trim(),
      phone: employee.phone || '',
      employmentStatus: employee.employmentStatus || 'Active',
      designation: employee.designation?.name || employee.designation?.title || '',
      department: employee.department?.name || '',
      monthlySalary: Number(employee.salary?.basicSalary || 0) + Number(employee.salary?.allowances || 0),
      lastActivity: lastActivity ? new Date(lastActivity) : null,
      ...summarizeEntries(entries),
    };
  });
};

/**
 * A proper account statement for one employee over a period: opening balance (everything before
 * the period), each row with its running balance, period totals and the closing balance.
 * Running balances are worked out here, not read from the stored `balance`, so a statement is
 * right even for rows whose stored balance is stale.
 */
const getEmployeeStatement = async (employeeId, { startDate, endDate } = {}, scope = {}) => {
  const employee = await Employee.findOne({ _id: employeeId, ...getTenantFilter(scope) })
    .select('firstName lastName employeeId phone employmentStatus designation department joiningDate salary')
    .populate('designation', 'name title')
    .populate('department', 'name')
    .lean();
  if (!employee) throw new ApiError(httpStatus.NOT_FOUND, 'Employee not found');

  const entries = await EmployeeLedger.find({ employee: employeeId, ...getTenantFilter(scope) })
    .sort({ transactionDate: 1, createdAt: 1 })
    .populate('createdBy', 'name')
    .lean();

  const from = startDate ? new Date(startDate) : null;
  const to = endDate ? new Date(endDate) : null;
  const movesBalance = (row) => row.transactionType !== 'advance_recovery';

  let running = 0;
  let openingBalance = 0;
  const rows = [];
  const totals = { debit: 0, credit: 0 };
  entries.forEach((row) => {
    const at = new Date(row.transactionDate);
    const effect = movesBalance(row) ? Number(row.debit || 0) - Number(row.credit || 0) : 0;
    if (from && at < from) {
      running += effect;
      openingBalance = running;
      return;
    }
    if (to && at > to) return;
    running += effect;
    if (movesBalance(row)) {
      totals.debit += Number(row.debit || 0);
      totals.credit += Number(row.credit || 0);
    }
    rows.push({
      id: String(row._id),
      transactionDate: row.transactionDate,
      transactionType: row.transactionType,
      description: row.description,
      reference: row.reference || '',
      referenceId: row.referenceId ? String(row.referenceId) : null,
      referenceModel: row.referenceModel || null,
      paymentMethod: row.paymentMethod || '',
      walletType: row.walletType || '',
      notes: row.notes || '',
      debit: Number(row.debit || 0),
      credit: Number(row.credit || 0),
      // A memo row shows its amount but leaves the balance where it was.
      memo: !movesBalance(row),
      runningBalance: Math.round(running * 100) / 100,
      voucherOwned: isVoucherOwned(row),
      createdBy: row.createdBy?.name || '',
      createdAt: row.createdAt,
    });
  });

  const round = (n) => Math.round(n * 100) / 100;
  return {
    employee: {
      id: String(employee._id),
      employeeId: employee.employeeId,
      name: `${employee.firstName} ${employee.lastName || ''}`.trim(),
      phone: employee.phone || '',
      employmentStatus: employee.employmentStatus || 'Active',
      designation: employee.designation?.name || employee.designation?.title || '',
      department: employee.department?.name || '',
      joiningDate: employee.joiningDate || null,
      monthlySalary: Number(employee.salary?.basicSalary || 0) + Number(employee.salary?.allowances || 0),
    },
    period: { startDate: from, endDate: to },
    openingBalance: round(from ? openingBalance : 0),
    totals: { debit: round(totals.debit), credit: round(totals.credit) },
    closingBalance: round((from ? openingBalance : 0) + totals.debit - totals.credit),
    rows,
    summary: summarizeEntries(entries),
  };
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
    walletType,
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
      `Amount exceeds payable salary of ${formatMoney(outstandingPayable)}. Use the Advance button to pay extra.`
    );
  }

  if (recoveryAmount > outstandingAdvance) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Advance recovery exceeds outstanding advance of ${formatMoney(outstandingAdvance)}`);
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
      walletType: paymentMethod === 'wallet' ? walletType : undefined,
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
      walletType: paymentMethod === 'wallet' ? walletType : undefined,
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
  postVoucherEntry,
  removeVoucherEntry,
  updateVoucherEntryText,
  getEmployeeStatement,
  summarizeEntries,
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
