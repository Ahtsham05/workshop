const mongoose = require('mongoose');
const setupTestDB = require('../utils/setupTestDB');
const { Organization, Customer, Product, Invoice } = require('../../src/models');
const entitlementService = require('../../src/services/entitlement.service');
const invoiceService = require('../../src/services/invoice.service');
const customerLedgerService = require('../../src/services/customerLedger.service');
const ledgerAlertsService = require('../../src/services/ledgerAlerts.service');

/**
 * Ledger alerts: credit invoices get a default due date from settings (or the customer's
 * terms), a cleared/explicit date is kept, and customer aging follows the LEDGER balance
 * with payments clearing the oldest invoices first — then lands in the right colour band.
 */
setupTestDB();
jest.setTimeout(60000);

const id = () => new mongoose.Types.ObjectId();
const user = String(id());
let ORG;
let BRANCH;
let product;

// "Today" for aging = 9 Nov 2026, midday in Pakistan.
const NOW = new Date('2026-11-09T07:00:00.000Z');
const ymd = (date) => (date ? new Date(date).toISOString().slice(0, 10) : null);

beforeAll(() => {
  jest.spyOn(entitlementService, 'assertCanCreateInvoice').mockResolvedValue();
  jest.spyOn(entitlementService, 'assertCanWrite').mockResolvedValue();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

beforeEach(async () => {
  ORG = id();
  BRANCH = id();
  await Organization.create({ _id: ORG, name: 'Due Date Traders', owner: id() });
  product = await Product.create({
    organizationId: ORG,
    branchId: BRANCH,
    name: 'Fan',
    price: 1000,
    cost: 600,
    stockQuantity: 500,
  });
});

const newCustomer = (extra = {}) => Customer.create({ organizationId: ORG, branchId: BRANCH, name: 'Amjad', ...extra });

const sale = (customer, { amount = 1000, type = 'credit', paid = 0, ...extra } = {}) =>
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
    user,
    { creditMode: 'skip' }
  );

const pay = (customer, amount, date = '2026-11-08') =>
  customerLedgerService.createLedgerEntry({
    organizationId: ORG,
    branchId: BRANCH,
    customer: customer._id,
    transactionType: 'payment_received',
    transactionDate: new Date(`${date}T08:00:00.000Z`),
    description: 'Cash received',
    credit: amount,
    paymentMethod: 'cash',
  });

const enable = (extra = {}) =>
  ledgerAlertsService.updateSettings(ORG, { dueDatesEnabled: true, defaultDueDays: 15, ...extra });

describe('settings', () => {
  test('defaults: due dates off, four colour bands starting at 1/11/31/61 days', async () => {
    const settings = await ledgerAlertsService.getSettings(ORG);
    expect(settings.dueDatesEnabled).toBe(false);
    expect(settings.bands.map((b) => b.fromDays)).toEqual([1, 11, 31, 61]);
  });

  test('bands are cleaned: sorted, duplicates dropped, bad colours replaced, max 8', async () => {
    const settings = await ledgerAlertsService.updateSettings(ORG, {
      bands: [
        { label: 'Late', fromDays: 20, color: '#ff0000' },
        { label: 'Just late', fromDays: 1, color: 'yellow' },
        { label: 'Dup', fromDays: 20, color: '#00ff00' },
      ],
    });
    expect(settings.bands).toEqual([
      { label: 'Just late', fromDays: 1, color: '#EF4444' },
      { label: 'Late', fromDays: 20, color: '#FF0000' },
    ]);
  });
});

describe('default due date on invoices', () => {
  test('off → a credit invoice gets no due date', async () => {
    const customer = await newCustomer();
    const invoice = await sale(customer, { invoiceDate: '2026-11-01' });
    expect(invoice.dueDate).toBeFalsy();
  });

  test('on → invoice date + default days; customer net terms win; cash gets none', async () => {
    await enable();
    const plain = await newCustomer();
    const net30 = await newCustomer({ name: 'Net 30', paymentTerms: 'net_30' });
    expect(ymd((await sale(plain, { invoiceDate: '2026-11-01' })).dueDate)).toBe('2026-11-16');
    expect(ymd((await sale(net30, { invoiceDate: '2026-11-01' })).dueDate)).toBe('2026-12-01');
    expect((await sale(plain, { type: 'cash', paid: 1000, invoiceDate: '2026-11-01' })).dueDate).toBeFalsy();

    await enable({ useCustomerTerms: false });
    expect(ymd((await sale(net30, { invoiceDate: '2026-11-01' })).dueDate)).toBe('2026-11-16');
  });

  test('a date sent by the screen, or cleared on purpose (null), is kept', async () => {
    await enable();
    const customer = await newCustomer();
    const picked = await sale(customer, { invoiceDate: '2026-11-01', dueDate: '2026-11-04' });
    expect(ymd(picked.dueDate)).toBe('2026-11-04');
    const cleared = await sale(customer, { invoiceDate: '2026-11-01', dueDate: null });
    expect(cleared.dueDate).toBeFalsy();
  });

  test('pending invoices follow the applyToPending switch', async () => {
    await enable({ applyToPending: false });
    const customer = await newCustomer();
    expect((await sale(customer, { type: 'pending', invoiceDate: '2026-11-01' })).dueDate).toBeFalsy();
    await enable({ applyToPending: true });
    expect(ymd((await sale(customer, { type: 'pending', invoiceDate: '2026-11-01' })).dueDate)).toBe('2026-11-16');
  });
});

describe('aging from the ledger balance', () => {
  const boardRow = async (customer) => {
    const board = await ledgerAlertsService.getStatusBoard({ organizationId: ORG, now: NOW });
    return { board, row: board.rows.find((r) => r.customerId === String(customer._id)) };
  };

  test('payments clear the oldest invoices first; colour = band of the oldest overdue item', async () => {
    await enable({ defaultDueDays: 7 });
    const customer = await newCustomer();
    await sale(customer, { invoiceDate: '2026-09-30' }); // due 10-07 → 33 days late
    await sale(customer, { invoiceDate: '2026-10-20' }); // due 10-27 → 13 days late
    await sale(customer, { invoiceDate: '2026-11-04' }); // due 11-11 → due in 2 days

    let { row } = await boardRow(customer);
    expect(row.openAmount).toBe(3000);
    expect(row.overdueAmount).toBe(2000);
    expect(row.oldestDaysOverdue).toBe(33);
    expect(row.bandIndex).toBe(2); // 31+ band
    expect(row.dueSoonAmount).toBe(1000);

    // 1,500 received: the 30 Sep invoice is cleared and the 20 Oct one is half paid.
    await pay(customer, 1500);
    ({ row } = await boardRow(customer));
    expect(row.balance).toBe(1500);
    expect(row.overdueAmount).toBe(500);
    expect(row.oldestDaysOverdue).toBe(13);
    expect(row.bandIndex).toBe(1); // 11+ band
    expect(row.state).toBe('overdue');
    expect(row.buckets).toMatchObject({ d1_30: 500, current: 1000 });
  });

  test('a fully paid cash sale after old credit does not hide the old debt', async () => {
    await enable({ defaultDueDays: 7 });
    const customer = await newCustomer();
    await sale(customer, { invoiceDate: '2026-10-01' }); // due 10-08 → 32 days late
    await sale(customer, { type: 'cash', paid: 5000, amount: 5000, invoiceDate: '2026-11-08' });
    const { row } = await boardRow(customer);
    expect(row.overdueAmount).toBe(1000);
    expect(row.oldestDaysOverdue).toBe(32);
  });

  test('settled customers are not listed; minAmount ignores small leftovers', async () => {
    await enable({ defaultDueDays: 7 });
    const settled = await newCustomer({ name: 'Settled' });
    await sale(settled, { invoiceDate: '2026-10-01' });
    await pay(settled, 1000);
    const small = await newCustomer({ name: 'Small' });
    await sale(small, { invoiceDate: '2026-10-01' });
    await pay(small, 950);
    await ledgerAlertsService.updateSettings(ORG, { minAmount: 100 });

    const { board, row } = await boardRow(small);
    expect(board.rows.find((r) => r.customerId === String(settled._id))).toBeUndefined();
    expect(row.overdueAmount).toBe(50);
    expect(row.state).toBe('current');
    expect(row.bandIndex).toBe(-1);
  });

  test('invoices without a due date: never late by default, or late after default days when chosen', async () => {
    const customer = await newCustomer();
    await sale(customer, { invoiceDate: '2026-10-01' }); // due dates were off → no due date
    let { row } = await boardRow(customer);
    expect(row.state).toBe('no_due_date');
    expect(row.noDueDateAmount).toBe(1000);

    await ledgerAlertsService.updateSettings(ORG, { undatedRule: 'default_days', defaultDueDays: 15 });
    ({ row } = await boardRow(customer));
    expect(row.state).toBe('overdue');
    expect(row.oldestDaysOverdue).toBe(24); // due 10-16
  });

  test('open pending invoices count on their own (they are not in the ledger)', async () => {
    await enable({ defaultDueDays: 7 });
    const customer = await newCustomer();
    await sale(customer, { type: 'pending', invoiceDate: '2026-10-25' }); // due 11-01 → 8 days
    expect((await Customer.findById(customer._id)).balance).toBe(0);
    const { row, board } = await boardRow(customer);
    expect(row.pendingAmount).toBe(1000);
    expect(row.overdueAmount).toBe(1000);
    expect(row.bandIndex).toBe(0);
    expect(board.totals.bands[0]).toMatchObject({ customers: 1, amount: 1000 });
  });

  test('customer detail lists each open item with its due date and days late', async () => {
    await enable({ defaultDueDays: 7 });
    const customer = await newCustomer();
    const inv = await sale(customer, { invoiceDate: '2026-10-20' });
    const detail = await ledgerAlertsService.getCustomerAging({ organizationId: ORG, customerId: customer._id, now: NOW });
    expect(detail.aging.items).toHaveLength(1);
    expect(detail.aging.items[0]).toMatchObject({
      kind: 'invoice',
      invoiceNumber: inv.invoiceNumber,
      dueDate: '2026-10-27',
      daysOverdue: 13,
      state: 'overdue',
      openAmount: 1000,
    });
    expect(await Invoice.countDocuments({ organizationId: ORG })).toBe(1);
  });
});
