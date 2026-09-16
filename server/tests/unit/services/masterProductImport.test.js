const mongoose = require('mongoose');
const setupTestDB = require('../../utils/setupTestDB');
const {
  Branch,
  Category,
  Inventory,
  MasterProduct,
  MasterProductVariant,
  Product,
  ProductVariant,
} = require('../../../src/models');
const masterProductService = require('../../../src/services/masterProduct.service');

/**
 * "Import from other branches", end-to-end against real (in-memory Mongo) documents.
 *
 * Covers what users actually hit: the importable list, importing hundreds of products in
 * one go without a round trip per product, the Active/Inactive choice, barcodes, tracked
 * products, variant products, and a bad product failing on its own instead of sinking the
 * batch. Tracked opening stock runs in a transaction, which this standalone in-memory
 * server can't host (see tests/utils/setupTestDB.js) — only its validation is covered here.
 */
setupTestDB();
jest.setTimeout(60000);

const organizationId = new mongoose.Types.ObjectId();
const createdBy = new mongoose.Types.ObjectId();
let source;
let target;

const createSourceProduct = (overrides = {}) =>
  Product.create({
    organizationId,
    branchId: source._id,
    createdBy,
    price: 150,
    cost: 100,
    stockQuantity: 5,
    ...overrides,
  });

const importItems = (items, options = {}) =>
  masterProductService.importMasterProducts({ organizationId, branchId: target._id, createdBy, items, ...options });

beforeEach(async () => {
  [source, target] = await Branch.create([
    { organizationId, name: 'Main Branch' },
    { organizationId, name: 'City Branch' },
  ]);
});

describe('getImportableMasterProducts', () => {
  test('links never-linked products on demand and lists only what the branch does not carry', async () => {
    await createSourceProduct({ name: 'Zinger Burger', barcode: 'B-1' });
    await createSourceProduct({ name: 'apple juice' });
    await createSourceProduct({ name: 'Cola', barcode: 'B-3' });

    const first = await masterProductService.getImportableMasterProducts({ organizationId, branchId: target._id, limit: 50 });
    expect(first.totalResults).toBe(3);
    // Case-insensitive name order, whatever order they were created in.
    expect(first.results.map((r) => r.name)).toEqual(['apple juice', 'Cola', 'Zinger Burger']);
    expect(first.results[0]).toMatchObject({ carriedAtBranches: ['Main Branch'], suggestedPrice: 150, suggestedCost: 100, acceptsOpeningStock: true });
    expect(await Product.countDocuments({ organizationId, masterProductId: null })).toBe(0);

    await importItems([{ masterProductId: first.results[1].masterProductId }]);
    const after = await masterProductService.getImportableMasterProducts({ organizationId, branchId: target._id, limit: 50 });
    expect(after.results.map((r) => r.name)).toEqual(['apple juice', 'Zinger Burger']);
  });

  test('searches name, barcode and branch name, and pages the result', async () => {
    await Promise.all(Array.from({ length: 12 }, (_, i) => createSourceProduct({ name: `Item ${i + 1}`, barcode: `CODE-${i + 1}` })));

    const page2 = await masterProductService.getImportableMasterProducts({ organizationId, branchId: target._id, page: 2, limit: 5 });
    expect(page2).toMatchObject({ page: 2, totalPages: 3, totalResults: 12 });
    expect(page2.results.map((r) => r.name)).toEqual(['Item 6', 'Item 7', 'Item 8', 'Item 9', 'Item 10']);

    const byBarcode = await masterProductService.getImportableMasterProducts({ organizationId, branchId: target._id, search: 'code-12', limit: 5 });
    expect(byBarcode.results.map((r) => r.name)).toEqual(['Item 12']);

    const byBranch = await masterProductService.getImportableMasterProductIds({ organizationId, branchId: target._id, search: 'main' });
    expect(byBranch.totalResults).toBe(12);
    expect(byBranch.ids).toHaveLength(12);
  });

  test('a multi-variant product does not accept one opening quantity', async () => {
    const master = await MasterProduct.create({ organizationId, name: 'T-Shirt', hasVariants: true, defaultPrice: 50, defaultCost: 30 });
    await MasterProductVariant.create([
      { organizationId, masterProductId: master._id, attributes: { Size: 'S' } },
      { organizationId, masterProductId: master._id, attributes: { Size: 'M' } },
    ]);
    await createSourceProduct({ name: 'T-Shirt', hasVariants: true, masterProductId: master._id });

    const { results } = await masterProductService.getImportableMasterProducts({ organizationId, branchId: target._id, limit: 50 });
    expect(results[0]).toMatchObject({ hasVariants: true, variantCount: 2, acceptsOpeningStock: false });
  });
});

describe('importMasterProducts', () => {
  const listIds = async () => (await masterProductService.getImportableMasterProductIds({ organizationId, branchId: target._id })).ids;

  test('imports as inactive by default, or active when asked', async () => {
    await createSourceProduct({ name: 'Tea', barcode: 'TEA' });
    await createSourceProduct({ name: 'Milk' });
    const [milkId, teaId] = await listIds();

    await importItems([{ masterProductId: milkId }]);
    await importItems([{ masterProductId: teaId }], { activate: true });

    const milk = await Product.findOne({ branchId: target._id, name: 'Milk' }).lean();
    const tea = await Product.findOne({ branchId: target._id, name: 'Tea' }).lean();
    expect(milk.isActive).toBe(false);
    expect(tea.isActive).toBe(true);
  });

  test('copies the product with its barcode, suggested price, category and default variant', async () => {
    const [fruit] = await Category.create([{ organizationId, branchId: source._id, name: 'Fruit' }]);
    await createSourceProduct({
      name: 'Mango',
      barcode: 'MANGO-1',
      unit: 'kg',
      category: 'Fruit',
      categories: [{ _id: fruit._id, name: 'Fruit' }],
    });
    const [id] = await listIds();

    const result = await importItems([{ masterProductId: id, price: 175, stockQuantity: 12 }], { activate: true });
    expect(result).toEqual({ importedCount: 1, alreadyImportedCount: 0, failedCount: 0, failed: [] });

    const mango = await Product.findOne({ branchId: target._id }).lean();
    expect(mango).toMatchObject({ name: 'Mango', barcode: 'MANGO-1', unit: 'kg', price: 175, cost: 100, stockQuantity: 12, isActive: true });
    expect(String(mango.masterProductId)).toBe(id);

    // The category is re-pointed at a real Category document of the destination branch.
    const targetFruit = await Category.findOne({ branchId: target._id, name: 'Fruit' }).lean();
    expect(String(mango.categories[0]._id)).toBe(String(targetFruit._id));

    const variants = await ProductVariant.find({ productId: mango._id }).lean();
    expect(variants).toHaveLength(1);
    expect(variants[0]).toMatchObject({ isDefault: true, price: 175, cost: 100, trackBatch: false });
  });

  test('batch-tracked product with no opening stock keeps its tracking flags', async () => {
    const master = await MasterProduct.create({ organizationId, name: 'Syrup', trackBatch: true, trackExpiry: true, defaultPrice: 90, defaultCost: 60 });
    await createSourceProduct({ name: 'Syrup', masterProductId: master._id });

    const result = await importItems([{ masterProductId: String(master._id) }]);
    expect(result.importedCount).toBe(1);

    const syrup = await Product.findOne({ branchId: target._id }).lean();
    const variant = await ProductVariant.findOne({ productId: syrup._id }).lean();
    expect(variant).toMatchObject({ isDefault: true, trackBatch: true, trackExpiry: true });
    const inventory = await Inventory.findOne({ variantId: variant._id }).lean();
    expect(inventory.quantity).toBe(0);
  });

  test('a barcode already used at this branch is left off instead of failing the import', async () => {
    await createSourceProduct({ name: 'Soap', barcode: 'SHARED' });
    const [id] = await listIds();
    await Product.create({ organizationId, branchId: target._id, name: 'Local Soap', barcode: 'SHARED', price: 1, cost: 1, stockQuantity: 0 });

    const result = await importItems([{ masterProductId: id }]);
    expect(result.importedCount).toBe(1);
    const soap = await Product.findOne({ branchId: target._id, name: 'Soap' }).lean();
    expect(soap.barcode).toBeUndefined();
  });

  test('a barcode taken mid-import (after the up-front check) is retried without it', async () => {
    await createSourceProduct({ name: 'Oil', barcode: 'RACE' });
    await createSourceProduct({ name: 'Salt', barcode: 'SALT' });
    const ids = await listIds();

    // Another request takes the barcode between the check and the insert — the database's
    // real partial-failure error is what the import has to cope with here.
    const insertMany = Product.insertMany.bind(Product);
    const spy = jest.spyOn(Product, 'insertMany').mockImplementationOnce(async (...args) => {
      await Product.collection.insertOne({ organizationId, branchId: target._id, name: 'Racer', barcode: 'RACE', price: 1, cost: 1, stockQuantity: 0 });
      return insertMany(...args);
    });

    const result = await importItems(ids.map((masterProductId) => ({ masterProductId })));
    spy.mockRestore();

    expect(result).toMatchObject({ importedCount: 2, failedCount: 0 });
    const oil = await Product.findOne({ branchId: target._id, name: 'Oil' }).lean();
    const salt = await Product.findOne({ branchId: target._id, name: 'Salt' }).lean();
    expect(oil.barcode).toBeUndefined();
    expect(salt.barcode).toBe('SALT');
    expect(await ProductVariant.countDocuments({ productId: { $in: [oil._id, salt._id] } })).toBe(2);
  });

  test('a product missing required opening-stock details fails alone', async () => {
    const tracked = await MasterProduct.create({ organizationId, name: 'Vaccine', trackBatch: true });
    const phone = await MasterProduct.create({ organizationId, name: 'Phone', trackImei: true });
    await createSourceProduct({ name: 'Vaccine', masterProductId: tracked._id });
    await createSourceProduct({ name: 'Phone', masterProductId: phone._id });
    await createSourceProduct({ name: 'Bread' });
    const breadId = (await listIds()).find((id) => ![String(tracked._id), String(phone._id)].includes(id));
    const gone = new mongoose.Types.ObjectId();

    const result = await importItems([
      { masterProductId: String(tracked._id), stockQuantity: 10 },
      { masterProductId: String(phone._id), stockQuantity: 2, imeis: ['111111111111111'] },
      { masterProductId: String(gone) },
      { masterProductId: breadId },
    ]);

    expect(result.importedCount).toBe(1);
    expect(result.failed).toEqual([
      { masterProductId: String(gone), name: null, error: 'This product is no longer available to import' },
      { masterProductId: String(tracked._id), name: 'Vaccine', error: 'Enter a batch number for the opening stock' },
      { masterProductId: String(phone._id), name: 'Phone', error: 'Enter exactly 2 IMEI number(s) for the opening stock — 1 entered' },
    ]);
    expect(await Product.countDocuments({ branchId: target._id })).toBe(1);
  });

  test('importing again is safe — already-imported products are counted, not duplicated', async () => {
    await createSourceProduct({ name: 'Rice' });
    const [id] = await listIds();

    await importItems([{ masterProductId: id }]);
    const again = await importItems([{ masterProductId: id }, { masterProductId: id }]);

    expect(again).toMatchObject({ importedCount: 0, alreadyImportedCount: 1, failedCount: 0 });
    expect(await Product.countDocuments({ branchId: target._id })).toBe(1);
  });

  test('a variant product gets every variant, with a SKU taken here dropped', async () => {
    const master = await MasterProduct.create({ organizationId, name: 'Jeans', hasVariants: true, defaultPrice: 40, defaultCost: 20 });
    await MasterProductVariant.create([
      { organizationId, masterProductId: master._id, sku: 'JEANS-30', attributes: { Waist: '30' }, defaultPrice: 45 },
      { organizationId, masterProductId: master._id, sku: 'JEANS-32', attributes: { Waist: '32' } },
    ]);
    await createSourceProduct({ name: 'Jeans', hasVariants: true, masterProductId: master._id });
    await ProductVariant.create({ organizationId, branchId: target._id, productId: new mongoose.Types.ObjectId(), sku: 'JEANS-32', price: 1, cost: 1 });

    // Opening quantity is ignored for a multi-variant product.
    const result = await importItems([{ masterProductId: String(master._id), stockQuantity: 9 }]);
    expect(result.importedCount).toBe(1);

    const jeans = await Product.findOne({ branchId: target._id, name: 'Jeans' }).lean();
    expect(jeans.stockQuantity).toBe(0);
    const variants = await ProductVariant.find({ productId: jeans._id }).sort({ price: -1 }).lean();
    expect(variants.map((v) => [v.sku, v.price, v.isDefault])).toEqual([
      ['JEANS-30', 45, false],
      [undefined, 40, false],
    ]);
    const inventory = await Inventory.find({ productId: jeans._id }).lean();
    expect(inventory.map((i) => i.quantity)).toEqual([0, 0]);
  });

  test('hundreds of products take a fixed number of database calls, not a few per product', async () => {
    const COUNT = 400;
    await Product.insertMany(
      Array.from({ length: COUNT }, (_, i) => ({
        organizationId,
        branchId: source._id,
        name: `Bulk Product ${i}`,
        barcode: `BULK-${i}`,
        price: 10 + i,
        cost: 5 + i,
        stockQuantity: 3,
      })),
    );
    const ids = await listIds();
    expect(ids).toHaveLength(COUNT);

    const calls = [];
    mongoose.set('debug', (collection, method) => calls.push(`${collection}.${method}`));
    const started = Date.now();
    let result;
    try {
      result = await importItems(ids.map((masterProductId) => ({ masterProductId, stockQuantity: 2 })), { activate: true });
    } finally {
      mongoose.set('debug', false);
    }
    const elapsed = Date.now() - started;

    expect(result).toMatchObject({ importedCount: COUNT, failedCount: 0 });
    expect(await Product.countDocuments({ branchId: target._id, isActive: true })).toBe(COUNT);
    expect(await ProductVariant.countDocuments({ branchId: target._id, isDefault: true })).toBe(COUNT);
    // The old per-product path made ~6 calls per product (2400+ here).
    expect(calls.length).toBeLessThan(20);
    // eslint-disable-next-line no-console
    console.log(`Imported ${COUNT} products in ${elapsed}ms using ${calls.length} database calls`);
  });
});
