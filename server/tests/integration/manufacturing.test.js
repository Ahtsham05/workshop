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
  ProductionReceipt,
  ProductionOutput,
  ScrapRecord,
  ManufacturingSettings,
} = require('../../src/models');
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
  await Promise.all(
    [Bom, ProductionOrder, MaterialIssue, ProductionReceipt, ProductionOutput, ScrapRecord, Batch].map((m) =>
      m.syncIndexes()
    )
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

describeTx('Production flow (stock moves, transactional)', () => {
  const svc = manufacturing.execution;
  const release = async (productId, plannedQuantity) => {
    const order = await manufacturing.productionOrder.createOrder(ctx, { productId, plannedQuantity });
    return manufacturing.productionOrder.changeStatus(ctx, order._id, { status: 'released' });
  };
  const lineFor = (order, product) => order.materials.find((m) => String(m.productId) === String(product._id));
  const ledgerFor = (orderId) =>
    InventoryTransaction.find({ productionOrderId: orderId }).sort({ createdAt: 1, _id: 1 }).lean();
  const setSettings = (patch) => manufacturing.settings.updateSettings(ORG, patch, USER);

  /** MO example from the spec: Motor 100, Bearing 200, Steel Body 100 per 100 units. */
  const buildFanLine = async () => {
    const motor = await insertProduct('Motor', { productType: 'component', cost: 20, stockQuantity: 150 });
    const bearing = await insertProduct('Bearing', { productType: 'component', cost: 2, stockQuantity: 500 });
    const body = await insertProduct('Steel Body', { productType: 'component', cost: 10, stockQuantity: 120 });
    const fan = await insertProduct('Pedestal Fan', { productType: 'finished_good', cost: 60, stockQuantity: 0 });
    await manufacturing.bom.createBom(ctx, {
      productId: fan._id,
      components: [
        { productId: motor._id, quantity: 1 },
        { productId: bearing._id, quantity: 2 },
        { productId: body._id, quantity: 1 },
      ],
    });
    return { motor, bearing, body, fan };
  };

  test('material issue moves stock into WIP with a fully traceable ledger pair per item', async () => {
    const { motor, bearing, body, fan } = await buildFanLine();
    const order = await release(fan._id, 100);
    const issue = await svc.issueMaterials(ctx, order._id, {
      lines: [motor, bearing, body].map((p) => ({
        materialLineId: lineFor(order, p)._id,
        quantity: lineFor(order, p).requiredQuantity,
      })),
    });

    expect(await stockOf(motor._id)).toBe(50);
    expect(await stockOf(bearing._id)).toBe(300);
    expect(await stockOf(body._id)).toBe(20);

    const rows = await ledgerFor(order._id);
    expect(rows).toHaveLength(6);
    const motorRows = rows.filter((r) => String(r.productId) === String(motor._id));
    expect(motorRows.map((r) => [r.type, r.stockBucket, r.quantityDelta, r.balanceAfter])).toEqual([
      ['production_issue', 'available', -100, 50],
      ['wip_in', 'wip', 100, 100],
    ]);
    motorRows.forEach((r) => {
      expect(r).toMatchObject({ refType: 'MaterialIssue', unit: 'pcs', location: expect.any(String) });
      expect(String(r.refId)).toBe(String(issue._id));
      expect(String(r.organizationId)).toBe(String(ORG));
      expect(String(r.branchId)).toBe(String(BRANCH));
      expect(String(r.warehouseId)).toBe(String(BRANCH));
      expect(String(r.createdBy)).toBe(String(USER));
      expect(r.createdAt).toBeInstanceOf(Date);
      expect(r.inventoryId).toBeTruthy();
    });
    const after = await ProductionOrder.findById(order._id);
    expect(after.status).toBe('in_production');
    expect(after.wipLots).toHaveLength(3);
  });

  test('partial issues track remaining; over-issue needs confirmation and permission', async () => {
    const { motor, fan } = await buildFanLine();
    const order = await release(fan._id, 100);
    const line = lineFor(order, motor);
    await svc.issueMaterials(ctx, order._id, { lines: [{ materialLineId: line._id, quantity: 60 }] });
    let reqs = await manufacturing.productionOrder.getOrderRequirements(ctx, order._id);
    expect(reqs.lines.find((l) => l.productId === String(motor._id))).toMatchObject({
      requiredQuantity: 100,
      issuedQuantity: 60,
      wipQuantity: 60,
      outstandingQuantity: 40,
    });

    const over = { lines: [{ materialLineId: line._id, quantity: 50 }] };
    await expect(svc.issueMaterials(ctx, order._id, over)).rejects.toThrow(/more than the 40 still required/);
    await expect(svc.issueMaterials(ctx, order._id, { ...over, allowOverIssue: true })).rejects.toThrow(/permission/);
    expect(await stockOf(motor._id)).toBe(90);
    const issue = await svc.issueMaterials(ctx, order._id, { ...over, allowOverIssue: true }, { canOverIssue: true });
    expect(issue.isOverIssue).toBe(true);
    reqs = await manufacturing.productionOrder.getOrderRequirements(ctx, order._id);
    expect(reqs.lines.find((l) => l.productId === String(motor._id)).outstandingQuantity).toBe(0);
    expect(await stockOf(motor._id)).toBe(40);
  });

  test('output 95 → QC 92 good / 3 rejected: WIP consumed, FG received, scrap recorded, 5 remaining', async () => {
    const { motor, bearing, body, fan } = await buildFanLine();
    const order = await release(fan._id, 100);
    await svc.issueMaterials(ctx, order._id, {
      lines: [motor, bearing, body].map((p) => ({
        materialLineId: lineFor(order, p)._id,
        quantity: lineFor(order, p).requiredQuantity,
      })),
    });

    const output = await svc.reportOutput(ctx, order._id, { producedQuantity: 95 });
    expect(output.status).toBe('pending_qc');
    expect(output.materialCost).toBe(95 * (20 + 2 * 2 + 10));
    let o = await ProductionOrder.findById(order._id);
    expect(lineFor(o, motor).consumedQuantity).toBe(95);
    expect(lineFor(o, bearing).consumedQuantity).toBe(190);
    expect(o.qcPendingQuantity).toBe(95);
    expect(await stockOf(fan._id)).toBe(0); // nothing in finished stock before inspection

    await expect(svc.inspectOutput(ctx, output._id, { goodQuantity: 92, rejectedQuantity: 2 })).rejects.toThrow(
      /must equal/
    );
    await svc.inspectOutput(ctx, output._id, { goodQuantity: 92, rejectedQuantity: 3, rejectDisposition: 'scrap' });
    o = await ProductionOrder.findById(order._id);
    expect(o).toMatchObject({ producedQuantity: 95, completedQuantity: 92, rejectedQuantity: 3, qcPendingQuantity: 0 });
    expect(o.plannedQuantity - o.producedQuantity).toBe(5);
    expect(await stockOf(fan._id)).toBe(92);
    expect(await ScrapRecord.countDocuments({ stage: 'qc_reject', quantity: 3 })).toBe(1);

    const types = (await ledgerFor(order._id))
      .filter((r) => String(r.productId) === String(fan._id))
      .map((r) => `${r.type}:${r.quantityDelta}`);
    expect(types).toEqual(['qc_in:95', 'qc_out:-95', 'production_receipt:92']);
    const wipMotor = (await ledgerFor(order._id)).filter(
      (r) => r.type === 'wip_consume' && String(r.productId) === String(motor._id)
    );
    expect(wipMotor[0]).toMatchObject({ stockBucket: 'wip', quantityDelta: -95, balanceAfter: 5 });
  });

  test('rejected units can go to rework and later pass into stock or fail to scrap', async () => {
    const { motor, bearing, body, fan } = await buildFanLine();
    await setSettings({ requireQualityCheck: false });
    const order = await release(fan._id, 10);
    await svc.issueMaterials(ctx, order._id, {
      lines: [motor, bearing, body].map((p) => ({
        materialLineId: lineFor(order, p)._id,
        quantity: lineFor(order, p).requiredQuantity,
      })),
    });
    const output = await svc.reportOutput(ctx, order._id, {
      producedQuantity: 10,
      rejectedQuantity: 4,
      rejectDisposition: 'rework',
    });
    expect(output.status).toBe('inspected');
    expect(await stockOf(fan._id)).toBe(6);
    await expect(manufacturing.productionOrder.changeStatus(ctx, order._id, { status: 'completed' })).rejects.toThrow(
      /in rework/
    );

    await svc.resolveRework(ctx, order._id, { goodQuantity: 3, scrapQuantity: 1 });
    const o = await ProductionOrder.findById(order._id);
    expect(o).toMatchObject({
      completedQuantity: 9,
      reworkPendingQuantity: 0,
      reworkedGoodQuantity: 3,
      scrappedQuantity: 1,
    });
    expect(await stockOf(fan._id)).toBe(9);
    const done = await manufacturing.productionOrder.changeStatus(ctx, order._id, { status: 'completed' });
    expect(done.status).toBe('completed');
  });

  test('backflush refuses output the issued material cannot cover', async () => {
    const { motor, bearing, body, fan } = await buildFanLine();
    const order = await release(fan._id, 100);
    await svc.issueMaterials(ctx, order._id, {
      lines: [
        { materialLineId: lineFor(order, motor)._id, quantity: 50 },
        { materialLineId: lineFor(order, bearing)._id, quantity: 200 },
        { materialLineId: lineFor(order, body)._id, quantity: 100 },
      ],
    });
    await expect(svc.reportOutput(ctx, order._id, { producedQuantity: 60 })).rejects.toThrow(/Not enough "Motor" in WIP/);
    const o = await ProductionOrder.findById(order._id);
    expect(o.producedQuantity).toBe(0);
    expect(lineFor(o, bearing).consumedQuantity).toBe(0); // nothing half-applied
    expect(await ProductionOutput.countDocuments()).toBe(0);
  });

  test('completion requires leftover WIP to be returned or scrapped', async () => {
    const { motor, bearing, body, fan } = await buildFanLine();
    await setSettings({ requireQualityCheck: false });
    const order = await release(fan._id, 10);
    await svc.issueMaterials(ctx, order._id, {
      lines: [
        { materialLineId: lineFor(order, motor)._id, quantity: 10 },
        { materialLineId: lineFor(order, bearing)._id, quantity: 20 },
        { materialLineId: lineFor(order, body)._id, quantity: 10 },
      ],
    });
    await svc.reportOutput(ctx, order._id, { producedQuantity: 8 });
    await expect(manufacturing.productionOrder.changeStatus(ctx, order._id, { status: 'completed' })).rejects.toThrow(
      /still in WIP/
    );
    await manufacturing.productionOrder.changeStatus(ctx, order._id, { status: 'completed', wipDisposition: 'return' });
    expect(await stockOf(motor._id)).toBe(150 - 8);
    expect(await stockOf(bearing._id)).toBe(500 - 16);
    const o = await ProductionOrder.findById(order._id);
    expect(o.wipLots).toHaveLength(0);
    expect(lineFor(o, motor).returnedQuantity).toBe(2);
    expect(await MaterialIssue.countDocuments({ kind: 'return' })).toBe(1);
  });

  describe('batch- and serial-tracked items', () => {
    const insertBatchProduct = async (name, batches) => {
      const total = batches.reduce((s, b) => s + b.quantity, 0);
      const product = await insertProduct(name, { productType: 'raw_material', cost: 5, stockQuantity: total });
      const [variant] = await ProductVariant.create([
        {
          organizationId: ORG,
          branchId: BRANCH,
          productId: product._id,
          isDefault: true,
          price: 10,
          cost: 5,
          trackBatch: true,
        },
      ]);
      const [inventory] = await Inventory.create([
        { organizationId: ORG, branchId: BRANCH, productId: product._id, variantId: variant._id, quantity: total },
      ]);
      const created = await Batch.create(
        batches.map((b) => ({ organizationId: ORG, inventoryId: inventory._id, costPerUnit: 5, ...b }))
      );
      return { product, inventory, batches: created };
    };
    const insertSerialProduct = async (name, numbers) => {
      const product = await insertProduct(name, {
        productType: 'component',
        cost: 30,
        stockQuantity: numbers.length,
        trackSerial: true,
      });
      const units = await Imei.create(
        numbers.map((imei) => ({
          organizationId: ORG,
          branchId: BRANCH,
          imei,
          type: 'serial',
          productId: product._id,
          purchasePrice: 30,
        }))
      );
      return { product, units };
    };

    test('batch items issue FEFO, keep batch quantities in step and return to the same batch', async () => {
      const resin = await insertBatchProduct('Resin', [
        { batchNumber: 'LATE', quantity: 50, expiryDate: new Date('2027-06-01') },
        { batchNumber: 'EARLY', quantity: 30, expiryDate: new Date('2027-01-01') },
      ]);
      const panel = await insertProduct('Panel', { productType: 'finished_good' });
      await manufacturing.bom.createBom(ctx, {
        productId: panel._id,
        components: [{ productId: resin.product._id, quantity: 4 }],
      });
      const order = await release(panel._id, 10);
      const issue = await svc.issueMaterials(ctx, order._id, {
        lines: [{ materialLineId: order.materials[0]._id, quantity: 40 }],
      });
      expect(issue.lines.map((l) => [l.batchNumber, l.quantity])).toEqual([
        ['EARLY', 30],
        ['LATE', 10],
      ]);
      const [early, late] = await Promise.all(['EARLY', 'LATE'].map((n) => Batch.findOne({ batchNumber: n }).lean()));
      expect([early.quantity, early.status, late.quantity]).toEqual([0, 'depleted', 40]);
      expect((await Inventory.findById(resin.inventory._id)).quantity).toBe(40);
      expect(await stockOf(resin.product._id)).toBe(40);
      const batchRows = await InventoryTransaction.find({ productionOrderId: order._id, type: 'production_issue' }).lean();
      expect(batchRows.map((r) => String(r.batchId)).sort()).toEqual([String(early._id), String(late._id)].sort());

      const o = await ProductionOrder.findById(order._id);
      const earlyLot = o.wipLots.find((l) => l.batchNumber === 'EARLY');
      await svc.returnMaterials(ctx, order._id, { lines: [{ wipLotId: earlyLot._id, quantity: 5 }] });
      expect((await Batch.findById(early._id)).toObject()).toMatchObject({ quantity: 5, status: 'active' });
      expect(await stockOf(resin.product._id)).toBe(45);
    });

    test('serial units move to in_production, are consumed by output, and finished serials are created', async () => {
      const board = await insertSerialProduct('Control Board', ['CB-1', 'CB-2', 'CB-3']);
      const robot = await insertProduct('Robot', { productType: 'finished_good', trackSerial: true });
      await manufacturing.bom.createBom(ctx, {
        productId: robot._id,
        components: [{ productId: board.product._id, quantity: 1 }],
      });
      await setSettings({ requireQualityCheck: false });
      const order = await release(robot._id, 2);
      await svc.issueMaterials(ctx, order._id, {
        lines: [{ materialLineId: order.materials[0]._id, serialNumbers: ['CB-1', 'CB-3'] }],
      });
      expect((await Imei.findOne({ imei: 'CB-1' })).toObject()).toMatchObject({
        status: 'in_production',
        productionOrderId: order._id,
      });
      expect((await Imei.findOne({ imei: 'CB-2' })).status).toBe('in_stock');
      expect(await stockOf(board.product._id)).toBe(1);

      // Finished serials are mandatory for a serial-tracked product — and a failure leaves nothing half-done.
      await expect(svc.reportOutput(ctx, order._id, { producedQuantity: 2 })).rejects.toThrow(/serial/);
      expect((await Imei.findOne({ imei: 'CB-1' })).status).toBe('in_production');
      expect((await ProductionOrder.findById(order._id)).producedQuantity).toBe(0);

      await svc.reportOutput(ctx, order._id, {
        producedQuantity: 2,
        finishedGoods: { serialNumbers: ['RB-100', 'RB-101'] },
      });
      expect((await Imei.findOne({ imei: 'CB-3' })).status).toBe('consumed');
      const made = await Imei.find({ productId: robot._id }).lean();
      expect(made.map((u) => [u.imei, u.status])).toEqual([
        ['RB-100', 'in_stock'],
        ['RB-101', 'in_stock'],
      ]);
      expect(await stockOf(robot._id)).toBe(2);
      const receiptRow = await InventoryTransaction.findOne({
        productionOrderId: order._id,
        type: 'production_receipt',
      }).lean();
      expect(receiptRow.serialNumbers).toEqual(['RB-100', 'RB-101']);
    });

    test('batch-tracked finished goods land in a new batch', async () => {
      const flour = await insertProduct('Flour', { productType: 'raw_material', cost: 1, stockQuantity: 100 });
      const bread = await insertProduct('Bread', { productType: 'finished_good', cost: 3 });
      await ProductVariant.create([
        {
          organizationId: ORG,
          branchId: BRANCH,
          productId: bread._id,
          isDefault: true,
          price: 5,
          cost: 3,
          trackBatch: true,
          trackExpiry: true,
        },
      ]);
      await manufacturing.bom.createBom(ctx, {
        productId: bread._id,
        components: [{ productId: flour._id, quantity: 0.5 }],
      });
      await setSettings({ requireQualityCheck: false });
      const order = await release(bread._id, 20);
      await svc.issueMaterials(ctx, order._id, { lines: [{ materialLineId: order.materials[0]._id, quantity: 10 }] });
      await svc.reportOutput(ctx, order._id, {
        producedQuantity: 20,
        finishedGoods: { batchNumber: 'BR-0701', expiryDate: '2026-10-14' },
      });
      const batch = await Batch.findOne({ batchNumber: 'BR-0701' }).lean();
      expect(batch).toMatchObject({ quantity: 20, costPerUnit: 0.5, status: 'active' });
      expect(await stockOf(bread._id)).toBe(20);
    });
  });
});

describeTx('Assembly orders, nesting and traceability', () => {
  const po = () => manufacturing.productionOrder;
  const ex = () => manufacturing.execution;
  const tr = () => manufacturing.traceability;
  const { Supplier, User } = require('../../src/models'); // eslint-disable-line global-require

  const batchTracked = async (product, batches = []) => {
    const [variant] = await ProductVariant.create([
      {
        organizationId: ORG,
        branchId: BRANCH,
        productId: product._id,
        isDefault: true,
        price: 1,
        cost: product.cost,
        trackBatch: true,
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
    return { variant, inventory, batches: created };
  };

  /** Laptop: Motherboard (batch, bought) + RAM ×2 (serial, bought) + SSD → Motherboard Assembly; + Battery + Case → Laptop. */
  const buildLaptop = async () => {
    const [acme, chipCo] = await Supplier.create([
      { organizationId: ORG, branchId: BRANCH, name: 'Acme Boards' },
      { organizationId: ORG, branchId: BRANCH, name: 'ChipCo Memory' },
    ]);
    const mobo = await insertProduct('Motherboard', { productType: 'raw_material', cost: 80, stockQuantity: 5 });
    const moboStock = await batchTracked(mobo, [{ batchNumber: 'MB-LOT-7', quantity: 5, supplierId: acme._id }]);
    const ram = await insertProduct('RAM 8GB', {
      productType: 'raw_material',
      cost: 20,
      stockQuantity: 6,
      trackSerial: true,
    });
    await Imei.create(
      ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'].map((imei) => ({
        organizationId: ORG,
        branchId: BRANCH,
        imei,
        type: 'serial',
        productId: ram._id,
        purchasePrice: 20,
        supplierId: chipCo._id,
        supplierName: 'ChipCo Memory',
      }))
    );
    const ssd = await insertProduct('SSD 512', {
      productType: 'raw_material',
      cost: 40,
      stockQuantity: 10,
      supplier: acme._id,
    });
    const battery = await insertProduct('Battery', { productType: 'raw_material', cost: 30, stockQuantity: 10 });
    const laptopCase = await insertProduct('Case', { productType: 'raw_material', cost: 25, stockQuantity: 10 });
    const moboAsm = await insertProduct('Motherboard Assembly', { productType: 'sub_assembly', cost: 0 });
    await batchTracked(moboAsm);
    const laptop = await insertProduct('Laptop', { productType: 'finished_good', cost: 0, trackSerial: true });

    await manufacturing.bom.createBom(ctx, {
      productId: moboAsm._id,
      components: [
        { productId: mobo._id, quantity: 1 },
        { productId: ram._id, quantity: 2 },
        { productId: ssd._id, quantity: 1 },
      ],
    });
    await manufacturing.bom.createBom(ctx, {
      productId: laptop._id,
      components: [
        { productId: moboAsm._id, quantity: 1 },
        { productId: battery._id, quantity: 1 },
        { productId: laptopCase._id, quantity: 1 },
      ],
    });
    return { acme, chipCo, mobo, moboStock, ram, ssd, battery, laptopCase, moboAsm, laptop };
  };

  test('assembly order lifecycle: start moves components into WIP, complete → QC pending → completed', async () => {
    const t = await buildLaptop();
    const operator = await User.collection.insertOne({ name: 'Ayesha (Line 2)', email: 'op@x.io', organizationId: ORG });
    const asm = await po().createOrder(ctx, {
      orderType: 'assembly',
      productId: t.moboAsm._id,
      plannedQuantity: 2,
      operatorId: operator.insertedId,
    });
    expect(asm.orderNumber).toBe('ASM-00001');
    expect(asm).toMatchObject({ orderType: 'assembly', status: 'draft', operatorName: 'Ayesha (Line 2)' });

    await expect(po().changeStatus(ctx, asm._id, { status: 'in_production' })).rejects.toThrow(/Cannot move/);
    await po().changeStatus(ctx, asm._id, { status: 'released' });
    const started = await po().changeStatus(ctx, asm._id, { status: 'in_production' });
    expect(started.status).toBe('in_production');
    expect(started.wipLots.map((l) => [l.productName, l.quantity, l.batchNumber || null]).sort()).toEqual(
      [
        ['Motherboard', 2, 'MB-LOT-7'],
        ['RAM 8GB', 4, null],
        ['SSD 512', 2, null],
      ].sort()
    );
    expect(await Imei.countDocuments({ productId: t.ram._id, status: 'in_production' })).toBe(4);
    expect(await stockOf(t.ssd._id)).toBe(8);

    await expect(po().changeStatus(ctx, asm._id, { status: 'qc_pending' })).rejects.toThrow(/Complete assembly/);
    const pending = await ex().completeAssembly(ctx, asm._id, { finishedGoods: {} });
    expect(pending.status).toBe('qc_pending');
    expect(await Imei.countDocuments({ productId: t.ram._id, status: 'consumed' })).toBe(4);

    const [output] = (
      await ex().queryOutputs({ organizationId: ORG, branchId: String(BRANCH) }, { productionOrderId: asm._id }, {})
    ).results;
    await ex().inspectOutput(ctx, output._id, { goodQuantity: 2, finishedGoods: { batchNumber: 'MBA-0001' } });
    const done = await ProductionOrder.findById(asm._id);
    expect(done.status).toBe('completed');
    expect(done.statusHistory.map((h) => h.to)).toEqual(['draft', 'released', 'in_production', 'qc_pending', 'completed']);
    const made = await Batch.findOne({ batchNumber: 'MBA-0001' }).lean();
    expect(made).toMatchObject({ quantity: 2, costPerUnit: 160 }); // 80 + 2×20 + 40
    expect(String(made.productionOrderId)).toBe(String(asm._id));
  });

  test('raw → sub-assembly → final assembly with forward and reverse traceability', async () => {
    const t = await buildLaptop();
    await setSettingsQcOff();
    const laptopOrder = await po().createOrder(ctx, { productId: t.laptop._id, plannedQuantity: 2 });
    const created = await po().createSubAssemblyOrders(ctx, laptopOrder._id, {});
    expect(created).toHaveLength(1);
    const asm = created[0].order;
    expect(asm).toMatchObject({ orderType: 'assembly', plannedQuantity: 2 });
    expect(String(asm.parentOrderId)).toBe(String(laptopOrder._id));
    // Already covered by an open child — asking again creates nothing.
    expect(await po().createSubAssemblyOrders(ctx, laptopOrder._id, {})).toHaveLength(0);

    await po().changeStatus(ctx, asm._id, { status: 'released' });
    await po().changeStatus(ctx, asm._id, { status: 'in_production' });
    const asmDone = await ex().completeAssembly(ctx, asm._id, { finishedGoods: { batchNumber: 'MBA-0002' } });
    expect(asmDone.status).toBe('completed');

    await po().changeStatus(ctx, laptopOrder._id, { status: 'released' });
    const lo = await ProductionOrder.findById(laptopOrder._id);
    await ex().issueMaterials(ctx, laptopOrder._id, {
      lines: lo.materials.map((m) => ({ materialLineId: m._id, quantity: m.requiredQuantity })),
    });
    await ex().reportOutput(ctx, laptopOrder._id, {
      producedQuantity: 2,
      finishedGoods: { serialNumbers: ['LP-1001', 'LP-1002'] },
    });

    // Forward: finished laptop serial → laptop order → motherboard assembly batch → assembly
    // order → motherboard batch / RAM serials → suppliers.
    const lp = await Imei.findOne({ imei: 'LP-1001' });
    const fwd = await tr().traceFinished(ctx, { imeiId: lp._id });
    expect(fwd.trace.order.orderNumber).toBe(laptopOrder.orderNumber);
    const asmComponent = fwd.trace.components.find((c) => c.productName === 'Motherboard Assembly');
    expect(asmComponent.batch.batchNumber).toBe('MBA-0002');
    const asmTrace = asmComponent.sources[0].order;
    expect(asmComponent.sources[0].kind).toBe('production');
    expect(asmTrace.order.orderNumber).toBe(asm.orderNumber);
    const moboComp = asmTrace.components.find((c) => c.productName === 'Motherboard');
    expect(moboComp.batch.batchNumber).toBe('MB-LOT-7');
    expect(moboComp.sources[0]).toMatchObject({ kind: 'purchase', supplier: { name: 'Acme Boards' } });
    const ramComp = asmTrace.components.find((c) => c.productName === 'RAM 8GB');
    expect(ramComp.sources[0].supplier.name).toBe('ChipCo Memory');
    expect(ramComp.sources[0].serials).toHaveLength(4);
    const ssdComp = asmTrace.components.find((c) => c.productName === 'SSD 512');
    expect(ssdComp.sources[0]).toMatchObject({ kind: 'untracked', supplier: { name: 'Acme Boards' } });

    // Reverse: raw motherboard batch → assembly → laptop production → finished serials.
    const [usage] = await tr().traceWhereUsed(ctx, { batchId: t.moboStock.batches[0]._id });
    expect(usage.order.orderNumber).toBe(asm.orderNumber);
    expect(usage.quantityUsed).toBe(2);
    expect(usage.usedIn[0].order.orderNumber).toBe(laptopOrder.orderNumber);
    expect(usage.usedIn[0].produced[0].serials.map((s) => s.number)).toEqual(['LP-1001', 'LP-1002']);

    // Reverse from a RAM serial goes the same way.
    const r1 = await Imei.findOne({ imei: 'R1' });
    const [ramUse] = await tr().traceWhereUsed(ctx, { imeiId: r1._id });
    expect(ramUse.order.orderNumber).toBe(asm.orderNumber);
    expect(ramUse.usedIn[0].order.orderNumber).toBe(laptopOrder.orderNumber);

    const hits = await tr().lookup(ctx, 'LP-10');
    expect(hits.filter((h) => h.kind === 'serial').map((h) => h.label)).toEqual(['LP-1001', 'LP-1002']);
  });

  test('nested assemblies: A → B → C created recursively and linked both ways', async () => {
    const raw = await insertProduct('Steel', { productType: 'raw_material', cost: 1, stockQuantity: 100 });
    const c = await insertProduct('Assembly C', { productType: 'sub_assembly' });
    const b = await insertProduct('Assembly B', { productType: 'sub_assembly' });
    const a = await insertProduct('Product A', { productType: 'finished_good' });
    await manufacturing.bom.createBom(ctx, { productId: c._id, components: [{ productId: raw._id, quantity: 3 }] });
    await manufacturing.bom.createBom(ctx, { productId: b._id, components: [{ productId: c._id, quantity: 2 }] });
    await manufacturing.bom.createBom(ctx, { productId: a._id, components: [{ productId: b._id, quantity: 1 }] });

    const orderA = await po().createOrder(ctx, { productId: a._id, plannedQuantity: 5 });
    const created = await po().createSubAssemblyOrders(ctx, orderA._id, { recursive: true });
    expect(created.map(({ order, depth }) => [order.productName, order.plannedQuantity, depth])).toEqual([
      ['Assembly B', 5, 1],
      ['Assembly C', 10, 2],
    ]);
    const orderC = created[1].order;
    const tree = await po().getOrderTree(ctx, orderC._id);
    expect(tree.ancestors.map((n) => n.productName)).toEqual(['Product A', 'Assembly B']);
    const top = await po().getOrderTree(ctx, orderA._id);
    expect(top.order.children[0].productName).toBe('Assembly B');
    expect(top.order.children[0].children[0].productName).toBe('Assembly C');
  });

  async function setSettingsQcOff() {
    await manufacturing.settings.updateSettings(ORG, { requireQualityCheck: false }, USER);
  }
});

describe('List support for the UI', () => {
  test('settings saved straight back from GET pass validation (every numbering prefix is accepted)', async () => {
    const validation = require('../../src/validations/manufacturing.validation'); // eslint-disable-line global-require
    const settings = await manufacturing.settings.getSettings(ORG);
    const { error } = validation.updateSettings.body.validate({
      prefixes: settings.toJSON().prefixes,
      numberPadding: settings.numberPadding,
    });
    expect(error).toBeUndefined();
    const saved = await manufacturing.settings.updateSettings(ORG, { prefixes: { assemblyOrder: 'asy' } }, USER);
    expect(saved.prefixes.assemblyOrder).toBe('ASY');
  });

  test('status counts per order type drive the filter chips', async () => {
    const { fan } = await buildMotorTree();
    const po = manufacturing.productionOrder;
    const a = await po.createOrder(ctx, { productId: fan._id, plannedQuantity: 1 });
    await po.createOrder(ctx, { productId: fan._id, plannedQuantity: 2, plannedCompletionDate: '2020-01-01' });
    await po.changeStatus(ctx, a._id, { status: 'cancelled' });

    const counts = await po.countOrdersByStatus(ctx, { orderType: 'production' });
    expect(counts).toMatchObject({ total: 2, open: 1, overdue: 1, byStatus: { draft: 1, cancelled: 1 } });
    expect(await po.countOrdersByStatus(ctx, { orderType: 'assembly' })).toMatchObject({ total: 0, open: 0 });
    expect((await po.countOrdersByStatus(ctx, { orderType: 'production', search: 'nothing-like-this' })).total).toBe(0);
    // Another organization sees none of it.
    expect((await po.countOrdersByStatus({ organizationId: id(), branchId: String(BRANCH) }, {})).total).toBe(0);
  });
});

describe('Dashboard analytics', () => {
  const { analytics } = manufacturing;
  // 13:00 in Karachi on 7 Oct 2026; business days run midnight-to-midnight PKT.
  const NOW = new Date('2026-10-07T08:00:00Z');
  const at = (isoDay, hourUtc = 7) => new Date(`${isoDay}T${String(hourUtc).padStart(2, '0')}:00:00Z`);

  test('periods: daily buckets ending today, weekly for 90 days, month to date; bad ranges rejected', () => {
    const week = analytics.resolvePeriod('7d', NOW);
    expect(week.buckets.map((b) => b.key)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
    ]);
    expect(week.granularity).toBe('day');
    expect(week.start.toISOString()).toBe('2026-09-30T19:00:00.000Z'); // 1 Oct 00:00 PKT
    expect(week.prevStart.toISOString()).toBe('2026-09-23T19:00:00.000Z');

    const quarter = analytics.resolvePeriod('90d', NOW);
    expect(quarter.granularity).toBe('week');
    expect(quarter.buckets).toHaveLength(13);
    expect(quarter.buckets[0].days).toHaveLength(7);
    expect(quarter.buckets.flatMap((b) => b.days)).toHaveLength(90);

    const mtd = analytics.resolvePeriod('mtd', NOW);
    expect(mtd.buckets.map((b) => b.key)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
    ]);
    expect(() => analytics.resolvePeriod('1y', NOW)).toThrow(/Unknown range/);
  });

  test('KPIs, series, breakdowns and production alerts from real records', async () => {
    const lineA = id();
    const lineB = id();
    const fan = id();
    const exhaust = id();
    const steel = id();
    const base = { organizationId: ORG, branchId: BRANCH };
    await ProductionOrder.collection.insertMany([
      {
        ...base,
        _id: lineA,
        orderNumber: 'MO-00120',
        productName: 'Ceiling Fan',
        unit: 'pcs',
        status: 'completed',
        wipLocation: 'Assembly Line 2',
        plannedQuantity: 10,
        completedQuantity: 10,
        plannedCompletionDate: at('2026-10-06'),
        actualCompletionDate: at('2026-10-07', 6),
        createdAt: at('2026-10-02'),
      },
      {
        ...base,
        _id: lineB,
        orderNumber: 'MO-00131',
        productName: 'Exhaust Fan',
        unit: 'pcs',
        status: 'in_production',
        wipLocation: 'Line 1',
        plannedQuantity: 20,
        completedQuantity: 5,
        materials: [],
        plannedCompletionDate: at('2026-10-05'),
        createdAt: at('2026-09-20'),
        wipLots: [{ quantity: 3, unitCost: 50 }],
      },
      {
        ...base,
        orderNumber: 'MO-00140',
        productName: 'Old Fan',
        unit: 'pcs',
        status: 'cancelled',
        plannedQuantity: 99,
        plannedCompletionDate: at('2026-10-04'),
        createdAt: at('2026-10-01'),
      },
    ]);
    let seq = 0;
    const receipt = (orderId, productName, day, quantity, totalCost) => ({
      ...base,
      receiptNumber: `FG-${(seq += 1)}`,
      productionOrderId: orderId,
      productId: productName === 'Exhaust Fan' ? exhaust : fan,
      productName,
      unit: 'pcs',
      receiptDate: at(day),
      quantity,
      totalCost,
    });
    await ProductionReceipt.collection.insertMany([
      receipt(lineA, 'Ceiling Fan', '2026-10-07', 10, 1000), // today
      receipt(lineB, 'Exhaust Fan', '2026-10-04', 5, 500),
      receipt(lineA, 'Ceiling Fan', '2026-09-27', 10, 1000), // previous 7 days
      receipt(lineB, 'Exhaust Fan', '2026-08-01', 50, 5000), // outside both periods
    ]);
    await ScrapRecord.collection.insertMany([
      { ...base, scrapNumber: 'SCR-1', productionOrderId: lineA, scrapDate: at('2026-10-07'), quantity: 1, totalCost: 100 },
      { ...base, scrapNumber: 'SCR-2', productionOrderId: lineA, scrapDate: at('2026-09-27'), quantity: 1, totalCost: 20 },
    ]);
    await ProductionOutput.collection.insertMany([
      {
        ...base,
        outputNumber: 'PO-1',
        productionOrderId: lineA,
        orderNumber: 'MO-00120',
        status: 'inspected',
        producedQuantity: 11,
        rejectedQuantity: 1,
        reportedAt: at('2026-10-07', 5),
        inspectedAt: at('2026-10-07', 6),
        consumption: [{ productId: steel, productName: 'Steel Tube', unit: 'pcs', quantity: 11, cost: 1100 }],
      },
      {
        ...base,
        outputNumber: 'PO-2',
        productionOrderId: lineB,
        orderNumber: 'MO-00131',
        status: 'pending_qc',
        producedQuantity: 4,
        unit: 'pcs',
        reportedAt: at('2026-10-04'),
        consumption: [],
      },
    ]);

    const a = await analytics.getAnalytics(ctx, { range: '7d' }, NOW);

    expect(a.kpis.productionOrders).toEqual({ total: 2, inProduction: 1, completed: 1 });
    expect(a.kpis.inProduction).toEqual({ count: 1, paused: 0, released: 0 });
    expect(a.kpis.completedToday).toEqual({ orders: 1, units: 10 });
    expect(a.kpis.unitsProduced).toEqual({ quantity: 15, value: 1500, previous: 10, change: 50 });
    expect(a.kpis.wipValue).toEqual({ value: 150, orders: 1 });
    expect(a.kpis.qcIssues).toMatchObject({ rejected: 1, inspected: 11, rejectRate: 9.1 });
    // 100 / (1500 + 100) this week vs 20 / (1000 + 20) last week
    expect(a.kpis.scrapRate).toEqual({ rate: 6.3, previous: 2, change: 4.3, value: 100 });

    const byDay = Object.fromEntries(a.series.map((s) => [s.key, s]));
    expect(byDay['2026-10-07']).toMatchObject({ produced: 10, target: 0, goodCost: 1000, scrapCost: 100, scrapRate: 9.1 });
    expect(byDay['2026-10-05']).toMatchObject({ produced: 0, target: 20 });
    expect(byDay['2026-10-06']).toMatchObject({ target: 10 });
    expect(byDay['2026-10-04']).toMatchObject({ produced: 5, target: 0 }); // the cancelled order sets no target
    expect(byDay['2026-09-30']).toBeUndefined();
    expect(a.series.find((s) => s.key === '2026-10-04').previous).toBe(10); // 27 Sep sits 7 days earlier

    expect(a.materialConsumption.rows).toEqual([
      { productId: String(steel), productName: 'Steel Tube', unit: 'pcs', quantity: 11, cost: 1100 },
    ]);
    expect(a.productionByProduct.rows.map((r) => [r.productName, r.quantity])).toEqual([
      ['Ceiling Fan', 10],
      ['Exhaust Fan', 5],
    ]);
    expect(a.productionByWorkCenter).toEqual([
      { workCenter: 'Assembly Line 2', quantity: 10, value: 1000, scrapCost: 100, scrapRate: 9.1 },
      { workCenter: 'Line 1', quantity: 5, value: 500, scrapCost: 0, scrapRate: 0 },
    ]);
    expect(a.orderStatus).toMatchObject({ completed: 1, in_production: 1, cancelled: 1 });

    const messages = a.alerts.map((x) => `${x.severity}|${x.message}`);
    expect(messages).toEqual(
      expect.arrayContaining([
        'warning|MO-00131 is 2 days behind schedule (Exhaust Fan)',
        'warning|Assembly Line 2 scrap rate increased by 355% (9.1% vs 2%)',
        'warning|PO-2 (4 pcs, MO-00131) has waited 3 days for QC',
        'success|MO-00120 completed successfully: 10 pcs Ceiling Fan',
      ])
    );
    expect(a.alerts[a.alerts.length - 1].severity).toBe('success'); // problems first
    expect(a.alertCounts).toEqual({ warning: 3, success: 1 });

    // Nothing leaks across organizations.
    const other = await analytics.getAnalytics({ organizationId: id(), branchId: String(BRANCH) }, { range: '7d' }, NOW);
    expect(other.kpis.unitsProduced.quantity).toBe(0);
    expect(other.alerts).toEqual([]);
  });
});
