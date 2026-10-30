const mongoose = require('mongoose');
const {
  Product,
  ProductVariant,
  Inventory,
  InventoryTransaction,
  Batch,
  Bom,
  ProductionOrder,
  MaterialIssue,
  ProductionReceipt,
  ProductionOutput,
  ScrapRecord,
  PackSize,
  PackingVoucher,
  ManufacturingSettings,
  User,
} = require('../../src/models');
const manufacturing = require('../../src/services/manufacturing');

/**
 * Packing: a bulk finished good (Vito Mineral T, kg) made by a BOM is packed into pack
 * sizes — 20 × 1 KG cartons, 5 KG bags, 20 KG bags — each its own sellable product, using
 * up packing material, either straight off the finished-goods receipt or later from bulk
 * stock. Needs a replica set (every posting is one transaction).
 */
const REPLSET_URL = process.env.MONGODB_TEST_REPLSET_URL;
const describeTx = REPLSET_URL ? describe : describe.skip;

beforeAll(async () => {
  if (REPLSET_URL) await mongoose.connect(REPLSET_URL);
  await Promise.all(
    [Bom, ProductionOrder, MaterialIssue, ProductionReceipt, ProductionOutput, ScrapRecord, Batch, PackSize, PackingVoucher].map(
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

/** Turns batch tracking on for a product (default variant + inventory), with no stock. */
const trackBatches = async (product) => {
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
    },
  ]);
  await Inventory.create([{ organizationId: ORG, branchId: BRANCH, productId: product._id, variantId: variant._id, quantity: 0 }]);
};

/**
 * Bulk: 1 kg Vito Mineral T = 1 kg premix (cost 4/kg).
 * Pack sizes: Carton = 20 × 1 KG pouch + 1 carton box · 5 KG Bag = 1 bag · 20 KG Bag = 1 bag.
 */
const setup = async ({ batches = false } = {}) => {
  await User.collection.insertOne({ _id: USER, organizationId: ORG, name: 'Packing Supervisor', email: 'pack@example.com' });
  await ManufacturingSettings.create({ organizationId: ORG, requireQualityCheck: false });
  const premix = await insertProduct('Mineral premix', { unit: 'kg', cost: 4, stockQuantity: 1000 });
  const pouch = await insertProduct('1 KG pouch', { cost: 0.5, stockQuantity: 500, productType: 'packaging_material' });
  const box = await insertProduct('Carton box', { cost: 10, stockQuantity: 50, productType: 'packaging_material' });
  const bag5 = await insertProduct('5 KG bag (empty)', { cost: 2, stockQuantity: 50, productType: 'packaging_material' });
  const bag20 = await insertProduct('20 KG bag (empty)', { cost: 3, stockQuantity: 50, productType: 'packaging_material' });
  const bulk = await insertProduct('Vito Mineral T', { unit: 'kg', cost: 0, productType: 'finished_good' });
  const carton = await insertProduct('Vito Mineral T Carton 20 x 1KG', { unit: 'carton', cost: 0, productType: 'finished_good' });
  const fiveKg = await insertProduct('Vito Mineral T 5KG Bag', { unit: 'bag', cost: 0, productType: 'finished_good' });
  const twentyKg = await insertProduct('Vito Mineral T 20KG Bag', { unit: 'bag', cost: 0, productType: 'finished_good' });
  if (batches) await Promise.all([bulk, carton, fiveKg].map(trackBatches));
  await manufacturing.bom.createBom(ctx, { productId: bulk._id, components: [{ productId: premix._id, quantity: 1, unit: 'kg' }] });
  const setupResult = await pk().saveSizes(ctx, bulk._id, {
    sizes: [
      {
        name: 'Carton 20 × 1 KG',
        packProductId: carton._id,
        contentQuantity: 20,
        innerCount: 20,
        innerName: '1 KG pouch',
        materials: [
          { productId: pouch._id, quantity: 20 },
          { productId: box._id, quantity: 1 },
        ],
      },
      { name: '5 KG Bag', packProductId: fiveKg._id, contentQuantity: 5, materials: [{ productId: bag5._id, quantity: 1 }] },
      { name: '20 KG Bag', packProductId: twentyKg._id, contentQuantity: 20, materials: [{ productId: bag20._id, quantity: 1 }] },
    ],
  });
  const size = Object.fromEntries(setupResult.sizes.map((s) => [s.name, s.id]));
  return { premix, pouch, box, bag5, bag20, bulk, carton, fiveKg, twentyKg, size };
};

const releaseAndIssue = async (bulk, premix, kg) => {
  const order = await po().createOrder(ctx, { productId: bulk._id, plannedQuantity: kg });
  await po().changeStatus(ctx, order._id, { status: 'released' });
  const released = await ProductionOrder.findById(order._id);
  await ex().issueMaterials(ctx, order._id, { lines: [{ materialLineId: released.materials[0]._id, quantity: kg }] });
  return ProductionOrder.findById(order._id);
};

describeTx('Packing', () => {
  test('pack sizes: validated, listed with stock; a pack product can be created from the sheet', async () => {
    const { bulk, carton, premix, size } = await setup();
    const s = await pk().getSetup(ctx, bulk._id);
    expect(s.product).toMatchObject({ name: 'Vito Mineral T', unit: 'kg', packable: true });
    expect(s.sizes.map((x) => [x.name, x.contentQuantity, x.packProduct.name, x.materials.length])).toEqual([
      ['Carton 20 × 1 KG', 20, 'Vito Mineral T Carton 20 x 1KG', 2],
      ['5 KG Bag', 5, 'Vito Mineral T 5KG Bag', 1],
      ['20 KG Bag', 20, 'Vito Mineral T 20KG Bag', 1],
    ]);
    expect(s.sizes[0].materials.find((m) => m.name === '1 KG pouch')).toMatchObject({ quantity: 20, available: 500 });

    const bad = (sizes) => pk().saveSizes(ctx, bulk._id, { sizes });
    await expect(bad([{ name: 'Self', packProductId: bulk._id, contentQuantity: 1 }])).rejects.toThrow(/different product/);
    await expect(
      bad([
        { name: 'A', packProductId: carton._id, contentQuantity: 1 },
        { name: 'B', packProductId: carton._id, contentQuantity: 2 },
      ])
    ).rejects.toThrow(/used by two pack sizes/);
    await expect(bad([{ name: 'A', packProductId: carton._id, contentQuantity: 0.000001, materials: [{ productId: bulk._id, quantity: 1 }] }])).rejects.toThrow(
      /own packing material/
    );
    // Untouched by the refused saves.
    expect((await pk().getSetup(ctx, bulk._id)).sizes.map((x) => x.id)).toEqual(Object.values(size));

    // Edit one (keeps its id), drop the others.
    const kept = await pk().saveSizes(ctx, bulk._id, {
      sizes: [{ id: size['5 KG Bag'], name: '5 KG Bag', packProductId: s.sizes[1].packProduct.id, contentQuantity: 5, innerCount: 1 }],
    });
    expect(kept.sizes).toHaveLength(1);
    expect(kept.sizes[0]).toMatchObject({ id: size['5 KG Bag'], materials: [] });

    expect(premix).toBeTruthy();
  });

  test('receive and pack in one step: bulk out, material out, packs in at cost; loose stays as bulk', async () => {
    const { premix, pouch, box, bag5, bulk, carton, fiveKg, size } = await setup();
    const order = await releaseAndIssue(bulk, premix, 110);

    const { output, packing } = await pk().receiveAndPack(ctx, order._id, {
      producedQuantity: 100,
      packing: {
        lines: [
          { packSizeId: size['Carton 20 × 1 KG'], quantity: 3 },
          { packSizeId: size['5 KG Bag'], quantity: 4 },
          { packSizeId: size['20 KG Bag'], quantity: 0 },
        ],
      },
    });
    expect(output.goodQuantity).toBe(100);
    expect(packing).toMatchObject({ source: 'receipt', bulkQuantity: 80, looseQuantity: 20, bulkUnitCost: 4, orderNumber: order.orderNumber });

    // Stock: bulk 100 in, 80 packed → 20 loose; 3 cartons, 4 bags; material used.
    expect(await stockOf(bulk)).toBe(20);
    expect(await stockOf(carton)).toBe(3);
    expect(await stockOf(fiveKg)).toBe(4);
    expect(await stockOf(pouch)).toBe(440); // 500 − 3 × 20
    expect(await stockOf(box)).toBe(47);
    expect(await stockOf(bag5)).toBe(46);

    // Cost: carton = 20 kg × 4 + 20 pouches × 0.5 + 1 box × 10 = 100; 5 kg bag = 20 + 2 = 22.
    const line = Object.fromEntries(packing.lines.map((l) => [l.packName, l]));
    expect(line['Carton 20 × 1 KG']).toMatchObject({ quantity: 3, bulkQuantity: 60, unitCost: 100, materialCost: 60, totalCost: 300 });
    expect(line['5 KG Bag']).toMatchObject({ quantity: 4, bulkQuantity: 20, unitCost: 22, totalCost: 88 });
    expect(packing.totalCost).toBe(388);

    // Ledger: one row per movement, all on this voucher.
    const rows = await InventoryTransaction.find({ refType: 'PackingVoucher', refId: packing._id }).lean();
    const byType = (t) => rows.filter((r) => r.type === t).map((r) => r.quantityDelta).sort((a, b) => a - b);
    expect(byType('packing_out')).toEqual([-80, -60, -4, -3]);
    expect(byType('packing_in')).toEqual([3, 4]);

    // Packing more than was received good rolls the receipt back too.
    await expect(
      pk().receiveAndPack(ctx, order._id, {
        producedQuantity: 10,
        qcMode: 'direct',
        packing: { lines: [{ packSizeId: size['20 KG Bag'], quantity: 1 }] },
      })
    ).rejects.toThrow(/hold 20 kg but only 10 kg was received/);
    expect((await ProductionOrder.findById(order._id).lean()).producedQuantity).toBe(100);
    expect(await stockOf(bulk)).toBe(20);
  });

  test('packing later from bulk stock; short packing material refuses the whole voucher', async () => {
    const { premix, bag20, bulk, twentyKg, size, box } = await setup();
    const order = await releaseAndIssue(bulk, premix, 100);
    await ex().reportOutput(ctx, order._id, { producedQuantity: 100 });
    expect(await stockOf(bulk)).toBe(100);

    const v = await pk().postPacking(ctx, {
      productId: bulk._id,
      productionOrderId: order._id,
      lines: [{ packSizeId: size['20 KG Bag'], quantity: 2 }],
      packingDate: '2026-10-20',
    });
    expect(v).toMatchObject({ source: 'stock', bulkQuantity: 40, batchNumber: order.batchNumber });
    expect(v.voucherNumber).toMatch(/^PK-\d{5}$/);
    // Bulk valued at what production cost (its own cost field is 0).
    expect(v.bulkUnitCost).toBe(4);
    expect(v.lines[0].unitCost).toBe(83);
    expect(await stockOf(bulk)).toBe(60);
    expect(await stockOf(twentyKg)).toBe(2);
    expect(await stockOf(bag20)).toBe(48);

    // 3 cartons need 3 boxes — only 1 left: nothing moves.
    await Product.updateOne({ _id: box._id }, { $set: { stockQuantity: 1 } });
    await expect(
      pk().postPacking(ctx, { productId: bulk._id, lines: [{ packSizeId: size['Carton 20 × 1 KG'], quantity: 3 }] })
    ).rejects.toThrow(/Insufficient stock for "Carton box"/);
    expect(await stockOf(bulk)).toBe(60);
    expect(await PackingVoucher.countDocuments()).toBe(1);

    // More bulk than in stock.
    await expect(
      pk().postPacking(ctx, { productId: bulk._id, lines: [{ packSizeId: size['20 KG Bag'], quantity: 4 }] })
    ).rejects.toThrow(/Insufficient stock for "Vito Mineral T"/);
  });

  test('cancel puts everything back; refused once packs were sold; a packed receipt cannot be reversed first', async () => {
    const { premix, pouch, box, bulk, carton, size } = await setup();
    const order = await releaseAndIssue(bulk, premix, 100);
    const { output, packing } = await pk().receiveAndPack(ctx, order._id, {
      producedQuantity: 100,
      packing: { lines: [{ packSizeId: size['Carton 20 × 1 KG'], quantity: 5 }] },
    });
    await expect(ex().reverseOutput(ctx, output._id, { reason: 'wrong_quantity' })).rejects.toThrow(
      new RegExp(`packed on ${packing.voucherNumber}`)
    );

    // One carton sold → cannot take 5 back.
    await Product.updateOne({ _id: carton._id }, { $inc: { stockQuantity: -1 } });
    await expect(pk().cancelPacking(ctx, packing._id, { reason: 'Wrong count' })).rejects.toThrow(/no longer in stock/);
    await Product.updateOne({ _id: carton._id }, { $inc: { stockQuantity: 1 } });

    await expect(pk().cancelPacking(ctx, packing._id, {})).rejects.toThrow(/reason/);
    const cancelled = await pk().cancelPacking(ctx, packing._id, { reason: 'Wrong count' });
    expect(cancelled).toMatchObject({ status: 'cancelled', cancelReason: 'Wrong count' });
    expect(cancelled.cancelledBy.name).toBe('Packing Supervisor');
    expect(await stockOf(bulk)).toBe(100);
    expect(await stockOf(carton)).toBe(0);
    expect(await stockOf(pouch)).toBe(500);
    expect(await stockOf(box)).toBe(50);
    await expect(pk().cancelPacking(ctx, packing._id, { reason: 'again' })).rejects.toThrow(/already cancelled/);

    // Now the receipt can be reversed.
    await ex().reverseOutput(ctx, output._id, { reason: 'wrong_quantity' });
    expect(await stockOf(bulk)).toBe(0);
  });

  test('reverse a packed receipt in one step: packing cancelled, receipt reversed, all stock back', async () => {
    const { premix, pouch, box, bulk, carton, fiveKg, size } = await setup();
    const order = await releaseAndIssue(bulk, premix, 100);
    const { output, packing } = await pk().receiveAndPack(ctx, order._id, {
      producedQuantity: 100,
      packing: {
        lines: [
          { packSizeId: size['Carton 20 × 1 KG'], quantity: 2 },
          { packSizeId: size['5 KG Bag'], quantity: 4 },
        ],
      },
    });
    const res = await ex().reverseOutput(ctx, output._id, { reason: 'wrong_quantity', cancelPacking: true });
    expect(res.cancelledPacking).toEqual([packing.voucherNumber]);
    expect((await PackingVoucher.findById(packing._id)).status).toBe('cancelled');
    expect(await stockOf(bulk)).toBe(0);
    expect(await stockOf(carton)).toBe(0);
    expect(await stockOf(fiveKg)).toBe(0);
    expect(await stockOf(pouch)).toBe(500);
    expect(await stockOf(box)).toBe(50);
    const o = await ProductionOrder.findById(order._id).lean();
    expect(o.completedQuantity).toBe(0);
    // Receive again with the right quantity: 2 × 20 + 4 × 5 = 60 kg packed.
    const again = await pk().receiveAndPack(ctx, order._id, {
      producedQuantity: 60,
      packing: {
        lines: [
          { packSizeId: size['Carton 20 × 1 KG'], quantity: 2 },
          { packSizeId: size['5 KG Bag'], quantity: 4 },
        ],
      },
    });
    expect(again.packing).toMatchObject({ bulkQuantity: 60, looseQuantity: 0 });
    expect(await stockOf(bulk)).toBe(0);
  });

  test('batch-tracked: bulk comes out of the receipt batch, packs go into the same batch number', async () => {
    const { premix, bulk, carton, fiveKg, size } = await setup({ batches: true });
    const order = await releaseAndIssue(bulk, premix, 100);
    const { packing } = await pk().receiveAndPack(ctx, order._id, {
      producedQuantity: 100,
      packing: {
        lines: [
          { packSizeId: size['Carton 20 × 1 KG'], quantity: 2 },
          { packSizeId: size['5 KG Bag'], quantity: 6 },
        ],
      },
    });
    expect(packing.batchNumber).toBe(order.batchNumber);
    expect(packing.consumed[0].batches).toEqual([expect.objectContaining({ batchNumber: order.batchNumber, quantity: 70 })]);
    const lots = await Batch.find({ batchNumber: order.batchNumber }).lean();
    const qtyOf = async (product) => {
      const inv = await Inventory.findOne({ productId: product._id }).lean();
      return lots.find((b) => String(b.inventoryId) === String(inv._id));
    };
    expect(await qtyOf(bulk)).toMatchObject({ quantity: 30 });
    expect(await qtyOf(carton)).toMatchObject({ quantity: 2, costPerUnit: 80 + 10 + 10 });
    expect(await qtyOf(fiveKg)).toMatchObject({ quantity: 6 });
    // The 20 KG bag product does not track batches — still packs fine.
    const v = await pk().postPacking(ctx, { productId: bulk._id, lines: [{ packSizeId: size['20 KG Bag'], quantity: 1 }] });
    expect(v.consumed[0].batches[0]).toMatchObject({ batchNumber: order.batchNumber, quantity: 20 });
  });

  test('products with variants: the only variant is used; several must be chosen (order or receipt)', async () => {
    const { premix } = await setup();
    const bulk = await insertProduct('VITO MINERAL T KG', { unit: 'kg', cost: 0, productType: 'finished_good', hasVariants: true });
    const mkVariant = async (grade) => {
      const [v] = await ProductVariant.create([
        { organizationId: ORG, branchId: BRANCH, productId: bulk._id, isDefault: false, unit: 'kg', price: 1, cost: 0, attributes: { Grade: grade } },
      ]);
      await Inventory.create([{ organizationId: ORG, branchId: BRANCH, productId: bulk._id, variantId: v._id, quantity: 0 }]);
      return v;
    };
    const gradeA = await mkVariant('A');
    await manufacturing.bom.createBom(ctx, { productId: bulk._id, components: [{ productId: premix._id, quantity: 1, unit: 'kg' }] });
    const packProduct = await insertProduct('VMT Carton', { unit: 'carton', productType: 'finished_good' });
    const saved = await pk().saveSizes(ctx, bulk._id, { sizes: [{ name: 'Carton 20 × 1 KG', packProductId: packProduct._id, contentQuantity: 20 }] });
    const sizeId = saved.sizes[0].id;

    // One variant: everything just works — order, setup, receipt + packing, stock packing.
    expect(saved.product).toMatchObject({ packable: true, problem: null, variantId: String(gradeA._id) });
    const order = await po().createOrder(ctx, { productId: bulk._id, plannedQuantity: 60 });
    expect(String(order.variantId)).toBe(String(gradeA._id));
    await po().changeStatus(ctx, order._id, { status: 'released' });
    const released = await ProductionOrder.findById(order._id);
    await ex().issueMaterials(ctx, order._id, { lines: [{ materialLineId: released.materials[0]._id, quantity: 60 }] });

    // An order made before the variant was required (no variantId) is settled on receipt.
    await ProductionOrder.updateOne({ _id: order._id }, { $set: { variantId: null } });
    const { packing } = await pk().receiveAndPack(ctx, order._id, {
      producedQuantity: 40,
      packing: { lines: [{ packSizeId: sizeId, quantity: 1 }] },
    });
    expect(String((await ProductionOrder.findById(order._id)).variantId)).toBe(String(gradeA._id));
    expect(packing).toMatchObject({ bulkQuantity: 20, looseQuantity: 20, variantId: gradeA._id });
    const fromStock = await pk().postPacking(ctx, { productId: bulk._id, lines: [{ packSizeId: sizeId, quantity: 1 }] });
    expect(fromStock.variantId).toEqual(gradeA._id);
    expect((await Inventory.findOne({ variantId: gradeA._id })).quantity).toBe(0);

    // Two variants: setup asks, new orders must name one, an unnamed old order is named on receipt.
    const gradeB = await mkVariant('B');
    const two = await pk().getSetup(ctx, bulk._id);
    expect(two.product).toMatchObject({ packable: false, variants: [expect.objectContaining({ label: 'A' }), expect.objectContaining({ label: 'B' })] });
    expect(two.product.problem).toMatch(/several variants/);
    expect((await pk().getSetup(ctx, bulk._id, { variantId: gradeB._id })).product.packable).toBe(true);
    await expect(po().createOrder(ctx, { productId: bulk._id, plannedQuantity: 20 })).rejects.toThrow(/2 variants \(A, B\) — choose which one/);
    const orderB = await po().createOrder(ctx, { productId: bulk._id, variantId: gradeB._id, plannedQuantity: 20 });
    await po().changeStatus(ctx, orderB._id, { status: 'released' });
    const relB = await ProductionOrder.findById(orderB._id);
    await ex().issueMaterials(ctx, orderB._id, { lines: [{ materialLineId: relB.materials[0]._id, quantity: 20 }] });
    await ProductionOrder.updateOne({ _id: orderB._id }, { $set: { variantId: null } });
    await expect(ex().reportOutput(ctx, orderB._id, { producedQuantity: 20 })).rejects.toThrow(/choose which one/);
    const named = await pk().receiveAndPack(ctx, orderB._id, {
      producedQuantity: 20,
      variantId: gradeB._id,
      packing: { lines: [{ packSizeId: sizeId, quantity: 1 }] },
    });
    expect(named.packing.variantId).toEqual(gradeB._id);
    await pk().cancelPacking(ctx, named.packing._id, { reason: 'test' });
    expect((await Inventory.findOne({ variantId: gradeB._id })).quantity).toBe(20);
  });

  test('flagged "has variants" but has none: orders, receipts and packing work like a simple product', async () => {
    const { premix, carton } = await setup();
    const bulk = await insertProduct('CALCOPHOS 5 LTR', { unit: 'kg', cost: 0, productType: 'finished_good', hasVariants: true });
    await manufacturing.bom.createBom(ctx, { productId: bulk._id, components: [{ productId: premix._id, quantity: 1, unit: 'kg' }] });
    const order = await po().createOrder(ctx, { productId: bulk._id, plannedQuantity: 10 });
    expect(order.variantId).toBeNull();
    await po().changeStatus(ctx, order._id, { status: 'released' });
    const o = await ProductionOrder.findById(order._id);
    await ex().issueMaterials(ctx, order._id, { lines: [{ materialLineId: o.materials[0]._id, quantity: 10 }] });
    await ex().reportOutput(ctx, order._id, { producedQuantity: 10 });
    expect(await stockOf(bulk)).toBe(10);
    const setupResult = await pk().getSetup(ctx, bulk._id);
    expect(setupResult.product).toMatchObject({ packable: true, problem: null });
    expect(carton).toBeTruthy();
  });

  test('product lists: pack products are hidden where a BOM / order makes things, offered for pack sizes', async () => {
    const { bulk, carton, fiveKg, twentyKg } = await setup();
    const spare = await insertProduct('Spare finished good', { productType: 'finished_good' });
    const names = async (filter) =>
      (await manufacturing.products.queryProducts(ctx, { productType: 'finished_good', ...filter }, { limit: 100 })).results
        .map((p) => p.name)
        .sort();
    expect(await names({ packRole: 'make' })).toEqual(['Spare finished good', 'Vito Mineral T'].sort());
    expect(await names({ packRole: 'packs' })).toEqual([carton.name, fiveKg.name, twentyKg.name].sort());
    // Pack size choices: the packs and goods with no BOM of their own — never the bulk itself.
    expect(await names({ packRole: 'pack' })).toEqual([carton.name, fiveKg.name, twentyKg.name, spare.name].sort());
    const all = (await manufacturing.products.queryProducts(ctx, { productType: 'finished_good' }, { limit: 100 })).results;
    expect(all.find((p) => p.name === carton.name).packOf).toMatchObject({ productName: 'Vito Mineral T', sizeName: 'Carton 20 × 1 KG', contentQuantity: 20 });
    expect(all.find((p) => p.name === 'Vito Mineral T').packSizeCount).toBe(3);
    expect(bulk).toBeTruthy();
  });

  test('reports: stock statement shows packed in/out; the product register counts packs and extra packing', async () => {
    const { premix, bulk, carton, fiveKg, twentyKg, size } = await setup();
    const order = await releaseAndIssue(bulk, premix, 100);
    await pk().receiveAndPack(ctx, order._id, {
      producedQuantity: 100,
      packing: {
        lines: [
          { packSizeId: size['Carton 20 × 1 KG'], quantity: 3 },
          { packSizeId: size['5 KG Bag'], quantity: 4 },
        ],
      },
    });
    const today = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
    const report = (name, q) => manufacturing.reports.getReport(ctx, name, { startDate: today, endDate: today, ...q });

    const fg = await report('finished-goods', { hideIdle: false });
    const row = (p) => fg.rows.find((x) => String(x.productId || x.id) === String(p._id));
    expect(row(carton).movements).toMatchObject({ packedIn: 3, packedOut: 0 });
    expect(row(bulk).movements).toMatchObject({ produced: 100, packedOut: -80 });
    expect(row(bulk).closing).toBe(20);

    const [reg] = (await report('product-production', { productIds: String(bulk._id) })).registers;
    const pack = Object.fromEntries(reg.packs.map((p) => [p.productId, p]));
    expect(pack[String(carton._id)]).toMatchObject({ quantity: 3, kgPerUnit: 20, weightSource: 'pack', kg: 60, loose: false });
    expect(pack[String(fiveKg._id)]).toMatchObject({ quantity: 4, kgPerUnit: 5, kg: 20 });
    // The bulk's own column keeps only what stayed loose: 100 received − 80 packed.
    expect(pack[String(bulk._id)]).toMatchObject({ loose: true, quantity: 20, kg: 20 });
    expect(reg.hasLoose).toBe(true);
    expect(reg.totals).toMatchObject({ issueKg: 100, packedKg: 80, looseKg: 20, finishedKg: 100 });
    expect(reg.closingInProcessKg).toBe(0);
    expect(twentyKg).toBeTruthy();
  });
});
