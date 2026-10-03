const mongoose = require('mongoose');
const setupTestDB = require('../../utils/setupTestDB');
const {
  Product,
  ProductVariant,
  Inventory,
  Batch,
  Imei,
  StockAdjustment,
  StockCount,
  StockCountLine,
  StockCountPolicy,
} = require('../../../src/models');
const service = require('../../../src/services/stockCount.service');
const { clearAnalyticsCache } = require('../../../src/services/productAnalytics.service');

/**
 * Stock counts move real stock when posted, so the arithmetic is pinned here against a
 * real (in-memory) MongoDB: which items are due, what blind counters can see, and that a
 * posted variance lands exactly once, on the right product / variant / batch / unit.
 */
setupTestDB();
jest.setTimeout(60000);

const ORG = new mongoose.Types.ObjectId();
const BRANCH = new mongoose.Types.ObjectId();
const USER = new mongoose.Types.ObjectId();
const scope = { organizationId: String(ORG), branchId: String(BRANCH) };
const id = () => new mongoose.Types.ObjectId();

let seq = 0;
const insertProduct = async (overrides = {}) => {
  const doc = {
    _id: id(),
    organizationId: ORG,
    branchId: BRANCH,
    name: `Product ${String(++seq).padStart(2, '0')}`,
    price: 100,
    cost: 10,
    stockQuantity: 10,
    isActive: true,
    hasVariants: false,
    categories: [],
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
  await Product.collection.insertOne(doc);
  return doc;
};

const stockOf = async (productId) => (await Product.findById(productId).lean()).stockQuantity;
const linesOf = (countId) => StockCountLine.find({ countId }).sort({ sortKey: 1 }).lean();
const lineFor = async (countId, productId) => StockCountLine.findOne({ countId, productId }).lean();
const count = (countId, entries, extra = {}) =>
  service.recordCounts({ ...scope, countId, entries, userId: USER, canApprove: true, canViewCost: true, ...extra });

beforeEach(() => {
  clearAnalyticsCache();
  seq = 0;
});

describe('cycle plan', () => {
  test('spreads each class over its interval and skips items already counted or on an open count', async () => {
    // Stock value 1000, 500, then 10 small items of 10 each — basis stockValue keeps the
    // classification independent of sales data.
    const big = await insertProduct({ cost: 100, stockQuantity: 10 });
    const mid = await insertProduct({ cost: 50, stockQuantity: 10 });
    const small = [];
    for (let i = 0; i < 10; i += 1) small.push(await insertProduct({ cost: 1, stockQuantity: 10 }));
    await insertProduct({ stockQuantity: 0 }); // zero stock: not counted by default
    await StockCountPolicy.create({ ...scope, basis: 'stockValue', aShare: 60, bShare: 95, intervals: { A: 1, B: 7, C: 5 } });

    const plan = await service.getCyclePlan(scope);
    // Value 1000 + 500 + 10×10 = 1600. Cumulative share before each: big 0% → A, mid 62.5% → B,
    // first small 93.75% → B, second 94.4% → B, the rest from 95% → C.
    expect(plan.classes.A.items).toBe(1);
    expect(plan.classes.B.items).toBe(3);
    expect(plan.classes.C.items).toBe(8);
    expect(plan.classes.A.quotaPerDay).toBe(1);
    expect(plan.classes.B.quotaPerDay).toBe(1); // ceil(3 / 7)
    expect(plan.classes.C.quotaPerDay).toBe(2); // ceil(8 / 5)
    expect(plan.todayItems).toHaveLength(4);
    expect(plan.todayItems[0].productId).toBe(String(big._id));
    // Never-counted items are taken most valuable first.
    expect(plan.todayItems[1].productId).toBe(String(mid._id));

    const { count: cycle } = await service.createCount({ ...scope, createdBy: USER, body: { type: 'cycle' } });
    expect(cycle.blind).toBe(true);
    expect(await StockCountLine.countDocuments({ countId: cycle._id })).toBe(4);

    // Same day again: refused while today's is open.
    await expect(service.createCount({ ...scope, createdBy: USER, body: { type: 'cycle' } })).rejects.toThrow(/already open/);

    // Items on the open count are not due again.
    const during = await service.getCyclePlan(scope);
    const dueNow = new Set(during.todayItems.map((i) => i.productId));
    (await linesOf(cycle._id)).forEach((l) => expect(dueNow.has(String(l.productId))).toBe(false));

    // Count everything as matching and post: those items are now on schedule.
    const lines = await linesOf(cycle._id);
    await count(cycle._id, lines.map((l) => ({ lineId: l._id, qty: 10 })));
    await service.submitCount({ ...scope, countId: cycle._id, userId: USER });
    await service.postCount({ ...scope, countId: cycle._id, userId: USER });
    expect(await StockAdjustment.countDocuments({})).toBe(0);

    const after = await service.getCyclePlan(scope);
    expect(after.classes.A.onSchedulePct).toBe(100);
    expect(after.todayItems.map((i) => i.productId)).not.toContain(String(big._id));
    expect(after.todaySession.status).toBe('posted');
    void small;
  });
});

describe('counting and posting', () => {
  test('blind counts hide the expected quantity until submitted; variance is measured at count time', async () => {
    const p = await insertProduct({ stockQuantity: 10, cost: 25 });
    const { count: c } = await service.createCount({ ...scope, createdBy: USER, body: { type: 'custom', blind: true } });
    const [line] = await linesOf(c._id);

    const [view] = await count(c._id, [{ lineId: line._id, qty: 8 }], { canApprove: false });
    expect(view.countedQty).toBe(8);
    expect(view.systemQtyAtCount).toBeUndefined();
    expect(view.variance).toBeUndefined();

    const sheet = await service.getCount({ ...scope, countId: c._id, canViewCost: true });
    expect(sheet.expectedHidden).toBe(true);
    expect(sheet.lines[0].systemQtyAtStart).toBeUndefined();
    expect(sheet.count.liveTotals).toBeUndefined();

    // A sale after the shelf was counted: 10 → 9 on the system.
    await Product.updateOne({ _id: p._id }, { $inc: { stockQuantity: -1 } });

    await service.submitCount({ ...scope, countId: c._id, userId: USER });
    const review = await service.getCount({ ...scope, countId: c._id, canViewCost: true });
    expect(review.lines[0].systemQtyAtCount).toBe(10);
    expect(review.lines[0].variance).toBe(-2);
    expect(review.count.totals.lossValue).toBe(50);

    // Counters (no approve) can't change a submitted count.
    await expect(count(c._id, [{ lineId: line._id, qty: 9 }], { canApprove: false })).rejects.toThrow(/only a manager/);

    await service.postCount({ ...scope, countId: c._id, userId: USER });
    // 8 on the shelf, minus the 1 sold since → 7. The variance (−2) applied, not "set to 8".
    expect(await stockOf(p._id)).toBe(7);
    const adj = await StockAdjustment.findOne({ productId: p._id }).lean();
    expect(adj).toMatchObject({ type: 'count', direction: 'decrease', quantity: 2, totalValue: 50 });
    expect(String(adj.stockCountId)).toBe(String(c._id));

    // Posting twice is refused and moves nothing.
    await expect(service.postCount({ ...scope, countId: c._id, userId: USER })).rejects.toThrow(/posted/);
    expect(await stockOf(p._id)).toBe(7);
    expect(await StockAdjustment.countDocuments({})).toBe(1);
  });

  test('addQty accumulates, recount keeps history, decrease never goes below zero', async () => {
    const p = await insertProduct({ stockQuantity: 5 });
    const { count: c } = await service.createCount({ ...scope, createdBy: USER, body: { type: 'custom', blind: false } });
    const [line] = await linesOf(c._id);
    await count(c._id, [{ lineId: line._id, addQty: 1 }]);
    await count(c._id, [{ lineId: line._id, addQty: 1 }]);
    const [view] = await count(c._id, [{ lineId: line._id, addQty: 1 }]);
    expect(view.countedQty).toBe(3);
    expect(view.variance).toBe(-2);
    expect(view.history).toHaveLength(2);

    await service.submitCount({ ...scope, countId: c._id, userId: USER });
    await service.requestRecount({ ...scope, countId: c._id, lineIds: [String(line._id)] });
    expect((await StockCount.findById(c._id)).status).toBe('counting');
    expect((await lineFor(c._id, p._id)).recount).toBe(true);
    const [recounted] = await count(c._id, [{ lineId: line._id, qty: 1, reason: 'theft' }]);
    expect(recounted.recount).toBe(false);
    expect(recounted.reason).toBe('theft');

    // Everything sold before posting: only what is left can be removed.
    await Product.updateOne({ _id: p._id }, { $set: { stockQuantity: 2 } });
    await service.submitCount({ ...scope, countId: c._id, userId: USER });
    const { count: posted } = await service.postCount({ ...scope, countId: c._id, userId: USER });
    expect(await stockOf(p._id)).toBe(0);
    const posLine = await lineFor(c._id, p._id);
    expect(posLine.appliedDelta).toBe(-2);
    expect(posLine.postNote).toMatch(/Only 2 on hand/);
    expect(posted.postWarnings.length).toBe(1);
    expect((await StockAdjustment.findOne({}).lean()).reason).toBe('Stock count SC-0001 — Theft');
  });

  test('batch-tracked items lose stock earliest expiry first and gain on the newest batch', async () => {
    const p = await insertProduct({ name: 'Syrup', stockQuantity: 10 });
    const variant = await ProductVariant.create({
      organizationId: ORG,
      branchId: BRANCH,
      productId: p._id,
      isDefault: true,
      price: 100,
      cost: 10,
      trackBatch: true,
    });
    const inventory = await Inventory.create({ organizationId: ORG, branchId: BRANCH, productId: p._id, variantId: variant._id, quantity: 10 });
    const early = await Batch.create({ organizationId: ORG, branchId: BRANCH, inventoryId: inventory._id, variantId: variant._id, productId: p._id, batchNumber: 'E1', quantity: 4, costPerUnit: 10, expiryDate: new Date('2026-11-01'), status: 'active' });
    const late = await Batch.create({ organizationId: ORG, branchId: BRANCH, inventoryId: inventory._id, variantId: variant._id, productId: p._id, batchNumber: 'L1', quantity: 6, costPerUnit: 10, expiryDate: new Date('2027-05-01'), status: 'active' });

    const { count: c } = await service.createCount({ ...scope, createdBy: USER, body: { type: 'custom', blind: false } });
    const [line] = await linesOf(c._id);
    expect(line.kind).toBe('variant');
    expect(line.trackBatch).toBe(true);
    await count(c._id, [{ lineId: line._id, qty: 5 }]);
    await service.submitCount({ ...scope, countId: c._id, userId: USER });
    await service.postCount({ ...scope, countId: c._id, userId: USER });

    expect((await Inventory.findById(inventory._id)).quantity).toBe(5);
    expect(await stockOf(p._id)).toBe(5); // default variant mirrors Product.stockQuantity
    expect((await Batch.findById(early._id)).quantity).toBe(0);
    expect((await Batch.findById(late._id)).quantity).toBe(5);
    expect(await StockAdjustment.countDocuments({ stockCountId: c._id })).toBe(2);

    // Gain: goes to the newest batch.
    const { count: c2 } = await service.createCount({ ...scope, createdBy: USER, body: { type: 'custom', blind: false } });
    const [line2] = await linesOf(c2._id);
    await count(c2._id, [{ lineId: line2._id, qty: 8 }]);
    await service.submitCount({ ...scope, countId: c2._id, userId: USER });
    await service.postCount({ ...scope, countId: c2._id, userId: USER });
    expect((await Batch.findById(late._id)).quantity).toBe(8);
    expect((await Inventory.findById(inventory._id)).quantity).toBe(8);
  });

  test('serialized products are counted by scanning; missing units are written off as lost', async () => {
    const phone = await insertProduct({ name: 'Phone X', stockQuantity: 3, trackImei: true, cost: 30000 });
    const units = ['111', '222', '333'];
    await Imei.insertMany(
      units.map((imei) => ({ organizationId: ORG, branchId: BRANCH, productId: phone._id, imei, status: 'in_stock', productName: 'Phone X' }))
    );
    const { count: c } = await service.createCount({ ...scope, createdBy: USER, body: { type: 'custom', blind: false } });
    const [line] = await linesOf(c._id);
    expect(line.kind).toBe('serialized');
    expect(line.systemQtyAtStart).toBe(3);
    await expect(count(c._id, [{ lineId: line._id, qty: 3 }])).rejects.toThrow(/scanning/);

    const [view] = await count(c._id, [{ lineId: line._id, imeis: ['111', '333', '999'] }]);
    expect(view.countedQty).toBe(2);
    expect(view.missingImeis).toEqual(['222']);
    expect(view.unexpectedImeis).toEqual(['999']);

    await service.submitCount({ ...scope, countId: c._id, userId: USER });
    const { count: posted } = await service.postCount({ ...scope, countId: c._id, userId: USER });
    expect((await lineFor(c._id, phone._id)).postNote).not.toMatch(/Not posted/);
    expect(posted.status).toBe('posted');
    expect((await Imei.findOne({ imei: '222' })).status).toBe('lost');
    expect((await Imei.findOne({ imei: '111' })).status).toBe('in_stock');
    expect(await stockOf(phone._id)).toBe(2);
    expect(posted.postWarnings.join(' ')).toMatch(/not in this branch's stock/);
  });

  test('initial count: sets missing costs, and can zero what nobody counted', async () => {
    const counted = await insertProduct({ stockQuantity: 0, cost: 0 });
    const forgotten = await insertProduct({ stockQuantity: 7 });
    const { count: c } = await service.createCount({ ...scope, createdBy: USER, body: { type: 'initial' } });
    expect(c.blind).toBe(false);
    const line = await lineFor(c._id, counted._id);
    await count(c._id, [{ lineId: line._id, qty: 12, newCost: 40 }]);
    await service.submitCount({ ...scope, countId: c._id, userId: USER });
    await service.postCount({ ...scope, countId: c._id, userId: USER, uncountedPolicy: 'zero' });

    expect(await stockOf(counted._id)).toBe(12);
    expect((await Product.findById(counted._id)).cost).toBe(40);
    expect((await StockAdjustment.findOne({ productId: counted._id }).lean()).totalValue).toBe(480);
    expect(await stockOf(forgotten._id)).toBe(0);
  });

  test('costs can only be set on initial counts, and only by roles that see cost', async () => {
    await insertProduct();
    const { count: c } = await service.createCount({ ...scope, createdBy: USER, body: { type: 'custom' } });
    const [line] = await linesOf(c._id);
    await expect(count(c._id, [{ lineId: line._id, newCost: 5 }])).rejects.toThrow(/initial/);
    const [view] = await count(c._id, [{ lineId: line._id, qty: 1, newCost: 5 }], { canViewCost: false });
    expect(view.unitCost).toBeUndefined();
  });

  test('an item can only be on one open count at a time', async () => {
    await insertProduct();
    await insertProduct();
    await service.createCount({ ...scope, createdBy: USER, body: { type: 'custom' } });
    await expect(service.createCount({ ...scope, createdBy: USER, body: { type: 'custom' } })).rejects.toThrow(/already on an open count/);
  });

  test('surprise audits are always blind and sample the requested size', async () => {
    for (let i = 0; i < 12; i += 1) await insertProduct();
    const { count: c } = await service.createCount({ ...scope, createdBy: USER, body: { type: 'surprise', sampleSize: 5, blind: false } });
    expect(c.blind).toBe(true);
    expect(await StockCountLine.countDocuments({ countId: c._id })).toBe(5);
  });
});

describe('categories', () => {
  test('lists active product categories with counts, and a count can be scoped to them', async () => {
    const grocery = { _id: id(), name: 'Grocery' };
    const acc = { _id: id(), name: 'Accessories' };
    await insertProduct({ categories: [grocery] });
    await insertProduct({ categories: [grocery] });
    await insertProduct({ categories: [acc] });
    await insertProduct({ categories: [acc], isActive: false });
    await insertProduct({ categories: [] });
    expect(await service.getCategories(scope)).toEqual([
      { id: String(acc._id), name: 'Accessories', itemCount: 1 },
      { id: String(grocery._id), name: 'Grocery', itemCount: 2 },
    ]);
    const { count: c } = await service.createCount({ ...scope, createdBy: USER, body: { type: 'custom', categoryIds: [String(grocery._id)] } });
    expect(await StockCountLine.countDocuments({ countId: c._id })).toBe(2);
  });
});

describe('reports', () => {
  test('record accuracy, value of variances and repeat offenders', async () => {
    const a = await insertProduct({ cost: 10, stockQuantity: 10 });
    const b = await insertProduct({ cost: 5, stockQuantity: 10 });
    const { count: c } = await service.createCount({ ...scope, createdBy: USER, body: { type: 'custom', blind: false } });
    await count(c._id, [
      { lineId: (await lineFor(c._id, a._id))._id, qty: 7, reason: 'theft' },
      { lineId: (await lineFor(c._id, b._id))._id, qty: 10 },
    ]);
    await service.submitCount({ ...scope, countId: c._id, userId: USER });
    await service.postCount({ ...scope, countId: c._id, userId: USER });

    const report = await service.getReports({ ...scope, canViewCost: true });
    expect(report.overall).toMatchObject({ counted: 2, matched: 1, accuracyPct: 50, lossValue: 30, netValue: -30 });
    // 30 lost out of 150 counted value → 80% value accuracy.
    expect(report.overall.valueAccuracyPct).toBe(80);
    expect(report.reasons).toEqual([{ reason: 'theft', lines: 1, value: -30 }]);
    expect(report.problemItems[0]).toMatchObject({ productId: String(a._id), times: 1, netQty: -3 });
    expect(report.counts).toHaveLength(1);

    const hidden = await service.getReports({ ...scope, canViewCost: false });
    expect(hidden.overall.lossValue).toBeUndefined();
    expect(hidden.overall.accuracyPct).toBe(50);
  });
});
