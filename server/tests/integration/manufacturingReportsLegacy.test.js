const mongoose = require('mongoose');
const setupTestDB = require('../utils/setupTestDB');
const { Product, Inventory, Batch, ProductionOrder, MaterialIssue, ScrapRecord } = require('../../src/models');
const reports = require('../../src/services/manufacturing/reports.service');

/*
 * Manufacturing reports over documents written by older code, inserted raw exactly as they
 * sit in real databases: orders from before WIP tracking (no wipLots / operations),
 * material issue vouchers from before 2026-10-14 (no status, no kind), and lots whose
 * product has since been deleted. Every report must load and its arithmetic must close.
 */

setupTestDB();

const id = () => new mongoose.Types.ObjectId();
const organizationId = id();
const branchId = id();
const ctx = { organizationId, branchId };
const day = (d, h = 10) => new Date(`2026-09-${String(d).padStart(2, '0')}T0${h - 5}:00:00.000Z`);
const PERIOD = { startDate: '2026-09-01', endDate: '2026-09-30' };

const seed = async () => {
  const fan = id();
  const steel = id();
  const deleted = id();
  await Product.collection.insertMany([
    { _id: fan, organizationId, branchId, name: 'Fan', unit: 'pcs', productType: 'finished_good', stockQuantity: 10, cost: 50 },
    { _id: steel, organizationId, branchId, name: 'Steel', unit: 'kg', productType: 'raw_material', stockQuantity: 70, cost: 4 },
  ]);
  const [fanInv, goneInv] = [id(), id()];
  await Inventory.collection.insertMany([
    { _id: fanInv, organizationId, branchId, productId: fan, quantity: 10 },
    { _id: goneInv, organizationId, branchId, productId: deleted, quantity: 5 },
  ]);
  const goneLot = id();
  await Batch.collection.insertOne({
    _id: goneLot,
    organizationId,
    inventoryId: goneInv,
    batchNumber: 'LOT-GONE',
    quantity: 5,
    costPerUnit: 2,
    status: 'active',
    createdAt: day(2),
  });

  // Pre-WIP orders: one completed, one still running. No wipLots, no operations.
  const line = (qty) => ({
    _id: id(),
    productId: steel,
    productName: 'Steel',
    unit: 'kg',
    baseQuantity: qty,
    requiredQuantity: qty,
    issuedQuantity: qty,
    issuedCost: qty * 4,
    scrappedQuantity: 1,
  });
  const done = { _id: id(), line: line(20) };
  const open = { _id: id(), line: line(10) };
  await ProductionOrder.collection.insertMany([
    {
      _id: done._id,
      organizationId,
      branchId,
      orderNumber: 'MO-1',
      productId: fan,
      productName: 'Fan',
      unit: 'pcs',
      plannedQuantity: 10,
      completedQuantity: 10,
      status: 'completed',
      materials: [done.line],
      materialCost: 80,
      actualStartDate: day(3),
      actualCompletionDate: day(5),
      createdAt: day(3),
    },
    {
      _id: open._id,
      organizationId,
      branchId,
      orderNumber: 'MO-2',
      productId: fan,
      productName: 'Fan',
      unit: 'pcs',
      plannedQuantity: 5,
      completedQuantity: 0,
      status: 'in_production',
      materials: [open.line],
      materialCost: 40,
      actualStartDate: day(6),
      createdAt: day(6),
    },
  ]);
  // Vouchers from before MIVs had a status or kind.
  const voucher = (n, order, qty, date) => ({
    _id: id(),
    organizationId,
    branchId,
    issueNumber: n,
    productionOrderId: order._id,
    issueDate: date,
    lines: [
      {
        materialLineId: order.line._id,
        productId: steel,
        productName: 'Steel',
        unit: 'kg',
        quantity: qty,
        creditedQuantity: qty,
        unitCost: 4,
        totalCost: qty * 4,
      },
    ],
    totalCost: qty * 4,
    createdAt: date,
  });
  await MaterialIssue.collection.insertMany([voucher('MI-1', done, 20, day(3)), voucher('MI-2', open, 10, day(6))]);
  // Material scrapped on the floor of a pre-WIP order (already consumed when issued).
  await ScrapRecord.collection.insertOne({
    organizationId,
    branchId,
    scrapNumber: 'SCR-1',
    productionOrderId: done._id,
    orderNumber: 'MO-1',
    productId: steel,
    productName: 'Steel',
    unit: 'kg',
    stage: 'material',
    reason: 'damaged',
    quantity: 1,
    unitCost: 4,
    totalCost: 4,
    affectsStock: false,
    scrapDate: day(4),
  });
  return { done, open, goneLot };
};

describe('Manufacturing reports over legacy documents', () => {
  let s;
  beforeEach(async () => {
    s = await seed();
  });

  test('in-process loads an order with no wipLots and shows its issue as consumed', async () => {
    const r = await reports.getReport(ctx, 'in-process', {});
    expect(r.batches).toHaveLength(1);
    expect(r.batches[0].orderNumber).toBe('MO-2');
    expect(r.batches[0].wipValue).toBe(0);
    expect(r.batches[0].materials[0]).toMatchObject({ issued: 10, consumed: 9, scrapped: 1, inWip: 0 });
  });

  test('issue vs consumption adds up for pre-WIP orders', async () => {
    const r = await reports.getReport(ctx, 'material-consumption', PERIOD);
    expect(r.orders).toHaveLength(2);
    r.orders.forEach((o) =>
      o.lines.forEach((l) => expect(l.issued - l.returned - l.used - l.wastage).toBeCloseTo(l.inFactory, 6))
    );
    const mo1 = r.orders.find((o) => o.orderNumber === 'MO-1').lines[0];
    expect(mo1).toMatchObject({ issued: 20, used: 19, wastage: 1, inFactory: 0, usedValue: 76 });
  });

  test('status-less vouchers count as posted issues, not cancelled', async () => {
    const r = await reports.getReport(ctx, 'material-issues', PERIOD);
    expect(r.totals).toMatchObject({ voucherCount: 2, returnCount: 0, cancelledCount: 0, issuedValue: 120 });

    const batch = await reports.getReport(ctx, 'batch', { productionOrderId: String(s.done._id) });
    expect(batch.issues).toHaveLength(1);
    expect(batch.issues[0]).toMatchObject({ number: 'MI-1', kind: 'issue', balance: 80 });
    expect(batch.cancelledVouchers).toHaveLength(0);
  });

  test('date-wise WIP opens and closes at zero: legacy issues are consumed the day they are issued', async () => {
    const r = await reports.getReport(ctx, 'daily', PERIOD);
    expect(r.openingWip).toBe(0);
    expect(r.closingWip).toBe(0);
    expect(Object.is(r.closingWip, -0)).toBe(false);
    expect(r.totals).toMatchObject({ issued: 120, consumed: 120, floorScrap: 0 });
    r.days.forEach((d) => expect(d.wipBalance).toBe(0));
  });

  test('raw-material statement takes the old vouchers out of stock in the period', async () => {
    const r = await reports.getReport(ctx, 'raw-materials', PERIOD);
    const steel = r.rows.find((x) => x.productName === 'Steel');
    expect(steel.movements.issued).toBe(-30);
    expect(steel.opening).toBe(100);
    expect(steel.closing).toBe(70);
  });

  test('a lot whose product was deleted traces without crashing and is left out of the picker', async () => {
    const r = await reports.getReport(ctx, 'batch-trace', { batchId: String(s.goneLot) });
    expect(r.batch).toMatchObject({ batchNumber: 'LOT-GONE', productName: 'Deleted product', quantity: 5 });

    const { searchBatches } = require('../../src/services/manufacturing/batchReports.service');
    const picks = await searchBatches(ctx, {});
    expect(picks.map((p) => p.batchNumber)).not.toContain('LOT-GONE');
  });
});
