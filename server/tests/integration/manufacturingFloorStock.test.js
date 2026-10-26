const mongoose = require('mongoose');
const {
  Product,
  InventoryTransaction,
  Bom,
  ProductionOrder,
  MaterialIssue,
  ProductionReceipt,
  ProductionOutput,
  ScrapRecord,
  PackSize,
  PackingVoucher,
  FloorStockLot,
  FloorStockVoucher,
  ManufacturingSettings,
  User,
} = require('../../src/models');
const manufacturing = require('../../src/services/manufacturing');

/**
 * Production stock: packing material (bottles, labels, cartons) issued to the floor in
 * bulk, shared by several finished goods, used from there automatically by receipts and
 * packing — with issued − used − returned ± count = what is on the floor, always.
 * Needs a replica set (every posting is one transaction).
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
      FloorStockLot,
      FloorStockVoucher,
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
const fs = () => manufacturing.floorStock;
const pk = () => manufacturing.packing;

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
const stockOf = async (product) => (await Product.findById(product._id).lean()).stockQuantity;
const floorOf = (product) => fs().balanceOf(ctx, product._id);

/** The floor ledger and the lots must always agree. */
const ledgerFloor = async (product) =>
  (await InventoryTransaction.find({ productId: product._id, stockBucket: 'floor' }).lean()).reduce(
    (s, r) => s + r.quantityDelta,
    0
  );

/**
 * Two finished goods sharing the same bottle and label:
 *   Calcophos 5 Ltr = 5 kg base + 1 bottle + 1 label · Calcophos 1 Ltr = 1 kg base + 1 bottle + 1 label
 */
const setup = async () => {
  await User.collection.insertOne({ _id: USER, organizationId: ORG, name: 'Store Keeper', email: 'store@example.com' });
  await ManufacturingSettings.create({ organizationId: ORG, requireQualityCheck: false });
  const base = await insertProduct('Calcophos base', { unit: 'kg', cost: 4, stockQuantity: 1000 });
  const bottle = await insertProduct('Bottle', { cost: 10, stockQuantity: 500, productType: 'packaging_material' });
  const label = await insertProduct('Label', { cost: 1, stockQuantity: 1000, productType: 'packaging_material' });
  const big = await insertProduct('Calcophos 5 Ltr', { cost: 0, productType: 'finished_good' });
  const small = await insertProduct('Calcophos 1 Ltr', { cost: 0, productType: 'finished_good' });
  const recipe = (kg) => [
    { productId: base._id, quantity: kg, unit: 'kg' },
    { productId: bottle._id, quantity: 1 },
    { productId: label._id, quantity: 1 },
  ];
  await manufacturing.bom.createBom(ctx, { productId: big._id, components: recipe(5) });
  await manufacturing.bom.createBom(ctx, { productId: small._id, components: recipe(1) });
  return { base, bottle, label, big, small };
};

/** Released order with its base material issued (packing material is never issued to it). */
const orderFor = async (product, base, qty, kgPerUnit) => {
  const order = await po().createOrder(ctx, { productId: product._id, plannedQuantity: qty });
  await po().changeStatus(ctx, order._id, { status: 'released' });
  const released = await ProductionOrder.findById(order._id);
  const baseLine = released.materials.find((m) => String(m.productId) === String(base._id));
  await ex().issueMaterials(ctx, order._id, { lines: [{ materialLineId: baseLine._id, quantity: qty * kgPerUnit }] });
  return ProductionOrder.findById(order._id);
};
const receive = (order, qty) => ex().reportOutput(ctx, order._id, { producedQuantity: qty, qcMode: 'direct' });

describeTx('Production stock', () => {
  test('bulk issue, shared use by two products, auto-issue on shortfall, block mode, reversal, return, count, cancel', async () => {
    const { base, bottle, label, big, small } = await setup();

    // An order created BEFORE the switch follows it.
    const early = await po().createOrder(ctx, { productId: small._id, plannedQuantity: 30 });
    expect(early.materials.every((m) => m.supply === 'order')).toBe(true);
    const switched = await fs().setIssueMethod(ctx, { productIds: [bottle._id, label._id], issueMethod: 'floor' });
    expect(switched).toMatchObject({ updated: 2, issueMethod: 'floor', ordersUpdated: 1 });
    const earlyNow = await ProductionOrder.findById(early._id).lean();
    expect(earlyNow.materials.map((m) => m.supply).sort()).toEqual(['floor', 'floor', 'order']);

    // Issue to production stock in bulk: store down, floor up.
    const psi = await fs().postIssue(ctx, {
      lines: [
        { productId: bottle._id, quantity: 50 },
        { productId: label._id, quantity: 100 },
      ],
    });
    expect(psi).toMatchObject({ voucherNumber: 'PSI-00001', kind: 'issue', totalCost: 600 });
    expect(await stockOf(bottle)).toBe(450);
    expect(await stockOf(label)).toBe(900);
    expect(await floorOf(bottle)).toBe(50);
    expect(await floorOf(label)).toBe(100);
    // Base is not a production-stock material.
    await expect(fs().postIssue(ctx, { lines: [{ productId: base._id, quantity: 1 }] })).rejects.toThrow(
      /not a production-stock material/
    );

    // Product 1: 10 × 5 Ltr. Packing material is not "still to issue" and comes off the floor.
    const a = await orderFor(big, base, 10, 5);
    const aBottle = a.materials.find((m) => String(m.productId) === String(bottle._id));
    expect(aBottle.supply).toBe('floor');
    expect(manufacturing.execution && require('../../src/services/manufacturing/wip').lineRemaining(aBottle)).toBe(0);
    const outA = await receive(a, 10);
    expect(outA.goodQuantity).toBe(10);
    expect(outA.consumption.filter((c) => c.source === 'floor').map((c) => c.quantity)).toEqual([10, 10]);
    // FG cost includes the packing material: 5 kg × 4 + 10 + 1 = 31.
    expect(outA.unitCost).toBe(31);
    expect(await floorOf(bottle)).toBe(40);
    expect(await floorOf(label)).toBe(90);
    const aDone = await ProductionOrder.findById(a._id).lean();
    expect(aDone.materials.find((m) => String(m.productId) === String(bottle._id))).toMatchObject({
      issuedQuantity: 10,
      consumedQuantity: 10,
      issuedCost: 100,
    });

    // Product 2 (the early order) uses the same bottles and labels.
    await po().changeStatus(ctx, early._id, { status: 'released' });
    const rel = await ProductionOrder.findById(early._id);
    await ex().issueMaterials(ctx, early._id, {
      lines: [{ materialLineId: rel.materials.find((m) => String(m.productId) === String(base._id))._id, quantity: 30 }],
    });
    const outB = await receive(rel, 30);
    expect(await floorOf(bottle)).toBe(10);
    expect(await floorOf(label)).toBe(60);

    // Floor short: 15 needed, 10 there → 5 issued automatically from the store.
    const c = await orderFor(big, base, 15, 5);
    await receive(c, 15);
    expect(await floorOf(bottle)).toBe(0);
    expect(await stockOf(bottle)).toBe(445);
    const auto = await FloorStockVoucher.findOne({ auto: true }).lean();
    expect(auto).toMatchObject({ kind: 'issue', voucherNumber: 'PSI-00002' });
    expect(auto.lines.map((l) => [l.productName, l.quantity])).toEqual([['Bottle', 5]]);

    // Block mode: refused, nothing moves.
    await ManufacturingSettings.updateOne({ organizationId: ORG }, { $set: { floorShortfall: 'block' } });
    const d = await orderFor(big, base, 5, 5);
    await expect(receive(d, 5)).rejects.toThrow(/Production stock has only 0 pcs of "Bottle".*issue 5 more/);
    expect(await stockOf(bottle)).toBe(445);
    expect((await ProductionOrder.findById(d._id).lean()).producedQuantity).toBe(0);
    await ManufacturingSettings.updateOne({ organizationId: ORG }, { $set: { floorShortfall: 'auto_issue' } });

    // Reverse product 2's receipt: its 30 bottles + labels go back to the floor.
    await ex().reverseOutput(ctx, outB._id, { reason: 'wrong_quantity' });
    expect(await floorOf(bottle)).toBe(30);
    expect(await floorOf(label)).toBe(75);
    const bBack = await ProductionOrder.findById(early._id).lean();
    expect(bBack.materials.find((m) => String(m.productId) === String(bottle._id))).toMatchObject({
      issuedQuantity: 0,
      consumedQuantity: 0,
    });

    // Return 10 bottles to the store; count the labels: 50 on the floor, book says 75.
    const psr = await fs().postReturn(ctx, { lines: [{ productId: bottle._id, quantity: 10 }] });
    expect(psr.voucherNumber).toBe('PSR-00001');
    expect(await stockOf(bottle)).toBe(455);
    expect(await floorOf(bottle)).toBe(20);
    const psc = await fs().postCount(ctx, { reason: 'Damaged', lines: [{ productId: label._id, countedQuantity: 50 }] });
    expect(psc.lines[0]).toMatchObject({ bookQuantity: 75, countedQuantity: 50, quantity: -25 });
    expect(await floorOf(label)).toBe(50);

    // The reconciliation adds up.
    const overview = await fs().getOverview(ctx);
    const row = Object.fromEntries(overview.rows.map((r) => [r.name, r]));
    expect(row.Bottle).toMatchObject({
      issued: 55,
      autoIssued: 5,
      used: 25,
      returned: 10,
      countDiff: 0,
      closing: 20,
      inProduction: 20,
      storeQuantity: 455,
    });
    expect(row.Bottle.usedFor).toEqual([{ productId: String(big._id), name: 'Calcophos 5 Ltr', quantity: 25 }]);
    expect(row.Label).toMatchObject({ issued: 100, used: 25, returned: 0, countDiff: -25, closing: 50, inProduction: 50 });
    expect(overview.totals).toMatchObject({ wastage: 25, autoIssued: 5 });
    // Open orders still to use from the floor: order d (5 bottles, 5 labels) and the reopened early order.
    expect(row.Bottle.openOrderNeed).toBe(35);

    const detail = await fs().getMaterial(ctx, bottle._id);
    expect(detail.closing).toBe(20);
    expect(detail.movements[0]).toMatchObject({ kind: 'return', quantity: -10, balance: 20 });

    // Cancel: the return (back to the floor), the count (labels back); an issue whose lots were used is refused.
    await fs().cancelVoucher(ctx, psr._id, { reason: 'Wrong material' });
    expect(await floorOf(bottle)).toBe(30);
    expect(await stockOf(bottle)).toBe(445);
    await fs().cancelVoucher(ctx, psc._id, { reason: 'Recount' });
    expect(await floorOf(label)).toBe(75);
    await expect(fs().cancelVoucher(ctx, psi._id, { reason: 'Mistake' })).rejects.toThrow(/already used in production/);

    // Turning production stock off is refused while the floor holds some.
    await expect(fs().setIssueMethod(ctx, { productIds: [bottle._id], issueMethod: 'order' })).rejects.toThrow(
      /still has stock in production/
    );

    // Ledger and lots agree; store moves add up.
    expect(await ledgerFloor(bottle)).toBe(await floorOf(bottle));
    expect(await ledgerFloor(label)).toBe(await floorOf(label));
  });

  test('packing takes production-stock material from the floor, records which pack used it; cancel puts it back', async () => {
    const { base, big } = await setup();
    const bulk = await insertProduct('Vito Mineral T', { unit: 'kg', cost: 0, productType: 'finished_good' });
    const pouch = await insertProduct('1 KG pouch', { cost: 0.5, stockQuantity: 500, productType: 'packaging_material' });
    const carton = await insertProduct('Carton box', { cost: 10, stockQuantity: 50, productType: 'packaging_material' });
    const cartonPack = await insertProduct('Vito Carton 20 x 1KG', { unit: 'carton', cost: 0, productType: 'finished_good' });
    await manufacturing.bom.createBom(ctx, { productId: bulk._id, components: [{ productId: base._id, quantity: 1, unit: 'kg' }] });
    const setupResult = await pk().saveSizes(ctx, bulk._id, {
      sizes: [
        {
          name: 'Carton 20 × 1 KG',
          packProductId: cartonPack._id,
          contentQuantity: 20,
          materials: [
            { productId: pouch._id, quantity: 20 },
            { productId: carton._id, quantity: 1 },
          ],
        },
      ],
    });
    await fs().setIssueMethod(ctx, { productIds: [carton._id], issueMethod: 'floor' });
    await fs().postIssue(ctx, { lines: [{ productId: carton._id, quantity: 20 }] });

    const order = await orderFor(bulk, base, 100, 1);
    const { packing } = await pk().receiveAndPack(ctx, order._id, {
      producedQuantity: 100,
      packing: { lines: [{ packSizeId: setupResult.sizes[0].id, quantity: 5 }] },
    });
    const used = Object.fromEntries(packing.consumed.map((c) => [c.productName, c]));
    expect(used['Carton box']).toMatchObject({ source: 'floor', quantity: 5 });
    expect(used['Carton box'].uses).toEqual([
      expect.objectContaining({ productName: 'Vito Carton 20 x 1KG', packName: 'Carton 20 × 1 KG', quantity: 5 }),
    ]);
    expect(used['1 KG pouch']).toMatchObject({ source: 'store', quantity: 100 });
    expect(await floorOf(carton)).toBe(15);
    expect(await stockOf(carton)).toBe(30); // issued 20 earlier — packing did not touch the store
    expect(await stockOf(pouch)).toBe(400);

    const row = (await fs().getOverview(ctx)).rows.find((r) => r.name === 'Carton box');
    expect(row).toMatchObject({ issued: 20, used: 5, closing: 15 });
    expect(row.usedFor).toEqual([expect.objectContaining({ name: 'Vito Carton 20 x 1KG', quantity: 5 })]);

    await pk().cancelPacking(ctx, packing._id, { reason: 'Wrong count' });
    expect(await floorOf(carton)).toBe(20);
    expect(await stockOf(carton)).toBe(30);
    expect(await ledgerFloor(carton)).toBe(20);
    expect(big).toBeTruthy();
  });

  test('a production-stock line can still be issued to its order: the receipt uses that first, the floor for the rest', async () => {
    const { base, bottle, label, big } = await setup();
    await fs().setIssueMethod(ctx, { productIds: [bottle._id, label._id], issueMethod: 'floor' });
    await fs().postIssue(ctx, { lines: [{ productId: label._id, quantity: 4 }] });
    const order = await orderFor(big, base, 10, 5);
    const line = (o, p) => o.materials.find((m) => String(m.productId) === String(p._id));

    // The voucher offers the floor lines: open requirement less what the floor holds.
    const reqs = await po().getOrderRequirements(ctx, order._id);
    const offered = Object.fromEntries(reqs.lines.map((l) => [l.productName, l]));
    expect(offered.Bottle).toMatchObject({ supply: 'floor', floorQuantity: 0, openQuantity: 10, outstandingQuantity: 10 });
    expect(offered.Label).toMatchObject({ supply: 'floor', floorQuantity: 4, openQuantity: 10, outstandingQuantity: 6 });

    // Issue the bottles to the order (no over-issue: up to the open requirement is allowed).
    await ex().issueMaterials(ctx, order._id, { lines: [{ materialLineId: line(order, bottle)._id, quantity: 10 }] });
    expect(await stockOf(bottle)).toBe(490);
    // Labels: 6 to the order, 4 come from the floor at receipt.
    await ex().issueMaterials(ctx, order._id, { lines: [{ materialLineId: line(order, label)._id, quantity: 6 }] });

    const out = await receive(order, 10);
    const bySource = (p) =>
      out.consumption
        .filter((c) => String(c.productId) === String(p._id))
        .map((c) => [c.source || 'wip', c.quantity])
        .sort();
    expect(bySource(bottle)).toEqual([['wip', 10]]);
    expect(bySource(label)).toEqual([
      ['floor', 4],
      ['wip', 6],
    ]);
    expect(await floorOf(label)).toBe(0);
    expect(await FloorStockVoucher.countDocuments({ auto: true })).toBe(0);
    const done = await ProductionOrder.findById(order._id).lean();
    expect(line(done, label)).toMatchObject({ issuedQuantity: 10, consumedQuantity: 10 });
  });

  test('packing recorded on the receipt beyond the recipe: taken from production stock, costed, remembered per unit, reversible', async () => {
    const { base, bottle, label } = await setup();
    // A product whose recipe has no packing at all.
    const bulk = await insertProduct('Calcophos bulk', { cost: 0, productType: 'finished_good' });
    await manufacturing.bom.createBom(ctx, { productId: bulk._id, components: [{ productId: base._id, quantity: 1, unit: 'kg' }] });
    await fs().setIssueMethod(ctx, { productIds: [bottle._id, label._id], issueMethod: 'floor' });
    await fs().postIssue(ctx, { lines: [{ productId: bottle._id, quantity: 100 }, { productId: label._id, quantity: 100 }] });

    const order = await orderFor(bulk, base, 90, 1);
    const out = await ex().reportOutput(ctx, order._id, {
      producedQuantity: 90,
      qcMode: 'direct',
      floorUsage: [
        { productId: bottle._id, quantity: 90 },
        { productId: label._id, quantity: 91 }, // one label spoilt
      ],
    });
    const extra = out.consumption.filter((c) => c.extra);
    expect(extra.map((c) => [c.productName, c.quantity, c.source])).toEqual([
      ['Bottle', 90, 'floor'],
      ['Label', 91, 'floor'],
    ]);
    // 90 kg × 4 + 90 bottles × 10 + 91 labels × 1 = 1351 → 15.01 per unit.
    expect(out.materialCost).toBe(1351);
    expect(out.unitCost).toBe(15.01);
    expect(await floorOf(bottle)).toBe(10);
    expect(await floorOf(label)).toBe(9);
    const row = (await fs().getOverview(ctx)).rows.find((r) => r.name === 'Bottle');
    expect(row).toMatchObject({ used: 90 });
    expect(row.usedFor).toEqual([expect.objectContaining({ name: 'Calcophos bulk', quantity: 90 })]);

    // The next receipt starts from it, per unit made.
    const template = await fs().getUsageTemplate(ctx, bulk._id);
    expect(template.lines.map((l) => [l.name, l.perUnit])).toEqual([
      ['Bottle', 1],
      ['Label', 1.011111],
    ]);

    // Not a production-stock material: refused.
    const order2 = await orderFor(bulk, base, 5, 1);
    await expect(
      ex().reportOutput(ctx, order2._id, { producedQuantity: 5, qcMode: 'direct', floorUsage: [{ productId: base._id, quantity: 1 }] })
    ).rejects.toThrow(/not a production-stock material/);

    // Reversing the receipt puts the packing back on the floor.
    await ex().reverseOutput(ctx, out._id, { reason: 'wrong_quantity' });
    expect(await floorOf(bottle)).toBe(100);
    expect(await floorOf(label)).toBe(100);
    expect(await ledgerFloor(bottle)).toBe(100);
  });

  test('serial-tracked products cannot be production stock; a material with no floor stock can be turned off', async () => {
    const { bottle } = await setup();
    const phone = await insertProduct('Phone', { trackImei: true });
    await expect(fs().setIssueMethod(ctx, { productIds: [phone._id], issueMethod: 'floor' })).rejects.toThrow(/serial number/);
    await fs().setIssueMethod(ctx, { productIds: [bottle._id], issueMethod: 'floor' });
    expect(await fs().setIssueMethod(ctx, { productIds: [bottle._id], issueMethod: 'order' })).toMatchObject({
      issueMethod: 'order',
    });
    expect((await Product.findById(bottle._id).lean()).issueMethod).toBe('order');
  });
});
