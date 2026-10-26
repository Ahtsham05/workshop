const mongoose = require('mongoose');
const { Product, ProductVariant, Inventory, InventoryTransaction, Batch } = require('../../src/models');
const productService = require('../../src/services/product.service');

/**
 * Editing the stock of a batch-tracked product: Product.stockQuantity, the default
 * variant's Inventory row and its batches must end up agreeing — more stock goes into a
 * batch, less comes out earliest expiry first. Needs a replica set (the edit is a transaction).
 */
const REPLSET_URL = process.env.MONGODB_TEST_REPLSET_URL;
const describeTx = REPLSET_URL ? describe : describe.skip;

beforeAll(async () => {
  if (REPLSET_URL) await mongoose.connect(REPLSET_URL);
});
beforeEach(async () => {
  if (!REPLSET_URL) return;
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
});
afterAll(async () => {
  if (!REPLSET_URL) return;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
jest.setTimeout(60000);

const id = () => new mongoose.Types.ObjectId();
const ORG = id();
const BRANCH = id();

/** A simple product with batch tracking on its default variant, as the app leaves it. */
const trackedProduct = async ({ stock = 0, inventory = 0, batches = [] } = {}) => {
  const product = await Product.create({
    organizationId: ORG,
    branchId: BRANCH,
    name: `APPLE GREEN COLOR ${Math.random()}`,
    price: 2,
    cost: 1,
    stockQuantity: stock,
    unit: 'kg',
  });
  const variant = await ProductVariant.create({
    organizationId: ORG,
    branchId: BRANCH,
    productId: product._id,
    isDefault: true,
    unit: 'kg',
    price: 2,
    cost: 1,
    trackBatch: true,
  });
  const inv = await Inventory.create({ organizationId: ORG, branchId: BRANCH, productId: product._id, variantId: variant._id, quantity: inventory });
  await Promise.all(
    batches.map((b) => Batch.create({ organizationId: ORG, inventoryId: inv._id, status: 'active', costPerUnit: 1, ...b }))
  );
  return { product, variant, inv };
};

const state = async ({ product, inv }) => {
  const p = await Product.findById(product._id).lean();
  const i = await Inventory.findById(inv._id).lean();
  const b = await Batch.find({ inventoryId: inv._id }).sort({ batchNumber: 1 }).lean();
  return {
    product: p.stockQuantity,
    inventory: i.quantity,
    batches: b.map((x) => [x.batchNumber, x.quantity, x.status]),
  };
};

describeTx('Editing a batch-tracked product’s stock', () => {
  test('raising the stock puts the difference into the named batch', async () => {
    const t = await trackedProduct();
    await productService.updateProductById(t.product._id, { stockQuantity: 1000, batchNumber: 'B-001' });
    expect(await state(t)).toEqual({ product: 1000, inventory: 1000, batches: [['B-001', 1000, 'active']] });
    const rows = await InventoryTransaction.find({ inventoryId: t.inv._id }).lean();
    expect(rows.map((r) => [r.type, r.quantityDelta, r.balanceAfter, r.refType])).toEqual([['adjustment', 1000, 1000, 'ProductEdit']]);

    // The same batch number again tops that batch up.
    await productService.updateProductById(t.product._id, { stockQuantity: 1200, batchNumber: 'B-001' });
    expect(await state(t)).toEqual({ product: 1200, inventory: 1200, batches: [['B-001', 1200, 'active']] });
  });

  test('the broken state (1,000 on the product, nothing in inventory or batches) heals on the next save', async () => {
    const t = await trackedProduct({ stock: 1000, inventory: 0 });
    await productService.updateProductById(t.product._id, { name: 'APPLE GREEN COLOR', stockQuantity: 1000 });
    const s = await state(t);
    expect(s.product).toBe(1000);
    expect(s.inventory).toBe(1000);
    expect(s.batches).toHaveLength(1);
    expect(s.batches[0][0]).toMatch(/^ADJ-\d{6}-\d{4}$/);
    expect(s.batches[0][1]).toBe(1000);
  });

  test('lowering the stock takes it out of the batches, earliest expiry first (no-expiry last)', async () => {
    const t = await trackedProduct({
      stock: 1000,
      inventory: 1000,
      batches: [
        { batchNumber: 'A-NOEXP', quantity: 500, expiryDate: null },
        { batchNumber: 'B-LATE', quantity: 300, expiryDate: new Date('2027-06-01') },
        { batchNumber: 'C-EARLY', quantity: 200, expiryDate: new Date('2027-01-01') },
      ],
    });
    await productService.updateProductById(t.product._id, { stockQuantity: 600 });
    expect(await state(t)).toEqual({
      product: 600,
      inventory: 600,
      batches: [
        ['A-NOEXP', 500, 'active'],
        ['B-LATE', 100, 'active'],
        ['C-EARLY', 0, 'depleted'],
      ],
    });
  });

  test('stock in inventory that no batch holds is put into a batch', async () => {
    const t = await trackedProduct({ stock: 500, inventory: 500, batches: [{ batchNumber: 'B-1', quantity: 200 }] });
    await productService.updateProductById(t.product._id, { stockQuantity: 500, batchNumber: 'B-2' });
    expect(await state(t)).toEqual({
      product: 500,
      inventory: 500,
      batches: [
        ['B-1', 200, 'active'],
        ['B-2', 300, 'active'],
      ],
    });
    // Inventory did not move, so no ledger row.
    expect(await InventoryTransaction.countDocuments({ inventoryId: t.inv._id })).toBe(0);
  });

  test('bulk stock edits follow the same rule; untracked products are left alone', async () => {
    const t = await trackedProduct({ stock: 0 });
    const plain = await Product.create({ organizationId: ORG, branchId: BRANCH, name: 'Plain', price: 1, cost: 1, stockQuantity: 5 });
    await productService.bulkUpdateProducts([
      { id: String(t.product._id), stockQuantity: 40 },
      { id: String(plain._id), stockQuantity: 9 },
    ]);
    const s = await state(t);
    expect(s.inventory).toBe(40);
    expect(s.batches[0][1]).toBe(40);
    expect((await Product.findById(plain._id).lean()).stockQuantity).toBe(9);
    expect(await Batch.countDocuments({ inventoryId: { $ne: t.inv._id } })).toBe(0);
  });

  test('the edit form is told how much the batches hold', async () => {
    const t = await trackedProduct({ stock: 1000, inventory: 1000, batches: [{ batchNumber: 'B-1', quantity: 700 }] });
    const forEdit = await productService.getProductForEdit(t.product._id);
    expect(forEdit).toMatchObject({ trackBatch: true, batchedQuantity: 700, batchCount: 1 });
  });
});
