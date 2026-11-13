const mongoose = require('mongoose');
const setupTestDB = require('../../utils/setupTestDB');
const { Organization, Branch, Customer, Invoice } = require('../../../src/models');
const invoiceService = require('../../../src/services/invoice.service');

/**
 * A customer's previous rates for one product (New Invoice rate-history panel).
 *
 *   INV-1  10 Nov  2 pcs  @ 100, 10% line discount → net 90/pc
 *   INV-2  12 Nov  1 box  @ 1100 (box = 12 pcs)    → net 1100/box = 91.6667/pc
 *          + a second line of the same product, 1 pc @ 0 (free)
 *   INV-3  13 Nov  1 pc   @ 95 — variant B
 *   ignored: quotation, converted pending, cancelled, another customer,
 *            another branch, another organization, another product
 */
setupTestDB();
jest.setTimeout(60000);

let org;
let branch;
let otherBranch;
let ali;
let bilal;
let product;
let otherProduct;
const variantA = new mongoose.Types.ObjectId();
const variantB = new mongoose.Types.ObjectId();

const line = (qty, price, extra = {}) => {
  const gross = qty * price;
  const discountAmount = extra.discountAmount || 0;
  return {
    productId: product._id,
    name: 'Widget',
    quantity: qty,
    unitPrice: price,
    cost: 50,
    subtotal: gross - discountAmount,
    profit: gross - discountAmount - qty * 50,
    ...extra,
  };
};

const invoice = (number, items, extra = {}) =>
  Invoice.create({
    organizationId: org._id,
    branchId: branch._id,
    invoiceNumber: number,
    customerId: String(ali._id),
    type: 'credit',
    items,
    subtotal: items.reduce((s, i) => s + i.subtotal, 0),
    total: items.reduce((s, i) => s + i.subtotal, 0),
    totalProfit: 0,
    totalCost: 0,
    ...extra,
  });

const filter = () => ({ organizationId: String(org._id), branchId: String(branch._id) });

beforeEach(async () => {
  org = await Organization.create({ name: 'R Org', owner: new mongoose.Types.ObjectId(), baseCurrency: 'PKR' });
  branch = await Branch.create({ organizationId: org._id, name: 'Main' });
  otherBranch = await Branch.create({ organizationId: org._id, name: 'Second' });
  ali = await Customer.create({ organizationId: org._id, branchId: branch._id, name: 'Ali' });
  bilal = await Customer.create({ organizationId: org._id, branchId: branch._id, name: 'Bilal' });
  // The service only reads invoices, so plain ids stand in for the products.
  product = { _id: new mongoose.Types.ObjectId() };
  otherProduct = { _id: new mongoose.Types.ObjectId() };

  await invoice(
    'INV-1',
    [line(2, 100, { discountType: 'percentage', discountValue: 10, discountAmount: 20, variantId: variantA })],
    {
      invoiceDate: new Date('2026-11-10T10:00:00Z'),
    }
  );
  await invoice(
    'INV-2',
    [line(1, 1100, { unit: 'box', conversionFactor: 12, variantId: variantA }), line(1, 0, { variantId: variantA })],
    {
      invoiceDate: new Date('2026-11-12T10:00:00Z'),
      type: 'cash',
    }
  );
  await invoice('INV-3', [line(1, 95, { variantId: variantB })], { invoiceDate: new Date('2026-11-13T10:00:00Z') });

  // Everything below must be ignored.
  await invoice('Q-1', [line(5, 70)], { type: 'quotation', invoiceDate: new Date('2026-11-14T10:00:00Z') });
  await invoice('P-1', [line(5, 71)], {
    type: 'pending',
    isConvertedToBill: true,
    invoiceDate: new Date('2026-11-14T10:00:00Z'),
  });
  await invoice('C-1', [line(5, 72)], { status: 'cancelled', invoiceDate: new Date('2026-11-14T10:00:00Z') });
  await invoice('B-1', [line(5, 73)], { customerId: String(bilal._id), invoiceDate: new Date('2026-11-14T10:00:00Z') });
  await invoice('BR-1', [line(5, 74)], { branchId: otherBranch._id, invoiceDate: new Date('2026-11-14T10:00:00Z') });
  await invoice('O-1', [{ ...line(5, 75), productId: otherProduct._id, name: 'Gadget' }], {
    invoiceDate: new Date('2026-11-14T10:00:00Z'),
  });
  await Invoice.collection.insertOne({
    organizationId: new mongoose.Types.ObjectId(),
    branchId: branch._id,
    invoiceNumber: 'X-1',
    customerId: String(ali._id),
    type: 'credit',
    items: [line(5, 76)],
    invoiceDate: new Date('2026-11-14T10:00:00Z'),
  });
});

describe('invoiceService.getCustomerProductHistory', () => {
  test('real sales of this product to this customer only, newest first, one row per line', async () => {
    const result = await invoiceService.getCustomerProductHistory(filter(), {
      customerId: String(ali._id),
      productId: String(product._id),
    });

    expect(result.lines.map((l) => [l.invoiceNumber, l.unitPrice])).toEqual([
      ['INV-3', 95],
      ['INV-2', 1100],
      ['INV-2', 0],
      ['INV-1', 100],
    ]);
    expect(result.truncated).toBe(false);

    const inv1 = result.lines[3];
    expect(inv1.discountAmount).toBe(20);
    expect(inv1.netUnitPrice).toBe(90);
    expect(inv1.netRatePerStockUnit).toBe(90);

    const box = result.lines[1];
    expect(box.unit).toBe('box');
    expect(box.conversionFactor).toBe(12);
    expect(box.netRatePerStockUnit).toBeCloseTo(91.6667, 4);
    expect(box.type).toBe('cash');

    expect(result.stats.invoiceCount).toBe(3);
    expect(result.stats.lineCount).toBe(4);
    expect(result.stats.totalQuantity).toBe(5);
    // 2 + 12 + 1 + 1 stock units, 180 + 1100 + 0 + 95 paid
    expect(result.stats.totalStockQuantity).toBe(16);
    expect(result.stats.totalAmount).toBe(1375);
    // The free line is a real sale but not a rate: out of avg/min/max (2 + 12 + 1 charged units).
    expect(result.stats.avgRatePerStockUnit).toBeCloseTo(1375 / 15, 4);
    expect(result.stats.minRatePerStockUnit).toBe(90);
    expect(result.stats.maxRatePerStockUnit).toBe(95);

    // Legacy fields still populated for the older history dialog.
    expect(result.lastPrice).toBe(95);
    expect(result.history).toHaveLength(4);
    expect(result.totalQuantity).toBe(5);
  });

  test('customerId stored as an ObjectId (legacy rows) still matches', async () => {
    await Invoice.collection.updateMany({ invoiceNumber: 'INV-3' }, { $set: { customerId: ali._id } });
    const result = await invoiceService.getCustomerProductHistory(filter(), {
      customerId: String(ali._id),
      productId: String(product._id),
    });
    expect(result.lines[0].invoiceNumber).toBe('INV-3');
  });

  test('variant filter keeps only that variant', async () => {
    const result = await invoiceService.getCustomerProductHistory(filter(), {
      customerId: String(ali._id),
      productId: String(product._id),
      variantId: String(variantB),
    });
    expect(result.lines.map((l) => l.invoiceNumber)).toEqual(['INV-3']);
    expect(result.stats.invoiceCount).toBe(1);
  });

  test('the invoice being edited is left out of its own history', async () => {
    const inv3 = await Invoice.findOne({ invoiceNumber: 'INV-3' });
    const result = await invoiceService.getCustomerProductHistory(filter(), {
      customerId: String(ali._id),
      productId: String(product._id),
      excludeInvoiceId: String(inv3._id),
    });
    expect(result.lines.map((l) => l.invoiceNumber)).toEqual(['INV-2', 'INV-2', 'INV-1']);
  });

  test('limit truncates rows by invoice but stats still cover every sale', async () => {
    const result = await invoiceService.getCustomerProductHistory(filter(), {
      customerId: String(ali._id),
      productId: String(product._id),
      limit: 2,
    });
    expect(result.truncated).toBe(true);
    expect(result.lines.map((l) => l.invoiceNumber)).toEqual(['INV-3', 'INV-2', 'INV-2']);
    expect(result.stats.invoiceCount).toBe(3);
  });

  test('walk-in or no sales → empty result, not an error', async () => {
    const walkIn = await invoiceService.getCustomerProductHistory(filter(), {
      customerId: 'walk-in',
      productId: String(product._id),
    });
    expect(walkIn.lines).toEqual([]);
    const none = await invoiceService.getCustomerProductHistory(filter(), {
      customerId: String(bilal._id),
      productId: String(otherProduct._id),
    });
    expect(none.lines).toEqual([]);
    expect(none.stats).toBeNull();
    expect(none.lastPrice).toBeNull();
  });
});

describe('invoiceService.getCustomerRateHistoryBatch (one request for every line)', () => {
  const single = (params) => invoiceService.getCustomerProductHistory(filter(), { customerId: String(ali._id), ...params });
  const batch = (items, extra = {}) =>
    invoiceService.getCustomerRateHistoryBatch(filter(), { customerId: String(ali._id), items, ...extra });

  test('each product/variant matches the single-product endpoint exactly', async () => {
    const { results } = await batch([
      { productId: String(product._id) },
      { productId: String(product._id), variantId: String(variantA) },
      { productId: String(product._id), variantId: String(variantB) },
      { productId: String(otherProduct._id) },
    ]);
    expect(results).toHaveLength(4);

    const expectSame = (got, want) => {
      expect(got.lines).toEqual(want.lines);
      expect(got.stats).toEqual(want.stats);
      expect(got.truncated).toBe(want.truncated);
      expect(got.lastPrice).toEqual(want.lastPrice);
    };
    expectSame(results[0].history, await single({ productId: String(product._id) }));
    expectSame(results[1].history, await single({ productId: String(product._id), variantId: String(variantA) }));
    expectSame(results[2].history, await single({ productId: String(product._id), variantId: String(variantB) }));
    expectSame(results[3].history, await single({ productId: String(otherProduct._id) }));

    // Sanity: the shared rules really applied (no quotation/converted/cancelled/other tenant).
    expect(results[0].history.lines.map((l) => l.invoiceNumber)).toEqual(['INV-3', 'INV-2', 'INV-2', 'INV-1']);
    expect(results[0].history.stats.invoiceCount).toBe(3);
    expect(results[3].history.lines.map((l) => l.invoiceNumber)).toEqual(['O-1']);
    expect(results[0]).toMatchObject({ productId: String(product._id), variantId: null });
    expect(results[1]).toMatchObject({ variantId: String(variantA) });
  });

  test('excludeInvoiceId, per-product limit, duplicates and junk ids', async () => {
    const inv2 = await Invoice.findOne({ invoiceNumber: 'INV-2' });
    const excluded = await batch([{ productId: String(product._id) }], { excludeInvoiceId: String(inv2._id) });
    expect(excluded.results[0].history.lines.map((l) => l.invoiceNumber)).toEqual(['INV-3', 'INV-1']);

    const limited = await batch([{ productId: String(product._id) }], { limit: 2 });
    expect(limited.results[0].history.truncated).toBe(true);
    expect(limited.results[0].history.lines.map((l) => l.invoiceNumber)).toEqual(['INV-3', 'INV-2']);
    expect(limited.results[0].history.stats.invoiceCount).toBe(3);
    expect(limited.results[0].history.stats.lineCount).toBe(4);

    const deduped = await batch([
      { productId: String(product._id) },
      { productId: String(product._id), variantId: '' },
      { productId: 'not-an-id' },
    ]);
    expect(deduped.results).toHaveLength(1);
  });

  test('walk-in, unknown products and other customers → empty, not an error', async () => {
    const walkIn = await invoiceService.getCustomerRateHistoryBatch(filter(), {
      customerId: 'walk-in',
      items: [{ productId: String(product._id) }],
    });
    expect(walkIn.results[0].history.lines).toEqual([]);
    const none = await batch([{ productId: String(new mongoose.Types.ObjectId()) }]);
    expect(none.results[0].history.stats).toBeNull();
    expect(none.results[0].history.lastPrice).toBeNull();
    const otherTenant = await invoiceService.getCustomerRateHistoryBatch(
      { organizationId: String(new mongoose.Types.ObjectId()) },
      { customerId: String(ali._id), items: [{ productId: String(product._id) }] }
    );
    expect(otherTenant.results[0].history.lines).toEqual([]);
  });
});
