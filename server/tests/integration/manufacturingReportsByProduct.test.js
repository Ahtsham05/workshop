const mongoose = require('mongoose');
const {
  Product,
  ProductVariant,
  Inventory,
  Bom,
  ProductionOrder,
  MaterialIssue,
  ProductionReceipt,
  ProductionOutput,
  ScrapRecord,
  Batch,
  ManufacturingSettings,
  User,
} = require('../../src/models');
const manufacturing = require('../../src/services/manufacturing');
const { getReport } = require('../../src/services/manufacturing/reports.service');

/**
 * Every production report with a by-product in the picture: the by-product is made by its
 * own order (own BOM), then used as a material of a finished good. Each report must show it
 * where it belongs, and every figure must tie out — statement closing = live stock, value =
 * what the stock cost, report totals = the sum of their rows. Needs a replica set.
 */
const REPLSET_URL = process.env.MONGODB_TEST_REPLSET_URL;
const describeTx = REPLSET_URL ? describe : describe.skip;

beforeAll(async () => {
  if (REPLSET_URL) await mongoose.connect(REPLSET_URL);
  await Promise.all(
    [Bom, ProductionOrder, MaterialIssue, ProductionReceipt, ProductionOutput, ScrapRecord, Batch].map(
      (m) => REPLSET_URL && m.syncIndexes()
    )
  );
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
const USER = id();
const ctx = { organizationId: ORG, branchId: String(BRANCH), createdBy: USER };
const po = () => manufacturing.productionOrder;
const ex = () => manufacturing.execution;

const insertProduct = async (name, overrides = {}) => {
  const doc = {
    _id: id(),
    organizationId: ORG,
    branchId: BRANCH,
    name,
    price: 100,
    cost: 1,
    stockQuantity: 0,
    unit: 'kg',
    hasVariants: false,
    isActive: true,
    productType: 'raw_material',
    defaultBomId: null,
    ...overrides,
  };
  await Product.collection.insertOne(doc);
  return doc;
};

const makeOrder = async (product, quantity) => {
  const order = await po().createOrder(ctx, { productId: product._id, plannedQuantity: quantity });
  await po().changeStatus(ctx, order._id, { status: 'released' });
  return ProductionOrder.findById(order._id);
};
const issueAll = async (order) =>
  ex().issueMaterials(ctx, order._id, {
    lines: order.materials.map((m) => ({ materialLineId: m._id, quantity: m.requiredQuantity })),
  });

/**
 * Raw: base powder (cost 10/kg). By-product "Bran" = 1 kg powder per kg. Finished good
 * "Feed" = 1 kg powder + 0.5 kg bran per kg.
 */
const setup = async () => {
  await User.collection.insertOne({ _id: USER, organizationId: ORG, name: 'Supervisor', email: 'sup@example.com' });
  await ManufacturingSettings.create({ organizationId: ORG, requireQualityCheck: false });
  const powder = await insertProduct('Base powder', { cost: 10, stockQuantity: 1000 });
  const bran = await insertProduct('Bran', { cost: 0, productType: 'by_product' });
  const feed = await insertProduct('Feed', { cost: 0, productType: 'finished_good' });
  await manufacturing.bom.createBom(ctx, {
    productId: bran._id,
    components: [{ productId: powder._id, quantity: 1, unit: 'kg' }],
  });
  await manufacturing.bom.createBom(ctx, {
    productId: feed._id,
    components: [
      { productId: powder._id, quantity: 1, unit: 'kg' },
      { productId: bran._id, quantity: 0.5, unit: 'kg' },
    ],
  });
  // Bran: make 100 kg (cost 10/kg).
  const branOrder = await makeOrder(bran, 100);
  await issueAll(branOrder);
  await ex().reportOutput(ctx, branOrder._id, { producedQuantity: 100 });
  // Feed: 40 kg → 40 powder + 20 bran; make 30 now.
  const feedOrder = await makeOrder(feed, 40);
  await issueAll(feedOrder);
  await ex().reportOutput(ctx, feedOrder._id, { producedQuantity: 30 });
  return { powder, bran, feed, branOrder, feedOrder };
};

const stockOf = async (p) => (await Product.findById(p._id).lean()).stockQuantity;
const rowOf = (rows, p) => rows.find((r) => r.productId === String(p._id));

describeTx('Reports with a by-product', () => {
  test('stock statements: by-product shown, closing = live stock, valued at its stock cost', async () => {
    const { powder, bran, feed } = await setup();
    expect(await stockOf(bran)).toBe(80);
    expect(await stockOf(powder)).toBe(860);

    const fg = await getReport(ctx, 'finished-goods', {});
    const branRow = rowOf(fg.rows, bran);
    expect(branRow).toMatchObject({ productType: 'by_product', current: 80, closing: 80, opening: 0 });
    expect(branRow.movements).toMatchObject({ produced: 100, issued: -20 });
    // Bran cost 10/kg to make; its product.cost field is 0.
    expect(branRow.unitCost).toBe(10);
    expect(branRow.closingValue).toBe(800);
    const feedRow = rowOf(fg.rows, feed);
    expect(feedRow).toMatchObject({ productType: 'finished_good', closing: 30 });
    expect(feedRow.unitCost).toBeGreaterThan(0);
    expect(fg.totals.closingValue).toBe(fg.rows.reduce((s, r) => Math.round((s + r.closingValue) * 100) / 100, 0));

    const rm = await getReport(ctx, 'raw-materials', {});
    expect(rowOf(rm.rows, powder)).toMatchObject({
      closing: 860,
      opening: 1000,
      movements: expect.objectContaining({ issued: -140 }),
    });
    // Bran is also issued as a material, so it appears with what it gave to production.
    expect(rowOf(rm.rows, bran)).toMatchObject({
      closing: 80,
      movements: expect.objectContaining({ issued: -20, produced: 100 }),
    });
  });

  test('order-wise reports: the by-product order and its use as a material tie out', async () => {
    const { bran, feed, branOrder, feedOrder } = await setup();

    const prod = await getReport(ctx, 'production', {});
    expect(prod.orders.map((o) => o.productName).sort()).toEqual(['Bran', 'Feed']);
    expect(prod.totals.periodGoodValue).toBe(prod.orders.reduce((s, o) => s + o.periodGoodValue, 0));
    const branRow = prod.orders.find((o) => o.id === String(branOrder._id));
    expect(branRow).toMatchObject({ productType: 'by_product', good: 100, balance: 0, finishedValue: 1000 });

    const cons = await getReport(ctx, 'material-consumption', {});
    const branMat = cons.materials.find((m) => m.productId === String(bran._id));
    expect(branMat).toMatchObject({ issued: 20, used: 15, inFactory: 5 });

    const issues = await getReport(ctx, 'material-issues', {});
    expect(issues.byMaterial.find((m) => m.productId === String(bran._id))).toMatchObject({
      issuedQty: 20,
      issuedValue: 200,
    });

    const register = await getReport(ctx, 'stock-register', { productId: String(bran._id) });
    expect(register.rows.map((r) => [r.source, r.in, r.out])).toEqual([
      ['produced', 100, 0],
      ['issued', 0, 20],
    ]);
    expect(register.closing).toBe(80);

    const batch = await getReport(ctx, 'batch', { productionOrderId: String(feedOrder._id) });
    expect(batch.materials.map((m) => m.productName)).toEqual(['Base powder', 'Bran']);

    const inProc = await getReport(ctx, 'in-process', {});
    const daily = await getReport(ctx, 'daily', {});
    expect(daily.closingWip).toBe(inProc.totals.wipValue);

    const reg = await getReport(ctx, 'product-production', { productIds: String(bran._id) });
    expect(reg.options.map((o) => o.name)).toEqual(expect.arrayContaining(['Bran', 'Feed']));
    expect(feed).toBeTruthy();
    // Feed carries the bran it used at bran's production cost: 1 × 10 + 0.5 × 10 per kg.
    expect(prod.orders.find((o) => o.id === String(feedOrder._id))).toMatchObject({
      productType: 'finished_good',
      unitCost: 15,
    });
  });

  test('packing used from production stock at receipt: in the batch materials, not off the WIP balance', async () => {
    const { feed, feedOrder } = await setup();
    const bag = await insertProduct('Feed bag', {
      unit: 'pcs',
      cost: 2,
      stockQuantity: 100,
      productType: 'packaging_material',
    });
    await manufacturing.floorStock.setIssueMethod(ctx, { productIds: [bag._id], issueMethod: 'floor' });
    await manufacturing.floorStock.postIssue(ctx, { lines: [{ productId: bag._id, quantity: 50 }] });
    await ex().reportOutput(ctx, feedOrder._id, {
      producedQuantity: 10,
      floorUsage: [{ productId: bag._id, quantity: 10 }],
    });

    const batch = await getReport(ctx, 'batch', { productionOrderId: String(feedOrder._id) });
    const bagLine = batch.materials.find((m) => m.productName === 'Feed bag');
    expect(bagLine).toMatchObject({ extra: true, issued: 10, used: 10, usedValue: 20, inFactory: 0 });
    // Every material the output took is listed: their used value is what the output cost.
    const outputs = await ProductionOutput.find({ productionOrderId: feedOrder._id }).lean();
    const outputCost = outputs.reduce((s, o) => s + o.materialCost, 0);
    expect(batch.costs.usedValue).toBeCloseTo(outputCost, 2);

    const cons = await getReport(ctx, 'material-consumption', {});
    expect(cons.materials.find((m) => m.productName === 'Feed bag')).toMatchObject({ used: 10, usedValue: 20 });

    // Date-wise WIP: nothing on the floor before any activity, and closing = in-process now.
    const daily = await getReport(ctx, 'daily', {});
    const inProc = await getReport(ctx, 'in-process', {});
    expect(daily.openingWip).toBe(0);
    expect(daily.closingWip).toBe(inProc.totals.wipValue);
    expect(daily.totals.floorUsed).toBe(20);

    const fg = await getReport(ctx, 'finished-goods', {});
    expect(rowOf(fg.rows, feed)).toMatchObject({ closing: 40, current: 40 });
  });

  test('a batch-tracked by-product: batch stock lists it as made here, statement values its batches', async () => {
    await User.collection.insertOne({ _id: USER, organizationId: ORG, name: 'Supervisor', email: 'sup@example.com' });
    await ManufacturingSettings.create({ organizationId: ORG, requireQualityCheck: false });
    const powder = await insertProduct('Base powder', { cost: 10, stockQuantity: 1000 });
    const bran = await insertProduct('Bran', { cost: 0, productType: 'by_product' });
    const [variant] = await ProductVariant.create([
      {
        organizationId: ORG,
        branchId: BRANCH,
        productId: bran._id,
        isDefault: true,
        unit: 'kg',
        price: 1,
        cost: 0,
        trackBatch: true,
      },
    ]);
    await Inventory.create([
      { organizationId: ORG, branchId: BRANCH, productId: bran._id, variantId: variant._id, quantity: 0 },
    ]);
    await manufacturing.bom.createBom(ctx, {
      productId: bran._id,
      components: [{ productId: powder._id, quantity: 2, unit: 'kg' }],
    });
    const order = await makeOrder(bran, 50);
    await issueAll(order);
    await ex().reportOutput(ctx, order._id, { producedQuantity: 50 });

    const lots = await getReport(ctx, 'batch-stock', { kind: 'finished' });
    expect(lots.rows).toHaveLength(1);
    expect(lots.rows[0]).toMatchObject({
      productName: 'Bran',
      productType: 'by_product',
      quantity: 50,
      unitCost: 20,
      value: 1000,
    });

    const fg = await getReport(ctx, 'finished-goods', {});
    expect(rowOf(fg.rows, bran)).toMatchObject({ closing: 50, unitCost: 20, closingValue: 1000 });
    expect(fg.totals.closingValue).toBe(lots.totals.value);
  });
});
