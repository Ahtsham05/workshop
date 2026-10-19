const mongoose = require('mongoose');
const {
  Product,
  ProductVariant,
  Inventory,
  Batch,
  Bom,
  ProductionOrder,
  ManufacturingSettings,
  InventoryTransaction,
  Invoice,
  Supplier,
  User,
} = require('../../src/models');
const manufacturing = require('../../src/services/manufacturing');
const batchService = require('../../src/services/batch.service');
const batchReports = require('../../src/services/manufacturing/batchReports.service');

/**
 * The manufacturing batch (lot) system: production orders get a finished-goods batch
 * number, receipts go into it (expiry from the product's shelf life, weighted cost on
 * top-ups), products switch batch tracking on from manufacturing, and the batch reports
 * (stock & expiry, one batch's ledger + genealogy). Needs a replica set (transactions).
 */
const REPLSET_URL = process.env.MONGODB_TEST_REPLSET_URL;
const describeTx = REPLSET_URL ? describe : describe.skip;

beforeAll(async () => {
  if (REPLSET_URL) await mongoose.connect(REPLSET_URL);
  await Promise.all([Bom, ProductionOrder, Batch].map((m) => REPLSET_URL && m.syncIndexes()));
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
const report = (name, q = {}) => manufacturing.reports.getReport(ctx, name, q);

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
    productType: 'raw_material',
    defaultBomId: null,
    ...overrides,
  };
  await Product.collection.insertOne(doc);
  return doc;
};

const batchTracked = async (product, batches = [], { trackExpiry = false } = {}) => {
  const [variant] = await ProductVariant.create([
    {
      organizationId: ORG,
      branchId: BRANCH,
      productId: product._id,
      isDefault: true,
      unit: product.unit,
      price: 1,
      cost: product.cost,
      trackBatch: true,
      trackExpiry,
    },
  ]);
  const total = batches.reduce((s, b) => s + b.quantity, 0);
  const [inventory] = await Inventory.create([
    { organizationId: ORG, branchId: BRANCH, productId: product._id, variantId: variant._id, quantity: total },
  ]);
  const created = batches.length
    ? await Batch.create(
        batches.map((b) => ({ organizationId: ORG, inventoryId: inventory._id, costPerUnit: product.cost, ...b }))
      )
    : [];
  await Product.updateOne({ _id: product._id }, { $set: { stockQuantity: total } });
  return { variant, inventory, batches: created };
};

/** Juice = 2 kg sugar (batch-tracked, bought from Sweet Co) per bottle. */
const setup = async () => {
  await User.collection.insertOne({ _id: USER, organizationId: ORG, name: 'Floor Manager', email: 'floor@example.com' });
  await ManufacturingSettings.create({ organizationId: ORG, requireQualityCheck: false });
  const supplier = await Supplier.create({ organizationId: ORG, branchId: BRANCH, name: 'Sweet Co' });
  const sugar = await insertProduct('Sugar', { cost: 4, unit: 'kg' });
  const sugarStock = await batchTracked(sugar, [
    { batchNumber: 'SUG-OLD', quantity: 30, expiryDate: new Date(Date.now() + 10 * 86400000), supplierId: supplier._id },
    { batchNumber: 'SUG-NEW', quantity: 100, expiryDate: new Date(Date.now() + 200 * 86400000), supplierId: supplier._id },
  ]);
  const juice = await insertProduct('Mango Juice', { productType: 'finished_good', cost: 0, shelfLifeDays: 90 });
  await batchTracked(juice, [], { trackExpiry: true });
  await manufacturing.bom.createBom(ctx, {
    productId: juice._id,
    components: [{ productId: sugar._id, quantity: 2, unit: 'kg' }],
  });
  return { supplier, sugar, sugarStock, juice };
};

const release = async (productId, quantity, extra = {}) => {
  const order = await po().createOrder(ctx, { productId, plannedQuantity: quantity, ...extra });
  await po().changeStatus(ctx, order._id, { status: 'released' });
  return ProductionOrder.findById(order._id);
};

describeTx('Manufacturing batch system', () => {
  test('orders get a dated batch number, a typed one is kept, duplicates are refused', async () => {
    const { juice } = await setup();
    const a = await po().createOrder(ctx, { productId: juice._id, plannedQuantity: 5 });
    const b = await po().createOrder(ctx, { productId: juice._id, plannedQuantity: 5 });
    expect(a.batchNumber).toMatch(/^B\d{6}-001$/);
    expect(b.batchNumber).toMatch(/^B\d{6}-002$/);

    const typed = await po().createOrder(ctx, { productId: juice._id, plannedQuantity: 5, batchNumber: ' MJ-77 ' });
    expect(typed.batchNumber).toBe('MJ-77');
    await expect(po().createOrder(ctx, { productId: juice._id, plannedQuantity: 5, batchNumber: 'MJ-77' })).rejects.toThrow(
      /already used by/
    );

    await ManufacturingSettings.updateOne({ organizationId: ORG }, { $set: { batchNumbering: 'order' } });
    const byOrder = await po().createOrder(ctx, { productId: juice._id, plannedQuantity: 5 });
    expect(byOrder.batchNumber).toBe(byOrder.orderNumber);

    // Multi-product entry and search by batch number.
    const [made] = await manufacturing.productionOrderBatch.createBatch(ctx, {
      header: {},
      lines: [{ productId: String(juice._id), plannedQuantity: 3, batchNumber: 'MJ-88' }],
    });
    expect(made.batchNumber).toBe('MJ-88');
    const found = await po().queryOrders(ctx, { search: 'MJ-8' }, {});
    expect(found.results.map((o) => o.batchNumber)).toEqual(['MJ-88']);
  });

  test('receipts go into the order batch with shelf-life expiry; the number is fixed once received', async () => {
    const { juice, sugarStock } = await setup();
    const [oldSugar, newSugar] = sugarStock.batches;
    await Batch.updateOne({ _id: newSugar._id }, { $set: { costPerUnit: 6 } });
    const order = await release(juice._id, 20, { batchNumber: 'MJ-01' });
    await po().updateOrder(ctx, order._id, { batchNumber: 'MJ-02' });
    expect((await ProductionOrder.findById(order._id)).batchNumber).toBe('MJ-02');

    await ex().issueMaterials(ctx, order._id, {
      lines: [{ materialLineId: order.materials[0]._id, quantity: 20, batches: [{ batchId: oldSugar._id, quantity: 20 }] }],
    });
    await ex().reportOutput(ctx, order._id, { producedQuantity: 4, finishedGoods: { manufactureDate: '2026-10-01' } });
    const batch = await Batch.findOne({ batchNumber: 'MJ-02' }).lean();
    expect(batch).toMatchObject({ quantity: 4, costPerUnit: 8, productionOrderId: order._id });
    expect(batch.expiryDate.toISOString().slice(0, 10)).toBe('2026-12-30'); // + 90 days shelf life

    await expect(po().updateOrder(ctx, order._id, { batchNumber: 'MJ-03' })).rejects.toThrow(/fixed once/);

    // 10 more: 12 kg of the old sugar left on the floor (at 4) + 8 kg of the new (at 6) →
    // 9.6 a bottle; the batch cost becomes the weighted average (4 × 8 + 10 × 9.6) / 14.
    await ex().issueMaterials(ctx, order._id, {
      lines: [{ materialLineId: order.materials[0]._id, quantity: 8, batches: [{ batchId: newSugar._id, quantity: 8 }] }],
    });
    await ex().reportOutput(ctx, order._id, { producedQuantity: 10 });
    const after = await Batch.findById(batch._id).lean();
    expect(after.quantity).toBe(14);
    expect(after.costPerUnit).toBeCloseTo((4 * 8 + 10 * 9.6) / 14, 2);
  });

  test('tracking is switched on from manufacturing (opening batch), listed and filtered', async () => {
    const { juice } = await setup();
    const salt = await insertProduct('Salt', { stockQuantity: 12, cost: 2 });
    const board = await insertProduct('Board', { trackSerial: true });
    await manufacturing.products.updateAttributes(ctx, salt._id, {
      trackBatch: true,
      trackExpiry: true,
      shelfLifeDays: 365,
    });
    const opening = await Batch.find({}).lean();
    expect(opening.filter((b) => /^OPENING-/.test(b.batchNumber)).map((b) => b.quantity)).toEqual([12]);
    expect((await Product.findById(salt._id).lean()).stockQuantity).toBe(12); // not double counted

    const list = await manufacturing.products.queryProducts(ctx, { tracking: 'batch' }, { limit: 50 });
    const byName = Object.fromEntries(list.results.map((p) => [p.name, p]));
    expect(Object.keys(byName).sort()).toEqual(['Mango Juice', 'Salt', 'Sugar']);
    expect(byName.Salt).toMatchObject({
      shelfLifeDays: 365,
      tracking: { trackBatch: true, trackExpiry: true, batchCount: 1 },
    });
    expect(byName.Sugar.tracking.batchCount).toBe(2);
    const untracked = await manufacturing.products.queryProducts(ctx, { tracking: 'none' }, { limit: 50 });
    expect(untracked.results.map((p) => p.name)).toEqual(['Board']);

    await expect(
      manufacturing.products.updateAttributes(ctx, salt._id, { trackBatch: false, trackExpiry: false })
    ).rejects.toThrow(/still has stock in 1 batch/);
    await expect(manufacturing.products.updateAttributes(ctx, board._id, { trackBatch: true })).rejects.toThrow(
      /serial number/
    );
    const bulk = await manufacturing.products.bulkTracking(ctx, {
      productIds: [String(board._id), String(juice._id)],
      trackBatch: true,
    });
    expect(bulk.updated).toBe(1);
    expect(bulk.failed.map((f) => f.name)).toEqual(['Board']);

    const overview = await manufacturing.products.getProductOverview(ctx, String(salt._id));
    expect(overview.tracking.trackBatch).toBe(true);
    expect(overview.batches.map((b) => [b.quantity, b.source.kind])).toEqual([[12, 'opening']]);
  });

  test('batch stock report: states, kinds and expiry filter', async () => {
    const { sugar } = await setup();
    await Batch.updateOne({ batchNumber: 'SUG-NEW' }, { $set: { expiryDate: new Date(Date.now() - 2 * 86400000) } });
    const all = await report('batch-stock');
    expect(all.rows.map((r) => [r.batchNumber, r.state, r.source.party])).toEqual([
      ['SUG-NEW', 'expired', 'Sweet Co'],
      ['SUG-OLD', 'expiring', 'Sweet Co'],
    ]);
    expect(all.totals).toMatchObject({
      batches: 2,
      expiredCount: 1,
      expiredValue: 400,
      expiringCount: 1,
      expiringValue: 120,
    });
    expect((await report('batch-stock', { kind: 'finished' })).rows).toEqual([]);
    expect((await report('batch-stock', { expiry: 'expired' })).rows.map((r) => r.batchNumber)).toEqual(['SUG-NEW']);
    expect((await report('batch-stock', { search: 'old' })).rows.map((r) => r.batchNumber)).toEqual(['SUG-OLD']);
    expect((await report('batch-stock', { productId: String(sugar._id) })).byProduct[0]).toMatchObject({
      batches: 2,
      quantity: 130,
    });
  });

  test('batch trace: raw batch → orders it went into; FG batch → its materials and customers', async () => {
    const { juice, sugarStock } = await setup();
    const order = await release(juice._id, 10, { batchNumber: 'MJ-10' });
    const [old] = sugarStock.batches;
    await ex().issueMaterials(ctx, order._id, {
      lines: [{ materialLineId: order.materials[0]._id, quantity: 20, batches: [{ batchId: old._id, quantity: 20 }] }],
    });
    await ex().reportOutput(ctx, order._id, { producedQuantity: 10 });

    const raw = await report('batch-trace', { batchId: String(old._id) });
    expect(raw.batch).toMatchObject({
      batchNumber: 'SUG-OLD',
      quantity: 10,
      source: { kind: 'purchase', party: 'Sweet Co' },
    });
    expect(raw.summary).toMatchObject({ received: 30, issuedToProduction: 20, balance: 10 });
    expect(raw.movements.map((m) => [m.label, m.quantityIn, m.quantityOut, m.balance])).toEqual([
      ['Opening / not itemised', 30, 0, 30],
      ['Issued to production', 0, 20, 10],
    ]);
    expect(raw.usedIn).toEqual([
      expect.objectContaining({
        orderNumber: order.orderNumber,
        quantityUsed: 20,
        produced: [expect.objectContaining({ batchNumber: 'MJ-10', quantity: 10 })],
      }),
    ]);

    // Sell 3 the new way (ledger row carries the batch) and 2 the old way (invoice only).
    const fg = await Batch.findOne({ batchNumber: 'MJ-10' });
    const invoiceDoc = (number, qty) => ({
      _id: id(),
      organizationId: ORG,
      branchId: BRANCH,
      invoiceNumber: number,
      // INV-2 is the later sale.
      invoiceDate: new Date(Date.now() + (number === 'INV-2' ? 60000 : 0)),
      customerName: number === 'INV-1' ? 'Ali Traders' : 'Bilal Store',
      status: 'paid',
      type: 'sale',
      items: [{ batchId: fg._id, batchNumber: 'MJ-10', quantity: qty }],
    });
    const inv1 = invoiceDoc('INV-1', 3);
    const inv2 = invoiceDoc('INV-2', 2);
    await Invoice.collection.insertMany([inv1, inv2]);
    await batchService.sellFromBatch(fg._id, 3, { refType: 'Invoice', refId: inv1._id });
    await Batch.updateOne({ _id: fg._id }, { $inc: { quantity: -2 } });
    expect(await InventoryTransaction.countDocuments({ batchId: fg._id, type: 'sale' })).toBe(1);

    const made = await report('batch-trace', { batchId: String(fg._id) });
    expect(made.batch).toMatchObject({ quantity: 5, source: { kind: 'production', label: order.orderNumber } });
    expect(made.summary).toMatchObject({ received: 10, sold: 5, balance: 5, other: 0 });
    expect(made.movements.map((m) => [m.label, m.number, m.party, m.balance])).toEqual([
      ['Produced', expect.stringMatching(/^FG-/), order.orderNumber, 10],
      ['Sold', 'INV-1', 'Ali Traders', 7],
      ['Sold', 'INV-2', 'Bilal Store', 5],
    ]);
    expect(made.madeFrom).toEqual([
      expect.objectContaining({
        orderNumber: order.orderNumber,
        receivedIntoBatch: 10,
        materials: [
          expect.objectContaining({
            productName: 'Sugar',
            quantity: 20,
            batchNumber: 'SUG-OLD',
            sources: [{ kind: 'purchase', label: 'Sweet Co' }],
          }),
        ],
      }),
    ]);
    expect(made.soldTo.map((s) => [s.number, s.customer, s.quantity])).toEqual([
      ['INV-1', 'Ali Traders', 3],
      ['INV-2', 'Bilal Store', 2],
    ]);

    const picked = await batchReports.searchBatches(ctx, { search: 'mango' });
    expect(picked.map((b) => b.batchNumber)).toEqual(['MJ-10']);
  });

  describe('issuing more than one batch holds', () => {
    const miv = () => manufacturing.materialIssueVoucher;
    const ALL = { executeProduction: true, overIssueMaterials: true, manageManufacturingSettings: true };
    const voucher = (order, lines) => ({
      productionOrderId: String(order._id),
      sourceLocation: 'Raw Material Store',
      wipLocation: 'Production Floor',
      lines,
    });

    test('a picked batch that is short is split over a second batch, batch for batch', async () => {
      const { juice, sugarStock } = await setup();
      const [oldSugar, newSugar] = sugarStock.batches; // 30 + 100
      const order = await release(juice._id, 25); // 50 kg sugar
      const line = order.materials[0];
      const body = voucher(order, [
        {
          materialLineId: String(line._id),
          quantity: 50,
          batches: [
            { batchId: String(oldSugar._id), quantity: 30 },
            { batchId: String(newSugar._id), quantity: 20 },
          ],
        },
      ]);
      const check = await miv().checkVoucher(ctx, body);
      expect(check.rows).toEqual([]);
      expect(check.notes.map((x) => x.message)).toEqual([
        expect.stringMatching(/Split over 2 batches: SUG-OLD × 30, SUG-NEW × 20/),
      ]);
      const issue = await miv().postVoucher(ctx, body, ALL);
      expect(issue.lines.map((l) => [l.batchNumber, l.quantity])).toEqual([
        ['SUG-OLD', 30],
        ['SUG-NEW', 20],
      ]);
      const [o, n] = await Promise.all([Batch.findById(oldSugar._id).lean(), Batch.findById(newSugar._id).lean()]);
      expect([o.quantity, o.status, n.quantity]).toEqual([0, 'depleted', 80]);
    });

    test('a split that does not add up, or asks a batch for more than it has, is refused per row', async () => {
      const { juice, sugarStock } = await setup();
      const [oldSugar, newSugar] = sugarStock.batches;
      const order = await release(juice._id, 25);
      const line = String(order.materials[0]._id);
      let check = await miv().checkVoucher(
        ctx,
        voucher(order, [{ materialLineId: line, quantity: 50, batches: [{ batchId: String(oldSugar._id), quantity: 30 }] }])
      );
      expect(check.rows).toEqual([
        expect.objectContaining({
          field: 'batchId',
          message: expect.stringMatching(/add up to 30 kg — the line issues 50/),
        }),
      ]);
      check = await miv().checkVoucher(
        ctx,
        voucher(order, [
          {
            materialLineId: line,
            quantity: 50,
            batches: [
              { batchId: String(oldSugar._id), quantity: 40 },
              { batchId: String(newSugar._id), quantity: 10 },
            ],
          },
        ])
      );
      expect(check.rows.map((r) => r.message)).toEqual([expect.stringMatching(/SUG-OLD has only 30 kg, 40 asked/)]);
    });

    test('FEFO splits on its own; with too little batch stock it names the stock that has no batch', async () => {
      const { juice, sugar, sugarStock } = await setup();
      const order = await release(juice._id, 25);
      const line = String(order.materials[0]._id);
      let check = await miv().checkVoucher(ctx, voucher(order, [{ materialLineId: line, quantity: 50 }]));
      expect(check.notes[0].message).toMatch(/FEFO will take SUG-OLD × 30, SUG-NEW × 20/);

      // 40 kg more in stock that no batch accounts for (e.g. tracking turned on with stock there).
      await Inventory.updateOne({ _id: sugarStock.inventory._id }, { $inc: { quantity: 40 } });
      await Product.updateOne({ _id: sugar._id }, { $inc: { stockQuantity: 40 } });
      check = await miv().checkVoucher(ctx, voucher(order, [{ materialLineId: line, quantity: 150 }]));
      expect(check.rows[0].message).toMatch(/batches hold only 130 kg, 150 needed\. 40 kg in stock have no batch/);

      const overview = await manufacturing.products.getProductOverview(ctx, String(sugar._id));
      expect(overview.tracking.unbatchedQuantity).toBe(40);
      const made = await manufacturing.products.batchUnbatchedStock(ctx, String(sugar._id), {});
      expect(made).toMatchObject({ quantity: 40, batchNumber: expect.stringMatching(/^OPENING-\d{8}$/) });
      expect((await Inventory.findById(sugarStock.inventory._id).lean()).quantity).toBe(170); // unchanged
      await expect(manufacturing.products.batchUnbatchedStock(ctx, String(sugar._id), {})).rejects.toThrow(
        /already in batches/
      );
      check = await miv().checkVoucher(ctx, voucher(order, [{ materialLineId: line, quantity: 150 }]));
      expect(check.rows).toEqual([]);
    });
  });

  test('turning tracking on when the inventory row already holds the stock leaves no stock without a batch', async () => {
    await setup();
    const wax = await insertProduct('Wax', { stockQuantity: 25, cost: 3 });
    const [variant] = await ProductVariant.create([
      { organizationId: ORG, branchId: BRANCH, productId: wax._id, isDefault: true, price: 1, cost: 3 },
    ]);
    await Inventory.create([
      { organizationId: ORG, branchId: BRANCH, productId: wax._id, variantId: variant._id, quantity: 25 },
    ]);
    await manufacturing.products.updateAttributes(ctx, wax._id, { trackBatch: true });
    const inv = await Inventory.findOne({ productId: wax._id }).lean();
    const lots = await Batch.find({ inventoryId: inv._id }).lean();
    expect([inv.quantity, lots.map((b) => b.quantity)]).toEqual([25, [25]]);
    const overview = await manufacturing.products.getProductOverview(ctx, String(wax._id));
    expect(overview.tracking).toMatchObject({ batchCount: 1, unbatchedQuantity: 0 });
  });
});
