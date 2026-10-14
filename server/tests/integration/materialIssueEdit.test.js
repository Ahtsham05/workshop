const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  Product,
  Bom,
  ProductionOrder,
  MaterialIssue,
  ManufacturingSettings,
  InventoryTransaction,
  Batch,
  ProductVariant,
  Inventory,
  User,
} = require('../../src/models');
const manufacturing = require('../../src/services/manufacturing');

/**
 * (shared setup) Material issue for a finished good: plan (BOM exploded for a quantity), post (creates and
 * releases the production order and issues in ONE transaction), and the material usage
 * report (issued = returned + used + wastage + still in the factory). Needs a replica set.
 */
const REPLSET_URL = process.env.MONGODB_TEST_REPLSET_URL;
const describeTx = REPLSET_URL ? describe : describe.skip;

let mongod;
beforeAll(async () => {
  if (REPLSET_URL) await mongoose.connect(REPLSET_URL);
  else {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  }
  await Promise.all([Bom, ProductionOrder, MaterialIssue].map((m) => m.syncIndexes()));
});
beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
});
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});
jest.setTimeout(60000);

const id = () => new mongoose.Types.ObjectId();
const ORG = id();
const BRANCH = id();
const USER = id();
const ctx = { organizationId: ORG, branchId: String(BRANCH), createdBy: USER };
const svc = manufacturing.materialIssueVoucher;
const BASIC = { executeProduction: true, manageProductionOrders: true };

const insertProduct = async (name, overrides = {}) => {
  const doc = {
    _id: id(),
    organizationId: ORG,
    branchId: BRANCH,
    name,
    price: 100,
    cost: 10,
    stockQuantity: 0,
    unit: 'pcs',
    hasVariants: false,
    isActive: true,
    productType: 'component',
    defaultBomId: null,
    ...overrides,
  };
  await Product.collection.insertOne(doc);
  return doc;
};
const stockOf = async (productId) => (await Product.findById(productId).lean()).stockQuantity;

/** Fan = 1 motor + 2 bearings + 0.5 kg steel (10% scrap allowance). */
const setup = async () => {
  await User.collection.insertOne({ _id: USER, organizationId: ORG, name: 'Store Keeper', email: 'store@example.com' });
  const motor = await insertProduct('Motor', { stockQuantity: 120, cost: 20 });
  const bearing = await insertProduct('Bearing', { stockQuantity: 500, cost: 2 });
  const steel = await insertProduct('Steel', { productType: 'raw_material', stockQuantity: 90, cost: 10, unit: 'kg' });
  const fan = await insertProduct('Pedestal Fan', { productType: 'finished_good' });
  const bom = await manufacturing.bom.createBom(ctx, {
    productId: fan._id,
    components: [
      { productId: motor._id, quantity: 1 },
      { productId: bearing._id, quantity: 2 },
      { productId: steel._id, quantity: 0.5, unit: 'kg', scrapPercent: 10 },
    ],
  });
  return { motor, bearing, steel, fan, bom };
};

const body = (fan, quantity, plan, overrides = {}) => ({
  newOrder: { productId: String(fan._id), plannedQuantity: quantity },
  sourceLocation: 'Raw Material Store',
  wipLocation: 'Production Floor',
  lines: plan.lines.map((l) => ({ materialLineId: l.materialLineId, productId: l.productId, quantity: l.requiredQuantity })),
  ...overrides,
});


/*
 * Editing and deleting POSTED Material Issue Vouchers (materialIssueEdit.service.js):
 * cancel = reverse into stock + keep the voucher as cancelled; edit = header only, or
 * reverse and re-post under the same number — blocked once its material was used.
 */
const edit = () => manufacturing.materialIssueEdit;
const ALL = { ...BASIC, overIssueMaterials: true };
const FULL = { sourceLocation: 'Raw Material Store', wipLocation: 'Production Floor' };

const releasedOrder = async (fan, quantity = 10) => {
  const created = await manufacturing.productionOrder.createOrder(ctx, { productId: fan._id, plannedQuantity: quantity, ...FULL });
  return manufacturing.productionOrder.changeStatus(ctx, created._id, { status: 'released' });
};
const lineOf = (order, p) => order.materials.find((m) => String(m.productId) === String(p._id));
const issueFor = async (order, lines, extra = {}) =>
  svc.postVoucher(ctx, { productionOrderId: String(order._id), ...FULL, lines, ...extra }, BASIC);

describeTx('Cancel ("delete") a posted voucher', () => {
  test('puts the material back, keeps the voucher as cancelled, contra ledger rows net to zero', async () => {
    const { motor, steel, fan } = await setup();
    const order = await releasedOrder(fan, 10);
    const issue = await issueFor(order, [
      { materialLineId: lineOf(order, motor)._id, quantity: 10 },
      { materialLineId: lineOf(order, steel)._id, quantity: 5.5 },
    ]);
    expect(await stockOf(motor._id)).toBe(110);

    const preview = await edit().getReversalPreview(ctx, issue._id);
    expect(preview).toMatchObject({ canReverse: true, order: { canCancel: true } });

    const cancelled = await edit().cancelIssue(ctx, issue._id, { reason: 'Wrong order', revision: 0 });
    expect(cancelled).toMatchObject({ status: 'cancelled', cancelReason: 'Wrong order', revision: 1 });
    expect(cancelled.cancelledBy.name).toBe('Store Keeper');
    expect(await stockOf(motor._id)).toBe(120);
    expect(await stockOf(steel._id)).toBe(90);
    const o = await ProductionOrder.findById(order._id).lean();
    expect(o.materials.every((m) => m.issuedQuantity === 0 && m.issuedCost === 0)).toBe(true);
    expect(o.materialCost).toBe(0);
    expect(o.wipLots).toHaveLength(0);
    expect(o.status).toBe('in_production'); // the order itself stays

    const reversal = await InventoryTransaction.find({ refId: issue._id, refType: 'MaterialIssueReversal' }).lean();
    expect(reversal).toHaveLength(4);
    const all = await InventoryTransaction.find({ refId: issue._id }).lean();
    const net = (bucket) => all.filter((r) => r.stockBucket === bucket).reduce((s, r) => s + r.quantityDelta, 0);
    expect(net('available')).toBeCloseTo(0, 6);
    expect(net('wip')).toBeCloseTo(0, 6);
    // Still listed, as cancelled; the number is never reused.
    expect(await MaterialIssue.countDocuments({ _id: issue._id, status: 'cancelled' })).toBe(1);
    const next = await issueFor(order, [{ materialLineId: lineOf(order, motor)._id, quantity: 1 }]);
    expect(next.issueNumber).not.toBe(issue.issueNumber);
  });

  test('can also cancel the order when the voucher was all that happened on it', async () => {
    const { fan } = await setup();
    const plan = await svc.planForProduct(ctx, { productId: String(fan._id), quantity: 4 });
    const issue = await svc.postVoucher(ctx, body(fan, 4, plan), BASIC);
    await edit().cancelIssue(ctx, issue._id, { reason: 'Not making these', cancelOrder: true });
    const o = await ProductionOrder.findById(issue.productionOrderId).lean();
    expect(o.status).toBe('cancelled');
    expect(o.statusHistory[o.statusHistory.length - 1].note).toMatch(/Not making these/);
  });

  test('the order stays when it has other issues', async () => {
    const { motor, fan } = await setup();
    const order = await releasedOrder(fan, 10);
    const a = await issueFor(order, [{ materialLineId: lineOf(order, motor)._id, quantity: 4 }]);
    await issueFor(order, [{ materialLineId: lineOf(order, motor)._id, quantity: 4 }]);
    expect((await edit().getReversalPreview(ctx, a._id)).order.canCancel).toBe(false);
    await expect(edit().cancelIssue(ctx, a._id, { reason: 'x y z', cancelOrder: true })).rejects.toThrow(/other issues/);
    expect((await MaterialIssue.findById(a._id).lean()).status).toBe('posted'); // rolled back
    expect(await stockOf(motor._id)).toBe(112);
  });

  test('blocked once its material was used in output', async () => {
    const { motor, bearing, steel, fan } = await setup();
    await ManufacturingSettings.updateOne({ organizationId: ORG }, { $set: { requireQualityCheck: false } });
    const order = await releasedOrder(fan, 10);
    const issue = await issueFor(order, [
      { materialLineId: lineOf(order, motor)._id, quantity: 10 },
      { materialLineId: lineOf(order, bearing)._id, quantity: 20 },
      { materialLineId: lineOf(order, steel)._id, quantity: 5.5 },
    ]);
    await manufacturing.execution.reportOutput(ctx, order._id, { producedQuantity: 3 });
    const preview = await edit().getReversalPreview(ctx, issue._id);
    expect(preview.canReverse).toBe(false);
    expect(preview.lines.find((l) => l.productName === 'Motor')).toMatchObject({ quantity: 10, inWip: 7, gone: 3 });
    const err = await edit().cancelIssue(ctx, issue._id, { reason: 'too late' }).catch((e) => e);
    expect(err.errorCode).toBe('VOUCHER_LOCKED');
    expect(err.message).toMatch(/3 pcs of Motor/);
    expect(await stockOf(motor._id)).toBe(110);
  });

  test('a stale revision is refused', async () => {
    const { motor, fan } = await setup();
    const order = await releasedOrder(fan, 10);
    const issue = await issueFor(order, [{ materialLineId: lineOf(order, motor)._id, quantity: 4 }]);
    await edit().editIssue(ctx, issue._id, { ...FULL, revision: 0, reference: 'R1', lines: [{ materialLineId: lineOf(order, motor)._id, quantity: 4 }] });
    await expect(edit().cancelIssue(ctx, issue._id, { reason: 'old screen', revision: 0 })).rejects.toThrow(/changed by someone else/);
  });

  test('returns cannot be cancelled here', async () => {
    const { motor, fan } = await setup();
    const order = await releasedOrder(fan, 10);
    await issueFor(order, [{ materialLineId: lineOf(order, motor)._id, quantity: 4 }]);
    const o = await ProductionOrder.findById(order._id);
    const ret = await manufacturing.execution.returnMaterials(ctx, order._id, { lines: [{ wipLotId: o.wipLots[0]._id, quantity: 1 }] });
    await expect(edit().cancelIssue(ctx, ret._id, { reason: 'nope' })).rejects.toThrow(/return/);
  });
});

describeTx('Edit a posted voucher', () => {
  test('header only: no stock moves, logged, allowed even after the material was used', async () => {
    const { motor, fan } = await setup();
    await ManufacturingSettings.updateOne({ organizationId: ORG }, { $set: { requireQualityCheck: false, allowOverProduction: true } });
    const order = await releasedOrder(fan, 10);
    const issue = await issueFor(order, [{ materialLineId: lineOf(order, motor)._id, quantity: 10 }], { reference: 'A' });
    const ledgerBefore = await InventoryTransaction.countDocuments();
    const updated = await edit().editIssue(ctx, issue._id, {
      ...FULL,
      revision: 0,
      date: '2026-10-01',
      reference: 'REQ-9',
      notes: 'Shift B',
      requestedById: String(USER),
      editNote: 'typo',
      lines: [{ materialLineId: lineOf(order, motor)._id, quantity: 10 }],
    });
    expect(updated).toMatchObject({ reference: 'REQ-9', notes: 'Shift B', revision: 1, issueNumber: issue.issueNumber });
    expect(updated.requestedBy.name).toBe('Store Keeper');
    expect(updated.editHistory[0]).toMatchObject({ kind: 'header', note: 'typo' });
    expect(updated.editHistory[0].summary).toMatch(/date 20\d\d-\d\d-\d\d → 2026-10-01/);
    expect(await InventoryTransaction.countDocuments()).toBe(ledgerBefore);
    expect(await stockOf(motor._id)).toBe(110);
  });

  test('lines: reversed and re-posted under the same id and number', async () => {
    const { motor, bearing, steel, fan } = await setup();
    const order = await releasedOrder(fan, 10);
    const issue = await issueFor(order, [
      { materialLineId: lineOf(order, motor)._id, quantity: 10 },
      { materialLineId: lineOf(order, bearing)._id, quantity: 20 },
    ]);
    const updated = await edit().editIssue(
      ctx,
      issue._id,
      {
        ...FULL,
        revision: 0,
        lines: [
          { materialLineId: lineOf(order, motor)._id, quantity: 6 }, // 10 → 6
          { materialLineId: lineOf(order, steel)._id, quantity: 5 }, // added; bearing removed
        ],
      },
      BASIC
    );
    expect(String(updated._id)).toBe(String(issue._id));
    expect(updated.issueNumber).toBe(issue.issueNumber);
    expect(updated.createdAt.toISOString()).toBe(issue.createdAt.toISOString());
    expect(updated.revision).toBe(1);
    expect(updated.editHistory[0].kind).toBe('lines');
    expect(updated.editHistory[0].summary).toBe('Motor 10 → 6 pcs; Steel added 5 kg; Bearing removed');
    expect(updated.editHistory[0]).toMatchObject({ previousTotal: 240, newTotal: 170 });
    expect([await stockOf(motor._id), await stockOf(bearing._id), await stockOf(steel._id)]).toEqual([114, 500, 85]);
    const o = await ProductionOrder.findById(order._id).lean();
    expect([lineOf(o, motor).issuedQuantity, lineOf(o, bearing).issuedQuantity, lineOf(o, steel).issuedQuantity]).toEqual([6, 0, 5]);
    expect(o.materialCost).toBe(170);
    expect(await MaterialIssue.countDocuments()).toBe(1);
  });

  test("its own quantity counts as available again (all 90 kg issued → edit to 88)", async () => {
    const { steel, fan } = await setup();
    const order = await releasedOrder(fan, 200); // needs 110 kg
    const issue = await issueFor(order, [{ materialLineId: lineOf(order, steel)._id, quantity: 90 }]);
    expect(await stockOf(steel._id)).toBe(0);
    await edit().editIssue(ctx, issue._id, { ...FULL, revision: 0, lines: [{ materialLineId: lineOf(order, steel)._id, quantity: 88 }] }, BASIC);
    expect(await stockOf(steel._id)).toBe(2);
  });

  test('more than the order needs still needs the over-issue override', async () => {
    const { motor, fan } = await setup();
    const order = await releasedOrder(fan, 10);
    const issue = await issueFor(order, [{ materialLineId: lineOf(order, motor)._id, quantity: 10 }]);
    const lines = [{ materialLineId: lineOf(order, motor)._id, quantity: 12 }];
    const err = await edit().editIssue(ctx, issue._id, { ...FULL, revision: 0, lines }, BASIC).catch((e) => e);
    expect(err.errorCode).toBe('ISSUE_WARNINGS');
    await edit().editIssue(ctx, issue._id, { ...FULL, revision: 0, lines, overrides: ['exceeds_remaining'] }, ALL);
    expect(await stockOf(motor._id)).toBe(108);
  });

  test('line changes are blocked once its material was used', async () => {
    const { motor, bearing, steel, fan } = await setup();
    await ManufacturingSettings.updateOne({ organizationId: ORG }, { $set: { requireQualityCheck: false } });
    const order = await releasedOrder(fan, 10);
    const lines = [
      { materialLineId: lineOf(order, motor)._id, quantity: 10 },
      { materialLineId: lineOf(order, bearing)._id, quantity: 20 },
      { materialLineId: lineOf(order, steel)._id, quantity: 5.5 },
    ];
    const issue = await issueFor(order, lines);
    await manufacturing.execution.reportOutput(ctx, order._id, { producedQuantity: 2 });
    const err = await edit()
      .editIssue(ctx, issue._id, { ...FULL, revision: 0, lines: [{ ...lines[0], quantity: 9 }, lines[1], lines[2]] }, BASIC)
      .catch((e) => e);
    expect(err.errorCode).toBe('VOUCHER_LOCKED');
  });

  test('batch item: the batch gets its own quantity back', async () => {
    await setup();
    const fanB = await insertProduct('Battery Fan', { productType: 'finished_good' });
    const total = 5;
    const cell = await insertProduct('Cell', { productType: 'component', stockQuantity: total, cost: 5 });
    const [variant] = await ProductVariant.create([{ organizationId: ORG, branchId: BRANCH, productId: cell._id, isDefault: true, price: 10, cost: 5, trackBatch: true }]);
    const [inventory] = await Inventory.create([{ organizationId: ORG, branchId: BRANCH, productId: cell._id, variantId: variant._id, quantity: total }]);
    const [batch] = await Batch.create([{ organizationId: ORG, inventoryId: inventory._id, batchNumber: 'B1', quantity: total, costPerUnit: 5 }]);
    await manufacturing.bom.createBom(ctx, { productId: fanB._id, components: [{ productId: cell._id, quantity: 1 }] });
    const order = await releasedOrder(fanB, 5);
    const issue = await issueFor(order, [{ materialLineId: lineOf(order, cell)._id, quantity: 5 }]);
    expect((await Batch.findById(batch._id).lean()).quantity).toBe(0);
    await edit().editIssue(ctx, issue._id, { ...FULL, revision: 0, lines: [{ materialLineId: lineOf(order, cell)._id, quantity: 3 }] }, BASIC);
    expect((await Batch.findById(batch._id).lean()).quantity).toBe(2);
    await edit().cancelIssue(ctx, issue._id, { reason: 'batch test' });
    expect((await Batch.findById(batch._id).lean()).quantity).toBe(5);
  });
});
