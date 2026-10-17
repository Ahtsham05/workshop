const mongoose = require('mongoose');
const setupTestDB = require('../../utils/setupTestDB');
const { Branch, Product, InventoryTransfer } = require('../../../src/models');
const inventoryTransferService = require('../../../src/services/inventoryTransfer.service');
const { atBusinessTimeOfDay, toBusinessCalendarDate } = require('../../../src/utils/businessTimezone');

setupTestDB();
// The first hook starts an in-memory mongod — slower than Jest's 5s default on a cold run.
jest.setTimeout(30000);

const orgId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();

const seed = async () => {
  const [from, to] = await Branch.create([
    { organizationId: orgId, name: 'Main', code: 'MAIN' },
    { organizationId: orgId, name: 'Second', code: 'SEC' },
  ]);
  const product = await Product.create({
    organizationId: orgId,
    branchId: from._id,
    name: 'Charger',
    price: 500,
    cost: 300,
    stockQuantity: 50,
  });
  return { from, to, product };
};

const send = (ctx, extra = {}) =>
  inventoryTransferService.createTransfer({
    organizationId: orgId,
    fromBranchId: ctx.from._id,
    fromProductId: ctx.product._id,
    toBranchId: ctx.to._id,
    quantity: 1,
    createdBy: userId,
    ...extra,
  });

describe('atBusinessTimeOfDay', () => {
  const now = new Date('2026-10-16T09:30:00.000Z'); // 14:30 PKT

  test('today → now', () => {
    expect(atBusinessTimeOfDay('2026-10-16', now).getTime()).toBe(now.getTime());
  });

  test('an earlier day keeps the current Pakistan time of day', () => {
    const d = atBusinessTimeOfDay('2026-10-10', now);
    expect(toBusinessCalendarDate(d)).toBe('2026-10-10');
    expect(d.toISOString()).toBe('2026-10-10T09:30:00.000Z');
  });

  test('a full timestamp passes through; garbage is null', () => {
    expect(atBusinessTimeOfDay('2026-10-01T01:02:03.000Z', now).toISOString()).toBe('2026-10-01T01:02:03.000Z');
    expect(atBusinessTimeOfDay('not a date', now)).toBeNull();
    expect(atBusinessTimeOfDay('', now)).toBeNull();
  });
});

describe('transfer date', () => {
  test('a picked earlier day is stored on that Pakistan day', async () => {
    const ctx = await seed();
    const transfer = await send(ctx, { transferDate: '2026-10-01' });
    expect(toBusinessCalendarDate(transfer.transferDate)).toBe('2026-10-01');
  });

  test('no date given → now', async () => {
    const ctx = await seed();
    const before = Date.now();
    const transfer = await send(ctx);
    expect(transfer.transferDate.getTime()).toBeGreaterThanOrEqual(before);
  });

  test('a future day is refused and moves no stock', async () => {
    const ctx = await seed();
    const tomorrow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    await expect(send(ctx, { transferDate: toBusinessCalendarDate(tomorrow) })).rejects.toThrow('future');
    const product = await Product.findById(ctx.product._id);
    expect(product.stockQuantity).toBe(50);
    expect(await InventoryTransfer.countDocuments()).toBe(0);
  });

  test('list is ordered by transfer date and filters on it (older rows fall back to suggestedAt)', async () => {
    const ctx = await seed();
    const a = await send(ctx, { transferDate: '2026-09-05' });
    const b = await send(ctx, { transferDate: '2026-09-20' });
    const c = await send(ctx, { transferDate: '2026-09-12' });
    // A row from before the field existed: no transferDate, created 2026-09-15.
    const legacy = await send(ctx);
    await InventoryTransfer.collection.updateOne(
      { _id: legacy._id },
      { $unset: { transferDate: '' }, $set: { suggestedAt: new Date('2026-09-15T07:00:00.000Z') } }
    );

    const all = await inventoryTransferService.queryTransfers(
      { organizationId: orgId, branchId: ctx.from._id, dateTo: '2026-09-30' },
      {}
    );
    expect(all.results.map((r) => r.groupId)).toEqual([b, legacy, c, a].map((t) => String(t.groupId)));
    expect(toBusinessCalendarDate(new Date(all.results[1].transferDate))).toBe('2026-09-15');

    const mid = await inventoryTransferService.queryTransfers(
      { organizationId: orgId, branchId: ctx.from._id, dateFrom: '2026-09-12', dateTo: '2026-09-15' },
      {}
    );
    expect(mid.results.map((r) => r.groupId).sort()).toEqual([c, legacy].map((t) => String(t.groupId)).sort());
  });
});
