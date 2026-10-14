const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  Product,
  ProductVariant,
  Inventory,
  InventoryTransaction,
  Batch,
  Imei,
  Bom,
  ProductionOrder,
  MaterialIssue,
  User,
} = require('../../src/models');
const manufacturing = require('../../src/services/manufacturing');

/**
 * Phase 10 — Material Issue Voucher (MIV): check (per-row errors, overridable warnings),
 * post (store → WIP through the one issue pipeline, all-or-nothing), voucher header and
 * full ledger linkage. Transactions need a replica set (MONGODB_TEST_REPLSET_URL), like
 * the other manufacturing stock tests.
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
  await Promise.all([Bom, ProductionOrder, MaterialIssue, Batch].map((m) => m.syncIndexes()));
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
const ALL = { overIssueMaterials: true, manageManufacturingSettings: true, executeProduction: true };
const BASIC = { executeProduction: true };

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

const insertBatchProduct = async (name, batches) => {
  const total = batches.reduce((s, b) => s + b.quantity, 0);
  const product = await insertProduct(name, { productType: 'raw_material', cost: 5, stockQuantity: total });
  const [variant] = await ProductVariant.create([
    { organizationId: ORG, branchId: BRANCH, productId: product._id, isDefault: true, price: 10, cost: 5, trackBatch: true },
  ]);
  const [inventory] = await Inventory.create([
    { organizationId: ORG, branchId: BRANCH, productId: product._id, variantId: variant._id, quantity: total },
  ]);
  const created = await Batch.create(
    batches.map((b) => ({ organizationId: ORG, inventoryId: inventory._id, costPerUnit: 5, ...b }))
  );
  return { product, inventory, batches: created };
};

/** Spec example: Motor 100 needed / 120 on hand, Bearing 200 / 500, Steel 100 / 90. */
const setup = async () => {
  await User.collection.insertOne({ _id: USER, organizationId: ORG, name: 'Store Keeper', email: 'store@example.com' });
  const motor = await insertProduct('Motor', { stockQuantity: 120, cost: 20 });
  const bearing = await insertProduct('Bearing', { stockQuantity: 500, cost: 2 });
  const steel = await insertProduct('Steel', { productType: 'raw_material', stockQuantity: 90, cost: 10 });
  const fan = await insertProduct('Pedestal Fan', { productType: 'finished_good' });
  await manufacturing.bom.createBom(ctx, {
    productId: fan._id,
    components: [
      { productId: motor._id, quantity: 1 },
      { productId: bearing._id, quantity: 2 },
      { productId: steel._id, quantity: 1 },
    ],
  });
  const created = await manufacturing.productionOrder.createOrder(ctx, {
    productId: fan._id,
    plannedQuantity: 100,
    sourceLocation: 'Raw Material Store',
    wipLocation: 'Production Floor',
  });
  const order = await manufacturing.productionOrder.changeStatus(ctx, created._id, { status: 'released' });
  const lineOf = (p) => order.materials.find((m) => String(m.productId) === String(p._id));
  return { motor, bearing, steel, fan, order, lineOf };
};

const voucher = (order, lines, extra = {}) => ({
  productionOrderId: String(order._id),
  sourceLocation: 'Raw Material Store',
  wipLocation: 'Production Floor',
  reference: 'REQ-77',
  notes: 'Shift A',
  lines,
  ...extra,
});

describeTx('Material Issue Voucher', () => {
  test('posts store → WIP, links every ledger row, keeps the voucher header', async () => {
    const { motor, bearing, steel, order, lineOf } = await setup();
    const doc = await svc.postVoucher(
      ctx,
      voucher(
        order,
        [
          { materialLineId: lineOf(motor)._id, quantity: 100 },
          { materialLineId: lineOf(bearing)._id, quantity: 200 },
          { materialLineId: lineOf(steel)._id, quantity: 90 },
        ],
        { requestedById: String(USER) }
      ),
      BASIC
    );
    expect(doc.issueNumber).toMatch(/^MIV-\d+/);
    expect(doc).toMatchObject({
      sourceLocation: 'Raw Material Store',
      wipLocation: 'Production Floor',
      reference: 'REQ-77',
      notes: 'Shift A',
    });
    expect(doc.requestedBy.name).toBe('Store Keeper');
    expect(doc.issuedBy.name).toBe('Store Keeper');
    expect([await stockOf(motor._id), await stockOf(bearing._id), await stockOf(steel._id)]).toEqual([20, 300, 0]);

    const rows = await InventoryTransaction.find({ refId: doc._id }).lean();
    expect(rows).toHaveLength(6);
    rows.forEach((r) => {
      expect(r.refType).toBe('MaterialIssue');
      expect(String(r.productionOrderId)).toBe(String(order._id));
      expect(String(r.organizationId)).toBe(String(ORG));
      expect(String(r.branchId)).toBe(String(BRANCH));
      expect(String(r.createdBy)).toBe(String(USER));
    });
    expect(rows.filter((r) => r.stockBucket === 'available').every((r) => r.location === 'Raw Material Store')).toBe(true);
    expect(rows.filter((r) => r.stockBucket === 'wip').every((r) => r.location === 'Production Floor')).toBe(true);

    const reqs = await manufacturing.productionOrder.getOrderRequirements(ctx, order._id);
    expect(reqs.lines.find((l) => l.productId === String(steel._id)).outstandingQuantity).toBe(10);
  });

  test('check reports every problem per row; nothing is posted while any row fails', async () => {
    const { motor, bearing, steel, order, lineOf } = await setup();
    const body = voucher(order, [
      { materialLineId: lineOf(motor)._id, quantity: 100 },
      { materialLineId: lineOf(bearing)._id, quantity: 0 },
      { materialLineId: lineOf(steel)._id, quantity: 100 }, // only 90 on hand
      { materialLineId: id(), quantity: 1 },
    ]);
    const check = await svc.checkVoucher(ctx, body);
    expect(check.rows.map((r) => [r.line, r.field])).toEqual([
      [2, 'quantity'],
      [3, 'quantity'],
      [4, 'product'],
    ]);
    expect(check.rows[1].message).toMatch(/Insufficient stock — 90 pcs available/);
    await expect(svc.postVoucher(ctx, body, ALL)).rejects.toMatchObject({ errorCode: 'ROW_ERRORS' });
    expect(await stockOf(motor._id)).toBe(120);
    expect(await MaterialIssue.countDocuments()).toBe(0);
  });

  test('invalid warehouse and a WIP location equal to the source are refused', async () => {
    const { motor, order, lineOf } = await setup();
    const lines = [{ materialLineId: lineOf(motor)._id, quantity: 1 }];
    let check = await svc.checkVoucher(ctx, voucher(order, lines, { sourceLocation: 'Nowhere Shed' }));
    expect(check.header.sourceLocation).toMatch(/not a warehouse location/);
    check = await svc.checkVoucher(ctx, voucher(order, lines, { wipLocation: 'Raw Material Store' }));
    expect(check.header.wipLocation).toMatch(/must differ/);
  });

  test('over-issue is a warning: needs the override AND the overIssueMaterials permission', async () => {
    const { motor, order, lineOf } = await setup();
    const body = voucher(order, [{ materialLineId: lineOf(motor)._id, quantity: 110 }]);
    const check = svc.describeCheck(await svc.checkVoucher(ctx, body), BASIC);
    expect(check.warnings).toEqual([
      expect.objectContaining({ line: 1, code: 'exceeds_remaining', permission: 'overIssueMaterials', allowed: false }),
    ]);
    await expect(svc.postVoucher(ctx, body, ALL)).rejects.toMatchObject({ errorCode: 'ISSUE_WARNINGS', statusCode: 409 });
    await expect(svc.postVoucher(ctx, { ...body, overrides: ['exceeds_remaining'] }, BASIC)).rejects.toMatchObject({
      errorCode: 'ISSUE_WARNINGS',
      statusCode: 403,
    });
    expect(await stockOf(motor._id)).toBe(120);
    const doc = await svc.postVoucher(ctx, { ...body, overrides: ['exceeds_remaining'] }, ALL);
    expect(doc.isOverIssue).toBe(true);
    expect(doc.overrides.map((o) => o.code)).toEqual(['exceeds_remaining']);
    expect(await stockOf(motor._id)).toBe(10);
  });

  test('negative stock is an error unless the setting allows it — then an overridable warning', async () => {
    const { steel, order, lineOf } = await setup();
    const body = voucher(order, [{ materialLineId: lineOf(steel)._id, quantity: 95 }]);
    expect((await svc.checkVoucher(ctx, body)).rows[0].field).toBe('quantity');
    await manufacturing.settings.updateSettings(ORG, { allowNegativeStockIssue: true }, USER);
    const check = await svc.checkVoucher(ctx, body);
    expect(check.rows).toEqual([]);
    expect(check.warnings.map((w) => w.code)).toEqual(['insufficient_stock']);
    await svc.postVoucher(ctx, { ...body, overrides: ['insufficient_stock'] }, BASIC);
    expect(await stockOf(steel._id)).toBe(-5);
  });

  test('batches: FEFO skips expired ones; an expired batch needs a supervisor override', async () => {
    const resin = await insertBatchProduct('Resin', [
      { batchNumber: 'OLD', quantity: 10, expiryDate: new Date('2020-01-01') },
      { batchNumber: 'NEW', quantity: 20, expiryDate: new Date('2099-01-01') },
    ]);
    const panel = await insertProduct('Panel', { productType: 'finished_good' });
    await manufacturing.bom.createBom(ctx, {
      productId: panel._id,
      components: [{ productId: resin.product._id, quantity: 3 }],
    });
    const created = await manufacturing.productionOrder.createOrder(ctx, { productId: panel._id, plannedQuantity: 10 });
    const order = await manufacturing.productionOrder.changeStatus(ctx, created._id, { status: 'released' });
    const line = order.materials[0];

    // 15 by FEFO: only 20 unexpired — fine, and it says which batch it'll take.
    let check = await svc.checkVoucher(ctx, voucher(order, [{ materialLineId: line._id, quantity: 15 }]));
    expect(check.warnings).toEqual([]);
    expect(check.notes[0].message).toMatch(/FEFO will take NEW × 15/);
    const doc = await svc.postVoucher(ctx, voucher(order, [{ materialLineId: line._id, quantity: 15 }]), BASIC);
    expect(doc.lines.map((l) => l.batchNumber)).toEqual(['NEW']);

    // Naming the expired batch: warning, supervisor-only.
    const old = resin.batches.find((b) => b.batchNumber === 'OLD');
    const body = voucher(order, [{ materialLineId: line._id, quantity: 5, batchId: String(old._id) }]);
    check = svc.describeCheck(await svc.checkVoucher(ctx, body), BASIC);
    expect(check.warnings[0]).toMatchObject({ code: 'expired_batch', allowed: false });
    await expect(svc.postVoucher(ctx, { ...body, overrides: ['expired_batch'] }, BASIC)).rejects.toMatchObject({
      statusCode: 403,
    });
    await svc.postVoucher(ctx, { ...body, overrides: ['expired_batch'] }, ALL);
    expect((await Batch.findById(old._id)).quantity).toBe(5);
  });

  test('serials: missing or not-in-stock serial numbers are row errors', async () => {
    const chip = await insertProduct('Controller', { stockQuantity: 2, trackSerial: true });
    await Imei.create(
      ['C-1', 'C-2'].map((imei) => ({ organizationId: ORG, branchId: BRANCH, imei, type: 'serial', productId: chip._id }))
    );
    const robot = await insertProduct('Robot', { productType: 'finished_good' });
    await manufacturing.bom.createBom(ctx, { productId: robot._id, components: [{ productId: chip._id, quantity: 1 }] });
    const created = await manufacturing.productionOrder.createOrder(ctx, { productId: robot._id, plannedQuantity: 2 });
    const order = await manufacturing.productionOrder.changeStatus(ctx, created._id, { status: 'released' });
    const line = order.materials[0];

    let check = await svc.checkVoucher(ctx, voucher(order, [{ materialLineId: line._id, quantity: 1 }]));
    expect(check.rows[0]).toMatchObject({ field: 'serials', message: expect.stringMatching(/Missing serial/) });
    check = await svc.checkVoucher(ctx, voucher(order, [{ materialLineId: line._id, serialNumbers: ['C-1', 'C-9'] }]));
    expect(check.rows[0].message).toMatch(/Not in stock: C-9/);
    const doc = await svc.postVoucher(
      ctx,
      voucher(order, [{ materialLineId: line._id, serialNumbers: ['C-1', 'C-2'] }]),
      BASIC
    );
    expect(doc.lines[0].serialNumbers).toEqual(['C-1', 'C-2']);
    expect((await Imei.findOne({ imei: 'C-2' })).status).toBe('in_production');
  });

  test('a row failing inside the transaction rolls back every row (no half-posted stock)', async () => {
    const { motor, bearing, order, lineOf } = await setup();
    const body = voucher(order, [
      { materialLineId: lineOf(motor)._id, quantity: 50 },
      { materialLineId: lineOf(bearing)._id, quantity: 200 },
    ]);
    // Row 2's first ledger write fails inside the transaction (after row 1 has moved
    // stock and written its pair): every write of the voucher must roll back.
    const stockService = require('../../src/services/manufacturing/stock.service');
    const real = stockService.writeMovement;
    let calls = 0;
    const spy = jest.spyOn(stockService, 'writeMovement').mockImplementation(async (...args) => {
      calls += 1;
      if (calls === 3) throw new Error('disk full');
      return real(...args);
    });
    await expect(svc.postVoucher(ctx, body, BASIC)).rejects.toThrow(/disk full/);
    spy.mockRestore();
    expect(await stockOf(motor._id)).toBe(120);
    expect(await InventoryTransaction.countDocuments({ productionOrderId: order._id })).toBe(0);
    expect(await MaterialIssue.countDocuments()).toBe(0);
    expect((await ProductionOrder.findById(order._id)).materials.every((m) => m.issuedQuantity === 0)).toBe(true);
  });

  test('tenant isolation: another org cannot see or issue against the order', async () => {
    const { motor, order, lineOf } = await setup();
    const other = { organizationId: id(), branchId: String(id()), createdBy: id() };
    await expect(
      svc.postVoucher(other, voucher(order, [{ materialLineId: lineOf(motor)._id, quantity: 1 }]), ALL)
    ).rejects.toThrow(/not found/);
  });
});
