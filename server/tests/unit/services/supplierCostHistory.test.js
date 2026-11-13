const mongoose = require('mongoose');
const setupTestDB = require('../../utils/setupTestDB');
const { Purchase } = require('../../../src/models');
const purchaseService = require('../../../src/services/purchase.service');

/**
 * What we paid a supplier for a product before (New Purchase rate-history box).
 *
 *   P-1  10 Nov  2 pcs @ 100, 10% line discount → net 90/pc
 *   P-2  12 Nov  1 box @ 1100 (box = 12 pcs)    → 91.6667/pc ; + free line 1 pc @ 0
 *   P-3  13 Nov  1 pc  @ 95  — variant B
 *   ignored: another supplier, another branch, another organization, another product
 */
setupTestDB();
jest.setTimeout(60000);

const org = new mongoose.Types.ObjectId();
const branch = new mongoose.Types.ObjectId();
const supplier = new mongoose.Types.ObjectId();
const otherSupplier = new mongoose.Types.ObjectId();
const product = new mongoose.Types.ObjectId();
const otherProduct = new mongoose.Types.ObjectId();
const variantA = new mongoose.Types.ObjectId();
const variantB = new mongoose.Types.ObjectId();

const line = (qty, price, extra = {}) => ({
  product,
  quantity: qty,
  unit: 'pcs',
  conversionFactor: 1,
  priceAtPurchase: price,
  discountType: 'fixed',
  discountValue: 0,
  discountAmount: 0,
  total: qty * price - (extra.discountAmount || 0),
  ...extra,
});
const purchase = (number, items, extra = {}) =>
  Purchase.collection.insertOne({
    organizationId: org,
    branchId: branch,
    supplier,
    invoiceNumber: number,
    vendorBillNumber: `VB-${number}`,
    type: 'credit',
    items,
    totalAmount: items.reduce((s, i) => s + i.total, 0),
    createdAt: new Date(),
    ...extra,
  });
const filter = { organizationId: String(org), branchId: String(branch) };
const batch = (items, extra = {}) =>
  purchaseService.getSupplierCostHistoryBatch(filter, { supplierId: String(supplier), items, ...extra });

beforeEach(async () => {
  await purchase(
    'P-1',
    [line(2, 100, { discountType: 'percentage', discountValue: 10, discountAmount: 20, variantId: variantA })],
    {
      purchaseDate: new Date('2026-11-10T10:00:00Z'),
    }
  );
  await purchase(
    'P-2',
    [line(1, 1100, { unit: 'box', conversionFactor: 12, variantId: variantA }), line(1, 0, { variantId: variantA })],
    { purchaseDate: new Date('2026-11-12T10:00:00Z'), type: 'cash' }
  );
  await purchase('P-3', [line(1, 95, { variantId: variantB })], { purchaseDate: new Date('2026-11-13T10:00:00Z') });

  const later = { purchaseDate: new Date('2026-11-14T10:00:00Z') };
  await purchase('X-SUP', [line(5, 70)], { ...later, supplier: otherSupplier });
  await purchase('X-BR', [line(5, 71)], { ...later, branchId: new mongoose.Types.ObjectId() });
  await purchase('X-ORG', [line(5, 72)], { ...later, organizationId: new mongoose.Types.ObjectId() });
  await purchase('O-1', [{ ...line(5, 73), product: otherProduct }], later);
});

describe('purchaseService.getSupplierCostHistoryBatch', () => {
  test('this supplier only, tenant scoped, newest first, one row per line, net + per-stock-unit cost', async () => {
    const { results } = await batch([{ productId: String(product) }, { productId: String(otherProduct) }]);
    const h = results[0].history;
    expect(h.lines.map((l) => l.invoiceNumber)).toEqual(['P-3', 'P-2', 'P-2', 'P-1']);
    expect(h.lines[1]).toMatchObject({
      billNumber: 'VB-P-2',
      type: 'cash',
      unit: 'box',
      conversionFactor: 12,
      unitPrice: 1100,
      netUnitPrice: 1100,
      netRatePerStockUnit: 91.6667,
    });
    expect(h.lines[3]).toMatchObject({ unitPrice: 100, discountAmount: 20, netUnitPrice: 90, netRatePerStockUnit: 90 });
    expect(h.stats).toMatchObject({
      invoiceCount: 3,
      lineCount: 4,
      totalStockQuantity: 16,
      totalAmount: 1375,
      minRatePerStockUnit: 90,
      maxRatePerStockUnit: 95,
    });
    // Free line counted in qty, not in the average: 1375 / (2 + 12 + 1)
    expect(h.stats.avgRatePerStockUnit).toBeCloseTo(91.6667, 4);
    expect(results[1].history.lines.map((l) => l.invoiceNumber)).toEqual(['O-1']);
  });

  test('variant keys, excludePurchaseId, limit', async () => {
    const { results } = await batch([
      { productId: String(product), variantId: String(variantA) },
      { productId: String(product), variantId: String(variantB) },
    ]);
    expect(results[0].history.lines.map((l) => l.invoiceNumber)).toEqual(['P-2', 'P-2', 'P-1']);
    expect(results[1].history.lines.map((l) => l.invoiceNumber)).toEqual(['P-3']);

    const p2 = await Purchase.findOne({ invoiceNumber: 'P-2' });
    const excluded = await batch([{ productId: String(product) }], { excludePurchaseId: String(p2._id) });
    expect(excluded.results[0].history.lines.map((l) => l.invoiceNumber)).toEqual(['P-3', 'P-1']);

    const limited = await batch([{ productId: String(product) }], { limit: 2 });
    expect(limited.results[0].history.truncated).toBe(true);
    expect(limited.results[0].history.lines).toHaveLength(2);
    expect(limited.results[0].history.stats.invoiceCount).toBe(3);
  });

  test('no supplier / unknown product / other tenant → empty, not an error', async () => {
    const none = await purchaseService.getSupplierCostHistoryBatch(filter, { items: [{ productId: String(product) }] });
    expect(none.results[0].history.lines).toEqual([]);
    const unknown = await batch([{ productId: String(new mongoose.Types.ObjectId()) }]);
    expect(unknown.results[0].history.stats).toBeNull();
    const otherTenant = await purchaseService.getSupplierCostHistoryBatch(
      { organizationId: String(new mongoose.Types.ObjectId()) },
      { supplierId: String(supplier), items: [{ productId: String(product) }] }
    );
    expect(otherTenant.results[0].history.lines).toEqual([]);
  });
});
