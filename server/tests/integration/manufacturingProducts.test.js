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

describe('products list controls: category / brand filters, select all matching, bulk brand', () => {
  const { Brand } = require('../../src/models');
  const productService = require('../../src/services/product.service');
  const mfgValidation = require('../../src/validations/manufacturing.validation');

  const brand = async (name, extra = {}) => {
    const doc = { _id: id(), organizationId: ORG, branchId: BRANCH, name, slug: name.toLowerCase(), status: 'active', ...extra };
    await Brand.collection.insertOne(doc);
    return doc;
  };

  test('category and brand filters (incl. "none") reach the list, its stats and the brand name', async () => {
    const powders = { _id: id(), name: 'Powders' };
    const acme = await brand('Acme');
    await insert('Chalk', { categories: [powders], brandId: acme._id, stockQuantity: 3 });
    await insert('Talc', { categories: [powders] });
    await insert('Bottle', { categories: [], brandId: acme._id });
    await insert('Loose', {});

    const names = async (filter) =>
      (await products.queryProducts(ctx, { ...filter, sort: 'name' }, {})).results.map((p) => p.name);
    expect(await names({ categoryId: String(powders._id) })).toEqual(['Chalk', 'Talc']);
    expect(await names({ categoryId: 'none' })).toEqual(['Bottle', 'Loose']);
    expect(await names({ brandId: String(acme._id) })).toEqual(['Bottle', 'Chalk']);
    expect(await names({ brandId: 'none' })).toEqual(['Loose', 'Talc']);
    expect(await names({ categoryId: String(powders._id), brandId: 'none' })).toEqual(['Talc']);
    expect((await products.getProductStats(ctx, { categoryId: String(powders._id) })).products).toBe(2);

    const [chalk] = (await products.queryProducts(ctx, { search: 'Chalk' }, {})).results;
    expect(chalk.brand).toEqual({ id: String(acme._id), name: 'Acme' });
    const [loose] = (await products.queryProducts(ctx, { search: 'Loose' }, {})).results;
    expect(loose.brand).toBeNull();
  });

  test('pages up to "All" rows; "select all matching" returns every id for the filter, scoped', async () => {
    await Product.collection.insertMany(
      Array.from({ length: 120 }, (_, i) => ({
        _id: id(),
        organizationId: ORG,
        branchId: BRANCH,
        name: `Item ${String(i).padStart(3, '0')}`,
        productType: i % 2 ? 'raw_material' : 'finished_good',
        stockQuantity: 0,
        createdAt: new Date(),
      }))
    );
    await insert('Other org item', { organizationId: id(), productType: 'raw_material' });

    const page = await products.queryProducts(ctx, {}, { limit: 200, page: 1 });
    expect(page.results).toHaveLength(120);
    expect(page.limit).toBe(200);
    const all = await products.queryProducts(ctx, {}, { limit: 100000 });
    expect(all.results).toHaveLength(120);
    expect(all.totalPages).toBe(1);
    expect((await products.queryProducts(ctx, {}, { limit: 999999 })).limit).toBe(100000);

    const matching = await products.matchingProductIds(ctx, { productType: 'raw_material' });
    expect(matching.total).toBe(60);
    expect(matching.results).toHaveLength(60);
    expect(matching.results.every((r) => /^Item \d{3}$/.test(r.name) && r.id)).toBe(true);

    expect(mfgValidation.getProducts.query.validate({ limit: 100000 }).error).toBeUndefined();
    expect(mfgValidation.getProducts.query.validate({ limit: 100001 }).error).toBeDefined();
    expect(mfgValidation.getProducts.query.validate({ categoryId: 'none', brandId: String(id()) }).error).toBeUndefined();
    expect(mfgValidation.getProducts.query.validate({ categoryId: 'powders' }).error).toBeDefined();
    const many = Array.from({ length: 1200 }, () => String(id()));
    expect(mfgValidation.bulkClassifyProducts.body.validate({ productIds: many, productType: 'scrap' }).error).toBeUndefined();
  });

  test('bulk classify can set procurement with the type', async () => {
    const a = await insert('A');
    const b = await insert('B', { procurementType: 'make' });
    await products.bulkClassify(ctx, { productIds: [a._id, b._id], productType: 'packaging_material', procurementType: 'buy' });
    const rows = await Product.find({ _id: { $in: [a._id, b._id] } }).lean();
    expect(rows.map((r) => [r.productType, r.procurementType])).toEqual([
      ['packaging_material', 'buy'],
      ['packaging_material', 'buy'],
    ]);
  });

  test('bulk brand sets or clears one brand, only inside the caller\'s branch', async () => {
    const acme = await brand('Acme');
    const foreign = await brand('Foreign', { organizationId: id() });
    const mine = await insert('Mine');
    const theirs = await insert('Theirs', { organizationId: id() });
    const scope = { organizationId: ORG, branchId: BRANCH };

    const res = await productService.bulkSetProductBrand({
      productIds: [String(mine._id), String(theirs._id)],
      brandId: String(acme._id),
      ...scope,
    });
    expect(res).toMatchObject({ matchedCount: 1, modifiedCount: 1, brand: { name: 'Acme' } });
    expect(String((await Product.findById(mine._id).lean()).brandId)).toBe(String(acme._id));
    expect((await Product.findById(theirs._id).lean()).brandId).toBeUndefined();

    await expect(
      productService.bulkSetProductBrand({ productIds: [String(mine._id)], brandId: String(foreign._id), ...scope })
    ).rejects.toThrow(/brand could not be found/);

    // Brands are listed org-wide, so one created in another branch of the org is accepted.
    const sister = await brand('Sister branch brand', { branchId: id() });
    await productService.bulkSetProductBrand({ productIds: [String(mine._id)], brandId: String(sister._id), ...scope });
    expect(String((await Product.findById(mine._id).lean()).brandId)).toBe(String(sister._id));

    await productService.bulkSetProductBrand({ productIds: [String(mine._id)], brandId: null, ...scope });
    expect((await Product.findById(mine._id).lean()).brandId).toBeNull();

    const v = productValidation.bulkSetProductBrand.body;
    expect(v.validate({ productIds: [String(id())], brandId: null }).error).toBeUndefined();
    expect(v.validate({ productIds: [String(id())] }).error).toBeDefined();
    expect(v.validate({ productIds: ['nope'], brandId: null }).error).toBeDefined();
  });
});

describe('deleting products: own branch only, and never one used in manufacturing', () => {
  const productService = require('../../src/services/product.service');
  const { PackSize } = require('../../src/models');
  const scope = { organizationId: ORG, branchId: BRANCH };

  test('single delete refuses a BOM component and another tenant\'s product, deletes a free one', async () => {
    const steel = await insert('Steel', { productType: 'raw_material' });
    const fan = await insert('Fan', { productType: 'finished_good' });
    const spare = await insert('Spare');
    const foreign = await insert('Foreign', { organizationId: id() });
    await manufacturing.bom.createBom(ctx, { productId: fan._id, components: [{ productId: steel._id, quantity: 2 }] });

    await expect(productService.deleteProductById(String(steel._id), scope)).rejects.toThrow(
      /"Steel" is used in a bill of materials/
    );
    await expect(productService.deleteProductById(String(fan._id), scope)).rejects.toThrow(/bill of materials/);
    await expect(productService.deleteProductById(String(foreign._id), scope)).rejects.toThrow(/not found/i);
    expect(await Product.countDocuments({ _id: { $in: [steel._id, fan._id, foreign._id] } })).toBe(3);

    const deleted = await productService.deleteProductById(String(spare._id), scope);
    expect(deleted.name).toBe('Spare');
    expect(await Product.exists({ _id: spare._id })).toBeNull();
  });

  test('bulk delete removes the free ones, keeps (and reports) used and foreign ones', async () => {
    const bulk = await insert('Bulk powder', { productType: 'finished_good' });
    const bag = await insert('1 KG Bag', { productType: 'finished_good' });
    const order = await insert('Ordered', { productType: 'finished_good' });
    const a = await insert('Free A');
    const b = await insert('Free B');
    const foreign = await insert('Foreign', { organizationId: id() });
    await PackSize.collection.insertOne({
      _id: id(), organizationId: ORG, branchId: BRANCH, productId: bulk._id, packProductId: bag._id,
      name: '1 KG', contentQuantity: 1, contentUnit: 'kg', materials: [],
    });
    await ProductionOrder.collection.insertOne({
      _id: id(), organizationId: ORG, branchId: BRANCH, orderNumber: 'PO-1', productId: order._id,
      plannedQuantity: 5, status: 'draft', materials: [],
    });

    const ids = [bulk, bag, order, a, b, foreign].map((p) => String(p._id));
    const res = await productService.bulkDeleteProductsByIds(ids, scope);
    expect(res.deleted.map((p) => p.name).sort()).toEqual(['Free A', 'Free B']);
    expect(res.notFoundIds).toEqual([String(foreign._id)]);
    expect(res.blocked.map((x) => [x.name, x.reason.match(/used in (.+?), so/)[1]]).sort()).toEqual([
      ['1 KG Bag', 'a pack size'],
      ['Bulk powder', 'a pack size'],
      ['Ordered', 'a production order'],
    ]);
    expect(await Product.countDocuments({ _id: { $in: [bulk._id, bag._id, order._id, foreign._id] } })).toBe(4);
    expect(await Product.countDocuments({ _id: { $in: [a._id, b._id] } })).toBe(0);
  });
});
