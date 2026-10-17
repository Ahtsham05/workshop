const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const setupTestDB = require('../utils/setupTestDB');

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
const { Branch, Product, User } = require('../../src/models');
const productService = require('../../src/services/product.service');
const productRoute = require('../../src/routes/v1/product.route');
const { productNameKey } = require('../../src/utils/productNameKey');

setupTestDB();
jest.setTimeout(60000);

const app = express();
app.use(express.json());
app.use('/v1/products', productRoute);
app.use(errorConverter);
app.use(errorHandler);

const ORG = new mongoose.Types.ObjectId();
let main;
let other;
let createSpy;

beforeEach(async () => {
  [main, other] = await Branch.create([
    { organizationId: ORG, name: 'Main Branch' },
    { organizationId: ORG, name: 'Other Branch' },
  ]);
  const owner = await User.create({ name: 'Owner', email: 'owner@example.com', password: 'password1', organizationId: ORG, systemRole: 'superAdmin' });
  mockScope.organizationId = String(ORG);
  mockScope.branchId = String(main._id);
  mockScope.userId = String(owner._id);
  mockGranted.perms = new Set(['viewProducts', 'createProducts']);
  // The real createProduct runs in a Mongo transaction (no replica set here) — what is
  // under test is the guard in front of it and what it is handed.
  createSpy = jest.spyOn(productService, 'createProduct').mockImplementation(async (body) => new Product({ ...body, _id: new mongoose.Types.ObjectId() }));
});

const makeProduct = (over = {}) =>
  Product.create({ organizationId: ORG, branchId: main._id, name: 'iPhone 13 Pro', price: 100, cost: 60, stockQuantity: 9, ...over });

const body = (over = {}) => ({ name: 'I-PHONE 13pro.', price: 1, cost: 1, stockQuantity: 0, ...over });

describe('productNameKey', () => {
  test('ignores case, spaces, punctuation and accents', () => {
    expect(productNameKey('iPhone 13 Pro')).toBe(productNameKey(' i-phone 13PRO. '));
    expect(productNameKey('Café Latte')).toBe('cafelatte');
    expect(productNameKey('iPhone 13')).not.toBe(productNameKey('iPhone 14'));
    // Urdu letters are kept (not stripped as "punctuation"); spacing doesn't count.
    expect(productNameKey('چائے  پتی')).toBe(productNameKey('چائےپتی'));
    expect(productNameKey('چائے پتی')).not.toBe(productNameKey('چینی'));
  });
});

describe('POST /v1/products — same-name guard', () => {
  test('refuses a name that matches an existing product (inactive too), naming it', async () => {
    const existing = await makeProduct({ isActive: false, source: 'excel_import' });
    const res = await request(app).post('/v1/products').send(body());
    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('DUPLICATE_PRODUCT_NAME');
    expect(res.body.details.product).toMatchObject({ id: String(existing._id), name: 'iPhone 13 Pro', isActive: false, source: 'excel_import' });
    expect(createSpy).not.toHaveBeenCalled();
  });

  test('"Create anyway" goes through, and the product is recorded as manual', async () => {
    await makeProduct();
    const res = await request(app).post('/v1/products').send(body({ allowDuplicateName: true }));
    expect(res.status).toBe(201);
    expect(createSpy).toHaveBeenCalledTimes(1);
    const passed = createSpy.mock.calls[0][0];
    expect(passed.source).toBe('manual');
    expect(passed).not.toHaveProperty('allowDuplicateName');
  });

  test('a client cannot claim a different source', async () => {
    const res = await request(app).post('/v1/products').send(body({ name: 'Brand new', source: 'excel_import' }));
    // `source` isn't an accepted field on create — the request is refused outright.
    expect(res.status).toBe(400);
    expect(createSpy).not.toHaveBeenCalled();
  });

  test('a similar but different name, or the same name in another branch, is not blocked', async () => {
    await makeProduct();
    await makeProduct({ branchId: other._id, name: 'Galaxy S24' });
    expect((await request(app).post('/v1/products').send(body({ name: 'iPhone 14 Pro' }))).status).toBe(201);
    expect((await request(app).post('/v1/products').send(body({ name: 'Galaxy S24' }))).status).toBe(201);
  });
});

describe('GET /v1/products/name-index', () => {
  test('lists every product in the branch, inactive included, in the slim shape', async () => {
    await makeProduct({ barcode: 'B1', source: 'manual' });
    await makeProduct({ name: 'Charger', isActive: false, source: 'ai_scan' });
    await makeProduct({ branchId: other._id, name: 'Elsewhere' });
    const res = await request(app).get('/v1/products/name-index');
    expect(res.status).toBe(200);
    expect(res.body.map((p) => p.name).sort()).toEqual(['Charger', 'iPhone 13 Pro']);
    const charger = res.body.find((p) => p.name === 'Charger');
    expect(charger).toMatchObject({ isActive: false, source: 'ai_scan', stockQuantity: 9 });
    expect(charger).not.toHaveProperty('cost');
  });

  test('needs createProducts', async () => {
    mockGranted.perms = new Set(['viewProducts']);
    expect((await request(app).get('/v1/products/name-index')).status).toBe(403);
  });
});

describe('GET /v1/products?source=', () => {
  test('filters by source; unknown = not recorded', async () => {
    await makeProduct({ name: 'A', source: 'excel_import' });
    await makeProduct({ name: 'B', source: 'manual' });
    await makeProduct({ name: 'C' });
    const names = async (q) => (await request(app).get(`/v1/products?source=${q}`)).body.results.map((p) => p.name).sort();
    expect(await names('excel_import')).toEqual(['A']);
    expect(await names('manual,unknown')).toEqual(['B', 'C']);
  });
});
