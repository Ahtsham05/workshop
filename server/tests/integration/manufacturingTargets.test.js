const mongoose = require('mongoose');
const setupTestDB = require('../utils/setupTestDB');
const { Product, ProductionReceipt, PackingVoucher, ProductionOrder, ProductionTarget } = require('../../src/models');
const targets = require('../../src/services/manufacturing/targets.service');
const reports = require('../../src/services/manufacturing/reports.service');

/*
 * Production targets measured against real documents. "Today" is pinned to
 * 15 Nov 2026 (Asia/Karachi) so every pace / days-left figure is exact.
 */

setupTestDB();

const id = () => new mongoose.Types.ObjectId();
const organizationId = id();
const branchId = id();
const otherBranch = id();
const ctx = { organizationId, branchId, createdBy: id() };
// Noon in Karachi on that November day.
const nov = (d) => new Date(Date.UTC(2026, 10, d, 7));
const fan = id();
const carton = id();
const elsewhere = id();

const seed = async () => {
  await Product.collection.insertMany([
    {
      _id: fan,
      organizationId,
      branchId,
      name: 'Fan',
      sku: 'FAN-1',
      unit: 'pcs',
      productType: 'finished_good',
      stockQuantity: 40,
    },
    {
      _id: carton,
      organizationId,
      branchId,
      name: 'Fan carton',
      unit: 'pcs',
      productType: 'finished_good',
      stockQuantity: 5,
    },
    { _id: elsewhere, organizationId, branchId: otherBranch, name: 'Fan', unit: 'pcs', stockQuantity: 9 },
  ]);
  const receipt = (n, date, quantity, branch = branchId) => ({
    organizationId,
    branchId: branch,
    receiptNumber: `FG-${n}`,
    productionOrderId: id(),
    productId: fan,
    quantity,
    receiptDate: date,
  });
  await ProductionReceipt.collection.insertMany([
    receipt(1, nov(3), 100),
    receipt(2, nov(10), 50),
    receipt(3, new Date(Date.UTC(2026, 9, 31, 7)), 999),
    // Another branch's production never counts towards this branch's target.
    receipt(4, nov(4), 500, otherBranch),
  ]);
  const voucher = (n, status, quantity) => ({
    organizationId,
    branchId,
    voucherNumber: `PK-${n}`,
    packingDate: nov(5),
    productId: fan,
    bulkQuantity: quantity,
    status,
    lines: [{ productId: carton, productName: 'Fan carton', quantity }],
    consumed: [],
  });
  await PackingVoucher.collection.insertMany([voucher(1, 'posted', 20), voucher(2, 'cancelled', 30)]);
  const order = (n, status, plannedQuantity, completedQuantity) => ({
    organizationId,
    branchId,
    orderNumber: `MO-${n}`,
    productId: fan,
    productName: 'Fan',
    plannedQuantity,
    completedQuantity,
    status,
  });
  await ProductionOrder.collection.insertMany([
    order(1, 'in_production', 200, 50),
    order(2, 'completed', 100, 100),
    order(3, 'cancelled', 300, 0),
  ]);
};

const target = (n, fields) =>
  ProductionTarget.create({
    organizationId,
    branchId,
    targetNumber: `TGT-${n}`,
    title: `T${n}`,
    measure: 'production',
    periodType: 'custom',
    ...fields,
  });
const line = (productId, targetQuantity) => ({ productId, productName: 'x', unit: 'pcs', targetQuantity });

let ids;
beforeEach(async () => {
  jest.useFakeTimers({
    now: nov(15),
    doNotFake: [
      'nextTick',
      'setImmediate',
      'setTimeout',
      'setInterval',
      'clearTimeout',
      'clearInterval',
      'queueMicrotask',
      'hrtime',
      'performance',
    ],
  });
  await seed();
  const [month, october, week, december, early] = await Promise.all([
    target(1, {
      periodType: 'month',
      startDay: '2026-11-01',
      endDay: '2026-11-30',
      lines: [line(fan, 600), line(carton, 20)],
    }),
    target(2, { periodType: 'month', startDay: '2026-10-01', endDay: '2026-10-31', lines: [line(fan, 1500)] }),
    target(3, {
      periodType: 'week',
      startDay: '2026-11-09',
      endDay: '2026-11-15',
      measure: 'stock',
      lines: [line(fan, 100)],
    }),
    target(4, { periodType: 'month', startDay: '2026-12-01', endDay: '2026-12-31', lines: [line(fan, 10)] }),
    target(5, { startDay: '2026-11-01', endDay: '2026-11-10', lines: [line(fan, 120)] }),
  ]);
  ids = { month, october, week, december, early };
});

afterEach(() => jest.useRealTimers());

describe('production targets', () => {
  test('a running production target: made, pace, remaining, open orders and to plan', async () => {
    const t = await targets.getTarget(ctx, ids.month._id);
    expect(t).toMatchObject({ phase: 'running', totalDays: 30, daysGone: 14, daysLeft: 16, status: 'at_risk' });
    const [fanLine, cartonLine] = t.lines;
    expect(fanLine).toMatchObject({
      made: 150, // 100 + 50 in November; October's 999 and the other branch's 500 left out
      stock: 40,
      remaining: 450,
      expected: 280, // 600 × 14 ÷ 30
      paceGap: -130,
      status: 'at_risk',
      openOrders: 1,
      inOrders: 150, // 200 − 50 on the running order; completed and cancelled orders ignored
      toPlan: 300,
      requiredPerDay: 28.125,
      avgPerDay: 10,
      projected: 300,
      percent: 25,
    });
    // Packs count as made for the pack product; the cancelled voucher does not.
    expect(cartonLine).toMatchObject({ made: 20, status: 'achieved', remaining: 0 });
    expect(t.progress).toBe(62.5);
    expect(fanLine.daily).toHaveLength(15);
    expect(fanLine.daily.find((d) => d.day === '2026-11-10')).toMatchObject({ made: 50, cumulative: 150, plan: 200 });
  });

  test('ended, stock-measured, upcoming and achieved targets', async () => {
    const [october, week, december, early] = await Promise.all(
      ['october', 'week', 'december', 'early'].map((k) => targets.getTarget(ctx, ids[k]._id))
    );
    expect(october).toMatchObject({ phase: 'ended', status: 'missed' });
    expect(october.lines[0]).toMatchObject({ made: 999, shortfall: 501, requiredPerDay: null });
    // Stock 40 + 150 coming from orders covers 100: on track, 60 still to reach.
    expect(week.lines[0]).toMatchObject({ achieved: 40, made: 50, remaining: 60, status: 'on_track', expected: null });
    expect(december).toMatchObject({ phase: 'upcoming', status: 'upcoming', daysLeft: 31 });
    expect(early.lines[0]).toMatchObject({ made: 150, status: 'achieved' });
  });

  test('alerts list only running targets behind pace and recent misses', async () => {
    const alerts = await targets.getAlerts(ctx);
    // October ended more than a week ago; the early target was achieved.
    expect(alerts).toMatchObject({ count: 1, atRisk: 1, missed: 0 });
    expect(alerts.items[0]).toMatchObject({ targetNumber: 'TGT-1', productName: 'x', status: 'at_risk', daysLeft: 16 });
  });

  test('list filters by phase and computed status, with status counts', async () => {
    const all = await targets.listTargets(ctx, {});
    expect(all.stats).toMatchObject({ total: 5, at_risk: 1, missed: 1, on_track: 1, upcoming: 1, achieved: 1 });
    const risky = await targets.listTargets(ctx, { status: 'at_risk' });
    expect(risky.results.map((r) => r.targetNumber)).toEqual(['TGT-1']);
    const running = await targets.listTargets(ctx, { phase: 'running' });
    expect(running.results.map((r) => r.targetNumber).sort()).toEqual(['TGT-1', 'TGT-3']);
    const otherBranchList = await targets.listTargets({ organizationId, branchId: otherBranch }, {});
    expect(otherBranchList.totalResults).toBe(0);
  });

  test('target vs actual report: overlapping targets and the product position', async () => {
    const report = await reports.getReport(ctx, 'targets', { startDate: '2026-11-01', endDate: '2026-11-30' });
    expect(report.targets.map((t) => t.targetNumber).sort()).toEqual(['TGT-1', 'TGT-3', 'TGT-5']);
    const fanRow = report.byProduct.find((p) => p.productId === String(fan));
    // Target 600 + 100 + 120; made 150 + 50 + 150; stock and orders counted once.
    expect(fanRow).toMatchObject({
      targets: 3,
      target: 820,
      made: 350,
      remaining: 510,
      stock: 40,
      inOrders: 150,
      toPlan: 360,
    });
    const missed = await reports.getReport(ctx, 'targets', {
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      targetStatus: 'missed',
    });
    expect(missed.targets.map((t) => t.targetNumber)).toEqual(['TGT-2']);
  });

  test('create numbers the target, snapshots products and rejects bad input', async () => {
    const body = {
      periodType: 'month',
      startDay: '2026-11-01',
      endDay: '2026-11-30',
      measure: 'production',
      lines: [{ productId: String(fan), targetQuantity: 300 }],
    };
    const created = await targets.createTarget(ctx, body);
    // 150 made against 140 expected by yesterday (300 × 14 ÷ 30): ahead of pace.
    expect(created).toMatchObject({ targetNumber: 'TGT-00001', title: '2026-11-01 – 2026-11-30', status: 'on_track' });
    expect(created.lines[0]).toMatchObject({ productName: 'Fan', sku: 'FAN-1', unit: 'pcs', target: 300, made: 150 });

    await expect(
      targets.createTarget(ctx, { ...body, lines: [...body.lines, { productId: String(fan), targetQuantity: 1 }] })
    ).rejects.toThrow('listed twice');
    await expect(
      targets.createTarget(ctx, { ...body, lines: [{ productId: String(elsewhere), targetQuantity: 1 }] })
    ).rejects.toThrow('not found in this branch');
    await expect(targets.createTarget(ctx, { ...body, startDay: '2026-12-01' })).rejects.toThrow('starts after');

    const updated = await targets.updateTarget(ctx, created.id, {
      ...body,
      title: 'Nov',
      lines: [{ productId: String(fan), targetQuantity: 150 }],
    });
    expect(updated).toMatchObject({ title: 'Nov', status: 'achieved' });
    await targets.deleteTarget(ctx, created.id);
    await expect(targets.getTarget(ctx, created.id)).rejects.toThrow('Target not found');
  });
});
