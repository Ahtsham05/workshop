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
} = require('../../src/models');
const manufacturing = require('../../src/services/manufacturing');
const { unitWeight, parsePackWeights } = require('../../src/services/manufacturing/productProductionReport.service');

/**
 * Product-wise production register (report 'product-production'): one product line day by
 * day in kg — batches started, each material issued, finished packs weighed, and the
 * running "remaining in process". Needs a replica set (issues and receipts are transactions).
 */
const REPLSET_URL = process.env.MONGODB_TEST_REPLSET_URL;
const describeTx = REPLSET_URL ? describe : describe.skip;

beforeAll(async () => {
  if (REPLSET_URL) await mongoose.connect(REPLSET_URL);
  await Promise.all(
    [Bom, ProductionOrder, MaterialIssue, ProductionReceipt, ProductionOutput, ScrapRecord].map(
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
const report = (q) => manufacturing.reports.getReport(ctx, 'product-production', q);
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
 *   Carton    unit carton — recipe 19.5 kg premix + 0.5 kg paste + 1 carton box → 20 kg
 *   20kg Bag  unit bag    — product conversion 1 bag = 20 kg
 *   Loose     unit kg     — extra packing, weighed directly
 */
const setup = async () => {
  await ManufacturingSettings.create({ organizationId: ORG, requireQualityCheck: false });
  const premix = await insertProduct('Mineral premix', { unit: 'kg', stockQuantity: 10000 });
  const paste = await insertProduct('Paste', { unit: 'kg', stockQuantity: 1000 });
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
    components: [
      { productId: premix._id, quantity: 19.5, unit: 'kg' },
      { productId: paste._id, quantity: 0.5, unit: 'kg' },
      { productId: box._id, quantity: 1, unit: 'pcs' },
    ],
  });
  await manufacturing.bom.createBom(ctx, {
    productId: bag._id,
    components: [{ productId: premix._id, quantity: 20, unit: 'kg' }],
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
  test('day by day in kg: batches, materials, packs, extra packing, running in-process', async () => {
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
    const r = await report({ productIds, startDate: '2026-10-01', endDate: '2026-10-31' });

    expect(r.options.map((o) => o.name).sort()).toEqual([
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
    expect(mat.Paste).toMatchObject({ issued: 30, netKg: 30 });
    expect(mat['Carton box']).toMatchObject({ issued: 60, kgPerUnit: null, netKg: null });
    expect(r.warnings.map((w) => w.kind)).toEqual(['material']);

    const day = Object.fromEntries(r.days.map((d) => [d.date, d]));
    expect(day['2026-10-03']).toMatchObject({ batches: 1, issueKg: 1200, cumIssueKg: 1200, inProcessKg: 1250 });
    expect(day['2026-10-03'].batchNumbers).toEqual([a.batchNumber]);
    expect(day['2026-10-03'].issued[`${premix._id}|kg`]).toBe(1170);
    expect(day['2026-10-03'].issued[`${box._id}|pcs`]).toBe(60);
    expect(day['2026-10-04']).toMatchObject({ batches: 1, issueKg: 1000, cumIssueKg: 2200, inProcessKg: 2250 });
    expect(day['2026-10-06']).toMatchObject({ packedKg: 2100, looseKg: 10.54, finishedKg: 2110.54, cumFinishedKg: 2110.54 });
    expect(day['2026-10-06'].inProcessKg).toBe(139.46);
    expect(day['2026-10-07']).toMatchObject({ scrapKg: 5, inProcessKg: 134.46 });
    expect(r.closingInProcessKg).toBe(134.46);
    expect(r.totals).toMatchObject({ batches: 2, issueKg: 2200, finishedKg: 2110.54, scrapKg: 5, activeDays: 4 });

    // Batch-wise: the loose batch started before the period still shows (it had output).
    const batch = Object.fromEntries(r.batches.map((x) => [x.orderId, x]));
    expect(batch[String(a._id)]).toMatchObject({
      startedOn: '2026-10-03',
      netIssuedKg: 1200,
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
    const next = await report({ productIds, startDate: '2026-10-08', endDate: '2026-10-10', hideIdle: true });
    expect(next.openingInProcessKg).toBe(134.46);
    expect(next.days).toHaveLength(0);
    expect(next.batches.map((x) => x.orderId).sort()).toEqual([a, b, c].map((o) => String(o._id)).sort());

    // A typed pack weight wins over the recipe.
    const typed = await report({
      productIds,
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

    // The summary: the same figures under its own key (the client drops material columns).
    const summary = await manufacturing.reports.getReport(ctx, 'product-summary', { productIds, startDate: '2026-10-01', endDate: '2026-10-31' });
    expect(summary.report).toBe('product-summary');
    expect(summary.totals).toEqual(r.totals);
    expect(summary.closingInProcessKg).toBe(r.closingInProcessKg);

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
    const r = await report({ productIds: String(tub._id), startDate: '2026-10-01', endDate: '2026-10-05' });
    expect(r.packs[0]).toMatchObject({ quantity: 10, kgPerUnit: null, kg: 0 });
    expect(r.totals.finishedKg).toBe(0);
    expect(r.warnings.map((w) => w.kind).sort()).toEqual(['material', 'pack']);
    expect(premix).toBeTruthy();
  });
});
