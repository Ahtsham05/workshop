const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { Product, ProductionOrder } = require('../../src/models');
const manufacturing = require('../../src/services/manufacturing');
const productValidation = require('../../src/validations/product.validation');

/** Manufacturing → Products: list filters/sort, summary stats, the per-product overview, and productType on products. */
let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const id = () => new mongoose.Types.ObjectId();
const ORG = id();
const BRANCH = id();
const ctx = { organizationId: ORG, branchId: String(BRANCH), createdBy: id() };
const insert = async (name, extra = {}) => {
  const doc = {
    _id: id(),
    organizationId: ORG,
    branchId: BRANCH,
    name,
    price: 20,
    cost: 10,
    stockQuantity: 0,
    unit: 'pcs',
    hasVariants: false,
    isActive: true,
    productType: null,
    defaultBomId: null,
    createdAt: new Date(),
    ...extra,
  };
  await Product.collection.insertOne(doc);
  return doc;
};
const products = manufacturing.products;

test('stats follow the same filters as the list', async () => {
  await insert('Steel', { productType: 'raw_material', stockQuantity: 10, cost: 5 });
  await insert('Paint', { productType: 'raw_material', stockQuantity: 0, cost: 8 });
  await insert('Fan', { productType: 'finished_good', stockQuantity: 2, cost: 100, defaultBomId: id() });
  await insert('Other org', { organizationId: id(), productType: 'raw_material', stockQuantity: 99, cost: 99 });

  expect(await products.getProductStats(ctx, {})).toEqual({
    products: 3,
    stockQuantity: 12,
    stockValue: 250,
    avgCost: 37.67,
    outOfStock: 1,
    withBom: 1,
  });
  expect(await products.getProductStats(ctx, { productType: 'raw_material', stock: 'in' })).toMatchObject({
    products: 1,
    stockValue: 50,
  });
  expect((await products.getProductStats(ctx, { hasBom: 'false' })).products).toBe(2);

  const list = await products.queryProducts(ctx, { productType: 'raw_material', sort: 'cost' }, {});
  expect(list.results.map((p) => p.name)).toEqual(['Paint', 'Steel']);
});

test('a type list may include unclassified: the BOM pickers (build vs components)', async () => {
  await insert('Steel', { productType: 'raw_material' });
  await insert('Loose bolt', { productType: null });
  await insert('Fan', { productType: 'finished_good' });
  await insert('Motor', { productType: 'sub_assembly' });
  const names = async (productType) =>
    (await products.queryProducts(ctx, { productType, sort: 'name' }, {})).results.map((p) => p.name).sort();
  expect(await names('finished_good,sub_assembly')).toEqual(['Fan', 'Motor']);
  expect(await names('raw_material,sub_assembly,unclassified')).toEqual(['Loose bolt', 'Motor', 'Steel']);
  expect(await names('unclassified')).toEqual(['Loose bolt']);
});

test('overview: BOMs, orders that make it, open orders that consume it, WIP', async () => {
  const steel = await insert('Steel', { productType: 'raw_material', stockQuantity: 50 });
  const fan = await insert('Fan', { productType: 'finished_good' });
  const bom = await manufacturing.bom.createBom(ctx, {
    productId: fan._id,
    components: [{ productId: steel._id, quantity: 2 }],
  });
  const order = await manufacturing.productionOrder.createOrder(ctx, { productId: fan._id, plannedQuantity: 10 });
  await ProductionOrder.updateOne(
    { _id: order._id },
    {
      $set: {
        'materials.0.issuedQuantity': 8,
        wipLots: [{ materialLineId: order.materials[0]._id, productId: steel._id, quantity: 8 }],
      },
    }
  );

  const fanView = await products.getProductOverview(ctx, fan._id);
  expect(fanView.boms.map((b) => b.bomNumber)).toEqual([bom.bomNumber]);
  expect(fanView.making.map((o) => o.orderNumber)).toEqual([order.orderNumber]);
  expect(fanView.totals.inProduction).toBe(10);

  const steelView = await products.getProductOverview(ctx, steel._id);
  expect(steelView.whereUsed.map((w) => w.productName)).toEqual(['Fan']);
  expect(steelView.consuming[0]).toMatchObject({ orderNumber: order.orderNumber, required: 20, issued: 8, inWip: 8 });
  expect(steelView.totals).toMatchObject({ requiredByOpenOrders: 12, inWip: 8 });

  await expect(products.getProductOverview({ ...ctx, organizationId: id() }, fan._id)).rejects.toThrow(/not found/);
});

test('products accept a manufacturing type (or none) on create and update', () => {
  const base = { name: 'X', price: 1, cost: 1, stockQuantity: 0 };
  expect(productValidation.createProduct.body.validate({ ...base, productType: 'finished_good' }).error).toBeUndefined();
  expect(productValidation.createProduct.body.validate({ ...base, productType: null }).error).toBeUndefined();
  expect(productValidation.createProduct.body.validate({ ...base, productType: 'gadget' }).error).toBeDefined();
  expect(productValidation.updateProduct.body.validate({ productType: 'raw_material' }).error).toBeUndefined();
});

describe('Manufacturing access (business type + rollout list)', () => {
  const access = require('../../src/services/manufacturing/access.service');
  const { Organization } = require('../../src/models');
  const orgWith = async (businessType) => {
    const _id = id();
    await Organization.collection.insertOne({ _id, name: 'Org', businessType });
    return _id;
  };
  beforeEach(() => access.clearAccessCache());

  test('needs a manufacturing business type ("manufacturing" or "factory")', async () => {
    const shop = await orgWith('mobile_shop');
    const factory = await orgWith('factory');
    const alias = await orgWith('Manufacturing');
    const user = { email: 'a@b.com' };
    expect(await access.resolveAccess({ user, organizationId: shop, allowedEmails: [] })).toEqual({
      enabled: false,
      reason: 'business_type',
    });
    expect(await access.resolveAccess({ user, organizationId: factory, allowedEmails: [] })).toEqual({
      enabled: true,
      reason: null,
    });
    expect((await access.resolveAccess({ user, organizationId: alias, allowedEmails: [] })).enabled).toBe(true);
  });

  test('testers see it in any business type; everyone else still follows the rule', async () => {
    const shop = await orgWith('mobile_shop');
    const testers = ['info@logixplussolutions.com'];
    expect(
      await access.resolveAccess({
        user: { email: 'Info@LogixPlusSolutions.com' },
        organizationId: shop,
        allowedEmails: testers,
        testerEmails: testers,
      })
    ).toEqual({ enabled: true, reason: null, via: 'tester' });
    expect(
      await access.resolveAccess({
        user: { email: 'colleague@x.com' },
        organizationId: shop,
        allowedEmails: testers,
        testerEmails: testers,
      })
    ).toEqual({ enabled: false, reason: 'business_type' });
  });

  test('when a rollout list is set, only those logins (case-insensitive)', async () => {
    const factory = await orgWith('factory');
    const list = ['info@logixplussolutions.com'];
    expect(
      (
        await access.resolveAccess({
          user: { email: 'INFO@LogixPlusSolutions.com' },
          organizationId: factory,
          allowedEmails: list,
        })
      ).enabled
    ).toBe(true);
    expect(
      await access.resolveAccess({ user: { email: 'other@x.com' }, organizationId: factory, allowedEmails: list })
    ).toEqual({ enabled: false, reason: 'not_invited' });
  });

  test('the API gate refuses with MANUFACTURING_DISABLED, and a business-type change applies after clearing the cache', async () => {
    const orgId = await orgWith('retail');
    const run = () =>
      new Promise((resolve) => {
        access.requireManufacturingAccess({ user: { email: 'x@y.com' }, organizationId: orgId }, {}, resolve);
      });
    const err = await run();
    expect(err.statusCode).toBe(403);
    expect(err.errorCode).toBe('MANUFACTURING_DISABLED');
    await Organization.collection.updateOne({ _id: orgId }, { $set: { businessType: 'factory' } });
    expect((await run()).statusCode).toBe(403); // still cached
    access.clearAccessCache(orgId);
    // With the module open to every manufacturing org (no list in tests' env), it passes now.
    const saved = require('../../src/config/config').manufacturing.allowedEmails.splice(0);
    try {
      expect(await run()).toBeUndefined();
    } finally {
      require('../../src/config/config').manufacturing.allowedEmails.push(...saved);
    }
  });
});
