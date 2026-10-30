const mongoose = require('mongoose');
const httpStatus = require('http-status');
const { Product, Brand, Category, SubCategory, InventoryTransfer } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { BUSINESS_TZ, eachBusinessCalendarDate } = require('../../utils/businessTimezone');
const { roundQty, roundMoney, aggregateScope, escapeRegex } = require('./common');

/*
 * Inventory stock sheet — the store's paper sheet: one ruled table per category, every
 * item on its own line, and for each date three columns ISSUE · RECEIVE · BALANCE after an
 * opening BALANCE:
 *
 *   Sr │ Item │ Unit │ Balance │ 01 Oct: Issue Receive Balance │ 02 Oct: Issue Receive Balance │ …
 *
 * Receive is every movement into stock on that date (purchase, production, return from
 * the floor, transfer in, count gain …), Issue every movement out (issue to production or
 * the floor, packing, sale, scrap, transfer out …) — the same documents the stock
 * statements read (reports.service MOVEMENT_SOURCES), so the sheet always agrees with them.
 * Balances anchor on the stock the item has now and walk back, like the statements.
 *
 * Products are chosen by category, sub-category, brand and manufacturing type, and grouped
 * (one table each) by any of them. Columns are days, weeks or months.
 */

const EPS = 1e-6;
const MAX_DAYS = 400;
const MAX_ROWS = 2000;
const NONE = 'none';
const NAME_KEY = 'name:';
const GROUP_BY = ['category', 'subcategory', 'brand', 'type', 'none'];
const INTERVALS = ['day', 'week', 'month'];
const PRODUCT_TYPES = ['raw_material', 'component', 'packaging_material', 'sub_assembly', 'finished_good', 'by_product'];

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const isOid = (v) => /^[a-f0-9]{24}$/i.test(String(v));
const dayOf = (date) => ({ $dateToString: { format: '%Y-%m-%d', date, timezone: BUSINESS_TZ } });

/** "a,b,c" of URI-encoded keys → ['a','b','c']; a category kept only by name is "name:…". */
const parseKeys = (raw) =>
  String(raw || '')
    .split(',')
    .map((part) => {
      try {
        return decodeURIComponent(part).trim();
      } catch (e) {
        return '';
      }
    })
    .filter(Boolean);

const norm = (name) =>
  String(name || '')
    .trim()
    .toLowerCase();
/** Category names typed by hand differ in case and spacing — match them loosely. */
const nameIn = (names) => ({ $in: names.map((n) => new RegExp(`^\\s*${escapeRegex(String(n).trim())}\\s*$`, 'i')) });
const isEmptyArray = (path) => ({ $or: [{ [path]: { $exists: false } }, { [path]: { $size: 0 } }] });
const isBlank = (path) => ({ $or: [{ [path]: { $exists: false } }, { [path]: null }, { [path]: '' }] });

/** One filter (category / sub-category / brand) as an $or over ids, names and "none". */
const keyFilter = (keys, { idPath, namePaths = [], none }) => {
  if (!keys.length) return null;
  const or = [];
  const ids = keys.filter(isOid).map(oid);
  const names = keys.filter((k) => k.startsWith(NAME_KEY)).map((k) => k.slice(NAME_KEY.length));
  if (ids.length) or.push({ [idPath]: { $in: ids } });
  if (names.length) namePaths.forEach((path) => or.push({ [path]: nameIn(names) }));
  if (keys.includes(NONE)) or.push(none);
  return or.length ? { $or: or } : { _id: null };
};

/** The column buckets of the period: each day, each (Monday-start) week, or each month. */
const bucketsOf = (days, interval) => {
  const buckets = [];
  const indexOfDay = new Map();
  days.forEach((d) => {
    let key = d;
    if (interval === 'month') key = d.slice(0, 7);
    if (interval === 'week') {
      const date = new Date(`${d}T00:00:00Z`);
      const back = (date.getUTCDay() + 6) % 7; // days since Monday
      key = new Date(date.getTime() - back * 86400000).toISOString().slice(0, 10);
    }
    let last = buckets[buckets.length - 1];
    if (!last || last.key !== key) {
      last = { key, start: d, end: d };
      buckets.push(last);
    }
    last.end = d;
    indexOfDay.set(d, buckets.length - 1);
  });
  return { buckets, indexOfDay };
};

/** Every category, sub-category, brand and type in use — the sheet's filter options. */
const filterOptions = async (scope) => {
  const [facet] = await Product.aggregate([
    { $match: scope },
    {
      $facet: {
        categories: [
          { $unwind: '$categories' },
          {
            $group: {
              _id: { $ifNull: ['$categories._id', { $concat: [NAME_KEY, '$categories.name'] }] },
              name: { $first: '$categories.name' },
              count: { $sum: 1 },
            },
          },
        ],
        // Older products carry only the category name (Product.category).
        legacyCategories: [
          { $match: { ...isEmptyArray('categories'), category: { $nin: [null, ''] } } },
          { $group: { _id: '$category', count: { $sum: 1 } } },
        ],
        noCategory: [{ $match: { $and: [isEmptyArray('categories'), isBlank('category')] } }, { $count: 'n' }],
        subCategories: [
          { $unwind: '$subCategories' },
          { $match: { 'subCategories._id': { $ne: null } } },
          { $group: { _id: '$subCategories._id', name: { $first: '$subCategories.name' }, count: { $sum: 1 } } },
        ],
        noSubCategory: [{ $match: isEmptyArray('subCategories') }, { $count: 'n' }],
        brands: [{ $match: { brandId: { $ne: null } } }, { $group: { _id: '$brandId', count: { $sum: 1 } } }],
        noBrand: [{ $match: { brandId: null } }, { $count: 'n' }],
        types: [{ $group: { _id: '$productType', count: { $sum: 1 } } }],
      },
    },
  ]);
  const [brands, subs] = await Promise.all([
    facet.brands.length
      ? Brand.find({ _id: { $in: facet.brands.map((b) => b._id) } })
          .select('name')
          .lean()
      : [],
    facet.subCategories.length
      ? SubCategory.find({ _id: { $in: facet.subCategories.map((s) => s._id) } })
          .select('category')
          .lean()
      : [],
  ]);
  const brandName = new Map(brands.map((b) => [String(b._id), b.name]));
  const parentOf = new Map(subs.map((s) => [String(s._id), s.category ? String(s.category) : null]));
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
  const countOf = (rows) => (rows[0] && rows[0].n) || 0;

  const categoryMap = new Map();
  facet.categories.forEach((c) => {
    const id = String(c._id);
    const prev = categoryMap.get(id);
    categoryMap.set(id, { id, name: c.name || '', count: (prev ? prev.count : 0) + c.count });
  });
  // A name-only category joins the category of the same name (filtering by it finds both).
  const idOfName = new Map([...categoryMap.values()].map((c) => [norm(c.name), c.id]));
  facet.legacyCategories.forEach((c) => {
    const id = idOfName.get(norm(c._id)) || `${NAME_KEY}${c._id}`;
    const prev = categoryMap.get(id);
    categoryMap.set(id, { id, name: prev ? prev.name : c._id, count: (prev ? prev.count : 0) + c.count });
  });
  return {
    categories: [...categoryMap.values()].filter((c) => c.name).sort(byName),
    noCategory: countOf(facet.noCategory),
    subCategories: facet.subCategories
      .map((s) => ({
        id: String(s._id),
        name: s.name || '',
        categoryId: parentOf.get(String(s._id)) || null,
        count: s.count,
      }))
      .filter((s) => s.name)
      .sort(byName),
    noSubCategory: countOf(facet.noSubCategory),
    brands: facet.brands
      .map((b) => ({ id: String(b._id), name: brandName.get(String(b._id)) || '', count: b.count }))
      .filter((b) => b.name)
      .sort(byName),
    noBrand: countOf(facet.noBrand),
    types: facet.types.map((t) => ({ type: t._id || null, count: t.count })),
  };
};

/**
 * Signed movement per product and business day since `from`: Map(productId → Map(day →
 * { in, out })). In and out stay apart so a day with both shows both.
 */
const dailyMovements = async (scope, productIds, from, engine) => {
  const result = new Map(productIds.map((id) => [String(id), new Map()]));
  const add = (r) => {
    const days = result.get(String(r._id.p));
    if (!days) return;
    const cell = days.get(r._id.d) || { in: 0, out: 0 };
    if (r.qty > 0) cell.in += r.qty;
    else cell.out -= r.qty;
    days.set(r._id.d, cell);
  };
  const grouped = [
    { $match: { q: { $ne: 0 } } },
    { $group: { _id: { p: '$p', d: '$d', in: { $gt: ['$q', 0] } }, qty: { $sum: '$q' } } },
  ];
  await Promise.all([
    ...engine.MOVEMENT_SOURCES.map((s) =>
      s.Model.aggregate([
        { $match: { ...scope, ...(s.extra || {}), [s.date]: { $gte: from }, [s.product]: { $in: productIds } } },
        ...(s.array
          ? [{ $unwind: `$${s.array}` }, { $match: { [s.product]: { $in: productIds }, ...(s.lineMatch || {}) } }]
          : []),
        { $project: { p: `$${s.product}`, d: dayOf(`$${s.date}`), q: { $multiply: [s.sign, s.qty] } } },
        ...grouped,
      ]).then((rows) => rows.forEach(add))
    ),
    ...engine.transferLegs(scope, productIds, { $gte: from }).map((leg) =>
      InventoryTransfer.aggregate([
        { $match: leg.match },
        {
          $project: {
            p: leg.product,
            d: dayOf(leg.key === 'transferIn' ? { $ifNull: ['$completedAt', '$createdAt'] } : '$createdAt'),
            q: { $multiply: [leg.sign, '$quantity'] },
          },
        },
        ...grouped,
      ]).then((rows) => rows.forEach(add))
    ),
  ]);
  return result;
};

/** The category a product is listed under — keyed by name, so a name-only one joins it. */
/** Filter keys → the names they stand for (a name-only key is its own name). */
const namesOf = (options, keys, noneLabel) =>
  keys
    .map((k) => {
      if (k === NONE) return noneLabel;
      const hit = options.find((o) => o.id === k);
      if (hit) return hit.name;
      return k.startsWith(NAME_KEY) ? k.slice(NAME_KEY.length) : null;
    })
    .filter(Boolean);

const categoryOf = (p, wanted) => {
  const list = (p.categories || []).filter((c) => c.name).map((c) => ({ key: norm(c.name), name: c.name }));
  if (!list.length && p.category) list.push({ key: norm(p.category), name: p.category });
  // A product in several categories sits under the first one the sheet was filtered by.
  return list.find((c) => wanted.has(c.key)) || list[0] || null;
};

const stockSheetReport = async (ctx, q, engine) => {
  const range = engine.resolveRange(q);
  const days = eachBusinessCalendarDate(range.start, range.end);
  if (days.length > MAX_DAYS) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Choose a period of at most ${MAX_DAYS} days for the stock sheet`);
  }
  const interval = INTERVALS.includes(q.interval) ? q.interval : 'day';
  const groupBy = GROUP_BY.includes(q.groupBy) ? q.groupBy : 'category';
  const scope = aggregateScope(ctx);

  const categoryKeys = parseKeys(q.categoryIds);
  const subCategoryKeys = parseKeys(q.subCategoryIds);
  const brandKeys = parseKeys(q.brandIds);
  const types = parseKeys(q.productTypes).filter((t) => t === NONE || PRODUCT_TYPES.includes(t));

  // Older products keep only a category name: a category chosen by id finds them by its name.
  const chosenCategories = await Category.find({ _id: { $in: categoryKeys.filter(isOid).map(oid) } })
    .select('name')
    .lean();
  const categoryFilter = keyFilter(categoryKeys, {
    idPath: 'categories._id',
    namePaths: ['categories.name', 'category'],
    none: { $and: [isEmptyArray('categories'), isBlank('category')] },
  });
  if (categoryFilter && chosenCategories.length) {
    categoryFilter.$or.push({ ...isEmptyArray('categories'), category: nameIn(chosenCategories.map((c) => c.name)) });
  }
  const chosenCategoryNames = new Set([
    ...chosenCategories.map((c) => norm(c.name)),
    ...categoryKeys.filter((k) => k.startsWith(NAME_KEY)).map((k) => norm(k.slice(NAME_KEY.length))),
  ]);

  const and = [
    categoryFilter,
    keyFilter(subCategoryKeys, { idPath: 'subCategories._id', none: isEmptyArray('subCategories') }),
    keyFilter(
      brandKeys.filter((k) => k === NONE || isOid(k)),
      { idPath: 'brandId', none: { brandId: null } }
    ),
    types.length
      ? {
          $or: [
            { productType: { $in: types.filter((t) => t !== NONE) } },
            ...(types.includes(NONE) ? [{ productType: null }] : []),
          ],
        }
      : null,
  ].filter(Boolean);
  if (q.search && String(q.search).trim()) {
    const rx = new RegExp(escapeRegex(String(q.search).trim()), 'i');
    and.push({ $or: [{ name: rx }, { sku: rx }, { barcode: rx }] });
  }

  const [options, found] = await Promise.all([
    filterOptions(scope),
    Product.find({ ...scope, ...(and.length ? { $and: and } : {}) })
      .select(
        'name nameUrdu sku unit cost price stockQuantity hasVariants productType categories subCategories category brandId isActive'
      )
      // As a person reads a list: "dabi" next to "Dabbi", "Pack 9" before "Pack 12".
      .collation({ locale: 'en', strength: 2, numericOrdering: true })
      .sort({ name: 1 })
      .limit(MAX_ROWS + 1)
      .lean(),
  ]);
  const truncated = found.length > MAX_ROWS;
  const products = truncated ? found.slice(0, MAX_ROWS) : found;
  const ids = products.map((p) => p._id);

  const [moves, stock, costs, brands] = await Promise.all([
    ids.length ? dailyMovements(scope, ids, range.start, engine) : new Map(),
    engine.currentStock(products),
    engine.stockUnitCosts(scope, products),
    Brand.find({
      _id: {
        $in: [
          ...new Set(
            products
              .map((p) => p.brandId)
              .filter(Boolean)
              .map(String)
          ),
        ].map(oid),
      },
    })
      .select('name')
      .lean(),
  ]);
  const brandName = new Map(brands.map((b) => [String(b._id), b.name]));
  const { buckets, indexOfDay } = bucketsOf(days, interval);

  let rows = products.map((p) => {
    const id = String(p._id);
    const byDay = moves.get(id) || new Map();
    const cells = buckets.map(() => ({ issue: 0, receive: 0 }));
    let after = 0;
    let net = 0;
    byDay.forEach((m, d) => {
      if (d > range.endKey) {
        after += m.in - m.out;
        return;
      }
      const i = indexOfDay.get(d);
      if (i == null) return;
      cells[i].receive += m.in;
      cells[i].issue += m.out;
      net += m.in - m.out;
    });
    const current = roundQty(stock.get(id) || 0);
    const closing = roundQty(current - after);
    const opening = roundQty(closing - net);
    let balance = opening;
    const sheet = cells.map((c) => {
      balance += c.receive - c.issue;
      return [roundQty(c.issue), roundQty(c.receive), roundQty(balance)];
    });
    const issue = roundQty(cells.reduce((s, c) => s + c.issue, 0));
    const receive = roundQty(cells.reduce((s, c) => s + c.receive, 0));
    const unitCost = costs.get(id) || 0;
    const subs = (p.subCategories || []).filter((s) => s._id).map((s) => ({ key: String(s._id), name: s.name }));
    return {
      productId: id,
      name: p.name,
      nameUrdu: p.nameUrdu || '',
      sku: p.sku || '',
      unit: p.unit || '',
      productType: p.productType || null,
      isActive: p.isActive !== false,
      category: categoryOf(p, chosenCategoryNames),
      subCategory: subs.find((s) => subCategoryKeys.includes(s.key)) || subs[0] || null,
      brand:
        p.brandId && brandName.get(String(p.brandId))
          ? { key: String(p.brandId), name: brandName.get(String(p.brandId)) }
          : null,
      opening,
      cells: sheet,
      issue,
      receive,
      closing,
      current,
      unitCost: roundMoney(unitCost),
      closingValue: roundMoney(closing * unitCost),
    };
  });

  const idle = (r) => Math.abs(r.opening) < EPS && Math.abs(r.closing) < EPS && r.issue < EPS && r.receive < EPS;
  // An inactive item only shows while it still holds or moves stock.
  rows = rows.filter((r) => !idle(r) || (r.isActive && !(q.hideIdle === true || q.hideIdle === 'true')));

  // Only the dates something moved on (balances still carry across the dates left out).
  let shown = buckets.map((b, i) => i);
  if (q.activeDays === true || q.activeDays === 'true') {
    shown = shown.filter((i) => rows.some((r) => r.cells[i][0] > EPS || r.cells[i][1] > EPS));
  }
  rows = rows.map((r) => ({ ...r, cells: shown.map((i) => r.cells[i]) }));

  // One table per group, named; "none" groups last.
  const groupOf = (r) => {
    if (groupBy === 'category') return r.category ? { key: r.category.key, name: r.category.name } : null;
    if (groupBy === 'subcategory') {
      if (!r.subCategory) return r.category ? { key: `${r.category.key}|`, name: r.category.name, parent: null } : null;
      return {
        key: `${r.category ? r.category.key : ''}|${norm(r.subCategory.name)}`,
        name: r.subCategory.name,
        parent: r.category ? r.category.name : null,
      };
    }
    if (groupBy === 'brand') return r.brand;
    if (groupBy === 'type') return r.productType ? { key: r.productType, name: r.productType } : null;
    return { key: 'all', name: '' };
  };
  const groups = new Map();
  rows.forEach((r) => {
    const g = groupOf(r) || { key: NONE, name: '', none: true };
    if (!groups.has(g.key)) groups.set(g.key, { ...g, rows: [] });
    groups.get(g.key).rows.push(r);
  });
  const TYPE_ORDER = new Map(PRODUCT_TYPES.map((t, i) => [t, i]));
  const label = (g) => `${g.parent || ''} ${g.name}`.trim();
  const ordered = [...groups.values()].sort((a, b) => {
    if (a.none !== b.none) return a.none ? 1 : -1;
    if (groupBy === 'type') return TYPE_ORDER.get(a.key) - TYPE_ORDER.get(b.key);
    return label(a).localeCompare(label(b), undefined, { sensitivity: 'base', numeric: true });
  });

  return {
    report: 'stock-sheet',
    period: { startDate: range.startKey, endDate: range.endKey },
    interval,
    groupBy,
    buckets: shown.map((i) => buckets[i]),
    hiddenBuckets: buckets.length - shown.length,
    groups: ordered.map((g) => {
      const units = new Set(g.rows.map((r) => (r.unit || '').trim().toLowerCase()));
      return {
        key: g.key,
        name: g.name,
        parent: g.parent || null,
        none: !!g.none,
        // Quantities only add up when every item counts in the same unit.
        unit: units.size === 1 ? g.rows[0].unit || '' : null,
        closingValue: roundMoney(g.rows.reduce((s, r) => s + r.closingValue, 0)),
        rows: g.rows.map(({ category, subCategory, brand, isActive, ...r }) => r),
      };
    }),
    totals: {
      products: rows.length,
      moved: rows.filter((r) => r.issue > EPS || r.receive > EPS).length,
      negative: rows.filter((r) => r.closing < -EPS).length,
      closingValue: roundMoney(rows.reduce((s, r) => s + r.closingValue, 0)),
    },
    truncated,
    maxRows: MAX_ROWS,
    options,
    applied: {
      categories: namesOf(options.categories, categoryKeys, 'No category'),
      subCategories: namesOf(options.subCategories, subCategoryKeys, 'No sub-category'),
      brands: namesOf(options.brands, brandKeys, 'No brand'),
      types,
      search: String(q.search || '').trim(),
    },
  };
};

module.exports = { stockSheetReport };
