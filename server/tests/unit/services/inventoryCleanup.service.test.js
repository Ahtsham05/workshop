const mongoose = require('mongoose');
const setupTestDB = require('../../utils/setupTestDB');
const { Product, Invoice } = require('../../../src/models');
const cleanup = require('../../../src/services/inventoryCleanup.service');
const { clearAnalyticsCache } = require('../../../src/services/productAnalytics.service');

setupTestDB();
// Each test runs the analytics engine (several aggregations) — the first, against a cold
// in-memory mongod, can outlast Jest's 5s default.
jest.setTimeout(30000);

const ORG = new mongoose.Types.ObjectId();
const BRANCH = new mongoose.Types.ObjectId();
const CAT_A = new mongoose.Types.ObjectId();
const CAT_B = new mongoose.Types.ObjectId();
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);
const scope = { organizationId: String(ORG), branchId: String(BRANCH) };

let ids;
beforeEach(async () => {
  clearAnalyticsCache();
  const base = { organizationId: ORG, branchId: BRANCH, isActive: true, hasVariants: false, createdAt: daysAgo(400) };
  const catA = [{ _id: CAT_A, name: 'Mobiles' }];
  const catB = [{ _id: CAT_B, name: 'Accessories' }];
  const docs = {
    deadA: { ...base, name: 'Old phone', stockQuantity: 4, cost: 10000, price: 12000, categories: catA },
    selling: { ...base, name: 'Hot phone', stockQuantity: 5, cost: 20000, price: 25000, categories: catA },
    soldLongAgo: { ...base, name: 'Slow cable', stockQuantity: 10, cost: 100, price: 150, categories: catB },
    zero: { ...base, name: 'Gone case', stockQuantity: 0, cost: 50, price: 100, categories: catB },
    zeroNew: { ...base, name: 'New case', stockQuantity: 0, cost: 50, price: 100, categories: catB, createdAt: daysAgo(5) },
    inactive: { ...base, name: 'Hidden charger', stockQuantity: 3, cost: 300, price: 500, isActive: false, categories: catB },
    loss: { ...base, name: 'Loss maker', stockQuantity: 2, cost: 1000, price: 800, categories: catB },
    noPrice: { ...base, name: 'No price', stockQuantity: 1, cost: 10, price: 0 },
    dup1: { ...base, name: 'Earbuds Pro', stockQuantity: 1, cost: 1, price: 2, categories: catB },
    dup2: { ...base, name: 'earbuds-pro', stockQuantity: 0, cost: 1, price: 2, categories: catB, createdAt: daysAgo(1) },
    // Unsold, but only in stock for 30 days — too new to be dead at 90, dead at 30.
    fresh: { ...base, name: 'Fresh stock', stockQuantity: 5, cost: 10, price: 20, createdAt: daysAgo(30) },
    // In both categories — counted in each.
    both: { ...base, name: 'Bundle', stockQuantity: 1, cost: 5, price: 9, categories: [...catA, ...catB] },
    // Switched off: a below-cost price there isn't a pricing problem to fix.
    offLoss: { ...base, name: 'Off loss', stockQuantity: 0, cost: 100, price: 50, isActive: false, categories: catB },
  };
  ids = {};
  for (const [key, doc] of Object.entries(docs)) {
    const _id = new mongoose.Types.ObjectId();
    ids[key] = String(_id);
    await Product.collection.insertOne({ _id, ...doc });
  }
  const sale = (productId, when) => ({
    organizationId: ORG, branchId: BRANCH, type: 'cash', status: 'finalized', invoiceDate: when, total: 1, subtotal: 1,
    items: [{ productId: new mongoose.Types.ObjectId(productId), quantity: 1, stockQuantity: 1, subtotal: 100, profit: 10 }],
  });
  await Invoice.collection.insertMany([
    sale(ids.selling, daysAgo(3)),
    sale(ids.soldLongAgo, daysAgo(120)), // inside 180, outside 90
    sale(ids.loss, daysAgo(2)),
    sale(ids.dup1, daysAgo(2)),
    sale(ids.noPrice, daysAgo(2)),
    sale(ids.both, daysAgo(2)),
  ]);
});

const bucketOf = async (bucket, idleDays = 90, extra = {}) =>
  (await cleanup.getCleanupItems({ ...scope, idleDays, bucket, limit: 100, ...extra })).results.map((r) => r.name).sort();

test('dead stock follows the idle window', async () => {
  expect(await bucketOf('dead_stock', 90)).toEqual(['Hidden charger', 'Old phone', 'Slow cable']);
  // Sold 120 days ago → not dead when the window is 180 days.
  expect(await bucketOf('dead_stock', 180)).toEqual(['Hidden charger', 'Old phone']);
  expect(await bucketOf('dead_stock', 30)).toContain('Fresh stock');
});

test('zero stock + unsold + old enough; switched-off with stock; below cost; no price; duplicates', async () => {
  expect(await bucketOf('zero_unsold')).toEqual(['Gone case']);
  expect(await bucketOf('inactive_with_stock')).toEqual(['Hidden charger']);
  expect(await bucketOf('below_cost')).toEqual(['Loss maker']);
  expect(await bucketOf('missing_price')).toEqual(['No price']);
  expect(await bucketOf('duplicate')).toEqual(['Earbuds Pro', 'earbuds-pro']);
});

test('overview: category totals, in/out of stock counts, bucket value', async () => {
  const o = await cleanup.getCleanupOverview({ ...scope, idleDays: 90 });
  const mobiles = o.categories.find((c) => c.categoryName === 'Mobiles');
  expect(mobiles).toMatchObject({ totalProducts: 3, inStockProducts: 3, outOfStockProducts: 0, stockValue: 140005 });
  expect(mobiles.buckets.dead_stock).toEqual({ count: 1, stockValue: 40000 });
  const acc = o.categories.find((c) => c.categoryName === 'Accessories');
  expect(acc).toMatchObject({ totalProducts: 9, outOfStockProducts: 4 });
  expect(o.categories.find((c) => c.categoryId === 'uncategorized').totalProducts).toBe(2);
  expect(o.totals.totalProducts).toBe(13);
  // Mobiles hold the most value → listed first.
  expect(o.categories[0].categoryName).toBe('Mobiles');
});

test('items filter by category and report the bucket total value', async () => {
  const r = await cleanup.getCleanupItems({ ...scope, idleDays: 90, bucket: 'dead_stock', categoryId: String(CAT_B) });
  expect(r.results.map((x) => x.name).sort()).toEqual(['Hidden charger', 'Slow cable']);
  expect(r.totalStockValue).toBe(900 + 1000);
  expect(r.results[0]).toHaveProperty('source');
});

test('an unknown idle window falls back to 90 days', async () => {
  expect((await cleanup.getCleanupOverview({ ...scope, idleDays: 7 })).idleDays).toBe(90);
});
