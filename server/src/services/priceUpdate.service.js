const httpStatus = require('http-status');
const {
  Product,
  ProductVariant,
  Inventory,
  PriceUpdateBatch,
  PriceChange,
  PriceListAlias,
} = require('../models');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { escapeRegex } = require('../utils/productMatchKey');
const { parsePriceList } = require('../utils/priceListParser');
const { buildCatalogIndex, matchRow, aliasKey } = require('../utils/priceMatcher');

/**
 * Price Update Center — turns a supplier's price list (WhatsApp text, PDF text, spreadsheet rows)
 * into reviewed, reversible price changes.
 *
 *   analyze()      list text/rows  → parsed lines, each matched to a product (never writes)
 *   applyBatch()   reviewed lines  → Product/ProductVariant cost & price + PriceChange history
 *   rollbackBatch()                → restores what applyBatch changed, where still safe
 *   searchCatalog() / listBatches() / getBatch() / getProductHistory() / aliases
 *
 * Where a price lives (see docs/architecture/universal-product-migration.md): a simple product
 * keeps cost/price on the Product; a product with real variants (hasVariants) keeps them on each
 * ProductVariant and its own price/cost are only display fallbacks. A purchase never touches
 * variant prices, so a price update is the only automated way they change — and for a variant
 * product the legacy Product fields must NOT be written (applyBatch refuses).
 */

const TOLERANCE = 0.005;
const APPLY_CHUNK = 25;
const MAX_APPLY_ITEMS = 5000;
const MAX_SOURCE_TEXT = 200000;

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const sameMoney = (a, b) => Math.abs(Number(a) - Number(b)) < TOLERANCE;
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const toIdString = (id) => (id ? String(id) : null); // '' and null both mean "no id"
const entryId = (productId, variantId) => (variantId ? `${productId}:${variantId}` : String(productId));

// ─── Catalog ─────────────────────────────────────────────────────────────────

const PRODUCT_FIELDS = 'name nameUrdu barcode sku price cost stockQuantity unit hasVariants isActive categories image';

const variantLabelOf = (variant) => {
  const attrs = variant.attributes instanceof Map ? Object.fromEntries(variant.attributes) : variant.attributes || {};
  return Object.values(attrs)
    .filter(Boolean)
    .join(' / ');
};

/**
 * Flattens products into sellable "catalog entries": one per simple product, one per REAL
 * variant of a variant product (the hidden default variant is not a separate item). Everything
 * the review screen needs — current cost/price/stock — is on the entry, so it never has to
 * fetch a product a second time.
 */
const materializeEntries = async (products, scope) => {
  const variantProductIds = products.filter((p) => p.hasVariants).map((p) => p._id);
  const variants = variantProductIds.length
    ? await ProductVariant.find({ ...scope, productId: { $in: variantProductIds }, isDefault: { $ne: true } })
        .select('productId sku barcode price cost unit attributes isActive image')
        .lean()
    : [];
  const inventory = variants.length
    ? await Inventory.find({ ...scope, variantId: { $in: variants.map((v) => v._id) } })
        .select('variantId quantity')
        .lean()
    : [];
  const stockByVariant = new Map(inventory.map((row) => [String(row.variantId), Number(row.quantity) || 0]));
  const variantsByProduct = new Map();
  variants.forEach((v) => {
    const key = String(v.productId);
    if (!variantsByProduct.has(key)) variantsByProduct.set(key, []);
    variantsByProduct.get(key).push(v);
  });

  const entries = [];
  products.forEach((p) => {
    const category = Array.isArray(p.categories) && p.categories.length ? p.categories[0].name : '';
    if (!p.hasVariants) {
      entries.push({
        id: entryId(p._id, null),
        productId: String(p._id),
        variantId: null,
        name: p.name,
        nameUrdu: p.nameUrdu || '',
        barcode: p.barcode || '',
        sku: p.sku || '',
        cost: Number(p.cost) || 0,
        price: Number(p.price) || 0,
        stock: Number(p.stockQuantity) || 0,
        unit: p.unit || '',
        category,
        isActive: p.isActive !== false,
        variantLabel: '',
        imageUrl: p.image?.url || null,
      });
      return;
    }
    (variantsByProduct.get(String(p._id)) || []).forEach((v) => {
      const label = variantLabelOf(v);
      entries.push({
        id: entryId(p._id, v._id),
        productId: String(p._id),
        variantId: String(v._id),
        name: label ? `${p.name} ${label}` : p.name,
        nameUrdu: p.nameUrdu || '',
        barcode: v.barcode || '',
        sku: v.sku || '',
        cost: Number(v.cost) || 0,
        price: Number(v.price) || 0,
        stock: stockByVariant.get(String(v._id)) || 0,
        unit: v.unit || p.unit || '',
        category,
        isActive: p.isActive !== false && v.isActive !== false,
        variantLabel: label,
        imageUrl: v.image?.url || p.image?.url || null,
      });
    });
  });
  return entries;
};

const buildCatalog = async (scope) => {
  const products = await Product.find(scope).select(PRODUCT_FIELDS).lean();
  return materializeEntries(products, scope);
};

// ─── Aliases ─────────────────────────────────────────────────────────────────

const loadAliasMap = async ({ organizationId, branchId, supplierId }) => {
  const docs = await PriceListAlias.find({
    organizationId,
    branchId,
    supplierId: { $in: supplierId ? [supplierId, null] : [null] },
  }).lean();
  const map = new Map();
  // "Any list" aliases first so a supplier-specific alias for the same text wins.
  docs.filter((d) => !d.supplierId).forEach((d) => map.set(d.aliasKey, d));
  docs.filter((d) => d.supplierId).forEach((d) => map.set(d.aliasKey, d));
  return map;
};

// ─── Analyze ─────────────────────────────────────────────────────────────────

/** Structured rows (spreadsheet columns, AI extraction) → the parser's row shape. */
const normalizeStructuredRows = (rows) => {
  const out = [];
  const ignored = [];
  rows.forEach((row, i) => {
    const name = String((row && row.name) || '').trim();
    const values = (Array.isArray(row && row.values) ? row.values : [])
      .map((v) => ({ value: round2(v && v.value), kind: v && (v.kind === 'cost' || v.kind === 'price') ? v.kind : null, raw: String(v && v.value) }))
      .filter((v) => isNum(v.value) && v.value > 0);
    const line = row && row.line ? Number(row.line) : i + 1;
    if (!name) {
      ignored.push({ line, raw: String((row && row.raw) || ''), reason: 'no_name' });
      return;
    }
    if (!values.length) {
      ignored.push({ line, raw: name, reason: 'no_price' });
      return;
    }
    out.push({
      line,
      raw: String((row && row.raw) || name),
      name,
      section: row && row.section ? String(row.section) : null,
      values,
      codes: row && row.code ? [String(row.code)] : [],
      note: '',
      warnings: [],
    });
  });
  return { rows: out, ignored, columnKinds: null, stats: { lines: rows.length, parsed: out.length, ignored: ignored.length, truncated: false } };
};

/**
 * Parses a price list and matches every line to a product. Read-only: nothing is written until
 * the user reviews the result and calls applyBatch.
 */
const analyze = async ({ organizationId, branchId, supplierId, text, rows }) => {
  let parsed;
  if (typeof text === 'string' && text.trim()) parsed = parsePriceList(text);
  else if (Array.isArray(rows) && rows.length) parsed = normalizeStructuredRows(rows);
  else throw new ApiError(httpStatus.BAD_REQUEST, 'Paste a price list or upload a file first');

  const scope = { organizationId, branchId };
  const [catalog, aliasMap] = await Promise.all([buildCatalog(scope), loadAliasMap({ organizationId, branchId, supplierId })]);
  const index = buildCatalogIndex(catalog);
  const byId = new Map(catalog.map((e) => [e.id, e]));

  const results = parsed.rows.map((row, i) => {
    let match = null;
    const alias = aliasMap.get(aliasKey(row.name));
    if (alias) {
      const entry = byId.get(entryId(alias.productId, alias.variantId));
      if (entry) match = { status: 'high', method: 'alias', score: 1, flags: [], entry, alternatives: [] };
    }
    if (!match) match = matchRow(index, { name: row.name, section: row.section, codes: row.codes });
    return { index: i, ...row, match };
  });

  const counts = { high: 0, review: 0, none: 0 };
  results.forEach((r) => {
    counts[r.match.status] += 1;
  });

  return {
    rows: results,
    ignored: parsed.ignored,
    columnKinds: parsed.columnKinds,
    stats: { ...parsed.stats, matched: counts.high, review: counts.review, unmatched: counts.none, catalogSize: catalog.length },
  };
};

/** Live search for the "change match" picker on the review screen. */
const searchCatalog = async ({ organizationId, branchId, q, limit = 12 }) => {
  const words = String(q || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
  if (!words.length) return [];
  const scope = { organizationId, branchId };
  const matchers = words.map((w) => {
    const rx = new RegExp(escapeRegex(w), 'i');
    return { $or: [{ name: rx }, { nameUrdu: rx }, { barcode: rx }, { sku: rx }] };
  });

  const products = await Product.find({ ...scope, $and: matchers }).select(PRODUCT_FIELDS).limit(limit).lean();
  // A variant's own SKU/barcode also finds its parent product.
  const fullText = words.join(' ');
  const variantHits = await ProductVariant.find({
    ...scope,
    $or: [{ sku: new RegExp(escapeRegex(fullText), 'i') }, { barcode: new RegExp(escapeRegex(fullText), 'i') }],
  })
    .select('productId')
    .limit(limit)
    .lean();
  const known = new Set(products.map((p) => String(p._id)));
  const extraIds = variantHits.map((v) => String(v.productId)).filter((id) => !known.has(id));
  const extra = extraIds.length ? await Product.find({ ...scope, _id: { $in: extraIds } }).select(PRODUCT_FIELDS).lean() : [];

  return (await materializeEntries([...products, ...extra], scope)).slice(0, limit * 3);
};

// ─── Apply ───────────────────────────────────────────────────────────────────

const nextBatchNumber = async (organizationId) => {
  const last = await PriceUpdateBatch.findOne({ organizationId }).sort({ batchNumber: -1 }).select('batchNumber').lean();
  return (last ? last.batchNumber : 0) + 1;
};

const createBatchDoc = async (fields) => {
  // Two applies racing for the same number is possible (unique index below); retry with the next.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const batchNumber = await nextBatchNumber(fields.organizationId);
      // eslint-disable-next-line no-await-in-loop
      return await PriceUpdateBatch.create({ ...fields, batchNumber });
    } catch (err) {
      if (!(err && err.code === 11000) || attempt === 4) throw err;
    }
  }
  return null;
};

/**
 * Validates the caller's items and collapses repeats of the same target (last one wins) —
 * a list can legitimately mention one product twice, but two guarded writes to the same
 * document in one batch would just make the second look "stale".
 */
const normalizeApplyItems = (items) => {
  const byTarget = new Map();
  const dropped = [];
  items.forEach((raw, index) => {
    const productId = toIdString(raw.productId);
    const variantId = toIdString(raw.variantId);
    const key = `${productId}:${variantId || ''}`;
    if (byTarget.has(key)) dropped.push({ ...byTarget.get(key).item, status: 'failed', message: 'Duplicate line for the same product — the last one was used' });
    byTarget.set(key, {
      index,
      item: {
        index,
        productId,
        variantId,
        newCost: isNum(raw.newCost) ? round2(raw.newCost) : undefined,
        newPrice: isNum(raw.newPrice) ? round2(raw.newPrice) : undefined,
        expectedOldCost: isNum(raw.expectedOldCost) ? raw.expectedOldCost : undefined,
        expectedOldPrice: isNum(raw.expectedOldPrice) ? raw.expectedOldPrice : undefined,
        sourceLine: raw.sourceLine ? String(raw.sourceLine).slice(0, 500) : undefined,
        listName: raw.listName ? String(raw.listName).slice(0, 300) : undefined,
        matchMethod: ['code', 'exact', 'name', 'alias', 'manual'].includes(raw.matchMethod) ? raw.matchMethod : 'name',
        matchScore: isNum(raw.matchScore) ? raw.matchScore : undefined,
      },
    });
  });
  return { items: [...byTarget.values()].map((v) => v.item), dropped };
};

const percentChange = (from, to) => (from > 0 ? ((to - from) / from) * 100 : null);

/**
 * Applies reviewed changes. The steps are ordered so a crash at any point leaves a truthful record:
 *   1. Header (status 'applying') and one PriceChange per item — 'pending' for the ones to write.
 *   2. Guarded writes: each product update filters on the value we read (cost/price), so if
 *      anything changed the product in the meantime (a purchase, another user) it simply
 *      doesn't match and that item is reported 'stale' instead of being overwritten.
 *   3. Statuses flipped to applied/stale, aliases learned, header finalized.
 * No multi-document transaction: standalone MongoDB (dev/tests) doesn't support them, and the
 * per-document guard is what actually protects each product anyway.
 */
const applyBatch = async ({ organizationId, branchId, userId, items, meta = {} }) => {
  if (!Array.isArray(items) || !items.length) throw new ApiError(httpStatus.BAD_REQUEST, 'Nothing to update');
  if (items.length > MAX_APPLY_ITEMS) throw new ApiError(httpStatus.BAD_REQUEST, `Too many items — at most ${MAX_APPLY_ITEMS} per update`);

  const scope = { organizationId, branchId };
  const { items: cleaned, dropped } = normalizeApplyItems(items);

  const productIds = [...new Set(cleaned.map((i) => i.productId))];
  const variantIds = [...new Set(cleaned.filter((i) => i.variantId).map((i) => i.variantId))];
  const [products, variants] = await Promise.all([
    Product.find({ ...scope, _id: { $in: productIds } }).select('name barcode sku cost price hasVariants').lean(),
    variantIds.length
      ? ProductVariant.find({ ...scope, _id: { $in: variantIds } }).select('productId sku barcode cost price attributes').lean()
      : [],
  ]);
  const productMap = new Map(products.map((p) => [String(p._id), p]));
  const variantMap = new Map(variants.map((v) => [String(v._id), v]));

  const batch = await createBatchDoc({
    organizationId,
    branchId,
    source: {
      type: meta.sourceType || 'text',
      fileName: meta.fileName,
      supplierId: meta.supplierId || null,
      supplierName: meta.supplierName,
    },
    priceMode: meta.priceMode || 'cost',
    rule: meta.rule || null,
    note: meta.note,
    sourceText: meta.sourceText ? String(meta.sourceText).slice(0, MAX_SOURCE_TEXT) : undefined,
    status: 'applying',
    appliedBy: userId,
    appliedAt: new Date(),
    stats: { requested: items.length },
  });

  // Plan every item: what to write, or why not.
  const plan = cleaned.map((item) => {
    const product = productMap.get(item.productId);
    const variant = item.variantId ? variantMap.get(item.variantId) : null;
    const base = { item, product, variant, status: 'pending', message: undefined };

    if (!product) return { ...base, status: 'failed', message: 'Product not found in this branch' };
    if (item.variantId && (!variant || String(variant.productId) !== item.productId)) {
      return { ...base, status: 'failed', message: 'Variant not found for this product' };
    }
    if (!item.variantId && product.hasVariants) {
      return { ...base, status: 'failed', message: 'This product has variants — pick the specific variant to update' };
    }
    if (item.newCost === undefined && item.newPrice === undefined) {
      return { ...base, status: 'failed', message: 'No new cost or price given' };
    }
    if ((item.newCost !== undefined && item.newCost < 0) || (item.newPrice !== undefined && item.newPrice < 0)) {
      return { ...base, status: 'failed', message: 'Prices cannot be negative' };
    }

    const target = variant || product;
    const oldCost = Number(target.cost) || 0;
    const oldPrice = Number(target.price) || 0;
    const costChanged = item.newCost !== undefined && !sameMoney(item.newCost, oldCost);
    const priceChanged = item.newPrice !== undefined && !sameMoney(item.newPrice, oldPrice);
    const withNumbers = { ...base, target, oldCost, oldPrice, costChanged, priceChanged };

    if (!costChanged && !priceChanged) return { ...withNumbers, status: 'unchanged', message: 'Already at these prices' };
    if (costChanged && item.expectedOldCost !== undefined && !sameMoney(item.expectedOldCost, oldCost)) {
      return { ...withNumbers, status: 'stale', message: `Cost changed since you loaded this list (was ${item.expectedOldCost}, now ${oldCost})` };
    }
    if (priceChanged && item.expectedOldPrice !== undefined && !sameMoney(item.expectedOldPrice, oldPrice)) {
      return { ...withNumbers, status: 'stale', message: `Price changed since you loaded this list (was ${item.expectedOldPrice}, now ${oldPrice})` };
    }
    return withNumbers;
  });

  // Step 1: the audit rows, written BEFORE any product is touched.
  const changeDocs = plan.map((p) => {
    const target = p.variant || p.product;
    return {
      organizationId,
      branchId,
      batchId: batch._id,
      productId: p.item.productId,
      variantId: p.item.variantId || null,
      productName: p.product ? p.product.name : undefined,
      variantLabel: p.variant ? variantLabelOf(p.variant) : undefined,
      barcode: target ? target.barcode : undefined,
      sku: target ? target.sku : undefined,
      oldCost: p.oldCost !== undefined ? p.oldCost : null,
      newCost: p.item.newCost !== undefined ? p.item.newCost : null,
      oldPrice: p.oldPrice !== undefined ? p.oldPrice : null,
      newPrice: p.item.newPrice !== undefined ? p.item.newPrice : null,
      costChanged: Boolean(p.costChanged),
      priceChanged: Boolean(p.priceChanged),
      sourceLine: p.item.sourceLine,
      matchMethod: p.item.matchMethod,
      matchScore: p.item.matchScore,
      status: p.status,
      message: p.message,
      changedBy: userId,
      changedAt: new Date(),
    };
  });
  const savedChanges = await PriceChange.insertMany(changeDocs, { ordered: true });
  savedChanges.forEach((doc, i) => {
    plan[i].changeId = doc._id;
    plan[i].initialStatus = plan[i].status; // what the row was inserted with
  });

  // Step 2: guarded writes.
  const writable = plan.filter((p) => p.status === 'pending');
  for (let i = 0; i < writable.length; i += APPLY_CHUNK) {
    const chunk = writable.slice(i, i + APPLY_CHUNK);
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(
      chunk.map(async (p) => {
        const Model = p.variant ? ProductVariant : Product;
        const filter = { _id: p.variant ? p.variant._id : p.product._id, organizationId, branchId };
        const set = {};
        if (p.costChanged) {
          filter.cost = p.oldCost;
          set.cost = p.item.newCost;
        }
        if (p.priceChanged) {
          filter.price = p.oldPrice;
          set.price = p.item.newPrice;
        }
        const update = { $set: set };
        if (!p.variant) {
          // Product carries the desktop-sync version; `save()` bumps it, a raw update must too.
          set.updatedBy = userId;
          update.$inc = { syncVersion: 1 };
        }
        try {
          const result = await Model.updateOne(filter, update);
          if (result.matchedCount === 1 || result.modifiedCount === 1) p.status = 'applied';
          else {
            p.status = 'stale';
            p.message = 'Changed by someone else while applying — left as it is';
          }
        } catch (err) {
          logger.error(`[priceUpdate] write failed for ${p.item.productId}: ${err.message}`);
          p.status = 'failed';
          p.message = 'Could not save this product';
        }
      }),
    );
  }

  // Step 3: settle the audit rows, learn aliases, finalize the header.
  const settle = plan.filter((p) => p.changeId && p.status !== p.initialStatus);
  if (settle.length) {
    await PriceChange.bulkWrite(
      settle.map((p) => ({ updateOne: { filter: { _id: p.changeId }, update: { $set: { status: p.status, message: p.message } } } })),
      { ordered: false },
    );
  }

  await learnAliases({ organizationId, branchId, userId, supplierId: meta.supplierId || null, plan });

  const applied = plan.filter((p) => p.status === 'applied');
  const costPcts = applied.filter((p) => p.costChanged).map((p) => percentChange(p.oldCost, p.item.newCost)).filter(isNum);
  const pricePcts = applied.filter((p) => p.priceChanged).map((p) => percentChange(p.oldPrice, p.item.newPrice)).filter(isNum);
  const avg = (list) => (list.length ? round2(list.reduce((a, b) => a + b, 0) / list.length) : 0);
  const stats = {
    requested: items.length,
    applied: applied.length,
    unchanged: plan.filter((p) => p.status === 'unchanged').length,
    stale: plan.filter((p) => p.status === 'stale').length,
    failed: plan.filter((p) => p.status === 'failed').length + dropped.length,
    costUp: applied.filter((p) => p.costChanged && p.item.newCost > p.oldCost).length,
    costDown: applied.filter((p) => p.costChanged && p.item.newCost < p.oldCost).length,
    priceUp: applied.filter((p) => p.priceChanged && p.item.newPrice > p.oldPrice).length,
    priceDown: applied.filter((p) => p.priceChanged && p.item.newPrice < p.oldPrice).length,
    avgCostChangePercent: avg(costPcts),
    avgPriceChangePercent: avg(pricePcts),
  };
  batch.stats = stats;
  batch.status = applied.length ? 'applied' : 'failed';
  await batch.save();

  return {
    batch: batch.toJSON(),
    results: plan.map((p) => ({
      index: p.item.index,
      productId: p.item.productId,
      variantId: p.item.variantId,
      status: p.status,
      message: p.message,
    })),
    stats,
  };
};

/**
 * Aliases are only ever learned from an explicit human decision (a manually chosen or
 * confirmed match) — never from a fuzzy match the user merely didn't object to, or one wrong
 * auto-match would be cemented and skip every future ambiguity check. 'alias' rows just bump
 * their hit counter. Best-effort: failing to remember must never fail the price update.
 */
const learnAliases = async ({ organizationId, branchId, userId, supplierId, plan }) => {
  try {
    const ops = [];
    plan.forEach((p) => {
      if (p.status !== 'applied' || !p.item.listName) return;
      if (p.item.matchMethod !== 'manual' && p.item.matchMethod !== 'alias') return;
      const key = aliasKey(p.item.listName);
      if (!key) return;
      const filter = { organizationId, branchId, supplierId, aliasKey: key };
      if (p.item.matchMethod === 'alias') {
        ops.push({ updateOne: { filter, update: { $inc: { hits: 1 }, $set: { lastUsedAt: new Date() } } } });
        return;
      }
      ops.push({
        updateOne: {
          filter,
          update: {
            $set: {
              aliasText: p.item.listName,
              productId: p.item.productId,
              variantId: p.item.variantId || null,
              productName: p.product ? p.product.name : undefined,
              lastUsedAt: new Date(),
            },
            $inc: { hits: 1 },
            $setOnInsert: { createdBy: userId },
          },
          upsert: true,
        },
      });
    });
    if (ops.length) await PriceListAlias.bulkWrite(ops, { ordered: false });
  } catch (err) {
    logger.warn(`[priceUpdate] could not save remembered matches: ${err.message}`);
  }
};

// ─── Rollback ────────────────────────────────────────────────────────────────

/**
 * Restores what a batch changed. Each product is restored only if it STILL holds the value the
 * batch wrote — if a purchase or a later update changed it since, blindly restoring the old
 * number would destroy that newer change, so it's reported as a conflict and left alone
 * (unless `force`). Idempotent: rows already reverted are skipped.
 */
const rollbackBatch = async ({ organizationId, branchId, userId, batchId, force = false }) => {
  const batch = await PriceUpdateBatch.findOne({ _id: batchId, organizationId, branchId });
  if (!batch) throw new ApiError(httpStatus.NOT_FOUND, 'Price update not found');
  if (!['applied', 'partially_rolled_back'].includes(batch.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Only an applied price update can be undone');
  }

  const changes = await PriceChange.find({ batchId, status: { $in: ['applied', 'revert_conflict'] } });
  let reverted = 0;
  let conflicts = 0;
  const now = new Date();

  for (let i = 0; i < changes.length; i += APPLY_CHUNK) {
    const chunk = changes.slice(i, i + APPLY_CHUNK);
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(
      chunk.map(async (change) => {
        const Model = change.variantId ? ProductVariant : Product;
        const filter = { _id: change.variantId || change.productId, organizationId, branchId };
        const set = {};
        if (change.costChanged) {
          if (!force) filter.cost = change.newCost;
          set.cost = change.oldCost;
        }
        if (change.priceChanged) {
          if (!force) filter.price = change.newPrice;
          set.price = change.oldPrice;
        }
        const update = { $set: set };
        if (!change.variantId) {
          set.updatedBy = userId;
          update.$inc = { syncVersion: 1 };
        }
        const result = await Model.updateOne(filter, update);
        if (result.matchedCount === 1) {
          change.status = 'reverted';
          change.message = undefined;
          change.revertedAt = now;
          change.revertedBy = userId;
          reverted += 1;
        } else {
          change.status = 'revert_conflict';
          change.message = 'Changed again after this update — not restored';
          conflicts += 1;
        }
        await change.save();
      }),
    );
  }

  batch.status = conflicts ? 'partially_rolled_back' : 'rolled_back';
  batch.rolledBackAt = now;
  batch.rolledBackBy = userId;
  await batch.save();

  return { batch: batch.toJSON(), reverted, conflicts };
};

// ─── History ─────────────────────────────────────────────────────────────────

const listBatches = async ({ organizationId, branchId, page = 1, limit = 20 }) => {
  const filter = { organizationId, branchId };
  const [results, totalResults] = await Promise.all([
    PriceUpdateBatch.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate({ path: 'appliedBy', select: 'name email' })
      .lean({ virtuals: false }),
    PriceUpdateBatch.countDocuments(filter),
  ]);
  return {
    results: results.map(({ _id, __v, ...rest }) => ({ id: String(_id), ...rest })),
    page,
    limit,
    totalResults,
    totalPages: Math.ceil(totalResults / limit) || 1,
  };
};

const getBatch = async ({ organizationId, branchId, batchId, page = 1, limit = 500 }) => {
  const batch = await PriceUpdateBatch.findOne({ _id: batchId, organizationId, branchId })
    .select('+sourceText')
    .populate({ path: 'appliedBy', select: 'name email' })
    .populate({ path: 'rolledBackBy', select: 'name email' })
    .lean();
  if (!batch) throw new ApiError(httpStatus.NOT_FOUND, 'Price update not found');
  const [changes, total] = await Promise.all([
    PriceChange.find({ batchId })
      .sort({ productName: 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    PriceChange.countDocuments({ batchId }),
  ]);
  const { _id, __v, ...rest } = batch;
  return {
    batch: { id: String(_id), ...rest },
    items: changes.map(({ _id: cid, __v: v, ...c }) => ({ id: String(cid), ...c })),
    total,
    page,
    limit,
  };
};

/** A product's (or one variant's) price/cost timeline, newest first. */
const getProductHistory = async ({ organizationId, branchId, productId, variantId, limit = 100 }) => {
  const filter = {
    organizationId,
    branchId,
    productId,
    status: { $in: ['applied', 'reverted', 'revert_conflict'] },
  };
  if (variantId) filter.variantId = variantId;
  const changes = await PriceChange.find(filter).sort({ changedAt: -1 }).limit(limit).lean();
  const batchIds = [...new Set(changes.map((c) => String(c.batchId)))];
  const batches = batchIds.length
    ? await PriceUpdateBatch.find({ _id: { $in: batchIds } })
        .select('batchNumber source status')
        .lean()
    : [];
  const batchMap = new Map(batches.map((b) => [String(b._id), b]));
  return changes.map(({ _id, __v, ...c }) => {
    const b = batchMap.get(String(c.batchId));
    return {
      id: String(_id),
      ...c,
      batchNumber: b ? b.batchNumber : null,
      sourceType: b ? b.source.type : null,
      supplierName: b ? b.source.supplierName : null,
    };
  });
};

// ─── Saved matches ───────────────────────────────────────────────────────────

const listAliases = async ({ organizationId, branchId }) => {
  const docs = await PriceListAlias.find({ organizationId, branchId }).sort({ lastUsedAt: -1 }).limit(500).lean();
  const products = docs.length
    ? await Product.find({ organizationId, branchId, _id: { $in: docs.map((d) => d.productId) } }).select('name').lean()
    : [];
  const names = new Map(products.map((p) => [String(p._id), p.name]));
  return docs.map(({ _id, __v, ...d }) => ({
    id: String(_id),
    ...d,
    productName: names.get(String(d.productId)) || d.productName || '(deleted product)',
  }));
};

const deleteAlias = async ({ organizationId, branchId, aliasId }) => {
  const result = await PriceListAlias.deleteOne({ _id: aliasId, organizationId, branchId });
  if (!result.deletedCount) throw new ApiError(httpStatus.NOT_FOUND, 'Saved match not found');
};

module.exports = {
  buildCatalog,
  analyze,
  searchCatalog,
  applyBatch,
  rollbackBatch,
  listBatches,
  getBatch,
  getProductHistory,
  listAliases,
  deleteAlias,
  MAX_APPLY_ITEMS,
};
