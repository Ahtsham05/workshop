const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const setupTestDB = require('../utils/setupTestDB');

// Auth and branch scope are replaced with fakes so the router can be driven without a login:
// the fake auth grants only the permissions listed in `mockGranted.perms`, and (like the real
// one) rejects with 403 when none of a route's required permissions is held.
const mockGranted = { perms: new Set() };
const mockScope = {};
jest.mock('../../src/middlewares/auth', () => (...required) => (req, res, next) => {
  const ApiErrorLocal = require('../../src/utils/ApiError');
  req.user = { id: mockScope.userId, name: 'Test User', email: 'test@example.com' };
  if (required.length && !required.some((p) => mockGranted.perms.has(p))) {
    return next(new ApiErrorLocal(403, `You do not have permission to ${required.join(' or ')}.`));
  }
  return next();
});
jest.mock('../../src/middlewares/branchScope', () => () => (req, res, next) => {
  req.organizationId = mockScope.organizationId;
  req.branchId = mockScope.branchId;
  next();
});

const { errorConverter, errorHandler } = require('../../src/middlewares/error');
const { Branch, Membership, Product, User, AuditLog } = require('../../src/models');
const productRoute = require('../../src/routes/v1/product.route');

setupTestDB();
jest.setTimeout(60000);

const app = express();
app.use(express.json());
app.use('/v1/products', productRoute);
app.use(errorConverter);
app.use(errorHandler);

const ORG = new mongoose.Types.ObjectId();
let main;
let city;
let mall;
let owner;

beforeEach(async () => {
  [main, city, mall] = await Branch.create([
    { organizationId: ORG, name: 'Main Branch' },
    { organizationId: ORG, name: 'City Branch' },
    { organizationId: ORG, name: 'Mall Branch' },
  ]);
  owner = await User.create({ name: 'Owner', email: 'owner@example.com', password: 'password1', organizationId: ORG, systemRole: 'superAdmin' });
  mockScope.organizationId = String(ORG);
  mockScope.branchId = String(main._id);
  mockScope.userId = String(owner._id);
  mockGranted.perms = new Set(['viewProducts', 'createProducts']);
});

const makeProduct = (over = {}) =>
  Product.create({ organizationId: ORG, branchId: main._id, name: 'Cola', barcode: 'C-1', price: 100, cost: 60, stockQuantity: 9, ...over });

describe('POST /v1/products/branch-sync', () => {
  test('copies the products, reports per branch, and writes one audit entry for the whole action', async () => {
    const [a, b] = [await makeProduct(), await makeProduct({ name: 'Fanta', barcode: 'F-1' })];

    const res = await request(app)
      .post('/v1/products/branch-sync')
      .send({ productIds: [String(a._id), String(b._id)], branchIds: [String(city._id), String(mall._id)] });

    expect(res.status).toBe(200);
    expect(res.body.branches.map((row) => [row.branchName, row.syncedCount, row.failedCount])).toEqual([
      ['City Branch', 2, 0],
      ['Mall Branch', 2, 0],
    ]);
    expect(await Product.countDocuments({ branchId: city._id })).toBe(2);

    const logs = await AuditLog.find({ module: 'Product', 'metadata.type': 'branch_sync' });
    expect(logs).toHaveLength(1);
    expect(logs[0].metadata.branches.map((row) => row.syncedCount)).toEqual([2, 2]);
    expect(String(logs[0].branchId)).toBe(String(main._id));
  });

  test('writes no audit entry when nothing new was created', async () => {
    const a = await makeProduct();
    const body = { productIds: [String(a._id)], branchIds: [String(city._id)] };
    await request(app).post('/v1/products/branch-sync').send(body);

    const again = await request(app).post('/v1/products/branch-sync').send(body);

    expect(again.body.branches[0]).toMatchObject({ syncedCount: 0, alreadyPresentCount: 1 });
    expect(await AuditLog.countDocuments({ 'metadata.type': 'branch_sync' })).toBe(1);
  });

  test('needs the createProducts permission', async () => {
    mockGranted.perms = new Set(['viewProducts']);
    const a = await makeProduct();

    const res = await request(app).post('/v1/products/branch-sync').send({ productIds: [String(a._id)], branchIds: [String(city._id)] });

    expect(res.status).toBe(403);
    expect(await Product.countDocuments({ branchId: city._id })).toBe(0);
  });

  test('refuses a branch the caller is not a member of, with nothing written', async () => {
    const staff = await User.create({ name: 'Cashier', email: 'cashier@example.com', password: 'password1', organizationId: ORG, systemRole: 'staff' });
    await Membership.create([
      { userId: staff._id, organizationId: ORG, branchId: main._id, role: 'staff' },
      { userId: staff._id, organizationId: ORG, branchId: city._id, role: 'staff' },
    ]);
    mockScope.userId = String(staff._id);
    const a = await makeProduct();

    const res = await request(app).post('/v1/products/branch-sync').send({ productIds: [String(a._id)], branchIds: [String(city._id), String(mall._id)] });

    expect(res.status).toBe(403);
    expect(await Product.countDocuments({ branchId: { $in: [city._id, mall._id] } })).toBe(0);
  });

  test.each([
    ['no branches', { productIds: ['507f1f77bcf86cd799439011'], branchIds: [] }],
    ['no products', { productIds: [], branchIds: ['507f1f77bcf86cd799439011'] }],
    ['a malformed id', { productIds: ['nope'], branchIds: ['507f1f77bcf86cd799439011'] }],
    ['more than 300 products at once', { productIds: Array.from({ length: 301 }, () => String(new mongoose.Types.ObjectId())), branchIds: ['507f1f77bcf86cd799439011'] }],
    ['an unknown field', { productIds: ['507f1f77bcf86cd799439011'], branchIds: ['507f1f77bcf86cd799439011'], price: 1 }],
  ])('rejects %s', async (_label, body) => {
    const res = await request(app).post('/v1/products/branch-sync').send(body);
    expect(res.status).toBe(400);
  });
});

describe('POST /v1/products/branch-sync/preview', () => {
  test('previews a selection, and resolves "added today" to ids', async () => {
    const a = await makeProduct();

    const selected = await request(app).post('/v1/products/branch-sync/preview').send({ productIds: [String(a._id)] });
    const today = await request(app).post('/v1/products/branch-sync/preview').send({ scope: 'addedToday' });

    expect(selected.status).toBe(200);
    expect(selected.body.targets.map((t) => [t.name, t.missingCount])).toEqual(expect.arrayContaining([['City Branch', 1], ['Mall Branch', 1]]));
    expect(today.body.productIds).toEqual([String(a._id)]);
  });

  test('needs exactly one of productIds or scope', async () => {
    const a = await makeProduct();
    const both = await request(app).post('/v1/products/branch-sync/preview').send({ productIds: [String(a._id)], scope: 'addedToday' });
    const neither = await request(app).post('/v1/products/branch-sync/preview').send({});
    const wrongScope = await request(app).post('/v1/products/branch-sync/preview').send({ scope: 'lastWeek' });

    expect([both.status, neither.status, wrongScope.status]).toEqual([400, 400, 400]);
  });

  test('needs the createProducts permission', async () => {
    mockGranted.perms = new Set(['viewProducts']);
    const res = await request(app).post('/v1/products/branch-sync/preview').send({ scope: 'addedToday' });
    expect(res.status).toBe(403);
  });
});

describe('the Products list "Added Today" view', () => {
  test('lists only what this branch added today, and counts it in the header totals', async () => {
    const todays = await makeProduct({ name: 'Today A', barcode: 'T-A' });
    await makeProduct({ name: 'Today B', barcode: 'T-B' });
    const old = await makeProduct({ name: 'Old One', barcode: 'O-1' });
    await Product.create({ organizationId: ORG, branchId: city._id, name: 'Other Branch Today', price: 1, cost: 1, stockQuantity: 0 });
    await Product.collection.updateOne({ _id: old._id }, { $set: { createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) } });

    const all = await request(app).get('/v1/products');
    const added = await request(app).get('/v1/products').query({ addedToday: true });
    const stats = await request(app).get('/v1/products/stats');
    const addedStats = await request(app).get('/v1/products/stats').query({ addedToday: true });

    expect(all.body.totalResults).toBe(3);
    expect(added.body.results.map((p) => p.name).sort()).toEqual(['Today A', 'Today B']);
    expect(added.body.results.map((p) => p.id)).toContain(String(todays._id));
    // The chip's count is always today's, whether or not the view is on…
    expect(stats.body).toMatchObject({ totalProducts: 3, addedTodayCount: 2 });
    // …while the totals follow the view.
    expect(addedStats.body).toMatchObject({ totalProducts: 2, addedTodayCount: 2 });
  });

  test('is empty once the products were added on an earlier day', async () => {
    const p = await makeProduct();
    await Product.collection.updateOne({ _id: p._id }, { $set: { createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000) } });

    const added = await request(app).get('/v1/products').query({ addedToday: true });
    const stats = await request(app).get('/v1/products/stats');

    expect(added.body.results).toEqual([]);
    expect(stats.body.addedTodayCount).toBe(0);
  });

  test('keeps the view combined with the other filters, and off means everything', async () => {
    await makeProduct({ name: 'Live', isActive: true, barcode: 'L-1' });
    await makeProduct({ name: 'Draft', isActive: false, barcode: 'D-1' });

    const inactive = await request(app).get('/v1/products').query({ addedToday: true, isActive: false });
    const off = await request(app).get('/v1/products').query({ addedToday: false });

    expect(inactive.body.results.map((p) => p.name)).toEqual(['Draft']);
    expect(off.body.totalResults).toBe(2);
  });
});
