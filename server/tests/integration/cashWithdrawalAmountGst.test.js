const mongoose = require('mongoose');
const { CashWithdrawal, CashBookEntry, Wallet } = require('../../src/models');
const walletService = require('../../src/services/wallet.service');
const cashWithdrawalService = require('../../src/services/cashWithdrawal.service');
const cashBookService = require('../../src/services/cashBook.service');

/**
 * GST on the whole amount of a cash Received/Send entry, deducted by the bank / wallet
 * provider from the account: a ₹100 withdrawal at 2% brings ₹98 into the wallet, a ₹100
 * deposit takes ₹102 out. It is a cost of the entry, so profit is net of it.
 */
const REPLSET_URL = process.env.MONGODB_TEST_REPLSET_URL;
const describeDb = REPLSET_URL ? describe : describe.skip;

beforeAll(async () => {
  if (REPLSET_URL) await mongoose.connect(REPLSET_URL);
});
beforeEach(async () => {
  if (!REPLSET_URL) return;
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
});
afterAll(async () => {
  if (!REPLSET_URL) return;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
jest.setTimeout(60000);

const id = () => new mongoose.Types.ObjectId();
const ORG = id();
const BRANCH = id();
const USER = id();

const balance = async (walletId) => (await Wallet.findById(walletId).lean()).balance;
const gstLines = async (withdrawalId) =>
  (await CashBookEntry.find({ referenceId: withdrawalId }).lean()).filter((e) => /deducted by/.test(e.description));
const entry = (wallet, body) =>
  cashWithdrawalService.createCashWithdrawal({
    organizationId: ORG,
    branchId: BRANCH,
    createdBy: USER,
    walletId: String(wallet._id),
    walletType: 'jazzcash',
    customerName: 'Ali',
    date: new Date(),
    ...body,
  });

describeDb('Cash Received/Send: GST on the whole amount, deducted by the bank', () => {
  test('wallet moves net of it, profit is net of it, edits and deletes reverse it exactly', async () => {
    const wallet = await walletService.createOrUpdateWallet({
      organizationId: ORG,
      branchId: BRANCH,
      type: 'jazzcash',
      balance: 1000,
      gstRate: 2,
      amountGstRate: 2,
      userId: USER,
    });
    // A caller without the field (Bank & Cash tab) keeps the rate.
    await walletService.createOrUpdateWallet({ organizationId: ORG, branchId: BRANCH, type: 'jazzcash', balance: 1000, userId: USER });
    expect((await Wallet.findById(wallet._id).lean()).amountGstRate).toBe(2);

    // Received ₹100, 2% commission, paid the customer ₹98 cash: the bank keeps ₹2.
    const w = await entry(wallet, {
      transactionType: 'withdrawal',
      amount: 100,
      cashAmount: 98,
      commissionRate: 2,
      gstRate: 2,
      amountGstRate: 2,
    });
    // commission 2 + settlement 2 − GST on commission 0.04 − GST on amount 2 = 1.96
    expect(w).toMatchObject({ amountGstRate: 2, amountGstAmount: 2, gstAmount: 0.04, profit: 1.96 });
    expect(await balance(wallet._id)).toBe(1098);
    const lines = await gstLines(w._id);
    expect(lines.map((l) => [l.type, l.amount, l.paymentMethod])).toEqual([['expense', 2, 'wallet']]);
    expect(lines[0].description).toBe('GST 2% on withdrawal amount deducted by jazzcash — Ali');

    // Edit to ₹200: old movement reversed exactly, new one applied, one GST line.
    await cashWithdrawalService.updateCashWithdrawal(w._id, { amount: 200, cashAmount: 196 });
    expect(await CashWithdrawal.findById(w._id).lean()).toMatchObject({ amountGstAmount: 4 });
    expect(await balance(wallet._id)).toBe(1196);
    expect((await gstLines(w._id)).map((l) => l.amount)).toEqual([4]);

    // Send ₹100: the account gives the amount plus the bank's GST.
    const d = await entry(wallet, { transactionType: 'deposit', amount: 100, cashAmount: 100, commissionRate: 1, amountGstRate: 2 });
    expect(await balance(wallet._id)).toBe(1094);
    // commission 1 − GST on amount 2 → a loss of 1, kept as such.
    expect(d.profit).toBe(-1);

    await cashWithdrawalService.deleteCashWithdrawal(d._id);
    await cashWithdrawalService.deleteCashWithdrawal(w._id);
    expect(await balance(wallet._id)).toBe(1000);
    expect(await CashBookEntry.countDocuments({ referenceId: w._id })).toBe(0);
  });

  test('a batch of Sends must be covered including the GST', async () => {
    const wallet = await walletService.createOrUpdateWallet({
      organizationId: ORG,
      branchId: BRANCH,
      type: 'jazzcash',
      balance: 101,
      userId: USER,
    });
    const batch = (amountGstRate) =>
      cashWithdrawalService.createCashWithdrawalsBatch({
        organizationId: ORG,
        branchId: BRANCH,
        createdBy: USER,
        walletId: String(wallet._id),
        walletType: 'jazzcash',
        transactionType: 'deposit',
        commissionRate: 0,
        amountGstRate,
        date: new Date(),
        entries: [{ amount: 100, cashAmount: 100 }],
      });
    await expect(batch(2)).rejects.toThrow(/insufficient/);
    expect(await balance(wallet._id)).toBe(101);
    await batch(1);
    expect(await balance(wallet._id)).toBe(0);
  });

  test('the Cash Book has one real cash line per entry (commission folded in) with the GST and net profit', async () => {
    const wallet = await walletService.createOrUpdateWallet({
      organizationId: ORG,
      branchId: BRANCH,
      type: 'jazzcash',
      balance: 2000,
      userId: USER,
    });
    const batch = (transactionType, amount) =>
      cashWithdrawalService.createCashWithdrawalsBatch({
        organizationId: ORG,
        branchId: BRANCH,
        createdBy: USER,
        walletId: String(wallet._id),
        walletType: 'jazzcash',
        transactionType,
        commissionRate: 3,
        amountGstRate: 1.74,
        date: new Date(),
        entries: [{ amount }],
      });
    const cashLines = async (withdrawalId) =>
      (
        await cashBookService.queryEntries({ organizationId: ORG, branchId: BRANCH, paymentMethod: 'cash' }, { limit: 50 })
      ).results.filter((r) => String(r.referenceId) === String(withdrawalId));

    // Received ₹100 at 3%: the bank keeps 1.74 (wallet +98.26), we hand over 97 cash.
    const [w] = await batch('withdrawal', 100);
    expect(w).toMatchObject({ amountGstAmount: 1.74, profit: 1.26 });
    expect(await balance(wallet._id)).toBeCloseTo(2098.26, 2);
    const wLines = await cashLines(w._id);
    expect(wLines.map((l) => [l.type, l.amount, l.description])).toEqual([
      ['expense', 97, 'Withdrawal: cash paid to customer (100 less commission 3)'],
    ]);
    expect(wLines[0].cashWithdrawalBreakdown).toMatchObject({
      commission: 3,
      amountGstRate: 1.74,
      amountGstAmount: 1.74,
      profit: 1.26,
    });

    // Send ₹900 at 3% (the user's entry): customer hands over 927, wallet pays 915.66.
    const [d] = await batch('deposit', 900);
    expect(d).toMatchObject({ amountGstAmount: 15.66, profit: 11.34 });
    expect(await balance(wallet._id)).toBeCloseTo(1182.6, 2);
    const dLines = await cashLines(d._id);
    expect(dLines.map((l) => [l.type, l.amount, l.description])).toEqual([
      ['income', 927, 'Deposit: cash received from customer (900 + commission 27)'],
    ]);
    expect(dLines[0].cashWithdrawalBreakdown).toMatchObject({ commission: 27, amountGstAmount: 15.66, profit: 11.34 });

    // Drawer: −97 + 927. The bank's GST never touches it.
    const { closingBalance } = await cashBookService.getSummary({ organizationId: ORG, branchId: BRANCH, paymentMethod: 'cash' });
    expect(closingBalance).toBe(830);

    // An edit re-posts the same shape.
    await cashWithdrawalService.updateCashWithdrawal(w._id, { amount: 200, cashAmount: 200 });
    expect((await cashLines(w._id)).map((l) => [l.type, l.amount])).toEqual([['expense', 194]]);
  });

  test('GST on commission is on the total commission (% commission + extra charges)', async () => {
    // 2% of 100 = 2 commission + 3 extra = 5; GST 10% of 5 = 0.5 → profit 4.5
    expect(
      cashWithdrawalService.calculateWithdrawalBreakdown({
        amount: 100,
        cashAmount: 100,
        transactionType: 'withdrawal',
        commissionRate: 2,
        extraCharge: 3,
        gstRate: 10,
      })
    ).toMatchObject({ gstAmount: 0.5, profit: 4.5 });
  });

  test('old two-line entries re-post to one cash line at the same time, drawer unchanged', async () => {
    const wallet = await walletService.createOrUpdateWallet({
      organizationId: ORG,
      branchId: BRANCH,
      type: 'jazzcash',
      balance: 1000,
      userId: USER,
    });
    const [w] = await cashWithdrawalService.createCashWithdrawalsBatch({
      organizationId: ORG,
      branchId: BRANCH,
      createdBy: USER,
      walletId: String(wallet._id),
      walletType: 'jazzcash',
      transactionType: 'withdrawal',
      commissionRate: 3,
      date: new Date(),
      entries: [{ amount: 100 }],
    });
    // Rewrite its cash lines into the old format: −100 cash paid, +3 commission income.
    const [cashLine] = await CashBookEntry.find({ referenceId: w._id, paymentMethod: 'cash' }).lean();
    const when = new Date('2026-10-26T11:17:37.000Z');
    await CashBookEntry.deleteMany({ referenceId: w._id, paymentMethod: 'cash' });
    const old = { ...cashLine, _id: undefined, date: when };
    await CashBookEntry.create([
      { ...old, type: 'expense', amount: 100, description: 'Withdrawal: cash paid to customer' },
      { ...old, type: 'income', amount: 3, description: 'Withdrawal commission from customer' },
    ]);

    await cashBookService.deleteEntriesByReference(w._id, 'CashWithdrawal');
    await cashWithdrawalService.postCashBookLines(w, cashWithdrawalService.customerLabelFor(w), { date: when });
    const lines = await CashBookEntry.find({ referenceId: w._id, paymentMethod: 'cash' }).lean();
    expect(lines.map((l) => [l.type, l.amount, l.date.toISOString()])).toEqual([['expense', 97, when.toISOString()]]);
  });
});
