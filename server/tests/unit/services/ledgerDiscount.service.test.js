const mongoose = require('mongoose');
const setupTestDB = require('../../utils/setupTestDB');
const {
  Organization,
  Branch,
  Customer,
  Supplier,
  Invoice,
  Purchase,
  CustomerLedger,
  SupplierLedger,
  CustomerPayment,
  SupplierPayment,
  CashBookEntry,
  JournalEntry,
  AccountHead,
} = require('../../../src/models');
const customerLedgerService = require('../../../src/services/customerLedger.service');
const supplierLedgerService = require('../../../src/services/supplierLedger.service');
const customerPaymentService = require('../../../src/services/customerPayment.service');
const supplierPaymentService = require('../../../src/services/supplierPayment.service');
const ledgerDiscountService = require('../../../src/services/ledgerDiscount.service');

/**
 * Ledger discounts end-to-end against in-memory Mongo: a discount is its own ledger row that
 * settles invoices like money (but is never advance credit), never touches the Cash Book,
 * posts Dr Discount Allowed / Cr AR (or Dr AP / Cr Discount Received), obeys the business's
 * limits, and is removed with the payment it was given with.
 */
setupTestDB();
jest.setTimeout(60000);

const user = { id: new mongoose.Types.ObjectId(), name: 'Owner' };

let org;
let branch;
let customer;
let supplier;

const base = () => ({ organizationId: org._id, branchId: branch._id, createdBy: user.id });

const makeInvoice = (number, total, day = 1) =>
  Invoice.create({
    ...base(),
    invoiceNumber: number,
    customerId: String(customer._id),
    type: 'credit',
    items: [],
    subtotal: total,
    total,
    totalProfit: 0,
    totalCost: 0,
    paidAmount: 0,
    balance: total,
    invoiceDate: new Date(2026, 10, day),
  });

const postSale = (invoice) =>
  customerLedgerService.createLedgerEntry({
    ...base(),
    customer: customer._id,
    transactionType: 'sale',
    transactionDate: invoice.invoiceDate,
    reference: invoice.invoiceNumber,
    referenceId: invoice._id,
    description: `Sale ${invoice.invoiceNumber}`,
    debit: invoice.total,
    credit: 0,
    paymentMethod: 'Credit',
    invoiceType: 'credit',
  });

const receive = (amount, settlementDiscount, options = {}) =>
  customerLedgerService.createLedgerEntry(
    {
      ...base(),
      customer: customer._id,
      transactionType: 'payment_received',
      transactionDate: new Date(2026, 10, 9),
      description: 'Cash received',
      debit: 0,
      credit: amount,
      paymentMethod: 'Cash',
      ...(settlementDiscount ? { settlementDiscount } : {}),
    },
    { user, ...options }
  );

const remainingOf = async (invoiceId) => {
  const inv = await Invoice.findById(invoiceId).lean();
  return inv.total - (inv.paidAmount || 0) - (inv.allocatedAmount || 0);
};

/** Journal postings are fire-and-forget in the ledger services — wait for them. */
const waitForJournal = async (filter, tries = 40) => {
  for (let i = 0; i < tries; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const found = await JournalEntry.findOne(filter).lean();
    if (found) return found;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
};

beforeEach(async () => {
  org = await Organization.create({
    name: 'Disc Org',
    owner: new mongoose.Types.ObjectId(),
    baseCurrency: 'PKR',
    businessType: 'retail',
  });
  branch = await Branch.create({ organizationId: org._id, name: 'Main' });
  customer = await Customer.create({ organizationId: org._id, branchId: branch._id, name: 'Ali Traders' });
  supplier = await Supplier.create({ organizationId: org._id, branchId: branch._id, name: 'Karachi Wholesale' });
});

describe('customer — discount allowed with a payment', () => {
  test('received 9,950 + 50 discount settles a 10,000 invoice; cash book shows only 9,950', async () => {
    const invoice = await makeInvoice('INV-1', 10000);
    await postSale(invoice);

    const payment = await receive(9950, { amount: 50, reason: 'round_off' });

    const discountRow = payment.$locals.discountEntry;
    expect(discountRow).toBeTruthy();
    expect(discountRow.transactionType).toBe('discount_allowed');
    expect(discountRow.credit).toBe(50);
    expect(discountRow.discount.reason).toBe('round_off');
    expect(String(discountRow.discount.linkedEntryId)).toBe(String(payment._id));
    expect(discountRow.discount.linkedAmount).toBe(9950);

    expect((await Customer.findById(customer._id)).balance).toBe(0);
    expect(await remainingOf(invoice._id)).toBe(0);

    // The discount settled the invoice but is NOT spendable advance credit.
    const records = await CustomerPayment.find({ customer: customer._id }).lean();
    const disc = records.find((r) => r.direction === 'discount');
    expect(disc.amount).toBe(50);
    expect(disc.allocatedTotal).toBe(50);
    expect(disc.unappliedAmount).toBe(0);

    // No money moved for the discount.
    const cash = await CashBookEntry.find({ organizationId: org._id }).lean();
    expect(cash.map((c) => [c.type, c.amount])).toEqual([['income', 9950]]);

    const reconciliation = await customerPaymentService.getCustomerReconciliation({
      organizationId: org._id,
      customer: customer._id,
    });
    expect(reconciliation.unexplained).toBe(0);
  });

  test('posts Dr Discount Allowed / Cr Receivable in the books (account created on demand)', async () => {
    const invoice = await makeInvoice('INV-1', 1000);
    await postSale(invoice);
    const payment = await receive(980, { amount: 20 });

    const journal = await waitForJournal({
      referenceId: payment.$locals.discountEntry._id || payment.$locals.discountEntry.id,
      entryType: 'DISCOUNT_ALLOWED',
    });
    expect(journal).toBeTruthy();
    const accounts = await AccountHead.find({ _id: { $in: journal.lines.map((l) => l.accountId) } }).lean();
    const byId = new Map(accounts.map((a) => [String(a._id), a]));
    const debitLine = journal.lines.find((l) => l.debit > 0);
    const creditLine = journal.lines.find((l) => l.credit > 0);
    expect(byId.get(String(debitLine.accountId)).code).toBe('5304');
    expect(debitLine.debit).toBe(20);
    expect(creditLine.credit).toBe(20);
  });

  test('a discount larger than what is left owing is refused and the payment is NOT posted', async () => {
    const invoice = await makeInvoice('INV-1', 1000);
    await postSale(invoice);

    await expect(receive(900, { amount: 150 })).rejects.toThrow(/more than the 100 still owing/);
    expect(await CustomerLedger.countDocuments({ transactionType: 'payment_received' })).toBe(0);
    expect((await Customer.findById(customer._id)).balance).toBe(1000);
  });

  test('deleting the payment removes its discount and the invoice owes everything again', async () => {
    const invoice = await makeInvoice('INV-1', 10000);
    await postSale(invoice);
    const payment = await receive(9800, { amount: 200, reason: 'cash_discount', percent: 2, baseAmount: 10000 });

    await customerLedgerService.deleteLedgerEntry(payment._id);

    expect(await CustomerLedger.countDocuments({ transactionType: 'discount_allowed' })).toBe(0);
    expect((await Customer.findById(customer._id)).balance).toBe(10000);
    expect(await remainingOf(invoice._id)).toBe(10000);
    const posted = await CustomerPayment.countDocuments({ customer: customer._id, status: 'posted' });
    expect(posted).toBe(0);
  });

  test('moving the payment date moves its discount too', async () => {
    const invoice = await makeInvoice('INV-1', 1000);
    await postSale(invoice);
    const payment = await receive(990, { amount: 10 });
    const newDate = new Date(2026, 10, 12);

    await customerLedgerService.updateLedgerEntry(payment._id, { transactionDate: newDate });

    const disc = await CustomerLedger.findOne({ transactionType: 'discount_allowed' }).lean();
    expect(new Date(disc.transactionDate).getTime()).toBe(newDate.getTime());
  });
});

describe('limits and approval', () => {
  beforeEach(async () => {
    await ledgerDiscountService.updateSettings(org._id, { maxPercent: 1 });
    await postSale(await makeInvoice('INV-1', 10000));
  });

  test('2% against a 1% limit is refused for a user who cannot approve', async () => {
    await expect(receive(9800, { amount: 200 })).rejects.toMatchObject({ statusCode: 403 });
    expect(await CustomerLedger.countDocuments({ transactionType: 'payment_received' })).toBe(0);
  });

  test('an approver must say why, and the row is marked over-limit', async () => {
    await expect(receive(9800, { amount: 200 }, { canApproveDiscount: true })).rejects.toMatchObject({ statusCode: 400 });

    const payment = await receive(
      9800,
      { amount: 200, approvalNote: 'Old customer, owner approved' },
      { canApproveDiscount: true }
    );
    expect(payment.$locals.discountEntry.discount.overLimit).toBe(true);
    expect(payment.$locals.discountEntry.discount.approvalNote).toBe('Old customer, owner approved');
  });

  test('within the limit needs no approval', async () => {
    const payment = await receive(9900, { amount: 100 });
    expect(payment.$locals.discountEntry.discount.overLimit).toBe(false);
  });

  test('switched off → refused', async () => {
    await ledgerDiscountService.updateSettings(org._id, { enabled: false });
    await expect(receive(9990, { amount: 10 })).rejects.toThrow(/turned off/);
  });
});

describe('standalone discount', () => {
  test('against an opening balance: balance drops, reconciliation names it, no invoice touched', async () => {
    await customerLedgerService.syncOpeningBalanceEntry({
      customerId: customer._id,
      amount: 5000,
      organizationId: org._id,
      branchId: branch._id,
      transactionDate: new Date(2026, 0, 1),
    });

    await customerLedgerService.createLedgerEntry(
      {
        ...base(),
        customer: customer._id,
        transactionType: 'discount_allowed',
        transactionDate: new Date(2026, 10, 9),
        description: 'Year-end rebate',
        credit: 500,
        discount: { reason: 'volume_rebate' },
      },
      { user }
    );

    expect((await Customer.findById(customer._id)).balance).toBe(4500);
    const rec = await customerPaymentService.getCustomerReconciliation({ organizationId: org._id, customer: customer._id });
    expect(rec.discountsOnAccount).toBe(500);
  });

  test('refused when nothing is owed', async () => {
    await expect(
      customerLedgerService.createLedgerEntry(
        {
          ...base(),
          customer: customer._id,
          transactionType: 'discount_allowed',
          transactionDate: new Date(),
          description: 'x',
          credit: 10,
        },
        { user }
      )
    ).rejects.toThrow(/Nothing is owing/);
  });
});

describe('supplier — discount received', () => {
  test('paid 4,800 + 200 discount settles a 5,000 bill; Dr Payable / Cr Discount Received', async () => {
    const purchase = await Purchase.create({
      ...base(),
      supplier: supplier._id,
      invoiceNumber: 'PUR-1',
      items: [],
      purchaseDate: new Date(2026, 10, 1),
      totalAmount: 5000,
      paidAmount: 0,
      balance: 5000,
      type: 'credit',
    });
    await supplierLedgerService.createLedgerEntry({
      ...base(),
      supplier: supplier._id,
      transactionType: 'purchase',
      transactionDate: purchase.purchaseDate,
      reference: 'PUR-1',
      referenceId: purchase._id,
      description: 'Purchase PUR-1',
      credit: 5000,
      debit: 0,
    });

    const payment = await supplierLedgerService.createLedgerEntry(
      {
        ...base(),
        supplier: supplier._id,
        transactionType: 'payment_made',
        transactionDate: new Date(2026, 10, 9),
        description: 'Cash paid',
        debit: 4800,
        credit: 0,
        paymentMethod: 'Cash',
        settlementDiscount: { amount: 200, reason: 'early_payment' },
      },
      { user }
    );

    const discRow = payment.$locals.discountEntry;
    expect(discRow.transactionType).toBe('discount_received');
    expect(discRow.debit).toBe(200);
    expect((await Supplier.findById(supplier._id)).balance).toBe(0);
    const p = await Purchase.findById(purchase._id).lean();
    expect(p.totalAmount - p.paidAmount - p.allocatedAmount).toBe(0);
    const disc = await SupplierPayment.findOne({ direction: 'discount' }).lean();
    expect(disc.unappliedAmount).toBe(0);

    const cash = await CashBookEntry.find({ organizationId: org._id }).lean();
    expect(cash.map((c) => [c.type, c.amount])).toEqual([['expense', 4800]]);

    const journal = await waitForJournal({ entryType: 'DISCOUNT_RECEIVED' });
    expect(journal).toBeTruthy();
    const credit = journal.lines.find((l) => l.credit > 0);
    const acc = await AccountHead.findById(credit.accountId).lean();
    expect(acc.code).toBe('4201');
    expect(credit.credit).toBe(200);

    const rec = await supplierPaymentService.getSupplierReconciliation({ organizationId: org._id, supplier: supplier._id });
    expect(rec.residual).toBe(0);

    // Deleting the payment takes the discount with it.
    await supplierLedgerService.deleteLedgerEntry(payment._id);
    expect(await SupplierLedger.countDocuments({ transactionType: 'discount_received' })).toBe(0);
    expect((await Supplier.findById(supplier._id)).balance).toBe(5000);
  });
});

describe('register + P&L totals', () => {
  test('totals by side and reason, discount rate of collections', async () => {
    await postSale(await makeInvoice('INV-1', 10000, 1));
    await receive(9800, { amount: 200, reason: 'cash_discount' });
    await postSale(await makeInvoice('INV-2', 1000, 2));
    await receive(990, { amount: 10, reason: 'round_off' });

    const register = await ledgerDiscountService.getRegister(
      { organizationId: org._id, branchId: branch._id },
      { startDate: '2026-11-01', endDate: '2026-11-30' }
    );
    expect(register.summary.allowed.total).toBe(210);
    expect(register.summary.allowed.count).toBe(2);
    expect(register.summary.allowed.collections).toBe(10790);
    // 210 of 11,000 settled = 1.91%
    expect(register.summary.allowed.rateOfCollections).toBe(1.91);
    expect(register.byReason.map((r) => [r.key, r.amount])).toEqual([
      ['cash_discount', 200],
      ['round_off', 10],
    ]);
    expect(register.rows[0].partyName).toBe('Ali Traders');

    const totals = await ledgerDiscountService.getTotalsForPeriod(
      { organizationId: org._id },
      new Date(2026, 10, 1),
      new Date(2026, 10, 30, 23, 59)
    );
    expect(totals.discountAllowed).toBe(210);
    expect(totals.discountReceived).toBe(0);
  });
});

describe('reports show ledger discounts', () => {
  // eslint-disable-next-line global-require
  const reportsController = require('../../../src/controllers/reports.controller');
  const call = (handler, query) =>
    new Promise((resolve, reject) => {
      const res = {
        status() {
          return this;
        },
        send: resolve,
        json: resolve,
      };
      handler({ organizationId: org._id, branchId: branch._id, query, user: { organizationId: org._id } }, res, reject);
    });
  const range = { startDate: '2026-11-01', endDate: '2026-11-30' };

  test('customer report: per-customer ledger discount + summary total', async () => {
    await postSale(await makeInvoice('INV-1', 10000, 1));
    await receive(9800, { amount: 200, reason: 'cash_discount' });
    const out = await call(reportsController.getCustomerReport, range);
    const row = out.data.find((r) => String(r._id) === `id:${customer._id}`);
    expect(row.ledgerDiscount).toBe(200);
    expect(row.ledgerDiscountCount).toBe(1);
    expect(out.summary.totalLedgerDiscount).toBe(200);
  });

  test('activities: discount listed as a no-cash entry, cash totals untouched', async () => {
    await postSale(await makeInvoice('INV-1', 1000, 1));
    await receive(990, { amount: 10, reason: 'round_off' });
    const out = await call(reportsController.getActivitySummaryReport, range);
    const disc = out.entries.find((e) => e.module === 'Discounts');
    expect(disc.subType).toBe('Discount Allowed');
    expect(disc.direction).toBe('neutral');
    expect(disc.totalAmount).toBe(10);
    expect(out.summary.discountAllowed).toBe(10);
    expect(out.summary.cashReceived).toBe(990);
  });

  test('full P&L subtracts discount allowed and adds discount received', async () => {
    await postSale(await makeInvoice('INV-1', 1000, 1));
    await receive(950, { amount: 50 });
    const out = await call(reportsController.getProfitLossFullReport, { from: '2026-11-01', to: '2026-11-30', ...range });
    expect(out.adjustments.discountAllowed).toBe(50);
    expect(out.adjustments.discountReceived).toBe(0);
  });
});

describe('vouchers with line discounts', () => {
  // eslint-disable-next-line global-require
  const receiptVoucherService = require('../../../src/services/receiptVoucher.service');
  // eslint-disable-next-line global-require
  const paymentVoucherService = require('../../../src/services/paymentVoucher.service');
  // eslint-disable-next-line global-require
  const { Wallet, ReceiptVoucher, PaymentVoucher } = require('../../../src/models');
  const rights = { user, canGiveDiscount: true, canApproveDiscount: false };
  let bank;

  beforeEach(async () => {
    bank = await Wallet.create({
      organizationId: org._id,
      branchId: branch._id,
      type: 'Meezan',
      accountType: 'bank',
      balance: 100000,
    });
  });

  const receipt = (lines, ctx = rights) =>
    receiptVoucherService.createVoucher(
      { organizationId: org._id, branchId: branch._id, bankAccountId: bank._id, date: new Date(2026, 10, 9), lines },
      user.id,
      ctx
    );

  test('receipt voucher: 9,950 + 50 discount settles 10,000; bank gets only 9,950', async () => {
    const invoice = await makeInvoice('INV-1', 10000);
    await postSale(invoice);

    const voucher = await receipt([
      {
        sourceType: 'customer',
        customerId: String(customer._id),
        amount: 9950,
        discountAmount: 50,
        discountReason: 'round_off',
      },
    ]);

    expect(voucher.totalAmount).toBe(9950);
    expect(voucher.totalDiscount).toBe(50);
    expect(voucher.lines[0].discountLedgerEntryId).toBeTruthy();
    expect((await Customer.findById(customer._id)).balance).toBe(0);
    expect(await remainingOf(invoice._id)).toBe(0);
    expect((await Wallet.findById(bank._id)).balance).toBe(100000 + 9950);

    // Deleting the voucher takes the discount with it.
    await receiptVoucherService.deleteVoucherById(voucher._id, { organizationId: org._id, branchId: branch._id });
    expect(await CustomerLedger.countDocuments({ transactionType: 'discount_allowed' })).toBe(0);
    expect((await Customer.findById(customer._id)).balance).toBe(10000);
  });

  test('two lines for the same customer cannot jointly discount more than owed — nothing is written', async () => {
    await postSale(await makeInvoice('INV-1', 1000));
    await expect(
      receipt([
        { sourceType: 'customer', customerId: String(customer._id), amount: 500, discountAmount: 100 },
        { sourceType: 'customer', customerId: String(customer._id), amount: 350, discountAmount: 100 },
      ])
    ).rejects.toThrow(/still owing/);
    expect(await ReceiptVoucher.countDocuments({})).toBe(0);
    expect(await CustomerLedger.countDocuments({ transactionType: 'payment_received' })).toBe(0);
  });

  test('without the permission a discount line is refused before anything is written', async () => {
    await postSale(await makeInvoice('INV-1', 1000));
    await expect(
      receipt([{ sourceType: 'customer', customerId: String(customer._id), amount: 990, discountAmount: 10 }], {
        user,
        canGiveDiscount: false,
      })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(await ReceiptVoucher.countDocuments({})).toBe(0);
  });

  test('editing the discount re-posts the line; removing it removes the discount row', async () => {
    await postSale(await makeInvoice('INV-1', 10000));
    const voucher = await receipt([
      {
        sourceType: 'customer',
        customerId: String(customer._id),
        amount: 9800,
        discountAmount: 200,
        discountReason: 'cash_discount',
      },
    ]);
    const lineId = String(voucher.lines[0]._id);
    const scope = { organizationId: org._id, branchId: branch._id };

    await receiptVoucherService.updateVoucher(
      voucher._id,
      scope,
      {
        bankAccountId: bank._id,
        lines: [
          {
            id: lineId,
            sourceType: 'customer',
            customerId: String(customer._id),
            amount: 9800,
            discountAmount: 150,
            discountReason: 'cash_discount',
          },
        ],
      },
      user.id,
      rights
    );
    let discounts = await CustomerLedger.find({ transactionType: 'discount_allowed' }).lean();
    expect(discounts.map((d) => d.credit)).toEqual([150]);
    expect((await Customer.findById(customer._id)).balance).toBe(50);

    await receiptVoucherService.updateVoucher(
      voucher._id,
      scope,
      {
        bankAccountId: bank._id,
        lines: [{ id: lineId, sourceType: 'customer', customerId: String(customer._id), amount: 9800 }],
      },
      user.id,
      rights
    );
    discounts = await CustomerLedger.find({ transactionType: 'discount_allowed' }).lean();
    expect(discounts).toHaveLength(0);
    expect((await Customer.findById(customer._id)).balance).toBe(200);
    expect((await ReceiptVoucher.findById(voucher._id)).totalDiscount).toBe(0);
  });

  test('payment voucher: supplier discount received with the payment', async () => {
    const purchase = await Purchase.create({
      ...base(),
      supplier: supplier._id,
      invoiceNumber: 'PUR-1',
      items: [],
      purchaseDate: new Date(2026, 10, 1),
      totalAmount: 5000,
      paidAmount: 0,
      balance: 5000,
      type: 'credit',
    });
    await supplierLedgerService.createLedgerEntry({
      ...base(),
      supplier: supplier._id,
      transactionType: 'purchase',
      transactionDate: purchase.purchaseDate,
      reference: 'PUR-1',
      referenceId: purchase._id,
      description: 'Purchase PUR-1',
      credit: 5000,
      debit: 0,
    });
    const voucher = await paymentVoucherService.createVoucher(
      {
        organizationId: org._id,
        branchId: branch._id,
        bankAccountId: bank._id,
        date: new Date(2026, 10, 9),
        lines: [
          {
            payeeType: 'supplier',
            supplierId: String(supplier._id),
            amount: 4800,
            discountAmount: 200,
            discountReason: 'early_payment',
          },
        ],
      },
      user.id,
      rights
    );
    expect(voucher.totalDiscount).toBe(200);
    expect((await Supplier.findById(supplier._id)).balance).toBe(0);
    expect((await Wallet.findById(bank._id)).balance).toBe(100000 - 4800);
    expect(await PaymentVoucher.countDocuments({})).toBe(1);
  });
});

describe('batched balances endpoint', () => {
  test('returns many balances in one call and never another organization’s', async () => {
    // eslint-disable-next-line global-require
    const controller = require('../../../src/controllers/customerLedger.controller');
    const other = await Customer.create({
      organizationId: new mongoose.Types.ObjectId(),
      branchId: branch._id,
      name: 'Foreign',
      balance: 999,
    });
    await Customer.updateOne({ _id: customer._id }, { balance: 1234 });
    const out = await new Promise((resolve, reject) =>
      controller.getCustomerBalances(
        { organizationId: org._id, query: { ids: `${customer._id},${other._id}` } },
        {
          send: resolve,
          status() {
            return this;
          },
        },
        reject
      )
    );
    expect(out.balances).toEqual({ [String(customer._id)]: 1234 });
  });
});
