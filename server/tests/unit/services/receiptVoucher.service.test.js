const mongoose = require('mongoose');
const setupTestDB = require('../../utils/setupTestDB');
const {
  Wallet,
  Customer,
  CustomerLedger,
  WalletEntry,
  CashBookEntry,
  ReceiptVoucher,
} = require('../../../src/models');
const cashBookService = require('../../../src/services/cashBook.service');
const walletEntryService = require('../../../src/services/walletEntry.service');
const paymentVoucherService = require('../../../src/services/paymentVoucher.service');
const service = require('../../../src/services/receiptVoucher.service');

/**
 * Editing a receipt voucher reverses money OUT of the account it was received into before
 * posting the new amounts, so the rules that matter here are the mirror image of the payment
 * voucher's: the reversal must be affordable (the money may already have been spent), and it
 * must still be checked against the right balance for a cash-type account.
 */
setupTestDB();
jest.setTimeout(60000);

const ORG = new mongoose.Types.ObjectId();
const OTHER_ORG = new mongoose.Types.ObjectId();
const BRANCH = new mongoose.Types.ObjectId();
const USER = new mongoose.Types.ObjectId();
const EDITOR = new mongoose.Types.ObjectId();
const scope = { organizationId: ORG, branchId: BRANCH };

const makeWallet = (type, balance, accountType = 'bank') => Wallet.create({ ...scope, type, accountType, balance });
const balanceOf = async (wallet) => (await Wallet.findById(wallet._id)).balance;
const tillBalance = async () => (await cashBookService.getCashInHandSummary(scope)).closingBalance;

const asInput = (line, over = {}) => ({
  id: String(line._id),
  sourceType: line.sourceType,
  category: line.category,
  customerId: line.customerId ? String(line.customerId) : undefined,
  amount: line.amount,
  description: line.description,
  ...over,
});

const create = (bank, lines, extra = {}) =>
  service.createVoucher({ ...scope, bankAccountId: bank._id, lines, ...extra }, USER);

const edit = (voucher, body, requestScope = scope) =>
  service.updateVoucher(voucher._id, requestScope, { bankAccountId: voucher.bankAccountId, ...body }, EDITOR);

const snapshot = async ({ ids = false } = {}) => {
  const id = (doc) => (ids ? String(doc._id) : '');
  const ref = (doc) => (ids || doc.referenceModel === 'ReceiptVoucher' ? String(doc.referenceId) : doc.referenceModel);
  const sortBy = (a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b));
  return {
    // Cash-type wallets are left out: their balance is the live Cash Book figure (asserted via
    // tillBalance()), and the accounts system may create its own default one at any moment.
    wallets: (await Wallet.find({ ...scope, accountType: { $ne: 'cash' } }).lean()).map((w) => [w.type, w.balance]).sort(sortBy),
    walletEntries: (await WalletEntry.find(scope).lean())
      .map((e) => [id(e), ref(e), e.walletType, e.type, e.amount, e.description, e.isReconciled])
      .sort(sortBy),
    cashBook: (await CashBookEntry.find(scope).lean())
      .map((e) => [id(e), ref(e), e.type, e.paymentMethod, e.amount, e.description])
      .sort(sortBy),
    customers: (await Customer.find(scope).lean()).map((c) => [c.name, c.balance]).sort(sortBy),
    customerLedger: (await CustomerLedger.find(scope).lean())
      .map((e) => [id(e), e.transactionType, e.debit, e.credit, e.balance, e.description, e.paymentMethod])
      .sort(sortBy),
    vouchers: (await ReceiptVoucher.find(scope).lean()).map((v) => [
      v.voucherNumber,
      String(v.bankAccountId),
      v.bankAccountName,
      v.totalAmount,
      v.lines.map((l) => [
        String(l._id),
        l.sourceType,
        l.payerName,
        l.amount,
        l.description || '',
        ids ? String(l.customerLedgerEntryId || '') : '',
      ]),
    ]),
  };
};

/** HBL (1,000) receiving 500 of rental income and 700 from a customer → 2,200. */
const seed = async () => {
  // See paymentVoucher.service.test.js: keeps the accounts system's own "Cash in Hand" out of diffs.
  await makeWallet('Cash in Hand', 0, 'cash');
  const hbl = await makeWallet('HBL', 1000);
  const bilal = await Customer.create({ ...scope, name: 'Bilal Store' });
  const voucher = await create(hbl, [
    { sourceType: 'income', category: 'Rental income', amount: 500, description: 'Shop 2' },
    { sourceType: 'customer', customerId: bilal._id, amount: 700 },
  ]);
  const [income, customerLine] = voucher.lines;
  return { hbl, bilal, voucher, income, customerLine };
};

describe('receiptVoucher.service — updateVoucher', () => {
  test('an edit that changes nothing leaves every ledger record exactly as it was', async () => {
    const { voucher, income, customerLine } = await seed();
    const before = await snapshot({ ids: true });

    const updated = await edit(voucher, { lines: [asInput(income), asInput(customerLine)] });

    expect(await snapshot({ ids: true })).toEqual(before);
    expect(updated.voucherNumber).toBe(voucher.voucherNumber);
    expect(String((await ReceiptVoucher.findById(voucher._id).lean()).updatedBy)).toBe(String(EDITOR));
  });

  test('changing an amount moves the account by the difference only', async () => {
    const { hbl, voucher, income, customerLine } = await seed();
    expect(await balanceOf(hbl)).toBe(2200);

    const updated = await edit(voucher, { lines: [asInput(income, { amount: 800 }), asInput(customerLine)] });

    expect(updated.totalAmount).toBe(1500);
    expect(await balanceOf(hbl)).toBe(2500);
    expect((await WalletEntry.findOne({ referenceId: income._id })).amount).toBe(800);
    expect((await CashBookEntry.findOne({ referenceId: income._id })).amount).toBe(800);
    expect(await WalletEntry.countDocuments({ walletType: 'HBL' })).toBe(2);
  });

  test('changing a customer payment replaces its ledger entry and re-balances the customer', async () => {
    const { hbl, bilal, voucher, income, customerLine } = await seed();
    const balanceBefore = (await Customer.findById(bilal._id)).balance;

    const updated = await edit(voucher, { lines: [asInput(income), asInput(customerLine, { amount: 900 })] });

    expect(await balanceOf(hbl)).toBe(2400);
    expect(Math.abs((await Customer.findById(bilal._id)).balance - balanceBefore)).toBe(200);
    const ledger = await CustomerLedger.find({ transactionType: 'payment_received' });
    expect(ledger).toHaveLength(1);
    expect(ledger[0].credit).toBe(900);
    expect(String(updated.lines[1].customerLedgerEntryId)).toBe(String(ledger[0]._id));
  });

  test('changing only wording rewrites descriptions without moving money or re-posting anything', async () => {
    const { hbl, voucher, income, customerLine } = await seed();
    const before = await snapshot({ ids: true });

    await edit(voucher, {
      notes: 'Collected in person',
      lines: [asInput(income, { description: 'Shop 2, September' }), asInput(customerLine)],
    });

    const after = await snapshot({ ids: true });
    expect(after.wallets).toEqual(before.wallets);
    expect(after.walletEntries.map((e) => e.slice(0, 5))).toEqual(before.walletEntries.map((e) => e.slice(0, 5)));
    expect(after.cashBook.map((e) => e.slice(0, 5))).toEqual(before.cashBook.map((e) => e.slice(0, 5)));
    expect(after.customerLedger.map((e) => e.slice(0, 5))).toEqual(before.customerLedger.map((e) => e.slice(0, 5)));
    expect(await balanceOf(hbl)).toBe(2200);
    expect((await WalletEntry.findOne({ referenceId: income._id })).description).toMatch(/Shop 2, September/);
    expect((await CustomerLedger.findOne({ transactionType: 'payment_received' })).notes).toBe('Collected in person');
  });

  test('moving to another account takes the money back out of the old one and puts it into the new one', async () => {
    const { hbl, voucher, income, customerLine } = await seed();
    const meezan = await makeWallet('Meezan', 300);

    const updated = await edit(voucher, { bankAccountId: meezan._id, lines: [asInput(income), asInput(customerLine)] });

    expect(updated.bankAccountName).toBe('Meezan');
    expect(await balanceOf(hbl)).toBe(1000);
    expect(await balanceOf(meezan)).toBe(1500);
    expect(await WalletEntry.countDocuments({ walletType: 'HBL' })).toBe(0);
    expect((await CustomerLedger.findOne({ transactionType: 'payment_received' })).paymentMethod).toBe('Wallet (Meezan)');
  });

  test('removing a line takes its money back out; adding one brings more in', async () => {
    const { hbl, voucher, customerLine } = await seed();

    const updated = await edit(voucher, {
      lines: [asInput(customerLine), { sourceType: 'income', category: 'Commission', amount: 250 }],
    });

    expect(updated.lines.map((l) => l.payerName)).toEqual(['Bilal Store', 'Commission']);
    expect(await balanceOf(hbl)).toBe(1950);
  });

  describe('refused before anything is written', () => {
    test('cannot take back money that has already been spent', async () => {
      const { hbl, voucher, income, customerLine } = await seed();
      // 2,000 of the 2,200 goes out again → 200 left; the 500 income line can't be reversed.
      await paymentVoucherService.createVoucher(
        { ...scope, bankAccountId: hbl._id, lines: [{ payeeType: 'expense', category: 'Rent', amount: 2000 }] },
        USER
      );
      const before = await snapshot({ ids: true });

      await expect(edit(voucher, { lines: [asInput(income, { amount: 100 }), asInput(customerLine)] })).rejects.toThrow(/insufficient/i);

      expect(await snapshot({ ids: true })).toEqual(before);
    });

    test('wording can still be corrected after the money has been spent (updateLedgerEntry would refuse: it deducts first)', async () => {
      const { hbl, voucher, income, customerLine } = await seed();
      await paymentVoucherService.createVoucher(
        { ...scope, bankAccountId: hbl._id, lines: [{ payeeType: 'expense', category: 'Rent', amount: 2000 }] },
        USER
      );
      expect(await balanceOf(hbl)).toBe(200);

      await edit(voucher, {
        notes: 'Fixed a typo',
        lines: [asInput(income, { description: 'Shop 2 (corrected)' }), asInput(customerLine, { description: 'Bilal, cash' })],
      });

      expect(await balanceOf(hbl)).toBe(200);
      expect((await WalletEntry.findOne({ referenceId: income._id })).description).toMatch(/Shop 2 \(corrected\)/);
      const ledger = await CustomerLedger.findOne({ transactionType: 'payment_received' });
      expect(ledger.description).toMatch(/Bilal, cash/);
      expect((await WalletEntry.findOne({ referenceModel: 'CustomerLedger', referenceId: ledger._id })).description).toMatch(/Bilal, cash/);
    });

    test('a line whose bank entry was already reconciled cannot be changed', async () => {
      const { voucher, income, customerLine } = await seed();
      await WalletEntry.updateOne({ referenceId: income._id, referenceModel: 'ReceiptVoucher' }, { isReconciled: true });
      const before = await snapshot({ ids: true });

      await expect(edit(voucher, { lines: [asInput(income, { amount: 450 }), asInput(customerLine)] })).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringMatching(/Bank Reconciliation/),
      });

      expect(await snapshot({ ids: true })).toEqual(before);
    });

    test('a reconciled customer payment is found through its ledger entry', async () => {
      const { voucher, income, customerLine } = await seed();
      const stored = await ReceiptVoucher.findById(voucher._id);
      await WalletEntry.updateOne(
        { referenceId: stored.lines[1].customerLedgerEntryId, referenceModel: 'CustomerLedger' },
        { isReconciled: true }
      );

      await expect(edit(voucher, { lines: [asInput(income), asInput(customerLine, { amount: 800 })] })).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    test('a line id that is not on this voucher is rejected', async () => {
      const { voucher, income } = await seed();
      await expect(
        edit(voucher, { lines: [asInput(income), { id: String(new mongoose.Types.ObjectId()), sourceType: 'income', category: 'X', amount: 1 }] })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    test('another organization cannot reach the voucher', async () => {
      const { voucher, income } = await seed();
      await expect(
        edit(voucher, { lines: [asInput(income, { amount: 1 })] }, { organizationId: OTHER_ORG, branchId: BRANCH })
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(await service.getVoucherById(voucher._id, { organizationId: OTHER_ORG })).toBeNull();
      await expect(service.deleteVoucherById(voucher._id, { organizationId: OTHER_ORG })).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  test('a failure part-way through puts every ledger back exactly as it found it', async () => {
    const { voucher, income, customerLine } = await seed();
    const before = await snapshot();

    // Let the first re-post's wallet leg succeed and fail the second one's.
    const original = walletEntryService.syncWalletPayment;
    let calls = 0;
    jest.spyOn(walletEntryService, 'syncWalletPayment').mockImplementation(async (...args) => {
      calls += 1;
      if (calls === 2) throw new Error('connection reset');
      return original(...args);
    });

    await expect(
      edit(voucher, {
        lines: [asInput(income, { amount: 600 }), asInput(customerLine), { sourceType: 'income', category: 'Commission', amount: 100 }],
      })
    ).rejects.toThrow('connection reset');
    jest.restoreAllMocks();

    expect(await snapshot()).toEqual(before);
    // Everything the voucher points at still exists, so it can still be deleted cleanly.
    await service.deleteVoucherById(voucher._id, scope);
    expect((await snapshot()).wallets).toEqual([['HBL', 1000]]);
  });

  describe('a cash-type account (Cash in Hand)', () => {
    const cashSeed = async () => {
      const cash = await makeWallet('Cash in Hand', 0, 'cash');
      await cashBookService.setOpeningBalance(scope, 100);
      const voucher = await create(cash, [{ sourceType: 'income', category: 'Rental income', amount: 600 }]);
      return { cash, voucher, line: voucher.lines[0] };
    };

    test('lowering a receipt is allowed when the till still holds it (used to be refused: the receipt was subtracted twice)', async () => {
      const { voucher, line } = await cashSeed();
      expect(await tillBalance()).toBe(700);

      await edit(voucher, { lines: [asInput(line, { amount: 500 })] });

      expect(await tillBalance()).toBe(600);
      expect(await CashBookEntry.countDocuments({ referenceId: line._id })).toBe(1);
    });

    test('raising a receipt adds the difference to the till', async () => {
      const { voucher, line } = await cashSeed();
      await edit(voucher, { lines: [asInput(line, { amount: 900 })] });
      expect(await tillBalance()).toBe(1000);
    });

    test('cannot be lowered once the cash has been spent', async () => {
      const { cash, voucher, line } = await cashSeed();
      await paymentVoucherService.createVoucher(
        { ...scope, bankAccountId: cash._id, lines: [{ payeeType: 'expense', category: 'Rent', amount: 650 }] },
        USER
      );
      expect(await tillBalance()).toBe(50);
      const before = await snapshot({ ids: true });

      await expect(edit(voucher, { lines: [asInput(line, { amount: 100 })] })).rejects.toThrow(/insufficient/i);

      expect(await snapshot({ ids: true })).toEqual(before);
    });
  });
});
