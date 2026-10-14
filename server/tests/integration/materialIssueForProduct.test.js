const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  Product,
  Bom,
  ProductionOrder,
  MaterialIssue,
  ManufacturingSettings,
  InventoryTransaction,
  User,
} = require('../../src/models');
const manufacturing = require('../../src/services/manufacturing');

/**
 * Material issue for a finished good: plan (BOM exploded for a quantity), post (creates and
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

describeTx('Material issue for a finished good', () => {
  test('plan explodes the BOM for the quantity, with stock and BOM versions', async () => {
    const { motor, bearing, steel, fan, bom } = await setup();
    const plan = await svc.planForProduct(ctx, { productId: String(fan._id), quantity: 40 });
    const need = (p) => plan.lines.find((l) => l.productId === String(p._id));
    expect(need(motor)).toMatchObject({ requiredQuantity: 40, availableQuantity: 120, perUnit: 1, materialLineId: 'new:0' });
    expect(need(bearing).requiredQuantity).toBe(80);
    expect(need(steel).requiredQuantity).toBe(22); // 40 × 0.5 × 1.1
    expect(plan.bom.id).toBe(String(bom._id));
    expect(plan.boms).toHaveLength(1);
    expect(plan.openOrders).toEqual([]);
    // Nothing was created.
    expect(await ProductionOrder.countDocuments()).toBe(0);
  });

  test('posting creates + releases the order and issues against it in one go', async () => {
    const { motor, bearing, steel, fan, bom } = await setup();
    const plan = await svc.planForProduct(ctx, { productId: String(fan._id), quantity: 40 });
    const issue = await svc.postVoucher(ctx, body(fan, 40, plan), BASIC);

    const order = await ProductionOrder.findById(issue.productionOrderId).lean();
    expect(order.orderNumber).toMatch(/\d+$/);
    expect(issue.orderNumber).toBe(order.orderNumber);
    expect(order.status).toBe('in_production');
    expect(order.statusHistory.map((h) => h.to)).toEqual(['draft', 'released', 'in_production']);
    expect(order.plannedQuantity).toBe(40);
    expect(order.materials.every((m) => m.issuedQuantity === m.requiredQuantity)).toBe(true);
    expect(order.sourceLocation).toBe('Raw Material Store');
    expect((await Bom.findById(bom._id).lean()).isLocked).toBe(true);

    expect(await stockOf(motor._id)).toBe(80);
    expect(await stockOf(bearing._id)).toBe(420);
    expect(await stockOf(steel._id)).toBe(68);
    const ledger = await InventoryTransaction.find({ refId: issue._id }).lean();
    expect(ledger.every((r) => String(r.productionOrderId) === String(order._id))).toBe(true);
    expect(ledger).toHaveLength(6);

    // The product's open order now shows up in its next plan.
    const again = await svc.planForProduct(ctx, { productId: String(fan._id), quantity: 10 });
    expect(again.openOrders).toEqual([expect.objectContaining({ orderNumber: order.orderNumber, openPercent: 0 })]);
  });

  test('edited quantities: issue part now, the order keeps the rest open', async () => {
    const { motor, steel, fan } = await setup();
    const plan = await svc.planForProduct(ctx, { productId: String(fan._id), quantity: 40 });
    const lines = plan.lines
      .filter((l) => l.productId !== String(steel._id))
      .map((l) => ({ materialLineId: l.materialLineId, productId: l.productId, quantity: l.requiredQuantity / 2 }));
    const issue = await svc.postVoucher(ctx, body(fan, 40, plan, { lines }), BASIC);
    const order = await ProductionOrder.findById(issue.productionOrderId).lean();
    const line = (p) => order.materials.find((m) => String(m.productId) === String(p._id));
    expect(line(motor).issuedQuantity).toBe(20);
    expect(line(steel).issuedQuantity).toBe(0);
    expect(await stockOf(steel._id)).toBe(90);
  });

  test('a failure inside the issue rolls the new order back too', async () => {
    const { motor, fan } = await setup();
    const plan = await svc.planForProduct(ctx, { productId: String(fan._id), quantity: 40 });
    const spy = jest
      .spyOn(manufacturing.execution, 'issueMaterials')
      .mockImplementationOnce(async () => {
        throw new Error('stock moved underneath');
      });
    await expect(svc.postVoucher(ctx, body(fan, 40, plan), BASIC)).rejects.toThrow('stock moved underneath');
    spy.mockRestore();
    expect(await ProductionOrder.countDocuments()).toBe(0);
    expect(await MaterialIssue.countDocuments()).toBe(0);
    expect(await stockOf(motor._id)).toBe(120);
  });

  test('per-row problems come back before anything is created', async () => {
    const { motor, steel, fan } = await setup();
    const plan = await svc.planForProduct(ctx, { productId: String(fan._id), quantity: 200 });
    const lines = [
      { materialLineId: 'new:0', productId: String(motor._id), quantity: 200 }, // 120 on hand
      { materialLineId: 'new:1', productId: String(steel._id), quantity: 5 }, // line 1 is the bearing
      { materialLineId: 'new:9', productId: String(steel._id), quantity: 5 },
    ];
    const err = await svc.postVoucher(ctx, body(fan, 200, plan, { lines }), BASIC).catch((e) => e);
    expect(err.errorCode).toBe('ROW_ERRORS');
    expect(err.details.rows.map((r) => [r.line, r.field])).toEqual([
      [1, 'quantity'],
      [2, 'product'],
      [3, 'product'],
    ]);
    expect(await ProductionOrder.countDocuments()).toBe(0);
  });

  test('a product without a BOM is a header error', async () => {
    await setup();
    const plain = await insertProduct('Gift Box', { productType: 'finished_good' });
    const check = await svc.checkVoucher(ctx, {
      newOrder: { productId: String(plain._id), plannedQuantity: 5 },
      lines: [{ materialLineId: 'new:0', quantity: 1 }],
    });
    expect(check.header.productId).toMatch(/no BOM/);
  });

  test('usage report: issued = returned + used + wastage + in the factory', async () => {
    const { motor, steel, fan } = await setup();
    await ManufacturingSettings.updateOne({ organizationId: ORG }, { $set: { requireQualityCheck: false } });
    const plan = await svc.planForProduct(ctx, { productId: String(fan._id), quantity: 40 });
    const issue = await svc.postVoucher(ctx, body(fan, 40, plan), BASIC);
    const orderId = issue.productionOrderId;
    // 30 fans made (2 rejected), 1 kg steel wasted, 2 motors returned.
    await manufacturing.execution.reportOutput(ctx, orderId, {
      producedQuantity: 30,
      rejectedQuantity: 2,
      rejectDisposition: 'scrap',
    });
    const order = await ProductionOrder.findById(orderId);
    const steelLine = order.materials.find((m) => String(m.productId) === String(steel._id));
    await manufacturing.execution.recordScrap(ctx, {
      stage: 'material',
      productionOrderId: String(orderId),
      materialLineId: String(steelLine._id),
      quantity: 1,
      reason: 'process_loss',
    });
    const motorLot = order.wipLots.find((l) => String(l.productId) === String(motor._id));
    await manufacturing.execution.returnMaterials(ctx, orderId, { lines: [{ wipLotId: motorLot._id, quantity: 2 }] });

    const report = await manufacturing.materialUsage.getMaterialUsage(ctx, {});
    expect(report.orders).toHaveLength(1);
    const row = report.orders[0];
    expect(row).toMatchObject({ goodQuantity: 28, rejectedQuantity: 2, producedQuantity: 30 });
    const m = (p) => row.lines.find((l) => l.productId === String(p._id));
    expect(m(motor)).toMatchObject({ issued: 40, returned: 2, used: 30, wastage: 0, inFactory: 8, standard: 28 });
    expect(m(motor).variance).toBe(2); // two motors went into rejected fans
    expect(m(steel)).toMatchObject({ issued: 22, used: 16.5, wastage: 1, inFactory: 4.5 });
    row.lines.forEach((l) => {
      expect(l.returned + l.used + l.wastage + l.inFactory).toBeCloseTo(l.issued, 6);
    });
    expect(m(motor).issuedValue).toBe(800);
    expect(m(motor).inFactoryValue).toBe(160);
    expect(m(steel).wastageValue).toBe(10);

    const agg = report.materials.find((x) => x.productId === String(motor._id));
    expect(agg).toMatchObject({ issued: 40, used: 30, inFactory: 8, orderCount: 1 });
    expect(report.totals.issuedValue).toBe(800 + 160 + 220);

    const open = await manufacturing.materialUsage.getMaterialUsage(ctx, { status: 'completed' });
    expect(open.orders).toHaveLength(0);
  });
});

describeTx('Material issue by material (no finished good)', () => {
  const byMaterial = () => manufacturing.materialIssueByMaterial;
  const release = async (fan, quantity) => {
    const created = await manufacturing.productionOrder.createOrder(ctx, {
      productId: fan._id,
      plannedQuantity: quantity,
      sourceLocation: 'Raw Material Store',
      wipLocation: 'Production Floor',
    });
    return manufacturing.productionOrder.changeStatus(ctx, created._id, { status: 'released' });
  };
  const lineOf = (order, p) => order.materials.find((m) => String(m.productId) === String(p._id));
  const header = { sourceLocation: 'Raw Material Store', wipLocation: 'Production Floor' };

  test('pending lists what open orders still need, in queue order', async () => {
    const { steel, motor, fan } = await setup();
    const first = await release(fan, 10); // steel 5.5
    const second = await release(fan, 20); // steel 11
    await svc.postVoucher(ctx, { productionOrderId: String(first._id), ...header, lines: [{ materialLineId: lineOf(first, steel)._id, quantity: 2 }] }, BASIC);
    const { materials } = await byMaterial().pendingMaterials(ctx, {});
    const s = materials.find((m) => m.productId === String(steel._id));
    expect(s.outstanding).toBe(14.5);
    expect(s.available).toBe(88);
    expect(s.orders.map((o) => [o.orderNumber, o.outstanding])).toEqual([
      [first.orderNumber, 3.5],
      [second.orderNumber, 11],
    ]);
    const onlyRaw = await byMaterial().pendingMaterials(ctx, { productType: 'raw_material' });
    expect(onlyRaw.materials.map((m) => m.productId)).toEqual([String(steel._id)]);
    expect(materials.some((m) => m.productId === String(motor._id))).toBe(true);
  });

  test('auto: fills the oldest order first, then the next — one voucher per order, one transaction', async () => {
    const { steel, fan } = await setup();
    const first = await release(fan, 10);
    const second = await release(fan, 20);
    const res = await byMaterial().postByMaterial(ctx, { ...header, lines: [{ productId: String(steel._id), quantity: 10 }] }, BASIC);
    expect(res.issues).toHaveLength(2);
    expect(res.allocations[0].map((a) => [a.orderNumber, a.quantity])).toEqual([
      [first.orderNumber, 5.5],
      [second.orderNumber, 4.5],
    ]);
    const a = await ProductionOrder.findById(first._id).lean();
    const b = await ProductionOrder.findById(second._id).lean();
    expect(lineOf(a, steel).issuedQuantity).toBe(5.5);
    expect(lineOf(b, steel).issuedQuantity).toBe(4.5);
    expect(await stockOf(steel._id)).toBe(80);
    expect(await MaterialIssue.countDocuments({ kind: 'issue' })).toBe(2);
  });

  test('a chosen order takes it all', async () => {
    const { steel, fan } = await setup();
    await release(fan, 10);
    const second = await release(fan, 20);
    const res = await byMaterial().postByMaterial(
      ctx,
      { ...header, lines: [{ productId: String(steel._id), quantity: 6, orderId: String(second._id) }] },
      BASIC
    );
    expect(res.issues.map((i) => i.orderNumber)).toEqual([second.orderNumber]);
  });

  test('more than all orders need → over-issue warning; overridden, the excess goes to the first order', async () => {
    const { steel, fan } = await setup();
    const first = await release(fan, 10);
    const body = { ...header, lines: [{ productId: String(steel._id), quantity: 8 }] };
    const err = await byMaterial().postByMaterial(ctx, body, BASIC).catch((e) => e);
    expect(err.errorCode).toBe('ISSUE_WARNINGS');
    expect(err.details.warnings[0]).toMatchObject({ line: 1, code: 'exceeds_remaining' });
    await byMaterial().postByMaterial(ctx, { ...body, overrides: ['exceeds_remaining'] }, { ...BASIC, overIssueMaterials: true });
    expect(lineOf(await ProductionOrder.findById(first._id).lean(), steel).issuedQuantity).toBe(8);
  });

  test('stock is checked across the orders a line feeds', async () => {
    const { steel, fan } = await setup();
    await release(fan, 100); // steel 55
    await release(fan, 100);
    const err = await byMaterial()
      .postByMaterial(ctx, { ...header, lines: [{ productId: String(steel._id), quantity: 100 }] }, BASIC)
      .catch((e) => e);
    expect(err.errorCode).toBe('ROW_ERRORS');
    expect(err.details.rows[0]).toMatchObject({ line: 1, field: 'quantity' });
    expect(await MaterialIssue.countDocuments()).toBe(0);
  });

  test('nothing needed / unknown material → row errors', async () => {
    const { steel } = await setup();
    const err = await byMaterial()
      .postByMaterial(ctx, { ...header, lines: [{ productId: String(steel._id), quantity: 1 }] }, BASIC)
      .catch((e) => e);
    expect(err.details.rows[0].message).toMatch(/No open production order/);
  });

  test('a failure on the second order rolls back the first', async () => {
    const { steel, fan } = await setup();
    const first = await release(fan, 10);
    await release(fan, 20);
    const real = manufacturing.execution.issueMaterials;
    let calls = 0;
    const spy = jest.spyOn(manufacturing.execution, 'issueMaterials').mockImplementation(async (...args) => {
      calls += 1;
      if (calls === 2) throw new Error('second order failed');
      return real(...args);
    });
    await expect(
      byMaterial().postByMaterial(ctx, { ...header, lines: [{ productId: String(steel._id), quantity: 10 }] }, BASIC)
    ).rejects.toThrow('second order failed');
    spy.mockRestore();
    expect(await MaterialIssue.countDocuments()).toBe(0);
    expect(lineOf(await ProductionOrder.findById(first._id).lean(), steel).issuedQuantity).toBe(0);
    expect(await stockOf(steel._id)).toBe(90);
  });
});

describeTx('Receive finished goods: QC per receipt', () => {
  const made = async (qcRequired) => {
    const { fan } = await setup();
    await ManufacturingSettings.updateOne({ organizationId: ORG }, { $set: { requireQualityCheck: qcRequired } });
    const plan = await svc.planForProduct(ctx, { productId: String(fan._id), quantity: 10 });
    const issue = await svc.postVoucher(ctx, body(fan, 10, plan), BASIC);
    return { fan, orderId: issue.productionOrderId };
  };

  test('QC required, received directly: good to stock now, rejects scrapped, flagged', async () => {
    const { fan, orderId } = await made(true);
    const out = await manufacturing.execution.reportOutput(ctx, orderId, {
      producedQuantity: 6,
      qcMode: 'direct',
      goodQuantity: 5,
      rejectDisposition: 'scrap',
      rejectReason: 'dent',
    });
    expect(out.directReceipt).toBe(true);
    expect(out.status).not.toBe('pending_qc');
    expect(out).toMatchObject({ goodQuantity: 5, rejectedQuantity: 1 });
    expect(await stockOf(fan._id)).toBe(5);
    const o = await ProductionOrder.findById(orderId).lean();
    expect(o).toMatchObject({ completedQuantity: 5, qcPendingQuantity: 0, producedQuantity: 6 });
  });

  test('QC off, sent to QC anyway: waits for inspection', async () => {
    const { fan, orderId } = await made(false);
    const out = await manufacturing.execution.reportOutput(ctx, orderId, { producedQuantity: 4, qcMode: 'hold' });
    expect(out.status).toBe('pending_qc');
    expect(out.directReceipt).toBe(false);
    expect(await stockOf(fan._id)).toBe(0);
    expect((await ProductionOrder.findById(orderId).lean()).qcPendingQuantity).toBe(4);
    const inspected = await manufacturing.execution.inspectOutput(ctx, out._id, { goodQuantity: 4 });
    expect(inspected.goodQuantity).toBe(4);
    expect(await stockOf(fan._id)).toBe(4);
  });

  test('no choice: the setting decides (QC required → hold)', async () => {
    const { orderId } = await made(true);
    const out = await manufacturing.execution.reportOutput(ctx, orderId, { producedQuantity: 2 });
    expect(out.status).toBe('pending_qc');
  });
});

