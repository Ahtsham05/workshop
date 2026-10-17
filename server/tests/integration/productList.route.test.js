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
const productListRoute = require('../../src/routes/v1/productList.route');
const productRoute = require('../../src/routes/v1/product.route');

setupTestDB();
jest.setTimeout(60000);

const app = express();
app.use(express.json());
app.use('/v1/product-lists', productListRoute);
app.use('/v1/products', productRoute);
app.use(errorConverter);
app.use(errorHandler);

const ORG = new mongoose.Types.ObjectId();
let main;
let other;
let p;

beforeEach(async () => {
  [main, other] = await Branch.create([
    { organizationId: ORG, name: 'Main' },
    { organizationId: ORG, name: 'Other' },
  ]);
  const owner = await User.create({ name: 'Owner', email: 'owner@example.com', password: 'password1', organizationId: ORG, systemRole: 'superAdmin' });
  mockScope.organizationId = String(ORG);
  mockScope.branchId = String(main._id);
  mockScope.userId = String(owner._id);
  mockGranted.perms = new Set(['viewProducts', 'editProducts', 'createProducts']);
  const mk = (name, stockQuantity, cost, price, over = {}) =>
    Product.create({ organizationId: ORG, branchId: main._id, name, stockQuantity, cost, price, ...over });
  p = {
    tv: await mk('TV', 2, 50000, 60000), // value 100,000
    phone: await mk('Phone', 10, 20000, 25000), // value 200,000
    cable: await mk('Cable', 100, 100, 200), // value 10,000
    empty: await mk('Old radio', 0, 3000, 4000),
    low: await mk('Charger', 3, 500, 800, { lowStockThreshold: 5 }),
    elsewhere: await Product.create({ organizationId: ORG, branchId: other._id, name: 'Elsewhere', stockQuantity: 1, cost: 1, price: 1 }),
  };
});

const api = () => request(app);
const ids = (...keys) => keys.map((k) => String(p[k]._id));

describe('manual lists', () => {
  test('preset create, add/remove products, live counts and value, products ?listId filter', async () => {
    const created = await api().post('/v1/product-lists').send({ purpose: 'to_order' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'To order', purpose: 'to_order', kind: 'manual', productCount: 0 });
    const id = created.body.id;

    const add = await api().post(`/v1/product-lists/${id}/products`).send({ productIds: [...ids('tv', 'cable', 'tv'), String(p.elsewhere._id)] });
    expect(add.body).toEqual({ added: 2, alreadyOnList: 0, notFound: 1 });
    const again = await api().post(`/v1/product-lists/${id}/products`).send({ productIds: ids('tv') });
    expect(again.body).toMatchObject({ added: 0, alreadyOnList: 1 });

    const all = await api().get('/v1/product-lists');
    expect(all.body[0]).toMatchObject({ productCount: 2, stockQuantity: 102, stockValue: 110000 });

    const filtered = await api().get(`/v1/products?listId=${id}`);
    expect(filtered.body.results.map((r) => r.name).sort()).toEqual(['Cable', 'TV']);
    const stats = await api().get(`/v1/products/stats?listId=${id}`);
    expect(stats.body).toMatchObject({ totalProducts: 2, totalStockValue: 110000 });

    await api().delete(`/v1/product-lists/${id}/products`).send({ productIds: ids('cable') });
    expect((await api().get(`/v1/products?listId=${id}`)).body.results.map((r) => r.name)).toEqual(['TV']);
  });

  test('a deleted product drops off the list', async () => {
    const { body } = await api().post('/v1/product-lists').send({ name: 'Online' });
    await api().post(`/v1/product-lists/${body.id}/products`).send({ productIds: ids('tv', 'phone') });
    await Product.deleteOne({ _id: p.tv._id });
    expect((await api().get(`/v1/product-lists/${body.id}`)).body.productCount).toBe(1);
    // …and is never offered as a line to order.
    expect((await api().get(`/v1/product-lists/${body.id}/order-lines`)).body).toEqual([{ productId: String(p.phone._id), quantity: null }]);
  });

  test('names are unique per branch, ignoring case', async () => {
    await api().post('/v1/product-lists').send({ name: 'Online' });
    expect((await api().post('/v1/product-lists').send({ name: 'ONLINE' })).status).toBe(409);
  });

  test('another branch cannot see or change the list', async () => {
    const { body } = await api().post('/v1/product-lists').send({ name: 'Mine' });
    mockScope.branchId = String(other._id);
    expect((await api().get(`/v1/product-lists/${body.id}`)).status).toBe(404);
    expect((await api().post(`/v1/product-lists/${body.id}/products`).send({ productIds: [String(p.elsewhere._id)] })).status).toBe(404);
    expect((await api().get('/v1/product-lists')).body).toEqual([]);
  });

  test('viewing needs viewProducts; changing needs editProducts', async () => {
    mockGranted.perms = new Set(['viewProducts']);
    expect((await api().get('/v1/product-lists')).status).toBe(200);
    expect((await api().post('/v1/product-lists').send({ name: 'X' })).status).toBe(403);
  });
});

describe('smart lists', () => {
  test('high value preset = top products by stock value, live', async () => {
    const { body } = await api().post('/v1/product-lists').send({ purpose: 'high_value', rule: { type: 'top_stock_value', limit: 2 } });
    expect(body).toMatchObject({ kind: 'smart', productCount: 2, stockValue: 300000 });
    const names = async () => (await api().get(`/v1/products?listId=${body.id}`)).body.results.map((r) => r.name).sort();
    expect(await names()).toEqual(['Phone', 'TV']);
    await Product.updateOne({ _id: p.cable._id }, { stockQuantity: 5000 }); // 500,000 now
    expect(await names()).toEqual(['Cable', 'Phone']);
    // Can't hand-add to a smart list.
    expect((await api().post(`/v1/product-lists/${body.id}/products`).send({ productIds: ids('tv') })).status).toBe(400);
  });

  test('low stock uses the product threshold, else the list threshold; out of stock', async () => {
    const low = await api().post('/v1/product-lists').send({ name: 'Low', kind: 'smart', rule: { type: 'low_stock', threshold: 2 } });
    expect((await api().get(`/v1/products?listId=${low.body.id}`)).body.results.map((r) => r.name).sort()).toEqual(['Charger', 'Old radio', 'TV']);
    const out = await api().post('/v1/product-lists').send({ name: 'Out', kind: 'smart', rule: { type: 'out_of_stock' } });
    expect((await api().get(`/v1/products?listId=${out.body.id}`)).body.results.map((r) => r.name)).toEqual(['Old radio']);
  });
});

describe('purposes', () => {
  test('do-not-order lookup and to-order lines', async () => {
    const dno = await api().post('/v1/product-lists').send({ purpose: 'do_not_order' });
    await api().post(`/v1/product-lists/${dno.body.id}/products`).send({ productIds: ids('empty'), note: 'Discontinued' });
    const flags = await api().get('/v1/product-lists/do-not-order');
    expect(flags.body[String(p.empty._id)]).toMatchObject({ listName: 'Do not order', note: 'Discontinued' });
    expect(Object.keys(flags.body)).toHaveLength(1);

    const order = await api().post('/v1/product-lists').send({ purpose: 'to_order' });
    await api().post(`/v1/product-lists/${order.body.id}/products`).send({ productIds: ids('cable') });
    await api().patch(`/v1/product-lists/${order.body.id}/products/${p.cable._id}`).send({ quantity: 40 });
    const lines = await api().get(`/v1/product-lists/${order.body.id}/order-lines`);
    expect(lines.body).toEqual([{ productId: String(p.cable._id), quantity: 40 }]);

    const memberships = await api().get(`/v1/product-lists/memberships?productIds=${ids('cable', 'empty', 'tv').join(',')}`);
    expect(memberships.body).toEqual({ [String(p.cable._id)]: [order.body.id], [String(p.empty._id)]: [dno.body.id] });
  });
});
