const mongoose = require('mongoose');
const setupTestDB = require('../../utils/setupTestDB');
const {
  Wallet,
  Supplier,
  SupplierLedger,
  WalletEntry,
  CashBookEntry,
  Expense,
  PaymentVoucher,
  User,
} = require('../../../src/models');
const cashBookService = require('../../../src/services/cashBook.service');
const service = require('../../../src/services/paymentVoucher.service');

/**
 * Editing a payment voucher moves real money between accounts, the Cash Book and the supplier
 * ledger, so every rule is pinned against a real in-memory MongoDB: what an edit touches, what
 * it must leave alone, what it must refuse before writing anything, and that a failure part-way
 * puts everything back.
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

/** A stored line back into the shape the edit endpoint receives, so tests only spell out what changes. */
const asInput = (line, over = {}) => ({
  id: String(line._id),
  payeeType: line.payeeType,
  category: line.category,
  supplierId: line.supplierId ? String(line.supplierId) : undefined,
  payeeName: line.payeeName,
  amount: line.amount,
  description: line.description,
  ...over,
});

const create = (bank, lines, extra = {}) =>
  service.createVoucher({ ...scope, bankAccountId: bank._id, lines, ...extra }, USER);

const edit = (voucher, body, requestScope = scope) =>
  service.updateVoucher(voucher._id, requestScope, { bankAccountId: voucher.bankAccountId, ...body }, EDITOR);

/**
 * Everything an edit could disturb, in a comparable shape. With `ids`, the ledger rows' own ids
 * are included too — that is how a test proves a record was left alone rather than deleted and
 * re-created identically.
 */
const snapshot = async ({ ids = false } = {}) => {
  const id = (doc) => (ids ? String(doc._id) : '');
  // A supplier line's rows hang off its Supplier Ledger entry, whose id changes whenever that
  // entry is re-created — only comparable when the test asked for ids.
  const ref = (doc) => (ids || doc.referenceModel === 'PaymentVoucher' ? String(doc.referenceId) : doc.referenceModel);
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
    expenses: (await Expense.find(scope).lean())
      .map((e) => [id(e), ref(e), e.category, e.amount, e.description, e.paymentMethod, e.walletType])
      .sort(sortBy),
    suppliers: (await Supplier.find(scope).lean()).map((s) => [s.name, s.balance]).sort(sortBy),
    supplierLedger: (await SupplierLedger.find(scope).lean())
      .map((e) => [id(e), e.transactionType, e.debit, e.credit, e.balance, e.description, e.paymentMethod])
      .sort(sortBy),
    vouchers: (await PaymentVoucher.find(scope).lean()).map((v) => [
      v.voucherNumber,
      String(v.bankAccountId),
      v.bankAccountName,
      v.totalAmount,
      v.lines.map((l) => [
        String(l._id),
        l.payeeType,
        l.payeeName,
        l.amount,
        l.description || '',
        ids ? String(l.supplierLedgerEntryId || '') : '',
        ids ? String(l.expenseId || '') : '',
      ]),
    ]),
  };
};

/** HBL (10,000) paying a 1,000 Rent expense, a 500 Fuel expense and 2,000 to a supplier. */
const seed = async () => {
  // The accounts system seeds a default "Cash in Hand" wallet, fire-and-forget, the first time a
  // supplier-ledger row posts for an org — creating it up front keeps it out of before/after diffs.
  await makeWallet('Cash in Hand', 0, 'cash');
  const hbl = await makeWallet('HBL', 10000);
  const acme = await Supplier.create({ ...scope, name: 'ACME Traders' });
  const voucher = await create(hbl, [
    { payeeType: 'expense', category: 'Rent', amount: 1000, description: 'September' },
    { payeeType: 'expense', category: 'Fuel', amount: 500 },
    { payeeType: 'supplier', supplierId: acme._id, amount: 2000 },
  ]);
  const [rent, fuel, supplierLine] = voucher.lines;
  return { hbl, acme, voucher, rent, fuel, supplierLine };
};

describe('paymentVoucher.service — create (bugs found while building edit)', () => {
  test('a cash-account payment the till can cover is accepted (used to be rejected: the payment was subtracted twice)', async () => {
    const cash = await makeWallet('Cash in Hand', 0, 'cash');
    await cashBookService.setOpeningBalance(scope, 1000);

    const voucher = await create(cash, [{ payeeType: 'expense', category: 'Rent', amount: 600 }]);

    expect(voucher.totalAmount).toBe(600);
    expect(await tillBalance()).toBe(400);
  });

  test('an unaffordable voucher is refused cleanly — no voucher, no ledger entry, no balance change', async () => {
    const hbl = await makeWallet('HBL', 100);
    const acme = await Supplier.create({ ...scope, name: 'ACME Traders' });

    await expect(create(hbl, [{ payeeType: 'supplier', supplierId: acme._id, amount: 500 }])).rejects.toThrow(/insufficient/i);

    expect(await PaymentVoucher.countDocuments()).toBe(0);
    expect(await SupplierLedger.countDocuments()).toBe(0);
    expect(await balanceOf(hbl)).toBe(100);
    expect((await Supplier.findById(acme._id)).balance).toBe(0);
  });
});

describe('paymentVoucher.service — updateVoucher', () => {
  test('an edit that changes nothing leaves every ledger record exactly as it was', async () => {
    const { voucher, rent, fuel, supplierLine } = await seed();
    const before = await snapshot({ ids: true });

    const updated = await edit(voucher, { lines: [asInput(rent), asInput(fuel), asInput(supplierLine)] });

    expect(await snapshot({ ids: true })).toEqual(before);
    expect(updated.voucherNumber).toBe(voucher.voucherNumber);
    expect(String((await PaymentVoucher.findById(voucher._id).lean()).updatedBy)).toBe(String(EDITOR));
  });

  test('changing an amount moves the account by the difference only', async () => {
    const { hbl, voucher, rent, fuel, supplierLine } = await seed();
    expect(await balanceOf(hbl)).toBe(6500);

    const updated = await edit(voucher, {
      lines: [asInput(rent, { amount: 1500 }), asInput(fuel), asInput(supplierLine)],
    });

    expect(updated.totalAmount).toBe(4000);
    expect(updated.lines.map((l) => l.amount)).toEqual([1500, 500, 2000]);
    expect(await balanceOf(hbl)).toBe(6000);

    const entry = await WalletEntry.findOne({ referenceId: rent._id, referenceModel: 'PaymentVoucher' });
    expect(entry.amount).toBe(1500);
    expect((await CashBookEntry.findOne({ referenceId: rent._id })).amount).toBe(1500);
    expect((await Expense.findOne({ referenceId: rent._id })).amount).toBe(1500);
    // The untouched lines were not re-posted.
    expect(await WalletEntry.countDocuments({ referenceId: fuel._id })).toBe(1);
  });

  test('changing only wording rewrites descriptions without moving money or re-posting anything', async () => {
    const { hbl, voucher, rent, fuel, supplierLine } = await seed();
    const before = await snapshot({ ids: true });

    await edit(voucher, {
      notes: 'Approved by owner',
      reference: 'CHQ-77',
      lines: [asInput(rent, { description: 'September rent, shop 4' }), asInput(fuel), asInput(supplierLine)],
    });

    const after = await snapshot({ ids: true });
    // Same rows (ids), same money…
    expect(after.wallets).toEqual(before.wallets);
    expect(after.walletEntries.map((e) => e.slice(0, 5))).toEqual(before.walletEntries.map((e) => e.slice(0, 5)));
    expect(after.cashBook.map((e) => e.slice(0, 5))).toEqual(before.cashBook.map((e) => e.slice(0, 5)));
    expect(after.supplierLedger.map((e) => e.slice(0, 5))).toEqual(before.supplierLedger.map((e) => e.slice(0, 5)));
    expect(await balanceOf(hbl)).toBe(6500);
    // …with the new wording on the rows the line owns.
    expect((await WalletEntry.findOne({ referenceId: rent._id })).description).toMatch(/September rent, shop 4/);
    expect((await CashBookEntry.findOne({ referenceId: rent._id })).description).toMatch(/September rent, shop 4/);
    expect((await Expense.findOne({ referenceId: rent._id })).description).toMatch(/September rent, shop 4/);
    expect((await Expense.findOne({ referenceId: rent._id })).notes).toBe('Approved by owner');
    expect((await SupplierLedger.findOne({ transactionType: 'payment_made' })).notes).toBe('Approved by owner');
  });

  test('changing the date re-posts every line at the new date without changing any balance', async () => {
    const { hbl, acme, voucher, rent, fuel, supplierLine } = await seed();
    const newDate = new Date('2026-08-01T00:00:00.000Z');

    const updated = await edit(voucher, {
      date: newDate,
      lines: [asInput(rent), asInput(fuel), asInput(supplierLine)],
    });

    expect(updated.date.toISOString()).toBe(newDate.toISOString());
    expect(await balanceOf(hbl)).toBe(6500);
    expect((await Supplier.findById(acme._id)).balance).toBe(-2000);
    const entry = await WalletEntry.findOne({ referenceId: rent._id });
    expect(entry.date.toISOString()).toBe(newDate.toISOString());
    // The supplier ledger entry was replaced (a ledger row can't change its date), and the
    // voucher line points at the new one.
    const stored = await PaymentVoucher.findById(voucher._id);
    expect(String(stored.lines[2].supplierLedgerEntryId)).not.toBe(String(supplierLine.supplierLedgerEntryId));
    expect(await SupplierLedger.countDocuments()).toBe(1);
    expect(await SupplierLedger.findById(stored.lines[2].supplierLedgerEntryId)).not.toBeNull();
  });

  test('moving to another account refunds the old one and charges the new one', async () => {
    const { hbl, acme, voucher, rent, fuel, supplierLine } = await seed();
    const meezan = await makeWallet('Meezan', 5000);

    const updated = await edit(
      voucher,
      { bankAccountId: meezan._id, lines: [asInput(rent), asInput(fuel), asInput(supplierLine)] }
    );

    expect(updated.bankAccountName).toBe('Meezan');
    expect(await balanceOf(hbl)).toBe(10000);
    expect(await balanceOf(meezan)).toBe(1500);
    expect(await WalletEntry.countDocuments({ walletType: 'HBL' })).toBe(0);
    expect(await WalletEntry.countDocuments({ walletType: 'Meezan' })).toBe(3);
    expect((await SupplierLedger.findOne({ transactionType: 'payment_made' })).paymentMethod).toBe('Wallet (Meezan)');
    expect((await Supplier.findById(acme._id)).balance).toBe(-2000);
  });

  test('removing a line gives its money back; adding a line charges it', async () => {
    const { hbl, voucher, rent, supplierLine } = await seed();

    const updated = await edit(voucher, {
      lines: [
        asInput(rent),
        asInput(supplierLine),
        { payeeType: 'expense', category: 'Electricity', amount: 300 },
      ],
    });

    expect(updated.lines.map((l) => l.payeeName)).toEqual(['Rent', 'ACME Traders', 'Electricity']);
    expect(updated.totalAmount).toBe(3300);
    // Fuel (500) came back, Electricity (300) went out.
    expect(await balanceOf(hbl)).toBe(6700);
    expect(await Expense.countDocuments({ category: 'Fuel' })).toBe(0);
    expect(await Expense.countDocuments({ category: 'Electricity' })).toBe(1);
  });

  test('changing a supplier payment amount replaces its ledger entry and re-balances the supplier', async () => {
    const { hbl, acme, voucher, rent, fuel, supplierLine } = await seed();

    const updated = await edit(voucher, {
      lines: [asInput(rent), asInput(fuel), asInput(supplierLine, { amount: 2600 })],
    });

    expect(await balanceOf(hbl)).toBe(5900);
    expect((await Supplier.findById(acme._id)).balance).toBe(-2600);
    const ledger = await SupplierLedger.find({ transactionType: 'payment_made' });
    expect(ledger).toHaveLength(1);
    expect(ledger[0].debit).toBe(2600);
    expect(String(updated.lines[2].supplierLedgerEntryId)).toBe(String(ledger[0]._id));
  });

  test('switching a line to a different payee type reverses the old legs and posts the new ones', async () => {
    const { hbl, acme, voucher, rent, fuel, supplierLine } = await seed();

    await edit(voucher, {
      // The supplier payment becomes a Utilities expense of the same amount.
      lines: [asInput(rent), asInput(fuel), { id: String(supplierLine._id), payeeType: 'expense', category: 'Utilities', amount: 2000 }],
    });

    expect(await SupplierLedger.countDocuments()).toBe(0);
    expect((await Supplier.findById(acme._id)).balance).toBe(0);
    expect(await balanceOf(hbl)).toBe(6500);
    expect(await Expense.countDocuments({ category: 'Utilities' })).toBe(1);
  });

  describe('refused before anything is written', () => {
    test('an edit that would overdraw the account changes nothing', async () => {
      const { voucher, rent, fuel, supplierLine } = await seed();
      const before = await snapshot({ ids: true });

      await expect(
        edit(voucher, { lines: [asInput(rent, { amount: 8000 }), asInput(fuel), asInput(supplierLine)] })
      ).rejects.toThrow(/insufficient/i);

      expect(await snapshot({ ids: true })).toEqual(before);
    });

    test('the refund from the lines being edited counts towards what the account can afford', async () => {
      const { hbl, voucher, rent, fuel, supplierLine } = await seed();
      // 6,500 left + the 1,000 being replaced = 7,500 available for the new Rent amount.
      await edit(voucher, { lines: [asInput(rent, { amount: 7500 }), asInput(fuel), asInput(supplierLine)] });
      expect(await balanceOf(hbl)).toBe(0);
    });

    test('a line whose bank entry was already reconciled cannot be changed', async () => {
      const { voucher, rent, fuel, supplierLine } = await seed();
      await WalletEntry.updateOne({ referenceId: rent._id, referenceModel: 'PaymentVoucher' }, { isReconciled: true });
      const before = await snapshot({ ids: true });

      await expect(
        edit(voucher, { lines: [asInput(rent, { amount: 900 }), asInput(fuel), asInput(supplierLine)] })
      ).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/Bank Reconciliation/) });

      expect(await snapshot({ ids: true })).toEqual(before);
    });

    test('a reconciled supplier payment is found through its ledger entry', async () => {
      const { voucher, rent, fuel, supplierLine } = await seed();
      const stored = await PaymentVoucher.findById(voucher._id);
      await WalletEntry.updateOne(
        { referenceId: stored.lines[2].supplierLedgerEntryId, referenceModel: 'SupplierLedger' },
        { isReconciled: true }
      );

      await expect(
        edit(voucher, { lines: [asInput(rent), asInput(fuel), asInput(supplierLine, { amount: 2100 })] })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    test('wording on a reconciled line can still be corrected — no entry is re-posted', async () => {
      const { voucher, rent, fuel, supplierLine } = await seed();
      await WalletEntry.updateOne({ referenceId: rent._id, referenceModel: 'PaymentVoucher' }, { isReconciled: true });

      await edit(voucher, { lines: [asInput(rent, { description: 'Corrected typo' }), asInput(fuel), asInput(supplierLine)] });

      const entry = await WalletEntry.findOne({ referenceId: rent._id, referenceModel: 'PaymentVoucher' });
      expect(entry.isReconciled).toBe(true);
      expect(entry.description).toMatch(/Corrected typo/);
    });

    test('a line id that is not on this voucher is rejected', async () => {
      const { voucher, rent, fuel, supplierLine } = await seed();
      await expect(
        edit(voucher, {
          lines: [asInput(rent), asInput(fuel), asInput(supplierLine), { id: String(new mongoose.Types.ObjectId()), payeeType: 'expense', category: 'X', amount: 1 }],
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    test('the same line submitted twice is rejected', async () => {
      const { voucher, rent, fuel, supplierLine } = await seed();
      await expect(edit(voucher, { lines: [asInput(rent), asInput(rent), asInput(fuel), asInput(supplierLine)] })).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    test('an unknown bank account is rejected', async () => {
      const { voucher, rent } = await seed();
      await expect(
        edit(voucher, { bankAccountId: new mongoose.Types.ObjectId(), lines: [asInput(rent)] })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    test('another organization cannot reach the voucher', async () => {
      const { voucher, rent } = await seed();
      await expect(
        edit(voucher, { lines: [asInput(rent, { amount: 1 })] }, { organizationId: OTHER_ORG, branchId: BRANCH })
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(await service.getVoucherById(voucher._id, { organizationId: OTHER_ORG })).toBeNull();
      await expect(service.deleteVoucherById(voucher._id, { organizationId: OTHER_ORG })).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('a failure part-way through', () => {
    test('puts every ledger back exactly as it found it', async () => {
      const { voucher, rent, fuel, supplierLine } = await seed();
      const before = await snapshot();

      // Let the first re-post succeed and fail the second one's Cash Book leg, i.e. after money
      // has already moved for one line and half-moved for the next.
      const original = cashBookService.upsertReferenceEntry;
      let calls = 0;
      jest.spyOn(cashBookService, 'upsertReferenceEntry').mockImplementation(async (...args) => {
        calls += 1;
        if (calls === 2) throw new Error('disk full');
        return original(...args);
      });

      await expect(
        edit(voucher, { lines: [asInput(rent, { amount: 1100 }), asInput(fuel, { amount: 600 }), asInput(supplierLine)] })
      ).rejects.toThrow('disk full');
      jest.restoreAllMocks();

      expect(await snapshot()).toEqual(before);
      // …and the voucher still points at ledger rows that exist, so a later delete works.
      const stored = await PaymentVoucher.findById(voucher._id);
      expect(await SupplierLedger.findById(stored.lines[2].supplierLedgerEntryId)).not.toBeNull();
      await service.deleteVoucherById(voucher._id, scope);
      expect((await snapshot()).wallets).toEqual([['HBL', 10000]]);
    });

    test('re-pointing the voucher at a restored supplier ledger row when the failure comes after it was re-created', async () => {
      const { voucher, rent, fuel, supplierLine } = await seed();
      const before = await snapshot();

      // Fail the very last step (saving the voucher) after the supplier line was replaced.
      jest.spyOn(PaymentVoucher, 'updateOne').mockRejectedValueOnce(new Error('write conflict'));

      await expect(
        edit(voucher, { lines: [asInput(rent), asInput(fuel), asInput(supplierLine, { amount: 2500 })] })
      ).rejects.toThrow('write conflict');
      jest.restoreAllMocks();

      expect(await snapshot()).toEqual(before);
      const stored = await PaymentVoucher.findById(voucher._id);
      expect(await SupplierLedger.findById(stored.lines[2].supplierLedgerEntryId)).not.toBeNull();
      await service.deleteVoucherById(voucher._id, scope);
      expect((await snapshot()).suppliers).toEqual([['ACME Traders', 0]]);
    });
  });

  describe('a cash-type account (Cash in Hand)', () => {
    const cashSeed = async () => {
      const cash = await makeWallet('Cash in Hand', 0, 'cash');
      await cashBookService.setOpeningBalance(scope, 1000);
      const voucher = await create(cash, [{ payeeType: 'expense', category: 'Rent', amount: 600 }]);
      return { cash, voucher, line: voucher.lines[0] };
    };

    test('can raise a payment up to what the till plus the payment being replaced can cover', async () => {
      const { voucher, line } = await cashSeed();
      expect(await tillBalance()).toBe(400);

      await edit(voucher, { lines: [asInput(line, { amount: 1000 })] });

      expect(await tillBalance()).toBe(0);
    });

    test('cannot raise it beyond that', async () => {
      const { voucher, line } = await cashSeed();
      const before = await snapshot({ ids: true });

      await expect(edit(voucher, { lines: [asInput(line, { amount: 1001 })] })).rejects.toThrow(/insufficient/i);

      expect(await snapshot({ ids: true })).toEqual(before);
      expect(await tillBalance()).toBe(400);
    });

    test('a supplier payment out of the till can have its wording corrected (updateLedgerEntry would refuse: the till already excludes it)', async () => {
      const cash = await makeWallet('Cash in Hand', 0, 'cash');
      await cashBookService.setOpeningBalance(scope, 1000);
      const acme = await Supplier.create({ ...scope, name: 'ACME Traders' });
      const voucher = await create(cash, [{ payeeType: 'supplier', supplierId: acme._id, amount: 600 }]);
      expect(await tillBalance()).toBe(400);

      await edit(voucher, { notes: 'corrected', lines: [asInput(voucher.lines[0], { description: 'Invoice 88' })] });

      expect(await tillBalance()).toBe(400);
      expect((await Supplier.findById(acme._id)).balance).toBe(-600);
      const ledger = await SupplierLedger.findOne({ transactionType: 'payment_made' });
      expect(ledger.description).toMatch(/Invoice 88/);
      expect((await CashBookEntry.findOne({ referenceModel: 'SupplierLedger', referenceId: ledger._id })).description).toMatch(/Invoice 88/);
    });

    test('lowering a payment puts the difference back in the till', async () => {
      const { voucher, line } = await cashSeed();

      await edit(voucher, { lines: [asInput(line, { amount: 250 })] });

      expect(await tillBalance()).toBe(750);
      expect(await CashBookEntry.countDocuments({ referenceId: line._id })).toBe(1);
    });
  });

  test('getVoucherDetailById resolves who created and last edited the voucher', async () => {
    await User.create({ _id: USER, name: 'Creator Ali', email: 'creator@example.com', password: 'password1' });
    await User.create({ _id: EDITOR, name: 'Editor Sana', email: 'editor@example.com', password: 'password1' });
    const { voucher, rent, fuel, supplierLine } = await seed();

    expect((await service.getVoucherDetailById(voucher._id, scope)).updatedBy).toBeUndefined();
    await edit(voucher, { lines: [asInput(rent, { amount: 1200 }), asInput(fuel), asInput(supplierLine)] });
    const detail = await service.getVoucherDetailById(voucher._id, scope);

    expect(detail.createdBy.name).toBe('Creator Ali');
    expect(detail.updatedBy.name).toBe('Editor Sana');
    expect(detail.toJSON().createdBy.email).toBe('creator@example.com');
    expect(detail.toJSON().createdBy.password).toBeUndefined();
  });
});
