/**
 * Inventory clean-up — the category-wise view for pruning a catalogue: what is holding
 * money without selling, what could simply be switched off, what is priced wrong, what is
 * in twice. Built on the Products analytics engine (productAnalytics.service.js — same
 * "real sale" rules, same per-branch cache), with its own idle window.
 *
 * Buckets (a product can be in more than one):
 *   dead_stock          has stock, nothing sold for `idleDays` (or ever, once that old)
 *   zero_unsold         no stock, nothing sold for `idleDays`, active — safe to switch off
 *   inactive_with_stock switched off but still holding stock (money out of sight)
 *   below_cost          active and the sale price is under the cost
 *   missing_price       active with no sale price
 *   duplicate           another product in the branch has the same name
 */
const productAnalyticsService = require('./productAnalytics.service');
const { Product } = require('../models');
const { productNameKey } = require('../utils/productNameKey');
const { toBusinessCalendarDate } = require('../utils/businessTimezone');

const BUCKETS = ['dead_stock', 'zero_unsold', 'inactive_with_stock', 'below_cost', 'missing_price', 'duplicate'];
const IDLE_DAY_OPTIONS = [30, 60, 90, 180, 365];
const DEFAULT_IDLE_DAYS = 90;
const UNCATEGORIZED = 'uncategorized';
const DAY_MS = 24 * 60 * 60 * 1000;

const idleDaysOf = (value) => (IDLE_DAY_OPTIONS.includes(Number(value)) ? Number(value) : DEFAULT_IDLE_DAYS);

/** The analytics rows for "the last `idleDays` days", plus each row's buckets. */
const loadRows = async ({ organizationId, branchId, idleDays, fresh }) => {
  const endKey = toBusinessCalendarDate(new Date());
  const startKey = toBusinessCalendarDate(new Date(Date.now() - (idleDays - 1) * DAY_MS));
  const period = productAnalyticsService.resolvePeriod({ startDate: startKey, endDate: endKey });
  const { rows } = await productAnalyticsService.getBranchAnalytics({ organizationId, branchId, period, fresh: !!fresh });

  const byKey = new Map();
  rows.forEach((row) => {
    const key = productNameKey(row.name);
    if (!key) return;
    byKey.set(key, (byKey.get(key) || 0) + 1);
  });

  return rows.map((row) => {
    const unsold = !(row.netUnits > 0);
    const idle = row.daysSinceLastSale ?? row.daysSinceCreated;
    const oldEnough = (row.daysSinceCreated ?? 0) >= idleDays;
    const buckets = [];
    if (row.currentStock > 0 && unsold && idle != null && idle >= idleDays) buckets.push('dead_stock');
    if (row.isActive && !(row.currentStock > 0) && unsold && oldEnough) buckets.push('zero_unsold');
    if (!row.isActive && row.currentStock > 0) buckets.push('inactive_with_stock');
    if (row.isActive && !row.hasVariants && row.price > 0 && row.cost > 0 && row.price < row.cost) buckets.push('below_cost');
    if (row.isActive && !row.hasVariants && !(row.price > 0)) buckets.push('missing_price');
    if ((byKey.get(productNameKey(row.name)) || 0) > 1) buckets.push('duplicate');
    return { ...row, buckets, idleDays: unsold ? idle : null };
  });
};

const emptyBuckets = () => Object.fromEntries(BUCKETS.map((b) => [b, { count: 0, stockValue: 0 }]));

const emptyCategory = (categoryId, categoryName) => ({
  categoryId,
  categoryName,
  totalProducts: 0,
  activeProducts: 0,
  inStockProducts: 0,
  outOfStockProducts: 0,
  stockQuantity: 0,
  stockValue: 0,
  buckets: emptyBuckets(),
});

const addRow = (target, row) => {
  target.totalProducts += 1;
  if (row.isActive) target.activeProducts += 1;
  if (row.currentStock > 0) target.inStockProducts += 1;
  else target.outOfStockProducts += 1;
  target.stockQuantity += Math.max(0, row.currentStock || 0);
  target.stockValue += Math.max(0, row.stockValue || 0);
  row.buckets.forEach((b) => {
    target.buckets[b].count += 1;
    target.buckets[b].stockValue += Math.max(0, row.stockValue || 0);
  });
};

/** Category-wise counts/values plus clean-up buckets; products in several categories count in each. */
const getCleanupOverview = async ({ organizationId, branchId, idleDays: rawDays, fresh }) => {
  const idleDays = idleDaysOf(rawDays);
  const rows = await loadRows({ organizationId, branchId, idleDays, fresh });
  const totals = emptyCategory(null, 'All products');
  const categories = new Map();
  rows.forEach((row) => {
    addRow(totals, row);
    const cats = row.categories.filter((c) => c.id);
    const targets = cats.length ? cats : [{ id: UNCATEGORIZED, name: 'Uncategorized' }];
    targets.forEach((c) => {
      if (!categories.has(c.id)) categories.set(c.id, emptyCategory(c.id, c.name));
      addRow(categories.get(c.id), row);
    });
  });
  return {
    idleDays,
    idleDayOptions: IDLE_DAY_OPTIONS,
    totals,
    categories: [...categories.values()].sort((a, b) => b.stockValue - a.stockValue || a.categoryName.localeCompare(b.categoryName)),
  };
};

const SORTS = {
  stockValue: (a, b) => (b.stockValue || 0) - (a.stockValue || 0),
  idle: (a, b) => (b.idleDays ?? -1) - (a.idleDays ?? -1),
  name: (a, b) => String(a.name).localeCompare(String(b.name)),
  stock: (a, b) => (b.currentStock || 0) - (a.currentStock || 0),
};

/** The products in one bucket (optionally one category), paged — what the person acts on. */
const getCleanupItems = async ({ organizationId, branchId, idleDays: rawDays, bucket, categoryId, search, sortBy = 'stockValue', page = 1, limit = 50, fresh }) => {
  const idleDays = idleDaysOf(rawDays);
  let rows = await loadRows({ organizationId, branchId, idleDays, fresh });
  if (bucket && BUCKETS.includes(bucket)) rows = rows.filter((r) => r.buckets.includes(bucket));
  if (categoryId === UNCATEGORIZED) rows = rows.filter((r) => !r.categories.some((c) => c.id));
  else if (categoryId) rows = rows.filter((r) => r.categories.some((c) => c.id === String(categoryId)));
  if (search) {
    const terms = String(search).toLowerCase().split(/\s+/).filter(Boolean);
    rows = rows.filter((r) => {
      const hay = `${r.name} ${r.nameUrdu || ''} ${r.barcode || ''} ${r.sku || ''}`.toLowerCase();
      return terms.every((term) => hay.includes(term));
    });
  }
  // Duplicates read best next to each other.
  const compare = bucket === 'duplicate' ? (a, b) => productNameKey(a.name).localeCompare(productNameKey(b.name)) || SORTS.stockValue(a, b) : SORTS[sortBy] || SORTS.stockValue;
  rows.sort(compare);

  const pageSize = Math.min(Math.max(1, parseInt(limit, 10) || 50), 500);
  const pageNo = Math.max(1, parseInt(page, 10) || 1);
  const slice = rows.slice((pageNo - 1) * pageSize, pageNo * pageSize);
  // `source` isn't in the analytics projection — one lookup for this page only.
  const sources = await Product.find({ _id: { $in: slice.map((r) => r.productId) } }).select('source').lean();
  const sourceById = new Map(sources.map((p) => [String(p._id), p.source || null]));

  return {
    idleDays,
    totalResults: rows.length,
    totalStockValue: rows.reduce((sum, r) => sum + Math.max(0, r.stockValue || 0), 0),
    page: pageNo,
    limit: pageSize,
    totalPages: Math.max(1, Math.ceil(rows.length / pageSize)),
    results: slice.map((r) => ({
      id: r.productId,
      name: r.name,
      nameUrdu: r.nameUrdu,
      image: r.image,
      barcode: r.barcode,
      sku: r.sku,
      isActive: r.isActive,
      hasVariants: r.hasVariants,
      categories: r.categories,
      brandName: r.brandName,
      price: r.price,
      cost: r.cost,
      currentStock: r.currentStock,
      stockValue: r.stockValue,
      unitsSold: r.netUnits,
      lastSoldAt: r.lastSoldAt || null,
      idleDays: r.idleDays,
      createdAt: r.createdAt,
      source: sourceById.get(r.productId) ?? null,
      buckets: r.buckets,
    })),
  };
};

module.exports = { BUCKETS, IDLE_DAY_OPTIONS, getCleanupOverview, getCleanupItems };
