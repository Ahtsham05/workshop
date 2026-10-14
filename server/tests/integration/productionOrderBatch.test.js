const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { Product, Bom, ProductionOrder, ManufacturingSettings, User } = require('../../src/models');
const manufacturing = require('../../src/services/manufacturing');

/**
 * Several production orders from one entry grid: per-row checks, header defaults with
 * row overrides, a material preview where rows compete for the same stock, and
 * all-or-nothing creation (numbers included). Creation runs in a transaction, so those
 * cases need MONGODB_TEST_REPLSET_URL, like the other manufacturing transaction tests.
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
  await Promise.all([Bom, ProductionOrder].map((m) => m.syncIndexes()));
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
const svc = manufacturing.productionOrderBatch;

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

/** Ceiling fan and pedestal fan both need motors (1 each); 15 motors on hand. */
const setup = async () => {
  await User.collection.insertOne({ _id: USER, organizationId: ORG, name: 'Planner' });
  const motor = await insertProduct('Motor', { stockQuantity: 15 });
  const blade = await insertProduct('Blade', { stockQuantity: 100 });
  const ceiling = await insertProduct('Ceiling Fan', { productType: 'finished_good' });
  const pedestal = await insertProduct('Pedestal Fan', { productType: 'finished_good' });
  const noBom = await insertProduct('Table Lamp', { productType: 'finished_good' });
  const ceilingBom = await manufacturing.bom.createBom(ctx, {
    productId: ceiling._id,
    components: [
      { productId: motor._id, quantity: 1 },
      { productId: blade._id, quantity: 3 },
    ],
  });
  await manufacturing.bom.createBom(ctx, { productId: pedestal._id, components: [{ productId: motor._id, quantity: 1 }] });
  return { motor, blade, ceiling, pedestal, noBom, ceilingBom };
};

const header = {
  plannedStartDate: '2026-11-01',
  plannedCompletionDate: '2026-11-05',
  priority: 'high',
  operatorId: String(USER),
  sourceLocation: 'Store A',
  wipLocation: 'Floor 1',
  finishedGoodsLocation: 'FG Store',
  notes: 'November plan',
  status: 'planned',
};

test('check: every row problem at once, on the right cell', async () => {
  const { ceiling, noBom } = await setup();
  const check = await svc.checkBatch(ctx, {
    header,
    lines: [
      { productId: String(ceiling._id), plannedQuantity: 10 },
      { productId: String(noBom._id), plannedQuantity: 5 },
      { productId: String(ceiling._id), plannedQuantity: 0 },
      { productId: null, plannedQuantity: 1 },
      {
        productId: String(ceiling._id),
        plannedQuantity: 2,
        plannedStartDate: '2026-12-10',
        plannedCompletionDate: '2026-12-01',
      },
    ],
  });
  expect(check.rows.map((r) => [r.line, r.field])).toEqual([
    [2, 'bomId'],
    [3, 'plannedQuantity'],
    [4, 'product'],
    [5, 'plannedCompletionDate'],
  ]);
  expect(check.rows[0].message).toMatch(/Table Lamp" has no BOM/);
});

test('check: material preview — rows compete for stock, and open orders already hold some', async () => {
  const { ceiling, pedestal } = await setup();
  // An existing planned order holds 5 motors → 10 free.
  await manufacturing.productionOrder.createOrder(ctx, { productId: pedestal._id, plannedQuantity: 5, status: 'planned' });
  const check = await svc.checkBatch(ctx, {
    header,
    lines: [
      { productId: String(ceiling._id), plannedQuantity: 8 },
      { productId: String(pedestal._id), plannedQuantity: 4 },
    ],
  });
  expect(check.rows).toEqual([]);
  expect(check.lines[0]).toMatchObject({ components: 2, shortages: [] });
  // 10 free − 8 for row 1 = 2 left for row 2, which needs 4.
  expect(check.lines[1].shortages).toEqual([
    expect.objectContaining({ productName: 'Motor', required: 4, available: 2, short: 2, onHand: 15, heldByOpenOrders: 5 }),
  ]);
});

describeTx('create (transactional)', () => {
  test('one order per row: header defaults, row overrides, consecutive numbers', async () => {
    const { ceiling, pedestal, ceilingBom } = await setup();
    const orders = await svc.createBatch(ctx, {
      header,
      lines: [
        { productId: String(ceiling._id), plannedQuantity: 10 },
        {
          productId: String(pedestal._id),
          plannedQuantity: 4,
          priority: 'urgent',
          plannedCompletionDate: '2026-11-03',
          notes: 'Rush',
        },
      ],
    });
    expect(orders.map((o) => o.orderNumber)).toEqual(['MO-00001', 'MO-00002']);
    expect(orders[0]).toMatchObject({
      status: 'planned',
      priority: 'high',
      plannedQuantity: 10,
      sourceLocation: 'Store A',
      wipLocation: 'Floor 1',
      finishedGoodsLocation: 'FG Store',
      notes: 'November plan',
      operatorName: 'Planner',
    });
    expect(String(orders[0].bomId)).toBe(String(ceilingBom._id));
    expect(orders[0].materials).toHaveLength(2);
    expect(orders[1]).toMatchObject({ priority: 'urgent', notes: 'November plan\nRush' });
    expect(orders[1].plannedCompletionDate.toISOString().slice(0, 10)).toBe('2026-11-03');
    expect(await ProductionOrder.countDocuments()).toBe(2);
  });

  test('any bad row → no order is created and no number is used', async () => {
    const { ceiling, noBom } = await setup();
    await expect(
      svc.createBatch(ctx, {
        header,
        lines: [
          { productId: String(ceiling._id), plannedQuantity: 10 },
          { productId: String(noBom._id), plannedQuantity: 5 },
        ],
      })
    ).rejects.toMatchObject({ errorCode: 'ROW_ERRORS' });
    expect(await ProductionOrder.countDocuments()).toBe(0);
  });

  test('a failure while saving rolls back every order and the counter', async () => {
    const { ceiling, pedestal } = await setup();
    const real = ProductionOrder.create.bind(ProductionOrder);
    let calls = 0;
    const spy = jest.spyOn(ProductionOrder, 'create').mockImplementation(async (...args) => {
      calls += 1;
      if (calls === 2) throw new Error('disk full');
      return real(...args);
    });
    await expect(
      svc.createBatch(ctx, {
        header,
        lines: [
          { productId: String(ceiling._id), plannedQuantity: 1 },
          { productId: String(pedestal._id), plannedQuantity: 1 },
        ],
      })
    ).rejects.toThrow(/disk full/);
    spy.mockRestore();
    expect(await ProductionOrder.countDocuments()).toBe(0);
    expect((await ManufacturingSettings.findOne({ organizationId: ORG })).counters.productionOrder).toBe(0);
    // The next order still gets number 1.
    const [order] = await svc.createBatch(ctx, { header, lines: [{ productId: String(ceiling._id), plannedQuantity: 1 }] });
    expect(order.orderNumber).toBe('MO-00001');
  });

  test('tenant isolation: another organization’s product is a row error', async () => {
    await setup();
    const foreign = await insertProduct('Foreign Fan', { organizationId: id(), productType: 'finished_good' });
    const check = await svc.checkBatch(ctx, { header, lines: [{ productId: String(foreign._id), plannedQuantity: 1 }] });
    expect(check.rows[0]).toMatchObject({ line: 1, field: 'product', message: expect.stringMatching(/not found/) });
  });
});
