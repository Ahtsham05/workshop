const mongoose = require('mongoose');
const setupTestDB = require('../../utils/setupTestDB');
const {
  Wallet,
  Employee,
  EmployeeLedger,
  WalletEntry,
  CashBookEntry,
  Expense,
  PaymentVoucher,
  ReceiptVoucher,
} = require('../../../src/models');
const cashBookService = require('../../../src/services/cashBook.service');
const employeeLedgerService = require('../../../src/services/employeeLedger.service');
const paymentVoucherService = require('../../../src/services/paymentVoucher.service');
const receiptVoucherService = require('../../../src/services/receiptVoucher.service');

/**
 * Employees on Payment / Receipt Vouchers — salary and advances paid out, cash received back —
 * pinned against a real in-memory MongoDB. The employee ledger, the bank / Cash Book and the
 * salary expense must move together, exactly once, and nothing may be left half-posted.
 */
setupTestDB();
jest.setTimeout(60000);

const ORG = new mongoose.Types.ObjectId();
const BRANCH = new mongoose.Types.ObjectId();
const USER = new mongoose.Types.ObjectId();
const EDITOR = new mongoose.Types.ObjectId();
const scope = { organizationId: ORG, branchId: BRANCH };
const user = { id: USER, name: 'Tester' };

const makeWallet = (type, balance, accountType = 'bank') => Wallet.create({ ...scope, type, accountType, balance });
const balanceOf = async (wallet) => (await Wallet.findById(wallet._id)).balance;
const tillBalance = async () => (await cashBookService.getCashInHandSummary(scope)).closingBalance;
const summaryOf = (employee) => employeeLedgerService.getEmployeeLedgerSummary(employee._id, scope);

let seq = 0;
const makeEmployee = (firstName, lastName = 'Raza', extra = {}) => {
  seq += 1;
  return Employee.create({
    ...scope,
    employeeId: `EMP-${seq}`,
    firstName,
    lastName,
    email: `emp${seq}@example.com`,
    phone: '03000000000',
    gender: 'Male',
    department: new mongoose.Types.ObjectId(),
    joiningDate: new Date('2026-01-01'),
    salary: { basicSalary: 30000 },
    ...extra,
  });
};

/** Payroll accrual — what the business owes the employee for a month. */
const accrue = (employee, amount, date = new Date('2026-10-01')) =>
  employeeLedgerService.createLedgerEntry({
    ...scope,
    employee: employee._id,
    transactionType: 'salary_payable',
    transactionDate: date,
    reference: 'PAYROLL-10-2026',
    description: 'Salary payable for 10/2026',
    debit: amount,
    credit: 0,
  });

const pay = (bank, lines, date) =>
  paymentVoucherService.createVoucher({ ...scope, bankAccountId: bank._id, lines, ...(date ? { date } : {}) }, USER, {
    user,
  });
const receive = (bank, lines) =>
  receiptVoucherService.createVoucher({ ...scope, bankAccountId: bank._id, lines }, USER, { user });
const editPayment = (voucher, lines, extra = {}) =>
  paymentVoucherService.updateVoucher(
    voucher._id,
    scope,
    { bankAccountId: voucher.bankAccountId, lines, ...extra },
    EDITOR,
    { user }
  );
const editReceipt = (voucher, lines) =>
  receiptVoucherService.updateVoucher(voucher._id, scope, { bankAccountId: voucher.bankAccountId, lines }, EDITOR, { user });

const salaryLine = (employee, amount, extra = {}) => ({
  payeeType: 'employee',
  employeeId: employee._id,
  employeePurpose: 'salary',
  amount,
  ...extra,
});
const advanceLine = (employee, amount, extra = {}) => ({
  payeeType: 'employee',
  employeeId: employee._id,
  employeePurpose: 'advance',
  amount,
  ...extra,
});
const receiptLine = (employee, amount, extra = {}) => ({
  sourceType: 'employee',
  employeeId: employee._id,
  amount,
  ...extra,
});

const asPlainLine = (line) => ({
  id: String(line._id),
  payeeType: line.payeeType,
  employeeId: String(line.employeeId),
  employeePurpose: line.employeePurpose,
  amount: line.amount,
  description: line.description,
});

describe('Payment Voucher — employee lines', () => {
  test('salary: posts on the employee ledger, leaves the bank once, and lands in Expenses as a staff cost', async () => {
    const hbl = await makeWallet('HBL', 50000);
    const ali = await makeEmployee('Ali');
    await accrue(ali, 30000);

    const voucher = await pay(hbl, [salaryLine(ali, 20000, { description: 'October salary' })]);
    const [line] = voucher.lines;
    expect(line.payeeName).toBe('Ali Raza');
    expect(line.employeeName).toBe('Ali Raza');
    expect(line.employeePurpose).toBe('salary');
    expect(line.employeeLedgerEntryId).toBeDefined();

    const entry = await EmployeeLedger.findById(line.employeeLedgerEntryId);
    expect(entry.transactionType).toBe('salary_payment');
    expect(entry.credit).toBe(20000);
    expect(entry.debit).toBe(0);
    expect(entry.reference).toBe(voucher.voucherNumber);
    expect(entry.referenceModel).toBe('PaymentVoucher');
    expect(String(entry.referenceId)).toBe(String(voucher._id));
    expect(entry.balance).toBe(10000); // 30000 earned − 20000 paid

    expect(await balanceOf(hbl)).toBe(30000);
    // Exactly one bank movement — the ledger owns it, the voucher must not post a second one.
    expect(await WalletEntry.countDocuments({ ...scope, type: 'out' })).toBe(1);
    expect(await WalletEntry.countDocuments({ referenceModel: 'PaymentVoucher' })).toBe(0);
    // A real bank account gets no Cash Book line.
    expect(await CashBookEntry.countDocuments({ referenceModel: 'EmployeeLedger' })).toBe(0);

    const expenses = await Expense.find({ referenceId: entry._id, referenceModel: 'EmployeeLedger' });
    expect(expenses).toHaveLength(1);
    expect(expenses[0].amount).toBe(20000);

    const summary = await summaryOf(ali);
    expect(summary.payableNow).toBe(10000);
    expect(summary.totalSalaryPaid).toBe(20000);
  });

  test('salary above what is payable is refused before anything is written', async () => {
    const hbl = await makeWallet('HBL', 50000);
    const ali = await makeEmployee('Ali');
    await accrue(ali, 10000);

    await expect(pay(hbl, [salaryLine(ali, 12000)])).rejects.toThrow(/more than the payable salary/);
    // Two salary lines for the same employee add up.
    await expect(pay(hbl, [salaryLine(ali, 6000), salaryLine(ali, 6000)])).rejects.toThrow(/more than the payable salary/);

    expect(await PaymentVoucher.countDocuments()).toBe(0);
    expect(await EmployeeLedger.countDocuments({ transactionType: 'salary_payment' })).toBe(0);
    expect(await balanceOf(hbl)).toBe(50000);
  });

  test('salary up to payable plus an advance for the rest is accepted in one voucher', async () => {
    const hbl = await makeWallet('HBL', 50000);
    const ali = await makeEmployee('Ali');
    await accrue(ali, 10000);

    await pay(hbl, [salaryLine(ali, 10000), advanceLine(ali, 5000)]);
    const summary = await summaryOf(ali);
    expect(summary.currentBalance).toBe(-5000); // he owes 5000 back
    expect(summary.outstandingAdvance).toBe(5000);
    expect(summary.receivableNow).toBe(5000);
    expect(await balanceOf(hbl)).toBe(35000);
    // An advance is money owed back, not a cost.
    expect(await Expense.countDocuments()).toBe(1);
  });

  test('an advance from Cash in Hand leaves the till exactly once (no double subtraction)', async () => {
    const cash = await makeWallet('Cash in Hand', 0, 'cash');
    await cashBookService.setOpeningBalance(scope, 1000);
    const ali = await makeEmployee('Ali');

    // Rs600 out of a Rs1000 till: posting the Cash Book entry before the wallet check used to
    // subtract it twice (1000 − 600 − 600 < 0) and refuse a payment the till can cover.
    const voucher = await pay(cash, [advanceLine(ali, 600)]);
    expect(await tillBalance()).toBe(400);
    const book = await CashBookEntry.find({ referenceModel: 'EmployeeLedger' });
    expect(book).toHaveLength(1);
    expect(book[0].type).toBe('expense');
    expect(book[0].paymentMethod).toBe('cash');
    expect(book[0].description).toContain(voucher.voucherNumber);

    // More than the till holds: refused, nothing left behind.
    await expect(pay(cash, [advanceLine(ali, 500)])).rejects.toThrow(/insufficient/i);
    expect(await tillBalance()).toBe(400);
    expect(await EmployeeLedger.countDocuments()).toBe(1);
  });

  test('a ledger row a voucher owns cannot be edited or deleted from the employee ledger', async () => {
    const hbl = await makeWallet('HBL', 50000);
    const ali = await makeEmployee('Ali');
    const voucher = await pay(hbl, [advanceLine(ali, 2000)]);
    const id = voucher.lines[0].employeeLedgerEntryId;

    await expect(employeeLedgerService.updateLedgerEntryById(id, { credit: 1 }, scope)).rejects.toThrow(
      /Payments & Receipts/
    );
    await expect(employeeLedgerService.deleteLedgerEntryById(id, scope)).rejects.toThrow(/Payments & Receipts/);
    expect((await EmployeeLedger.findById(id)).credit).toBe(2000);
  });

  test('an employee of another branch cannot be paid', async () => {
    const hbl = await makeWallet('HBL', 50000);
    const other = await Employee.create({
      organizationId: ORG,
      branchId: new mongoose.Types.ObjectId(),
      employeeId: 'X-1',
      firstName: 'Other',
      lastName: 'Branch',
      email: 'x@example.com',
      phone: '0300',
      gender: 'Male',
      department: new mongoose.Types.ObjectId(),
      joiningDate: new Date(),
      salary: { basicSalary: 1 },
    });
    await expect(pay(hbl, [advanceLine(other, 100)])).rejects.toThrow(/Employee not found/);
    expect(await balanceOf(hbl)).toBe(50000);
  });

  describe('editing', () => {
    test('a wording-only edit rewrites the text and leaves every ledger row where it is', async () => {
      const hbl = await makeWallet('HBL', 50000);
      const ali = await makeEmployee('Ali');
      await accrue(ali, 30000);
      const voucher = await pay(hbl, [salaryLine(ali, 10000)]);
      const before = voucher.lines[0].employeeLedgerEntryId;

      const updated = await editPayment(voucher, [{ ...asPlainLine(voucher.lines[0]), description: 'Oct salary (part)' }]);
      expect(String(updated.lines[0].employeeLedgerEntryId)).toBe(String(before));
      const entry = await EmployeeLedger.findById(before);
      expect(entry.description).toContain('Oct salary (part)');
      expect(await balanceOf(hbl)).toBe(40000);
    });

    test('switching salary → advance re-posts the line: the staff expense goes, the advance stays owed', async () => {
      const hbl = await makeWallet('HBL', 50000);
      const ali = await makeEmployee('Ali');
      await accrue(ali, 30000);
      const voucher = await pay(hbl, [salaryLine(ali, 10000)]);

      const updated = await editPayment(voucher, [{ ...asPlainLine(voucher.lines[0]), employeePurpose: 'advance' }]);
      const entry = await EmployeeLedger.findById(updated.lines[0].employeeLedgerEntryId);
      expect(entry.transactionType).toBe('advance_payment');
      expect(await EmployeeLedger.countDocuments({ transactionType: 'salary_payment' })).toBe(0);
      expect(await Expense.countDocuments()).toBe(0);
      expect(await balanceOf(hbl)).toBe(40000);
      expect(await WalletEntry.countDocuments({ ...scope, type: 'out' })).toBe(1);
    });

    test('raising a salary line is checked against payable once its own old amount is handed back', async () => {
      const hbl = await makeWallet('HBL', 50000);
      const ali = await makeEmployee('Ali');
      await accrue(ali, 30000);
      const voucher = await pay(hbl, [salaryLine(ali, 20000)]);

      // 30000 payable − 20000 already paid by THIS line = 10000 now; raising the line to 30000 is fine.
      const updated = await editPayment(voucher, [{ ...asPlainLine(voucher.lines[0]), amount: 30000 }]);
      expect(updated.totalAmount).toBe(30000);
      expect(await balanceOf(hbl)).toBe(20000);
      await expect(editPayment(updated, [{ ...asPlainLine(updated.lines[0]), amount: 30001 }])).rejects.toThrow(
        /more than the payable salary/
      );
      expect(await balanceOf(hbl)).toBe(20000);
    });
  });

  test('deleting the voucher reverses the ledger row, the expense and the bank', async () => {
    const hbl = await makeWallet('HBL', 50000);
    const ali = await makeEmployee('Ali');
    await accrue(ali, 30000);
    const voucher = await pay(hbl, [salaryLine(ali, 10000), advanceLine(ali, 2000)]);

    await paymentVoucherService.deleteVoucherById(voucher._id, scope);
    expect(await balanceOf(hbl)).toBe(50000);
    expect(await EmployeeLedger.countDocuments({ referenceModel: 'PaymentVoucher' })).toBe(0);
    expect(await Expense.countDocuments()).toBe(0);
    expect(await WalletEntry.countDocuments({ referenceModel: 'EmployeeLedger' })).toBe(0);
    expect((await summaryOf(ali)).payableNow).toBe(30000);
  });
});

describe('Receipt Voucher — employee lines', () => {
  test('cash received from an employee settles their advance and comes into the bank', async () => {
    const hbl = await makeWallet('HBL', 50000);
    const ali = await makeEmployee('Ali');
    await pay(hbl, [advanceLine(ali, 5000)]);
    expect(await balanceOf(hbl)).toBe(45000);

    const voucher = await receive(hbl, [receiptLine(ali, 3000, { description: 'Advance returned' })]);
    const [line] = voucher.lines;
    expect(line.payerName).toBe('Ali Raza');
    expect(line.employeeName).toBe('Ali Raza');

    const entry = await EmployeeLedger.findById(line.employeeLedgerEntryId);
    expect(entry.transactionType).toBe('payment_received');
    expect(entry.debit).toBe(3000);
    expect(entry.credit).toBe(0);
    expect(entry.referenceModel).toBe('ReceiptVoucher');
    expect(entry.balance).toBe(-2000);

    expect(await balanceOf(hbl)).toBe(48000);
    expect(await WalletEntry.countDocuments({ ...scope, type: 'in' })).toBe(1);
    expect(await WalletEntry.countDocuments({ referenceModel: 'ReceiptVoucher' })).toBe(0);
    expect(await Expense.countDocuments()).toBe(0);

    const summary = await summaryOf(ali);
    expect(summary.totalCashReceived).toBe(3000);
    expect(summary.outstandingAdvance).toBe(2000);
    expect(summary.currentBalance).toBe(-2000);
  });

  test('received into Cash in Hand: one income line in the Cash Book, the till goes up once', async () => {
    const cash = await makeWallet('Cash in Hand', 0, 'cash');
    await cashBookService.setOpeningBalance(scope, 1000);
    const ali = await makeEmployee('Ali');

    await receive(cash, [receiptLine(ali, 700)]);
    expect(await tillBalance()).toBe(1700);
    const book = await CashBookEntry.find({ referenceModel: 'EmployeeLedger' });
    expect(book).toHaveLength(1);
    expect(book[0].type).toBe('income');
    expect(book[0].paymentMethod).toBe('cash');
  });

  test('a receipt whose money was already spent cannot be deleted — and nothing is touched', async () => {
    const hbl = await makeWallet('HBL', 0);
    const ali = await makeEmployee('Ali');
    const voucher = await receive(hbl, [receiptLine(ali, 3000)]);
    // Spend it.
    const supplierLike = await makeEmployee('Sara', 'Khan');
    await pay(hbl, [advanceLine(supplierLike, 3000)]);
    expect(await balanceOf(hbl)).toBe(0);

    await expect(receiptVoucherService.deleteVoucherById(voucher._id, scope)).rejects.toThrow(/insufficient/i);
    expect(await ReceiptVoucher.countDocuments()).toBe(1);
    expect(await EmployeeLedger.countDocuments({ transactionType: 'payment_received' })).toBe(1);
  });

  test('changing the amount re-posts the line through the ledger', async () => {
    const hbl = await makeWallet('HBL', 0);
    const ali = await makeEmployee('Ali');
    const voucher = await receive(hbl, [receiptLine(ali, 3000)]);
    const updated = await editReceipt(voucher, [
      { id: String(voucher.lines[0]._id), sourceType: 'employee', employeeId: String(ali._id), amount: 2500 },
    ]);
    expect(updated.totalAmount).toBe(2500);
    expect(await balanceOf(hbl)).toBe(2500);
    expect(await EmployeeLedger.countDocuments({ transactionType: 'payment_received' })).toBe(1);
    expect((await summaryOf(ali)).currentBalance).toBe(2500);
  });
});

describe('Employee ledger — statement and balances', () => {
  test('statement: opening balance, running balance per row, period totals and closing', async () => {
    const hbl = await makeWallet('HBL', 100000);
    const ali = await makeEmployee('Ali');
    await accrue(ali, 30000, new Date('2026-09-01'));
    await pay(hbl, [salaryLine(ali, 30000)], new Date('2026-09-28'));
    await accrue(ali, 30000, new Date('2026-10-01'));
    await pay(hbl, [salaryLine(ali, 25000), advanceLine(ali, 8000)], new Date('2026-10-20'));
    await receive(hbl, [receiptLine(ali, 1000)]);
    await ReceiptVoucher.updateMany({}, { $set: { date: new Date('2026-10-25') } });
    await EmployeeLedger.updateMany(
      { transactionType: 'payment_received' },
      { $set: { transactionDate: new Date('2026-10-25') } }
    );

    const statement = await employeeLedgerService.getEmployeeStatement(
      ali._id,
      { startDate: new Date('2026-10-01'), endDate: new Date('2026-10-31T23:59:59') },
      scope
    );
    expect(statement.employee.name).toBe('Ali Raza');
    expect(statement.openingBalance).toBe(0); // September settled in full
    expect(statement.rows.map((row) => row.transactionType)).toEqual([
      'salary_payable',
      'salary_payment',
      'advance_payment',
      'payment_received',
    ]);
    expect(statement.rows.map((row) => row.runningBalance)).toEqual([30000, 5000, -3000, -2000]);
    expect(statement.totals).toEqual({ debit: 31000, credit: 33000 });
    expect(statement.closingBalance).toBe(-2000);
    expect(statement.rows[1].voucherOwned).toBe(true);
    expect(statement.rows[0].voucherOwned).toBe(false);

    const september = await employeeLedgerService.getEmployeeStatement(
      ali._id,
      { startDate: new Date('2026-09-01'), endDate: new Date('2026-09-30T23:59:59') },
      scope
    );
    expect(september.closingBalance).toBe(0);
    expect(september.rows).toHaveLength(2);
  });

  test('every employee with balances, from one ledger read', async () => {
    const hbl = await makeWallet('HBL', 100000);
    const ali = await makeEmployee('Ali');
    const sara = await makeEmployee('Sara', 'Khan');
    await makeEmployee('Idle', 'Person');
    await accrue(ali, 30000);
    await pay(hbl, [advanceLine(sara, 4000)]);

    const rows = await employeeLedgerService.getAllEmployeesWithBalances(scope);
    const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
    expect(byName['Ali Raza'].payableNow).toBe(30000);
    expect(byName['Ali Raza'].receivableNow).toBe(0);
    expect(byName['Sara Khan'].receivableNow).toBe(4000);
    expect(byName['Sara Khan'].outstandingAdvance).toBe(4000);
    expect(byName['Idle Person'].currentBalance).toBe(0);
    expect(byName['Idle Person'].transactionCount).toBe(0);
  });

  test('Pay Employee from Cash in Hand: the till can pay out all it holds (regression)', async () => {
    await makeWallet('Cash in Hand', 0, 'cash');
    await cashBookService.setOpeningBalance(scope, 1000);
    const ali = await makeEmployee('Ali');
    await accrue(ali, 1000);

    await employeeLedgerService.payEmployee({
      ...scope,
      employee: ali._id,
      amount: 1000,
      paymentMethod: 'wallet',
      walletType: 'Cash in Hand',
      createdBy: USER,
    });
    expect(await tillBalance()).toBe(0);
    expect((await summaryOf(ali)).payableNow).toBe(0);
  });
});
