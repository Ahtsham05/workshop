const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  Product,
  Bom,
  ProductionOrder,
  MaterialIssue,
  ProductionReceipt,
  ProductionOutput,
  ScrapRecord,
  User,
} = require('../../src/models');
const manufacturing = require('../../src/services/manufacturing');
const documentStorage = require('../../src/services/manufacturing/documentStorage');

/**
 * Production order detail (phase 7) — routing operations, production team, reservations,
 * costs, the activity timeline and documents. Cases that move stock need a replica set
 * (MONGODB_TEST_REPLSET_URL), like tests/integration/manufacturing.test.js.
 */
const REPLSET_URL = process.env.MONGODB_TEST_REPLSET_URL;
const describeTx = REPLSET_URL ? describe : describe.skip;

let mongod;
beforeAll(async () => {
  if (REPLSET_URL) {
    await mongoose.connect(REPLSET_URL);
  } else {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  }
  await Promise.all(
    [Bom, ProductionOrder, MaterialIssue, ProductionReceipt, ProductionOutput, ScrapRecord].map((m) => m.syncIndexes())
  );
});
beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
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
const orders = manufacturing.productionOrder;
const ops = manufacturing.operations;
const detail = manufacturing.orderDetail;

const insertUser = async (name, organizationId = ORG, _id = id()) => {
  await User.collection.insertOne({ _id, organizationId, name, email: `${_id}@example.com`, isActive: true });
  return _id;
};

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
    productType: null,
    defaultBomId: null,
    ...overrides,
  };
  await Product.collection.insertOne(doc);
  return doc;
};

const ROUTING = [
  { name: 'Cutting', workCenter: 'Press shop', setupMinutes: 30, runMinutesPerUnit: 2, costPerHour: 60 },
  { name: 'Welding', workCenter: 'Fabrication', setupMinutes: 0, runMinutesPerUnit: 3, costPerHour: 40 },
  { name: 'Painting', workCenter: 'Paint shop', setupMinutes: 15, runMinutesPerUnit: 1, costPerHour: 30 },
];

/** Industrial Fan = Motor ×1 + Steel ×1 (+ optional Remote), routed Cutting → Welding → Painting. */
const buildFan = async ({ motorStock = 100, steelStock = 100 } = {}) => {
  const motor = await insertProduct('Motor', { productType: 'component', cost: 20, stockQuantity: motorStock });
  const steel = await insertProduct('Steel', { productType: 'raw_material', cost: 5, stockQuantity: steelStock });
  const remote = await insertProduct('Remote', { productType: 'component', cost: 3, stockQuantity: 0 });
  const fan = await insertProduct('Industrial Fan', { productType: 'finished_good', cost: 60 });
  const bom = await manufacturing.bom.createBom(ctx, {
    productId: fan._id,
    components: [
      { productId: motor._id, quantity: 1 },
      { productId: steel._id, quantity: 1 },
      { productId: remote._id, quantity: 1, isOptional: true },
    ],
    operations: ROUTING,
  });
  return { motor, steel, remote, fan, bom };
};

const opNamed = (order, name) => order.operations.find((o) => o.name === name);

describe('BOM routing', () => {
  test('is saved in order, sequenced 10/20/30, editable on a locked version and copied into new versions', async () => {
    const { bom, fan } = await buildFan();
    expect(bom.operations.map((o) => [o.name, o.sequence])).toEqual([
      ['Cutting', 10],
      ['Welding', 20],
      ['Painting', 30],
    ]);

    const order = await orders.createOrder(ctx, { productId: fan._id, plannedQuantity: 10 });
    await orders.changeStatus(ctx, order._id, { status: 'released' }); // locks the BOM
    expect((await Bom.findById(bom._id)).isLocked).toBe(true);

    const edited = await manufacturing.bom.updateBom(ctx, bom._id, {
      operations: [...ROUTING, { name: 'Packing', runMinutesPerUnit: 1 }],
    });
    expect(edited.operations.map((o) => o.name)).toEqual(['Cutting', 'Welding', 'Painting', 'Packing']);

    const v2 = await manufacturing.bom.createNewVersion(ctx, bom._id, {});
    expect(v2.operations.map((o) => o.name)).toEqual(['Cutting', 'Welding', 'Painting', 'Packing']);
    expect(String(v2.operations[0]._id)).not.toBe(String(edited.operations[0]._id));
  });
});

describe('Order routing operations', () => {
  test('orders snapshot the routing with planned time = setup + run × quantity', async () => {
    const { fan } = await buildFan();
    const order = await orders.createOrder(ctx, { productId: fan._id, plannedQuantity: 10 });
    expect(order.operations.map((o) => [o.name, o.workCenter, o.plannedMinutes, o.status])).toEqual([
      ['Cutting', 'Press shop', 50, 'pending'],
      ['Welding', 'Fabrication', 30, 'pending'],
      ['Painting', 'Paint shop', 25, 'pending'],
    ]);

    // A quantity change re-plans the routing while nothing has started…
    const resized = await orders.updateOrder(ctx, order._id, { plannedQuantity: 20 });
    expect(resized.operations.map((o) => o.plannedMinutes)).toEqual([70, 60, 35]);
  });

  test('start/complete/skip/reopen follow the rules and release → in production on first floor work', async () => {
    const { fan } = await buildFan();
    const draft = await orders.createOrder(ctx, { productId: fan._id, plannedQuantity: 10 });
    const cutting = opNamed(draft, 'Cutting');
    await expect(ops.operationAction(ctx, draft._id, cutting._id, { action: 'start' })).rejects.toThrow(/Release the order/);

    await orders.changeStatus(ctx, draft._id, { status: 'released' });
    const t0 = new Date(Date.now() - 3 * 60 * 60 * 1000);
    let order = await ops.operationAction(ctx, draft._id, cutting._id, { action: 'start', at: t0 });
    expect(order.status).toBe('in_production');
    expect(order.actualStartDate.getTime()).toBe(t0.getTime());
    expect(order.statusHistory[order.statusHistory.length - 1]).toMatchObject({
      from: 'released',
      to: 'in_production',
      note: 'Operation “Cutting” started',
    });
    await expect(ops.operationAction(ctx, draft._id, cutting._id, { action: 'start' })).rejects.toThrow(
      /already in progress/
    );
    await expect(
      ops.operationAction(ctx, draft._id, cutting._id, { action: 'complete', at: new Date(t0.getTime() - 60000) })
    ).rejects.toThrow(/cannot finish before it started/);

    order = await ops.operationAction(ctx, draft._id, cutting._id, {
      action: 'complete',
      at: new Date(t0.getTime() + 75 * 60000),
    });
    expect(opNamed(order, 'Cutting')).toMatchObject({ status: 'completed', actualMinutes: 75 });

    // Completing a never-started step records no measured time (not zero).
    order = await ops.operationAction(ctx, draft._id, opNamed(order, 'Welding')._id, { action: 'complete' });
    expect(opNamed(order, 'Welding')).toMatchObject({ status: 'completed', actualMinutes: null });

    order = await ops.operationAction(ctx, draft._id, opNamed(order, 'Painting')._id, {
      action: 'skip',
      note: 'Pre-painted',
    });
    expect(opNamed(order, 'Painting')).toMatchObject({ status: 'skipped', note: 'Pre-painted' });

    order = await ops.operationAction(ctx, draft._id, opNamed(order, 'Painting')._id, { action: 'reopen' });
    expect(opNamed(order, 'Painting')).toMatchObject({ status: 'pending', startedAt: null, completedAt: null });
    order = await ops.operationAction(ctx, draft._id, cutting._id, { action: 'reopen' });
    expect(opNamed(order, 'Cutting')).toMatchObject({ status: 'in_progress', actualMinutes: null });
    expect(opNamed(order, 'Cutting').startedAt.getTime()).toBe(t0.getTime());

    await orders.changeStatus(ctx, draft._id, { status: 'paused' });
    await expect(ops.operationAction(ctx, draft._id, opNamed(order, 'Painting')._id, { action: 'start' })).rejects.toThrow(
      /paused — resume/
    );
  });

  test('a stale step status loses the race (conditional write)', async () => {
    const { fan } = await buildFan();
    const order = await orders.createOrder(ctx, { productId: fan._id, plannedQuantity: 5 });
    await orders.changeStatus(ctx, order._id, { status: 'released' });
    const opId = order.operations[0]._id;
    const results = await Promise.allSettled([
      ops.operationAction(ctx, order._id, opId, { action: 'start' }),
      ops.operationAction(ctx, order._id, opId, { action: 'start' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected').reason.message).toMatch(
      /changed by someone else|already in progress/
    );
  });

  test('routing can be extended, edited, reordered and pruned while the order is open', async () => {
    const { fan } = await buildFan();
    let order = await orders.createOrder(ctx, { productId: fan._id, plannedQuantity: 10 });
    const [cut, weld, paint] = order.operations.map((o) => String(o._id));

    order = await ops.addOperation(ctx, order._id, { name: 'Grinding', plannedMinutes: 12, afterOperationId: cut });
    expect(order.operations.map((o) => [o.name, o.sequence])).toEqual([
      ['Cutting', 10],
      ['Grinding', 20],
      ['Welding', 30],
      ['Painting', 40],
    ]);
    const grind = String(opNamed(order, 'Grinding')._id);
    order = await ops.updateOperation(ctx, order._id, grind, { workCenter: 'Finishing', costPerHour: 25 });
    expect(opNamed(order, 'Grinding')).toMatchObject({ workCenter: 'Finishing', costPerHour: 25, plannedMinutes: 12 });

    await expect(ops.reorderOperations(ctx, order._id, { operationIds: [cut, weld] })).rejects.toThrow(/exactly once/);
    order = await ops.reorderOperations(ctx, order._id, { operationIds: [paint, cut, grind, weld] });
    expect(order.operations.map((o) => o.name)).toEqual(['Painting', 'Cutting', 'Grinding', 'Welding']);

    await orders.changeStatus(ctx, order._id, { status: 'released' });
    await ops.operationAction(ctx, order._id, cut, { action: 'start' });
    await expect(ops.removeOperation(ctx, order._id, cut)).rejects.toThrow(/already started/);
    order = await ops.removeOperation(ctx, order._id, grind);
    expect(order.operations.map((o) => [o.name, o.sequence])).toEqual([
      ['Painting', 10],
      ['Cutting', 20],
      ['Welding', 30],
    ]);

    // Cancelled/completed orders' routings are frozen.
    await ProductionOrder.updateOne({ _id: order._id }, { $set: { status: 'cancelled' } });
    await expect(ops.addOperation(ctx, order._id, { name: 'QC' })).rejects.toThrow(/can no longer be changed/);
  });

  test('routing operations are scoped to the organization', async () => {
    const { fan } = await buildFan();
    const order = await orders.createOrder(ctx, { productId: fan._id, plannedQuantity: 5 });
    const other = { organizationId: id(), branchId: String(BRANCH), createdBy: USER };
    await expect(ops.operationAction(other, order._id, order.operations[0]._id, { action: 'skip' })).rejects.toThrow(
      /not found/
    );
    await expect(detail.getOrderCosts(other, order._id)).rejects.toThrow(/not found/);
    await expect(detail.getOrderActivity(other, order._id)).rejects.toThrow(/not found/);
  });
});

describe('Production team', () => {
  test('resolves names, drops repeats and rejects users of another organization', async () => {
    const { fan } = await buildFan();
    const ali = await insertUser('Ali');
    const sara = await insertUser('Sara');
    const outsider = await insertUser('Outsider', id());
    const order = await orders.createOrder(ctx, {
      productId: fan._id,
      plannedQuantity: 5,
      teamMemberIds: [String(ali), String(sara), String(ali)],
    });
    expect(order.team.map((m) => m.name)).toEqual(['Ali', 'Sara']);

    await expect(orders.updateOrder(ctx, order._id, { teamMemberIds: [String(outsider)] })).rejects.toThrow(
      /Team member not found/
    );
    const updated = await orders.updateOrder(ctx, order._id, { teamMemberIds: [String(sara)] });
    expect(updated.team.map((m) => m.name)).toEqual(['Sara']);
  });
});

describe('Reservations', () => {
  test('stock is promised in queue order: on the floor, then priority, then start date', async () => {
    const { fan } = await buildFan({ motorStock: 100, steelStock: 100 });
    // Planned, urgent — but a released order is ahead of any planned one.
    const planned = await orders.createOrder(ctx, {
      productId: fan._id,
      plannedQuantity: 50,
      priority: 'urgent',
      status: 'planned',
    });
    const releasedLow = await orders.createOrder(ctx, { productId: fan._id, plannedQuantity: 70, priority: 'low' });
    await orders.changeStatus(ctx, releasedLow._id, { status: 'released' });
    const draft = await orders.createOrder(ctx, { productId: fan._id, plannedQuantity: 10 });

    const line = (req, name) => req.lines.find((l) => l.productName === name);

    const first = await orders.getOrderRequirements(ctx, releasedLow._id);
    expect(first.reserving).toBe(true);
    expect(line(first, 'Steel')).toMatchObject({
      reservedQuantity: 70,
      netShortageQuantity: 0,
      heldByEarlierOrdersQuantity: 0,
    });

    const second = await orders.getOrderRequirements(ctx, planned._id);
    expect(line(second, 'Steel')).toMatchObject({
      availableQuantity: 100,
      heldByEarlierOrdersQuantity: 70,
      reservedQuantity: 30,
      netShortageQuantity: 20,
      // On-hand-only shortage is unchanged (the list's "Has shortage" flag).
      shortageQuantity: 0,
    });
    expect(line(second, 'Steel').heldByEarlierOrders.map((o) => o.orderNumber)).toEqual([releasedLow.orderNumber]);
    expect(second.netShortageCount).toBe(2); // motor + steel; the optional remote never claims stock
    expect(line(second, 'Remote')).toMatchObject({ reservedQuantity: 0, netShortageQuantity: 0 });

    // Drafts queue behind everyone and reserve nothing.
    const third = await orders.getOrderRequirements(ctx, draft._id);
    expect(third.reserving).toBe(false);
    expect(line(third, 'Steel')).toMatchObject({
      reservedQuantity: 0,
      heldByEarlierOrdersQuantity: 120,
      netShortageQuantity: 10,
    });
  });

  test('between orders at the same stage, higher priority goes first, then the earlier start', async () => {
    const { fan } = await buildFan({ motorStock: 100, steelStock: 100 });
    const release = async (body) => {
      const o = await orders.createOrder(ctx, { productId: fan._id, ...body });
      return orders.changeStatus(ctx, o._id, { status: 'released' });
    };
    const normalLate = await release({ plannedQuantity: 60, plannedStartDate: new Date('2026-12-10') });
    const normalEarly = await release({ plannedQuantity: 30, plannedStartDate: new Date('2026-12-01') });
    const urgent = await release({ plannedQuantity: 50, priority: 'urgent' });
    const steel = async (o) => (await orders.getOrderRequirements(ctx, o._id)).lines.find((l) => l.productName === 'Steel');

    expect(await steel(urgent)).toMatchObject({ heldByEarlierOrdersQuantity: 0, reservedQuantity: 50 });
    expect(await steel(normalEarly)).toMatchObject({ heldByEarlierOrdersQuantity: 50, reservedQuantity: 30 });
    expect(await steel(normalLate)).toMatchObject({
      heldByEarlierOrdersQuantity: 80,
      reservedQuantity: 20,
      netShortageQuantity: 40,
    });
  });
});

describe('Costs, activity and documents (no stock moves)', () => {
  test('planned costs use standard unit costs and the routing rates', async () => {
    const { fan } = await buildFan();
    const order = await orders.createOrder(ctx, { productId: fan._id, plannedQuantity: 10 });
    const costs = await detail.getOrderCosts(ctx, order._id);
    // Motor 10 × 20 + Steel 10 × 5; the optional remote isn't counted until issued.
    expect(costs.material).toEqual({ planned: 250, actual: 0, forecast: 250 });
    // Cutting 50 min @60 + Welding 30 @40 + Painting 25 @30
    expect(costs.conversion.planned).toBe(Math.round((50 + 20 + 12.5) * 100) / 100);
    expect(costs.total.planned).toBe(332.5);
    expect(costs.unitCost.planned).toBe(33.25);
    expect(costs.unitCost.actualFinished).toBeNull();
    expect(costs.materials.find((m) => m.productName === 'Remote')).toMatchObject({ plannedCost: 0, isOptional: true });
  });

  test('activity lists creation, status changes, routing steps and documents with names', async () => {
    const { fan } = await buildFan();
    await insertUser('Planner', ORG, USER);
    const order = await orders.createOrder(ctx, { productId: fan._id, plannedQuantity: 10 });
    await orders.changeStatus(ctx, order._id, { status: 'released' });
    await ops.operationAction(ctx, order._id, order.operations[0]._id, { action: 'start' });
    await ops.operationAction(ctx, order._id, order.operations[0]._id, { action: 'complete' });
    await ops.operationAction(ctx, order._id, order.operations[1]._id, { action: 'skip' });
    await detail.addDocumentLink(ctx, order._id, {
      title: 'Drawing',
      url: 'https://example.com/d.pdf',
      category: 'drawing',
    });

    const events = await detail.getOrderActivity(ctx, order._id);
    const types = events.map((e) => e.type);
    expect(types).toEqual(
      expect.arrayContaining([
        'created',
        'status',
        'operation_started',
        'operation_completed',
        'operation_skipped',
        'document',
      ])
    );
    expect(types[types.length - 1]).toBe('created');
    expect(events.find((e) => e.type === 'operation_completed')).toMatchObject({
      byName: 'Planner',
      data: { name: 'Cutting', workCenter: 'Press shop' },
    });
    // newest first
    const times = events.map((e) => new Date(e.at).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  test('documents: links, private uploads (sniffed), signed URLs, and who may remove them', async () => {
    const stored = new Map();
    documentStorage.setStorageForTests({
      save: async (buffer, { organizationId }) => {
        const key = `manufacturing-docs/${organizationId}/k${stored.size}.pdf`;
        stored.set(key, buffer);
        return key;
      },
      signedUrl: (key) => `https://signed.example/${key}?exp=1`,
      remove: async (key) => stored.delete(key),
    });
    try {
      const { fan } = await buildFan();
      const order = await orders.createOrder(ctx, { productId: fan._id, plannedQuantity: 5 });
      const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64)]);

      await expect(
        detail.uploadDocument(ctx, order._id, {
          buffer: Buffer.from('MZ not a pdf at all'),
          size: 19,
          originalname: 'x.exe',
        })
      ).rejects.toThrow(/PDF, JPG, PNG or WEBP/);

      let updated = await detail.uploadDocument(
        ctx,
        order._id,
        { buffer: pdf, size: pdf.length, originalname: 'Fan drawing.pdf' },
        {
          category: 'drawing',
        }
      );
      const file = updated.documents[0];
      expect(file).toMatchObject({ kind: 'file', title: 'Fan drawing', category: 'drawing', mimeType: 'application/pdf' });
      expect(JSON.parse(JSON.stringify(updated)).documents[0].storageKey).toBeUndefined();
      expect((await detail.getDocumentUrl(ctx, order._id, file._id)).url).toMatch(
        /^https:\/\/signed\.example\/manufacturing-docs\//
      );

      updated = await detail.addDocumentLink(ctx, order._id, { title: 'CAD', url: 'https://cad.example/fan' });
      const link = updated.documents[1];
      expect((await detail.getDocumentUrl(ctx, order._id, link._id)).url).toBe('https://cad.example/fan');

      // Someone else without manage rights can't remove it; a manager can, and the file goes too.
      const colleague = { ...ctx, createdBy: id() };
      await expect(detail.removeDocument(colleague, order._id, file._id)).rejects.toThrow(/Only the person who attached it/);
      await detail.removeDocument(colleague, order._id, file._id, { canManage: true });
      await new Promise((r) => setImmediate(r));
      expect(stored.size).toBe(0);
      // The uploader can remove their own.
      updated = await detail.removeDocument(ctx, order._id, link._id);
      expect(updated.documents).toHaveLength(0);
    } finally {
      documentStorage.setStorageForTests(null);
    }
  });
});

describeTx('Costs and activity with stock moves (transactional)', () => {
  test('actual material = issues − returns at moved cost; forecast adds what is left at standard', async () => {
    const { motor, steel, fan } = await buildFan({ motorStock: 100, steelStock: 100 });
    let order = await orders.createOrder(ctx, { productId: fan._id, plannedQuantity: 10 });
    order = await orders.changeStatus(ctx, order._id, { status: 'released' });
    const lineFor = (o, p) => o.materials.find((m) => String(m.productId) === String(p._id));
    const issue = await manufacturing.execution.issueMaterials(ctx, order._id, {
      lines: [
        { materialLineId: lineFor(order, motor)._id, quantity: 10 },
        { materialLineId: lineFor(order, steel)._id, quantity: 6 },
      ],
    });
    const steelLot = issue.lines.find((l) => String(l.productId) === String(steel._id)).wipLotId;
    await manufacturing.execution.returnMaterials(ctx, order._id, { lines: [{ wipLotId: steelLot, quantity: 2 }] });
    const output = await manufacturing.execution.reportOutput(ctx, order._id, { producedQuantity: 4 });
    await manufacturing.execution.inspectOutput(ctx, output._id, { goodQuantity: 4, rejectedQuantity: 0 });

    const costs = await detail.getOrderCosts(ctx, order._id);
    // Motor 10 × 20 = 200; Steel (6 − 2) × 5 = 20
    expect(costs.material.actual).toBe(220);
    const steelCost = costs.materials.find((m) => m.productName === 'Steel');
    expect(steelCost).toMatchObject({
      actualCost: 20,
      issuedQuantity: 4,
      remainingQuantity: 6,
      forecastCost: 50,
      variance: 0,
    });
    expect(costs.breakdown.returned).toBe(10);
    expect(costs.breakdown.consumed).toBe(100); // 4 × (20 + 5)
    expect(costs.breakdown.finishedGoods).toBe(100);
    expect(costs.unitCost.actualFinished).toBe(25);
    expect(costs.breakdown.inWip).toBe(120); // motor 6 × 20, steel 0

    const events = await detail.getOrderActivity(ctx, order._id);
    const types = events.map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['issue', 'return', 'output', 'inspection', 'receipt']));
    expect(events.find((e) => e.type === 'issue').data).toMatchObject({ number: issue.issueNumber, lines: 2 });

    // Reservations count what's still to issue, not the full requirement.
    const req = await orders.getOrderRequirements(ctx, order._id);
    expect(req.lines.find((l) => l.productName === 'Steel')).toMatchObject({ outstandingQuantity: 6, reservedQuantity: 6 });
  });
});
