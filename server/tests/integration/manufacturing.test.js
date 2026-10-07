const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { Product, Bom, ProductionOrder, MaterialIssue, ProductionReceipt, ScrapRecord } = require('../../src/models');
const manufacturing = require('../../src/services/manufacturing');

/**
 * Manufacturing foundation — BOM structure rules, production-order lifecycle, tenant
 * isolation, and the stock moves made by issues / receipts / scrap.
 *
 * Stock moves run in multi-document transactions, which need a replica set. The
 * in-memory replica set can't start in every sandbox (see tests/utils/setupTestDB.js), so
 * those cases run only when MONGODB_TEST_REPLSET_URL points at a disposable replica set
 * (e.g. `mongod --replSet rs0` + rs.initiate()); everything else runs on the standard
 * in-memory standalone server.
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
  // Unique indexes (BOM/order numbers) are part of what's under test.
  await Promise.all([Bom, ProductionOrder, MaterialIssue, ProductionReceipt, ScrapRecord].map((m) => m.syncIndexes()));
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
const stockOf = async (productId) => (await Product.findById(productId).lean()).stockQuantity;

/**
 * Finished Product → Motor Assembly ×2 → (Motor ×1 → Bearing ×2) + Housing ×1 @10% scrap
 */
const buildMotorTree = async () => {
  const bearing = await insertProduct('Bearing', { productType: 'component', cost: 2, stockQuantity: 100 });
  const housing = await insertProduct('Housing', { productType: 'component', cost: 5, stockQuantity: 100 });
  const motor = await insertProduct('Motor', { productType: 'sub_assembly', cost: 20, stockQuantity: 10 });
  const assembly = await insertProduct('Motor Assembly', { productType: 'sub_assembly', cost: 40, stockQuantity: 10 });
  const fan = await insertProduct('Ceiling Fan', { productType: 'finished_good', cost: 90 });

  const motorBom = await manufacturing.bom.createBom(ctx, {
    productId: motor._id,
    components: [{ productId: bearing._id, quantity: 2 }],
  });
  const assemblyBom = await manufacturing.bom.createBom(ctx, {
    productId: assembly._id,
    components: [
      { productId: motor._id, quantity: 1 },
      { productId: housing._id, quantity: 1, scrapPercent: 10 },
    ],
  });
  const fanBom = await manufacturing.bom.createBom(ctx, {
    productId: fan._id,
    components: [{ productId: assembly._id, quantity: 2 }],
  });
  return { bearing, housing, motor, assembly, fan, motorBom, assemblyBom, fanBom };
};

describe('Bill of materials', () => {
  test('numbers BOMs, denormalizes components, and becomes the product default', async () => {
    const { motor, motorBom, assemblyBom } = await buildMotorTree();
    expect(motorBom.bomNumber).toBe('BOM-00001');
    expect(assemblyBom.bomNumber).toBe('BOM-00002');
    expect(motorBom.version).toBe(1);
    expect(motorBom.isDefault).toBe(true);
    expect(motorBom.components[0].productName).toBe('Bearing');
    expect(String((await Product.findById(motor._id)).defaultBomId)).toBe(String(motorBom._id));
  });

  test('rejects a product as its own component and circular structures', async () => {
    const { motor, fan, bearing } = await buildMotorTree();
    await expect(
      manufacturing.bom.createBom(ctx, { productId: bearing._id, components: [{ productId: bearing._id, quantity: 1 }] })
    ).rejects.toThrow(/own BOM/);
    // Motor → … would now contain Ceiling Fan, whose tree already contains Motor.
    await expect(
      manufacturing.bom.createBom(ctx, { productId: motor._id, components: [{ productId: fan._id, quantity: 1 }] })
    ).rejects.toThrow(/Circular BOM/);
  });

  test('explodes multi-level BOMs with scrap allowance', async () => {
    const { fanBom, bearing, housing, assembly } = await buildMotorTree();
    const { tree, lines } = await manufacturing.bom.explodeBom(ctx, fanBom._id, 5, { explode: true });

    // Tree: Fan → Motor Assembly (10) → Motor (10) → Bearing (20), Housing (11)
    expect(tree.children[0].productName).toBe('Motor Assembly');
    expect(tree.children[0].requiredQuantity).toBe(10);
    const [motorNode, housingNode] = tree.children[0].children;
    expect(motorNode.children[0].requiredQuantity).toBe(20);
    expect(housingNode.requiredQuantity).toBeCloseTo(11);

    const byProduct = Object.fromEntries(lines.map((l) => [String(l.productId), l]));
    expect(byProduct[String(bearing._id)].requiredQuantity).toBe(20);
    expect(byProduct[String(bearing._id)].level).toBe(3);
    expect(byProduct[String(housing._id)].requiredQuantity).toBeCloseTo(11);
    expect(byProduct[String(assembly._id)]).toBeUndefined();

    const flat = await manufacturing.bom.explodeBom(ctx, fanBom._id, 5, { explode: false });
    expect(flat.lines).toHaveLength(1);
    expect(flat.lines[0].requiredQuantity).toBe(10);
  });

  test('where-used finds parent BOMs', async () => {
    const { motor, assemblyBom } = await buildMotorTree();
    const used = await manufacturing.bom.whereUsed(ctx, motor._id);
    expect(used.map((u) => u.id)).toEqual([String(assemblyBom._id)]);
  });

  test('a released BOM is locked; changes go into a new version', async () => {
    const { fan, fanBom, motor } = await buildMotorTree();
    const order = await manufacturing.productionOrder.createOrder(ctx, { productId: fan._id, plannedQuantity: 1 });
    await manufacturing.productionOrder.changeStatus(ctx, order._id, { status: 'released' });

    await expect(
      manufacturing.bom.updateBom(ctx, fanBom._id, { components: [{ productId: motor._id, quantity: 1 }] })
    ).rejects.toThrow(/locked/);

    const v2 = await manufacturing.bom.createNewVersion(ctx, fanBom._id, { isDefault: true });
    expect(v2.bomNumber).toBe(fanBom.bomNumber);
    expect(v2.version).toBe(2);
    expect(v2.isDefault).toBe(true);
    expect((await Bom.findById(fanBom._id)).isDefault).toBe(false);
    expect(String((await Product.findById(fan._id)).defaultBomId)).toBe(String(v2._id));
    expect(await manufacturing.bom.listVersions(ctx, fanBom._id)).toHaveLength(2);
    await expect(manufacturing.bom.deleteBom(ctx, fanBom._id)).rejects.toThrow(/used in production/);
  });
});

describe('Production orders', () => {
  test('snapshot materials, follow the status lifecycle and refuse invalid moves', async () => {
    const { fan, fanBom } = await buildMotorTree();
    const order = await manufacturing.productionOrder.createOrder(ctx, { productId: fan._id, plannedQuantity: 3 });
    expect(order.orderNumber).toBe('MO-00001');
    expect(String(order.bomId)).toBe(String(fanBom._id));
    expect(order.status).toBe('draft');
    expect(order.materials).toHaveLength(1);
    expect(order.materials[0].requiredQuantity).toBe(6);
    expect(order.sourceLocation).toBe('Raw Material Store');

    await expect(manufacturing.productionOrder.changeStatus(ctx, order._id, { status: 'completed' })).rejects.toThrow(
      /Cannot move/
    );
    const updated = await manufacturing.productionOrder.updateOrder(ctx, order._id, { plannedQuantity: 4 });
    expect(updated.materials[0].requiredQuantity).toBe(8);

    await manufacturing.productionOrder.changeStatus(ctx, order._id, { status: 'planned' });
    const released = await manufacturing.productionOrder.changeStatus(ctx, order._id, { status: 'released' });
    expect(released.statusHistory.map((h) => h.to)).toEqual(['draft', 'planned', 'released']);
    await expect(manufacturing.productionOrder.updateOrder(ctx, order._id, { plannedQuantity: 9 })).rejects.toThrow(
      /Draft or Planned/
    );
  });

  test('requires a BOM by default', async () => {
    const widget = await insertProduct('Widget', { productType: 'finished_good' });
    await expect(
      manufacturing.productionOrder.createOrder(ctx, { productId: widget._id, plannedQuantity: 1 })
    ).rejects.toThrow(/has no BOM/);
  });

  test('reports shortages against on-hand stock', async () => {
    const { fan, assembly } = await buildMotorTree(); // 10 Motor Assemblies on hand
    const order = await manufacturing.productionOrder.createOrder(ctx, { productId: fan._id, plannedQuantity: 8 });
    await manufacturing.productionOrder.changeStatus(ctx, order._id, { status: 'planned' });
    const reqs = await manufacturing.productionOrder.getOrderRequirements(ctx, order._id);
    expect(reqs.lines[0]).toMatchObject({ requiredQuantity: 16, availableQuantity: 10, shortageQuantity: 6 });

    const all = await manufacturing.productionOrder.getAggregatedRequirements(ctx);
    expect(all.lines).toHaveLength(1);
    expect(all.lines[0]).toMatchObject({ productId: String(assembly._id), shortageQuantity: 6 });
  });

  test('never exposes another organization or branch', async () => {
    const { fan, fanBom } = await buildMotorTree();
    const order = await manufacturing.productionOrder.createOrder(ctx, { productId: fan._id, plannedQuantity: 1 });
    const otherOrg = { organizationId: id(), branchId: String(BRANCH), createdBy: USER };
    const otherBranch = { organizationId: ORG, branchId: String(id()), createdBy: USER };

    await expect(manufacturing.productionOrder.getOrder(otherOrg, order._id)).rejects.toThrow(/not found/);
    await expect(manufacturing.productionOrder.getOrder(otherBranch, order._id)).rejects.toThrow(/not found/);
    await expect(manufacturing.bom.getBom(otherOrg, fanBom._id)).rejects.toThrow(/not found/);
    expect((await manufacturing.productionOrder.queryOrders(otherOrg, {}, {})).totalResults).toBe(0);
    // A product from this org can't be used by another org's BOM/order.
    await expect(
      manufacturing.productionOrder.createOrder(otherOrg, { productId: fan._id, plannedQuantity: 1 })
    ).rejects.toThrow(/not found/);
  });
});

describeTx('Production execution (stock moves)', () => {
  const releasedOrder = async (tree, plannedQuantity = 2) => {
    const order = await manufacturing.productionOrder.createOrder(ctx, { productId: tree.assembly._id, plannedQuantity });
    return manufacturing.productionOrder.changeStatus(ctx, order._id, { status: 'released' });
  };

  test('issuing materials takes stock, starts the order and costs the issue', async () => {
    const tree = await buildMotorTree();
    const order = await releasedOrder(tree, 2); // Motor ×2, Housing ×2.2
    const housingLine = order.materials.find((m) => String(m.productId) === String(tree.housing._id));
    const motorLine = order.materials.find((m) => String(m.productId) === String(tree.motor._id));

    const issue = await manufacturing.execution.issueMaterials(ctx, order._id, {
      lines: [
        { materialLineId: motorLine._id, quantity: 2 },
        { materialLineId: housingLine._id, quantity: 2.2 },
      ],
    });
    expect(issue.issueNumber).toBe('MI-00001');
    expect(issue.totalCost).toBe(51); // 2×20 + 2.2×5
    expect(await stockOf(tree.motor._id)).toBe(8);
    expect(await stockOf(tree.housing._id)).toBeCloseTo(97.8);

    const after = await ProductionOrder.findById(order._id);
    expect(after.status).toBe('in_production');
    expect(after.actualStartDate).toBeTruthy();
    expect(after.materialCost).toBe(51);
    expect(after.materials.id(motorLine._id).issuedQuantity).toBe(2);
  });

  test('an issue with a short line changes nothing at all', async () => {
    const tree = await buildMotorTree();
    const order = await releasedOrder(tree, 20); // needs 20 Motors, only 10 on hand
    const [motorLine, housingLine] = [tree.motor, tree.housing].map((p) =>
      order.materials.find((m) => String(m.productId) === String(p._id))
    );
    await expect(
      manufacturing.execution.issueMaterials(ctx, order._id, {
        lines: [
          { materialLineId: housingLine._id, quantity: 5 },
          { materialLineId: motorLine._id, quantity: 20 },
        ],
      })
    ).rejects.toThrow(/Insufficient stock/);
    expect(await stockOf(tree.housing._id)).toBe(100);
    expect(await stockOf(tree.motor._id)).toBe(10);
    expect((await ProductionOrder.findById(order._id)).status).toBe('released');
    expect(await MaterialIssue.countDocuments()).toBe(0);
  });

  test('receiving output adds stock at material cost and blocks over-production', async () => {
    const tree = await buildMotorTree();
    const order = await releasedOrder(tree, 2);
    const motorLine = order.materials.find((m) => String(m.productId) === String(tree.motor._id));
    await manufacturing.execution.issueMaterials(ctx, order._id, {
      lines: [{ materialLineId: motorLine._id, quantity: 2 }],
    });

    const receipt = await manufacturing.execution.receiveFinishedGoods(ctx, order._id, { quantity: 2 });
    expect(receipt.receiptNumber).toBe('FG-00001');
    expect(receipt.unitCost).toBe(20); // 40 material ÷ 2 planned
    expect(await stockOf(tree.assembly._id)).toBe(12);
    await expect(manufacturing.execution.receiveFinishedGoods(ctx, order._id, { quantity: 1 })).rejects.toThrow(
      /exceed the planned/
    );

    // Started orders can't be cancelled any more — only completed.
    await expect(manufacturing.productionOrder.changeStatus(ctx, order._id, { status: 'cancelled' })).rejects.toThrow(
      /Cannot move/
    );
    const done = await manufacturing.productionOrder.changeStatus(ctx, order._id, { status: 'completed' });
    expect(done.actualCompletionDate).toBeTruthy();
    await expect(manufacturing.execution.receiveFinishedGoods(ctx, order._id, { quantity: 1 })).rejects.toThrow(
      /release it/
    );
  });

  test('scrap: material scrap is bounded by what was issued; finished-good scrap writes stock off', async () => {
    const tree = await buildMotorTree();
    const order = await releasedOrder(tree, 2);
    const housingLine = order.materials.find((m) => String(m.productId) === String(tree.housing._id));
    await manufacturing.execution.issueMaterials(ctx, order._id, {
      lines: [{ materialLineId: housingLine._id, quantity: 2 }],
    });

    await expect(
      manufacturing.execution.recordScrap(ctx, {
        productionOrderId: order._id,
        stage: 'material',
        materialLineId: housingLine._id,
        quantity: 3,
      })
    ).rejects.toThrow(/has been issued/);
    const materialScrap = await manufacturing.execution.recordScrap(ctx, {
      productionOrderId: order._id,
      stage: 'material',
      materialLineId: housingLine._id,
      quantity: 1,
      reason: 'defect',
    });
    // The rejected attempt above already reserved SCR-00001 — numbers are reserved before
    // the transaction (see settings.service.js#nextDocumentNumber), so failures leave gaps.
    expect(materialScrap.toObject()).toMatchObject({
      scrapNumber: 'SCR-00002',
      affectsStock: false,
      unitCost: 5,
      totalCost: 5,
    });
    expect(await stockOf(tree.housing._id)).toBe(98);

    const fgScrap = await manufacturing.execution.recordScrap(ctx, {
      stage: 'finished_good',
      productId: tree.motor._id,
      quantity: 3,
    });
    expect(fgScrap.affectsStock).toBe(true);
    expect(await stockOf(tree.motor._id)).toBe(7);
  });

  test('WIP and dashboard roll up open work', async () => {
    const tree = await buildMotorTree();
    const order = await releasedOrder(tree, 2);
    const motorLine = order.materials.find((m) => String(m.productId) === String(tree.motor._id));
    await manufacturing.execution.issueMaterials(ctx, order._id, {
      lines: [{ materialLineId: motorLine._id, quantity: 2 }],
    });
    await manufacturing.execution.receiveFinishedGoods(ctx, order._id, { quantity: 1 });

    const wip = await manufacturing.execution.getWip(ctx);
    expect(wip.orders).toHaveLength(1);
    expect(wip.totals.wipValue).toBe(20); // 40 issued − 20 received

    const dashboard = await manufacturing.dashboard.getDashboard(ctx);
    expect(dashboard.byStatus.in_production).toBe(1);
    expect(dashboard.wipValue).toBe(20);
    expect(dashboard.month.producedQuantity).toBe(1);
    expect(dashboard.activeBoms).toBe(3);
    expect(dashboard.productTypes.sub_assembly).toBe(2);
  });
});
