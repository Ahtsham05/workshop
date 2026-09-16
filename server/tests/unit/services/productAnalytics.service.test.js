const mongoose = require('mongoose');
const setupTestDB = require('../../utils/setupTestDB');
const {
  Product,
  ProductVariant,
  Inventory,
  Invoice,
  Purchase,
  SalesReturn,
  PurchaseReturn,
  StockAdjustment,
  Customer,
  Supplier,
} = require('../../../src/models');
const service = require('../../../src/services/productAnalytics.service');
const {
  assignMovementClasses,
  assignAbcClasses,
  assignRanks,
  bucketKeyFor,
  enumerateBucketKeys,
  buildProductInsights,
  deriveProductMetrics,
} = require('../../../src/utils/productAnalyticsMetrics');

/**
 * Product analytics numbers drive restocking and pricing decisions, so every rule about
 * what counts as a sale is pinned here against a real (in-memory) MongoDB. Documents are
 * inserted raw, bypassing Mongoose hooks, to reproduce exactly what is stored.
 */
setupTestDB();
jest.setTimeout(60000);

const ORG = new mongoose.Types.ObjectId();
const BRANCH = new mongoose.Types.ObjectId();
const OTHER_BRANCH = new mongoose.Types.ObjectId();
const JUNE = { startDate: '2026-06-01', endDate: '2026-06-30' };
const scope = { organizationId: String(ORG), branchId: String(BRANCH) };

const at = (isoDate, time = '10:00:00') => new Date(`${isoDate}T${time}+05:00`);
const id = () => new mongoose.Types.ObjectId();

let seq = 0;
const insertProduct = async (overrides = {}) => {
  const doc = {
    _id: id(),
    organizationId: ORG,
    branchId: BRANCH,
    name: `Product ${++seq}`,
    price: 100,
    cost: 60,
    stockQuantity: 10,
    isActive: true,
    hasVariants: false,
    categories: [],
    createdAt: at('2026-01-01'),
    ...overrides,
  };
  await Product.collection.insertOne(doc);
  return doc;
};

const line = (product, { qty = 1, units, price = product.price, cost = product.cost, discountAmount = 0, variantId } = {}) => {
  const baseUnits = units ?? qty;
  const subtotal = qty * price - discountAmount;
  return {
    productId: product._id,
    name: product.name,
    quantity: qty,
    stockQuantity: baseUnits,
    unitPrice: price,
    cost,
    subtotal,
    profit: subtotal - cost * baseUnits,
    discountAmount,
    ...(variantId ? { variantId } : {}),
  };
};

const insertInvoice = async ({ items, date = '2026-06-10', type = 'cash', status = 'paid', discount = 0, branchId = BRANCH, ...rest }) => {
  const doc = {
    _id: id(),
    organizationId: ORG,
    branchId,
    invoiceNumber: `INV-${++seq}`,
    invoiceDate: at(date),
    type,
    status,
    items,
    discount,
    subtotal: items.reduce((s, i) => s + i.subtotal, 0),
    total: items.reduce((s, i) => s + i.subtotal, 0) - discount,
    totalProfit: items.reduce((s, i) => s + i.profit, 0),
    totalCost: 0,
    ...rest,
  };
  await Invoice.collection.insertOne(doc);
  return doc;
};

const insertPurchase = async ({ product, qty, unitCost, date = '2026-06-05', supplier, discount = 0, units }) => {
  const doc = {
    _id: id(),
    organizationId: ORG,
    branchId: BRANCH,
    invoiceNumber: `PUR-${++seq}`,
    supplier,
    purchaseDate: at(date),
    discount,
    items: [{ product: product._id, quantity: qty, stockQuantity: units ?? qty, priceAtPurchase: unitCost, total: qty * unitCost }],
    totalAmount: qty * unitCost - discount,
  };
  await Purchase.collection.insertOne(doc);
  return doc;
};

beforeEach(() => service.clearAnalyticsCache());

const rankingsFor = (query = {}) => service.getProductRankings({ ...scope, query: { ...JUNE, limit: 200, ...query } });
const rowOf = async (product, query) => (await rankingsFor(query)).results.find((r) => r.productId === String(product._id));

describe('what counts as a sale', () => {
  test('quotations, cancelled invoices and converted pending invoices are excluded; open pending counts', async () => {
    const product = await insertProduct();
    await insertInvoice({ items: [line(product, { qty: 2 })] }); // counts
    await insertInvoice({ items: [line(product, { qty: 5 })], type: 'quotation', status: 'draft' });
    await insertInvoice({ items: [line(product, { qty: 7 })], status: 'cancelled' });
    // Converted pending: its lines were re-issued on a credit invoice — only that one counts.
    await insertInvoice({ items: [line(product, { qty: 3 })], type: 'pending', isConvertedToBill: true });
    await insertInvoice({ items: [line(product, { qty: 3 })], type: 'credit', status: 'finalized' });
    await insertInvoice({ items: [line(product, { qty: 1 })], type: 'pending', status: 'draft' });

    const row = await rowOf(product);
    expect(row.unitsSold).toBe(6);
    expect(row.netRevenue).toBe(600);
    expect(row.invoiceCount).toBe(3);
  });

  test('other branches and dates outside the period are ignored', async () => {
    const product = await insertProduct();
    await insertInvoice({ items: [line(product, { qty: 2 })] });
    await insertInvoice({ items: [line(product, { qty: 9 })], branchId: OTHER_BRANCH });
    await insertInvoice({ items: [line(product, { qty: 4 })], date: '2026-07-01' });

    const row = await rowOf(product);
    expect(row.unitsSold).toBe(2);
  });

  test('quantities are base units, so a box of 12 counts as 12', async () => {
    const product = await insertProduct({ price: 10, cost: 6, stockQuantity: 100 });
    await insertInvoice({ items: [line(product, { qty: 1, units: 12, price: 110, cost: 6 })] });
    await insertInvoice({ items: [line(product, { qty: 3 })] });

    const row = await rowOf(product);
    expect(row.unitsSold).toBe(15);
    expect(row.netRevenue).toBe(140);
    expect(row.netProfit).toBe(140 - 15 * 6);
  });

  test('a bill-level discount is pro-rated onto each line by its share of the subtotal', async () => {
    const a = await insertProduct({ price: 300, cost: 200 });
    const b = await insertProduct({ price: 100, cost: 50 });
    // Lines 300 + 100 = 400; a 40 bill discount is 30 on A and 10 on B.
    await insertInvoice({ items: [line(a), line(b)], discount: 40 });

    const rowA = await rowOf(a);
    const rowB = await rowOf(b);
    expect(rowA.netRevenue).toBe(270);
    expect(rowA.netProfit).toBe(70);
    expect(rowA.discount).toBe(30);
    expect(rowB.netRevenue).toBe(90);
    expect(rowB.netProfit).toBe(40);
  });
});

describe('returns', () => {
  test('returns net off units, revenue and the profit of the ORIGINAL sale line', async () => {
    const product = await insertProduct({ price: 100, cost: 60 });
    // Sold at cost 50 back then; current product cost is 60.
    const invoice = await insertInvoice({ items: [line(product, { qty: 4, cost: 50 })], date: '2026-06-02' });
    await SalesReturn.collection.insertOne({
      organizationId: ORG,
      branchId: BRANCH,
      invoiceId: invoice._id,
      returnNumber: 'SR-1',
      date: at('2026-06-12'),
      status: 'approved',
      items: [{ productId: product._id, name: product.name, quantity: 1, stockQuantity: 1, price: 100, total: 100 }],
      totalAmount: 100,
    });
    // Rejected returns never count.
    await SalesReturn.collection.insertOne({
      organizationId: ORG,
      branchId: BRANCH,
      invoiceId: invoice._id,
      returnNumber: 'SR-2',
      date: at('2026-06-13'),
      status: 'rejected',
      items: [{ productId: product._id, name: product.name, quantity: 2, stockQuantity: 2, price: 100, total: 200 }],
      totalAmount: 200,
    });

    const row = await rowOf(product);
    expect(row.unitsReturned).toBe(1);
    expect(row.netUnits).toBe(3);
    expect(row.netRevenue).toBe(300);
    // 4 × (100 − 50) = 200 profit, minus the returned unit's 100 − 50 = 50.
    expect(row.netProfit).toBe(150);
    expect(row.returnRate).toBe(25);
  });

  test('a return whose invoice no longer exists falls back to the current cost', async () => {
    const product = await insertProduct({ price: 100, cost: 60 });
    await insertInvoice({ items: [line(product, { qty: 2, cost: 50 })] });
    await SalesReturn.collection.insertOne({
      organizationId: ORG,
      branchId: BRANCH,
      invoiceId: id(),
      returnNumber: 'SR-3',
      date: at('2026-06-12'),
      status: 'approved',
      items: [{ productId: product._id, name: product.name, quantity: 1, stockQuantity: 1, price: 100, total: 100 }],
      totalAmount: 100,
    });

    const row = await rowOf(product);
    expect(row.netProfit).toBe(100 - (100 - 60));
  });
});

describe('classification and ranking', () => {
  test('growth compares against the equal-length period right before', async () => {
    const product = await insertProduct();
    await insertInvoice({ items: [line(product, { qty: 2 })], date: '2026-05-15' }); // previous period
    await insertInvoice({ items: [line(product, { qty: 3 })], date: '2026-06-15' });

    const row = await rowOf(product);
    expect(row.previous.netRevenue).toBe(200);
    expect(row.revenueGrowth).toBe(50);
    expect(row.revenueDelta).toBe(100);
  });

  test('ABC classes, ranks, dead stock and brand-new products', async () => {
    const big = await insertProduct({ name: 'Big' });
    const mid = await insertProduct({ name: 'Mid' });
    const small = await insertProduct({ name: 'Small' });
    const dead = await insertProduct({ name: 'Dead', stockQuantity: 5, cost: 40 });
    const fresh = await insertProduct({ name: 'Fresh', createdAt: at('2026-06-25') });
    const soldOut = await insertProduct({ name: 'Sold out idle', stockQuantity: 0 });
    const recentlySold = await insertProduct({ name: 'Sold in May' });

    await insertInvoice({ items: [line(big, { qty: 80 })] });
    await insertInvoice({ items: [line(mid, { qty: 15 })] });
    await insertInvoice({ items: [line(small, { qty: 5 })] });
    await insertInvoice({ items: [line(recentlySold, { qty: 1 })], date: '2026-05-20' });

    const { results, rankedCounts } = await rankingsFor();
    const byName = Object.fromEntries(results.map((r) => [r.name, r]));

    expect(byName.Big.abcClass).toBe('A');
    expect(byName.Mid.abcClass).toBe('B');
    expect(byName.Small.abcClass).toBe('C');
    expect(byName.Big.ranks.revenue).toBe(1);
    expect(byName.Small.ranks.revenue).toBe(3);
    expect(rankedCounts.revenue).toBe(3);

    expect(byName.Dead.movement).toBe('dead');
    expect(byName.Fresh.movement).toBe('no_sales');
    expect(byName.Fresh.isNew).toBe(true);
    expect(byName['Sold out idle'].movement).toBe('no_sales');
    expect(byName['Sold in May'].movement).toBe('no_sales');
    expect(byName['Sold in May'].daysSinceLastSale).toBeGreaterThan(30);

    const overview = await service.getAnalyticsOverview({ ...scope, query: JUNE });
    expect(overview.deadStock).toEqual({ count: 1, value: 200 });
    expect(overview.totals.netRevenue).toBe(10000);
    expect(overview.abc.A.count).toBe(1);
    expect(overview.leaderboards.topRevenue.map((r) => r.name)).toEqual(['Big', 'Mid', 'Small']);
  });

  test('rankings filter, sort with missing values last, and paginate', async () => {
    const products = await Promise.all([1, 2, 3, 4].map((n) => insertProduct({ name: `Item ${n}`, barcode: `BC${n}` })));
    await insertInvoice({ items: [line(products[0], { qty: 1 })] });
    await insertInvoice({ items: [line(products[1], { qty: 5 })] });
    await insertInvoice({ items: [line(products[2], { qty: 3 })] });

    const byCover = await rankingsFor({ sortBy: 'daysOfCover', sortOrder: 'asc' });
    // Item 4 never sold → no days-of-cover → last, even ascending.
    expect(byCover.results[byCover.results.length - 1].name).toBe('Item 4');

    const page2 = await rankingsFor({ sortBy: 'netUnits', limit: 2, page: 2 });
    expect(page2.totalResults).toBe(4);
    expect(page2.totalPages).toBe(2);
    expect(page2.results.map((r) => r.name)).toEqual(['Item 1', 'Item 4']);

    const searched = await rankingsFor({ search: 'bc3' });
    expect(searched.results.map((r) => r.name)).toEqual(['Item 3']);
  });

  test('category facets count the whole catalog and support an uncategorized filter', async () => {
    const phones = { _id: id(), name: 'Phones' };
    await insertProduct({ name: 'Phone A', categories: [phones] });
    await insertProduct({ name: 'Phone B', categories: [phones] });
    await insertProduct({ name: 'Loose item', categories: [] });

    const filtered = await rankingsFor({ categoryId: String(phones._id) });
    expect(filtered.results.map((r) => r.name).sort()).toEqual(['Phone A', 'Phone B']);
    // Facets stay catalog-wide even while a filter is applied.
    expect(filtered.facets).toEqual({ categories: [{ id: String(phones._id), name: 'Phones', productCount: 2 }], uncategorized: 1 });

    const loose = await rankingsFor({ categoryId: 'uncategorized' });
    expect(loose.results.map((r) => r.name)).toEqual(['Loose item']);
  });

  test('variant products read stock from Inventory, valued at the lowest variant cost', async () => {
    const product = await insertProduct({ hasVariants: true, stockQuantity: 0, price: 0, cost: 0 });
    const red = id();
    const blue = id();
    await ProductVariant.collection.insertMany([
      { _id: red, organizationId: ORG, branchId: BRANCH, productId: product._id, isDefault: false, attributes: { Color: 'Red' }, price: 500, cost: 300 },
      { _id: blue, organizationId: ORG, branchId: BRANCH, productId: product._id, isDefault: false, attributes: { Color: 'Blue' }, price: 550, cost: 320 },
    ]);
    await Inventory.collection.insertMany([
      { organizationId: ORG, branchId: BRANCH, productId: product._id, variantId: red, quantity: 4 },
      { organizationId: ORG, branchId: BRANCH, productId: product._id, variantId: blue, quantity: 6 },
    ]);
    await insertInvoice({ items: [line({ ...product, price: 500, cost: 300 }, { qty: 2, variantId: red })] });

    const row = await rowOf(product);
    expect(row.currentStock).toBe(10);
    expect(row.stockValue).toBe(3000);
    expect(row.priceRange).toEqual({ minPrice: 500, maxPrice: 550, minCost: 300, maxCost: 320 });

    const detail = await service.getProductAnalytics({ ...scope, productId: String(product._id), query: JUNE });
    const redRow = detail.variants.find((v) => v.label === 'Red');
    expect(redRow).toMatchObject({ unitsSold: 2, revenue: 1000, currentStock: 4 });
  });
});

describe('product detail', () => {
  test('series, customers, suppliers and insights', async () => {
    const product = await insertProduct({ price: 100, cost: 60, stockQuantity: 3 });
    const customer = { _id: id(), organizationId: ORG, branchId: BRANCH, name: 'Ali Traders' };
    await Customer.collection.insertOne(customer);
    const cheap = { _id: id(), organizationId: ORG, name: 'Cheap Co' };
    const pricey = { _id: id(), organizationId: ORG, name: 'Pricey Co' };
    await Supplier.collection.insertMany([cheap, pricey]);

    // Invoice.customerId is stored as a plain string in production data.
    await insertInvoice({ items: [line(product, { qty: 10 })], date: '2026-06-03', customerId: String(customer._id) });
    await insertInvoice({ items: [line(product, { qty: 5 })], date: '2026-06-20', customerId: 'walk-in' });
    await insertPurchase({ product, qty: 10, unitCost: 50, date: '2026-04-01', supplier: cheap._id });
    await insertPurchase({ product, qty: 10, unitCost: 60, date: '2026-06-01', supplier: pricey._id });

    const detail = await service.getProductAnalytics({ ...scope, productId: String(product._id), query: JUNE });

    expect(detail.period.granularity).toBe('day');
    expect(detail.series).toHaveLength(30);
    expect(detail.series.find((p) => p.bucket === '2026-06-03')).toMatchObject({ unitsSold: 10, revenue: 1000 });
    expect(detail.series.find((p) => p.bucket === '2026-06-01')).toMatchObject({ unitsPurchased: 10, avgPurchaseCost: 60 });

    expect(detail.customers.uniqueCustomers).toBe(1);
    expect(detail.customers.top[0]).toMatchObject({ name: 'Ali Traders', units: 10, invoices: 1 });
    expect(detail.customers.walkIn).toEqual({ units: 5, revenue: 500, invoices: 1 });

    expect(detail.suppliers.map((s) => s.name)).toEqual(['Cheap Co', 'Pricey Co']);
    expect(detail.lastPurchase).toMatchObject({ supplierName: 'Pricey Co', unitCost: 60 });

    const codes = detail.insights.map((i) => i.code);
    // 15 sold in 30 days = 0.5/day; 3 on hand ≈ 6 days of cover.
    expect(codes).toContain('stockout_risk');
    expect(codes).toContain('cheaper_supplier');
    expect(detail.insights[0].severity).not.toBe('positive');
  });

  test("another organization's product is not found", async () => {
    const foreign = await insertProduct({ organizationId: id() });
    await expect(
      service.getProductAnalytics({ ...scope, productId: String(foreign._id), query: JUNE })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('activity merges every source newest first with signed quantities', async () => {
    const product = await insertProduct();
    const supplier = { _id: id(), organizationId: ORG, name: 'Supplier A' };
    await Supplier.collection.insertOne(supplier);
    await insertPurchase({ product, qty: 20, unitCost: 55, date: '2026-06-01', supplier: supplier._id });
    await insertInvoice({ items: [line(product, { qty: 3 })], date: '2026-06-05' });
    await insertInvoice({ items: [line(product, { qty: 1 })], date: '2026-06-06', type: 'quotation', status: 'draft' });
    await StockAdjustment.collection.insertOne({
      organizationId: ORG,
      branchId: BRANCH,
      productId: product._id,
      type: 'damage',
      direction: 'decrease',
      quantity: 2,
      previousQuantity: 17,
      newQuantity: 15,
      status: 'completed',
      createdAt: at('2026-06-08'),
    });
    await PurchaseReturn.collection.insertOne({
      organizationId: ORG,
      branchId: BRANCH,
      supplierId: supplier._id,
      returnNumber: 'PR-1',
      date: at('2026-06-09'),
      status: 'approved',
      items: [{ productId: product._id, name: product.name, quantity: 1, stockQuantity: 1, price: 55, total: 55 }],
      totalAmount: 55,
      refundMethod: 'cash',
    });

    const all = await service.getProductActivity({ ...scope, productId: String(product._id), query: {} });
    expect(all.results.map((r) => [r.type, r.quantity])).toEqual([
      ['purchase_return', -1],
      ['adjustment', -2],
      ['sale', -3],
      ['purchase', 20],
    ]);
    expect(all.results[3].partyName).toBe('Supplier A');
    expect(all.summary.sale).toEqual({ count: 1, units: 3 });
    expect(all.totalResults).toBe(4);

    const page2 = await service.getProductActivity({ ...scope, productId: String(product._id), query: { limit: 3, page: 2 } });
    expect(page2.results.map((r) => r.type)).toEqual(['purchase']);

    const salesOnly = await service.getProductActivity({ ...scope, productId: String(product._id), query: { type: 'sale' } });
    expect(salesOnly.totalResults).toBe(1);
  });
});

describe('pure metric rules', () => {
  test('movement classes need enough sellers to be meaningful', () => {
    const rows = [1, 2, 3, 4, 5].map((n) => ({ netUnits: n, velocity: n, currentStock: 1 }));
    assignMovementClasses(rows);
    expect(rows.map((r) => r.movement)).toEqual(['slow', 'steady', 'steady', 'steady', 'fast']);

    const few = [{ netUnits: 1, velocity: 1 }, { netUnits: 9, velocity: 9 }];
    assignMovementClasses(few);
    expect(few.map((r) => r.movement)).toEqual(['steady', 'steady']);
  });

  test('a single product carrying most revenue is still class A; ties share a rank', () => {
    const rows = [{ netRevenue: 900 }, { netRevenue: 50 }, { netRevenue: 50 }, { netRevenue: 0 }];
    assignAbcClasses(rows);
    expect(rows.map((r) => r.abcClass)).toEqual(['A', 'B', 'C', null]);
    assignRanks(rows, 'netRevenue', 'revenue');
    expect(rows.map((r) => r.ranks.revenue)).toEqual([1, 2, 2, null]);
  });

  test('week buckets start on Monday and month buckets on the 1st', () => {
    expect(bucketKeyFor('2026-06-14', 'week')).toBe('2026-06-08'); // Sunday → Monday before
    expect(bucketKeyFor('2026-06-15', 'week')).toBe('2026-06-15');
    expect(bucketKeyFor('2026-06-15', 'month')).toBe('2026-06-01');
    expect(enumerateBucketKeys('2026-01-15', '2026-03-02', 'month')).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
  });

  test('selling below cost is critical and sorts first', () => {
    const metrics = deriveProductMetrics(
      { unitsSold: 10, revenue: 500, profit: -100, currentStock: 50, previous: { netRevenue: 100, netProfit: 20, netUnits: 2 } },
      { days: 30, asOf: new Date() }
    );
    const insights = buildProductInsights({ metrics, product: { price: 50, cost: 60 } });
    expect(insights[0].severity).toBe('critical');
    expect(insights.map((i) => i.code)).toEqual(expect.arrayContaining(['price_below_cost', 'selling_at_loss', 'sales_growth']));
  });
});
