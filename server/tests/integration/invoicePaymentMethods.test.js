const mongoose = require('mongoose');
const setupTestDB = require('../utils/setupTestDB');
const { Organization, Customer, Product, Invoice, Wallet, WalletEntry, CashBookEntry, Purchase, Supplier } = require('../../src/models');
const purchaseService = require('../../src/services/purchase.service');
const entitlementService = require('../../src/services/entitlement.service');
const invoiceService = require('../../src/services/invoice.service');
const walletService = require('../../src/services/wallet.service');
const reportsController = require('../../src/controllers/reports.controller');
const { buildPaymentModeBreakdown } = require('../../src/utils/paymentMode');

/**
 * Payment-method cards for wholesale / distributor sales: Credit Card / ACH / Check accounts are
 * seeded per branch, the invoice records its tender (paymentMode) + check # / reference, the money
 * lands in that account (not the Cash Book), and lists / the Sales report can split by tender.
 */
setupTestDB();
jest.setTimeout(60000);

const id = () => new mongoose.Types.ObjectId();
let ORG;
let BRANCH;
let product;
let customer;
const userId = String(id());

beforeAll(() => {
  jest.spyOn(entitlementService, 'assertCanCreateInvoice').mockResolvedValue();
  jest.spyOn(entitlementService, 'assertCanWrite').mockResolvedValue();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

const setupOrg = async (businessType) => {
  ORG = id();
  BRANCH = id();
  await Organization.create({ _id: ORG, name: 'G Wholesaler', owner: id(), businessType });
  product = await Product.create({ organizationId: ORG, branchId: BRANCH, name: 'Micro Dot', price: 145, cost: 100, stockQuantity: 500 });
  customer = await Customer.create({ organizationId: ORG, branchId: BRANCH, name: '24 Hour Liquor' });
};

const sale = (extra = {}) =>
  invoiceService.createInvoice(
    {
      organizationId: ORG,
      branchId: BRANCH,
      customerId: String(customer._id),
      type: 'cash',
      paidAmount: 145,
      paymentMethod: 'cash',
      items: [{ productId: product._id, name: 'Micro Dot', quantity: 1, unitPrice: 145, subtotal: 145 }],
      ...extra,
    },
    userId,
    { actor: { id: userId, name: 'Owner' } }
  );

const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

describe('payment-method accounts', () => {
  test('distributor branch gets Credit Card / ACH / Check accounts once, adopting a same-named one', async () => {
    await setupOrg('distributor');
    await Wallet.create({ organizationId: ORG, branchId: BRANCH, type: 'Check', balance: 0 });

    await walletService.ensureDefaultPaymentMethodWallets({ organizationId: ORG, branchId: BRANCH, userId, businessType: 'distributor' });
    await walletService.ensureDefaultPaymentMethodWallets({ organizationId: ORG, branchId: BRANCH, userId, businessType: 'distributor' });

    const wallets = await Wallet.find({ organizationId: ORG, branchId: BRANCH }).lean();
    const byMode = Object.fromEntries(wallets.filter((w) => w.paymentMode).map((w) => [w.paymentMode, w]));
    expect(Object.keys(byMode).sort()).toEqual(['ach', 'card', 'check']);
    expect(byMode.card).toMatchObject({ type: 'Credit Card', accountType: 'bank' });
    expect(wallets.filter((w) => w.type === 'Check')).toHaveLength(1);
    expect(wallets).toHaveLength(3);
  });

  test('a renamed account keeps its card; business type is looked up when missing on the request', async () => {
    await setupOrg('wholesale');
    await walletService.ensureDefaultPaymentMethodWallets({ organizationId: ORG, branchId: BRANCH, userId });
    await Wallet.updateOne({ organizationId: ORG, paymentMode: 'check' }, { type: 'Checks on hand' });
    await walletService.ensureDefaultPaymentMethodWallets({ organizationId: ORG, branchId: BRANCH, userId });
    expect(await Wallet.countDocuments({ organizationId: ORG, paymentMode: 'check' })).toBe(1);
  });

  test('other business types get nothing', async () => {
    await setupOrg('retail');
    await walletService.ensureDefaultPaymentMethodWallets({ organizationId: ORG, branchId: BRANCH, userId, businessType: 'retail' });
    expect(await Wallet.countDocuments({ organizationId: ORG })).toBe(0);
  });
});

describe('invoice tender', () => {
  beforeEach(async () => {
    await setupOrg('distributor');
    await walletService.ensureDefaultPaymentMethodWallets({ organizationId: ORG, branchId: BRANCH, userId, businessType: 'distributor' });
  });

  test('a check sale records mode + check #, lands in the Check account, not the Cash Book', async () => {
    const invoice = await sale({ paymentMethod: 'wallet', walletType: 'Check', paymentReference: ' 10234 ' });
    expect(invoice.paymentMode).toBe('check');
    expect(invoice.paymentReference).toBe('10234');
    await settle();

    const walletEntries = await WalletEntry.find({ organizationId: ORG, referenceId: invoice._id }).lean();
    expect(walletEntries).toHaveLength(1);
    expect(walletEntries[0]).toMatchObject({ walletType: 'Check', amount: 145 });
    expect(await CashBookEntry.countDocuments({ organizationId: ORG, referenceId: invoice._id, paymentMethod: 'cash' })).toBe(0);
  });

  test('cash sale is cash and drops a stray reference; switching to ACH on edit re-derives the mode', async () => {
    const invoice = await sale({ paymentReference: 'ignored' });
    expect(invoice.paymentMode).toBe('cash');
    expect(invoice.paymentReference).toBeUndefined();

    const updated = await invoiceService.updateInvoiceById(
      invoice._id,
      { paymentMethod: 'wallet', walletType: 'ACH', paymentReference: 'TR-77' },
      userId,
      { actor: { id: userId } }
    );
    expect(updated.paymentMode).toBe('ach');
    expect(updated.paymentReference).toBe('TR-77');
  });

  test('quotations carry no tender', async () => {
    const quote = await sale({ type: 'quotation', paidAmount: 0, paymentMethod: 'wallet', walletType: 'Credit Card', paymentReference: '4242' });
    expect(quote.paymentMode).toBeUndefined();
    expect(quote.paymentReference).toBeUndefined();
  });

  test('invoice list filters by payment method (legacy cash invoices count as cash)', async () => {
    await sale({ paymentMethod: 'wallet', walletType: 'Check', paymentReference: '1' });
    await sale({ paymentMethod: 'wallet', walletType: 'Credit Card' });
    await sale();
    await Invoice.collection.insertOne({
      organizationId: ORG,
      branchId: BRANCH,
      invoiceNumber: 'OLD-1',
      type: 'cash',
      paymentMethod: 'cash',
      items: [],
      total: 50,
      paidAmount: 50,
      invoiceDate: new Date(),
    });

    const list = async (paymentMode) =>
      (await invoiceService.queryInvoiceList({ organizationId: ORG, branchId: BRANCH }, { paymentMode, limit: 50 })).results;

    expect((await list('check')).map((r) => r.paymentMode)).toEqual(['check']);
    expect(await list('card,check')).toHaveLength(2);
    expect(await list('cash')).toHaveLength(2);
  });

  test('sales report splits collections by tender, including a split leg', async () => {
    await sale({ paymentMethod: 'wallet', walletType: 'Check', paymentReference: '9' });
    await sale({ paymentMethod: 'wallet', walletType: 'Check' });
    await sale({ paymentMethod: 'wallet', walletType: 'ACH' });
    await sale({ type: 'credit', paidAmount: 100, paymentMethod: 'cash', splitPaymentMethod: 'wallet', splitWalletType: 'Credit Card', splitPaidAmount: 40 });

    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    const today = new Date().toISOString().slice(0, 10);
    await reportsController.getSalesInvoiceDetails(
      { organizationId: String(ORG), branchId: String(BRANCH), user: { organizationId: String(ORG) }, query: { startDate: today, endDate: today } },
      res,
      (err) => {
        if (err) throw err;
      }
    );
    await settle();
    const body = res.send.mock.calls[0][0];
    const byKey = Object.fromEntries(body.byPaymentMethod.map((r) => [r.key, r]));
    expect(byKey.check).toMatchObject({ amount: 290, invoices: 2, label: 'Check' });
    expect(byKey.ach).toMatchObject({ amount: 145, invoices: 1 });
    expect(byKey.cash).toMatchObject({ amount: 60, invoices: 1 });
    expect(byKey.card).toMatchObject({ amount: 40, invoices: 1, label: 'Credit Card' });
    expect(body.byPaymentMethod.map((r) => r.key)).toEqual(['cash', 'card', 'ach', 'check']);
    expect(body.invoices.find((i) => i.paymentReference === '9').paymentMode).toBe('check');
  });
});

describe('purchase tender', () => {
  let supplier;
  let seq = 0;
  beforeEach(async () => {
    await setupOrg('distributor');
    await walletService.ensureDefaultPaymentMethodWallets({ organizationId: ORG, branchId: BRANCH, userId, businessType: 'distributor' });
    await Wallet.create({ organizationId: ORG, branchId: BRANCH, type: 'Chase Bank', accountType: 'bank', balance: 5000 });
    supplier = await Supplier.create({ organizationId: ORG, branchId: BRANCH, name: 'Hemp Supply Co' });
  });

  const buy = (extra = {}) =>
    Purchase.create({
      organizationId: ORG,
      branchId: BRANCH,
      supplier: supplier._id,
      invoiceNumber: `PUR-${(seq += 1)}`,
      items: [{ product: product._id, quantity: 2, stockQuantity: 2, priceAtPurchase: 100, total: 200 }],
      totalAmount: 200,
      paidAmount: 200,
      ...extra,
    });

  test('a check written from the bank account keeps the chosen tender and check #', async () => {
    const purchase = await buy({ paymentMethod: 'wallet', walletType: 'Chase Bank', paymentMode: 'check', paymentReference: '5501' });
    expect(purchase.paymentMode).toBe('check');
    expect(purchase.paymentReference).toBe('5501');
  });

  test('no tender sent → taken from the account; cash always wins; edit to another account re-derives', async () => {
    const fromBank = await buy({ paymentMethod: 'wallet', walletType: 'Chase Bank' });
    expect(fromBank.paymentMode).toBe('bank');
    const fromAch = await buy({ paymentMethod: 'wallet', walletType: 'ACH' });
    expect(fromAch.paymentMode).toBe('ach');
    const cash = await buy({ paymentMode: 'check', paymentReference: '1' });
    expect(cash.paymentMode).toBe('cash');
    expect(cash.paymentReference).toBeUndefined();

    fromBank.walletType = 'Credit Card';
    await fromBank.save();
    expect(fromBank.paymentMode).toBe('card');
  });

  test('Credit Card / ACH / Check accounts may run below zero; a normal bank account may not', async () => {
    const check = await walletService.adjustWalletBalance({ organizationId: ORG, branchId: BRANCH, type: 'Check', amount: 145, operation: 'deduct', userId });
    expect(check.balance).toBe(-145);
    await expect(
      walletService.adjustWalletBalance({ organizationId: ORG, branchId: BRANCH, type: 'Chase Bank', amount: 6000, operation: 'deduct', userId })
    ).rejects.toThrow(/insufficient/);
    const plain = new Wallet({ organizationId: ORG, branchId: BRANCH, type: 'Other', balance: -1 });
    await expect(plain.validate()).rejects.toThrow(/negative/);
  });

  test('purchase list filters by tender and the purchase report splits payments by it', async () => {
    await buy({ paymentMethod: 'wallet', walletType: 'Chase Bank', paymentMode: 'check', paymentReference: '7' });
    await buy({ paymentMethod: 'wallet', walletType: 'Chase Bank', paymentMode: 'ach' });
    await buy();

    const list = async (paymentMode) =>
      (await purchaseService.queryPurchaseList({ organizationId: ORG, branchId: BRANCH }, { paymentMode, limit: 50 })).results;
    expect((await list('check')).map((r) => r.paymentReference)).toEqual(['7']);
    expect(await list('cash')).toHaveLength(1);

    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    const today = new Date().toISOString().slice(0, 10);
    await reportsController.getPurchaseInvoiceDetails(
      { organizationId: String(ORG), branchId: String(BRANCH), user: { organizationId: String(ORG) }, query: { startDate: today, endDate: today } },
      res,
      (err) => {
        if (err) throw err;
      }
    );
    await settle();
    const rows = Object.fromEntries(res.send.mock.calls[0][0].byPaymentMethod.map((r) => [r.key, r.amount]));
    expect(rows).toEqual({ cash: 200, ach: 200, check: 200 });
  });
});

describe('buildPaymentModeBreakdown', () => {
  test('skips quotations/pending, names plain bank accounts, maps legacy card', () => {
    const rows = buildPaymentModeBreakdown(
      [
        { type: 'quotation', paidAmount: 999 },
        { type: 'cash', paidAmount: 10, paymentMethod: 'wallet', walletType: 'Meezan Bank' },
        { type: 'cash', paidAmount: 5, paymentMethod: 'card' },
      ],
      new Map()
    );
    expect(rows).toEqual([
      expect.objectContaining({ key: 'card', amount: 5 }),
      expect.objectContaining({ key: 'bank:Meezan Bank', label: 'Meezan Bank', amount: 10 }),
    ]);
  });
});
