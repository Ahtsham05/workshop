const mongoose = require('mongoose');
const setupTestDB = require('../../utils/setupTestDB');
const { Branch, MasterProduct, Product } = require('../../../src/models');
const masterProductService = require('../../../src/services/masterProduct.service');
const { findBestMatch } = require('../../../src/utils/productMatchKey');

/**
 * Linking products to the shared catalog (MasterProduct) — the step every "Import from
 * other branches" and "Sync Across Branches" request depends on. A product that fails to
 * link is invisible to both features until a heal pass links it, and every such request
 * pays for that heal pass, so linking must succeed the first time.
 */
setupTestDB();
jest.setTimeout(60000);

const organizationId = new mongoose.Types.ObjectId();
const createdBy = new mongoose.Types.ObjectId();
let branch;

beforeEach(async () => {
  branch = await Branch.create({ organizationId, name: 'Main Branch' });
});

// The Add Product form always sends `images` (an empty list when there is no photo), which
// makes the product's save hook clear `image` — the state every photo-less product is in.
const saveLikeTheProductForm = (overrides = {}) =>
  Product.create({
    organizationId,
    branchId: branch._id,
    createdBy,
    name: 'Tea Pack',
    price: 150,
    cost: 100,
    stockQuantity: 0,
    images: [],
    ...overrides,
  });

describe('linking a product saved without a photo', () => {
  test('links it to a new catalog entry', async () => {
    const product = await saveLikeTheProductForm({ barcode: 'T-1' });

    await masterProductService.linkProductToMasterProduct(product);

    const stored = await Product.findById(product._id).lean();
    expect(stored.masterProductId).toBeTruthy();
    const master = await MasterProduct.findById(stored.masterProductId).lean();
    expect(master).toMatchObject({ name: 'Tea Pack', barcode: 'T-1' });
    expect(master.image?.url).toBeUndefined();
  });

  test('the bulk linker (used by the heal pass) links it too', async () => {
    const product = await saveLikeTheProductForm();

    await masterProductService.linkProductsToMasterProductsBulk([await Product.findById(product._id)]);

    expect((await Product.findById(product._id).lean()).masterProductId).toBeTruthy();
  });

  test('a product with a photo carries the photo into the catalog entry', async () => {
    const photo = { url: 'https://img.example/tea.jpg', publicId: 'tea' };
    const product = await saveLikeTheProductForm({ images: [photo] });

    await masterProductService.linkProductToMasterProduct(product);

    const master = await MasterProduct.findById((await Product.findById(product._id)).masterProductId).lean();
    expect(master.image).toMatchObject(photo);
  });
});

describe('resolveMasterForNewProduct (a product about to be created)', () => {
  const draft = (fields) => new Product({ organizationId, branchId: branch._id, createdBy, price: 10, cost: 5, stockQuantity: 0, images: [], ...fields });

  test('creates a catalog entry carrying the tracking the new product will have', async () => {
    const id = await masterProductService.resolveMasterForNewProduct(draft({ name: 'Syrup' }), { trackBatch: true, trackExpiry: true });

    expect(await MasterProduct.findById(id).lean()).toMatchObject({ name: 'Syrup', trackBatch: true, trackExpiry: true });
  });

  test('reuses the entry that has the same barcode, even when another entry has the same name', async () => {
    const byName = await MasterProduct.create({ organizationId, name: 'Syrup' });
    const byBarcode = await MasterProduct.create({ organizationId, name: 'Cough Syrup 100ml', barcode: 'S-1' });

    const id = await masterProductService.resolveMasterForNewProduct(draft({ name: 'Syrup', barcode: 'S-1' }));

    expect(String(id)).toBe(String(byBarcode._id));
    expect(String(id)).not.toBe(String(byName._id));
    expect(await MasterProduct.countDocuments()).toBe(2);
  });

  test('reuses a same-name entry case-insensitively when nothing has the barcode', async () => {
    const existing = await MasterProduct.create({ organizationId, name: 'syrup' });

    const id = await masterProductService.resolveMasterForNewProduct(draft({ name: 'SYRUP', barcode: 'NEW-1' }));

    expect(String(id)).toBe(String(existing._id));
  });

  test('never throws — returns null so the product is still created (and healed later)', async () => {
    const spy = jest.spyOn(MasterProduct, 'find').mockImplementation(() => {
      throw new Error('database unavailable');
    });
    try {
      await expect(masterProductService.resolveMasterForNewProduct(draft({ name: 'Syrup', barcode: 'X' }))).resolves.toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('findBestMatch', () => {
  test('prefers the barcode match over an OLDER same-name match, in one query', async () => {
    const olderSameName = await MasterProduct.create({ organizationId, name: 'Cola' });
    const sameBarcode = await MasterProduct.create({ organizationId, name: 'Cola 1.5L', barcode: 'C-1' });
    const spy = jest.spyOn(MasterProduct, 'find');

    const match = await findBestMatch({ Model: MasterProduct, scope: { organizationId }, product: { name: 'Cola', barcode: 'C-1' } });

    expect(String(match._id)).toBe(String(sameBarcode._id));
    expect(String(match._id)).not.toBe(String(olderSameName._id));
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test('falls back to the name, and returns null when nothing matches', async () => {
    const cola = await MasterProduct.create({ organizationId, name: 'Cola' });

    expect(String((await findBestMatch({ Model: MasterProduct, scope: { organizationId }, product: { name: 'cola', barcode: 'NONE' } }))._id)).toBe(
      String(cola._id)
    );
    expect(await findBestMatch({ Model: MasterProduct, scope: { organizationId }, product: { name: 'Fanta', barcode: 'NONE' } })).toBeNull();
    expect(await findBestMatch({ Model: MasterProduct, scope: { organizationId }, product: { name: 'Fanta' } })).toBeNull();
  });

  test('with an SKU as a second code: barcode first, then SKU, then name', async () => {
    const scope = { organizationId, branchId: branch._id };
    const byName = await Product.create({ ...scope, name: '5v', price: 1, cost: 1, stockQuantity: 0 });
    const bySku = await Product.create({ ...scope, name: '5v (old name)', sku: 'SKU-JKGFO', price: 1, cost: 1, stockQuantity: 0 });
    const byBarcode = await Product.create({ ...scope, name: 'Other', barcode: '890', price: 1, cost: 1, stockQuantity: 0 });
    const find = (product) => findBestMatch({ Model: Product, scope, product, codeFields: ['barcode', 'sku'] });

    expect(String((await find({ name: '5v', sku: 'SKU-JKGFO' }))._id)).toBe(String(bySku._id));
    expect(String((await find({ name: '5v', sku: 'SKU-JKGFO', barcode: '890' }))._id)).toBe(String(byBarcode._id));
    expect(String((await find({ name: '5v', sku: 'NOT-HERE' }))._id)).toBe(String(byName._id));
    // Without asking for SKU matching, the SKU is ignored (MasterProduct has no SKU).
    expect(String((await findBestMatch({ Model: Product, scope, product: { name: '5v', sku: 'SKU-JKGFO' } }))._id)).toBe(String(byName._id));
  });

  test('never matches across organizations', async () => {
    await MasterProduct.create({ organizationId: new mongoose.Types.ObjectId(), name: 'Cola', barcode: 'C-1' });

    expect(await findBestMatch({ Model: MasterProduct, scope: { organizationId }, product: { name: 'Cola', barcode: 'C-1' } })).toBeNull();
  });
});
