const mongoose = require('mongoose');
const setupTestDB = require('../utils/setupTestDB');
const {
  Organization,
  Expense,
  ExpenseCategory,
  AccountHead,
  JournalEntry,
  CashBookEntry,
  Wallet,
  Invoice,
} = require('../../src/models');
const expenseService = require('../../src/services/expense.service');
const expenseCategoryService = require('../../src/services/expenseCategory.service');
const reportsController = require('../../src/controllers/reports.controller');
const { RecurringExpense } = require('../../src/models');

/**
 * Direct vs indirect expenses, and the Excel import:
 *  - a category's type decides the expense's type (and an untouched category stays
 *    indirect, so existing businesses see no change);
 *  - direct expenses post under Cost of Sales, indirect ones where they always did;
 *  - re-classifying a category moves its history, without touching mirrored expenses;
 *  - P&L takes direct expenses off GROSS profit and leaves NET profit unchanged;
 *  - the import reports bad / duplicate rows one by one and moves money like a manual entry.
 */
setupTestDB();
jest.setTimeout(120000);

const id = () => new mongoose.Types.ObjectId();
let ORG;
let BRANCH;
const USER = id();

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

beforeEach(async () => {
  ORG = id();
  BRANCH = id();
  await Organization.create({ _id: ORG, name: 'Chenab Traders', owner: id(), businessType: 'retail' });
});

const ctx = () => ({ organizationId: ORG, branchId: BRANCH, createdBy: USER });

/** postExpenseToAccounts is fire-and-forget — wait for the journal to settle. */
const waitFor = async (check, label) => {
  for (let i = 0; i < 100; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const value = await check();
    if (value) return value;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timed out waiting for ${label}`);
};

/** The expense account an expense's live journal entry debits. */
const debitedAccount = async (expenseId) => {
  const entry = await waitFor(
    () =>
      JournalEntry.findOne({
        referenceModel: 'Expense',
        referenceId: expenseId,
        entryType: 'EXPENSE',
        status: 'posted',
        reversalOf: null,
      }).lean(),
    'journal entry'
  );
  const line = entry.lines.find((l) => l.debit > 0);
  return AccountHead.findById(line.accountId).lean();
};

const addExpense = (extra = {}) =>
  expenseService.createExpense({
    ...ctx(),
    category: 'Rent',
    description: 'Shop rent',
    amount: 1000,
    paymentMethod: 'Cash',
    date: new Date('2026-11-05T07:00:00.000Z'),
    ...extra,
  });

const directCategory = (name = 'Freight Inward') =>
  expenseCategoryService.createCategory({ name, expenseNature: 'direct' }, ORG, BRANCH, USER);

describe('classification and posting', () => {
  test('existing/default categories stay indirect and post to Miscellaneous Expense, as before', async () => {
    const expense = await addExpense();
    expect(expense.expenseNature).toBe('indirect');
    const account = await debitedAccount(expense._id);
    expect(account.code).toBe('5303');
  });

  test('a direct category makes a direct expense that posts under Cost of Sales', async () => {
    await directCategory();
    // The client cannot override it — the category decides.
    const expense = await addExpense({ category: 'freight inward', expenseNature: 'indirect', amount: 400 });
    expect(expense.expenseNature).toBe('direct');
    const account = await debitedAccount(expense._id);
    const parent = await AccountHead.findById(account.parentId).lean();
    expect(account.name).toBe('Direct Expenses');
    expect(parent.code).toBe('5100');
  });

  test('a category mapped to a specific expense account posts there', async () => {
    await addExpense(); // seeds the chart
    await waitFor(() => AccountHead.findOne({ organizationId: ORG, code: '5201' }), 'chart');
    await expenseCategoryService.createCategory({ name: 'Shop Rent', accountCode: '5201' }, ORG, BRANCH, USER);
    const expense = await addExpense({ category: 'Shop Rent' });
    const account = await debitedAccount(expense._id);
    expect(account.code).toBe('5201');
  });

  test('a mapping to a group or non-expense account is refused', async () => {
    await addExpense();
    await waitFor(() => AccountHead.findOne({ organizationId: ORG, code: '5200' }), 'chart');
    await expect(
      expenseCategoryService.createCategory({ name: 'Bad', accountCode: '5200' }, ORG, BRANCH, USER)
    ).rejects.toThrow(/group/);
    await expect(
      expenseCategoryService.createCategory({ name: 'Bad', accountCode: '1101' }, ORG, BRANCH, USER)
    ).rejects.toThrow(/not an expense account/);
  });

  test('changing a category to direct moves its history, but not mirrored (salary-style) expenses', async () => {
    const cat = await expenseCategoryService.createCategory({ name: 'Carriage' }, ORG, BRANCH, USER);
    const own = await addExpense({ category: 'Carriage', amount: 300 });
    expect((await debitedAccount(own._id)).code).toBe('5303');
    // An expense mirrored from another module never had its own journal entry.
    const mirrored = await expenseService.createExpense(
      { ...ctx(), category: 'Carriage', description: 'mirror', amount: 50, date: new Date() },
      { skipCashBookSync: true }
    );

    const updated = await expenseCategoryService.updateCategory(cat._id || cat.id, { expenseNature: 'direct' }, ORG);
    expect(updated.reclassified).toEqual({ updated: 2, reposted: 1 });

    expect((await Expense.findById(own._id)).expenseNature).toBe('direct');
    expect((await Expense.findById(mirrored._id)).expenseNature).toBe('direct');
    expect((await debitedAccount(own._id)).name).toBe('Direct Expenses');
    const mirroredEntries = await JournalEntry.countDocuments({ referenceId: mirrored._id });
    expect(mirroredEntries).toBe(0);
  });

  test('"only new expenses" leaves history as it was', async () => {
    const cat = await expenseCategoryService.createCategory({ name: 'Packing' }, ORG, BRANCH, USER);
    const old = await addExpense({ category: 'Packing' });
    await expenseCategoryService.updateCategory(cat._id || cat.id, { expenseNature: 'direct', applyToExisting: false }, ORG);
    expect((await Expense.findById(old._id)).expenseNature).toBe('indirect');
    const fresh = await addExpense({ category: 'Packing', description: 'new' });
    expect(fresh.expenseNature).toBe('direct');
  });

  test('list filter: indirect includes rows saved before the field existed', async () => {
    await directCategory();
    await addExpense({ category: 'Freight Inward' });
    await addExpense();
    await Expense.collection.insertOne({
      organizationId: ORG, branchId: BRANCH, category: 'Rent', description: 'legacy', amount: 5, date: new Date(),
    });
    const direct = await expenseService.queryExpenses({ organizationId: ORG, branchId: BRANCH }, { expenseNature: 'direct' });
    const indirect = await expenseService.queryExpenses({ organizationId: ORG, branchId: BRANCH }, { expenseNature: 'indirect' });
    expect(direct.totalResults).toBe(1);
    expect(indirect.totalResults).toBe(2);
  });
});

describe('profit & loss', () => {
  // catchAsync doesn't hand back its promise — resolve on send() / next(err) instead.
  const runFull = () =>
    new Promise((resolve, reject) => {
      const req = { organizationId: String(ORG), branchId: String(BRANCH), query: { from: '2026-11-01', to: '2026-11-30' } };
      const res = { status: () => res, send: (b) => resolve(b) };
      reportsController.getProfitLossFullReport(req, res, reject);
    });

  test('direct expenses come off gross profit; net profit is unchanged', async () => {
    await Invoice.collection.insertOne({
      organizationId: ORG,
      branchId: BRANCH,
      invoiceDate: new Date('2026-11-04T07:00:00.000Z'),
      status: 'paid',
      total: 10000,
      totalCost: 6000,
      totalProfit: 4000,
    });
    await directCategory();
    await addExpense({ category: 'Freight Inward', amount: 500 });
    await addExpense({ category: 'Rent', amount: 1000 });

    const pnl = await runFull();
    expect(pnl.revenue.salesProfit).toBe(4000);
    expect(pnl.revenue.directExpenses).toBe(500);
    expect(pnl.revenue.grossProfit).toBe(3500);
    expect(pnl.directExpenses).toBe(500);
    expect(pnl.indirectExpenses).toBe(1000);
    expect(pnl.expenses).toBe(1500);
    // Before this change: 4000 − 1500. Must still be the same figure.
    expect(pnl.netProfit).toBe(2500);
  });
});

describe('Excel import', () => {
  test('imports good rows, reports bad and duplicate ones per row, creates categories with their type', async () => {
    await Wallet.create({ organizationId: ORG, branchId: BRANCH, type: 'Meezan Bank', balance: 100000, isActive: true });
    await addExpense({ category: 'Rent', description: 'Shop rent', amount: 1000, date: new Date('2026-11-05T07:00:00.000Z') });

    const result = await expenseService.bulkImportExpenses(
      [
        { date: '2026-11-03', category: 'Freight Inward', expenseNature: 'Direct', description: 'Truck from Lahore', amount: '2,500', paymentMethod: 'Cash' },
        { date: '2026-11-03', category: 'Electricity', expenseNature: 'Indirect', description: 'LESCO bill', amount: 8000, paymentMethod: 'meezan bank', reference: 'LESCO-11' },
        { date: '2026-11-04', category: '', description: 'no category', amount: 10 },
        { date: '2026-11-04', category: 'Rent', description: 'zero', amount: 0 },
        { date: '2026-11-04', category: 'Rent', description: 'odd account', amount: 10, paymentMethod: 'JazzCash' },
        { date: '2026-11-05', category: 'rent', description: 'Shop rent', amount: 1000 },
        { date: '2026-11-06', category: 'Electricity', description: 'repeat', amount: 1, reference: 'lesco-11' },
        { date: 'not a date', category: 'Rent', description: 'bad date', amount: 10 },
      ],
      ctx()
    );

    expect(result.insertedCount).toBe(2);
    // Row 3 (amount 0) is a category-only row now: it creates "Rent" and posts nothing.
    expect(result.errors.map((e) => e.index)).toEqual([2, 4, 7]);
    expect(result.skipped.map((e) => e.index)).toEqual([3, 5, 6]);
    expect(result.skipped[0].categoryOnly).toBe(true);
    expect(result.createdCategories.sort()).toEqual(['Electricity', 'Freight Inward', 'Rent']);
    expect(result.directAmount).toBe(2500);
    expect(result.indirectAmount).toBe(8000);

    const freight = await ExpenseCategory.findOne({ organizationId: ORG, name: 'Freight Inward' }).lean();
    expect(freight.expenseNature).toBe('direct');
    const bill = await Expense.findOne({ organizationId: ORG, reference: 'LESCO-11' }).lean();
    expect(bill.paymentMethod).toBe('Wallet');
    expect(bill.walletType).toBe('Meezan Bank');
    expect(bill.expenseNature).toBe('indirect');
    // Paid rows move money exactly like the Add Expense form.
    const cash = await CashBookEntry.findOne({ referenceModel: 'Expense', referenceId: (await Expense.findOne({ description: 'Truck from Lahore' }))._id });
    expect(cash).toBeTruthy();
    const wallet = await Wallet.findOne({ organizationId: ORG, type: 'Meezan Bank' }).lean();
    expect(wallet.balance).toBe(92000);
  });

  test('unpaid mode records pending bills that move no money', async () => {
    const result = await expenseService.bulkImportExpenses(
      [{ date: '2026-10-01', category: 'Rent', description: 'October rent', amount: 20000 }],
      ctx(),
      { paymentStatus: 'unpaid' }
    );
    expect(result.insertedCount).toBe(1);
    const expense = await Expense.findOne({ description: 'October rent' }).lean();
    expect(expense.isPaid).toBe(false);
    expect(await CashBookEntry.countDocuments({ referenceId: expense._id })).toBe(0);
  });

  test('without "create missing categories", unknown categories are row errors', async () => {
    await expenseCategoryService.createCategory({ name: 'Rent' }, ORG, BRANCH, USER);
    const result = await expenseService.bulkImportExpenses(
      [{ category: 'Mystery', description: 'x', amount: 5 }, { category: 'Rent', description: 'y', amount: 5 }],
      ctx(),
      { createMissingCategories: false }
    );
    expect(result.insertedCount).toBe(1);
    expect(result.errors[0]).toMatchObject({ index: 0, error: 'Category "Mystery" does not exist' });
    // No date → dated today, with a note.
    expect(result.warnings[0].message).toMatch(/dated today/);
  });

  test('a Type that disagrees with an existing category is noted, and the category wins', async () => {
    await directCategory();
    const result = await expenseService.bulkImportExpenses(
      [{ date: '2026-11-02', category: 'Freight Inward', expenseNature: 'Indirect', description: 'z', amount: 5 }],
      ctx()
    );
    expect(result.insertedCount).toBe(1);
    expect(result.warnings[0].message).toMatch(/set up as Direct/);
    expect((await Expense.findOne({ description: 'z' })).expenseNature).toBe('direct');
  });
});

describe('default categories', () => {
  const makeDefault = (name) =>
    ExpenseCategory.create({ organizationId: ORG, branchId: BRANCH, name, transactionType: 'business_expense', isDefault: true });

  test('business expense categories are no longer created automatically', async () => {
    expect(await expenseCategoryService.getCategories(ORG, BRANCH, USER, 'business_expense')).toHaveLength(0);
    // Personal-ledger types keep their starter lists.
    expect((await expenseCategoryService.getCategories(ORG, BRANCH, USER, 'income')).length).toBeGreaterThan(0);
  });

  test('an old default category can be deleted and does not come back', async () => {
    const rent = await makeDefault('Rent');
    await expenseCategoryService.deleteCategory(rent._id, ORG);
    expect(await expenseCategoryService.getCategories(ORG, BRANCH, USER, 'business_expense')).toHaveLength(0);
  });

  test('deleting with "move to" moves expenses and recurring rules, and they take the new type', async () => {
    const old = await makeDefault('Transportation');
    const target = await directCategory('Carriage Inward');
    const e1 = await addExpense({ category: 'transportation', amount: 700 });
    await RecurringExpense.collection.insertOne({ organizationId: ORG, branchId: BRANCH, category: 'Transportation', amount: 1 });
    expect((await debitedAccount(e1._id)).code).toBe('5303');

    const result = await expenseCategoryService.deleteCategory(old._id, ORG, { moveToId: target._id || target.id });
    expect(result.moved).toEqual({ to: 'Carriage Inward', expenses: 1, recurringRules: 1 });
    const moved = await Expense.findById(e1._id).lean();
    expect(moved.category).toBe('Carriage Inward');
    expect(moved.expenseNature).toBe('direct');
    expect((await debitedAccount(e1._id)).name).toBe('Direct Expenses');
    expect(await ExpenseCategory.countDocuments({ _id: old._id })).toBe(0);
  });

  test('"remove unused" clears unused defaults only, keeping used ones and the user\'s own', async () => {
    await makeDefault('Insurance');
    await makeDefault('Tax');
    await makeDefault('Rent');
    await expenseCategoryService.createCategory({ name: 'My Own' }, ORG, BRANCH, USER);
    await addExpense({ category: 'Rent' });
    const usage = await expenseCategoryService.getCategoryUsage(ORG, BRANCH);
    expect(usage.rent.expenses).toBe(1);

    const result = await expenseCategoryService.removeUnusedCategories(ORG, BRANCH, { onlyDefaults: true });
    expect(result.removed.sort()).toEqual(['Insurance', 'Tax']);
    const left = (await ExpenseCategory.find({ organizationId: ORG }).lean()).map((c) => c.name).sort();
    expect(left).toEqual(['My Own', 'Rent']);
  });

  test('a category can be switched off and on; history is untouched', async () => {
    const cat = await expenseCategoryService.createCategory({ name: 'Courier' }, ORG, BRANCH, USER);
    const e = await addExpense({ category: 'Courier' });
    const off = await expenseCategoryService.updateCategory(cat._id || cat.id, { isActive: false }, ORG);
    expect(off.isActive).toBe(false);
    expect(off.reclassified).toBeUndefined();
    expect((await Expense.findById(e._id).lean()).category).toBe('Courier');
    const on = await expenseCategoryService.updateCategory(cat._id || cat.id, { isActive: true }, ORG);
    expect(on.isActive).toBe(true);
  });
});

describe('expense voucher (several expenses at once)', () => {
  const setup = async () => {
    await Wallet.create({ organizationId: ORG, branchId: BRANCH, type: 'HBL Current', balance: 50000, isActive: true });
    await expenseCategoryService.createCategory({ name: 'Rent' }, ORG, BRANCH, USER);
    await directCategory('Freight Inward');
  };

  test('saves every line as its own expense under one voucher number, moving money like Add Expense', async () => {
    await setup();
    const result = await expenseService.createExpenseVoucher(
      {
        date: '2026-11-07',
        paymentMethod: 'Wallet',
        walletType: 'HBL Current',
        reference: 'EV-REF',
        lines: [
          { category: 'rent', description: 'Shop rent', amount: 20000 },
          { category: 'Freight Inward', description: 'Truck', vendor: 'Daewoo', amount: 3000 },
          { category: '', amount: '' }, // blank grid row — ignored
        ],
      },
      ctx()
    );
    expect(result.voucherNumber).toMatch(/^EV-\d{6}$/);
    expect(result.expenses).toHaveLength(2);
    expect(result.total).toBe(23000);
    expect(result.directAmount).toBe(3000);
    const saved = await Expense.find({ voucherNumber: result.voucherNumber }).lean();
    expect(saved.map((e) => [e.category, e.expenseNature, e.walletType, e.reference]).sort()).toEqual([
      ['Freight Inward', 'direct', 'HBL Current', 'EV-REF'],
      ['Rent', 'indirect', 'HBL Current', 'EV-REF'],
    ]);
    expect((await Wallet.findOne({ organizationId: ORG, type: 'HBL Current' }).lean()).balance).toBe(27000);
    expect((await debitedAccount(saved.find((e) => e.category === 'Freight Inward')._id)).name).toBe('Direct Expenses');

    const next = await expenseService.createExpenseVoucher({ lines: [{ category: 'Rent', amount: 1 }] }, ctx());
    expect(Number(next.voucherNumber.slice(3))).toBe(Number(result.voucherNumber.slice(3)) + 1);
  });

  test('all or nothing: one bad line and nothing is written', async () => {
    await setup();
    const cat = await expenseCategoryService.createCategory({ name: 'Old Head' }, ORG, BRANCH, USER);
    await expenseCategoryService.updateCategory(cat._id || cat.id, { isActive: false }, ORG);
    await expect(
      expenseService.createExpenseVoucher(
        {
          lines: [
            { category: 'Rent', amount: 100 },
            { category: 'Nope', amount: 5 },
            { category: 'Rent', amount: 0 },
            { category: 'Old Head', amount: 5 },
          ],
        },
        ctx()
      )
    ).rejects.toThrow(/Line 2: category "Nope" does not exist; Line 3: amount must be more than 0; Line 4: category "Old Head" is inactive/);
    expect(await Expense.countDocuments({ organizationId: ORG })).toBe(0);
    await expect(
      expenseService.createExpenseVoucher({ paymentMethod: 'Wallet', walletType: 'Ghost Bank', lines: [{ category: 'Rent', amount: 1 }] }, ctx())
    ).rejects.toThrow(/Ghost Bank/);
  });
});

describe('importing category names only', () => {
  test('expense import: rows with no amount (blank or 0) create the category and post nothing', async () => {
    await expenseCategoryService.createCategory({ name: 'Rent' }, ORG, BRANCH, USER);
    const result = await expenseService.bulkImportExpenses(
      [
        { category: 'Carriage Inward', expenseNature: 'Direct' }, // blank amount
        { category: 'Office Tea', amount: 0, date: 'garbage', paymentMethod: 'Nowhere Bank' }, // 0 → date/account not checked
        { category: 'Rent', amount: '' }, // exists already
        { category: 'carriage inward', amount: '' }, // same category again
        { category: 'Rent', amount: '-5' }, // negative is still an error
        { category: 'Rent', amount: 1500, description: 'Real one', date: '2026-11-03' },
      ],
      ctx()
    );
    expect(result.insertedCount).toBe(1);
    expect(result.categoryOnlyCount).toBe(4);
    expect(result.createdCategories.sort()).toEqual(['Carriage Inward', 'Office Tea']);
    expect(result.errors.map((e) => e.index)).toEqual([4]);
    expect(result.skipped.map((s) => [s.index, s.categoryOnly])).toEqual([[0, true], [1, true], [2, true], [3, true]]);
    expect(result.skipped[0].reason).toMatch(/category "Carriage Inward" created \(Direct\)/);
    expect(result.skipped[2].reason).toMatch(/already exists/);
    expect(result.skipped[3].reason).toMatch(/already exists/);
    expect((await ExpenseCategory.findOne({ organizationId: ORG, name: 'Carriage Inward' }).lean()).expenseNature).toBe('direct');
    expect(await Expense.countDocuments({ organizationId: ORG })).toBe(1);
    expect(await CashBookEntry.countDocuments({ organizationId: ORG })).toBe(1);
  });

  test('category-only rows with "create categories" off are errors when the category is missing', async () => {
    const result = await expenseService.bulkImportExpenses([{ category: 'Ghost', amount: '' }], ctx(), { createMissingCategories: false });
    expect(result.errors[0].error).toMatch(/does not exist/);
    expect(await ExpenseCategory.countDocuments({ organizationId: ORG })).toBe(0);
  });

  test('category import: names only, or with type / colour / status; skip vs update existing', async () => {
    await addExpense({ category: 'Packing' }); // seeds chart + a saved expense
    await expenseCategoryService.createCategory({ name: 'Packing' }, ORG, BRANCH, USER);
    await waitFor(() => AccountHead.findOne({ organizationId: ORG, code: '5201' }), 'chart');

    const first = await expenseCategoryService.bulkImportCategories(
      [
        { name: 'Rent' },
        { name: ' Freight   Inward ', expenseNature: 'Direct', color: '#d97706' },
        { name: 'Old Head', isActive: 'Inactive' },
        { name: 'Shop Rent', accountCode: '5201', color: 'red' },
        { name: 'rent' }, // repeated in file
        { name: '' },
        { name: 'Packing', expenseNature: 'Direct' }, // exists → skipped by default
        { name: 'Weird', expenseNature: 'sometimes', isActive: 'maybe', accountCode: '9999' },
      ],
      ctx()
    );
    expect(first.insertedCount).toBe(5);
    expect(first.errors.map((e) => e.index)).toEqual([5]);
    expect(first.skipped.map((s) => s.index)).toEqual([4, 6]);
    expect(first.warnings.map((w) => w.index)).toEqual([3, 7]);
    const cats = Object.fromEntries((await ExpenseCategory.find({ organizationId: ORG }).lean()).map((c) => [c.name, c]));
    expect(cats['Freight Inward'].expenseNature).toBe('direct');
    expect(cats['Freight Inward'].color).toBe('#d97706');
    expect(cats['Old Head'].isActive).toBe(false);
    expect(cats['Shop Rent'].accountCode).toBe('5201');
    expect(cats.Weird.expenseNature).toBe('indirect');
    expect(cats.Weird.accountCode).toBeNull();

    // update: a type change re-classifies that category's saved expenses
    const second = await expenseCategoryService.bulkImportCategories([{ name: 'packing', expenseNature: 'Direct' }], ctx(), {
      duplicateStrategy: 'update',
    });
    expect(second.updatedCount).toBe(1);
    expect(second.reclassifiedExpenses).toBe(1);
    expect((await Expense.findOne({ organizationId: ORG, category: 'Packing' }).lean()).expenseNature).toBe('direct');
  });
});
