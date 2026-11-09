const mongoose = require('mongoose');
const setupTestDB = require('../utils/setupTestDB');
const { Organization, Customer, Product, Invoice, CreditLimitEvent } = require('../../src/models');
const entitlementService = require('../../src/services/entitlement.service');
const invoiceService = require('../../src/services/invoice.service');
const creditControlService = require('../../src/services/creditControl.service');
const customerService = require('../../src/services/customer.service');

/**
 * Customer credit limits: a credit sale that would take a customer past their limit is
 * refused (before an invoice number is used up), fully paid sales always go through, and
 * a refusal can be overridden, warned through, raised temporarily or recorded (offline sync).
 */
setupTestDB();
jest.setTimeout(60000);

const id = () => new mongoose.Types.ObjectId();
let ORG;
let BRANCH;
let product;
const manager = { id: String(id()), name: 'Manager' };

beforeAll(() => {
  jest.spyOn(entitlementService, 'assertCanCreateInvoice').mockResolvedValue();
  jest.spyOn(entitlementService, 'assertCanWrite').mockResolvedValue();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

beforeEach(async () => {
  ORG = id();
  BRANCH = id();
  await Organization.create({ _id: ORG, name: 'Credit Test Traders', owner: id() });
  product = await Product.create({
    organizationId: ORG,
    branchId: BRANCH,
    name: 'Fan',
    price: 1000,
    cost: 600,
    stockQuantity: 500,
  });
});

const newCustomer = (extra = {}) =>
  Customer.create({ organizationId: ORG, branchId: BRANCH, name: 'Amjad', ...extra });

const sale = (customer, { amount, type = 'credit', paid = 0, ...extra } = {}, options = {}) =>
  invoiceService.createInvoice(
    {
      organizationId: ORG,
      branchId: BRANCH,
      customerId: String(customer._id),
      type,
      paidAmount: paid,
      paymentMethod: 'cash',
      items: [{ productId: product._id, name: 'Fan', quantity: amount / 1000, unitPrice: 1000, subtotal: amount }],
      ...extra,
    },
    manager.id,
    { actor: manager, ...options }
  );

const creditError = async (promise) => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the sale to be refused');
};

const balanceOf = async (customer) => (await Customer.findById(customer._id)).balance;

describe('credit limit enforcement', () => {
  test('no limit (0) never stops a credit sale', async () => {
    const customer = await newCustomer();
    await sale(customer, { amount: 90000 });
    expect(await balanceOf(customer)).toBe(90000);
  });

  test('a credit sale over the limit is refused with the numbers, without using an invoice number', async () => {
    const customer = await newCustomer({ creditLimit: 10000 });
    const first = await sale(customer, { amount: 8000 });
    expect(await balanceOf(customer)).toBe(8000);

    const error = await creditError(sale(customer, { amount: 5000 }));
    expect(error.statusCode).toBe(422);
    expect(error.errorCode).toBe('CREDIT_LIMIT_EXCEEDED');
    expect(error.details.reasons).toEqual(['over_limit']);
    expect(error.details.credit).toMatchObject({ limit: 10000, exposure: 8000, saleAmount: 5000, projectedExposure: 13000, excess: 3000 });
    expect(error.message).toMatch(/credit limit 10,000 exceeded/);
    expect(await Invoice.countDocuments({ organizationId: ORG })).toBe(1);

    // The refused attempt didn't burn a number: the next sale continues the sequence.
    const next = await sale(customer, { amount: 2000 });
    const seq = (n) => Number(String(n).match(/(\d+)$/)[1]);
    expect(seq(next.invoiceNumber)).toBe(seq(first.invoiceNumber) + 1);
    // Exactly at the limit is allowed.
    expect(await balanceOf(customer)).toBe(10000);
  });

  test('fully paid and partly paid sales count only what is left unpaid', async () => {
    const customer = await newCustomer({ creditLimit: 10000 });
    await sale(customer, { amount: 9000 });
    await sale(customer, { amount: 50000, type: 'cash', paid: 50000 });
    await sale(customer, { amount: 6000, paid: 5000 });
    expect(await balanceOf(customer)).toBe(10000);
    const error = await creditError(sale(customer, { amount: 3000, paid: 2000 }));
    expect(error.details.credit.saleAmount).toBe(1000);
  });

  test('a manager override goes through with a reason, is stamped and logged; without the right it is refused', async () => {
    const customer = await newCustomer({ creditLimit: 5000 });
    await sale(customer, { amount: 4000 });

    const forbidden = await creditError(sale(customer, { amount: 3000, creditOverride: { reason: 'Old client' } }, { canOverrideCredit: false }));
    expect(forbidden.statusCode).toBe(403);

    const invoice = await sale(customer, { amount: 3000, creditOverride: { reason: 'Old client, pays Friday' } }, { canOverrideCredit: true });
    expect(invoice.creditOverride).toMatchObject({ kind: 'override', reason: 'Old client, pays Friday', limit: 5000, exposure: 7000, excess: 2000 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const events = await CreditLimitEvent.find({ customerId: customer._id, type: 'override' });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ reason: 'Old client, pays Friday', excess: 2000, performedByName: 'Manager' });
  });

  test('a client cannot stamp an approval onto the invoice by itself', async () => {
    const customer = await newCustomer();
    const invoice = await sale(customer, { amount: 1000, creditOverride: { reason: 'sneaky' } });
    expect(invoice.creditOverride).toBeUndefined();
  });

  test('warn mode refuses once, then lets the counter carry on (logged as a warning)', async () => {
    await creditControlService.updateSettings(ORG, { mode: 'warn' });
    const customer = await newCustomer({ creditLimit: 1000 });
    const warning = await creditError(sale(customer, { amount: 2000 }));
    expect(warning.details.mode).toBe('warn');
    const invoice = await sale(customer, { amount: 2000, creditAcknowledgeWarning: true });
    expect(invoice.creditOverride.kind).toBe('warning');
  });

  test('credit hold stops any new credit, even with no limit, but not paid sales', async () => {
    const customer = await newCustomer();
    await creditControlService.setHold({ organizationId: ORG, customerId: customer._id, onHold: true, reason: 'Cheque bounced', actor: manager });
    const error = await creditError(sale(customer, { amount: 1000 }));
    expect(error.details.reasons).toEqual(['on_hold']);
    expect(error.message).toMatch(/Cheque bounced/);
    await sale(customer, { amount: 1000, type: 'cash', paid: 1000 });
    // Warn mode does not soften a hold.
    await creditControlService.updateSettings(ORG, { mode: 'warn' });
    await creditError(sale(customer, { amount: 1000, creditAcknowledgeWarning: true }));
  });

  test('quick increase, temporary limit and its expiry', async () => {
    const customer = await newCustomer({ creditLimit: 5000 });
    await sale(customer, { amount: 5000 });
    await creditError(sale(customer, { amount: 3000 }));

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await creditControlService.changeLimit({ organizationId: ORG, customerId: customer._id, action: 'temporary', amount: 9000, expiresAt: tomorrow, reason: 'Eid stock', actor: manager });
    await sale(customer, { amount: 3000 });

    // Once it lapses the base limit is back — no clean-up job needed.
    await Customer.updateOne({ _id: customer._id }, { $set: { 'tempCreditLimit.expiresAt': new Date(Date.now() - 1000) } });
    await creditError(sale(customer, { amount: 500 }));

    await creditControlService.changeLimit({ organizationId: ORG, customerId: customer._id, action: 'increase', amount: 5000, actor: manager });
    expect((await Customer.findById(customer._id)).creditLimit).toBe(10000);
    await sale(customer, { amount: 2000 });

    const history = await creditControlService.getHistory({ organizationId: ORG, customerId: customer._id });
    expect(history.map((row) => row.type)).toEqual(['limit_increase', 'temp_limit_set']);
    expect(history[0]).toMatchObject({ previousLimit: 5000, newLimit: 10000 });
  });

  test('editing: trimming an over-limit invoice is allowed, adding to it is refused', async () => {
    const customer = await newCustomer({ creditLimit: 10000 });
    const invoice = await sale(customer, { amount: 8000 });
    await Customer.updateOne({ _id: customer._id }, { $set: { creditLimit: 5000 } });
    const items = (amount) => [{ productId: product._id, name: 'Fan', quantity: amount / 1000, unitPrice: 1000, subtotal: amount }];

    await invoiceService.updateInvoiceById(String(invoice._id), { items: items(6000), total: 6000, paidAmount: 0 }, manager.id, { actor: manager });
    const error = await creditError(
      invoiceService.updateInvoiceById(String(invoice._id), { items: items(7000), total: 7000, paidAmount: 0 }, manager.id, { actor: manager })
    );
    expect(error.details.credit).toMatchObject({ exposure: 0, saleAmount: 7000, excess: 2000 });
    // Refused before stock moved.
    expect((await Product.findById(product._id)).stockQuantity).toBe(500 - 6);
  });

  test('pending invoices count toward credit; the bill that consolidates them does not double-count', async () => {
    const customer = await newCustomer({ creditLimit: 10000 });
    await sale(customer, { amount: 7000, type: 'pending' });
    const error = await creditError(sale(customer, { amount: 4000 }));
    expect(error.details.credit).toMatchObject({ pendingAmount: 7000, exposure: 7000 });
    await sale(customer, { amount: 7000, billNumber: 'BILL-000001' });
  });

  test('an offline sale syncing later is never refused, only recorded', async () => {
    const customer = await newCustomer({ creditLimit: 1000 });
    const invoice = await sale(customer, { amount: 5000 }, { creditMode: 'record' });
    expect(invoice.creditOverride.kind).toBe('offline_sale');
  });

  test('overdue rule: an invoice overdue past the allowed days stops new credit', async () => {
    await creditControlService.updateSettings(ORG, { overdueBlockDays: 30 });
    const customer = await newCustomer();
    await sale(customer, { amount: 2000, dueDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) });
    const error = await creditError(sale(customer, { amount: 1000 }));
    expect(error.details.reasons).toEqual(['overdue']);
    expect(error.details.credit.overdue).toMatchObject({ count: 1, blockingCount: 1, amount: 2000 });
  });

  test('turned off, nothing is enforced', async () => {
    await creditControlService.updateSettings(ORG, { enabled: false });
    const customer = await newCustomer({ creditLimit: 100, creditHold: true });
    await sale(customer, { amount: 5000 });
  });
});

describe('bulk credit actions, overdue review and Excel import', () => {
  const bulk = (body) => creditControlService.bulkUpdate({ organizationId: ORG, branchId: BRANCH, actor: manager, ...body });

  test('set / increase / % / match balance / remove — with skips reported, history written', async () => {
    const a = await newCustomer({ name: 'A', creditLimit: 10000 });
    const b = await newCustomer({ name: 'B' });
    const c = await newCustomer({ name: 'C', creditLimit: 20000 });
    await sale(b, { amount: 8000 });

    let result = await bulk({ customerIds: [a._id, b._id, c._id], action: 'increase_percent', percent: 25, roundTo: 1000 });
    expect(result).toMatchObject({ total: 3, updated: 2, skippedCount: 1 });
    expect(result.skipped[0]).toMatchObject({ name: 'B', reason: 'Has no limit to increase' });
    expect((await Customer.findById(a._id)).creditLimit).toBe(13000); // 12,500 rounded up to 1,000
    expect((await Customer.findById(c._id)).creditLimit).toBe(25000);

    // Switching limits on for everyone without blocking anybody: owed + 10%, rounded.
    result = await bulk({ scope: 'no_limit', action: 'match_balance', percent: 10, roundTo: 500 });
    expect(result.updated).toBe(1);
    expect((await Customer.findById(b._id)).creditLimit).toBe(9000); // 8,800 → 9,000

    result = await bulk({ scope: 'all', action: 'set', amount: 25000 });
    expect(result).toMatchObject({ updated: 2, skippedCount: 1 }); // C already 25,000
    result = await bulk({ customerIds: [a._id], action: 'remove' });
    expect((await Customer.findById(a._id)).creditLimit).toBe(0);

    const history = await creditControlService.getHistory({ organizationId: ORG, customerId: a._id });
    expect(history.map((row) => row.type)).toEqual(['limit_set', 'limit_increase', 'limit_increase']);
    expect(history[0]).toMatchObject({ previousLimit: 25000, newLimit: 0 });
  });

  test('temporary increase by %, hold/release and payment terms in bulk', async () => {
    const a = await newCustomer({ name: 'A', creditLimit: 10000 });
    const b = await newCustomer({ name: 'B' });
    const tomorrow = new Date(Date.now() + 2 * 864e5);
    let result = await bulk({ customerIds: [a._id, b._id], action: 'temporary', percent: 50, expiresAt: tomorrow });
    expect(result).toMatchObject({ updated: 1, skippedCount: 1 });
    const status = await creditControlService.getCreditStatus({ organizationId: ORG, customerId: a._id });
    expect(status.limit).toBe(15000);
    expect(status.temporary.amount).toBe(15000);

    await expect(bulk({ customerIds: [a._id], action: 'hold' })).rejects.toThrow(/reason/);
    result = await bulk({ customerIds: [a._id, b._id], action: 'hold', reason: 'Audit' });
    expect(result.updated).toBe(2);
    await creditError(sale(b, { amount: 1000 }));
    await bulk({ scope: 'all', action: 'release' });
    await sale(b, { amount: 1000 });

    result = await bulk({ scope: 'all', action: 'payment_terms', paymentTerms: 'net_15' });
    expect(result.updated).toBe(2);
    expect((await Customer.findById(b._id)).paymentTerms).toBe('net_15');
  });

  test('overdue review finds customers late past N days using invoice due date or payment terms', async () => {
    const late = await newCustomer({ name: 'Late', paymentTerms: 'net_15' });
    const fine = await newCustomer({ name: 'Fine', paymentTerms: 'net_60' });
    const back = (days) => new Date(Date.now() - days * 864e5);
    await sale(late, { amount: 3000, invoiceDate: back(50) }); // due day 15 → ~35 days late
    await sale(fine, { amount: 3000, invoiceDate: back(50) }); // due day 60 → not due
    await sale(fine, { amount: 1000, dueDate: back(5) }); // own due date → 5 days late

    let review = await creditControlService.getOverdueCustomers({ organizationId: ORG, branchId: BRANCH, minDays: 30 });
    expect(review.results.map((row) => row.name)).toEqual(['Late']);
    expect(review.results[0]).toMatchObject({ overdueCount: 1, overdueAmount: 3000 });
    expect(review.results[0].oldestDays).toBeGreaterThan(30);

    review = await creditControlService.getOverdueCustomers({ organizationId: ORG, branchId: BRANCH, minDays: 0 });
    expect(review.results.map((row) => row.name)).toEqual(['Late', 'Fine']);
    expect(review.totals).toMatchObject({ customers: 2, amount: 4000, notOnHold: 2 });

    const exported = await creditControlService.exportCustomers({ organizationId: ORG, branchId: BRANCH });
    expect(exported.find((row) => row.name === 'Late')).toMatchObject({ paymentTerms: 'net_15', overdueAmount: 3000, creditUsed: 3000 });
  });

  test('Excel import: credit limit, payment terms and hold columns, update mode, permission and history', async () => {
    await creditControlService.updateSettings(ORG, { defaultCreditLimit: 5000 });
    const existing = await newCustomer({ name: 'Old Shop', phone: '03001112222', creditLimit: 10000 });
    const ctx = { organizationId: ORG, branchId: BRANCH };
    const rows = [
      { name: 'New With Limit', phone: '03003334444', creditLimit: '20,000', paymentTerms: 'Net 30', creditHold: 'No' },
      { name: 'New No Limit Column', phone: '03005556666' },
      { name: 'Old Shop', phone: '0300-111-2222', creditLimit: 15000, creditHold: 'Yes', creditHoldReason: 'Cheque bounced', paymentTerms: '45 days' },
    ];
    const result = await customerService.bulkAddCustomers(rows, ctx, { duplicateStrategy: 'update', canManageCredit: true, defaultCreditLimit: 5000, actor: manager });
    expect(result).toMatchObject({ insertedCount: 2, updatedCount: 1 });
    expect(result.warnings.map((w) => w.message).join()).toMatch(/Payment terms "45 days" not recognised/);

    const byName = async (name) => Customer.findOne({ organizationId: ORG, name });
    expect(await byName('New With Limit')).toMatchObject({ creditLimit: 20000, paymentTerms: 'net_30', creditHold: false });
    expect((await byName('New No Limit Column')).creditLimit).toBe(5000);
    expect(await byName('Old Shop')).toMatchObject({ creditLimit: 15000, creditHold: true, creditHoldReason: 'Cheque bounced' });

    const history = await creditControlService.getHistory({ organizationId: ORG, customerId: existing._id });
    expect(history.map((row) => row.type).sort()).toEqual(['hold_on', 'limit_increase']);

    // Someone who may not manage credit: limits/holds in the file are left alone, with a warning.
    const second = await customerService.bulkAddCustomers(
      [{ name: 'Old Shop', phone: '03001112222', creditLimit: 999999, creditHold: 'No' }],
      ctx,
      { duplicateStrategy: 'update', canManageCredit: false, actor: manager }
    );
    expect(second.warnings[0].message).toMatch(/not allowed to manage credit limits/);
    expect(await byName('Old Shop')).toMatchObject({ creditLimit: 15000, creditHold: true });
  });
});

