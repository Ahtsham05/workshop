const mongoose = require('mongoose');
const { CashWithdrawal, CashBookEntry, Wallet } = require('../../src/models');
const walletService = require('../../src/services/wallet.service');
const cashWithdrawalService = require('../../src/services/cashWithdrawal.service');

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
});
