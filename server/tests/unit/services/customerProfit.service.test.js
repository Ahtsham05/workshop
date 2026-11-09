const mongoose = require('mongoose');
const setupTestDB = require('../../utils/setupTestDB');
const { Organization, Branch, Customer, Invoice, SalesReturn, CustomerLedger, Product } = require('../../../src/models');
const customerProfitService = require('../../../src/services/customerProfit.service');

/**
 * Customer profitability against hand-checkable numbers:
 *   INV-1  2 × 500 (cost 300)            revenue 1000, profit 400
 *   INV-2  1 × 2000 (cost 1500), bill −100 revenue 1900, profit 400
 *   quotation + converted pending        ignored
 *   return 1 unit of INV-1 (500 at cost 300)   reverses 500 revenue / 200 profit
 *   ledger discount allowed 50
 *   → net revenue 2400, net profit 400 + 400 − 200 − 50 = 550, margin 22.92%
 */
setupTestDB();
jest.setTimeout(60000);

let org;
let branch;
let ali;
let bilal;
let product;

const line = (qty, price, cost) => ({
  productId: product._id,
  name: 'Widget',
  quantity: qty,
  unitPrice: price,
  cost,
  subtotal: qty * price,
  profit: qty * (price - cost),
});

const invoice = (customer, number, items, extra = {}) =>
  Invoice.create({
    organizationId: org._id,
    branchId: branch._id,
    invoiceNumber: number,
    customerId: String(customer._id),
    type: 'credit',
    items,
    subtotal: items.reduce((s, i) => s + i.subtotal, 0),
    total: items.reduce((s, i) => s + i.subtotal, 0) - (extra.discount || 0),
    totalProfit: 0,
    totalCost: 0,
    invoiceDate: new Date(2026, 10, 5),
    ...extra,
  });

beforeEach(async () => {
  org = await Organization.create({ name: 'P Org', owner: new mongoose.Types.ObjectId(), baseCurrency: 'PKR' });
  branch = await Branch.create({ organizationId: org._id, name: 'Main' });
  ali = await Customer.create({ organizationId: org._id, branchId: branch._id, name: 'Ali', balance: 777 });
  bilal = await Customer.create({ organizationId: org._id, branchId: branch._id, name: 'Bilal' });
  product = await Product.create({
    organizationId: org._id,
    branchId: branch._id,
    name: 'Widget',
    price: 500,
    cost: 300,
  }).catch(() => ({
    _id: new mongoose.Types.ObjectId(),
  }));
});

const seedAli = async () => {
  const inv1 = await invoice(ali, 'INV-1', [line(2, 500, 300)]);
  await invoice(ali, 'INV-2', [line(1, 2000, 1500)], { discount: 100 });
  await invoice(ali, 'Q-1', [line(10, 500, 300)], { type: 'quotation' });
  await invoice(ali, 'P-1', [line(5, 500, 300)], { type: 'pending', isConvertedToBill: true });
  await SalesReturn.create({
    organizationId: org._id,
    branchId: branch._id,
    returnNumber: 'SR-1',
    invoiceId: inv1._id,
    customerId: ali._id,
    items: [{ productId: product._id, name: 'Widget', quantity: 1, price: 500, unitPrice: 500, total: 500 }],
    refundMethod: 'adjustment',
    totalAmount: 500,
    date: new Date(2026, 10, 6),
    status: 'approved',
  }).catch((e) => {
    throw new Error(`SalesReturn fixture: ${e.message}`);
  });
  await CustomerLedger.create({
    organizationId: org._id,
    branchId: branch._id,
    customer: ali._id,
    transactionType: 'discount_allowed',
    transactionDate: new Date(2026, 10, 7),
    description: 'Discount',
    credit: 50,
    balance: 0,
  });
};

const range = { startDate: '2026-11-01', endDate: '2026-11-30' };

test('net profit = sales profit − returns at original cost − ledger discounts', async () => {
  await seedAli();
  const out = await customerProfitService.getRanking({ organizationId: org._id, branchId: branch._id }, range);
  const row = out.rows.find((r) => r.name === 'Ali');
  expect(row.invoices).toBe(2);
  expect(row.revenue).toBe(2900);
  expect(row.grossProfit).toBe(800);
  expect(row.returnsValue).toBe(500);
  expect(row.returnsProfit).toBe(200);
  expect(row.ledgerDiscount).toBe(50);
  expect(row.netRevenue).toBe(2400);
  expect(row.netProfit).toBe(550);
  expect(row.cost).toBe(1800);
  expect(row.margin).toBe(22.92);
  expect(row.balance).toBe(777);
  expect(out.summary.netProfit).toBe(550);
});

test('loss-making filter and ranking', async () => {
  await seedAli();
  await invoice(bilal, 'INV-3', [line(1, 100, 150)]);
  const all = await customerProfitService.getRanking({ organizationId: org._id, branchId: branch._id }, range);
  expect(all.rows.map((r) => [r.name, r.rank])).toEqual([
    ['Ali', 1],
    ['Bilal', 2],
  ]);
  expect(all.summary.lossMaking).toBe(1);
  const loss = await customerProfitService.getRanking(
    { organizationId: org._id, branchId: branch._id },
    { ...range, filter: 'loss' }
  );
  expect(loss.rows.map((r) => r.name)).toEqual(['Bilal']);
});

test('customer detail: products, invoices, previous period, other org refused', async () => {
  await seedAli();
  const detail = await customerProfitService.getCustomerDetail(
    { organizationId: org._id, branchId: branch._id },
    String(ali._id),
    range
  );
  expect(detail.metrics.netProfit).toBe(550);
  expect(detail.invoices.map((i) => [i.invoiceNumber, i.profit])).toEqual(
    expect.arrayContaining([
      ['INV-1', 400],
      ['INV-2', 400],
    ])
  );
  expect(detail.invoices).toHaveLength(2);
  expect(detail.products[0].profit).toBe(800);
  expect(detail.lifetime.netProfit).toBe(550);

  await expect(
    customerProfitService.getCustomerDetail({ organizationId: new mongoose.Types.ObjectId() }, String(ali._id), range)
  ).rejects.toMatchObject({ statusCode: 404 });
});
