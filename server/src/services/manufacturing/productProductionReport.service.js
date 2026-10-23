const mongoose = require('mongoose');
const httpStatus = require('http-status');
const {
  Product,
  ProductVariant,
  ProductionOrder,
  ProductionReceipt,
  MaterialIssue,
  ScrapRecord,
  PackingVoucher,
} = require('../../models');
const ApiError = require('../../utils/ApiError');
const { BUSINESS_TZ, eachBusinessCalendarDate } = require('../../utils/businessTimezone');
const { roundQty, aggregateScope } = require('./common');

/*
 * Product-wise production register — the factory's monthly sheet for one product line:
 *
 *   Date │ Batches · each material issued · Total issue (kg)
 *        │ finished packs (Carton / 5 kg bag / 20 kg bag …) · Total finished goods (kg)
 *        │ Extra (loose) packing (kg) · Total finished weight (kg)
 *        │ Total issue to date · Total finished to date · Remaining in process
 *
 * Everything is weighed in kg so issue and output can be set against each other:
 *   remaining in process = opening + issued − returned − finished − lost (scrap)
 *
 * The "product line" is one or more finished products (a pack size is often its own
 * product, or a variant of one). Only documents of their production orders count:
 * posted MIVs and returns, finished-goods receipts and in-process scrap. Every figure is
 * a sum of documents, so the opening is simply everything before the period.
 *
 * Weights: a material or pack measured in a weight unit converts directly; otherwise the
 * product's unit conversion to a weight unit is used; a finished pack can also take its
 * weight from the recipe (weight of materials per unit on its orders); a weight typed on
 * the report (packWeights) overrides all of them. Anything left without a weight is
 * listed in `warnings` and kept out of the kg figures — never guessed.
 */

const MAX_DAYS = 400;
const MAX_PRODUCTS = 12;
const KG_PER = { kg: 1, g: 0.001, mg: 0.000001, ton: 1000, lb: 0.45359237, oz: 0.028349523125 };
// Scrap that leaves the floor (in-process loss). Finished-goods write-offs happen after
// the goods were received, so they are not part of the process.
const PROCESS_SCRAP_STAGES = ['material', 'wip', 'qc_reject', 'rework'];

const sum = (rows, key) => rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
const OBJECT_ID = /^[0-9a-f]{24}$/i;
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const kg = (n) => Math.round((Number(n) || 0) * 1000) / 1000;
const dayOf = (field) => ({ $dateToString: { format: '%Y-%m-%d', date: `$${field}`, timezone: BUSINESS_TZ } });
/** '' for documents before the period (they make the opening), the day key otherwise. */
const dayOrBefore = (field, start) => ({ $cond: [{ $lt: [`$${field}`, start] }, '', dayOf(field)] });

/** kg in one unit of `unit` for this product, and where that came from. */
const unitWeight = (product, unit) => {
  const p = product || {};
  const u = String(unit || p.unit || '').toLowerCase();
  if (KG_PER[u]) return { kgPerUnit: KG_PER[u], source: 'unit' };
  const rules = (p.unitConversions || []).filter((r) => r && r.isActive !== false);
  const direct = rules.find((r) => r.fromUnit === u && KG_PER[r.toUnit]);
  if (direct) return { kgPerUnit: direct.factor * KG_PER[direct.toUnit], source: 'conversion' };
  const reverse = rules.find((r) => r.toUnit === u && KG_PER[r.fromUnit] && r.factor > 0);
  if (reverse) return { kgPerUnit: KG_PER[reverse.fromUnit] / reverse.factor, source: 'conversion' };
  return { kgPerUnit: null, source: null };
};

/** "productId:variantId=20,productId=5" → Map(key → kg). */
const parsePackWeights = (raw) => {
  const map = new Map();
  String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const [key, value] = pair.split('=');
      const n = Number(value);
      const ids = String(key || '').split(':');
      const valid = ids.length <= 2 && ids.every((part) => OBJECT_ID.test(part));
      if (valid && Number.isFinite(n) && n > 0) map.set(key, n);
    });
  return map;
};

const variantLabel = (v) => {
  if (!v) return '';
  const attrs = v.attributes instanceof Map ? [...v.attributes.values()] : Object.values(v.attributes || {});
  return attrs.filter(Boolean).join(' / ') || v.sku || '';
};

/** Products that have production orders in this branch — the report's product picker. */
const productOptions = async (scope) => {
  const rows = await ProductionOrder.aggregate([
    { $match: { ...scope, status: { $ne: 'cancelled' } } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: '$productId',
        name: { $first: '$productName' },
        sku: { $first: '$sku' },
        unit: { $first: '$unit' },
        orders: { $sum: 1 },
        lastOrderAt: { $first: '$createdAt' },
      },
    },
    { $sort: { lastOrderAt: -1 } },
    { $limit: 500 },
  ]);
  return rows.map((r) => ({
    productId: String(r._id),
    name: r.name || '',
    sku: r.sku || '',
    unit: r.unit || '',
    orders: r.orders,
    lastOrderAt: r.lastOrderAt,
  }));
};

const productProductionReport = async (ctx, q, { resolveRange }) => {
  const range = resolveRange(q);
  const scope = aggregateScope(ctx);
  const options = await productOptions(scope);
  const productIds = [
    ...new Set(
      String(q.productIds || q.productId || '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => OBJECT_ID.test(s))
    ),
  ];
  const base = { report: 'product-production', period: { startDate: range.startKey, endDate: range.endKey }, options };
  if (!productIds.length) return { ...base, needsProduct: true };
  if (productIds.length > MAX_PRODUCTS) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Choose at most ${MAX_PRODUCTS} products for one register`);
  }
  const days = eachBusinessCalendarDate(range.start, range.end);
  if (days.length > MAX_DAYS) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Choose a period of at most ${MAX_DAYS} days for this register`);
  }

  const [finishedProducts, orders] = await Promise.all([
    Product.find({ ...scope, _id: { $in: productIds.map(oid) } })
      .select('name sku unit unitConversions hasVariants productType')
      .lean(),
    ProductionOrder.find({ ...scope, productId: { $in: productIds.map(oid) } })
      .select(
        'orderNumber batchNumber orderType status productId variantId productName unit plannedQuantity completedQuantity materials.productId materials.unit materials.baseQuantity createdAt actualCompletionDate'
      )
      .sort({ createdAt: 1 })
      .lean(),
  ]);
  if (!finishedProducts.length) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
  const productOf = new Map(finishedProducts.map((p) => [String(p._id), p]));
  const selected = productIds
    .filter((id) => productOf.has(id))
    .map((id) => ({
      productId: id,
      name: productOf.get(id).name,
      sku: productOf.get(id).sku || '',
      unit: productOf.get(id).unit,
    }));

  const orderIds = orders.map((o) => o._id);
  const orderOf = new Map(orders.map((o) => [String(o._id), o]));
  const docMatch = { ...scope, productionOrderId: { $in: orderIds } };

  const [issueRows, firstIssues, receiptRows, scrapRows] = orderIds.length
    ? await Promise.all([
        MaterialIssue.aggregate([
          { $match: { ...docMatch, status: { $ne: 'cancelled' }, issueDate: { $lte: range.end } } },
          { $unwind: '$lines' },
          {
            $group: {
              _id: {
                day: dayOrBefore('issueDate', range.start),
                kind: '$kind',
                order: '$productionOrderId',
                product: '$lines.productId',
                unit: '$lines.unit',
              },
              quantity: { $sum: '$lines.quantity' },
              name: { $last: '$lines.productName' },
            },
          },
        ]),
        MaterialIssue.aggregate([
          { $match: { ...docMatch, status: { $ne: 'cancelled' }, kind: { $ne: 'return' } } },
          { $group: { _id: '$productionOrderId', first: { $min: '$issueDate' } } },
          { $project: { first: 1, day: dayOf('first') } },
        ]),
        ProductionReceipt.aggregate([
          { $match: { ...docMatch, receiptDate: { $lte: range.end } } },
          {
            $group: {
              _id: {
                day: dayOrBefore('receiptDate', range.start),
                order: '$productionOrderId',
                product: '$productId',
                variant: '$variantId',
                unit: '$unit',
              },
              quantity: { $sum: '$quantity' },
              last: { $max: '$receiptDate' },
            },
          },
        ]),
        ScrapRecord.aggregate([
          { $match: { ...docMatch, stage: { $in: PROCESS_SCRAP_STAGES }, scrapDate: { $lte: range.end } } },
          {
            $group: {
              _id: {
                day: dayOrBefore('scrapDate', range.start),
                order: '$productionOrderId',
                product: '$productId',
                variant: '$variantId',
                unit: '$unit',
                stage: '$stage',
              },
              quantity: { $sum: '$quantity' },
              name: { $last: '$productName' },
            },
          },
        ]),
      ])
    : [[], [], [], []];

  // Packing vouchers of these bulk products (packing.service.js): the packs they became.
  const packingRows = await PackingVoucher.aggregate([
    {
      $match: {
        ...scope,
        status: 'posted',
        productId: { $in: productIds.map(oid) },
        packingDate: { $lte: range.end },
      },
    },
    { $unwind: '$lines' },
    {
      $group: {
        _id: {
          day: dayOrBefore('packingDate', range.start),
          bulk: '$productId',
          bulkUnit: '$unit',
          product: '$lines.productId',
          unit: '$lines.unit',
          content: '$lines.contentQuantity',
        },
        quantity: { $sum: '$lines.quantity' },
        bulkQuantity: { $sum: '$lines.bulkQuantity' },
      },
    },
  ]);

  /* ── Weights ──────────────────────────────────────────────────────────────── */

  const materialIds = new Set();
  issueRows.forEach((r) => materialIds.add(String(r._id.product)));
  scrapRows.forEach((r) => materialIds.add(String(r._id.product)));
  // Output of these orders may be booked to another product (e.g. loose kg) — name it too.
  receiptRows.forEach((r) => materialIds.add(String(r._id.product)));
  packingRows.forEach((r) => materialIds.add(String(r._id.product)));
  orders.forEach((o) => (o.materials || []).forEach((m) => materialIds.add(String(m.productId))));
  productIds.forEach((id) => materialIds.delete(id));
  const variantIds = [
    ...new Set([...receiptRows.map((r) => r._id.variant), ...orders.map((o) => o.variantId)].filter(Boolean).map(String)),
  ];
  const [materialProducts, variants] = await Promise.all([
    materialIds.size
      ? Product.find({ _id: { $in: [...materialIds].map(oid) } })
          .select('name sku unit unitConversions hasVariants productType')
          .lean()
      : [],
    variantIds.length
      ? ProductVariant.find({ _id: { $in: variantIds.map(oid) } })
          .select('attributes sku unit isDefault')
          .lean()
      : [],
  ]);
  const anyProduct = new Map([...materialProducts, ...finishedProducts].map((p) => [String(p._id), p]));
  const variantOf = new Map(variants.map((v) => [String(v._id), v]));

  // Materials: one column per material, in its own unit; weighed when we can.
  const materials = new Map();
  const materialCol = (productId, unit, name) => {
    const key = `${productId}|${unit || ''}`;
    if (!materials.has(key)) {
      const product = anyProduct.get(String(productId)) || {};
      const w = unitWeight(product, unit);
      materials.set(key, {
        key,
        productId: String(productId),
        name: product.name || name || 'Material',
        sku: product.sku || '',
        unit: unit || product.unit || '',
        kgPerUnit: w.kgPerUnit,
        weightSource: w.source,
        issued: 0,
        returned: 0,
        scrapped: 0,
      });
    }
    return materials.get(key);
  };

  // Finished packs: one column per product (per variant when the product has variants).
  const packWeights = parsePackWeights(q.packWeights);
  const finishedOf = (productId) => productOf.get(String(productId)) || anyProduct.get(String(productId));
  const packKeyOf = (productId, variantId) => {
    const p = finishedOf(productId);
    return p && p.hasVariants && variantId ? `${productId}:${variantId}` : String(productId);
  };
  const packs = new Map();
  const recipeWeight = (key) => {
    // kg of weighed materials per finished unit on this pack's latest order with a recipe.
    const candidates = orders.filter((o) => packKeyOf(o.productId, o.variantId) === key && (o.materials || []).length);
    for (let i = candidates.length - 1; i >= 0; i -= 1) {
      const o = candidates[i];
      // Packing material (cartons, bags in pcs) carries no product weight and is skipped.
      const total = o.materials.reduce((s, m) => {
        const w = unitWeight(anyProduct.get(String(m.productId)), m.unit);
        return w.kgPerUnit == null ? s : s + (m.baseQuantity || 0) * w.kgPerUnit;
      }, 0);
      if (total > 0 && o.plannedQuantity > 0) return total / o.plannedQuantity;
    }
    return null;
  };
  const packCol = (productId, variantId, unit, packed) => {
    const key = packKeyOf(productId, variantId);
    if (!packs.has(key)) {
      const product = finishedOf(productId) || {};
      const variant = (variantId && variantOf.get(String(variantId))) || {};
      const packUnit = unit || variant.unit || product.unit || '';
      const label = product.hasVariants ? variantLabel(variant) : '';
      let w = unitWeight(product, packUnit);
      // A pack size says exactly how much bulk one pack holds.
      if (packed && packed.kgPerUnit > 0) w = { kgPerUnit: packed.kgPerUnit, source: 'pack' };
      if (w.kgPerUnit == null) {
        const fromRecipe = recipeWeight(key);
        if (fromRecipe) w = { kgPerUnit: fromRecipe, source: 'recipe' };
      }
      const manual = packWeights.get(key);
      if (manual) w = { kgPerUnit: manual, source: 'manual' };
      packs.set(key, {
        key,
        productId: String(productId),
        variantId: variantId ? String(variantId) : null,
        name: label ? `${product.name || ''} — ${label}` : product.name || '',
        shortName: label || product.name || '',
        sku: variant.sku || product.sku || '',
        unit: packUnit,
        kgPerUnit: w.kgPerUnit == null ? null : roundQty(w.kgPerUnit),
        weightSource: w.source,
        // Received by weight itself (loose kg) rather than in packs.
        // A pack size is always counted in packs, whatever unit its product uses.
        byWeight: !packed && !!KG_PER[String(packUnit).toLowerCase()],
        quantity: 0,
        kg: 0,
      });
    }
    return packs.get(key);
  };
  // Every selected product gets a column, in the order chosen, even with no receipt yet.
  orders.forEach((o) => packCol(o.productId, o.variantId, o.unit));
  selected.forEach((s) => {
    if (![...packs.values()].some((p) => p.productId === s.productId)) packCol(s.productId, null, s.unit);
  });
  receiptRows.forEach((r) => packCol(r._id.product, r._id.variant, r._id.unit));
  const bulkKgPerUnit = (r) => unitWeight(productOf.get(String(r._id.bulk)), r._id.bulkUnit).kgPerUnit;
  packingRows.forEach((r) => {
    const per = bulkKgPerUnit(r);
    packCol(r._id.product, null, r._id.unit, { kgPerUnit: per == null ? null : r._id.content * per });
  });
  const packOrder = new Map(productIds.map((id, i) => [id, i]));

  // Loose (weight-unit) finished goods form the "extra packing" column only when there are
  // packs beside them; a product line received purely by weight is just its own columns.
  const packList = [...packs.values()];
  const hasLoose = packList.some((p) => p.byWeight) && packList.some((p) => !p.byWeight);

  /* ── Day buckets ─────────────────────────────────────────────────────────── */

  const emptyDay = (date) => ({
    date,
    newBatches: [],
    issued: {},
    returned: {},
    packs: {},
    issueKg: 0,
    returnedKg: 0,
    packedKg: 0,
    looseKg: 0,
    scrapKg: 0,
  });
  const dayMap = new Map(days.map((d) => [d, emptyDay(d)]));
  const opening = emptyDay('');
  const bucket = (day) => (day === '' ? opening : dayMap.get(day));

  const perOrder = new Map();
  const orderRow = (id) => {
    const key = String(id);
    if (!perOrder.has(key)) {
      perOrder.set(key, {
        issuedKg: 0,
        returnedKg: 0,
        finishedQty: 0,
        finishedKg: 0,
        scrapKg: 0,
        periodActive: false,
        lastReceipt: null,
      });
    }
    return perOrder.get(key);
  };
  const unweighed = { materials: new Set(), packs: new Set() };

  issueRows.forEach((r) => {
    const b = bucket(r._id.day);
    if (!b) return;
    const col = materialCol(r._id.product, r._id.unit, r.name);
    const isReturn = r._id.kind === 'return';
    const w = col.kgPerUnit == null ? 0 : r.quantity * col.kgPerUnit;
    if (col.kgPerUnit == null && r._id.day !== '') unweighed.materials.add(col.name);
    const o = orderRow(r._id.order);
    if (r._id.day !== '') o.periodActive = true;
    if (isReturn) {
      b.returned[col.key] = (b.returned[col.key] || 0) + r.quantity;
      b.returnedKg += w;
      o.returnedKg += w;
      if (r._id.day !== '') col.returned += r.quantity;
    } else {
      b.issued[col.key] = (b.issued[col.key] || 0) + r.quantity;
      b.issueKg += w;
      o.issuedKg += w;
      if (r._id.day !== '') col.issued += r.quantity;
    }
  });

  receiptRows.forEach((r) => {
    const b = bucket(r._id.day);
    if (!b) return;
    const col = packCol(r._id.product, r._id.variant, r._id.unit);
    const w = col.kgPerUnit == null ? 0 : r.quantity * col.kgPerUnit;
    if (col.kgPerUnit == null && r._id.day !== '') unweighed.packs.add(col.name);
    b.packs[col.key] = (b.packs[col.key] || 0) + r.quantity;
    if (hasLoose && col.byWeight) b.looseKg += w;
    else b.packedKg += w;
    const o = orderRow(r._id.order);
    o.finishedQty += r.quantity;
    o.finishedKg += w;
    if (!o.lastReceipt || r.last > o.lastReceipt) o.lastReceipt = r.last;
    if (r._id.day !== '') {
      o.periodActive = true;
      col.quantity += r.quantity;
      col.kg += w;
    }
  });

  // Packed bulk: the packs are counted, and their kg move from "extra / loose" (the bulk
  // received) to "packed". Total finished weight — and so the in-process balance — is
  // unchanged: packing only repacks what was already received.
  packingRows.forEach((r) => {
    const b = bucket(r._id.day);
    if (!b) return;
    const col = packCol(r._id.product, null, r._id.unit);
    const per = bulkKgPerUnit(r);
    const w = per == null ? 0 : r.bulkQuantity * per;
    if (per == null && r._id.day !== '') unweighed.packs.add(col.name);
    b.packs[col.key] = (b.packs[col.key] || 0) + r.quantity;
    b.packedKg += w;
    b.looseKg -= w;
    if (r._id.day !== '') {
      col.quantity += r.quantity;
      col.kg += w;
      // …and leave the bulk's own (loose) column, which counted them when received.
      const bulkCol = packs.get(packKeyOf(r._id.bulk, null));
      if (bulkCol) {
        bulkCol.quantity -= r.bulkQuantity;
        bulkCol.kg -= w;
      }
    }
  });

  scrapRows.forEach((r) => {
    const b = bucket(r._id.day);
    if (!b) return;
    const isFinished = productOf.has(String(r._id.product));
    const col = isFinished
      ? packCol(r._id.product, r._id.variant, r._id.unit)
      : materialCol(r._id.product, r._id.unit, r.name);
    const w = col.kgPerUnit == null ? 0 : r.quantity * col.kgPerUnit;
    if (col.kgPerUnit == null && r._id.day !== '') (isFinished ? unweighed.packs : unweighed.materials).add(col.name);
    b.scrapKg += w;
    const o = orderRow(r._id.order);
    o.scrapKg += w;
    if (r._id.day !== '') {
      o.periodActive = true;
      if (!isFinished) col.scrapped += r.quantity;
    }
  });

  const startedOn = new Map(firstIssues.map((f) => [String(f._id), f.day]));
  firstIssues.forEach((f) => {
    const d = dayMap.get(f.day);
    const o = orderOf.get(String(f._id));
    if (d && o) d.newBatches.push(o.batchNumber || o.orderNumber);
  });

  /* ── Rows ─────────────────────────────────────────────────────────────────── */

  const openingInProcess = kg(opening.issueKg - opening.returnedKg - opening.packedKg - opening.looseKg - opening.scrapKg);
  let cumIssue = 0;
  let cumFinished = 0;
  let cumScrap = 0;
  const round = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, roundQty(v)]));
  const dayRows = [...dayMap.values()].map((d) => {
    const netIssue = d.issueKg - d.returnedKg;
    const finished = d.packedKg + d.looseKg;
    cumIssue += netIssue;
    cumFinished += finished;
    cumScrap += d.scrapKg;
    return {
      date: d.date,
      batches: d.newBatches.length,
      batchNumbers: d.newBatches.sort(),
      issued: round(d.issued),
      returned: round(d.returned),
      packs: round(d.packs),
      issueKg: kg(d.issueKg),
      returnedKg: kg(d.returnedKg),
      packedKg: kg(d.packedKg),
      looseKg: kg(d.looseKg),
      finishedKg: kg(finished),
      scrapKg: kg(d.scrapKg),
      cumIssueKg: kg(cumIssue),
      cumFinishedKg: kg(cumFinished),
      inProcessKg: kg(openingInProcess + cumIssue - cumFinished - cumScrap),
    };
  });
  const closingInProcess = kg(openingInProcess + cumIssue - cumFinished - cumScrap);
  const isIdle = (d) =>
    !d.batches &&
    !d.issueKg &&
    !d.returnedKg &&
    !d.finishedKg &&
    !d.scrapKg &&
    !Object.keys(d.issued).length &&
    !Object.keys(d.packs).length;

  // Batch-wise: every batch with activity in the period, or still holding material at its end.
  const batchRows = orders
    .map((o) => {
      const t = perOrder.get(String(o._id));
      if (!t) return null;
      const netIssued = t.issuedKg - t.returnedKg;
      const inProcess = netIssued - t.finishedKg - t.scrapKg;
      if (!t.periodActive && Math.abs(inProcess) < 0.0005) return null;
      const pack = packs.get(packKeyOf(o.productId, o.variantId));
      return {
        orderId: String(o._id),
        orderNumber: o.orderNumber,
        batchNumber: o.batchNumber || o.orderNumber,
        orderType: o.orderType || 'production',
        status: o.status,
        productName: pack ? pack.name : o.productName,
        packKey: pack ? pack.key : null,
        unit: o.unit,
        startedOn: startedOn.get(String(o._id)) || null,
        lastReceiptAt: t.lastReceipt,
        planned: roundQty(o.plannedQuantity),
        issuedKg: kg(t.issuedKg),
        returnedKg: kg(t.returnedKg),
        netIssuedKg: kg(netIssued),
        finishedQty: roundQty(t.finishedQty),
        finishedKg: kg(t.finishedKg),
        scrapKg: kg(t.scrapKg),
        inProcessKg: kg(inProcess),
        yieldPercent: netIssued > 0 ? Math.round((t.finishedKg / netIssued) * 1000) / 10 : null,
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) => (a.startedOn || '9999').localeCompare(b.startedOn || '9999') || a.batchNumber.localeCompare(b.batchNumber)
    );

  const materialList = [...materials.values()]
    .filter((m) => m.issued || m.returned || m.scrapped)
    .sort(
      (a, b) =>
        (b.kgPerUnit != null) - (a.kgPerUnit != null) ||
        b.issued * (b.kgPerUnit || 0) - a.issued * (a.kgPerUnit || 0) ||
        a.name.localeCompare(b.name)
    )
    .map((m) => ({
      ...m,
      issued: roundQty(m.issued),
      returned: roundQty(m.returned),
      scrapped: roundQty(m.scrapped),
      kgPerUnit: m.kgPerUnit == null ? null : roundQty(m.kgPerUnit),
      netKg: m.kgPerUnit == null ? null : kg((m.issued - m.returned) * m.kgPerUnit),
    }));
  const packOut = [...packs.values()]
    .sort(
      (a, b) =>
        (packOrder.has(a.productId) ? packOrder.get(a.productId) : 99) -
          (packOrder.has(b.productId) ? packOrder.get(b.productId) : 99) ||
        a.byWeight - b.byWeight ||
        (a.kgPerUnit || 0) - (b.kgPerUnit || 0) ||
        a.name.localeCompare(b.name)
    )
    .map((p) => ({ ...p, quantity: roundQty(p.quantity), kg: kg(p.kg), loose: hasLoose && p.byWeight }));

  const warnings = [];
  if (unweighed.packs.size) {
    warnings.push({
      kind: 'pack',
      names: [...unweighed.packs],
      message:
        'No kg weight for these finished goods — they are counted in packs but left out of every kg total. Enter the kg per pack on the report, or add a unit conversion to kg on the product.',
    });
  }
  if (unweighed.materials.size) {
    warnings.push({
      kind: 'material',
      names: [...unweighed.materials],
      message:
        'These materials are not measured by weight (packing such as cartons or bags) — they are listed but not counted in the kg totals.',
    });
  }

  const totalIssueKg = kg(sum(dayRows, 'issueKg'));
  const totalReturnedKg = kg(sum(dayRows, 'returnedKg'));
  const totalFinishedKg = kg(sum(dayRows, 'finishedKg'));
  const completed = batchRows.filter((b) => b.status === 'completed' && b.netIssuedKg > 0);
  const completedIssued = completed.reduce((s, b) => s + b.netIssuedKg, 0);
  return {
    ...base,
    selected,
    baseUnit: 'kg',
    materials: materialList,
    packs: packOut,
    hasLoose,
    openingInProcessKg: openingInProcess,
    closingInProcessKg: closingInProcess,
    days: q.hideIdle === 'true' || q.hideIdle === true ? dayRows.filter((d) => !isIdle(d)) : dayRows,
    batches: batchRows,
    warnings,
    totals: {
      batches: dayRows.reduce((s, d) => s + d.batches, 0),
      issueKg: totalIssueKg,
      returnedKg: totalReturnedKg,
      netIssueKg: kg(totalIssueKg - totalReturnedKg),
      packedKg: kg(sum(dayRows, 'packedKg')),
      looseKg: kg(sum(dayRows, 'looseKg')),
      finishedKg: totalFinishedKg,
      scrapKg: kg(sum(dayRows, 'scrapKg')),
      activeDays: dayRows.filter((d) => !isIdle(d)).length,
      // Output against the material that went in, for batches already completed.
      completedBatches: completed.length,
      completedYieldPercent:
        completedIssued > 0
          ? Math.round((completed.reduce((s, b) => s + b.finishedKg, 0) / completedIssued) * 1000) / 10
          : null,
    },
  };
};

module.exports = { productProductionReport, unitWeight, parsePackWeights };
