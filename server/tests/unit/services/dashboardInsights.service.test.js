const mongoose = require('mongoose');
const setupTestDB = require('../../utils/setupTestDB');
const {
  Organization,
  Customer,
  Supplier,
  Invoice,
  Purchase,
  SalesReturn,
  Expense,
  CustomerLedger,
  CustomerPayment,
  SupplierPayment,
} = require('../../../src/models');
const service = require('../../../src/services/dashboardInsights.service');

/**
 * Dashboard insight widgets against hand-checkable numbers ("today" = 13 Nov 2026, PKT).
 *
 *   I1 credit 10 Oct  1000 (profit 400), paid 200, due 25 Oct   → Ali owes 800, 19 days late
 *   I2 cash    5 Nov   500 (profit 200), paid 500
 *   I3 credit 10 Nov   700 (profit 300), unpaid, due 10 Dec      → Ali owes 700, not due
 *   Q1 quotation 6 Nov 9999                                      → never a sale
 *   sales return 7 Nov 100 · expenses Rent 150 (8 Nov, paid), Tea 50 (15 Oct, unpaid)
 *   discount allowed 20 (9 Nov)
 *   Nov: income 1200 − 100 = 1100, profit 500 − 100 = 400, cost 700, net 400 − 150 − 20 = 230
 *   Oct: income 1000, cost 600, expenses 50, net 350
 *
 *   Supplier owes-to balance 900: P2 (1 Nov, 500 unpaid, due 5 Jan) + 400 of P1 (1 Sep,
 *   1000 − 400 paid, no due date) → payable 900, 500 not due, 400 no due date (73 days old).
 */
setupTestDB();
jest.setTimeout(60000);

const NOW = new Date('2026-11-13T07:00:00.000Z'); // 12:00 in Karachi
const pkt = (ymd) => new Date(`${ymd}T07:00:00.000Z`);
const utcMidnight = (ymd) => new Date(`${ymd}T00:00:00.000Z`);

let orgId;
let branchId;

beforeEach(async () => {
  orgId = new mongoose.Types.ObjectId();
  branchId = new mongoose.Types.ObjectId();
  const base = { organizationId: orgId, branchId };
  await Organization.collection.insertOne({ _id: orgId, name: 'Dash Org' });

  const ali = new mongoose.Types.ObjectId();
  await Customer.collection.insertOne({ _id: ali, ...base, name: 'Ali', balance: 1500 });
  const supplier = new mongoose.Types.ObjectId();
  await Supplier.collection.insertOne({ _id: supplier, ...base, name: 'Supplier', balance: 900 });

  await Invoice.collection.insertMany([
    { ...base, invoiceNumber: 'I1', type: 'credit', status: 'finalized', customerId: ali, invoiceDate: pkt('2026-10-10'), total: 1000, totalCost: 600, totalProfit: 400, paidAmount: 200, dueDate: utcMidnight('2026-10-25') },
    { ...base, invoiceNumber: 'I2', type: 'cash', status: 'paid', invoiceDate: pkt('2026-11-05'), total: 500, totalCost: 300, totalProfit: 200, paidAmount: 500 },
    { ...base, invoiceNumber: 'I3', type: 'credit', status: 'finalized', customerId: ali, invoiceDate: pkt('2026-11-10'), total: 700, totalCost: 400, totalProfit: 300, paidAmount: 0, dueDate: utcMidnight('2026-12-10') },
    { ...base, invoiceNumber: 'Q1', type: 'quotation', status: 'finalized', invoiceDate: pkt('2026-11-06'), total: 9999, totalCost: 1, totalProfit: 9998, paidAmount: 9999 },
  ]);
  await SalesReturn.collection.insertOne({ ...base, date: pkt('2026-11-07'), totalAmount: 100, status: 'approved' });
  await Expense.collection.insertMany([
    { ...base, date: pkt('2026-11-08'), amount: 150, category: 'Rent', isPaid: true },
    { ...base, date: pkt('2026-10-15'), amount: 50, category: 'Tea', isPaid: false },
  ]);
  await CustomerLedger.collection.insertOne({ ...base, customer: ali, transactionType: 'discount_allowed', transactionDate: pkt('2026-11-09'), debit: 0, credit: 20 });

  await Purchase.collection.insertMany([
    { ...base, supplier, invoiceNumber: 'P1', purchaseDate: pkt('2026-09-01'), totalAmount: 1000, paidAmount: 400, dueDate: null },
    { ...base, supplier, invoiceNumber: 'P2', purchaseDate: pkt('2026-11-01'), totalAmount: 500, paidAmount: 0, dueDate: utcMidnight('2027-01-05') },
  ]);
  await CustomerPayment.collection.insertMany([
    { ...base, customer: ali, paymentDate: pkt('2026-11-11'), amount: 300, direction: 'payment', status: 'posted' },
    { ...base, customer: ali, paymentDate: pkt('2026-11-12'), amount: 50, direction: 'refund', status: 'posted' },
    { ...base, customer: ali, paymentDate: pkt('2026-11-12'), amount: 999, direction: 'payment', status: 'void' },
  ]);
  await SupplierPayment.collection.insertOne({ ...base, supplier, paymentDate: pkt('2026-11-03'), amount: 100, direction: 'payment', status: 'posted' });
});

describe('dashboardInsights.getTrends', () => {
  test('monthly P&L matches the Profit & Loss report rules', async () => {
    const result = await service.getTrends({ scope: { organizationId: orgId, branchId }, range: '90d', now: NOW });
    expect(result.granularity).toBe('month');
    expect(result.startDate).toBe('2026-08-16');
    expect(result.buckets.map((b) => b.key)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11']);

    const byKey = Object.fromEntries(result.buckets.map((b) => [b.key, b]));
    expect(byKey['2026-11']).toMatchObject({ income: 1100, sales: 1200, salesReturns: 100, invoiceCount: 2, costOfGoods: 700, expenses: 150, ledgerDiscountNet: -20, netProfit: 230 });
    expect(byKey['2026-10']).toMatchObject({ income: 1000, costOfGoods: 600, expenses: 50, netProfit: 350 });
    expect(byKey['2026-08']).toMatchObject({ income: 0, netProfit: 0 });

    expect(result.totals).toMatchObject({ income: 2100, costOfGoods: 1300, expenses: 200, netProfit: 580, invoiceCount: 3 });
    expect(result.expensesByCategory).toEqual([
      { category: 'Rent', amount: 150, count: 1 },
      { category: 'Tea', amount: 50, count: 1 },
    ]);
  });

  test('30 days is daily, unknown range falls back to 180 days', async () => {
    const daily = await service.getTrends({ scope: { organizationId: orgId, branchId }, range: '30d', now: NOW });
    expect(daily.granularity).toBe('day');
    expect(daily.buckets).toHaveLength(30);
    expect(daily.buckets[daily.buckets.length - 1].key).toBe('2026-11-13');
    expect(daily.buckets.find((b) => b.key === '2026-11-05').sales).toBe(500);

    const fallback = await service.getTrends({ scope: { organizationId: orgId }, range: 'bogus', now: NOW });
    expect(fallback.range).toBe('180d');
  });
});

describe('dashboardInsights.getMoneyOverview', () => {
  test('receivable / payable due status and aging, ledger-true', async () => {
    const result = await service.getMoneyOverview({ organizationId: orgId, branchId, now: NOW });

    expect(result.receivable).toMatchObject({ total: 1500, parties: 1, overdueParties: 1, overdue: 800, notDue: 700, noDueDate: 0 });
    expect(result.receivable.age).toEqual({ d0_30: 700, d31_60: 800, d61_90: 0, d90_plus: 0, undated: 0 });

    expect(result.payable).toMatchObject({ total: 900, parties: 1, overdueParties: 0, overdue: 0, notDue: 500, noDueDate: 400 });
    expect(result.payable.age).toEqual({ d0_30: 500, d31_60: 0, d61_90: 400, d90_plus: 0, undated: 0 });
  });

  test('money in/out: 4 real months then 2 expected from due dates', async () => {
    const { cashFlow } = await service.getMoneyOverview({ organizationId: orgId, branchId, now: NOW });
    expect(cashFlow.months).toEqual([
      { key: '2026-08', moneyIn: 0, moneyOut: 0, expected: false },
      { key: '2026-09', moneyIn: 0, moneyOut: 400, expected: false },
      { key: '2026-10', moneyIn: 200, moneyOut: 0, expected: false },
      // in: I2 500 at the counter + 300 payment (void 999 ignored, quotation ignored)
      // out: supplier payment 100 + customer refund 50 + paid Rent 150
      { key: '2026-11', moneyIn: 800, moneyOut: 300, expected: false },
      { key: '2026-12', moneyIn: 700, moneyOut: 0, expected: true },
      { key: '2027-01', moneyIn: 0, moneyOut: 500, expected: true },
    ]);
  });

  test('payables with no due date follow the org "treat as due after N days" rule', async () => {
    await Organization.collection.updateOne({ _id: orgId }, { $set: { ledgerAlerts: { undatedRule: 'default_days', defaultDueDays: 15 } } });
    const { payable } = await service.getMoneyOverview({ organizationId: orgId, branchId, now: NOW });
    // P1 (1 Sep) + 15 days = 16 Sep → overdue
    expect(payable).toMatchObject({ overdue: 400, notDue: 500, noDueDate: 0, overdueParties: 1 });
  });
});
