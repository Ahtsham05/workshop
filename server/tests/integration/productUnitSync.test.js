const mongoose = require('mongoose');
const { Product, ProductVariant, Bom, ProductionOrder, MaterialIssue, PackSize } = require('../../src/models');
const productService = require('../../src/services/product.service');
const { syncProductUnit } = require('../../src/services/productUnitSync.service');

/**
 * Changing a product's unit relabels the copies of it on manufacturing records — a BOM line
 * still said "pcs" after the product became "kg". Quantities never change, other products'
 * lines and other branches are left alone. Needs a replica set (the edit is a transaction).
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

const product = (name, unit, extra = {}) =>
  Product.create({ organizationId: ORG, branchId: BRANCH, name, unit, price: 1, cost: 1, stockQuantity: 0, ...extra });

const fixture = async () => {
  const calcium = await product('CALCIUM 1000 MASH', 'pcs');
  const cobalt = await product('COBALT SULPHATE', 'kg');
  const vet = await product('VET CYM T KG', 'kg');
  const variant = await ProductVariant.create({
    organizationId: ORG,
    branchId: BRANCH,
    productId: calcium._id,
    isDefault: true,
    unit: 'pcs',
    price: 1,
    cost: 1,
  });
  const line = (p, quantity) => ({ productId: p._id, productName: p.name, quantity, unit: p.unit });
  const bom = await Bom.create({
    organizationId: ORG,
    branchId: BRANCH,
    bomNumber: 'BOM-00005',
    productId: vet._id,
    productName: vet.name,
    quantity: 1,
    unit: 'kg',
    isLocked: true,
    components: [line(calcium, 0.561), line(cobalt, 0.000044)],
  });
  const order = await ProductionOrder.create({
    organizationId: ORG,
    branchId: BRANCH,
    orderNumber: 'PO-1',
    productId: vet._id,
    productName: vet.name,
    unit: 'kg',
    plannedQuantity: 10,
    materials: [
      { ...line(calcium, 5.61), baseQuantity: 5.61, requiredQuantity: 5.61 },
      { ...line(cobalt, 0.00044), baseQuantity: 0.00044, requiredQuantity: 0.00044 },
    ],
  });
  const issue = await MaterialIssue.create({
    organizationId: ORG,
    branchId: BRANCH,
    issueNumber: 'MIV-1',
    productionOrderId: order._id,
    lines: [{ ...line(calcium, 5.61), materialLineId: order.materials[0]._id, creditedQuantity: 5.61 }],
  });
  // Another branch's copy of the same name must not be touched.
  const otherBom = await Bom.create({
    organizationId: ORG,
    branchId: id(),
    bomNumber: 'BOM-X',
    productId: vet._id,
    quantity: 1,
    unit: 'kg',
    components: [{ productId: id(), quantity: 1, unit: 'pcs' }],
  });
  return { calcium, cobalt, variant, bom, order, issue, otherBom };
};

describeTx('Changing a product’s unit', () => {
  test('relabels BOM lines, order materials, vouchers and the default variant — quantities unchanged', async () => {
    const f = await fixture();
    await productService.updateProductById(f.calcium._id, { unit: 'kg' });

    const bom = await Bom.findById(f.bom._id).lean();
    expect(bom.components.map((c) => [c.productName, c.quantity, c.unit])).toEqual([
      ['CALCIUM 1000 MASH', 0.561, 'kg'],
      ['COBALT SULPHATE', 0.000044, 'kg'],
    ]);
    expect(bom.isLocked).toBe(true);
    const order = await ProductionOrder.findById(f.order._id).lean();
    expect(order.materials.map((m) => [m.requiredQuantity, m.unit])).toEqual([
      [5.61, 'kg'],
      [0.00044, 'kg'],
    ]);
    expect(order.unit).toBe('kg');
    expect((await MaterialIssue.findById(f.issue._id).lean()).lines[0].unit).toBe('kg');
    expect((await ProductVariant.findById(f.variant._id).lean()).unit).toBe('kg');
    expect((await Bom.findById(f.otherBom._id).lean()).components[0].unit).toBe('pcs');
  });

  test('a header that is the product follows it; lines of other products keep theirs', async () => {
    const f = await fixture();
    await productService.updateProductById(f.cobalt._id, { unit: 'g' });
    const bom = await Bom.findById(f.bom._id).lean();
    expect(bom.unit).toBe('kg');
    expect(bom.components.map((c) => c.unit)).toEqual(['pcs', 'g']);

    const pack = await PackSize.create({
      organizationId: ORG,
      branchId: BRANCH,
      productId: f.calcium._id,
      packProductId: f.cobalt._id,
      name: 'Bag',
      contentQuantity: 1,
      contentUnit: 'pcs',
      materials: [{ productId: f.calcium._id, quantity: 1, unit: 'pcs' }],
    });
    await productService.updateProductById(f.calcium._id, { unit: 'kg' });
    const after = await PackSize.findById(pack._id).lean();
    expect([after.contentUnit, after.materials[0].unit]).toEqual(['kg', 'kg']);
  });

  test('an edit that keeps the unit writes nothing; the repair sync is idempotent', async () => {
    const f = await fixture();
    await productService.updateProductById(f.calcium._id, { unit: 'pcs', name: 'CALCIUM 1000 MASH' });
    expect((await Bom.findById(f.bom._id).lean()).components[0].unit).toBe('pcs');

    // Stale data left from before the fix: the product is already kg, its copies are not.
    await Product.updateOne({ _id: f.calcium._id }, { unit: 'kg' });
    const stale = await Product.findById(f.calcium._id).lean();
    expect(await syncProductUnit(stale)).toBe(4); // variant, BOM, order, issue
    expect(await syncProductUnit(stale)).toBe(0);
  });

  test('a product with real variants only relabels lines without a variant', async () => {
    const shirt = await product('SHIRT', 'pcs', { hasVariants: true });
    const v = id();
    const bom = await Bom.create({
      organizationId: ORG,
      branchId: BRANCH,
      bomNumber: 'BOM-V',
      productId: id(),
      quantity: 1,
      unit: 'pcs',
      components: [
        { productId: shirt._id, quantity: 1, unit: 'pcs' },
        { productId: shirt._id, variantId: v, quantity: 1, unit: 'pcs' },
      ],
    });
    await productService.updateProductById(shirt._id, { unit: 'dozen' });
    expect((await Bom.findById(bom._id).lean()).components.map((c) => c.unit)).toEqual(['dozen', 'pcs']);
  });
});
