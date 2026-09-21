const mongoose = require('mongoose');
const setupTestDB = require('../../utils/setupTestDB');
const {
  Branch,
  Category,
  Inventory,
  MasterProduct,
  Membership,
  Product,
  ProductVariant,
  User,
} = require('../../../src/models');
const masterProductService = require('../../../src/services/masterProduct.service');
const productBranchSyncService = require('../../../src/services/productBranchSync.service');
const { addedTodayFilter } = require('../../../src/utils/addedToday');
const { getBusinessDayRange } = require('../../../src/utils/businessTimezone');

/**
 * "Sync Across Branches", end-to-end against real (in-memory Mongo) documents: what lands in
 * the other branches, that repeating it is harmless and never overwrites, who may target
 * which branch, and that "added today" follows the Pakistan calendar.
 */
setupTestDB();
jest.setTimeout(60000);

const organizationId = new mongoose.Types.ObjectId();
let main;
let city;
let mall;
let admin;

const createSource = (overrides = {}) =>
  Product.create({
    organizationId,
    branchId: main._id,
    createdBy: admin._id,
    price: 150,
    cost: 100,
    stockQuantity: 5,
    ...overrides,
  });

const sync = (products, targets, { userId = admin._id, branchId = main._id } = {}) =>
  productBranchSyncService.syncProductsToBranches({
    userId,
    organizationId,
    branchId,
    productIds: [].concat(products).map((p) => String(p._id || p)),
    branchIds: [].concat(targets).map((b) => String(b._id || b)),
  });

const branchRow = (result, branch) => result.branches.find((row) => row.branchId === String(branch._id));

beforeEach(async () => {
  [main, city, mall] = await Branch.create([
    { organizationId, name: 'Main Branch' },
    { organizationId, name: 'City Branch' },
    { organizationId, name: 'Mall Branch' },
  ]);
  admin = await User.create({
    name: 'Owner',
    email: 'owner@example.com',
    password: 'password1',
    organizationId,
    systemRole: 'superAdmin',
  });
});

describe('what a synced product looks like', () => {
  test('copies the source product to every chosen branch with the same details and no stock', async () => {
    const taxCategoryId = new mongoose.Types.ObjectId();
    const brandId = new mongoose.Types.ObjectId();
    const sourceCategory = await Category.create({ organizationId, branchId: main._id, name: 'Food', createdBy: admin._id });
    const source = await createSource({
      name: 'Zinger Burger',
      nameUrdu: 'زنگر برگر',
      description: 'Spicy',
      barcode: 'B-1',
      sku: 'S-1',
      price: 250,
      cost: 180,
      stockQuantity: 40,
      unit: 'pcs',
      taxCategoryId,
      brandId,
      tags: ['hot', 'fast-food'],
      color: '#ff0000',
      lowStockThreshold: 8,
      criticalStockThreshold: 3,
      shelfLocation: 'A-12-3',
      supplier: new mongoose.Types.ObjectId(),
      image: { url: 'https://img.example/zinger.png', publicId: 'zinger' },
      categories: [{ _id: sourceCategory._id, name: 'Food' }],
      category: 'Food',
    });

    const result = await sync(source, [city, mall]);

    expect(result.branches.map((b) => [b.branchName, b.syncedCount, b.failedCount])).toEqual([
      ['City Branch', 1, 0],
      ['Mall Branch', 1, 0],
    ]);
    const masterId = (await Product.findById(source._id)).masterProductId;
    expect(masterId).toBeTruthy();

    for (const branch of [city, mall]) {
      const copy = await Product.findOne({ organizationId, branchId: branch._id });
      expect(copy).toMatchObject({
        name: 'Zinger Burger',
        nameUrdu: 'زنگر برگر',
        description: 'Spicy',
        barcode: 'B-1',
        sku: 'S-1',
        price: 250,
        cost: 180,
        unit: 'pcs',
        isActive: true,
        stockQuantity: 0,
        color: '#ff0000',
        lowStockThreshold: 8,
        criticalStockThreshold: 3,
      });
      expect(String(copy.masterProductId)).toBe(String(masterId));
      expect(String(copy.taxCategoryId)).toBe(String(taxCategoryId));
      expect(String(copy.brandId)).toBe(String(brandId));
      expect([...copy.tags]).toEqual(['hot', 'fast-food']);
      expect(copy.image.url).toBe('https://img.example/zinger.png');
      // A branch-specific place and a branch-owned supplier never travel.
      expect(copy.shelfLocation).toBe('');
      expect(copy.supplier).toBeUndefined();
      // The category is that branch's own document, found or created by name.
      const branchCategory = await Category.findOne({ organizationId, branchId: branch._id, name: 'Food' });
      expect(branchCategory).toBeTruthy();
      expect(String(copy.categories[0]._id)).toBe(String(branchCategory._id));
    }

    // The source is untouched, stock included.
    expect(await Product.findById(source._id)).toMatchObject({ stockQuantity: 40, shelfLocation: 'A-12-3' });
    expect(await Product.countDocuments({ organizationId, branchId: main._id })).toBe(1);
  });

  test("uses the source's current details, not the catalog entry it was first linked with", async () => {
    const source = await createSource({ name: 'Zinger Burgr', barcode: 'B-1', price: 200, cost: 150 });
    await masterProductService.linkProductToMasterProduct(await Product.findById(source._id));

    // The typo is fixed and the price changed afterwards — editing never refreshes the catalog entry.
    await Product.updateOne({ _id: source._id }, { $set: { name: 'Zinger Burger', price: 275, barcode: 'B-1-NEW' } });

    await sync(source, [city]);

    const copy = await Product.findOne({ organizationId, branchId: city._id });
    expect(copy).toMatchObject({ name: 'Zinger Burger', price: 275, barcode: 'B-1-NEW' });
    expect((await MasterProduct.findById(copy.masterProductId)).name).toBe('Zinger Burgr');
  });

  test('a barcode the source does not have is not invented from the catalog', async () => {
    const source = await createSource({ name: 'Loose Item', barcode: 'B-9' });
    await masterProductService.linkProductToMasterProduct(await Product.findById(source._id));
    await Product.updateOne({ _id: source._id }, { $unset: { barcode: '' } });

    await sync(source, [city]);

    expect((await Product.findOne({ organizationId, branchId: city._id })).barcode).toBeUndefined();
  });

  test('starts active or inactive exactly as the source is', async () => {
    const live = await createSource({ name: 'Live', isActive: true });
    const draft = await createSource({ name: 'Draft', isActive: false });

    await sync([live, draft], [city]);

    expect((await Product.findOne({ branchId: city._id, name: 'Live' })).isActive).toBe(true);
    expect((await Product.findOne({ branchId: city._id, name: 'Draft' })).isActive).toBe(false);
  });

  test('a batch-tracked product keeps its batch and expiry tracking, with an empty stock row', async () => {
    const source = await createSource({ name: 'Milk', barcode: 'M-1' });
    await ProductVariant.create({
      organizationId,
      branchId: main._id,
      productId: source._id,
      isDefault: true,
      price: 150,
      cost: 100,
      trackBatch: true,
      trackExpiry: true,
    });

    await sync(source, [city]);

    const copy = await Product.findOne({ branchId: city._id });
    const defaultVariant = await ProductVariant.findOne({ productId: copy._id, isDefault: true });
    expect(defaultVariant).toMatchObject({ trackBatch: true, trackExpiry: true });
    expect((await Inventory.findOne({ productId: copy._id })).quantity).toBe(0);
  });
});

describe('variant products', () => {
  const attrs = (size) => ({ Size: size });

  test('brings the active variants with their SKU, barcode, attributes and prices, and leaves a switched-off one behind', async () => {
    const source = await createSource({ name: 'T-Shirt', hasVariants: true });
    await ProductVariant.create([
      { organizationId, branchId: main._id, productId: source._id, sku: 'TS-S', barcode: '111', attributes: attrs('S'), price: 900, cost: 600 },
      { organizationId, branchId: main._id, productId: source._id, sku: 'TS-M', barcode: '222', attributes: attrs('M'), price: 950, cost: 620 },
      { organizationId, branchId: main._id, productId: source._id, sku: 'TS-XL', barcode: '333', attributes: attrs('XL'), price: 999, cost: 700, isActive: false },
    ]);

    const result = await sync(source, [city]);

    expect(branchRow(result, city)).toMatchObject({ syncedCount: 1, failedCount: 0 });
    const copy = await Product.findOne({ branchId: city._id });
    expect(copy.hasVariants).toBe(true);
    const variants = await ProductVariant.find({ productId: copy._id, isDefault: false }).sort({ sku: 1 });
    expect(variants.map((v) => [v.sku, v.barcode, v.attributes.get('Size'), v.price, v.cost, v.isActive])).toEqual([
      ['TS-M', '222', 'M', 950, 620, true],
      ['TS-S', '111', 'S', 900, 600, true],
    ]);
    expect(await Inventory.countDocuments({ productId: copy._id })).toBe(2);
    expect(variants.every((v) => v.masterVariantId)).toBe(true);
  });

  test('includes variants created after the product was first linked to the catalog', async () => {
    // Add Product saves the product (linking it), and only then saves its variants.
    const source = await createSource({ name: 'Sneakers', hasVariants: true });
    await masterProductService.linkProductToMasterProduct(await Product.findById(source._id));
    await ProductVariant.create({ organizationId, branchId: main._id, productId: source._id, sku: 'SN-42', attributes: attrs('42'), price: 5000, cost: 3500 });

    await sync(source, [city]);

    const copy = await Product.findOne({ branchId: city._id });
    expect(await ProductVariant.countDocuments({ productId: copy._id, isDefault: false, sku: 'SN-42' })).toBe(1);
  });
});

describe('repeating a sync', () => {
  test('never creates a second copy and never overwrites what a branch already has', async () => {
    const source = await createSource({ name: 'Cola', barcode: 'C-1', price: 100 });
    await sync(source, [city]);
    await Product.updateOne({ branchId: city._id, name: 'Cola' }, { $set: { price: 999, stockQuantity: 12 } });

    const again = await sync(source, [city, mall]);

    expect(branchRow(again, city)).toMatchObject({ syncedCount: 0, alreadyPresentCount: 1 });
    expect(branchRow(again, mall)).toMatchObject({ syncedCount: 1, alreadyPresentCount: 0 });
    expect(await Product.countDocuments({ branchId: city._id })).toBe(1);
    expect(await Product.findOne({ branchId: city._id })).toMatchObject({ price: 999, stockQuantity: 12 });
  });

  test('recognises a product the branch already has from before catalogs existed', async () => {
    const source = await createSource({ name: 'Cola', barcode: 'C-1' });
    // Typed in by hand at City long ago — never linked to anything.
    await Product.create({ organizationId, branchId: city._id, name: 'Cola', barcode: 'C-1', price: 90, cost: 60, stockQuantity: 7 });

    const result = await sync(source, [city]);

    expect(branchRow(result, city)).toMatchObject({ syncedCount: 0, alreadyPresentCount: 1 });
    expect(await Product.countDocuments({ branchId: city._id })).toBe(1);
  });

  test('two syncs into one branch at the same moment create the product once', async () => {
    const source = await createSource({ name: 'Cola', barcode: 'C-1' });

    const [a, b] = await Promise.all([sync(source, [city]), sync(source, [city])]);

    expect(await Product.countDocuments({ branchId: city._id })).toBe(1);
    expect(branchRow(a, city).syncedCount + branchRow(b, city).syncedCount).toBe(1);
    expect(branchRow(a, city).alreadyPresentCount + branchRow(b, city).alreadyPresentCount).toBe(1);
  });

  test('two products sharing one catalog entry: the oldest is synced and the other is reported, not dropped', async () => {
    const first = await createSource({ name: 'USB Charger', barcode: 'U-1' });
    const second = await createSource({ name: 'USB Charger', barcode: 'U-2' });
    // Added one at a time (as Add Product does), the second finds the first's catalog entry
    // by name — a barcode that nothing carries yet falls back to the name.
    await masterProductService.linkProductToMasterProduct(await Product.findById(first._id));
    await masterProductService.linkProductToMasterProduct(await Product.findById(second._id));
    expect((await Product.findById(second._id)).masterProductId).toEqual((await Product.findById(first._id)).masterProductId);

    const result = await sync([first, second], [city]);

    expect(await Product.find({ branchId: city._id }).distinct('barcode')).toEqual(['U-1']);
    expect(result.skipped).toEqual([
      expect.objectContaining({ productId: String(second._id), name: 'USB Charger', reason: expect.stringContaining('Same catalog entry') }),
    ]);
  });
});

describe('what a sync will and will not touch', () => {
  test('only takes products from the branch it is run in, and reports the rest as not found', async () => {
    const elsewhere = await Product.create({ organizationId, branchId: city._id, name: 'City Only', price: 10, cost: 5, stockQuantity: 1 });
    const mine = await createSource({ name: 'Mine' });

    const result = await sync([mine, elsewhere], [mall]);

    expect(result.notFoundCount).toBe(1);
    expect(await Product.find({ branchId: mall._id }).distinct('name')).toEqual(['Mine']);
  });

  test('one branch failing does not stop the others, and says which branch it was', async () => {
    const source = await createSource({ name: 'Cola', barcode: 'C-1' });
    const spy = jest.spyOn(masterProductService, 'importMasterProducts').mockImplementationOnce(() => Promise.reject(new Error('connection lost')));

    const result = await sync(source, [city, mall]);
    spy.mockRestore();

    expect(branchRow(result, city)).toMatchObject({ syncedCount: 0, failedCount: 1, error: expect.any(String) });
    expect(branchRow(result, city).failed[0]).toMatchObject({ productId: String(source._id), name: 'Cola' });
    expect(branchRow(result, mall)).toMatchObject({ syncedCount: 1, failedCount: 0 });
    expect(await Product.countDocuments({ branchId: mall._id })).toBe(1);
  });
});

describe('who may sync where', () => {
  let staff;
  beforeEach(async () => {
    staff = await User.create({ name: 'Cashier', email: 'cashier@example.com', password: 'password1', organizationId, systemRole: 'staff' });
    await Membership.create([
      { userId: staff._id, organizationId, branchId: main._id, role: 'staff' },
      { userId: staff._id, organizationId, branchId: city._id, role: 'staff' },
    ]);
  });

  test('a member can sync to the branches they belong to, and nowhere else', async () => {
    const source = await createSource({ name: 'Cola' });

    await expect(sync(source, [mall], { userId: staff._id })).rejects.toMatchObject({ statusCode: 403 });
    expect(await Product.countDocuments({ branchId: mall._id })).toBe(0);

    const ok = await sync(source, [city], { userId: staff._id });
    expect(branchRow(ok, city).syncedCount).toBe(1);
  });

  test('a request naming one forbidden branch writes nothing to the allowed ones either', async () => {
    const source = await createSource({ name: 'Cola' });

    await expect(sync(source, [city, mall], { userId: staff._id })).rejects.toMatchObject({ statusCode: 403 });

    expect(await Product.countDocuments({ branchId: city._id })).toBe(0);
  });

  test('cannot target the branch the products already live in', async () => {
    const source = await createSource({ name: 'Cola' });
    await expect(sync(source, [main])).rejects.toMatchObject({ statusCode: 400 });
  });

  test("cannot reach an inactive branch or another organization's branch", async () => {
    const source = await createSource({ name: 'Cola' });
    await Branch.updateOne({ _id: mall._id }, { $set: { isActive: false } });
    const foreign = await Branch.create({ organizationId: new mongoose.Types.ObjectId(), name: 'Somebody Else' });

    await expect(sync(source, [mall])).rejects.toMatchObject({ statusCode: 403 });
    await expect(sync(source, [foreign])).rejects.toMatchObject({ statusCode: 403 });
  });

  test('the branches offered exclude the current one and respect membership', async () => {
    const forAdmin = await productBranchSyncService.listTargetBranches({ userId: admin._id, organizationId, sourceBranchId: main._id });
    const forStaff = await productBranchSyncService.listTargetBranches({ userId: staff._id, organizationId, sourceBranchId: main._id });

    expect(forAdmin.map((b) => b.name).sort()).toEqual(['City Branch', 'Mall Branch']);
    expect(forStaff.map((b) => b.name)).toEqual(['City Branch']);
  });
});

describe('previewBranchSync', () => {
  const preview = (args) => productBranchSyncService.previewBranchSync({ userId: admin._id, organizationId, branchId: main._id, ...args });

  test('says how many products each branch is missing and already has', async () => {
    const a = await createSource({ name: 'Alpha', barcode: 'A' });
    const b = await createSource({ name: 'Beta', barcode: 'B' });
    await createSource({ name: 'Gamma', barcode: 'G' });
    await sync(a, [city]);

    const result = await preview({ productIds: [String(a._id), String(b._id), String(new mongoose.Types.ObjectId())] });

    expect(result).toMatchObject({ foundCount: 2, notFoundCount: 1, syncableCount: 2 });
    expect(result.productIds).toEqual([String(a._id), String(b._id)]);
    expect(result.targets.find((t) => t.name === 'City Branch')).toMatchObject({ presentCount: 1, missingCount: 1 });
    expect(result.targets.find((t) => t.name === 'Mall Branch')).toMatchObject({ presentCount: 0, missingCount: 2 });
    // Looking is not doing.
    expect(await Product.countDocuments({ branchId: mall._id })).toBe(0);
  });

  test("'addedToday' resolves to this branch's products created today, Pakistan time, and no others", async () => {
    const today = await createSource({ name: 'Today' });
    const yesterday = await createSource({ name: 'Yesterday' });
    const otherBranch = await Product.create({ organizationId, branchId: city._id, name: 'Elsewhere Today', price: 1, cost: 1, stockQuantity: 0 });
    // Timestamps are set by Mongoose on insert, so backdate straight in the collection.
    await Product.collection.updateOne({ _id: yesterday._id }, { $set: { createdAt: new Date(Date.now() - 36 * 60 * 60 * 1000) } });

    const result = await preview({ scope: 'addedToday' });

    expect(result.productIds).toEqual([String(today._id)]);
    expect(result.productIds).not.toContain(String(otherBranch._id));
  });
});

describe('"added today" follows the Pakistan calendar', () => {
  // Pakistan is UTC+5 all year: its midnight is 19:00 UTC the evening before.
  test('rolls over at 00:00 PKT, not at UTC midnight', () => {
    const lastSecond = getBusinessDayRange(new Date('2026-09-21T18:59:59.999Z'));
    const nextDay = getBusinessDayRange(new Date('2026-09-21T19:00:00.000Z'));

    expect(lastSecond.calendarDate).toBe('2026-09-21');
    expect(lastSecond.start.toISOString()).toBe('2026-09-20T19:00:00.000Z');
    expect(lastSecond.end.toISOString()).toBe('2026-09-21T18:59:59.999Z');
    expect(nextDay.calendarDate).toBe('2026-09-22');
  });

  test("a product added at 11:30pm is still today's, and is not tomorrow's", () => {
    const addedAt = new Date('2026-09-21T18:30:00.000Z'); // 23:30 PKT on the 21st
    const inWindow = (now) => {
      const { createdAt } = addedTodayFilter(now);
      return addedAt >= createdAt.$gte && addedAt <= createdAt.$lte;
    };

    expect(inWindow(new Date('2026-09-21T06:00:00.000Z'))).toBe(true); // 11:00 PKT that day
    expect(inWindow(new Date('2026-09-21T19:30:00.000Z'))).toBe(false); // half past midnight PKT, next day
  });
});
