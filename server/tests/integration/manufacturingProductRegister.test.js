const mongoose = require('mongoose');
const {
  Product,
  Bom,
  ProductionOrder,
  MaterialIssue,
  ProductionReceipt,
  ProductionOutput,
  ScrapRecord,
  ManufacturingSettings,
  PackSize,
  PackingVoucher,
  User,
  ProductVariant,
  Inventory,
  Batch,
} = require('../../src/models');
const manufacturing = require('../../src/services/manufacturing');
const { unitWeight, parsePackWeights } = require('../../src/services/manufacturing/productProductionReport.service');

/**
 * Product-wise production register (report 'product-production'): each product day by day
 * in kg — stock batches issued from, KG, by-products, finished packs weighed, and the running
 * "remaining in process". Needs a replica set (issues and receipts are transactions).
 */
const REPLSET_URL = process.env.MONGODB_TEST_REPLSET_URL;
const describeTx = REPLSET_URL ? describe : describe.skip;

beforeAll(async () => {
  if (REPLSET_URL) await mongoose.connect(REPLSET_URL);
  await Promise.all(
    [
      Bom,
      ProductionOrder,
      MaterialIssue,
      ProductionReceipt,
      ProductionOutput,
      ScrapRecord,
      PackSize,
      PackingVoucher,
      Batch,
    ].map((m) => REPLSET_URL && m.syncIndexes())
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
const report = (q) => manufacturing.reports.getReport(ctx, 'product-production', q);
/** The one register of a single product, or of products added up with combine. */
const register = async (q) => {
  const res = await report(q);
  expect(res.registers).toHaveLength(1);
  return res.registers[0];
};
/** 10:00 Pakistan time on a calendar day. */
const at = (day) => new Date(`${day}T05:00:00.000Z`);

const insertProduct = async (name, overrides = {}) => {
  const doc = {
    _id: id(),
    organizationId: ORG,
    branchId: BRANCH,
    name,
    price: 100,
    cost: 1,
    stockQuantity: 0,
    unit: 'pcs',
    hasVariants: false,
    isActive: true,
    productType: 'raw_material',
    defaultBomId: null,
    ...overrides,
  };
  await Product.collection.insertOne(doc);
  return doc;
};

const release = async (productId, quantity) => {
  const order = await po().createOrder(ctx, { productId, plannedQuantity: quantity });
  await po().changeStatus(ctx, order._id, { status: 'released' });
  return ProductionOrder.findById(order._id);
};
/** Make a product batch-tracked with these stock batches (lots); batch number → id. */
const withLots = async (product, lots) => {
  const [variant] = await ProductVariant.create([
    {
      organizationId: ORG,
      branchId: BRANCH,
      productId: product._id,
      isDefault: true,
      unit: product.unit,
      price: 1,
      cost: 1,
      trackBatch: true,
    },
  ]);
  const total = lots.reduce((s, b) => s + b.quantity, 0);
  const [inventory] = await Inventory.create([
    { organizationId: ORG, branchId: BRANCH, productId: product._id, variantId: variant._id, quantity: total },
  ]);
  const created = await Batch.create(
    lots.map((b) => ({ organizationId: ORG, inventoryId: inventory._id, costPerUnit: 1, ...b }))
  );
  await Product.updateOne({ _id: product._id }, { $set: { stockQuantity: total } });
  return Object.fromEntries(created.map((b) => [b.batchNumber, String(b._id)]));
};
const lineOf = (order, product) => order.materials.find((m) => String(m.productId) === String(product._id))._id;
const issue = async (order, lines, day) => {
  const doc = await ex().issueMaterials(ctx, order._id, { lines });
  await MaterialIssue.updateOne({ _id: doc._id || (doc.issue && doc.issue._id) }, { $set: { issueDate: at(day) } });
};
const receive = async (order, quantity, day) => {
  await ex().reportOutput(ctx, order._id, { producedQuantity: quantity });
  await ProductionReceipt.updateMany(
    { productionOrderId: order._id, receiptDate: { $gt: at('2026-10-20') } },
    { $set: { receiptDate: at(day) } }
  );
};

/**
 * Vito Mineral T, three ways out of the factory:
 *   Carton    unit carton — recipe per 5 cartons (one batch): 97.5 kg premix + 2.5 kg paste
 *             (a by-product re-used) + 5 carton boxes → 20 kg a carton
 *   20kg Bag  unit bag    — product conversion 1 bag = 20 kg
 *   Loose     unit kg     — extra packing, weighed directly
 */
const setup = async () => {
  await ManufacturingSettings.create({ organizationId: ORG, requireQualityCheck: false });
  const premix = await insertProduct('Mineral premix', { unit: 'kg', stockQuantity: 10000 });
  const paste = await insertProduct('Paste', { unit: 'kg', stockQuantity: 1000, productType: 'by_product' });
  const box = await insertProduct('Carton box', { unit: 'pcs', stockQuantity: 1000, productType: 'packaging_material' });
  const carton = await insertProduct('Vito Mineral T Carton', { unit: 'carton', productType: 'finished_good' });
  const bag = await insertProduct('Vito Mineral T 20kg Bag', {
    unit: 'bag',
    productType: 'finished_good',
    unitConversions: [{ fromUnit: 'bag', toUnit: 'kg', factor: 20, isActive: true }],
  });
  const loose = await insertProduct('Vito Mineral T Loose', { unit: 'kg', productType: 'finished_good' });
  await manufacturing.bom.createBom(ctx, {
    productId: carton._id,
    quantity: 5,
    components: [
      { productId: premix._id, quantity: 97.5, unit: 'kg' },
      { productId: paste._id, quantity: 2.5, unit: 'kg' },
      { productId: box._id, quantity: 5, unit: 'pcs' },
    ],
  });
  // One batch = 5 bags = 100 kg premix.
  await manufacturing.bom.createBom(ctx, {
    productId: bag._id,
    quantity: 5,
    components: [{ productId: premix._id, quantity: 100, unit: 'kg' }],
  });
  await manufacturing.bom.createBom(ctx, {
    productId: loose._id,
    components: [{ productId: premix._id, quantity: 1, unit: 'kg' }],
  });
  return { premix, paste, box, carton, bag, loose };
};

describe('weights', () => {
  test('weight units convert directly, conversions both ways, anything else has no weight', () => {
    expect(unitWeight({ unit: 'g' }, 'g')).toEqual({ kgPerUnit: 0.001, source: 'unit' });
    const bag = { unit: 'bag', unitConversions: [{ fromUnit: 'bag', toUnit: 'kg', factor: 20 }] };
    expect(unitWeight(bag, 'bag')).toEqual({ kgPerUnit: 20, source: 'conversion' });
    const sack = { unit: 'bag', unitConversions: [{ fromUnit: 'ton', toUnit: 'bag', factor: 40 }] };
    expect(unitWeight(sack, 'bag')).toEqual({ kgPerUnit: 25, source: 'conversion' });
    expect(unitWeight({ unit: 'pcs' }, 'pcs')).toEqual({ kgPerUnit: null, source: null });
    const a = '5f0000000000000000000001';
    const b = '5f0000000000000000000002';
    expect([...parsePackWeights(`${a}=20,${a}:${b}=5.5,bad=3,${b}=-1`)]).toEqual([
      [a, 20],
      [`${a}:${b}`, 5.5],
    ]);
  });
});

describeTx('Product-wise production register', () => {
  test('a product line added up in kg: batches, by-products, packs, extra packing, running in-process', async () => {
    const { premix, paste, box, carton, bag, loose } = await setup();

    // Before the period: 50 kg issued to a loose batch → the opening in process.
    const c = await release(loose._id, 50);
    await issue(c, [{ materialLineId: lineOf(c, premix), quantity: 50 }], '2026-09-28');

    const a = await release(carton._id, 60);
    await issue(
      a,
      [
        { materialLineId: lineOf(a, premix), quantity: 1170 },
        { materialLineId: lineOf(a, paste), quantity: 30 },
        { materialLineId: lineOf(a, box), quantity: 60 },
      ],
      '2026-10-03'
    );
    const b = await release(bag._id, 50);
    await issue(b, [{ materialLineId: lineOf(b, premix), quantity: 1000 }], '2026-10-04');

    await receive(a, 59, '2026-10-06');
    await receive(b, 46, '2026-10-06');
    await receive(c, 10.54, '2026-10-06');
    await ex().recordScrap(ctx, {
      productionOrderId: b._id,
      stage: 'material',
      materialLineId: lineOf(b, premix),
      quantity: 5,
      reason: 'process_loss',
    });
    await ScrapRecord.updateMany({}, { $set: { scrapDate: at('2026-10-07') } });

    const productIds = [carton._id, bag._id, loose._id].join(',');
    const res = await report({ productIds, combine: true, startDate: '2026-10-01', endDate: '2026-10-31' });
    expect(res.combined).toBe(true);
    const [r] = res.registers;

    expect(res.options.map((o) => o.name).sort()).toEqual([
      'Vito Mineral T 20kg Bag',
      'Vito Mineral T Carton',
      'Vito Mineral T Loose',
    ]);
    expect(r.days).toHaveLength(31);
    expect(r.openingInProcessKg).toBe(50);

    // Packs: recipe weight for the carton (box is packing, not weight), conversion for the
    // bag, loose kg as extra packing.
    const pack = Object.fromEntries(r.packs.map((p) => [p.productId, p]));
    expect(pack[String(carton._id)]).toMatchObject({
      kgPerUnit: 20,
      weightSource: 'recipe',
      quantity: 59,
      kg: 1180,
      loose: false,
    });
    expect(pack[String(bag._id)]).toMatchObject({ kgPerUnit: 20, weightSource: 'conversion', quantity: 46, kg: 920 });
    expect(pack[String(loose._id)]).toMatchObject({ kgPerUnit: 1, weightSource: 'unit', quantity: 10.54, loose: true });
    expect(r.hasLoose).toBe(true);

    const mat = Object.fromEntries(r.materials.map((m) => [m.name, m]));
    expect(mat['Mineral premix']).toMatchObject({ issued: 2170, kgPerUnit: 1, netKg: 2170 });
    expect(mat.Paste).toMatchObject({ issued: 30, netKg: 30, byProduct: true });
    expect(mat['Mineral premix'].byProduct).toBe(false);
    expect(mat['Carton box']).toMatchObject({ issued: 60, kgPerUnit: null, netKg: null });
    // Premix is not batch-tracked: its issues add nothing to Batch qty, and the register says so.
    expect(r.warnings.map((w) => w.kind)).toEqual(['batch', 'material']);
    expect(r.warnings[0].names).toEqual(['Mineral premix']);

    const day = Object.fromEntries(r.days.map((d) => [d.date, d]));
    // KG leaves the paste (a by-product) out.
    expect(day['2026-10-03']).toMatchObject({
      batches: 0,
      issueKg: 1200,
      mainKg: 1170,
      byProductKg: 30,
      cumIssueKg: 1200,
      inProcessKg: 1250,
    });
    expect(day['2026-10-03'].batchNumbers).toEqual([a.batchNumber]);
    expect(day['2026-10-03'].issued[`${premix._id}|kg`]).toBe(1170);
    expect(day['2026-10-03'].issued[`${box._id}|pcs`]).toBe(60);
    expect(day['2026-10-04']).toMatchObject({
      batches: 0,
      issueKg: 1000,
      mainKg: 1000,
      cumIssueKg: 2200,
      inProcessKg: 2250,
    });
    expect(day['2026-10-06']).toMatchObject({ packedKg: 2100, looseKg: 10.54, finishedKg: 2110.54, cumFinishedKg: 2110.54 });
    expect(day['2026-10-06'].inProcessKg).toBe(139.46);
    expect(day['2026-10-07']).toMatchObject({ scrapKg: 5, inProcessKg: 134.46 });
    expect(r.closingInProcessKg).toBe(134.46);
    expect(r.totals).toMatchObject({
      batches: 0,
      issueKg: 2200,
      mainKg: 2170,
      byProductKg: 30,
      finishedKg: 2110.54,
      scrapKg: 5,
      activeDays: 4,
    });

    // Batch-wise: the loose batch started before the period still shows (it had output).
    const batch = Object.fromEntries(r.batches.map((x) => [x.orderId, x]));
    expect(batch[String(a._id)]).toMatchObject({
      startedOn: '2026-10-03',
      netIssuedKg: 1200,
      batchCount: 0,
      finishedQty: 59,
      finishedKg: 1180,
      inProcessKg: 20,
      yieldPercent: 98.3,
    });
    expect(batch[String(b._id)]).toMatchObject({ netIssuedKg: 1000, finishedKg: 920, scrapKg: 5, inProcessKg: 75 });
    expect(batch[String(c._id)]).toMatchObject({
      startedOn: '2026-09-28',
      netIssuedKg: 50,
      finishedKg: 10.54,
      inProcessKg: 39.46,
    });

    // A later period opens with what is still in process; idle days can be hidden.
    const next = await register({
      productIds,
      combine: true,
      startDate: '2026-10-08',
      endDate: '2026-10-10',
      hideIdle: true,
    });
    expect(next.openingInProcessKg).toBe(134.46);
    expect(next.days).toHaveLength(0);
    expect(next.batches.map((x) => x.orderId).sort()).toEqual([a, b, c].map((o) => String(o._id)).sort());

    // A typed pack weight wins over the recipe.
    const typed = await register({
      productIds,
      combine: true,
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      packWeights: `${carton._id}=25`,
    });
    expect(typed.packs.find((p) => p.productId === String(carton._id))).toMatchObject({
      kgPerUnit: 25,
      weightSource: 'manual',
      kg: 1475,
    });
    expect(typed.closingInProcessKg).toBe(134.46 - 295);

    // Without combine every product is its own register, in the order chosen.
    const apart = await report({ productIds, startDate: '2026-10-01', endDate: '2026-10-31' });
    expect(apart.combined).toBe(false);
    expect(apart.registers.map((x) => x.selected[0].productId)).toEqual([carton, bag, loose].map((p) => String(p._id)));
    const [cartons, bags, looseOnly] = apart.registers;
    expect(cartons).toMatchObject({ openingInProcessKg: 0, closingInProcessKg: 20, hasLoose: false });
    expect(cartons.totals).toMatchObject({ mainKg: 1170, byProductKg: 30, finishedKg: 1180 });
    expect(bags.totals).toMatchObject({ mainKg: 1000, finishedKg: 920, scrapKg: 5 });
    expect(bags.closingInProcessKg).toBe(75);
    expect(looseOnly).toMatchObject({ openingInProcessKg: 50, closingInProcessKg: 39.46 });

    // The summary: the same figures under its own key (the client drops material columns).
    const summary = await manufacturing.reports.getReport(ctx, 'product-summary', {
      productIds,
      combine: true,
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    });
    expect(summary.report).toBe('product-summary');
    expect(summary.registers[0].totals).toEqual(r.totals);
    expect(summary.registers[0].closingInProcessKg).toBe(r.closingInProcessKg);

    // No product chosen → only the picker.
    const none = await report({ startDate: '2026-10-01', endDate: '2026-10-31' });
    expect(none).toMatchObject({ needsProduct: true });
    expect(none.options).toHaveLength(3);
  });

  test('a pack without any weight is counted but kept out of kg, with a warning', async () => {
    const { premix } = await setup();
    const tub = await insertProduct('Vito Mineral T Tub', { unit: 'pcs', productType: 'finished_good' });
    const box = await insertProduct('Tub', { unit: 'pcs', stockQuantity: 100, productType: 'packaging_material' });
    await manufacturing.bom.createBom(ctx, { productId: tub._id, components: [{ productId: box._id, quantity: 1 }] });
    const o = await release(tub._id, 10);
    await issue(o, [{ materialLineId: lineOf(o, box), quantity: 10 }], '2026-10-02');
    await receive(o, 10, '2026-10-03');
    const r = await register({ productIds: String(tub._id), startDate: '2026-10-01', endDate: '2026-10-05' });
    expect(r.packs[0]).toMatchObject({ quantity: 10, kgPerUnit: null, kg: 0 });
    expect(r.totals.finishedKg).toBe(0);
    expect(r.warnings.map((w) => w.kind).sort()).toEqual(['material', 'pack']);
    expect(premix).toBeTruthy();
  });

  test('Batch qty = the stock batches the KG materials were issued from, day by day', async () => {
    await User.collection.insertOne({ _id: USER, organizationId: ORG, name: 'Supervisor', email: 'sup@example.com' });
    await ManufacturingSettings.create({ organizationId: ORG, requireQualityCheck: false });
    const premix = await insertProduct('Mineral premix', { unit: 'kg' });
    const lot = await withLots(premix, [
      { batchNumber: 'PM-A', quantity: 300 },
      { batchNumber: 'PM-B', quantity: 300 },
      { batchNumber: 'PM-C', quantity: 300 },
    ]);
    const salt = await insertProduct('Salt', { unit: 'kg' });
    const saltLot = await withLots(salt, [{ batchNumber: 'SA-1', quantity: 100 }]);
    const paste = await insertProduct('Paste', { unit: 'kg', productType: 'by_product' });
    const pasteLot = await withLots(paste, [{ batchNumber: 'PA-1', quantity: 100 }]);
    const adeh = await insertProduct('Trust Adeh KG', { unit: 'kg', productType: 'finished_good' });
    await manufacturing.bom.createBom(ctx, {
      productId: adeh._id,
      components: [
        { productId: premix._id, quantity: 0.9, unit: 'kg' },
        { productId: salt._id, quantity: 0.1, unit: 'kg' },
        { productId: paste._id, quantity: 0.05, unit: 'kg' },
      ],
    });
    const o1 = await release(adeh._id, 500);
    const o2 = await release(adeh._id, 200);
    // Day 1: premix from PM-A and PM-B, salt from SA-1; paste is a by-product, not counted → 3.
    await issue(
      o1,
      [
        {
          materialLineId: lineOf(o1, premix),
          quantity: 250,
          batches: [
            { batchId: lot['PM-A'], quantity: 200 },
            { batchId: lot['PM-B'], quantity: 50 },
          ],
        },
        { materialLineId: lineOf(o1, salt), quantity: 30, batches: [{ batchId: saltLot['SA-1'], quantity: 30 }] },
        { materialLineId: lineOf(o1, paste), quantity: 20, batches: [{ batchId: pasteLot['PA-1'], quantity: 20 }] },
      ],
      '2026-10-29'
    );
    // Day 2: PM-B to one order, PM-B + PM-C to another — the same lot counts once → 2.
    await issue(
      o1,
      [{ materialLineId: lineOf(o1, premix), quantity: 40, batches: [{ batchId: lot['PM-B'], quantity: 40 }] }],
      '2026-10-30'
    );
    await issue(
      o2,
      [
        {
          materialLineId: lineOf(o2, premix),
          quantity: 150,
          batches: [
            { batchId: lot['PM-B'], quantity: 10 },
            { batchId: lot['PM-C'], quantity: 140 },
          ],
        },
      ],
      '2026-10-30'
    );

    const r = await register({ productIds: String(adeh._id), startDate: '2026-10-01', endDate: '2026-10-31' });
    const day = Object.fromEntries(r.days.map((d) => [d.date, d]));
    expect(day['2026-10-29']).toMatchObject({ batches: 3, mainKg: 280, byProductKg: 20 });
    expect(day['2026-10-30']).toMatchObject({ batches: 2, mainKg: 190 });
    expect(r.totals.batches).toBe(5);
    expect(r.warnings.filter((w) => w.kind === 'batch')).toEqual([]);
    const batch = Object.fromEntries(r.batches.map((b) => [b.orderId, b]));
    expect(batch[String(o1._id)].batchCount).toBe(3); // PM-A, PM-B, SA-1
    expect(batch[String(o2._id)].batchCount).toBe(2); // PM-B, PM-C
  });

  test('a bulk product with pack sizes: a column per pack size, packed kg vs extra packing', async () => {
    await User.collection.insertOne({ _id: USER, organizationId: ORG, name: 'Supervisor', email: 'sup@example.com' });
    await ManufacturingSettings.create({ organizationId: ORG, requireQualityCheck: false });
    const premix = await insertProduct('Mineral premix', { unit: 'kg', stockQuantity: 5000 });
    const paste = await insertProduct('Paste', { unit: 'kg', stockQuantity: 500, productType: 'by_product' });
    const bulk = await insertProduct('Vito Mineral T', { unit: 'kg', productType: 'finished_good' });
    const carton = await insertProduct('Vito Mineral T Carton', { unit: 'carton', productType: 'finished_good' });
    const bag5 = await insertProduct('Vito Mineral T 5KG Bag', { unit: 'bag', productType: 'finished_good' });
    const bag20 = await insertProduct('Vito Mineral T 20KG Bag', { unit: 'bag', productType: 'finished_good' });
    // One mixing batch: 108.5 kg premix + 3.5 kg paste → 112 kg.
    await manufacturing.bom.createBom(ctx, {
      productId: bulk._id,
      quantity: 112,
      components: [
        { productId: premix._id, quantity: 108.5, unit: 'kg' },
        { productId: paste._id, quantity: 3.5, unit: 'kg' },
      ],
    });
    const { sizes } = await manufacturing.packing.saveSizes(ctx, bulk._id, {
      sizes: [
        { name: 'Carton', packProductId: carton._id, contentQuantity: 20 },
        { name: '5 KG Bag', packProductId: bag5._id, contentQuantity: 20 },
        { name: '20 KG Bag', packProductId: bag20._id, contentQuantity: 20 },
      ],
    });
    const sizeId = Object.fromEntries(sizes.map((x) => [x.name, x.id]));

    // 12 batches = 1302 kg premix, plus 42 kg paste.
    const o = await release(bulk._id, 1344);
    await issue(
      o,
      [
        { materialLineId: lineOf(o, premix), quantity: 1302 },
        { materialLineId: lineOf(o, paste), quantity: 42 },
      ],
      '2026-10-02'
    );
    await manufacturing.packing.receiveAndPack(ctx, o._id, {
      producedQuantity: 1260.54,
      packing: {
        lines: [
          { packSizeId: sizeId.Carton, quantity: 30 },
          { packSizeId: sizeId['5 KG Bag'], quantity: 20 },
          { packSizeId: sizeId['20 KG Bag'], quantity: 13 },
        ],
      },
    });
    await ProductionReceipt.updateMany({}, { $set: { receiptDate: at('2026-10-05') } });
    await PackingVoucher.updateMany({}, { $set: { packingDate: at('2026-10-05') } });

    const r = await register({ productIds: String(bulk._id), startDate: '2026-10-01', endDate: '2026-10-31' });
    // Every pack size is a column, in its own order and name, packed or not.
    const packCols = r.packs.filter((p) => !p.loose);
    expect(packCols.map((p) => [p.shortName, p.kgPerUnit, p.weightSource, p.quantity])).toEqual([
      ['Carton', 20, 'pack', 30],
      ['5 KG Bag', 20, 'pack', 20],
      ['20 KG Bag', 20, 'pack', 13],
    ]);
    expect(r.hasLoose).toBe(true);
    expect(r.materials.find((m) => m.name === 'Paste')).toMatchObject({ byProduct: true, issued: 42 });

    const day = Object.fromEntries(r.days.map((d) => [d.date, d]));
    expect(day['2026-10-02']).toMatchObject({ batches: 0, mainKg: 1302, byProductKg: 42, issueKg: 1344, cumIssueKg: 1344 });
    expect(day['2026-10-05']).toMatchObject({
      packedKg: 1260,
      looseKg: 0.54,
      finishedKg: 1260.54,
      cumFinishedKg: 1260.54,
      inProcessKg: 83.46,
    });
    expect(day['2026-10-05'].packs).toMatchObject({
      [String(carton._id)]: 30,
      [String(bag5._id)]: 20,
      [String(bag20._id)]: 13,
    });
  });
});
