const mongoose = require('mongoose');
const Money = require('./money');

/**
 * Shared "what was paid for this product before" engine for the rate-history box:
 * sales to a customer (Invoice) and purchases from a supplier (Purchase). Both documents
 * are normalised to the same line shape, so the client renders them with one component.
 */

const RATE_HISTORY_MAX_LIMIT = 500;
const RATE_HISTORY_BATCH_MAX_KEYS = 100;
const RATE_HISTORY_BATCH_DEFAULT_LIMIT = 50;

/** One line, as the rate-history box shows it. `row` carries the document (invoice/purchase) fields. */
const formatRateHistoryLine = (row, line) => {
  const quantity = Number(line.quantity) || 0;
  const conversionFactor = Number(line.conversionFactor) > 0 ? Number(line.conversionFactor) : 1;
  const unitPrice = Number(line.unitPrice) || 0;
  const subtotal = Number(line.subtotal) || 0;
  // `subtotal` is already net of the line discount.
  const netUnitPrice = quantity > 0 ? Money.roundMoney(subtotal / quantity) : unitPrice;
  return {
    invoiceId: String(row._id),
    invoiceNumber: row.invoiceNumber || '',
    billNumber: row.billNumber || '',
    date: row.invoiceDate || row.createdAt,
    type: row.type,
    status: row.status || '',
    variantId: line.variantId ? String(line.variantId) : null,
    batchNumber: line.batchNumber || '',
    quantity,
    unit: line.unit || '',
    conversionFactor,
    unitPrice,
    discountType: line.discountType || 'fixed',
    discountValue: Number(line.discountValue) || 0,
    discountAmount: Number(line.discountAmount) || 0,
    netUnitPrice,
    netRatePerStockUnit: Money.roundMoney(netUnitPrice / conversionFactor, 4),
    subtotal,
  };
};

/**
 * Lines (newest first) + totals over ALL matching lines → the response shape. `totals` =
 * { invoiceIds, lineCount, totalQuantity, totalStockQuantity, totalAmount,
 *   pricedStockQuantity, firstDate, minRate, maxRate } or null.
 */
const buildRateHistoryResult = (lines, totals, truncated) => {
  const latest = lines[0] || null;
  const stats = totals
    ? {
        invoiceCount: totals.invoiceIds.length,
        lineCount: totals.lineCount,
        totalQuantity: totals.totalQuantity,
        totalStockQuantity: totals.totalStockQuantity,
        totalAmount: Money.roundMoney(totals.totalAmount),
        firstDate: totals.firstDate,
        lastDate: latest ? latest.date : null,
        // Quantity-weighted over charged lines: the average paid per stock unit.
        avgRatePerStockUnit:
          totals.pricedStockQuantity > 0 ? Money.roundMoney(totals.totalAmount / totals.pricedStockQuantity, 4) : null,
        minRatePerStockUnit: totals.minRate === null ? null : Money.roundMoney(totals.minRate, 4),
        maxRatePerStockUnit: totals.maxRate === null ? null : Money.roundMoney(totals.maxRate, 4),
      }
    : null;

  return {
    lines,
    truncated,
    stats,
    // Legacy shape (ProductHistoryDialog on the catalog).
    history: lines.map((line) => ({
      _id: line.invoiceId,
      invoiceNumber: line.invoiceNumber,
      date: line.date,
      type: line.type,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      subtotal: line.subtotal,
    })),
    totalQuantity: totals ? totals.totalQuantity : 0,
    lastPrice: latest ? latest.unitPrice : null,
    avgPrice: lines.length ? lines.reduce((sum, line) => sum + line.unitPrice, 0) / lines.length : null,
    minPrice: lines.length ? Math.min(...lines.map((line) => line.unitPrice)) : null,
    maxPrice: lines.length ? Math.max(...lines.map((line) => line.unitPrice)) : null,
  };
};

// Net rate per stock unit of one unwound, normalised line ($lines); null for free / zero-qty
// lines so they stay out of min/max/avg.
const RATE_HISTORY_LINE_RATE = {
  $cond: [
    { $and: [{ $gt: ['$lines.quantity', 0] }, { $gt: ['$lines.subtotal', 0] }] },
    {
      $divide: [
        { $divide: ['$lines.subtotal', '$lines.quantity'] },
        {
          $cond: [{ $gt: [{ $ifNull: ['$lines.conversionFactor', 1] }, 0] }, { $ifNull: ['$lines.conversionFactor', 1] }, 1],
        },
      ],
    },
    null,
  ],
};

/** Valid, de-duplicated { productId, variantId } keys (max 100). */
const normaliseRateHistoryKeys = (items) => {
  const keys = [];
  const seen = new Set();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const productId = item && item.productId ? String(item.productId) : '';
    if (!mongoose.Types.ObjectId.isValid(productId)) return;
    const variantId =
      item.variantId && mongoose.Types.ObjectId.isValid(String(item.variantId)) ? String(item.variantId) : null;
    const key = `${productId}|${variantId || ''}`;
    if (seen.has(key) || keys.length >= RATE_HISTORY_BATCH_MAX_KEYS) return;
    seen.add(key);
    keys.push({ productId, variantId });
  });
  return keys;
};

const emptyRateHistoryFor = (key) => ({
  productId: key.productId,
  variantId: key.variantId,
  history: buildRateHistoryResult([], null, false),
});

/**
 * Many products' history in ONE aggregation.
 *
 * @param {Object} opts
 * @param {import('mongoose').Model} opts.Model - Invoice or Purchase
 * @param {Object} opts.match - document-level $match (party, tenant, real documents only);
 *   the product filter is added here
 * @param {Array<{productId: string, variantId: string|null}>} opts.keys - normalised keys
 * @param {number} [opts.limit] - lines per key (newest first); stats always cover every line
 * @param {Object} opts.fields - where each value lives on this model:
 *   { items, product, price, total, date, number, bill }
 */
const runRateHistoryBatch = async ({ Model, match, keys, limit: rawLimit, fields }) => {
  if (!keys.length) return { results: [] };
  const limit = Math.min(RATE_HISTORY_MAX_LIMIT, Math.max(1, parseInt(rawLimit, 10) || RATE_HISTORY_BATCH_DEFAULT_LIMIT));
  const productObjectIds = [...new Set(keys.map((k) => k.productId))].map((id) => new mongoose.Types.ObjectId(id));

  const groups = await Model.aggregate([
    { $match: { ...match, [`${fields.items}.${fields.product}`]: { $in: productObjectIds } } },
    {
      $project: {
        invoiceNumber: `$${fields.number}`,
        billNumber: `$${fields.bill}`,
        invoiceDate: `$${fields.date}`,
        createdAt: 1,
        type: 1,
        status: 1,
        lines: {
          $map: {
            input: {
              $filter: {
                input: { $ifNull: [`$${fields.items}`, []] },
                as: 'line',
                cond: { $in: [`$$line.${fields.product}`, productObjectIds] },
              },
            },
            as: 'l',
            in: {
              productId: `$$l.${fields.product}`,
              variantId: '$$l.variantId',
              batchNumber: '$$l.batchNumber',
              quantity: '$$l.quantity',
              unit: '$$l.unit',
              conversionFactor: '$$l.conversionFactor',
              unitPrice: `$$l.${fields.price}`,
              subtotal: `$$l.${fields.total}`,
              discountType: '$$l.discountType',
              discountValue: '$$l.discountValue',
              discountAmount: '$$l.discountAmount',
            },
          },
        },
      },
    },
    { $unwind: '$lines' },
    { $sort: { invoiceDate: -1, createdAt: -1, _id: -1 } },
    { $addFields: { lineRate: RATE_HISTORY_LINE_RATE } },
    {
      // One group per product + variant actually sold/bought; a product-level key merges its groups below.
      $group: {
        _id: { productId: '$lines.productId', variantId: { $ifNull: ['$lines.variantId', null] } },
        rows: {
          $push: {
            _id: '$_id',
            invoiceNumber: '$invoiceNumber',
            billNumber: '$billNumber',
            invoiceDate: '$invoiceDate',
            createdAt: '$createdAt',
            type: '$type',
            status: '$status',
            line: '$lines',
          },
        },
        invoiceIds: { $addToSet: '$_id' },
        lineCount: { $sum: 1 },
        totalQuantity: { $sum: '$lines.quantity' },
        totalStockQuantity: {
          $sum: { $multiply: ['$lines.quantity', { $ifNull: ['$lines.conversionFactor', 1] }] },
        },
        totalAmount: { $sum: '$lines.subtotal' },
        pricedStockQuantity: {
          $sum: {
            $cond: [
              { $gt: ['$lines.subtotal', 0] },
              { $multiply: ['$lines.quantity', { $ifNull: ['$lines.conversionFactor', 1] }] },
              0,
            ],
          },
        },
        firstDate: { $min: { $ifNull: ['$invoiceDate', '$createdAt'] } },
        minRate: { $min: '$lineRate' },
        maxRate: { $max: '$lineRate' },
      },
    },
    // Newest `limit + 1` lines per group — the extra one says "there are older ones".
    {
      $project: {
        rows: { $slice: ['$rows', limit + 1] },
        invoiceIds: 1,
        lineCount: 1,
        totalQuantity: 1,
        totalStockQuantity: 1,
        totalAmount: 1,
        pricedStockQuantity: 1,
        firstDate: 1,
        minRate: 1,
        maxRate: 1,
      },
    },
  ]).option({ allowDiskUse: true });

  const rowTime = (row) => new Date(row.invoiceDate || row.createdAt || 0).getTime();
  const results = keys.map((key) => {
    const mine = groups.filter(
      (g) =>
        String(g._id.productId) === key.productId &&
        (!key.variantId || (g._id.variantId && String(g._id.variantId) === key.variantId))
    );
    if (!mine.length) return emptyRateHistoryFor(key);

    const rows = mine
      .flatMap((g) => g.rows)
      .sort((a, b) => rowTime(b) - rowTime(a) || String(b._id).localeCompare(String(a._id)));
    const truncated = rows.length > limit;
    const invoiceIds = new Set();
    mine.forEach((g) => g.invoiceIds.forEach((id) => invoiceIds.add(String(id))));
    const present = (field) => mine.map((g) => g[field]).filter((v) => v !== null && v !== undefined);
    const sum = (field) => mine.reduce((total, g) => total + (Number(g[field]) || 0), 0);
    const mins = present('minRate');
    const maxs = present('maxRate');
    const firstDates = present('firstDate').map((d) => new Date(d).getTime());
    const totals = {
      invoiceIds: [...invoiceIds],
      lineCount: sum('lineCount'),
      totalQuantity: sum('totalQuantity'),
      totalStockQuantity: sum('totalStockQuantity'),
      totalAmount: sum('totalAmount'),
      pricedStockQuantity: sum('pricedStockQuantity'),
      firstDate: firstDates.length ? new Date(Math.min(...firstDates)) : null,
      minRate: mins.length ? Math.min(...mins) : null,
      maxRate: maxs.length ? Math.max(...maxs) : null,
    };
    const lines = rows.slice(0, limit).map((row) => formatRateHistoryLine(row, row.line));
    return {
      productId: key.productId,
      variantId: key.variantId,
      history: buildRateHistoryResult(lines, totals, truncated),
    };
  });
  return { results };
};

module.exports = {
  RATE_HISTORY_MAX_LIMIT,
  RATE_HISTORY_LINE_RATE,
  formatRateHistoryLine,
  buildRateHistoryResult,
  normaliseRateHistoryKeys,
  emptyRateHistoryFor,
  runRateHistoryBatch,
};
