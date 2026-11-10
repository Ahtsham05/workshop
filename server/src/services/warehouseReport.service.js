/**
 * Warehouse reports (Warehouses → Reports). Every figure comes from two sources:
 *   current stock per warehouse / bin  — warehouse.service.js#computeBranchStock
 *   the warehouse ledger (WarehouseMove) — every movement since warehouses were turned on
 * A balance on a past date is today's balance minus everything that moved after it, so
 * opening + movements = closing always holds.
 */
const mongoose = require('mongoose');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { Warehouse, WarehouseMove, WarehouseLocation, WarehouseTransfer, Invoice, Purchase, Product } = require('../models');
const { computeBranchStock } = require('./warehouse.service');

const { ObjectId } = mongoose.Types;
const oid = (v) => (v instanceof ObjectId ? v : new ObjectId(String(v)));
const isId = (v) => Boolean(v) && mongoose.isValidObjectId(String(v));
const round = (n) => Math.round(Number(n || 0) * 10000) / 10000;
const money = (n) => Math.round(Number(n || 0) * 100) / 100;

const requireBranch = (branchId) => {
  if (!branchId) throw new ApiError(httpStatus.BAD_REQUEST, 'Select a branch first — warehouse reports are per branch');
};

/** `YYYY-MM-DD` → start / end of that day; defaults to the current month. */
const parseRange = (query = {}) => {
  const now = new Date();
  const start = query.from ? new Date(`${String(query.from).slice(0, 10)}T00:00:00`) : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = query.to ? new Date(`${String(query.to).slice(0, 10)}T23:59:59.999`) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Pick a valid date range');
  }
  return { start, end };
};

const whRef = (w) => ({ id: String(w._id), name: w.name, code: w.code, isDefault: Boolean(w.isDefault), color: w.color || 'blue' });
const keyOf = (productId, variantId) => `${productId}|${variantId || ''}`;

/** Which column of the stock summary a move lands in. */
const bucketOf = (moveType, qty) => {
  switch (moveType) {
    case 'receipt':
      return 'purchases';
    case 'return_in':
      return 'returnsIn';
    case 'transfer_in':
    case 'branch_in':
      return 'transfersIn';
    case 'production_in':
      return 'productionIn';
    case 'delivery':
      return 'sales';
    case 'return_out':
      return 'returnsOut';
    case 'transfer_out':
    case 'branch_out':
      return 'transfersOut';
    case 'production_out':
      return 'productionOut';
    default:
      return qty >= 0 ? 'adjustIn' : 'adjustOut';
  }
};
const IN_BUCKETS = ['purchases', 'returnsIn', 'transfersIn', 'productionIn', 'adjustIn'];
const OUT_BUCKETS = ['sales', 'returnsOut', 'transfersOut', 'productionOut', 'adjustOut'];

// ── 1. Stock valuation by warehouse (now) ────────────────────────────────────────────────
const valuation = async ({ organizationId, branchId, showCost }) => {
  requireBranch(branchId);
  const { warehouses, rows } = await computeBranchStock({ organizationId, branchId });
  const out = warehouses
    .filter((w) => w.isActive !== false)
    .map((w) => {
      const id = String(w._id);
      const cats = new Map();
      const acc = { products: 0, quantity: 0, costValue: 0, retailValue: 0, negative: 0 };
      rows.forEach((r) => {
        const q = r.byWarehouse[id] || 0;
        if (!q) return;
        if (q < 0) acc.negative += 1;
        else acc.products += 1;
        acc.quantity += q;
        acc.costValue += q * r.cost;
        acc.retailValue += q * r.price;
        const cat = r.category || 'Uncategorised';
        const c = cats.get(cat) || { category: cat, products: 0, quantity: 0, costValue: 0, retailValue: 0 };
        c.products += q > 0 ? 1 : 0;
        c.quantity += q;
        c.costValue += q * r.cost;
        c.retailValue += q * r.price;
        cats.set(cat, c);
      });
      const tidy = (o) => ({
        ...o,
        quantity: round(o.quantity),
        costValue: showCost ? money(o.costValue) : undefined,
        retailValue: money(o.retailValue),
        margin: showCost ? money(o.retailValue - o.costValue) : undefined,
      });
      return {
        warehouse: whRef(w),
        ...tidy(acc),
        categories: [...cats.values()].map(tidy).sort((a, b) => (b.retailValue || 0) - (a.retailValue || 0)),
      };
    });
  const totalRetail = out.reduce((s, w) => s + w.retailValue, 0) || 1;
  out.forEach((w) => {
    w.share = round((w.retailValue / totalRetail) * 100);
  });
  return { warehouses: out, generatedAt: new Date() };
};

// ── 2. Stock summary: opening, in, out, closing per warehouse & product ──────────────────
const summary = async ({ organizationId, branchId, query = {}, showCost }) => {
  requireBranch(branchId);
  const { start, end } = parseRange(query);
  const { warehouses, rows } = await computeBranchStock({ organizationId, branchId });
  const rowByKey = new Map(rows.map((r) => [r.key, r]));
  const wanted = isId(query.warehouseId) ? String(query.warehouseId) : null;
  const moves = await WarehouseMove.aggregate([
    { $match: { organizationId: oid(organizationId), branchId: oid(branchId), date: { $gte: start }, ...(wanted ? { warehouseId: oid(wanted) } : {}) } },
    {
      $group: {
        _id: { w: '$warehouseId', p: '$productId', v: '$variantId', t: '$moveType', pos: { $gte: ['$quantity', 0] }, after: { $gt: ['$date', end] } },
        qty: { $sum: '$quantity' },
      },
    },
  ]);
  const lines = new Map();
  const lineFor = (w, p, v) => {
    const k = `${w}@${keyOf(p, v)}`;
    if (!lines.has(k)) {
      const base = { warehouseId: w, productKey: keyOf(p, v), after: 0, period: 0 };
      [...IN_BUCKETS, ...OUT_BUCKETS].forEach((b) => {
        base[b] = 0;
      });
      lines.set(k, base);
    }
    return lines.get(k);
  };
  moves.forEach((m) => {
    const l = lineFor(String(m._id.w), String(m._id.p), m._id.v ? String(m._id.v) : null);
    if (m._id.after) {
      l.after += m.qty;
      return;
    }
    l.period += m.qty;
    l[bucketOf(m._id.t, m.qty)] += m.qty;
  });
  // Products that only sit in stock (no movement) still show, with opening = closing.
  rows.forEach((r) => {
    Object.entries(r.byWarehouse).forEach(([w, q]) => {
      if (q && (!wanted || w === wanted)) lineFor(w, r.productId, r.variantId);
    });
  });
  const term = String(query.search || '').trim().toLowerCase();
  const whById = new Map(warehouses.map((w) => [String(w._id), w]));
  const out = [];
  lines.forEach((l) => {
    const r = rowByKey.get(l.productKey);
    const w = whById.get(l.warehouseId);
    if (!r || !w) return;
    if (term && !`${r.name} ${r.sku} ${r.barcode}`.toLowerCase().includes(term)) return;
    if (query.category && r.category !== query.category) return;
    const current = r.byWarehouse[l.warehouseId] || 0;
    const closing = round(current - l.after);
    const opening = round(closing - l.period);
    const line = {
      warehouse: whRef(w),
      productId: r.productId,
      variantId: r.variantId,
      name: r.name,
      sku: r.sku,
      unit: r.unit,
      category: r.category,
      opening,
      closing,
    };
    [...IN_BUCKETS, ...OUT_BUCKETS].forEach((b) => {
      line[b] = round(Math.abs(l[b]));
    });
    line.totalIn = round(IN_BUCKETS.reduce((s, b) => s + line[b], 0));
    line.totalOut = round(OUT_BUCKETS.reduce((s, b) => s + line[b], 0));
    if (showCost) line.closingValue = money(closing * r.cost);
    if (!opening && !closing && !line.totalIn && !line.totalOut) return;
    out.push(line);
  });
  out.sort((a, b) => a.warehouse.name.localeCompare(b.warehouse.name) || a.name.localeCompare(b.name));
  return { from: start, to: end, rows: out, warehouses: warehouses.map(whRef) };
};

// ── 3. Stock ledger (stock card) of one product ──────────────────────────────────────────
const ledger = async ({ organizationId, branchId, query = {} }) => {
  requireBranch(branchId);
  if (!isId(query.productId)) throw new ApiError(httpStatus.BAD_REQUEST, 'Pick a product');
  const { start, end } = parseRange(query);
  const variantId = isId(query.variantId) ? String(query.variantId) : null;
  const product = await Product.findOne({ _id: query.productId, organizationId, branchId }).select('name sku unit').lean();
  if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found in this branch');
  const { warehouses, rows } = await computeBranchStock({ organizationId, branchId, productIds: [query.productId] });
  const row = rows.find((r) => r.key === keyOf(String(query.productId), variantId));
  const wanted = isId(query.warehouseId) ? String(query.warehouseId) : null;
  const match = {
    organizationId: oid(organizationId),
    branchId: oid(branchId),
    productId: oid(query.productId),
    variantId: variantId ? oid(variantId) : null,
    date: { $gte: start },
    ...(wanted ? { warehouseId: oid(wanted) } : {}),
  };
  const moves = await WarehouseMove.find(match)
    .sort({ date: 1, createdAt: 1 })
    .populate([
      { path: 'locationId', select: 'path' },
      { path: 'counterpartWarehouseId', select: 'name' },
      { path: 'createdBy', select: 'name' },
    ])
    .lean();
  const sections = warehouses
    .filter((w) => (!wanted || String(w._id) === wanted))
    .map((w) => {
      const id = String(w._id);
      const mine = moves.filter((m) => String(m.warehouseId) === id);
      const after = mine.filter((m) => m.date > end).reduce((s, m) => s + m.quantity, 0);
      const inPeriod = mine.filter((m) => m.date <= end);
      const closing = round((row ? row.byWarehouse[id] || 0 : 0) - after);
      const opening = round(closing - inPeriod.reduce((s, m) => s + m.quantity, 0));
      let balance = opening;
      const entries = inPeriod.map((m) => {
        balance = round(balance + m.quantity);
        return {
          date: m.date,
          moveType: m.moveType,
          refType: m.refType,
          refNumber: m.refNumber,
          location: m.locationId?.path || null,
          counterpart: m.counterpartWarehouseId?.name || null,
          by: m.createdBy?.name || null,
          in: m.quantity > 0 ? round(m.quantity) : 0,
          out: m.quantity < 0 ? round(-m.quantity) : 0,
          balance,
        };
      });
      return { warehouse: whRef(w), opening, closing, entries };
    })
    .filter((s) => s.opening || s.closing || s.entries.length);
  return {
    from: start,
    to: end,
    product: { id: String(product._id), name: row?.name || product.name, sku: product.sku || '', unit: product.unit || '' },
    sections,
  };
};

// ── 4. Inter-warehouse transfer register ────────────────────────────────────────────────
const transferRegister = async ({ organizationId, branchId, query = {}, showCost }) => {
  requireBranch(branchId);
  const { start, end } = parseRange(query);
  const filter = { organizationId: oid(organizationId), branchId: oid(branchId), date: { $gte: start, $lte: end } };
  filter.status = query.status && query.status !== 'all' ? query.status : { $ne: 'cancelled' };
  if (isId(query.warehouseId)) filter.$or = [{ fromWarehouseId: oid(query.warehouseId) }, { toWarehouseId: oid(query.warehouseId) }];
  const transfers = await WarehouseTransfer.find(filter)
    .sort({ date: 1, seq: 1 })
    .populate([
      { path: 'fromWarehouseId', select: 'name code' },
      { path: 'toWarehouseId', select: 'name code' },
      { path: 'fromLocationId', select: 'path' },
      { path: 'toLocationId', select: 'path' },
      { path: 'doneBy', select: 'name' },
      { path: 'createdBy', select: 'name' },
    ])
    .lean();
  const productIds = [...new Set(transfers.flatMap((t) => t.lines.map((l) => String(l.productId))))];
  const costs = new Map((await Product.find({ _id: { $in: productIds } }).select('cost').lean()).map((p) => [String(p._id), Number(p.cost || 0)]));
  const rows = transfers.map((t) => {
    const lines = t.lines.map((l) => ({
      productName: l.productName,
      sku: l.sku,
      unit: l.unit,
      quantity: round(l.quantity),
      value: showCost ? money(l.quantity * (costs.get(String(l.productId)) || 0)) : undefined,
    }));
    return {
      id: String(t._id),
      number: t.number,
      date: t.date,
      status: t.status,
      reference: t.reference || '',
      from: `${t.fromWarehouseId?.name || '—'}${t.fromLocationId?.path ? ` / ${t.fromLocationId.path}` : ''}`,
      to: `${t.toWarehouseId?.name || '—'}${t.toLocationId?.path ? ` / ${t.toLocationId.path}` : ''}`,
      by: t.doneBy?.name || t.createdBy?.name || '',
      lines,
      totalQuantity: round(t.totalQuantity),
      totalValue: showCost ? money(lines.reduce((s, l) => s + (l.value || 0), 0)) : undefined,
    };
  });
  return { from: start, to: end, rows };
};

/** Default-warehouse id + names, for documents whose warehouseId is unset. */
const warehouseNames = async (organizationId, branchId) => {
  const list = await Warehouse.find({ organizationId, branchId }).select('name code isDefault color').lean();
  const def = list.find((w) => w.isDefault);
  return { list, byId: new Map(list.map((w) => [String(w._id), w])), defaultId: def ? String(def._id) : null };
};

// ── 5. Sales by warehouse ────────────────────────────────────────────────────────────────
const sales = async ({ organizationId, branchId, query = {}, showCost }) => {
  requireBranch(branchId);
  const { start, end } = parseRange(query);
  const { byId, defaultId } = await warehouseNames(organizationId, branchId);
  const match = {
    organizationId: oid(organizationId),
    branchId: oid(branchId),
    invoiceDate: { $gte: start, $lte: end },
    type: { $ne: 'quotation' },
    status: { $nin: ['cancelled'] },
  };
  const [docs, top] = await Promise.all([
    Invoice.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$warehouseId',
          invoices: { $sum: 1 },
          sales: { $sum: '$total' },
          cost: { $sum: '$totalCost' },
          profit: { $sum: '$totalProfit' },
          qty: { $sum: { $sum: { $map: { input: '$items', as: 'i', in: { $ifNull: ['$$i.stockQuantity', '$$i.quantity'] } } } } },
        },
      },
    ]),
    Invoice.aggregate([
      { $match: match },
      { $unwind: '$items' },
      {
        $group: {
          _id: { w: '$warehouseId', p: '$items.productId' },
          name: { $first: '$items.name' },
          qty: { $sum: { $ifNull: ['$items.stockQuantity', '$items.quantity'] } },
          amount: { $sum: '$items.subtotal' },
          profit: { $sum: '$items.profit' },
        },
      },
      { $sort: { amount: -1 } },
    ]),
  ]);
  const key = (w) => (w ? String(w) : defaultId) || 'none';
  const groups = new Map();
  const groupFor = (id) => {
    if (!groups.has(id)) {
      const w = byId.get(id);
      groups.set(id, {
        warehouse: w ? whRef(w) : { id, name: 'Default warehouse', code: '', isDefault: true },
        invoices: 0,
        quantity: 0,
        sales: 0,
        cost: 0,
        profit: 0,
        topProducts: [],
      });
    }
    return groups.get(id);
  };
  docs.forEach((d) => {
    const g = groupFor(key(d._id));
    g.invoices += d.invoices;
    g.quantity += d.qty || 0;
    g.sales += d.sales || 0;
    g.cost += d.cost || 0;
    g.profit += d.profit || 0;
  });
  top.forEach((t) => {
    const g = groupFor(key(t._id.w));
    if (g.topProducts.length >= 5) return;
    g.topProducts.push({ name: t.name, quantity: round(t.qty), amount: money(t.amount), profit: showCost ? money(t.profit) : undefined });
  });
  const out = [...groups.values()].map((g) => ({
    ...g,
    quantity: round(g.quantity),
    sales: money(g.sales),
    cost: showCost ? money(g.cost) : undefined,
    profit: showCost ? money(g.profit) : undefined,
    margin: showCost && g.sales ? round((g.profit / g.sales) * 100) : undefined,
  }));
  out.sort((a, b) => b.sales - a.sales);
  return { from: start, to: end, warehouses: out };
};

// ── 6. Purchases by warehouse ────────────────────────────────────────────────────────────
const purchases = async ({ organizationId, branchId, query = {} }) => {
  requireBranch(branchId);
  const { start, end } = parseRange(query);
  const { byId, defaultId } = await warehouseNames(organizationId, branchId);
  const match = { organizationId: oid(organizationId), branchId: oid(branchId), purchaseDate: { $gte: start, $lte: end } };
  const [docs, top] = await Promise.all([
    Purchase.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$warehouseId',
          purchases: { $sum: 1 },
          amount: { $sum: '$totalAmount' },
          suppliers: { $addToSet: '$supplier' },
          qty: { $sum: { $sum: { $map: { input: '$items', as: 'i', in: { $ifNull: ['$$i.stockQuantity', '$$i.quantity'] } } } } },
        },
      },
    ]),
    Purchase.aggregate([
      { $match: match },
      { $unwind: '$items' },
      { $group: { _id: { w: '$warehouseId', p: '$items.product' }, qty: { $sum: { $ifNull: ['$items.stockQuantity', '$items.quantity'] } }, amount: { $sum: '$items.total' } } },
      { $sort: { amount: -1 } },
      { $lookup: { from: 'products', localField: '_id.p', foreignField: '_id', as: 'p', pipeline: [{ $project: { name: 1 } }] } },
    ]),
  ]);
  const key = (w) => (w ? String(w) : defaultId) || 'none';
  const groups = new Map();
  const groupFor = (id) => {
    if (!groups.has(id)) {
      const w = byId.get(id);
      groups.set(id, { warehouse: w ? whRef(w) : { id, name: 'Default warehouse', code: '', isDefault: true }, purchases: 0, suppliers: 0, quantity: 0, amount: 0, topProducts: [] });
    }
    return groups.get(id);
  };
  docs.forEach((d) => {
    const g = groupFor(key(d._id));
    g.purchases += d.purchases;
    g.suppliers += (d.suppliers || []).length;
    g.quantity += d.qty || 0;
    g.amount += d.amount || 0;
  });
  top.forEach((t) => {
    const g = groupFor(key(t._id.w));
    if (g.topProducts.length >= 5) return;
    g.topProducts.push({ name: t.p?.[0]?.name || '(deleted product)', quantity: round(t.qty), amount: money(t.amount) });
  });
  const out = [...groups.values()].map((g) => ({ ...g, quantity: round(g.quantity), amount: money(g.amount) }));
  out.sort((a, b) => b.amount - a.amount);
  return { from: start, to: end, warehouses: out };
};

// ── 7. Stock ageing by warehouse ─────────────────────────────────────────────────────────
const AGE_BUCKETS = [
  { key: 'd30', label: '0–30 days', max: 30 },
  { key: 'd60', label: '31–60 days', max: 60 },
  { key: 'd90', label: '61–90 days', max: 90 },
  { key: 'd180', label: '91–180 days', max: 180 },
  { key: 'older', label: 'Over 180 days', max: Infinity },
];

const ageing = async ({ organizationId, branchId, query = {}, showCost }) => {
  requireBranch(branchId);
  const { warehouses, rows } = await computeBranchStock({ organizationId, branchId });
  const wanted = isId(query.warehouseId) ? String(query.warehouseId) : null;
  const lastIn = await WarehouseMove.aggregate([
    { $match: { organizationId: oid(organizationId), branchId: oid(branchId), quantity: { $gt: 0 }, ...(wanted ? { warehouseId: oid(wanted) } : {}) } },
    { $group: { _id: { w: '$warehouseId', p: '$productId', v: '$variantId' }, last: { $max: '$date' } } },
  ]);
  const lastMap = new Map(lastIn.map((l) => [`${l._id.w}@${keyOf(l._id.p, l._id.v)}`, l.last]));
  const created = new Map(
    (await Product.find({ organizationId, branchId }).select('createdAt').lean()).map((p) => [String(p._id), p.createdAt])
  );
  const now = Date.now();
  const out = [];
  warehouses
    .filter((w) => (!wanted || String(w._id) === wanted) && w.isActive !== false)
    .forEach((w) => {
      const id = String(w._id);
      rows.forEach((r) => {
        const q = r.byWarehouse[id] || 0;
        if (q <= 0) return;
        const last = lastMap.get(`${id}@${r.key}`) || null;
        const since = last || created.get(r.productId) || null;
        const days = since ? Math.max(0, Math.floor((now - new Date(since).getTime()) / 86400000)) : null;
        const bucket = AGE_BUCKETS.find((b) => days !== null && days <= b.max) || AGE_BUCKETS[AGE_BUCKETS.length - 1];
        out.push({
          warehouse: whRef(w),
          productId: r.productId,
          variantId: r.variantId,
          name: r.name,
          sku: r.sku,
          unit: r.unit,
          quantity: round(q),
          value: showCost ? money(q * r.cost) : undefined,
          lastInAt: last,
          estimated: !last,
          days,
          bucket: bucket.key,
        });
      });
    });
  out.sort((a, b) => (b.days ?? 0) - (a.days ?? 0));
  const totals = AGE_BUCKETS.map((b) => {
    const items = out.filter((o) => o.bucket === b.key);
    return { ...b, max: undefined, items: items.length, quantity: round(items.reduce((s, i) => s + i.quantity, 0)), value: showCost ? money(items.reduce((s, i) => s + (i.value || 0), 0)) : undefined };
  });
  return { rows: out, buckets: totals };
};

// ── 8. Bin / location stock ──────────────────────────────────────────────────────────────
const bins = async ({ organizationId, branchId, query = {}, showCost }) => {
  requireBranch(branchId);
  const { warehouses, rows } = await computeBranchStock({ organizationId, branchId });
  const wanted = isId(query.warehouseId) ? String(query.warehouseId) : null;
  const locations = await WarehouseLocation.find({ organizationId: oid(organizationId), branchId: oid(branchId) }).select('path warehouseId').lean();
  const pathOf = new Map(locations.map((l) => [String(l._id), l.path]));
  const out = [];
  warehouses
    .filter((w) => (!wanted || String(w._id) === wanted) && w.isActive !== false)
    .forEach((w) => {
      const id = String(w._id);
      const byBin = new Map();
      rows.forEach((r) => {
        Object.entries(r.byLocation).forEach(([k, q]) => {
          if (!q || !k.startsWith(`${id}|`)) return;
          const lid = k.split('|')[1] || '';
          const list = byBin.get(lid) || [];
          list.push({ productId: r.productId, name: r.name, sku: r.sku, unit: r.unit, quantity: round(q), value: showCost ? money(q * r.cost) : undefined });
          byBin.set(lid, list);
        });
      });
      [...byBin.entries()]
        // Warehouse level (no bin) first, then bins by path.
        .sort((a, b) => (a[0] ? 1 : 0) - (b[0] ? 1 : 0) || (pathOf.get(a[0]) || '').localeCompare(pathOf.get(b[0]) || ''))
        .forEach(([lid, items]) => {
          items.sort((a, b) => a.name.localeCompare(b.name));
          out.push({
            warehouse: whRef(w),
            locationId: lid || null,
            path: lid ? pathOf.get(lid) || '—' : null,
            items,
            quantity: round(items.reduce((s, i) => s + i.quantity, 0)),
            value: showCost ? money(items.reduce((s, i) => s + (i.value || 0), 0)) : undefined,
          });
        });
    });
  return { bins: out };
};

const REPORTS = { valuation, summary, ledger, transfers: transferRegister, sales, purchases, ageing, bins };

const runReport = async ({ report, organizationId, branchId, query, showCost }) => {
  const fn = REPORTS[report];
  if (!fn) throw new ApiError(httpStatus.NOT_FOUND, 'Unknown warehouse report');
  return fn({ organizationId, branchId, query, showCost });
};

module.exports = { REPORT_KEYS: Object.keys(REPORTS), runReport, valuation, summary, ledger, transferRegister, sales, purchases, ageing, bins };
