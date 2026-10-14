const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  Product,
  ProductVariant,
  Inventory,
  Batch,
  Imei,
  Supplier,
  Purchase,
  PurchaseOrder,
  RawMaterialReceipt,
  InventoryTransaction,
} = require('../../src/models');
const manufacturing = require('../../src/services/manufacturing');

/**
 * Raw material receipt voucher (RMV) — drafts never move stock; confirming posts the
 * voucher, a linked purchase (stock, batches, serials, cost, supplier payable) and the PO's
 * received quantities in one transaction. Confirmation needs a replica set
 * (MONGODB_TEST_REPLSET_URL), like the other manufacturing transaction tests.
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
  await Promise.all([RawMaterialReceipt, Purchase, PurchaseOrder, Batch].map((m) => m.syncIndexes()));
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
const rmv = manufacturing.materialReceipt;

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
    ...overrides,
  };
  await Product.collection.insertOne(doc);
  return doc;
};

/** A simple product whose default variant carries batch (+expiry) tracking, with its Inventory row. */
const insertBatchProduct = async (name, { trackExpiry = true } = {}) => {
  const product = await insertProduct(name, { unit: 'kg' });
  const variant = {
    _id: id(),
    organizationId: ORG,
    branchId: BRANCH,
    productId: product._id,
    isDefault: true,
    sku: `${name}-default`,
    unit: 'kg',
    price: 100,
    cost: 10,
    trackBatch: true,
    trackExpiry,
    attributes: {},
  };
  await ProductVariant.collection.insertOne(variant);
  await Inventory.collection.insertOne({
    _id: id(),
    organizationId: ORG,
    branchId: BRANCH,
    productId: product._id,
    variantId: variant._id,
    quantity: 0,
    averageCost: 0,
  });
  return { product, variant };
};

const insertSupplier = async (name = 'Steel Traders') => {
  const doc = { _id: id(), organizationId: ORG, branchId: BRANCH, name };
  await Supplier.collection.insertOne(doc);
  return doc;
};

const rowErrorsOf = async (promise) => {
  try {
    await promise;
  } catch (err) {
    return { message: err.message, code: err.errorCode, rows: (err.details && err.details.rows) || [] };
  }
  throw new Error('expected a rejection');
};

describe('Raw material receipt — lines and drafts', () => {
  test('computes line money server-side: discount on gross, tax on the discounted amount', () => {
    expect(rmv.computeLine({ quantity: 100, rate: 250, discountPercent: 10, taxPercent: 17 })).toMatchObject({
      gross: 25000,
      discountAmount: 2500,
      taxable: 22500,
      taxAmount: 3825,
      netAmount: 26325,
      netUnitCost: 225,
    });
  });

  test('a draft gets an RMV number, stores totals, and never touches stock', async () => {
    const steel = await insertProduct('Steel Sheet', { unit: 'kg' });
    const bearing = await insertProduct('Bearing', { productType: 'component' });
    const supplier = await insertSupplier();
    const draft = await rmv.createReceipt(ctx, {
      supplierId: String(supplier._id),
      reference: 'BILL-77',
      lines: [
        { productId: String(steel._id), quantity: 100, rate: 250 },
        { productId: String(bearing._id), quantity: 200, rate: 150, discountPercent: 5, taxPercent: 10 },
        // an incomplete line is fine in a draft
        { productId: String(steel._id), quantity: null, rate: null },
      ],
    });
    expect(draft.voucherNumber).toBe('RMV-00001');
    expect(draft.status).toBe('draft');
    expect(draft.supplierName).toBe('Steel Traders');
    expect(draft.totals).toMatchObject({
      items: 3,
      quantity: 300,
      subtotal: 55000,
      discount: 1500,
      tax: 2850,
      grandTotal: 56350,
    });
    expect((await Product.findById(steel._id).lean()).stockQuantity).toBe(0);
    expect(await Purchase.countDocuments()).toBe(0);

    const updated = await rmv.updateReceipt(ctx, draft._id, {
      lines: [{ productId: String(steel._id), quantity: 10, rate: 1 }],
    });
    expect(updated.totals.grandTotal).toBe(10);
    await rmv.deleteReceipt(ctx, draft._id);
    expect(await RawMaterialReceipt.countDocuments()).toBe(0);
  });

  test('refuses finished goods and other organizations’ data', async () => {
    const fan = await insertProduct('Ceiling Fan', { productType: 'finished_good' });
    const res = await rowErrorsOf(rmv.createReceipt(ctx, { lines: [{ productId: String(fan._id), quantity: 1, rate: 1 }] }));
    expect(res.code).toBe('ROW_ERRORS');
    expect(res.rows).toEqual([
      { line: 1, field: 'product', message: "A finished good can't be received on a raw material receipt" },
    ]);

    const otherOrgSupplier = { _id: id(), organizationId: id(), branchId: BRANCH, name: 'Elsewhere' };
    await Supplier.collection.insertOne(otherOrgSupplier);
    await expect(rmv.createReceipt(ctx, { supplierId: String(otherOrgSupplier._id), lines: [] })).rejects.toThrow(
      /Supplier not found in this organization/
    );
    const steel = await insertProduct('Steel Sheet');
    const draft = await rmv.createReceipt(ctx, { lines: [{ productId: String(steel._id), quantity: 1, rate: 1 }] });
    const otherCtx = { organizationId: id(), branchId: String(BRANCH), createdBy: USER };
    await expect(rmv.getReceipt(otherCtx, draft._id)).rejects.toThrow(/not found/);
    await expect(rmv.confirmReceipt(otherCtx, draft._id)).rejects.toThrow(/not found/);
  });
});

describeTx('Raw material receipt — confirmation (transactional)', () => {
  test('posts a credit purchase: stock, cost, manual tax, supplier payable, back-links', async () => {
    const steel = await insertProduct('Steel Sheet', { unit: 'kg', stockQuantity: 5 });
    const bearing = await insertProduct('Bearing', { productType: 'component' });
    const supplier = await insertSupplier();
    const voucher = await rmv.saveAndConfirm(ctx, null, {
      supplierId: String(supplier._id),
      reference: 'BILL-1',
      location: 'Raw Material Store',
      lines: [
        { productId: String(steel._id), quantity: 100, rate: 250 },
        { productId: String(bearing._id), quantity: 200, rate: 150, discountPercent: 10, taxPercent: 17 },
      ],
    });
    expect(voucher.status).toBe('confirmed');
    expect(voucher.totals).toMatchObject({ subtotal: 55000, discount: 3000, tax: 4590, grandTotal: 56590 });

    expect((await Product.findById(steel._id).lean()).stockQuantity).toBe(105);
    const bearingDoc = await Product.findById(bearing._id).lean();
    expect(bearingDoc.stockQuantity).toBe(200);
    expect(bearingDoc.cost).toBe(135); // net of discount, before (recoverable) tax

    const purchase = await Purchase.findById(voucher.purchaseId).lean();
    expect(String(purchase.rawMaterialReceipt)).toBe(String(voucher._id));
    expect(String(purchase.supplier)).toBe(String(supplier._id));
    expect(purchase.vendorBillNumber).toBe('BILL-1');
    expect(purchase.tax).toBe(4590);
    expect(purchase.totalAmount).toBe(56590);
    expect(purchase.balance).toBe(56590); // the supplier payable
    expect(voucher.purchaseInvoiceNumber).toBe(purchase.invoiceNumber);

    // A confirmed voucher is final.
    await expect(rmv.updateReceipt(ctx, voucher._id, { notes: 'x' })).rejects.toThrow(/can no longer be edited/);
    await expect(rmv.confirmReceipt(ctx, voucher._id)).rejects.toThrow(/already confirmed/);
    await expect(rmv.deleteReceipt(ctx, voucher._id)).rejects.toThrow(/Only a draft/);
  });

  test('confirming requires a supplier, quantities, batch + expiry; problems point at their lines', async () => {
    const { product: wire } = await insertBatchProduct('Copper Wire');
    const steel = await insertProduct('Steel Sheet');
    const draft = await rmv.createReceipt(ctx, {
      lines: [
        { productId: String(steel._id), quantity: 0, rate: 10 },
        { productId: String(wire._id), quantity: 5, rate: 10 },
      ],
    });
    await expect(rmv.confirmReceipt(ctx, draft._id)).rejects.toThrow(/Choose the supplier/);
    const supplier = await insertSupplier();
    await rmv.updateReceipt(ctx, draft._id, { supplierId: String(supplier._id) });
    const res = await rowErrorsOf(rmv.confirmReceipt(ctx, draft._id));
    expect(res.rows).toEqual([
      { line: 1, field: 'quantity', message: 'Enter a quantity above 0' },
      { line: 2, field: 'batchNumber', message: 'Enter the batch number' },
      { line: 2, field: 'expiryDate', message: 'Enter the expiry date' },
    ]);
    expect((await RawMaterialReceipt.findById(draft._id)).status).toBe('draft');
  });

  test('batch-tracked lines create batches with expiry; the same batch number is topped up, not duplicated', async () => {
    const { product: wire, variant } = await insertBatchProduct('Copper Wire');
    const supplier = await insertSupplier();
    const line = { productId: String(wire._id), quantity: 50, rate: 3200, batchNumber: 'CW-2401', expiryDate: '2027-01-31' };
    await rmv.saveAndConfirm(ctx, null, { supplierId: String(supplier._id), lines: [line] });
    await rmv.saveAndConfirm(ctx, null, { supplierId: String(supplier._id), lines: [{ ...line, quantity: 25 }] });
    const batches = await Batch.find({ batchNumber: 'CW-2401' }).lean();
    expect(batches).toHaveLength(1);
    expect(batches[0].quantity).toBe(75);
    expect(new Date(batches[0].expiryDate).toISOString().slice(0, 10)).toBe('2027-01-31');
    expect((await Inventory.findOne({ variantId: variant._id }).lean()).quantity).toBe(75);
  });

  test('serial-tracked lines create serial units; quantity is the serial count; duplicates are refused per line', async () => {
    const board = await insertProduct('Controller Board', { productType: 'component', trackSerial: true });
    const supplier = await insertSupplier();
    const v = await rmv.saveAndConfirm(ctx, null, {
      supplierId: String(supplier._id),
      lines: [{ productId: String(board._id), quantity: 99, rate: 900, serials: ['SN-1', 'SN-2', 'SN-2'] }],
    });
    expect(v.lines[0].quantity).toBe(2);
    expect(v.lines[0].serials).toEqual(['SN-1', 'SN-2']);
    const units = await Imei.find({ productId: board._id }).lean();
    expect(units.map((u) => [u.imei, u.status]).sort()).toEqual([
      ['SN-1', 'in_stock'],
      ['SN-2', 'in_stock'],
    ]);

    const res = await rowErrorsOf(
      rmv.saveAndConfirm(ctx, null, {
        supplierId: String(supplier._id),
        lines: [
          { productId: String(board._id), rate: 900, serials: ['SN-3'] },
          { productId: String(board._id), rate: 900, serials: ['SN-2', 'SN-3'] },
        ],
      })
    );
    expect(res.rows).toEqual(
      expect.arrayContaining([{ line: 2, field: 'serials', message: 'Serial SN-3 is also on line 1' }])
    );
  });

  test('against a purchase order: received quantities and status update; over-receipt rolls EVERYTHING back', async () => {
    const steel = await insertProduct('Steel Sheet', { unit: 'kg' });
    const bearing = await insertProduct('Bearing', { productType: 'component' });
    const supplier = await insertSupplier();
    const po = await PurchaseOrder.create({
      organizationId: ORG,
      branchId: BRANCH,
      orderNumber: 'PO-0001',
      supplier: supplier._id,
      status: 'sent',
      items: [
        { product: steel._id, productName: 'Steel Sheet', quantity: 100, expectedPrice: 250, total: 25000, unit: 'kg' },
        { product: bearing._id, productName: 'Bearing', quantity: 200, expectedPrice: 150, total: 30000 },
      ],
      subtotal: 55000,
      totalAmount: 55000,
    });

    // Over-receipt: the purchase is created inside the transaction, then the PO check fails.
    const draft = await rmv.createReceipt(ctx, {
      supplierId: String(supplier._id),
      purchaseOrderId: String(po._id),
      lines: [{ productId: String(steel._id), quantity: 120, rate: 250 }],
    });
    const res = await rowErrorsOf(rmv.confirmReceipt(ctx, draft._id));
    expect(res.rows).toEqual([{ line: 1, field: 'quantity', message: 'Only 100 kg left to receive on PO-0001' }]);
    expect((await Product.findById(steel._id).lean()).stockQuantity).toBe(0);
    expect(await Purchase.countDocuments()).toBe(0);
    expect((await RawMaterialReceipt.findById(draft._id)).status).toBe('draft');
    expect((await PurchaseOrder.findById(po._id).lean()).items[0].receivedQuantity).toBe(0);
    // The inventory-ledger mirror joined the same transaction, so it rolled back too.
    expect(await InventoryTransaction.countDocuments({ refType: 'Purchase' })).toBe(0);

    // A product that isn't on the order.
    const rogue = await insertProduct('Paint');
    await rmv.updateReceipt(ctx, draft._id, {
      lines: [
        { productId: String(steel._id), quantity: 60, rate: 250 },
        { productId: String(rogue._id), quantity: 1, rate: 1 },
      ],
    });
    expect((await rowErrorsOf(rmv.confirmReceipt(ctx, draft._id))).rows).toEqual([
      { line: 2, field: 'product', message: 'Not on purchase order PO-0001' },
    ]);

    await rmv.updateReceipt(ctx, draft._id, { lines: [{ productId: String(steel._id), quantity: 60, rate: 250 }] });
    const confirmed = await rmv.confirmReceipt(ctx, draft._id);
    const after = await PurchaseOrder.findById(po._id).lean();
    if (process.env.DUAL_WRITE_INVENTORY === 'all') {
      const rows = await InventoryTransaction.find({ refType: 'Purchase', refId: confirmed.purchaseId }).lean();
      expect(rows.map((r) => r.quantityDelta)).toEqual([60]);
    }
    expect(after.items[0].receivedQuantity).toBe(60);
    expect(after.status).toBe('partial');
    expect(after.receipts).toHaveLength(1);
    expect(String(after.receipts[0].purchase)).toBe(String(confirmed.purchaseId));
    expect(String((await Purchase.findById(confirmed.purchaseId).lean()).purchaseOrder)).toBe(String(po._id));

    // A PO for another supplier is refused.
    const other = await insertSupplier('Someone Else');
    await expect(
      rmv.createReceipt(ctx, { supplierId: String(other._id), purchaseOrderId: String(po._id), lines: [] })
    ).rejects.toThrow(/for another supplier/);
  });

  test('two confirmations at once post exactly one purchase', async () => {
    const steel = await insertProduct('Steel Sheet');
    const supplier = await insertSupplier();
    const draft = await rmv.createReceipt(ctx, {
      supplierId: String(supplier._id),
      lines: [{ productId: String(steel._id), quantity: 10, rate: 5 }],
    });
    const results = await Promise.allSettled([rmv.confirmReceipt(ctx, draft._id), rmv.confirmReceipt(ctx, draft._id)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await Purchase.countDocuments()).toBe(1);
    expect((await Product.findById(steel._id).lean()).stockQuantity).toBe(10);
  });
});
