const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const setupTestDB = require('../utils/setupTestDB');

/**
 * Multi-warehouse: the default warehouse holds "branch stock − everything stored elsewhere",
 * so transfers, bins, invoices/purchases that name a warehouse, changing the default and
 * cancelling must always keep every warehouse adding up to the branch total.
 */
const mockGranted = { perms: new Set() };
const mockScope = {};
jest.mock('../../src/middlewares/auth', () => (...required) => (req, res, next) => {
  const ApiErrorLocal = require('../../src/utils/ApiError');
  req.user = { id: mockScope.userId, name: 'Test User', email: 'test@example.com' };
  if (required.length && !required.some((p) => mockGranted.perms.has(p))) {
    return next(new ApiErrorLocal(403, `You do not have permission to ${required.join(' or ')}.`));
  }
  return next();
});
jest.mock('../../src/middlewares/permission', () => ({
  ...jest.requireActual('../../src/middlewares/permission'),
  userHasAnyPermission: async (user, perms) => perms.some((p) => mockGranted.perms.has(p)),
}));
jest.mock('../../src/middlewares/branchScope', () => () => (req, res, next) => {
  req.organizationId = mockScope.organizationId;
  req.branchId = mockScope.branchId;
  next();
});

const { errorConverter, errorHandler } = require('../../src/middlewares/error');
const { Organization, Branch, Product, User, Purchase, Supplier, WarehouseMove } = require('../../src/models');
const entitlementService = require('../../src/services/entitlement.service');
const invoiceService = require('../../src/services/invoice.service');
const warehouseService = require('../../src/services/warehouse.service');
const warehouseRoute = require('../../src/routes/v1/warehouse.route');

setupTestDB();
jest.setTimeout(60000);

const app = express();
app.use(express.json());
app.use('/v1/warehouses', warehouseRoute);
app.use(errorConverter);
app.use(errorHandler);
const api = () => request(app);

let ORG;
let main;
let other;
let fan;
let cable;
let owner;

beforeAll(() => {
  jest.spyOn(entitlementService, 'assertCanCreateInvoice').mockResolvedValue();
  jest.spyOn(entitlementService, 'assertCanWrite').mockResolvedValue();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

beforeEach(async () => {
  ORG = new mongoose.Types.ObjectId();
  owner = await User.create({ name: 'Owner', email: `o${Date.now()}@example.com`, password: 'password1', organizationId: ORG, systemRole: 'superAdmin' });
  await Organization.create({ _id: ORG, name: 'WH Traders', owner: owner._id });
  [main, other] = await Branch.create([
    { organizationId: ORG, name: 'Main' },
    { organizationId: ORG, name: 'Other' },
  ]);
  mockScope.organizationId = String(ORG);
  mockScope.branchId = String(main._id);
  mockScope.userId = String(owner._id);
  mockGranted.perms = new Set(['viewWarehouses', 'manageWarehouses', 'manageWarehouseTransfers', 'editSettings', 'viewCostPrices']);
  fan = await Product.create({ organizationId: ORG, branchId: main._id, name: 'Fan', stockQuantity: 500, cost: 600, price: 1000 });
  cable = await Product.create({ organizationId: ORG, branchId: main._id, name: 'Cable', stockQuantity: 40, cost: 50, price: 90 });
});

const stockOf = async (productId) => {
  const res = await api().get('/v1/warehouses/stock?filter=all&limit=1000');
  if (res.status !== 200) throw new Error(JSON.stringify(res.body));
  expect(res.status).toBe(200);
  const row = res.body.results.find((r) => r.productId === String(productId));
  const byCode = {};
  res.body.warehouses.forEach((w) => {
    byCode[w.code] = row ? row.byWarehouse[w.id] || 0 : 0;
  });
  return { ...byCode, branch: row.branchQty };
};

const enable = async () => {
  const res = await api().patch('/v1/warehouses/settings').send({ enabled: true });
  expect(res.status).toBe(200);
  expect(res.body.enabled).toBe(true);
};

const createWh = async (body) => {
  const res = await api().post('/v1/warehouses').send(body);
  expect(res.status).toBe(201);
  return res.body;
};

const move = async (body) => {
  const res = await api().post('/v1/warehouses/transfers').send({ validate: true, ...body });
  return res;
};

const sale = (items, extra = {}) =>
  invoiceService.createInvoice(
    {
      organizationId: ORG,
      branchId: main._id,
      type: 'cash',
      paymentMethod: 'cash',
      items: items.map(([product, quantity]) => ({ productId: product._id, name: product.name, quantity, unitPrice: 1000, subtotal: quantity * 1000 })),
      subtotal: items.reduce((s, [, q]) => s + q * 1000, 0),
      total: items.reduce((s, [, q]) => s + q * 1000, 0),
      paidAmount: items.reduce((s, [, q]) => s + q * 1000, 0),
      ...extra,
    },
    String(owner._id)
  );

test('enabling creates a main warehouse per branch that holds all stock', async () => {
  await enable();
  const list = await api().get('/v1/warehouses');
  expect(list.body).toHaveLength(1);
  expect(list.body[0]).toMatchObject({ name: 'Main Warehouse', code: 'WH', isDefault: true });
  expect(await stockOf(fan._id)).toEqual({ WH: 500, branch: 500 });
  const overview = await api().get('/v1/warehouses/overview');
  expect(overview.body.totals).toMatchObject({ warehouses: 1, quantity: 540, value: 500 * 600 + 40 * 50 });
});

test('transfers, bins, sales from a warehouse, cancelling and changing the default keep totals right', async () => {
  await enable();
  const [wh] = (await api().get('/v1/warehouses')).body;
  const shop = await createWh({ name: 'Shop Floor', type: 'showroom' });
  expect(shop.code).toBe('SHO');

  // Main → Shop 30.
  const t1 = await move({ fromWarehouseId: wh.id, toWarehouseId: shop.id, lines: [{ productId: String(fan._id), quantity: 30 }] });
  expect(t1.status).toBe(201);
  expect(t1.body).toMatchObject({ status: 'done', number: 'WH/INT/00001', totalQuantity: 30 });
  expect(await stockOf(fan._id)).toEqual({ WH: 470, SHO: 30, branch: 500 });

  // Can't move more than the shop has.
  const over = await move({ fromWarehouseId: shop.id, toWarehouseId: wh.id, lines: [{ productId: String(fan._id), quantity: 40 }] });
  expect(over.status).toBe(400);
  expect(over.body.message).toMatch(/Not enough stock/);

  // Bin A-01 in the shop; put 10 there.
  const bins = await api().post(`/v1/warehouses/${shop.id}/locations/bulk`).send({ prefix: 'A-', from: 1, to: 3, pad: 2 });
  expect(bins.status).toBe(201);
  expect(bins.body.map((b) => b.path)).toEqual(['A-01', 'A-02', 'A-03']);
  const a01 = bins.body[0].id;
  const t2 = await move({ fromWarehouseId: shop.id, toWarehouseId: shop.id, toLocationId: a01, lines: [{ productId: String(fan._id), quantity: 10 }] });
  expect(t2.status).toBe(201);
  expect(await stockOf(fan._id)).toEqual({ WH: 470, SHO: 30, branch: 500 });
  const shopStock = await api().get(`/v1/warehouses/stock?warehouseId=${shop.id}`);
  expect(shopStock.body.results[0].locations).toEqual([
    { locationId: null, path: null, quantity: 20 },
    { locationId: a01, path: 'A-01', quantity: 10 },
  ]);

  // Sell 25 from the shop: top level (20) first, then the bin (5).
  const inv = await sale([[fan, 25]], { warehouseId: shop.id });
  expect(await stockOf(fan._id)).toEqual({ WH: 470, SHO: 5, branch: 475 });
  const moves = await WarehouseMove.find({ refType: 'Invoice', refId: inv._id }).lean();
  expect(moves.map((m) => m.quantity).sort()).toEqual([-20, -5].sort());

  // A sale with no warehouse comes out of the default.
  const plain = await sale([[fan, 5]]);
  expect(await stockOf(fan._id)).toEqual({ WH: 465, SHO: 5, branch: 470 });

  // Deleting the shop sale puts the stock back where it came from.
  await invoiceService.deleteInvoiceById(inv._id);
  expect(await stockOf(fan._id)).toEqual({ WH: 465, SHO: 30, branch: 495 });
  expect(await WarehouseMove.countDocuments({ refId: inv._id })).toBe(0);
  await invoiceService.deleteInvoiceById(plain._id);
  expect(await stockOf(fan._id)).toEqual({ WH: 470, SHO: 30, branch: 500 });

  // Make the shop the default: nothing moves.
  const def = await api().post(`/v1/warehouses/${shop.id}/default`);
  expect(def.status).toBe(200);
  expect(await stockOf(fan._id)).toEqual({ WH: 470, SHO: 30, branch: 500 });
  expect(await stockOf(cable._id)).toEqual({ WH: 40, SHO: 0, branch: 40 });

  // Cancelling the first transfer (Main → Shop 30) reverses it, with the new default in place.
  const cancel = await api().post(`/v1/warehouses/transfers/${t1.body.id}/cancel`);
  expect(cancel.body.status).toBe('cancelled');
  expect(await stockOf(fan._id)).toEqual({ WH: 500, SHO: 0, branch: 500 });
  // Shop still has 10 in bin A-01 and −10 at its top level (the bin move is still posted).
  const shopAfter = await api().get(`/v1/warehouses/stock?warehouseId=${shop.id}&filter=all`);
  const fanRow = shopAfter.body.results.find((r) => r.productId === String(fan._id));
  expect(fanRow.locations).toEqual([
    { locationId: null, path: null, quantity: -10 },
    { locationId: a01, path: 'A-01', quantity: 10 },
  ]);

  // A warehouse holding stock can't be archived or deleted; the default can't be deleted.
  const delDefault = await api().delete(`/v1/warehouses/${shop.id}`);
  expect(delDefault.status).toBe(400);
});

test('purchases received into a warehouse, edits re-sync, deletes clear', async () => {
  await enable();
  const [wh] = (await api().get('/v1/warehouses')).body;
  const store = await createWh({ name: 'Back Store', code: 'bs' });
  expect(store.code).toBe('BS');
  const supplier = await Supplier.create({ organizationId: ORG, branchId: main._id, name: 'Supplier', phone: '0300' });
  // createPurchase runs in a transaction (not available on this test DB) — write the stock
  // effect by hand and run the mirror the wrapper runs after it.
  const purchase = await Purchase.create({
    organizationId: ORG,
    branchId: main._id,
    supplier: supplier._id,
    invoiceNumber: 'PUR-1',
    warehouseId: store.id,
    items: [{ product: cable._id, quantity: 12, stockQuantity: 12, priceAtPurchase: 50, total: 600 }],
    totalAmount: 600,
  });
  await Product.updateOne({ _id: cable._id }, { $inc: { stockQuantity: 12 } });
  await warehouseService.syncPurchase(purchase._id);
  expect(await stockOf(cable._id)).toEqual({ WH: 40, BS: 12, branch: 52 });
  // Re-running is harmless.
  await warehouseService.syncPurchase(purchase._id);
  expect(await stockOf(cable._id)).toEqual({ WH: 40, BS: 12, branch: 52 });

  // Edit: quantity 12 → 8.
  await Purchase.updateOne({ _id: purchase._id }, { $set: { 'items.0.quantity': 8, 'items.0.stockQuantity': 8 } });
  await Product.updateOne({ _id: cable._id }, { $inc: { stockQuantity: -4 } });
  await warehouseService.syncPurchase(purchase._id);
  expect(await stockOf(cable._id)).toEqual({ WH: 40, BS: 8, branch: 48 });

  // Delete.
  await Purchase.deleteOne({ _id: purchase._id });
  await Product.updateOne({ _id: cable._id }, { $inc: { stockQuantity: -8 } });
  await warehouseService.syncPurchase(purchase._id);
  expect(await stockOf(cable._id)).toEqual({ WH: 40, BS: 0, branch: 40 });
  expect(wh.isDefault).toBe(true);
});

test('module off: plain invoices record nothing; a warehouse from another branch is refused', async () => {
  const inv = await sale([[fan, 2]]);
  expect(await WarehouseMove.countDocuments({ refId: inv._id })).toBe(0);

  await enable();
  mockScope.branchId = String(other._id);
  const foreign = await createWh({ name: 'Other Store' });
  mockScope.branchId = String(main._id);
  await expect(sale([[fan, 1]], { warehouseId: foreign.id })).rejects.toThrow(/another branch/);
  const peek = await api().get(`/v1/warehouses/${foreign.id}`);
  expect(peek.status).toBe(404);
});

test('permissions: viewing needs a view key, managing needs a manage key', async () => {
  mockGranted.perms = new Set(['viewProducts']);
  expect((await api().get('/v1/warehouses')).status).toBe(200);
  expect((await api().post('/v1/warehouses').send({ name: 'X' })).status).toBe(403);
  expect((await api().patch('/v1/warehouses/settings').send({ enabled: true })).status).toBe(403);
});

describe('phase 2: returns, adjustments, branch transfers', () => {
  const stockAdjustmentService = require('../../src/services/stockAdjustment.service');
  const inventoryTransferService = require('../../src/services/inventoryTransfer.service');
  const { SalesReturn, PurchaseReturn, StockAdjustment, InventoryTransfer } = require('../../src/models');

  test('a sales return goes back to the invoice warehouse; rejecting takes it out again', async () => {
    await enable();
    const shop = await createWh({ name: 'Shop Floor' });
    const [mainWh] = (await api().get('/v1/warehouses')).body.filter((w) => w.isDefault);
    await move({ fromWarehouseId: mainWh.id, toWarehouseId: shop.id, lines: [{ productId: String(fan._id), quantity: 10 }] });
    const inv = await sale([[fan, 4]], { warehouseId: shop.id });
    expect(await stockOf(fan._id)).toMatchObject({ WH: 490, SHO: 6, branch: 496 });

    // createSalesReturn runs in a transaction (not available here) — write its stock
    // effect by hand and run the mirror its wrapper runs.
    const { insertedId: retId } = await SalesReturn.collection.insertOne({
      organizationId: ORG, branchId: inv.branchId, invoiceId: inv._id, returnNumber: 'SR-1', status: 'pending',
      items: [{ productId: fan._id, quantity: 3, stockQuantity: 3 }],
    });
    await Product.updateOne({ _id: fan._id }, { $inc: { stockQuantity: 3 } });
    await warehouseService.syncSalesReturn(retId);
    expect(await stockOf(fan._id)).toMatchObject({ WH: 490, SHO: 9, branch: 499 });

    await SalesReturn.updateOne({ _id: retId }, { $set: { status: 'rejected' } });
    await Product.updateOne({ _id: fan._id }, { $inc: { stockQuantity: -3 } });
    await warehouseService.syncSalesReturn(retId);
    expect(await stockOf(fan._id)).toMatchObject({ WH: 490, SHO: 6, branch: 496 });
  });

  test('a purchase return leaves the purchase warehouse by default', async () => {
    await enable();
    const store = await createWh({ name: 'Back Store', code: 'BS' });
    const supplier = await Supplier.create({ organizationId: ORG, branchId: main._id, name: 'Supplier', phone: '0300' });
    const purchase = await Purchase.create({
      organizationId: ORG, branchId: main._id, supplier: supplier._id, invoiceNumber: 'PUR-9', warehouseId: store.id,
      items: [{ product: cable._id, quantity: 10, stockQuantity: 10, priceAtPurchase: 50, total: 500 }], totalAmount: 500,
    });
    await Product.updateOne({ _id: cable._id }, { $inc: { stockQuantity: 10 } });
    await warehouseService.syncPurchase(purchase._id);
    const { insertedId } = await PurchaseReturn.collection.insertOne({
      organizationId: ORG, branchId: main._id, purchaseId: purchase._id, returnNumber: 'PR-1', status: 'pending',
      items: [{ productId: cable._id, quantity: 4, stockQuantity: 4 }],
    });
    await Product.updateOne({ _id: cable._id }, { $inc: { stockQuantity: -4 } });
    await warehouseService.syncPurchaseReturn(insertedId);
    expect(await stockOf(cable._id)).toEqual({ WH: 40, BS: 6, branch: 46 });
    await PurchaseReturn.deleteOne({ _id: insertedId });
    await Product.updateOne({ _id: cable._id }, { $inc: { stockQuantity: 4 } });
    await warehouseService.syncPurchaseReturn(insertedId);
    expect(await stockOf(cable._id)).toEqual({ WH: 40, BS: 10, branch: 50 });
  });

  test('stock adjustments land in the named warehouse and reversals follow the original', async () => {
    await enable();
    const dmg = await createWh({ name: 'Damaged', code: 'DMG' });
    const [main] = (await api().get('/v1/warehouses')).body.filter((w) => w.isDefault);
    await move({ fromWarehouseId: main.id, toWarehouseId: dmg.id, lines: [{ productId: String(fan._id), quantity: 5 }] });
    const adj = await stockAdjustmentService.createAdjustment({
      organizationId: ORG, branchId: main.branchId?.id || String(fan.branchId), productId: String(fan._id), type: 'damage', direction: 'decrease', quantity: 2,
      reason: 'broken', createdBy: owner._id, warehouseId: dmg.id,
    });
    expect(String((await StockAdjustment.findById(adj._id).lean()).warehouseId)).toBe(dmg.id);
    expect(await stockOf(fan._id)).toEqual({ WH: 495, DMG: 3, branch: 498 });
    // An adjustment that names no warehouse uses the default.
    await stockAdjustmentService.createAdjustment({
      organizationId: ORG, branchId: String(fan.branchId), productId: String(fan._id), type: 'found', direction: 'increase', quantity: 1, reason: 'found', createdBy: owner._id,
    });
    expect(await stockOf(fan._id)).toEqual({ WH: 496, DMG: 3, branch: 499 });
    const rev = await stockAdjustmentService.reverseAdjustment({ adjustmentId: adj._id, organizationId: ORG, reversedBy: owner._id });
    expect(String((await StockAdjustment.findById(rev._id).lean()).warehouseId)).toBe(dmg.id);
    expect(await stockOf(fan._id)).toEqual({ WH: 496, DMG: 5, branch: 501 });
  });

  test('branch transfers: sent from a warehouse, received into a chosen one, cancel restores', async () => {
    await enable();
    const shop = await createWh({ name: 'Shop Floor' });
    const [main] = (await api().get('/v1/warehouses')).body.filter((w) => w.isDefault);
    await move({ fromWarehouseId: main.id, toWarehouseId: shop.id, lines: [{ productId: String(fan._id), quantity: 20 }] });
    mockScope.branchId = String(other._id);
    const otherStore = await createWh({ name: 'Other Store', code: 'OS' });
    mockScope.branchId = String(main.branchId?.id || fan.branchId);

    const tr = await inventoryTransferService.createTransfer({
      organizationId: ORG, fromBranchId: fan.branchId, fromProductId: fan._id, toBranchId: other._id, quantity: 8, createdBy: owner._id, fromWarehouseId: shop.id,
    });
    expect(String((await InventoryTransfer.findById(tr._id).lean()).fromWarehouseId)).toBe(shop.id);
    expect(await stockOf(fan._id)).toEqual({ WH: 480, SHO: 12, branch: 492 });

    const done = await inventoryTransferService.completeTransfer({ transferId: tr._id, organizationId: ORG, completedBy: owner._id, toWarehouseId: otherStore.id });
    expect(done.status).toBe('completed');
    const moves = await WarehouseMove.find({ refType: 'InventoryTransfer', refId: tr._id }).lean();
    expect(moves.map((m) => [m.moveType, m.quantity, String(m.warehouseId)]).sort()).toEqual(
      [['branch_in', 8, otherStore.id], ['branch_out', -8, shop.id]].sort()
    );
    mockScope.branchId = String(other._id);
    const destProductId = String((await InventoryTransfer.findById(tr._id).lean()).toProductId);
    const destStock = await api().get('/v1/warehouses/stock?filter=all&limit=1000');
    const row = destStock.body.results.find((r) => r.productId === destProductId);
    expect(row.byWarehouse[otherStore.id]).toBe(8);
    mockScope.branchId = String(fan.branchId);

    // Cancelling an in-transit transfer gives the stock back to the sending warehouse.
    const tr2 = await inventoryTransferService.createTransfer({
      organizationId: ORG, fromBranchId: fan.branchId, fromProductId: fan._id, toBranchId: other._id, quantity: 2, createdBy: owner._id, fromWarehouseId: shop.id,
    });
    expect(await stockOf(fan._id)).toEqual({ WH: 480, SHO: 10, branch: 490 });
    await inventoryTransferService.cancelTransfer({ transferId: tr2._id, organizationId: ORG, cancelledBy: owner._id });
    expect(await stockOf(fan._id)).toEqual({ WH: 480, SHO: 12, branch: 492 });
  });
});

describe('phase 2: stock count of one warehouse', () => {
  const stockCountService = require('../../src/services/stockCount.service');
  const { StockCountLine, StockAdjustment } = require('../../src/models');

  test('expects the warehouse quantity and posts the difference into that warehouse', async () => {
    await enable();
    const shop = await createWh({ name: 'Shop Floor' });
    const [mainWh] = (await api().get('/v1/warehouses')).body.filter((w) => w.isDefault);
    await move({ fromWarehouseId: mainWh.id, toWarehouseId: shop.id, lines: [{ productId: String(fan._id), quantity: 30 }] });

    const count = await stockCountService.createCount({
      organizationId: ORG, branchId: main._id, createdBy: owner._id,
      body: { type: 'custom', warehouseId: shop.id, productIds: [String(fan._id), String(cable._id)], includeZeroStock: true, blind: false },
    });
    const countId = String(count.count._id);
    const lines = await StockCountLine.find({ countId }).lean();
    const fanLine = lines.find((l) => String(l.productId) === String(fan._id));
    const cableLine = lines.find((l) => String(l.productId) === String(cable._id));
    expect(fanLine.systemQtyAtStart).toBe(30); // shop, not the branch's 500
    expect(cableLine.systemQtyAtStart).toBe(0);

    await stockCountService.recordCounts({
      organizationId: ORG, branchId: main._id, countId, userId: owner._id, canApprove: true, canViewCost: true,
      entries: [{ lineId: String(fanLine._id), qty: 27 }, { lineId: String(cableLine._id), qty: 0 }],
    });
    await stockCountService.submitCount({ organizationId: ORG, branchId: main._id, countId, userId: owner._id });
    await stockCountService.postCount({ organizationId: ORG, branchId: main._id, countId, userId: owner._id });

    const adj = await StockAdjustment.findOne({ stockCountId: countId }).lean();
    expect(adj).toMatchObject({ direction: 'decrease', quantity: 3 });
    expect(String(adj.warehouseId)).toBe(shop.id);
    expect(await stockOf(fan._id)).toEqual({ WH: 470, SHO: 27, branch: 497 });
  });
});

describe('phase 2: reorder rules, replenishment, variants', () => {
  const { ProductVariant, Inventory } = require('../../src/models');

  test('rules flag low warehouses, split the source fairly, and create transfer drafts', async () => {
    await enable();
    const shop = await createWh({ name: 'Shop Floor' });
    const kiosk = await createWh({ name: 'Mall Kiosk', code: 'KSK' });
    const [mainWh] = (await api().get('/v1/warehouses')).body.filter((w) => w.isDefault);
    // Main keeps 35 cables after 5 go to the kiosk. Shop wants 30 (has 0), kiosk wants 25 (has 5).
    await move({ fromWarehouseId: mainWh.id, toWarehouseId: kiosk.id, lines: [{ productId: String(cable._id), quantity: 5 }] });
    let res = await api().put(`/v1/warehouses/${shop.id}/rules`).send({ rules: [{ productId: String(cable._id), minQty: 5, maxQty: 30 }] });
    expect(res.status).toBe(200);
    res = await api().put(`/v1/warehouses/${kiosk.id}/rules`).send({ rules: [{ productId: String(cable._id), minQty: 10, maxQty: 25 }, { productId: String(fan._id), minQty: 0, maxQty: 2 }] });
    expect(res.body.map((r) => [r.name, r.quantity, r.state])).toEqual([['Cable', 5, 'low'], ['Fan', 0, 'empty']]);
    const bad = await api().put(`/v1/warehouses/${shop.id}/rules`).send({ rules: [{ productId: String(cable._id), minQty: 10, maxQty: 5 }] });
    expect(bad.status).toBe(400);

    const rep = await api().get('/v1/warehouses/replenishment');
    const byWh = Object.fromEntries(rep.body.items.map((i) => [`${i.warehouse.code}:${i.name}`, [i.need, i.transferQty, i.buyQty]]));
    // Rules with the lower min draw first: shop (min 5) gets 30 of main's 35, kiosk gets 5, fan 2.
    expect(byWh).toEqual({ 'SHO:Cable': [30, 30, 0], 'KSK:Cable': [20, 5, 15], 'KSK:Fan': [2, 2, 0] });

    const made = await api().post('/v1/warehouses/replenishment').send({ lines: rep.body.items.map((i) => ({ ruleId: i.ruleId })) });
    expect(made.status).toBe(201);
    expect(made.body.map((t) => [t.toWarehouseId.code, t.status, t.lines.length]).sort()).toEqual([['KSK', 'draft', 2], ['SHO', 'draft', 1]]);
  });

  test('a product with variants is stocked and moved per variant', async () => {
    await enable();
    const shop = await createWh({ name: 'Shop Floor' });
    const [mainWh] = (await api().get('/v1/warehouses')).body.filter((w) => w.isDefault);
    const shirt = await Product.create({ organizationId: ORG, branchId: main._id, name: 'Shirt', stockQuantity: 0, cost: 500, price: 900, hasVariants: true });
    const [red, blue] = await ProductVariant.create([
      { organizationId: ORG, branchId: main._id, productId: shirt._id, sku: 'SH-R', attributes: { Color: 'Red' }, price: 900, cost: 500 },
      { organizationId: ORG, branchId: main._id, productId: shirt._id, sku: 'SH-B', attributes: { Color: 'Blue' }, price: 900, cost: 500 },
    ]);
    await Inventory.create([
      { organizationId: ORG, branchId: main._id, productId: shirt._id, variantId: red._id, quantity: 12 },
      { organizationId: ORG, branchId: main._id, productId: shirt._id, variantId: blue._id, quantity: 7 },
    ]);
    const stock = await api().get('/v1/warehouses/stock?filter=all&search=Shirt');
    expect(stock.body.results.map((r) => [r.name, r.branchQty]).sort()).toEqual([['Shirt — Blue', 7], ['Shirt — Red', 12]]);

    const noVariant = await move({ fromWarehouseId: mainWh.id, toWarehouseId: shop.id, lines: [{ productId: String(shirt._id), quantity: 1 }] });
    expect(noVariant.status).toBe(400);
    const tooMany = await move({ fromWarehouseId: mainWh.id, toWarehouseId: shop.id, lines: [{ productId: String(shirt._id), variantId: String(blue._id), quantity: 8 }] });
    expect(tooMany.status).toBe(400);
    const ok = await move({ fromWarehouseId: mainWh.id, toWarehouseId: shop.id, lines: [{ productId: String(shirt._id), variantId: String(red._id), quantity: 4 }] });
    expect(ok.status).toBe(201);
    expect(ok.body.lines[0].productName).toBe('Shirt — Red');
    const after = await api().get(`/v1/warehouses/stock?filter=in_stock&warehouseId=${shop.id}&search=Shirt`);
    expect(after.body.results.map((r) => [r.name, r.quantity])).toEqual([['Shirt — Red', 4]]);
    const avail = await api().post('/v1/warehouses/availability').send({ warehouseId: mainWh.id, productIds: [String(shirt._id)] });
    expect(avail.body[`v:${red._id}`].warehouse).toBe(8);
    expect(avail.body[`v:${blue._id}`].warehouse).toBe(7);
  });
});

describe('phase 3: manufacturing, mobile shop, opening stock, AI', () => {
  const { InventoryTransaction, InstallmentPlan, SimSale, PhoneBuyback, Warehouse } = require('../../src/models');
  const flush = () => new Promise((r) => setTimeout(r, 300));

  test('manufacturing ledger rows are mirrored: materials via the materials store, goods via the goods store', async () => {
    await enable();
    const rm = await createWh({ name: 'Raw Store', code: 'RM', isMaterialsStore: true });
    const fg = await createWh({ name: 'FG Store', code: 'FG', isGoodsStore: true });
    const [mainWh] = (await api().get('/v1/warehouses')).body.filter((w) => w.isDefault);
    await move({ fromWarehouseId: mainWh.id, toWarehouseId: rm.id, lines: [{ productId: String(cable._id), quantity: 30 }] });
    // Only one materials store per branch.
    const rm2 = await createWh({ name: 'Raw Store 2', code: 'RM2', isMaterialsStore: true });
    expect((await Warehouse.findById(rm.id).lean()).isMaterialsStore).toBe(false);
    await api().patch(`/v1/warehouses/${rm.id}`).send({ isMaterialsStore: true });
    expect((await Warehouse.findById(rm2.id).lean()).isMaterialsStore).toBe(false);

    // An issue voucher takes 12 cables, returns 2; a receipt makes 3 fans.
    const issueId = new mongoose.Types.ObjectId();
    const receiptId = new mongoose.Types.ObjectId();
    const row = (product, type, delta, refType, refId) => ({
      organizationId: ORG, branchId: main._id, inventoryId: new mongoose.Types.ObjectId(), variantId: new mongoose.Types.ObjectId(),
      productId: product._id, type, stockBucket: 'available', quantityDelta: delta, balanceAfter: 0, refType, refId,
    });
    await Product.updateOne({ _id: cable._id }, { $inc: { stockQuantity: -10 } });
    await InventoryTransaction.create(row(cable, 'production_issue', -12, 'MaterialIssue', issueId));
    await InventoryTransaction.create(row(cable, 'production_return', 2, 'MaterialIssue', issueId));
    await InventoryTransaction.create({ ...row(cable, 'wip_in', 12, 'MaterialIssue', issueId), stockBucket: 'wip' }); // not stock
    await Product.updateOne({ _id: fan._id }, { $inc: { stockQuantity: 3 } });
    await InventoryTransaction.create(row(fan, 'production_receipt', 3, 'ProductionReceipt', receiptId));
    await flush();
    expect(await stockOf(cable._id)).toMatchObject({ WH: 10, RM: 20, FG: 0, branch: 30 });
    expect(await stockOf(fan._id)).toMatchObject({ WH: 500, FG: 3, branch: 503 });
    const issueMoves = await WarehouseMove.find({ refId: issueId }).lean();
    expect(issueMoves.map((m) => [m.moveType, m.quantity])).toEqual([['production_out', -10]]);
  });

  test('installment, SIM sale and used-phone buyback follow their warehouse; completed installment keeps its move', async () => {
    await enable();
    const shop = await createWh({ name: 'Shop Floor' });
    const [mainWh] = (await api().get('/v1/warehouses')).body.filter((w) => w.isDefault);
    await move({ fromWarehouseId: mainWh.id, toWarehouseId: shop.id, lines: [{ productId: String(fan._id), quantity: 10 }] });
    const base = { organizationId: ORG, branchId: main._id, warehouseId: shop.id };
    // Writes as the services do (create runs the stock change, the mirror follows).
    const plan = await InstallmentPlan.collection.insertOne({ ...base, warehouseId: new mongoose.Types.ObjectId(shop.id), productId: fan._id, quantity: 2, status: 'active', customerName: 'Ali' });
    await Product.updateOne({ _id: fan._id }, { $inc: { stockQuantity: -2 } });
    await warehouseService.syncInstallmentPlan(plan.insertedId);
    expect(await stockOf(fan._id)).toMatchObject({ WH: 490, SHO: 8, branch: 498 });

    const sim = await SimSale.collection.insertOne({ organizationId: ORG, branchId: main._id, warehouseId: new mongoose.Types.ObjectId(shop.id), productId: cable._id, jobNumber: 'S-1' });
    await Product.updateOne({ _id: cable._id }, { $inc: { stockQuantity: -1 } });
    await warehouseService.syncSimSale(sim.insertedId);
    expect(await stockOf(cable._id)).toMatchObject({ WH: 40, SHO: -1, branch: 39 });

    const bb = await PhoneBuyback.collection.insertOne({ organizationId: ORG, branchId: main._id, warehouseId: new mongoose.Types.ObjectId(shop.id), productId: cable._id });
    await Product.updateOne({ _id: cable._id }, { $inc: { stockQuantity: 1 } });
    await warehouseService.syncBuyback(bb.insertedId);
    expect(await stockOf(cable._id)).toMatchObject({ WH: 40, SHO: 0, branch: 40 });

    // Deleting a completed plan: stock stays sold, so the move stays (the wrapper skips the mirror).
    const installmentService = require('../../src/services/installment.service');
    await InstallmentPlan.updateOne({ _id: plan.insertedId }, { $set: { status: 'completed' } });
    await installmentService.deleteInstallmentPlan(plan.insertedId).catch(() => {});
    expect(await WarehouseMove.countDocuments({ refId: plan.insertedId })).toBe(1);
  });

  test('opening stock goes to the picked warehouse; quantities endpoint and AI tool see it', async () => {
    await enable();
    const shop = await createWh({ name: 'Shop Floor' });
    // createProduct runs in a transaction (not available here) — create the product, then
    // run the step its wrapper runs for `openingWarehouseId`.
    const lamp = await Product.create({ organizationId: ORG, branchId: main._id, name: 'Desk Lamp', price: 2000, cost: 1200, stockQuantity: 9 });
    await warehouseService.placeOpeningStock({ product: lamp, warehouseId: shop.id, userId: owner._id });
    expect(await stockOf(lamp._id)).toMatchObject({ WH: 0, SHO: 9, branch: 9 });
    const qty = await api().get(`/v1/warehouses/${shop.id}/quantities`);
    expect(qty.body[String(lamp._id)]).toBe(9);

    const tools = require('../../src/services/aiAssistant/tools');
    const { TOOL_HANDLERS } = tools.buildToolset({ permissions: new Proxy({}, { get: () => true }), user: { systemRole: 'superAdmin' } });
    const ai = await TOOL_HANDLERS.get_warehouse_stock({ product: 'Lamp' }, { organizationId: String(ORG), branchId: String(main._id) });
    expect(ai.products[0]).toMatchObject({ name: 'Desk Lamp', branchTotal: 9, byWarehouse: [{ warehouse: 'Shop Floor', quantity: 9 }] });
  });
});

describe('warehouse reports', () => {
  const day = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

  test('summary reconciles opening + in − out = closing; ledger runs a balance; sales, valuation, bins, ageing, register', async () => {
    await enable();
    const shop = await createWh({ name: 'Shop Floor' });
    const [mainWh] = (await api().get('/v1/warehouses')).body.filter((w) => w.isDefault);
    // A product stock edit is written to the default warehouse's history.
    const productService = require('../../src/services/product.service');
    await productService.updateProductById(String(fan._id), { stockQuantity: 520 }, { updatedBy: owner._id }).catch(() => Product.updateOne({ _id: fan._id }, { stockQuantity: 520 }));
    await move({ fromWarehouseId: mainWh.id, toWarehouseId: shop.id, lines: [{ productId: String(fan._id), quantity: 30 }] });
    await sale([[fan, 4]], { warehouseId: shop.id });
    await sale([[fan, 6]]);
    const bins = await api().post(`/v1/warehouses/${shop.id}/locations/bulk`).send({ prefix: 'R-', from: 1, to: 1, pad: 1 });
    await move({ fromWarehouseId: shop.id, toWarehouseId: shop.id, toLocationId: bins.body[0].id, lines: [{ productId: String(fan._id), quantity: 5 }] });

    const q = `from=${day(0)}&to=${day(0)}`;
    const sum = await api().get(`/v1/warehouses/reports/summary?${q}&search=Fan`);
    expect(sum.status).toBe(200);
    const byWh = Object.fromEntries(sum.body.rows.map((r) => [r.warehouse.name, r]));
    for (const r of sum.body.rows) expect(r.opening + r.totalIn - r.totalOut).toBeCloseTo(r.closing, 6);
    expect(byWh['Shop Floor']).toMatchObject({ opening: 0, transfersIn: 35, sales: 4, transfersOut: 5, closing: 26 });
    expect(byWh['Main Warehouse']).toMatchObject({ closing: 484, sales: 6, transfersOut: 30 });

    const led = await api().get(`/v1/warehouses/reports/ledger?${q}&productId=${fan._id}&warehouseId=${shop.id}`);
    expect(led.status).toBe(200);
    const s = led.body.sections[0];
    expect(s.entries.map((e) => e.balance)).toEqual([30, 26, 21, 26]);
    expect(s.closing).toBe(26);

    const sales = await api().get(`/v1/warehouses/reports/sales?${q}`);
    const salesBy = Object.fromEntries(sales.body.warehouses.map((w) => [w.warehouse.name, [w.invoices, w.quantity, w.sales]]));
    expect(salesBy).toEqual({ 'Shop Floor': [1, 4, 4000], 'Main Warehouse': [1, 6, 6000] });

    const val = await api().get('/v1/warehouses/reports/valuation');
    const shopVal = val.body.warehouses.find((w) => w.warehouse.name === 'Shop Floor');
    expect(shopVal).toMatchObject({ products: 1, quantity: 26, costValue: 26 * 600, retailValue: 26000 });

    const binRep = await api().get(`/v1/warehouses/reports/bins?warehouseId=${shop.id}`);
    expect(binRep.body.bins.map((b) => [b.path, b.quantity])).toEqual([[null, 21], ['R-1', 5]]);

    const age = await api().get(`/v1/warehouses/reports/ageing?warehouseId=${shop.id}`);
    expect(age.body.rows[0]).toMatchObject({ name: 'Fan', quantity: 26, bucket: 'd30', estimated: false });

    const reg = await api().get(`/v1/warehouses/reports/transfers?${q}`);
    expect(reg.body.rows.map((r) => [r.from, r.to, r.totalQuantity])).toEqual([['Main Warehouse', 'Shop Floor', 30], ['Shop Floor', 'Shop Floor / R-1', 5]]);
  });

  test('a stock edit typed on the product shows in the default warehouse history', async () => {
    await enable();
    await warehouseService.recordStockEdit({ product: { ...fan.toObject(), stockQuantity: 510 }, delta: 10, userId: owner._id });
    const moves = await WarehouseMove.find({ refType: 'ProductStockEdit', productId: fan._id }).lean();
    expect(moves.map((m) => [m.moveType, m.quantity])).toEqual([['adjustment', 10]]);
  });
});

describe('optimisations keep results identical', () => {
  const { ProductVariant, Inventory, WarehouseStock, Invoice } = require('../../src/models');

  test('re-saving an unchanged invoice writes nothing; a real change still re-mirrors', async () => {
    await enable();
    const shop = await createWh({ name: 'Shop Floor' });
    const [mainWh] = (await api().get('/v1/warehouses')).body.filter((w) => w.isDefault);
    await move({ fromWarehouseId: mainWh.id, toWarehouseId: shop.id, lines: [{ productId: String(fan._id), quantity: 10 }] });
    const inv = await sale([[fan, 3]], { warehouseId: shop.id });
    const before = await WarehouseMove.find({ refId: inv._id }).lean();
    const insertSpy = jest.spyOn(WarehouseMove, 'insertMany');
    const bulkSpy = jest.spyOn(WarehouseStock, 'bulkWrite');
    await warehouseService.syncInvoice(inv._id);
    expect(insertSpy).not.toHaveBeenCalled();
    expect(bulkSpy).not.toHaveBeenCalled();
    expect((await WarehouseMove.find({ refId: inv._id }).lean()).map((m) => String(m._id))).toEqual(before.map((m) => String(m._id)));
    insertSpy.mockRestore();
    bulkSpy.mockRestore();
    // Quantity 3 → 5 (as an invoice edit would): re-mirrored with the new figure.
    await Invoice.updateOne({ _id: inv._id }, { $set: { 'items.0.quantity': 5, 'items.0.stockQuantity': 5 } });
    await Product.updateOne({ _id: fan._id }, { $inc: { stockQuantity: -2 } });
    await warehouseService.syncInvoice(inv._id);
    expect(await stockOf(fan._id)).toEqual({ WH: 490, SHO: 5, branch: 495 });
  });

  test('module off: a new invoice costs no warehouse queries at all', async () => {
    const findSpy = jest.spyOn(WarehouseMove, 'find');
    const existsSpy = jest.spyOn(WarehouseMove, 'exists');
    await sale([[fan, 1]]); // warms the settings cache
    findSpy.mockClear();
    existsSpy.mockClear();
    const inv = await sale([[fan, 1]]);
    expect(findSpy).not.toHaveBeenCalled();
    expect(existsSpy).not.toHaveBeenCalled();
    await invoiceService.deleteInvoiceById(inv._id);
    expect(existsSpy).toHaveBeenCalledTimes(1); // deleting: one existence check
    expect(findSpy).not.toHaveBeenCalled();
    findSpy.mockRestore();
    existsSpy.mockRestore();
  });

  test('narrowed stock searches find the same rows (name, SKU, variant colour) and quantities agree', async () => {
    await enable();
    const shop = await createWh({ name: 'Shop Floor' });
    const [mainWh] = (await api().get('/v1/warehouses')).body.filter((w) => w.isDefault);
    await Product.updateOne({ _id: cable._id }, { $set: { sku: 'CBL-77' } });
    const shirt = await Product.create({ organizationId: ORG, branchId: main._id, name: 'Shirt', stockQuantity: 0, cost: 5, price: 9, hasVariants: true });
    const [red] = await ProductVariant.create([{ organizationId: ORG, branchId: main._id, productId: shirt._id, sku: 'SH-R', attributes: { Color: 'Red' }, price: 9, cost: 5 }]);
    await Inventory.create({ organizationId: ORG, branchId: main._id, productId: shirt._id, variantId: red._id, quantity: 6 });
    await move({ fromWarehouseId: mainWh.id, toWarehouseId: shop.id, lines: [{ productId: String(fan._id), quantity: 7 }, { productId: String(shirt._id), variantId: String(red._id), quantity: 2 }] });
    const names = async (q) => (await api().get(`/v1/warehouses/stock?${q}`)).body.results.map((r) => r.name).sort();
    expect(await names('search=cbl-7&filter=all')).toEqual(['Cable']);
    expect(await names('search=red&filter=all')).toEqual(['Shirt — Red']);
    expect(await names(`warehouseId=${shop.id}&filter=in_stock`)).toEqual(['Fan', 'Shirt — Red']);
    expect(await names('filter=in_stock')).toEqual(['Cable', 'Fan', 'Shirt — Red']);
    const shopRow = (await api().get(`/v1/warehouses/stock?warehouseId=${shop.id}&search=fan`)).body.results[0];
    expect(shopRow).toMatchObject({ quantity: 7, positionQty: 7 });
    const q = (await api().get(`/v1/warehouses/${shop.id}/quantities`)).body;
    expect(q).toEqual({ [String(fan._id)]: 7, [`v:${red._id}`]: 2 });
    const qMain = (await api().get(`/v1/warehouses/${mainWh.id}/quantities`)).body;
    expect(qMain[String(fan._id)]).toBe(493);
    expect(qMain[`v:${red._id}`]).toBe(4);
  });

  test('turning the module on takes effect immediately despite the settings cache', async () => {
    expect((await warehouseService.getSettings(ORG)).enabled).toBe(false);
    await enable();
    expect((await warehouseService.getSettings(ORG)).enabled).toBe(true);
    const inv = await sale([[fan, 1]]);
    expect(await WarehouseMove.countDocuments({ refId: inv._id })).toBe(1); // default-warehouse history recorded
  });
});
