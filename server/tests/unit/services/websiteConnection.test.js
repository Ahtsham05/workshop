const mongoose = require('mongoose');
const request = require('supertest');
const express = require('express');
const setupTestDB = require('../../utils/setupTestDB');
const { Branch, Brand, Inventory, Organization, Product, ProductVariant, WebsiteConnection } = require('../../../src/models');
const service = require('../../../src/services/websiteConnection.service');
const storefrontRoute = require('../../../src/routes/v1/storefront.route');
const { errorConverter, errorHandler } = require('../../../src/middlewares/error');

/**
 * Website Connections: a shop's website reads its live inventory with an API key. What
 * matters: the stock it shows is right (summed across the chosen branches, never oversold),
 * the key only ever reads, and one business's key never sees another business's products.
 */
setupTestDB();
jest.setTimeout(60000);

const ORG = new mongoose.Types.ObjectId();
const OTHER_ORG = new mongoose.Types.ObjectId();
const USER = new mongoose.Types.ObjectId();
let main;
let city;
let mall;

const app = express();
app.use('/v1/storefront', storefrontRoute);
app.use(errorConverter);
app.use(errorHandler);

beforeEach(async () => {
  service.__resetKeyCacheForTests();
  [main, city, mall] = await Branch.create([
    { organizationId: ORG, name: 'Main' },
    { organizationId: ORG, name: 'City' },
    { organizationId: ORG, name: 'Mall' },
  ]);
  await Organization.create({ _id: ORG, name: 'Bench Mart', owner: USER, baseCurrency: 'PKR' });
});

const product = (branch, fields) =>
  Product.create({ organizationId: ORG, branchId: branch._id, price: 100, cost: 60, stockQuantity: 0, ...fields });

const connect = (fields = {}) =>
  service.createConnection(ORG, USER, { name: 'Shop website', branchIds: [String(main._id), String(city._id)], ...fields });

describe('keys', () => {
  test('a key is shown once, stored only as a hash, and authenticates its connection', async () => {
    const { connection, apiKey } = await connect();

    expect(apiKey).toMatch(/^lps_live_[0-9A-Za-z]{40}$/);
    const stored = await WebsiteConnection.findById(connection._id).lean();
    expect(stored.keyHash).toBe(service.hashKey(apiKey));
    expect(JSON.stringify(stored)).not.toContain(apiKey);
    expect(JSON.stringify(connection.toJSON())).not.toContain(stored.keyHash);
    expect(String((await service.authenticateKey(apiKey))._id)).toBe(String(connection._id));
  });

  test('wrong, malformed, disabled and rotated keys are refused', async () => {
    const { connection, apiKey } = await connect();
    expect(await service.authenticateKey(`${apiKey.slice(0, -1)}x`)).toBeNull();
    expect(await service.authenticateKey('not-a-key')).toBeNull();
    expect(await service.authenticateKey(undefined)).toBeNull();

    await service.updateConnection(ORG, USER, connection._id, { isActive: false });
    expect(await service.authenticateKey(apiKey)).toBeNull();

    await service.updateConnection(ORG, USER, connection._id, { isActive: true });
    const { apiKey: rotated } = await service.rotateKey(ORG, USER, connection._id);
    expect(await service.authenticateKey(apiKey)).toBeNull();
    expect(await service.authenticateKey(rotated)).toBeTruthy();
  });

  test('branches must belong to the business', async () => {
    const foreign = await Branch.create({ organizationId: OTHER_ORG, name: 'Not ours' });
    await expect(service.createConnection(ORG, USER, { name: 'x', branchIds: [String(foreign._id)] })).rejects.toThrow(/not part of this business/);
    await expect(connect({ priceBranchId: String(mall._id) })).rejects.toThrow(/price branch/);
  });
});

describe('what the website sees', () => {
  test('one product per catalog item, stock summed across the chosen branches only', async () => {
    const master = new mongoose.Types.ObjectId();
    await product(main, { name: 'Cola', sku: 'COLA', masterProductId: master, stockQuantity: 5, price: 120 });
    await product(city, { name: 'Cola', sku: 'COLA', masterProductId: master, stockQuantity: 7, price: 999 });
    await product(mall, { name: 'Cola', sku: 'COLA', masterProductId: master, stockQuantity: 100 }); // not chosen
    const { connection } = await connect();

    const { results, totalResults } = await service.listProducts(connection.toObject());

    expect(totalResults).toBe(1);
    expect(results[0]).toMatchObject({ id: String(master), name: 'Cola', sku: 'COLA', available: 12, inStock: true, price: 120 });
  });

  test('a branch below zero counts as zero, never cancelling another branch', async () => {
    const master = new mongoose.Types.ObjectId();
    await product(main, { name: 'Tea', masterProductId: master, stockQuantity: -4 });
    await product(city, { name: 'Tea', masterProductId: master, stockQuantity: 3 });
    const { connection } = await connect();

    expect((await service.listProducts(connection.toObject())).results[0].available).toBe(3);
  });

  test('safety stock is held back, and availability never goes below zero', async () => {
    await product(main, { name: 'Soap', stockQuantity: 5 });
    await product(main, { name: 'Salt', stockQuantity: 1 });
    const { connection } = await connect({ safetyStock: 2 });

    const byName = Object.fromEntries((await service.listProducts(connection.toObject())).results.map((p) => [p.name, p]));
    expect(byName.Soap).toMatchObject({ available: 3, inStock: true });
    expect(byName.Salt).toMatchObject({ available: 0, inStock: false });
  });

  test('inactive products are hidden unless the connection says otherwise', async () => {
    await product(main, { name: 'Old stock', stockQuantity: 5, isActive: false });
    const { connection } = await connect();
    expect((await service.listProducts(connection.toObject())).totalResults).toBe(0);

    const updated = await service.updateConnection(ORG, USER, connection._id, { activeProductsOnly: false });
    expect((await service.listProducts(updated.toObject())).totalResults).toBe(1);
  });

  test('prices and names come from the price branch', async () => {
    const master = new mongoose.Types.ObjectId();
    await product(main, { name: 'Rice 5kg', masterProductId: master, stockQuantity: 1, price: 1500 });
    await product(city, { name: 'Rice (5 kg bag)', masterProductId: master, stockQuantity: 1, price: 1450 });
    const { connection } = await connect({ priceBranchId: String(city._id) });

    expect((await service.listProducts(connection.toObject())).results[0]).toMatchObject({ name: 'Rice (5 kg bag)', price: 1450, available: 2 });
  });

  test('variant products list their variants, merged across branches', async () => {
    const master = new mongoose.Types.ObjectId();
    const mvRed = new mongoose.Types.ObjectId();
    const mvBlue = new mongoose.Types.ObjectId();
    const shirts = await Promise.all([
      product(main, { name: 'Shirt', masterProductId: master, hasVariants: true }),
      product(city, { name: 'Shirt', masterProductId: master, hasVariants: true }),
    ]);
    const add = async (shirt, branch, masterVariantId, color, qty) => {
      const v = await ProductVariant.create({
        organizationId: ORG, branchId: branch._id, productId: shirt._id, isDefault: false, masterVariantId,
        sku: `SH-${color}`, attributes: { color }, price: 900, cost: 500,
      });
      await Inventory.create({ organizationId: ORG, branchId: branch._id, productId: shirt._id, variantId: v._id, quantity: qty, averageCost: 500 });
    };
    await add(shirts[0], main, mvRed, 'red', 2);
    await add(shirts[1], city, mvRed, 'red', 3);
    await add(shirts[1], city, mvBlue, 'blue', 0);
    const { connection } = await connect();

    const [shirt] = (await service.listProducts(connection.toObject())).results;
    const variants = Object.fromEntries(shirt.variants.map((v) => [v.sku, v]));
    expect(shirt).toMatchObject({ hasVariants: true, available: 5, inStock: true });
    expect(variants['SH-red']).toMatchObject({ available: 5, inStock: true });
    expect(variants['SH-blue']).toMatchObject({ available: 0, inStock: false });
  });

  test('brand names, photos, search, paging and in-stock filtering', async () => {
    const brand = await Brand.create({ organizationId: ORG, branchId: main._id, name: 'Nestle', slug: 'nestle', createdBy: USER });
    await product(main, { name: 'Milk', stockQuantity: 2, brandId: brand._id, images: [{ url: 'https://img.test/milk.jpg', publicId: 'milk' }] });
    await product(main, { name: 'Milkshake', stockQuantity: 0 });
    await product(main, { name: 'Bread', stockQuantity: 9 });
    const { connection } = await connect();
    const c = connection.toObject();

    const milk = (await service.listProducts(c, { search: 'milk' })).results;
    expect(milk.map((p) => p.name)).toEqual(['Milk', 'Milkshake']);
    expect(milk[0]).toMatchObject({ brand: 'Nestle', image: 'https://img.test/milk.jpg', images: ['https://img.test/milk.jpg'] });
    expect(milk[1]).toMatchObject({ image: null, images: [] });
    expect((await service.listProducts(c, { limit: 2, page: 2 })).results.map((p) => p.name)).toEqual(['Milkshake']);
    expect((await service.listProducts(c, { inStockOnly: true })).results.map((p) => p.name)).toEqual(['Bread', 'Milk']);
  });

  test('stock lookup by id, SKU/barcode or a variant code', async () => {
    const soap = await product(main, { name: 'Soap', sku: 'SOAP-1', barcode: '8901', stockQuantity: 4 });
    const shirt = await product(main, { name: 'Shirt', hasVariants: true });
    const v = await ProductVariant.create({ organizationId: ORG, branchId: main._id, productId: shirt._id, isDefault: false, sku: 'SH-L', price: 1, cost: 1 });
    await Inventory.create({ organizationId: ORG, branchId: main._id, productId: shirt._id, variantId: v._id, quantity: 6, averageCost: 1 });
    await product(main, { name: 'Other', stockQuantity: 1 });
    const { connection } = await connect();
    const c = connection.toObject();

    const bySku = await service.listStock(c, { codes: ['8901', 'SH-L'] });
    expect(bySku.results.map((r) => [r.sku, r.available]).sort()).toEqual([['SOAP-1', 4], [null, 6]].sort());
    expect((await service.listStock(c, { ids: [String(soap._id)] })).results).toHaveLength(1);
    expect((await service.listStock(c)).results).toHaveLength(3);
    await expect(service.getProduct(c, 'SOAP-1')).resolves.toMatchObject({ name: 'Soap', available: 4 });
    await expect(service.getProduct(c, 'nope')).rejects.toThrow(/No such product/);
  });
});

describe('storefront HTTP API', () => {
  test('needs a valid key; answers with an ETag and 304 when unchanged', async () => {
    await product(main, { name: 'Cola', stockQuantity: 5 });
    const { apiKey } = await connect();

    expect((await request(app).get('/v1/storefront/products')).status).toBe(401);
    expect((await request(app).get('/v1/storefront/products').set('X-Api-Key', 'lps_live_wrong')).status).toBe(401);

    const first = await request(app).get('/v1/storefront/products').set('Authorization', `Bearer ${apiKey}`);
    expect(first.status).toBe(200);
    expect(first.body.results[0]).toMatchObject({ name: 'Cola', available: 5 });
    expect(first.body.results[0]).not.toHaveProperty('cost');
    expect(first.headers.etag).toBeTruthy();

    const again = await request(app).get('/v1/storefront/products').set('X-Api-Key', apiKey).set('If-None-Match', first.headers.etag);
    expect(again.status).toBe(304);

    await Product.updateOne({ name: 'Cola' }, { $set: { stockQuantity: 4 } });
    const changed = await request(app).get('/v1/storefront/products').set('X-Api-Key', apiKey).set('If-None-Match', first.headers.etag);
    expect(changed.status).toBe(200);
    expect(changed.body.results[0].available).toBe(4);

    const info = await request(app).get('/v1/storefront').set('X-Api-Key', apiKey);
    expect(info.body).toMatchObject({ business: 'Bench Mart', currency: 'PKR' });
  });

  test("one business's key never sees another business's products", async () => {
    const theirs = await Branch.create({ organizationId: OTHER_ORG, name: 'Theirs' });
    await Product.create({ organizationId: OTHER_ORG, branchId: theirs._id, name: 'Secret', price: 1, cost: 1, stockQuantity: 9, sku: 'SECRET' });
    await product(main, { name: 'Ours', stockQuantity: 1 });
    const { apiKey } = await connect();

    const list = await request(app).get('/v1/storefront/products').set('X-Api-Key', apiKey);
    expect(list.body.results.map((p) => p.name)).toEqual(['Ours']);
    expect((await request(app).get('/v1/storefront/products/SECRET').set('X-Api-Key', apiKey)).status).toBe(404);
    expect((await request(app).get('/v1/storefront/stock?codes=SECRET').set('X-Api-Key', apiKey)).body.results).toEqual([]);
  });

  test('even a stray document filed under one of our branch ids stays invisible if it belongs to another business', async () => {
    await Product.create({ organizationId: OTHER_ORG, branchId: main._id, name: 'Stray', price: 1, cost: 1, stockQuantity: 3 });
    const { connection } = await connect();

    expect((await service.listProducts(connection.toObject())).totalResults).toBe(0);
  });

  test('is read-only', async () => {
    const { apiKey } = await connect();
    const res = await request(app).post('/v1/storefront/products').set('X-Api-Key', apiKey).send({ name: 'x' });
    expect(res.status).toBe(404);
    expect(await Product.countDocuments()).toBe(0);
  });
});
