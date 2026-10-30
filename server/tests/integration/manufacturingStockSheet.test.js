const mongoose = require('mongoose');
const {
  Product,
  Category,
  SubCategory,
  Brand,
  Purchase,
  MaterialIssue,
  FloorStockVoucher,
  StockAdjustment,
  InventoryTransfer,
} = require('../../src/models');
const { getReport } = require('../../src/services/manufacturing/reports.service');

/**
 * Inventory stock sheet: per category, date by date Issue · Receive · Balance, walked back
 * from live stock. Movements are inserted as dated documents, so every cell is known.
 */
const REPLSET_URL = process.env.MONGODB_TEST_REPLSET_URL;
const describeDb = REPLSET_URL ? describe : describe.skip;

beforeAll(async () => {
  if (REPLSET_URL) await mongoose.connect(REPLSET_URL);
});
beforeEach(async () => {
  if (!REPLSET_URL) return;
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
});
afterAll(async () => {
  if (!REPLSET_URL) return;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
jest.setTimeout(60000);

const id = () => new mongoose.Types.ObjectId();
const ORG = id();
const BRANCH = id();
const OTHER_BRANCH = id();
const ctx = { organizationId: ORG, branchId: String(BRANCH) };
const at = (iso) => new Date(iso);
const scoped = (doc) => ({ _id: id(), organizationId: ORG, branchId: BRANCH, ...doc });
const PERIOD = { startDate: '2026-10-01', endDate: '2026-10-05' };

const insertProduct = async (name, overrides = {}) => {
  const doc = scoped({
    name,
    unit: 'pcs',
    price: 10,
    cost: 2,
    stockQuantity: 0,
    hasVariants: false,
    isActive: true,
    productType: 'packaging_material',
    ...overrides,
  });
  await Product.collection.insertOne(doc);
  return doc;
};

/**
 * Dabi (Packing › Dabbi, brand Biotox) — 70 in stock now:
 *   20 Sep  purchased 100                (before the period → opening 100)
 *   02 Oct  issued 20 to production, purchased 10
 *   03 Oct  20:00 UTC = 04 Oct 01:00 Karachi — 15 to production stock
 *   07 Oct  5 more to production stock   (after the period)
 * Cap white (Bottle/cap) — 40 now: 01 Oct count loss 10, 05 Oct transfer out 5.
 * Sticker — only the legacy name "packing" (no categories[]), 8 in stock, never moved.
 * Loose — no category, nothing in stock, never moved.
 */
const setup = async () => {
  const packing = scoped({ name: 'Packing' });
  const bottles = scoped({ name: 'Bottle/cap' });
  await Category.collection.insertMany([packing, bottles]);
  const dabbi = scoped({ name: 'Dabbi', category: packing._id });
  await SubCategory.collection.insertOne(dabbi);
  const biotox = scoped({ name: 'Biotox' });
  await Brand.collection.insertOne(biotox);

  const dabi = await insertProduct('Biotox dabi', {
    stockQuantity: 70,
    categories: [{ _id: packing._id, name: 'Packing' }],
    subCategories: [{ _id: dabbi._id, name: 'Dabbi' }],
    brandId: biotox._id,
  });
  const cap = await insertProduct('28MM Cap white', {
    unit: 'Bottle/cap',
    stockQuantity: 40,
    categories: [{ _id: bottles._id, name: 'Bottle/cap' }],
  });
  const sticker = await insertProduct('Biotox sticker', { stockQuantity: 8, category: 'packing', categories: [] });
  const loose = await insertProduct('Loose item', { productType: 'raw_material' });
  // Same name in another branch — never on this branch's sheet.
  await Product.collection.insertOne({ ...dabi, _id: id(), branchId: OTHER_BRANCH, stockQuantity: 999 });

  const purchase = (date, product, quantity) =>
    Purchase.collection.insertOne(scoped({ purchaseDate: at(date), invoiceNumber: 'P', items: [{ product, quantity }] }));
  const floorIssue = (date, productId, quantity) =>
    FloorStockVoucher.collection.insertOne(
      scoped({
        status: 'posted',
        kind: 'issue',
        voucherNumber: `PSI-${date}`,
        voucherDate: at(date),
        lines: [{ productId, quantity }],
      })
    );
  await purchase('2026-09-20T06:00:00Z', dabi._id, 100);
  await MaterialIssue.collection.insertOne(
    scoped({
      status: 'posted',
      kind: 'issue',
      issueDate: at('2026-10-02T05:00:00Z'),
      lines: [{ productId: dabi._id, quantity: 20 }],
    })
  );
  // A cancelled voucher moves nothing.
  await MaterialIssue.collection.insertOne(
    scoped({
      status: 'cancelled',
      kind: 'issue',
      issueDate: at('2026-10-02T05:00:00Z'),
      lines: [{ productId: dabi._id, quantity: 999 }],
    })
  );
  await purchase('2026-10-02T09:00:00Z', dabi._id, 10);
  await floorIssue('2026-10-03T20:00:00Z', dabi._id, 15);
  await floorIssue('2026-10-07T06:00:00Z', dabi._id, 5);
  await StockAdjustment.collection.insertOne(
    scoped({ productId: cap._id, direction: 'decrease', quantity: 10, createdAt: at('2026-10-01T07:00:00Z') })
  );
  await InventoryTransfer.collection.insertOne({
    _id: id(),
    organizationId: ORG,
    fromBranchId: BRANCH,
    toBranchId: OTHER_BRANCH,
    fromProductId: cap._id,
    toProductId: id(),
    quantity: 5,
    status: 'completed',
    createdAt: at('2026-10-05T06:00:00Z'),
    completedAt: at('2026-10-05T06:00:00Z'),
  });
  return { packing, bottles, dabbi, biotox, dabi, cap, sticker, loose };
};

const sheet = (q = {}) => getReport(ctx, 'stock-sheet', { ...PERIOD, ...q });
const rowsOf = (data) => data.groups.flatMap((g) => g.rows);
const rowOf = (data, p) => rowsOf(data).find((r) => r.productId === String(p._id));

describeDb('Inventory stock sheet', () => {
  test('day by day issue · receive · balance per category, walked back from live stock', async () => {
    const { dabi, cap, sticker, loose } = await setup();
    const data = await sheet();

    expect(data.buckets.map((b) => b.key)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']);
    // One table per category, alphabetical; the name-only "packing" joins Packing; no category last.
    expect(data.groups.map((g) => [g.name, g.rows.map((r) => r.name)])).toEqual([
      ['Bottle/cap', ['28MM Cap white']],
      ['Packing', ['Biotox dabi', 'Biotox sticker']],
      ['', ['Loose item']],
    ]);
    expect(data.groups[2].none).toBe(true);

    const d = rowOf(data, dabi);
    expect(d.opening).toBe(100);
    expect(d.cells).toEqual([
      [0, 0, 100],
      [20, 10, 90],
      [0, 0, 90],
      [15, 0, 75], // 20:00 UTC on the 3rd is the 4th in Karachi
      [0, 0, 75],
    ]);
    expect([d.issue, d.receive, d.closing, d.current]).toEqual([35, 10, 75, 70]);

    const c = rowOf(data, cap);
    expect(c.opening).toBe(55);
    expect(c.cells.map((x) => x[2])).toEqual([45, 45, 45, 45, 40]);
    expect(c.cells[4]).toEqual([5, 0, 40]);

    expect(rowOf(data, sticker).cells.every((x) => x[0] === 0 && x[1] === 0 && x[2] === 8)).toBe(true);
    expect(rowOf(data, loose)).toBeDefined();
    expect(data.totals).toMatchObject({ products: 4, moved: 2, negative: 0 });
    // Closing value at the product cost (2).
    expect(data.totals.closingValue).toBe((75 + 40 + 8) * 2);
    expect(data.groups[0].unit).toBe('Bottle/cap');
    expect(data.groups[1].unit).toBe('pcs');
  });

  test('filters by category, sub-category, brand and type; offers what is in use', async () => {
    const { packing, bottles, dabbi, biotox, dabi, cap, sticker } = await setup();
    const all = await sheet();
    expect(all.options.categories).toEqual([
      { id: String(bottles._id), name: 'Bottle/cap', count: 1 },
      // The name-only sticker folds into Packing.
      { id: String(packing._id), name: 'Packing', count: 2 },
    ]);
    expect(all.options.noCategory).toBe(1);
    expect(all.options.subCategories).toEqual([
      { id: String(dabbi._id), name: 'Dabbi', categoryId: String(packing._id), count: 1 },
    ]);
    expect(all.options.brands).toEqual([{ id: String(biotox._id), name: 'Biotox', count: 1 }]);

    const byPacking = await sheet({ categoryIds: String(packing._id) });
    expect(rowsOf(byPacking).map((r) => r.name)).toEqual(['Biotox dabi', 'Biotox sticker']);

    const twoCats = await sheet({ categoryIds: [packing._id, bottles._id].join(',') });
    expect(rowsOf(twoCats)).toHaveLength(3);

    expect(rowsOf(await sheet({ subCategoryIds: String(dabbi._id) })).map((r) => r.productId)).toEqual([String(dabi._id)]);
    expect(rowsOf(await sheet({ brandIds: 'none', categoryIds: String(packing._id) })).map((r) => r.productId)).toEqual([
      String(sticker._id),
    ]);
    expect(rowsOf(await sheet({ categoryIds: 'none' })).map((r) => r.name)).toEqual(['Loose item']);
    expect(rowsOf(await sheet({ productTypes: 'raw_material' })).map((r) => r.name)).toEqual(['Loose item']);
    expect(rowsOf(await sheet({ search: 'cap' })).map((r) => r.productId)).toEqual([String(cap._id)]);
  });

  test('weekly and monthly columns, active dates only, idle items hidden, grouping', async () => {
    const { dabi, cap, packing } = await setup();

    // 1 Oct 2026 is a Thursday: Thu–Sun, then Monday the 5th.
    const weekly = await sheet({ interval: 'week' });
    expect(weekly.buckets).toEqual([
      { key: '2026-09-28', start: '2026-10-01', end: '2026-10-04' },
      { key: '2026-10-05', start: '2026-10-05', end: '2026-10-05' },
    ]);
    expect(rowOf(weekly, dabi).cells).toEqual([
      [35, 10, 75],
      [0, 0, 75],
    ]);
    const monthly = await sheet({ interval: 'month', startDate: '2026-09-01', endDate: '2026-10-31' });
    expect(monthly.buckets.map((b) => b.key)).toEqual(['2026-09', '2026-10']);
    expect(rowOf(monthly, dabi).opening).toBe(0);
    // October includes the 7th: 20 + 15 + 5 issued.
    expect(rowOf(monthly, dabi).cells).toEqual([
      [0, 100, 100],
      [40, 10, 70],
    ]);

    const active = await sheet({ activeDays: true, categoryIds: String(packing._id) });
    expect(active.buckets.map((b) => b.key)).toEqual(['2026-10-02', '2026-10-04']);
    expect(active.hiddenBuckets).toBe(3);
    expect(rowOf(active, dabi).cells).toEqual([
      [20, 10, 90],
      [15, 0, 75],
    ]);

    const busy = await sheet({ hideIdle: true });
    expect(
      rowsOf(busy)
        .map((r) => r.name)
        .sort()
    ).toEqual(['28MM Cap white', 'Biotox dabi', 'Biotox sticker']);

    const byBrand = await sheet({ groupBy: 'brand' });
    expect(byBrand.groups.map((g) => [g.name, g.rows.length])).toEqual([
      ['Biotox', 1],
      ['', 3],
    ]);
    const bySub = await sheet({ groupBy: 'subcategory' });
    expect(bySub.groups.find((g) => g.name === 'Dabbi')).toMatchObject({ parent: 'Packing' });
    const byType = await sheet({ groupBy: 'type' });
    expect(byType.groups.map((g) => g.key)).toEqual(['raw_material', 'packaging_material']);
    const flat = await sheet({ groupBy: 'none' });
    expect(flat.groups).toHaveLength(1);
    expect(rowOf(flat, cap).closing).toBe(40);
  });
});
