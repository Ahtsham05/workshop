const { ProductionOrder, ProductionReceipt, MaterialIssue, ScrapRecord, Bom } = require('../../models');
const { PRODUCTION_STATUSES, OPEN_PRODUCTION_STATUSES } = require('../../config/manufacturing');
const productionOrderService = require('./productionOrder.service');
const productsService = require('./products.service');
const { roundMoney, roundQty, scopeFilter, aggregateScope } = require('./common');

const sumSince = async (Model, match, dateField, since, fields) => {
  const group = { _id: null, count: { $sum: 1 } };
  fields.forEach((f) => {
    group[f] = { $sum: `$${f}` };
  });
  const [row] = await Model.aggregate([{ $match: { ...match, [dateField]: { $gte: since } } }, { $group: group }]);
  return row || { count: 0, ...Object.fromEntries(fields.map((f) => [f, 0])) };
};

const getDashboard = async (ctx) => {
  const match = aggregateScope(ctx);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const trendStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13);

  const [
    statusRows,
    overdue,
    dueSoon,
    wipRows,
    produced,
    issued,
    scrapped,
    activeBoms,
    recentOrders,
    outputTrend,
    typeSummary,
    requirements,
  ] = await Promise.all([
    ProductionOrder.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    ProductionOrder.countDocuments({
      ...scopeFilter(ctx),
      status: { $in: OPEN_PRODUCTION_STATUSES },
      plannedCompletionDate: { $lt: now },
    }),
    ProductionOrder.find({
      ...scopeFilter(ctx),
      status: { $in: OPEN_PRODUCTION_STATUSES },
      plannedCompletionDate: { $gte: now, $lte: weekAhead },
    })
      .select('orderNumber productName plannedQuantity completedQuantity unit status priority plannedCompletionDate')
      .sort({ plannedCompletionDate: 1 })
      .limit(6)
      .lean(),
    // WIP = cost of material lots still on the floor; plus output waiting in QC / rework.
    ProductionOrder.aggregate([
      { $match: { ...match, status: { $in: ['released', 'in_production', 'paused'] } } },
      {
        $project: {
          lotValue: {
            $sum: {
              $map: {
                input: { $ifNull: ['$wipLots', []] },
                as: 'l',
                in: { $multiply: ['$$l.quantity', { $ifNull: ['$$l.unitCost', 0] }] },
              },
            },
          },
          qcPendingQuantity: { $ifNull: ['$qcPendingQuantity', 0] },
          reworkPendingQuantity: { $ifNull: ['$reworkPendingQuantity', 0] },
        },
      },
      {
        $group: {
          _id: null,
          wipValue: { $sum: '$lotValue' },
          qcPending: { $sum: '$qcPendingQuantity' },
          reworkPending: { $sum: '$reworkPendingQuantity' },
        },
      },
    ]),
    sumSince(ProductionReceipt, match, 'receiptDate', monthStart, ['quantity', 'totalCost']),
    sumSince(MaterialIssue, { ...match, kind: { $ne: 'return' } }, 'issueDate', monthStart, ['totalCost']),
    sumSince(ScrapRecord, match, 'scrapDate', monthStart, ['quantity', 'totalCost']),
    Bom.countDocuments({ ...scopeFilter(ctx), isActive: true }),
    ProductionOrder.find({ ...scopeFilter(ctx) })
      .select(
        'orderNumber productName plannedQuantity completedQuantity unit status priority plannedCompletionDate createdAt'
      )
      .sort({ createdAt: -1 })
      .limit(6)
      .lean(),
    ProductionReceipt.aggregate([
      { $match: { ...match, receiptDate: { $gte: trendStart } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$receiptDate' } },
          quantity: { $sum: '$quantity' },
          value: { $sum: '$totalCost' },
        },
      },
    ]),
    productsService.getTypeSummary(ctx),
    productionOrderService.getAggregatedRequirements(ctx),
  ]);

  const byStatus = Object.fromEntries(PRODUCTION_STATUSES.map((s) => [s, 0]));
  statusRows.forEach((r) => {
    byStatus[r._id] = r.count;
  });

  const trendByDay = new Map(outputTrend.map((r) => [r._id, r]));
  const trend = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(trendStart.getFullYear(), trendStart.getMonth(), trendStart.getDate() + i);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(
      2,
      '0'
    )}`;
    const row = trendByDay.get(key);
    return { date: key, quantity: row ? roundQty(row.quantity) : 0, value: row ? roundMoney(row.value) : 0 };
  });

  const wip = wipRows[0] || { wipValue: 0, qcPending: 0, reworkPending: 0 };
  const mapOrder = ({ _id, ...o }) => ({ ...o, id: String(_id) });

  return {
    byStatus,
    openOrders: OPEN_PRODUCTION_STATUSES.reduce((s, k) => s + byStatus[k], 0),
    inProgress: byStatus.in_production + byStatus.paused + byStatus.released,
    overdue,
    wipValue: roundMoney(wip.wipValue),
    qcPendingQuantity: roundQty(wip.qcPending),
    reworkPendingQuantity: roundQty(wip.reworkPending),
    month: {
      producedQuantity: roundQty(produced.quantity),
      producedValue: roundMoney(produced.totalCost),
      receiptCount: produced.count,
      materialIssuedValue: roundMoney(issued.totalCost),
      issueCount: issued.count,
      scrapQuantity: roundQty(scrapped.quantity),
      scrapValue: roundMoney(scrapped.totalCost),
      scrapCount: scrapped.count,
    },
    activeBoms,
    productTypes: typeSummary,
    dueSoon: dueSoon.map(mapOrder),
    recentOrders: recentOrders.map(mapOrder),
    outputTrend: trend,
    shortages: requirements.lines.filter((l) => l.shortageQuantity > 0).slice(0, 6),
    shortageCount: requirements.shortageCount,
  };
};

module.exports = { getDashboard };
