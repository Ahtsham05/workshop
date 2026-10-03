const mongoose = require('mongoose');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { toBusinessCalendarDate, parseBusinessDateBoundary } = require('../utils/businessTimezone');
const {
  Product,
  ProductVariant,
  Inventory,
  Batch,
  Imei,
  StockCount,
  StockCountLine,
  StockCountPolicy,
} = require('../models');
const productService = require('./product.service');
const stockAdjustmentService = require('./stockAdjustment.service');
const { resolvePeriod, getBranchAnalytics } = require('./productAnalytics.service');
const { matchesEitherImei } = require('./imei.service');

/*
 * Stock counts: initial (opening) counts, daily A/B/C cycle counts and surprise audits.
 *
 * Countable items come from the same catalog the purchase / transfer / adjustment forms
 * use (productService.getPurchasableCatalog), so a "line" here is exactly what those forms
 * call an item: a plain product, a single variant, or a batch-tracked product's hidden
 * default variant. Serialized (IMEI / serial) products are counted unit by unit at product
 * level, because IMEI records aren't linked to a variant.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const CLASSES = ['A', 'B', 'C'];
const OPEN_STATUSES = ['counting', 'review', 'posting'];
// Surprise audits lean towards expensive items without ever leaving cheap ones out.
const SURPRISE_WEIGHT = { A: 6, B: 3, C: 1 };

const REASON_LABELS = {
  miscount: 'Earlier miscount',
  damage: 'Damaged',
  theft: 'Theft',
  expired: 'Expired',
  unrecorded_sale: 'Sale not recorded',
  unrecorded_receipt: 'Receipt not recorded',
  supplier_short: 'Supplier short delivery',
  wrong_item: 'Wrong item sold / received',
  other: 'Other',
};

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};
// Counted quantities may be fractional (kg, metres) — keep 3 decimals, drop float noise.
const roundQty = (value) => round(value, 3);
const oid = (id) => new mongoose.Types.ObjectId(String(id));
const itemKey = (productId, variantId) => (variantId ? `v:${variantId}` : `p:${productId}`);
const todayKey = () => toBusinessCalendarDate(new Date());
const shiftKey = (key, days) => toBusinessCalendarDate(new Date(parseBusinessDateBoundary(key, false).getTime() + days * DAY_MS + DAY_MS / 2));
const daysBetweenKeys = (fromKey, toKey) =>
  Math.round((parseBusinessDateBoundary(toKey, false) - parseBusinessDateBoundary(fromKey, false)) / DAY_MS);

const requireBranch = (branchId) => {
  if (!branchId) throw new ApiError(httpStatus.BAD_REQUEST, 'Select a branch first — stock is counted per branch');
};

// ── Policy ──────────────────────────────────────────────────────────────────────────

const getPolicy = async ({ organizationId, branchId }) => {
  requireBranch(branchId);
  const existing = await StockCountPolicy.findOne({ organizationId, branchId });
  if (existing) return existing;
  try {
    return await StockCountPolicy.create({ organizationId, branchId });
  } catch (error) {
    if (error && error.code === 11000) return StockCountPolicy.findOne({ organizationId, branchId });
    throw error;
  }
};

const updatePolicy = async ({ organizationId, branchId, body, updatedBy }) => {
  const policy = await getPolicy({ organizationId, branchId });
  const fields = ['basis', 'lookbackDays', 'aShare', 'bShare', 'maxItemsPerDay', 'includeZeroStock', 'blindByDefault', 'surpriseSampleSize'];
  fields.forEach((field) => {
    if (body[field] !== undefined) policy[field] = body[field];
  });
  if (body.intervals) {
    CLASSES.forEach((cls) => {
      if (body.intervals[cls] !== undefined) policy.intervals[cls] = body.intervals[cls];
    });
  }
  if (Array.isArray(body.overrides)) {
    const byProduct = new Map();
    body.overrides.forEach((o) => byProduct.set(String(o.productId), o.cls));
    policy.overrides = [...byProduct.entries()].map(([productId, cls]) => ({ productId, cls }));
  }
  if (policy.bShare <= policy.aShare) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'The B cut-off must be higher than the A cut-off');
  }
  policy.updatedBy = updatedBy;
  await policy.save();
  return policy;
};

/** Sets (or with cls=null clears) the hand-picked class of one product. */
const setOverride = async ({ organizationId, branchId, productId, cls, updatedBy }) => {
  const policy = await getPolicy({ organizationId, branchId });
  policy.overrides = policy.overrides.filter((o) => String(o.productId) !== String(productId));
  if (cls) policy.overrides.push({ productId, cls });
  policy.updatedBy = updatedBy;
  await policy.save();
  return policy;
};

// ── Countable items ─────────────────────────────────────────────────────────────────

/**
 * Every countable item of the branch with its current system quantity. Serialized
 * products collapse to one item whose quantity is the number of units in stock.
 */
const loadItems = async ({ organizationId, branchId }) => {
  const [catalog, serializedProducts] = await Promise.all([
    productService.getPurchasableCatalog({ organizationId, branchId }),
    Product.find({ organizationId, branchId, $or: [{ trackImei: true }, { trackSerial: true }] })
      .select('_id name nameUrdu barcode sku unit hasVariants categories cost isActive')
      .lean(),
  ]);

  const serializedIds = serializedProducts.filter((p) => p.isActive !== false).map((p) => p._id);
  const unitCounts = serializedIds.length
    ? await Imei.aggregate([
        { $match: { organizationId: oid(organizationId), branchId: oid(branchId), productId: { $in: serializedIds }, status: 'in_stock' } },
        { $group: { _id: '$productId', n: { $sum: 1 } } },
      ])
    : [];
  const unitsByProduct = new Map(unitCounts.map((r) => [String(r._id), r.n]));
  const serializedById = new Map(serializedProducts.map((p) => [String(p._id), p]));

  const firstCategory = (categories) => (Array.isArray(categories) && categories[0] && categories[0].name) || '';
  const categoryIds = (categories) => (categories || []).map((c) => (c && c._id ? String(c._id) : null)).filter(Boolean);
  const categoryRefs = (categories) =>
    (categories || []).filter((c) => c && c._id).map((c) => ({ id: String(c._id), name: c.name || '' }));

  const items = [];
  const seenSerialized = new Set();
  catalog.forEach((entry) => {
    const productId = String(entry.productId);
    const serialized = serializedById.get(productId);
    if (serialized) {
      if (seenSerialized.has(productId)) return;
      seenSerialized.add(productId);
      items.push({
        key: itemKey(productId, null),
        productId,
        variantId: null,
        kind: 'serialized',
        hasVariants: Boolean(serialized.hasVariants),
        trackBatch: false,
        name: serialized.name,
        variantLabel: '',
        nameUrdu: serialized.nameUrdu || '',
        barcode: serialized.barcode || '',
        sku: serialized.sku || '',
        unit: serialized.unit || '',
        category: firstCategory(serialized.categories),
        categoryIds: categoryIds(serialized.categories),
        categories: categoryRefs(serialized.categories),
        unitCost: Number(entry.cost ?? serialized.cost) || 0,
        systemQty: unitsByProduct.get(productId) || 0,
      });
      return;
    }
    const variantId = entry.variantId ? String(entry.variantId) : null;
    items.push({
      key: itemKey(productId, variantId),
      productId,
      variantId,
      kind: variantId ? 'variant' : 'product',
      hasVariants: entry.type === 'variant',
      trackBatch: Boolean(entry.trackBatch || entry.trackExpiry),
      name: entry.productName || entry.name,
      variantLabel: entry.variantLabel || '',
      nameUrdu: entry.nameUrdu || '',
      barcode: entry.barcode || '',
      sku: '',
      unit: entry.unit || '',
      category: firstCategory(entry.categories),
      categoryIds: categoryIds(entry.categories),
      categories: categoryRefs(entry.categories),
      unitCost: Number(entry.cost) || 0,
      systemQty: roundQty(entry.stockQuantity),
    });
  });
  return items;
};

/**
 * A/B/C class per product: Pareto over the policy's value basis for the look-back
 * window, then hand-set overrides. Products with no value in the window are C.
 */
const classifyProducts = async ({ organizationId, branchId, policy }) => {
  const endKey = todayKey();
  const period = resolvePeriod({ startDate: shiftKey(endKey, -(policy.lookbackDays - 1)), endDate: endKey });
  const { rows } = await getBranchAnalytics({ organizationId, branchId, period });

  const scoreOf = (row) => {
    if (policy.basis === 'revenue') return Math.max(0, row.netRevenue || 0);
    if (policy.basis === 'stockValue') return Math.max(0, row.stockValue || 0);
    const cogs = Math.max(0, row.cogs || 0);
    return cogs > 0 ? cogs : Math.max(0, (row.netUnits || 0) * (row.cost || 0));
  };

  const scored = rows.map((row) => ({ productId: row.productId, score: scoreOf(row), sku: row.sku || '' }));
  const ranked = scored.filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
  const total = ranked.reduce((sum, r) => sum + r.score, 0);

  const result = new Map();
  scored.forEach((r) => result.set(r.productId, { cls: 'C', score: r.score, share: 0, sku: r.sku, auto: 'C' }));
  let before = 0;
  ranked.forEach((r) => {
    const shareBefore = (before / total) * 100;
    const cls = shareBefore < policy.aShare ? 'A' : shareBefore < policy.bShare ? 'B' : 'C';
    result.set(r.productId, { cls, score: r.score, share: round((r.score / total) * 100), sku: r.sku, auto: cls });
    before += r.score;
  });
  (policy.overrides || []).forEach((o) => {
    const id = String(o.productId);
    const entry = result.get(id) || { score: 0, share: 0, sku: '', auto: 'C' };
    result.set(id, { ...entry, cls: o.cls, overridden: true });
  });
  return result;
};

/** Last time each item's count was posted in this branch — key → Date. */
const loadLastCounted = async ({ organizationId, branchId }) => {
  const rows = await StockCountLine.aggregate([
    { $match: { organizationId: oid(organizationId), branchId: oid(branchId), postedAt: { $ne: null }, countedQty: { $ne: null } } },
    { $group: { _id: { p: '$productId', v: '$variantId' }, last: { $max: '$countedAt' } } },
  ]);
  return new Map(rows.map((r) => [itemKey(r._id.p, r._id.v), r.last]));
};

/** Items already on a count that hasn't been posted or cancelled — they can't go on another one. */
const loadOpenItems = async ({ organizationId, branchId }) => {
  const open = await StockCount.find({ organizationId, branchId, status: { $in: OPEN_STATUSES } }).select('_id').lean();
  if (open.length === 0) return new Set();
  const lines = await StockCountLine.find({ countId: { $in: open.map((c) => c._id) } }).select('productId variantId').lean();
  return new Set(lines.map((l) => itemKey(l.productId, l.variantId)));
};

const withClasses = (items, classes) =>
  items.map((item) => {
    const entry = classes.get(item.productId);
    return { ...item, cls: entry ? entry.cls : 'C', score: entry ? entry.score : 0, sku: item.sku || (entry && entry.sku) || '' };
  });

// ── Cycle plan ──────────────────────────────────────────────────────────────────────

/**
 * Today's cycle count. Each class is spread evenly over its interval: with K items counted
 * every N days, ceil(K / N) of them are due per day — the ones never counted (most valuable
 * first) and then those counted longest ago. An item counted within its interval, or
 * already on an open count, isn't due. maxItemsPerDay then caps the day, A before B before C.
 */
const buildPlan = async ({ organizationId, branchId }) => {
  const policy = await getPolicy({ organizationId, branchId });
  const [items, classes, lastCounted, openItems] = await Promise.all([
    loadItems({ organizationId, branchId }),
    classifyProducts({ organizationId, branchId, policy }),
    loadLastCounted({ organizationId, branchId }),
    loadOpenItems({ organizationId, branchId }),
  ]);
  const today = todayKey();

  const all = withClasses(items, classes).map((item) => {
    const last = lastCounted.get(item.key) || null;
    const daysSince = last ? daysBetweenKeys(toBusinessCalendarDate(last), today) : null;
    return { ...item, lastCountedAt: last, daysSince, onOpenCount: openItems.has(item.key) };
  });
  const eligible = all.filter((item) => item.cls !== 'exclude' && (policy.includeZeroStock || item.systemQty > 0 || item.kind === 'serialized'));

  const classStats = {};
  let selected = [];
  CLASSES.forEach((cls) => {
    const interval = policy.intervals[cls];
    const members = eligible.filter((item) => item.cls === cls);
    const due = members
      .filter((item) => !item.onOpenCount && (item.daysSince === null || item.daysSince >= interval))
      .sort((a, b) => {
        if ((a.daysSince === null) !== (b.daysSince === null)) return a.daysSince === null ? -1 : 1;
        if (a.daysSince !== b.daysSince) return (b.daysSince || 0) - (a.daysSince || 0);
        return b.score - a.score;
      });
    const quota = members.length ? Math.ceil(members.length / interval) : 0;
    const picked = due.slice(0, quota);
    selected = selected.concat(picked);
    const onSchedule = members.filter((item) => item.daysSince !== null && item.daysSince < interval).length;
    classStats[cls] = {
      items: members.length,
      interval,
      quotaPerDay: quota,
      dueToday: picked.length,
      overdue: due.filter((item) => item.daysSince !== null).length,
      neverCounted: members.filter((item) => item.daysSince === null).length,
      onOpenCount: members.filter((item) => item.onOpenCount).length,
      onSchedulePct: members.length ? round((onSchedule / members.length) * 100, 1) : 100,
      stockValue: round(members.reduce((sum, item) => sum + Math.max(0, item.systemQty) * item.unitCost, 0)),
    };
  });
  if (policy.maxItemsPerDay > 0) selected = selected.slice(0, policy.maxItemsPerDay);

  return { policy, today, all, eligible, selected, classStats };
};

const planItemView = (item) => ({
  key: item.key,
  productId: item.productId,
  variantId: item.variantId,
  name: item.name,
  variantLabel: item.variantLabel,
  barcode: item.barcode,
  category: item.category,
  cls: item.cls,
  systemQty: item.systemQty,
  unitCost: item.unitCost,
  lastCountedAt: item.lastCountedAt,
  daysSince: item.daysSince,
  onOpenCount: item.onOpenCount,
});

const getCyclePlan = async ({ organizationId, branchId }) => {
  requireBranch(branchId);
  const { policy, today, all, eligible, selected, classStats } = await buildPlan({ organizationId, branchId });
  const [todaySession, openCounts] = await Promise.all([
    StockCount.findOne({ organizationId, branchId, type: 'cycle', scheduledFor: today, status: { $ne: 'cancelled' } })
      .sort({ createdAt: -1 })
      .select('number status totals createdAt')
      .lean(),
    StockCount.countDocuments({ organizationId, branchId, status: { $in: OPEN_STATUSES } }),
  ]);
  const categories = new Map();
  all.forEach((item) =>
    item.categories.forEach((c) => {
      const entry = categories.get(c.id) || { id: c.id, name: c.name, itemCount: 0 };
      entry.itemCount += 1;
      categories.set(c.id, entry);
    })
  );
  return {
    today,
    policy: policy.toJSON(),
    categories: [...categories.values()].sort((a, b) => String(a.name).localeCompare(String(b.name))),
    classes: classStats,
    totalItems: all.length,
    eligibleItems: eligible.length,
    excludedItems: all.filter((item) => item.cls === 'exclude').length,
    todayItems: selected.map(planItemView),
    todaySession: todaySession ? { id: String(todaySession._id), number: todaySession.number, status: todaySession.status } : null,
    openCounts,
  };
};

/** Categories with how many active products each holds — a cheap query for the count dialogs' category picker. */
const getCategories = async ({ organizationId, branchId }) => {
  requireBranch(branchId);
  const rows = await Product.aggregate([
    { $match: { organizationId: oid(organizationId), branchId: oid(branchId), isActive: { $ne: false } } },
    { $unwind: '$categories' },
    { $match: { 'categories._id': { $ne: null } } },
    { $group: { _id: '$categories._id', name: { $first: '$categories.name' }, itemCount: { $sum: 1 } } },
  ]);
  return rows
    .map((r) => ({ id: String(r._id), name: r.name || '', itemCount: r.itemCount }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
};

/** Every item with its class and count history — the classification table on the plan tab. */
const getPlanItems = async ({ organizationId, branchId }) => {
  requireBranch(branchId);
  const { all, policy } = await buildPlan({ organizationId, branchId });
  const overrides = new Set((policy.overrides || []).map((o) => String(o.productId)));
  return all
    .map((item) => ({ ...planItemView(item), overridden: overrides.has(item.productId), score: round(item.score) }))
    .sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name)));
};

// ── Creating a count ────────────────────────────────────────────────────────────────

const nextNumber = async (organizationId) => {
  const last = await StockCount.findOne({ organizationId }).sort({ seq: -1 }).select('seq').lean();
  const seq = (last ? last.seq : 0) + 1;
  return { seq, number: `SC-${String(seq).padStart(4, '0')}` };
};

/** Weighted sampling without replacement (Efraimidis–Spirakis): key = u^(1/w), keep the largest. */
const weightedSample = (items, size, weightOf) =>
  items
    .map((item) => ({ item, key: Math.random() ** (1 / Math.max(weightOf(item), 1e-6)) }))
    .sort((a, b) => b.key - a.key)
    .slice(0, size)
    .map((entry) => entry.item);

const TYPE_TITLES = {
  initial: 'Initial stock count',
  cycle: 'Cycle count',
  surprise: 'Surprise audit',
  custom: 'Stock count',
};

const createCount = async ({ organizationId, branchId, createdBy, body }) => {
  requireBranch(branchId);
  const { type } = body;
  const plan = await buildPlan({ organizationId, branchId });
  const { policy, today, all } = plan;
  const openItems = new Set(all.filter((item) => item.onOpenCount).map((item) => item.key));

  let picked;
  let skippedOpen = 0;
  const notOpen = (list) => {
    const kept = list.filter((item) => !openItems.has(item.key));
    skippedOpen += list.length - kept.length;
    return kept;
  };
  const inCategories = (item) =>
    !body.categoryIds || body.categoryIds.length === 0 || item.categoryIds.some((id) => body.categoryIds.includes(id));
  const withStock = (item) => body.includeZeroStock || item.systemQty > 0 || item.kind === 'serialized';

  if (type === 'cycle') {
    const existing = await StockCount.findOne({
      organizationId,
      branchId,
      type: 'cycle',
      scheduledFor: today,
      status: { $in: OPEN_STATUSES },
    }).lean();
    if (existing) {
      throw new ApiError(httpStatus.CONFLICT, `Today's cycle count ${existing.number} is already open — finish it first`);
    }
    picked = plan.selected;
  } else if (type === 'surprise') {
    const pool = notOpen(all.filter((item) => item.cls !== 'exclude' && inCategories(item) && withStock(item)));
    const size = Math.max(1, Math.min(Number(body.sampleSize) || policy.surpriseSampleSize, 500));
    picked = weightedSample(pool, size, (item) => SURPRISE_WEIGHT[item.cls] || 1);
  } else if (type === 'initial') {
    picked = notOpen(all.filter(inCategories));
  } else {
    const classes = body.classes && body.classes.length ? new Set(body.classes) : null;
    const productIds = body.productIds && body.productIds.length ? new Set(body.productIds.map(String)) : null;
    picked = notOpen(
      all.filter(
        (item) =>
          (!classes || classes.has(item.cls)) &&
          (!productIds || productIds.has(item.productId)) &&
          inCategories(item) &&
          (productIds ? true : withStock(item))
      )
    );
  }

  if (!picked || picked.length === 0) {
    const why =
      type === 'cycle'
        ? 'Nothing is due for counting today'
        : skippedOpen > 0
          ? 'Every matching item is already on an open count'
          : 'No items match this count';
    throw new ApiError(httpStatus.BAD_REQUEST, why);
  }

  const blind = type === 'surprise' ? true : body.blind !== undefined ? Boolean(body.blind) : type === 'initial' ? false : policy.blindByDefault;

  let count;
  for (let attempt = 0; attempt < 5 && !count; attempt += 1) {
    const { seq, number } = await nextNumber(organizationId);
    try {
      count = await StockCount.create({
        organizationId,
        branchId,
        seq,
        number,
        type,
        title: (body.title && body.title.trim()) || `${TYPE_TITLES[type]} — ${today}`,
        notes: body.notes,
        blind,
        scheduledFor: type === 'cycle' ? today : undefined,
        scope: {
          classes: body.classes || [],
          categoryIds: body.categoryIds || [],
          productIds: body.productIds || [],
          sampleSize: type === 'surprise' ? picked.length : undefined,
          includeZeroStock: Boolean(body.includeZeroStock),
        },
        totals: { itemCount: picked.length },
        createdBy,
      });
    } catch (error) {
      if (!(error && error.code === 11000)) throw error;
    }
  }
  if (!count) throw new ApiError(httpStatus.CONFLICT, 'Could not number the count — please try again');

  // Walk-the-shelf order: category, then name.
  const ordered = [...picked].sort(
    (a, b) =>
      String(a.category || '~').localeCompare(String(b.category || '~')) ||
      String(a.name).localeCompare(String(b.name)) ||
      String(a.variantLabel).localeCompare(String(b.variantLabel))
  );
  await StockCountLine.insertMany(
    ordered.map((item, index) => ({
      organizationId,
      branchId,
      countId: count._id,
      productId: item.productId,
      variantId: item.variantId,
      kind: item.kind,
      hasVariants: item.hasVariants,
      trackBatch: item.trackBatch,
      name: item.name,
      variantLabel: item.variantLabel,
      nameUrdu: item.nameUrdu,
      barcode: item.barcode,
      sku: item.sku,
      unit: item.unit,
      category: item.category,
      abcClass: CLASSES.includes(item.cls) ? item.cls : null,
      sortKey: index,
      unitCost: item.unitCost,
      systemQtyAtStart: item.systemQty,
    })),
    { ordered: false }
  );

  return { count, skippedOpen };
};

// ── Reading ─────────────────────────────────────────────────────────────────────────

const findCount = async ({ organizationId, branchId, countId }) => {
  const filter = { _id: countId, organizationId };
  if (branchId) filter.branchId = branchId;
  const count = await StockCount.findOne(filter);
  if (!count) throw new ApiError(httpStatus.NOT_FOUND, 'Stock count not found');
  return count;
};

const progressOf = (lines) => {
  const counted = lines.filter((l) => l.countedQty !== null && l.countedQty !== undefined);
  return {
    itemCount: lines.length,
    countedCount: counted.length,
    recountCount: lines.filter((l) => l.recount).length,
  };
};

const summarize = (lines) => {
  const totals = {
    itemCount: lines.length,
    countedCount: 0,
    matchedCount: 0,
    varianceCount: 0,
    gainQty: 0,
    lossQty: 0,
    gainValue: 0,
    lossValue: 0,
    systemValue: 0,
  };
  lines.forEach((line) => {
    if (line.countedQty === null || line.countedQty === undefined) return;
    totals.countedCount += 1;
    const variance = Number(line.variance) || 0;
    const cost = Number(line.unitCost) || 0;
    totals.systemValue += Math.max(0, Number(line.systemQtyAtCount) || 0) * cost;
    if (variance === 0) totals.matchedCount += 1;
    else {
      totals.varianceCount += 1;
      if (variance > 0) {
        totals.gainQty += variance;
        totals.gainValue += variance * cost;
      } else {
        totals.lossQty += -variance;
        totals.lossValue += -variance * cost;
      }
    }
  });
  ['gainQty', 'lossQty'].forEach((k) => (totals[k] = roundQty(totals[k])));
  ['gainValue', 'lossValue', 'systemValue'].forEach((k) => (totals[k] = round(totals[k])));
  return totals;
};

/**
 * What a viewer may see of a line. A blind count hides everything that gives away the
 * expected quantity until it is submitted; cost is hidden from roles that can't see costs.
 */
const lineView = (line, { hideExpected, hideCost }) => {
  const view = typeof line.toJSON === 'function' ? line.toJSON() : { ...line, id: String(line._id) };
  delete view._id;
  delete view.__v;
  if (hideExpected) {
    delete view.systemQtyAtStart;
    delete view.systemQtyAtCount;
    delete view.variance;
    delete view.expectedImeis;
    delete view.missingImeis;
    view.history = (view.history || []).map((h) => ({ qty: h.qty, by: h.by, at: h.at }));
  }
  if (hideCost) {
    delete view.unitCost;
    delete view.newCost;
  }
  return view;
};

const getCount = async ({ organizationId, branchId, countId, canViewCost }) => {
  const count = await findCount({ organizationId, branchId, countId });
  const lines = await StockCountLine.find({ countId: count._id }).sort({ sortKey: 1 }).populate('countedBy', 'name').lean();
  const hideExpected = count.blind && count.status === 'counting';
  const hideCost = !canViewCost;
  const doc = await StockCount.findById(count._id)
    .populate('createdBy', 'name')
    .populate('submittedBy', 'name')
    .populate('postedBy', 'name')
    .populate('cancelledBy', 'name');
  const countView = doc.toJSON();
  countView.progress = progressOf(lines);
  if (!hideExpected) countView.liveTotals = summarize(lines);
  if (hideCost && countView.totals) {
    ['gainValue', 'lossValue', 'systemValue'].forEach((k) => delete countView.totals[k]);
    if (countView.liveTotals) ['gainValue', 'lossValue', 'systemValue'].forEach((k) => delete countView.liveTotals[k]);
  }
  return {
    count: countView,
    lines: lines.map((line) => lineView(line, { hideExpected, hideCost })),
    expectedHidden: hideExpected,
  };
};

const queryCounts = async ({ organizationId, branchId, status, type }, options) => {
  const filter = { organizationId };
  if (branchId) filter.branchId = branchId;
  if (status) filter.status = status === 'open' ? { $in: OPEN_STATUSES } : status;
  if (type) filter.type = type;
  return StockCount.paginate(filter, {
    ...options,
    sortBy: options.sortBy || 'createdAt:desc',
    populate: 'createdBy,postedBy',
  });
};

// ── Counting ────────────────────────────────────────────────────────────────────────

/** Current on-hand quantity for each line (product stock, variant inventory). */
const readOnHand = async (lines) => {
  const productIds = lines.filter((l) => l.kind === 'product').map((l) => l.productId);
  const variantIds = lines.filter((l) => l.kind === 'variant').map((l) => l.variantId);
  const [products, inventories] = await Promise.all([
    productIds.length ? Product.find({ _id: { $in: productIds } }).select('stockQuantity').lean() : [],
    variantIds.length ? Inventory.find({ variantId: { $in: variantIds } }).select('variantId quantity').lean() : [],
  ]);
  const byProduct = new Map(products.map((p) => [String(p._id), Number(p.stockQuantity) || 0]));
  const byVariant = new Map(inventories.map((i) => [String(i.variantId), Number(i.quantity) || 0]));
  return (line) => (line.kind === 'variant' ? byVariant.get(String(line.variantId)) || 0 : byProduct.get(String(line.productId)) || 0);
};

const normalizeNumbers = (numbers) => [...new Set((numbers || []).map((n) => String(n).replace(/\s+/g, '').trim()).filter(Boolean))];

/** Matches scanned IMEIs/serials against the units in stock here right now. */
const checkSerialized = async (line, scanned) => {
  const records = await Imei.find({
    organizationId: line.organizationId,
    branchId: line.branchId,
    productId: line.productId,
    status: 'in_stock',
  })
    .select('imei imei2')
    .lean();
  const scannedSet = new Set(scanned);
  const matched = records.filter((r) => scannedSet.has(r.imei) || (r.imei2 && scannedSet.has(r.imei2)));
  const known = new Set(records.flatMap((r) => [r.imei, r.imei2].filter(Boolean)));
  return {
    systemQty: records.length,
    countedQty: matched.length,
    expectedImeis: records.map((r) => r.imei),
    missingImeis: records.filter((r) => !matched.includes(r)).map((r) => r.imei),
    unexpectedImeis: scanned.filter((n) => !known.has(n)),
  };
};

/**
 * Records counts. Each entry targets one line and either sets the quantity (`qty`), adds
 * to it (`addQty` — scanning item by item, or a second person counting the back room),
 * replaces the scanned units (`imeis`), clears it (`clear`), or only edits reason/note/cost.
 */
const recordCounts = async ({ organizationId, branchId, countId, entries, userId, canApprove, canViewCost }) => {
  const count = await findCount({ organizationId, branchId, countId });
  const editable = count.status === 'counting' || (count.status === 'review' && canApprove);
  if (!editable) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      count.status === 'review' ? 'This count was submitted — only a manager can change it now' : `This count is ${count.status}`
    );
  }

  const lineIds = [...new Set(entries.map((e) => String(e.lineId)))];
  const lines = await StockCountLine.find({ _id: { $in: lineIds }, countId: count._id });
  if (lines.length !== lineIds.length) throw new ApiError(httpStatus.BAD_REQUEST, 'Some items are not on this count');
  const byId = new Map(lines.map((l) => [String(l._id), l]));
  const onHand = await readOnHand(lines);
  const now = new Date();

  for (const entry of entries) {
    const line = byId.get(String(entry.lineId));
    const hadCount = line.countedQty !== null && line.countedQty !== undefined;
    const remember = () => {
      if (hadCount) line.history.push({ qty: line.countedQty, systemQty: line.systemQtyAtCount, by: line.countedBy, at: line.countedAt });
    };

    if (entry.clear) {
      remember();
      Object.assign(line, {
        countedQty: null,
        systemQtyAtCount: null,
        variance: null,
        countedAt: undefined,
        countedBy: undefined,
        scannedImeis: [],
        missingImeis: [],
        unexpectedImeis: [],
        expectedImeis: [],
      });
    } else if (line.kind === 'serialized' && entry.imeis !== undefined) {
      const scanned = normalizeNumbers(entry.imeis);
      const result = await checkSerialized(line, scanned);
      remember();
      Object.assign(line, {
        scannedImeis: scanned,
        expectedImeis: result.expectedImeis,
        missingImeis: result.missingImeis,
        unexpectedImeis: result.unexpectedImeis,
        countedQty: result.countedQty,
        systemQtyAtCount: result.systemQty,
        variance: result.countedQty - result.systemQty,
        countedAt: now,
        countedBy: userId,
        recount: false,
      });
    } else if (entry.qty !== undefined || entry.addQty !== undefined) {
      if (line.kind === 'serialized') {
        throw new ApiError(httpStatus.BAD_REQUEST, `${line.name} is counted by scanning each unit's IMEI / serial number`);
      }
      const qty = roundQty(entry.qty !== undefined ? entry.qty : (hadCount ? line.countedQty : 0) + entry.addQty);
      if (!(qty >= 0)) throw new ApiError(httpStatus.BAD_REQUEST, 'A counted quantity cannot be negative');
      const system = roundQty(onHand(line));
      remember();
      Object.assign(line, {
        countedQty: qty,
        systemQtyAtCount: system,
        variance: roundQty(qty - system),
        countedAt: now,
        countedBy: userId,
        recount: false,
      });
    }

    if (entry.reason !== undefined) line.reason = entry.reason || null;
    if (entry.note !== undefined) line.note = entry.note;
    if (entry.newCost !== undefined && canViewCost) {
      if (count.type !== 'initial') throw new ApiError(httpStatus.BAD_REQUEST, 'Costs can only be set on an initial stock count');
      line.newCost = entry.newCost === null ? undefined : entry.newCost;
    }
  }

  await Promise.all(lines.map((line) => line.save()));
  const hideExpected = count.blind && count.status === 'counting';
  const populated = await StockCountLine.find({ _id: { $in: lineIds } }).populate('countedBy', 'name').lean();
  return populated.map((line) => lineView(line, { hideExpected, hideCost: !canViewCost }));
};

/** Adds catalog items to a count still being counted — something found on the shelf that the list missed. */
const addLines = async ({ organizationId, branchId, countId, itemKeys }) => {
  const count = await findCount({ organizationId, branchId, countId });
  if (count.status !== 'counting') throw new ApiError(httpStatus.BAD_REQUEST, 'Items can only be added while counting');
  const policy = await getPolicy({ organizationId, branchId: count.branchId });
  const [items, classes, openItems, last] = await Promise.all([
    loadItems({ organizationId, branchId: count.branchId }),
    classifyProducts({ organizationId, branchId: count.branchId, policy }),
    loadOpenItems({ organizationId, branchId: count.branchId }),
    StockCountLine.findOne({ countId: count._id }).sort({ sortKey: -1 }).select('sortKey').lean(),
  ]);
  const wanted = new Set(itemKeys);
  const picked = withClasses(items, classes).filter((item) => wanted.has(item.key));
  const fresh = picked.filter((item) => !openItems.has(item.key));
  if (fresh.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, picked.length ? 'Already on this or another open count' : 'Item not found in this branch');
  }
  let sortKey = last ? last.sortKey : 0;
  const created = await StockCountLine.insertMany(
    fresh.map((item) => ({
      organizationId,
      branchId: count.branchId,
      countId: count._id,
      productId: item.productId,
      variantId: item.variantId,
      kind: item.kind,
      hasVariants: item.hasVariants,
      trackBatch: item.trackBatch,
      name: item.name,
      variantLabel: item.variantLabel,
      nameUrdu: item.nameUrdu,
      barcode: item.barcode,
      sku: item.sku,
      unit: item.unit,
      category: item.category,
      abcClass: CLASSES.includes(item.cls) ? item.cls : null,
      sortKey: (sortKey += 1),
      unitCost: item.unitCost,
      systemQtyAtStart: item.systemQty,
    }))
  );
  await StockCount.updateOne({ _id: count._id }, { $inc: { 'totals.itemCount': created.length } });
  return created.length;
};

// ── Workflow ────────────────────────────────────────────────────────────────────────

const submitCount = async ({ organizationId, branchId, countId, userId }) => {
  const count = await findCount({ organizationId, branchId, countId });
  if (count.status !== 'counting') throw new ApiError(httpStatus.BAD_REQUEST, `This count is ${count.status}`);
  const lines = await StockCountLine.find({ countId: count._id }).lean();
  const totals = summarize(lines);
  if (totals.countedCount === 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Count at least one item before submitting');
  count.status = 'review';
  count.totals = { ...count.totals.toObject?.(), ...totals };
  count.submittedBy = userId;
  count.submittedAt = new Date();
  await count.save();
  return count;
};

/** Sends lines (or the whole count) back to the floor. */
const requestRecount = async ({ organizationId, branchId, countId, lineIds }) => {
  const count = await findCount({ organizationId, branchId, countId });
  if (count.status !== 'review' && count.status !== 'counting') throw new ApiError(httpStatus.BAD_REQUEST, `This count is ${count.status}`);
  if (lineIds && lineIds.length) {
    await StockCountLine.updateMany({ countId: count._id, _id: { $in: lineIds } }, { $set: { recount: true } });
  }
  count.status = 'counting';
  await count.save();
  return count;
};

const cancelCount = async ({ organizationId, branchId, countId, userId, reason }) => {
  const count = await findCount({ organizationId, branchId, countId });
  if (!['counting', 'review'].includes(count.status)) throw new ApiError(httpStatus.BAD_REQUEST, `A ${count.status} count can't be cancelled`);
  count.status = 'cancelled';
  count.cancelledBy = userId;
  count.cancelledAt = new Date();
  count.cancelReason = reason;
  await count.save();
  return count;
};

const adjustmentReason = (count, line) =>
  [`Stock count ${count.number}`, line.reason ? REASON_LABELS[line.reason] : null].filter(Boolean).join(' — ');

/**
 * Applies one line's variance. Decreases never take stock below zero (a sale between the
 * count and posting may already have taken some of it); batch-tracked items lose stock
 * earliest-expiry first and gain it on the newest batch.
 */
const applyLine = async ({ count, line, delta, userId }) => {
  const base = {
    organizationId: count.organizationId,
    branchId: count.branchId,
    productId: line.productId,
    type: 'count',
    reason: adjustmentReason(count, line),
    notes: line.note || undefined,
    stockCountId: count._id,
    createdBy: userId,
  };
  const adjustmentIds = [];
  const notes = [];

  if (line.kind === 'serialized') {
    if (delta >= 0) return { adjustmentIds, applied: 0, notes };
    if (line.hasVariants) {
      return { adjustmentIds, applied: 0, notes: ['Product has variants — remove the missing units in Stock Adjustments (pick the variant)'] };
    }
    const stillInStock = await Imei.find({
      organizationId: count.organizationId,
      branchId: count.branchId,
      productId: line.productId,
      status: 'in_stock',
      ...matchesEitherImei(line.missingImeis),
    })
      .select('imei')
      .lean();
    if (stillInStock.length === 0) return { adjustmentIds, applied: 0, notes: ['Missing units were already sold or moved'] };
    const adj = await stockAdjustmentService.createAdjustment({ ...base, direction: 'decrease', imeis: stillInStock.map((r) => r.imei) });
    if (stillInStock.length < line.missingImeis.length) notes.push(`${line.missingImeis.length - stillInStock.length} missing unit(s) were sold or moved before posting`);
    return { adjustmentIds: [adj._id], applied: -stillInStock.length, notes };
  }

  const direction = delta > 0 ? 'increase' : 'decrease';
  let remaining = Math.abs(delta);
  let startRemaining = remaining;

  if (line.kind === 'variant') {
    const inventory = await Inventory.findOne({ variantId: line.variantId }).lean();
    let available = inventory ? Number(inventory.quantity) || 0 : 0;
    if (direction === 'decrease' && remaining > available) {
      notes.push(`Only ${available} on hand at posting — reduced by ${Math.max(0, available)}`);
      remaining = Math.max(0, available);
      startRemaining = remaining;
    }
    if (line.trackBatch && inventory && remaining > 0) {
      const batches = await Batch.find({ inventoryId: inventory._id, status: 'active' }).sort({ expiryDate: 1, createdAt: 1 }).lean();
      if (direction === 'decrease') {
        for (const batch of batches) {
          if (remaining <= 0) break;
          const take = roundQty(Math.min(remaining, Number(batch.quantity) || 0));
          if (take <= 0) continue;
          const adj = await stockAdjustmentService.createAdjustment({ ...base, variantId: line.variantId, batchId: batch._id, direction, quantity: take });
          adjustmentIds.push(adj._id);
          remaining = roundQty(remaining - take);
          available = roundQty(available - take);
        }
      } else if (batches.length) {
        const newest = batches[batches.length - 1];
        const adj = await stockAdjustmentService.createAdjustment({ ...base, variantId: line.variantId, batchId: newest._id, direction, quantity: remaining });
        adjustmentIds.push(adj._id);
        notes.push(`Added to batch ${newest.batchNumber}`);
        remaining = 0;
      }
    }
    if (remaining > 0) {
      const adj = await stockAdjustmentService.createAdjustment({ ...base, variantId: line.variantId, direction, quantity: roundQty(remaining) });
      adjustmentIds.push(adj._id);
      remaining = 0;
    }
  } else {
    const product = await Product.findById(line.productId).select('stockQuantity').lean();
    const available = product ? Number(product.stockQuantity) || 0 : 0;
    if (direction === 'decrease' && remaining > available) {
      notes.push(`Only ${available} on hand at posting — reduced by ${Math.max(0, available)}`);
      remaining = Math.max(0, available);
      startRemaining = remaining;
    }
    if (remaining > 0) {
      const adj = await stockAdjustmentService.createAdjustment({ ...base, direction, quantity: roundQty(remaining) });
      adjustmentIds.push(adj._id);
      remaining = 0;
    }
  }
  const appliedAbs = roundQty(startRemaining - remaining);
  return { adjustmentIds, applied: direction === 'decrease' ? -appliedAbs : appliedAbs, notes };
};

/** An initial count may record the cost of items that had none, so the opening stock has a value. */
const applyNewCost = async (line) => {
  if (!(line.newCost > 0)) return;
  if (line.variantId) {
    await ProductVariant.updateOne({ _id: line.variantId }, { $set: { cost: line.newCost } });
    const variant = await ProductVariant.findById(line.variantId).select('isDefault').lean();
    if (variant && variant.isDefault) await Product.updateOne({ _id: line.productId }, { $set: { cost: line.newCost } });
  } else {
    await Product.updateOne({ _id: line.productId }, { $set: { cost: line.newCost } });
  }
  line.unitCost = line.newCost;
};

/**
 * Posts a reviewed count: every counted line's variance becomes a 'count' stock adjustment
 * (with its normal stock ledger entry), and the items are recorded as counted today.
 * Claiming status 'posting' first means a double click or a second manager can't post twice;
 * lines already posted are skipped, so a post interrupted half-way can simply be retried.
 */
const postCount = async ({ organizationId, branchId, countId, userId, uncountedPolicy }) => {
  const existing = await findCount({ organizationId, branchId, countId });
  const claimed = await StockCount.findOneAndUpdate(
    { _id: existing._id, status: { $in: ['review', 'posting'] } },
    { $set: { status: 'posting', ...(uncountedPolicy ? { uncountedPolicy } : {}) } },
    { new: true }
  );
  if (!claimed) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      existing.status === 'counting' ? 'Submit the count for review before posting it' : `This count is ${existing.status}`
    );
  }
  const count = claimed;
  const zeroUncounted = count.type === 'initial' && count.uncountedPolicy === 'zero';
  const lines = await StockCountLine.find({ countId: count._id, postedAt: null }).sort({ sortKey: 1 });
  const warnings = [...(count.postWarnings || [])];

  if (zeroUncounted) {
    const uncounted = lines.filter((l) => l.countedQty === null || l.countedQty === undefined);
    const onHand = await readOnHand(uncounted.filter((l) => l.kind !== 'serialized'));
    for (const line of uncounted) {
      if (line.kind === 'serialized') {
        const result = await checkSerialized(line, []);
        Object.assign(line, { ...result, countedQty: 0, variance: -result.systemQty, scannedImeis: [] });
      } else {
        const system = roundQty(onHand(line));
        Object.assign(line, { countedQty: 0, systemQtyAtCount: system, variance: -system });
      }
      line.countedAt = new Date();
      line.countedBy = userId;
      line.note = line.note || 'Not counted — set to zero';
    }
  }

  for (const line of lines) {
    if (line.countedQty === null || line.countedQty === undefined) continue;
    try {
      if (count.type === 'initial') await applyNewCost(line);
      const variance = roundQty(line.variance);
      if (variance !== 0) {
        const result = await applyLine({ count, line, delta: variance, userId });
        line.adjustmentIds = result.adjustmentIds;
        line.appliedDelta = result.applied;
        if (line.kind === 'serialized' && line.unexpectedImeis && line.unexpectedImeis.length) {
          result.notes.push(`${line.unexpectedImeis.length} scanned unit(s) not in this branch's stock — receive or transfer them in`);
        }
        line.postNote = result.notes.join('; ') || undefined;
        if (result.notes.length && (line.kind === 'serialized' || line.appliedDelta !== variance)) {
          warnings.push(`${line.name}${line.variantLabel ? ` (${line.variantLabel})` : ''}: ${result.notes.join('; ')}`);
        }
      } else {
        line.appliedDelta = 0;
        if (line.kind === 'serialized' && line.unexpectedImeis && line.unexpectedImeis.length) {
          line.postNote = `${line.unexpectedImeis.length} scanned unit(s) not in this branch's stock`;
          warnings.push(`${line.name}: ${line.postNote}`);
        }
      }
      line.postedAt = new Date();
      await line.save();
    } catch (error) {
      line.postNote = `Not posted: ${error.message}`;
      await line.save();
      warnings.push(`${line.name}${line.variantLabel ? ` (${line.variantLabel})` : ''}: ${error.message}`);
    }
  }

  const allLines = await StockCountLine.find({ countId: count._id }).lean();
  const failed = allLines.filter((l) => l.countedQty !== null && l.countedQty !== undefined && !l.postedAt);
  const totals = summarize(allLines);
  totals.adjustmentCount = allLines.reduce((sum, l) => sum + (l.adjustmentIds ? l.adjustmentIds.length : 0), 0);
  count.totals = totals;
  count.postWarnings = [...new Set(warnings)].slice(0, 200);
  if (failed.length === 0) {
    count.status = 'posted';
    count.postedBy = userId;
    count.postedAt = new Date();
  }
  await count.save();
  return { count, failed: failed.length };
};

// ── Reports ─────────────────────────────────────────────────────────────────────────

/**
 * Counting performance over a date range (by posting date): inventory record accuracy
 * (share of counted items whose record was exactly right), gross and net variance value,
 * a per-class breakdown, the reasons given, the items that keep coming up short, and a
 * week-by-week trend.
 */
const getReports = async ({ organizationId, branchId, startDate, endDate, canViewCost }) => {
  requireBranch(branchId);
  const endKey = endDate || todayKey();
  const startKey = startDate || shiftKey(endKey, -89);
  const start = parseBusinessDateBoundary(startKey, false);
  const end = parseBusinessDateBoundary(endKey, true);

  const [counts, lines] = await Promise.all([
    StockCount.find({ organizationId, branchId, status: 'posted', postedAt: { $gte: start, $lte: end } })
      .select('number type title postedAt totals blind')
      .sort({ postedAt: -1 })
      .lean(),
    StockCountLine.find({
      organizationId,
      branchId,
      postedAt: { $gte: start, $lte: end },
      countedQty: { $ne: null },
    })
      .select('productId variantId name variantLabel abcClass variance unitCost reason postedAt countId systemQtyAtCount')
      .lean(),
  ]);

  const valueOf = (line) => (Number(line.variance) || 0) * (Number(line.unitCost) || 0);
  const blank = () => ({ counted: 0, matched: 0, gainValue: 0, lossValue: 0, systemValue: 0 });
  const add = (bucket, line) => {
    bucket.counted += 1;
    if (!line.variance) bucket.matched += 1;
    const value = valueOf(line);
    if (value > 0) bucket.gainValue += value;
    if (value < 0) bucket.lossValue += -value;
    bucket.systemValue += Math.max(0, Number(line.systemQtyAtCount) || 0) * (Number(line.unitCost) || 0);
  };
  const finish = (bucket) => ({
    counted: bucket.counted,
    matched: bucket.matched,
    accuracyPct: bucket.counted ? round((bucket.matched / bucket.counted) * 100, 1) : null,
    gainValue: round(bucket.gainValue),
    lossValue: round(bucket.lossValue),
    netValue: round(bucket.gainValue - bucket.lossValue),
    // Value accuracy: 1 − |gross variance| / system value counted.
    valueAccuracyPct: bucket.systemValue > 0 ? round(Math.max(0, 1 - (bucket.gainValue + bucket.lossValue) / bucket.systemValue) * 100, 1) : null,
  });

  const overall = blank();
  const byClass = { A: blank(), B: blank(), C: blank() };
  const byReason = new Map();
  const byItem = new Map();
  const byWeek = new Map();
  lines.forEach((line) => {
    add(overall, line);
    if (byClass[line.abcClass]) add(byClass[line.abcClass], line);
    if (line.variance) {
      const reason = line.reason || 'unexplained';
      const r = byReason.get(reason) || { reason, lines: 0, value: 0 };
      r.lines += 1;
      r.value += valueOf(line);
      byReason.set(reason, r);

      const key = itemKey(line.productId, line.variantId);
      const item = byItem.get(key) || {
        productId: String(line.productId),
        name: line.name,
        variantLabel: line.variantLabel || '',
        abcClass: line.abcClass,
        times: 0,
        netQty: 0,
        netValue: 0,
      };
      item.times += 1;
      item.netQty = roundQty(item.netQty + line.variance);
      item.netValue += valueOf(line);
      byItem.set(key, item);
    }
    // Weeks start on Monday (business calendar).
    const dayKey = toBusinessCalendarDate(line.postedAt);
    const weekday = (new Date(`${dayKey}T00:00:00Z`).getUTCDay() + 6) % 7;
    const weekKey = shiftKey(dayKey, -weekday);
    const week = byWeek.get(weekKey) || blank();
    add(week, line);
    byWeek.set(weekKey, week);
  });

  const stripValue = (row) => {
    if (canViewCost) return row;
    const copy = { ...row };
    ['gainValue', 'lossValue', 'netValue', 'value', 'valueAccuracyPct'].forEach((k) => delete copy[k]);
    return copy;
  };

  return {
    startDate: startKey,
    endDate: endKey,
    overall: stripValue(finish(overall)),
    byClass: Object.fromEntries(CLASSES.map((cls) => [cls, stripValue(finish(byClass[cls]))])),
    reasons: [...byReason.values()].map((r) => stripValue({ ...r, value: round(r.value) })).sort((a, b) => b.lines - a.lines),
    problemItems: [...byItem.values()]
      .map((item) => stripValue({ ...item, netValue: round(item.netValue) }))
      .sort((a, b) => (canViewCost ? a.netValue - b.netValue : a.netQty - b.netQty) || b.times - a.times)
      .slice(0, 25),
    weeks: [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([week, bucket]) => stripValue({ week, ...finish(bucket) })),
    counts: counts.map((c) => ({
      id: String(c._id),
      number: c.number,
      type: c.type,
      title: c.title,
      postedAt: c.postedAt,
      blind: c.blind,
      totals: canViewCost ? c.totals : { ...c.totals, gainValue: undefined, lossValue: undefined, systemValue: undefined },
    })),
  };
};

/** Posted counts of one product — the product page's count history. */
const getProductHistory = async ({ organizationId, branchId, productId }) => {
  const filter = { organizationId, productId, postedAt: { $ne: null }, countedQty: { $ne: null } };
  if (branchId) filter.branchId = branchId;
  const lines = await StockCountLine.find(filter)
    .sort({ postedAt: -1 })
    .limit(50)
    .populate('countId', 'number type')
    .populate('countedBy', 'name')
    .lean();
  return lines.map((line) => ({
    id: String(line._id),
    countId: line.countId ? String(line.countId._id) : null,
    countNumber: line.countId ? line.countId.number : '',
    countType: line.countId ? line.countId.type : '',
    variantLabel: line.variantLabel || '',
    countedQty: line.countedQty,
    systemQty: line.systemQtyAtCount,
    variance: line.variance,
    reason: line.reason,
    countedAt: line.countedAt,
    countedBy: line.countedBy ? line.countedBy.name : '',
    postedAt: line.postedAt,
  }));
};

module.exports = {
  REASON_LABELS,
  getPolicy,
  updatePolicy,
  setOverride,
  getCyclePlan,
  getPlanItems,
  getCategories,
  createCount,
  getCount,
  queryCounts,
  recordCounts,
  addLines,
  submitCount,
  requestRecount,
  cancelCount,
  postCount,
  getReports,
  getProductHistory,
};
