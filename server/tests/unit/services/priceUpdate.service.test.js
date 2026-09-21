const mongoose = require('mongoose');
const setupTestDB = require('../../utils/setupTestDB');
const { Product, ProductVariant, Inventory, PriceChange, PriceUpdateBatch, PriceListAlias } = require('../../../src/models');
const service = require('../../../src/services/priceUpdate.service');

/**
 * A price update rewrites real product prices, so every write rule is pinned here against a
 * real (in-memory) MongoDB: what gets written, where it must NOT be written, what is recorded
 * for Undo, and what happens when the product changed between review and apply.
 */
setupTestDB();
jest.setTimeout(60000);

const ORG = new mongoose.Types.ObjectId();
const BRANCH = new mongoose.Types.ObjectId();
const OTHER_BRANCH = new mongoose.Types.ObjectId();
const USER = new mongoose.Types.ObjectId();
const scope = { organizationId: String(ORG), branchId: String(BRANCH) };
const apply = (items, meta = {}) => service.applyBatch({ ...scope, userId: String(USER), items, meta });

const makeProduct = (over = {}) =>
  Product.create({
    organizationId: ORG,
    branchId: BRANCH,
    name: 'Samsung Galaxy A15 4GB/128GB',
    price: 40000,
    cost: 36000,
    stockQuantity: 5,
    ...over,
  });

const fresh = (Model, id) => Model.findById(id).lean();

describe('priceUpdate.service', () => {
  describe('analyze', () => {
    test('parses text and matches simple products, with current cost/price/stock on each match', async () => {
      const a15 = await makeProduct();
      await makeProduct({ name: 'Infinix Hot 40i 4GB/128GB', price: 30000, cost: 27000, stockQuantity: 2 });

      const out = await service.analyze({ ...scope, text: '*SAMSUNG*\nA15 4/128 - 38,500\nHot 40i 4/128 = 27500\nWooden Chair 9999' });

      expect(out.rows).toHaveLength(3);
      const [first, second, third] = out.rows;
      expect(first.match).toMatchObject({ status: 'high' });
      expect(first.match.entry).toMatchObject({ productId: String(a15._id), cost: 36000, price: 40000, stock: 5 });
      expect(first.values[0].value).toBe(38500);
      expect(second.match.status).toBe('high');
      expect(third.match.status).toBe('none');
      expect(out.stats).toMatchObject({ matched: 2, unmatched: 1, catalogSize: 2 });
    });

    test('a product with real variants is matched per variant; its hidden default variant is not an item', async () => {
      const tee = await makeProduct({ name: 'Cotton Tee', hasVariants: true, price: 0, cost: 0 });
      const small = await ProductVariant.create({ organizationId: ORG, branchId: BRANCH, productId: tee._id, attributes: { Size: 'Small' }, price: 900, cost: 500 });
      await ProductVariant.create({ organizationId: ORG, branchId: BRANCH, productId: tee._id, attributes: { Size: 'Large' }, price: 1000, cost: 550 });
      await ProductVariant.create({ organizationId: ORG, branchId: BRANCH, productId: tee._id, isDefault: true, price: 0, cost: 0 });
      await Inventory.create({ organizationId: ORG, branchId: BRANCH, productId: tee._id, variantId: small._id, quantity: 7 });

      const out = await service.analyze({ ...scope, text: 'Cotton Tee Small - 650' });
      expect(out.stats.catalogSize).toBe(2);
      expect(out.rows[0].match.status).toBe('high');
      expect(out.rows[0].match.entry).toMatchObject({ variantId: String(small._id), cost: 500, price: 900, stock: 7, variantLabel: 'Small' });
    });

    test('never sees another branch\'s products', async () => {
      await makeProduct({ branchId: OTHER_BRANCH });
      const out = await service.analyze({ ...scope, text: 'Samsung Galaxy A15 4/128 - 38500' });
      expect(out.rows[0].match.status).toBe('none');
      expect(out.stats.catalogSize).toBe(0);
    });

    test('accepts structured rows (spreadsheet / AI) as well as text', async () => {
      await makeProduct();
      const out = await service.analyze({
        ...scope,
        rows: [
          { name: 'Samsung Galaxy A15 4/128', values: [{ value: 35000, kind: 'cost' }, { value: 39000, kind: 'price' }] },
          { name: '', values: [{ value: 5 }] },
          { name: 'No price here', values: [] },
        ],
      });
      expect(out.rows).toHaveLength(1);
      expect(out.rows[0].values.map((v) => v.kind)).toEqual(['cost', 'price']);
      expect(out.ignored.map((i) => i.reason).sort()).toEqual(['no_name', 'no_price']);
    });

    test('rejects an empty request', async () => {
      await expect(service.analyze({ ...scope, text: '   ' })).rejects.toThrow(/Paste a price list/);
    });
  });

  describe('applyBatch', () => {
    test('writes cost and price, records old/new, bumps the sync version, and summarizes', async () => {
      const p = await makeProduct();
      const out = await apply([{ productId: String(p._id), newCost: 38000, newPrice: 42000, sourceLine: 'A15 4/128 - 38000', matchMethod: 'name' }], { sourceType: 'whatsapp', priceMode: 'cost' });

      const after = await fresh(Product, p._id);
      expect(after).toMatchObject({ cost: 38000, price: 42000 });
      expect(after.syncVersion).toBe(2);
      expect(String(after.updatedBy)).toBe(String(USER));

      expect(out.stats).toMatchObject({ requested: 1, applied: 1, costUp: 1, priceUp: 1, avgCostChangePercent: 5.56 });
      expect(out.batch).toMatchObject({ status: 'applied', batchNumber: 1 });

      const change = await PriceChange.findOne({ productId: p._id }).lean();
      expect(change).toMatchObject({ oldCost: 36000, newCost: 38000, oldPrice: 40000, newPrice: 42000, costChanged: true, priceChanged: true, status: 'applied', sourceLine: 'A15 4/128 - 38000' });
    });

    test('updating only the cost leaves the price alone', async () => {
      const p = await makeProduct();
      await apply([{ productId: String(p._id), newCost: 37000 }]);
      expect(await fresh(Product, p._id)).toMatchObject({ cost: 37000, price: 40000 });
      const change = await PriceChange.findOne({ productId: p._id }).lean();
      expect(change).toMatchObject({ costChanged: true, priceChanged: false, newPrice: null });
    });

    test('a line that already matches is reported unchanged and writes nothing', async () => {
      const p = await makeProduct();
      const out = await apply([{ productId: String(p._id), newCost: 36000, newPrice: 40000 }]);
      expect(out.results[0].status).toBe('unchanged');
      expect(out.batch.status).toBe('failed'); // nothing applied
      expect((await fresh(Product, p._id)).syncVersion).toBe(1);
    });

    test('numbers are batch-numbered per organization, increasing', async () => {
      const p = await makeProduct();
      const one = await apply([{ productId: String(p._id), newCost: 37000 }]);
      const two = await apply([{ productId: String(p._id), newCost: 38000 }]);
      expect([one.batch.batchNumber, two.batch.batchNumber]).toEqual([1, 2]);
    });

    test('NEVER writes to a product outside the caller\'s branch', async () => {
      const foreign = await makeProduct({ branchId: OTHER_BRANCH, name: 'Foreign Item' });
      const out = await apply([{ productId: String(foreign._id), newCost: 1, newPrice: 1 }]);
      expect(out.results[0]).toMatchObject({ status: 'failed', message: expect.stringMatching(/not found/i) });
      expect(await fresh(Product, foreign._id)).toMatchObject({ cost: 36000, price: 40000 });
    });

    test('a stale review is skipped, not overwritten (expected old value differs)', async () => {
      const p = await makeProduct();
      // The screen showed cost 30000, but a purchase has since set it to 36000.
      const out = await apply([{ productId: String(p._id), newCost: 38000, expectedOldCost: 30000 }]);
      expect(out.results[0].status).toBe('stale');
      expect(out.results[0].message).toMatch(/Cost changed/);
      expect((await fresh(Product, p._id)).cost).toBe(36000);
    });

    // A REAL race: a competing write lands after we read the product but before our update runs.
    // The spy performs that competing write, then delegates to the real updateOne — so only the
    // filter in applyBatch (not a mock's return value) can save the newer value.
    const raceOnce = (Model, competingWrite) => {
      const real = Model.updateOne.bind(Model);
      return jest.spyOn(Model, 'updateOne').mockImplementationOnce(async (...args) => {
        await Model.collection.updateOne({ _id: args[0]._id }, { $set: competingWrite });
        return real(...args);
      });
    };

    test('a COST change that lands between reading and writing is not overwritten', async () => {
      const p = await makeProduct();
      const spy = raceOnce(Product, { cost: 39999 });
      const out = await apply([{ productId: String(p._id), newCost: 38000 }]);
      spy.mockRestore();
      expect(out.results[0].status).toBe('stale');
      expect((await fresh(Product, p._id)).cost).toBe(39999); // the competing write survives
      expect((await PriceChange.findOne({ productId: p._id }).lean()).status).toBe('stale');
    });

    test('a PRICE change that lands between reading and writing is not overwritten', async () => {
      const p = await makeProduct();
      const spy = raceOnce(Product, { price: 45555 });
      const out = await apply([{ productId: String(p._id), newPrice: 42000 }]);
      spy.mockRestore();
      expect(out.results[0].status).toBe('stale');
      expect((await fresh(Product, p._id)).price).toBe(45555);
    });

    test('the same guard protects a variant', async () => {
      const tee = await makeProduct({ name: 'Cotton Tee', hasVariants: true });
      const v = await ProductVariant.create({ organizationId: ORG, branchId: BRANCH, productId: tee._id, price: 900, cost: 500 });
      const spy = raceOnce(ProductVariant, { cost: 777 });
      const out = await apply([{ productId: String(tee._id), variantId: String(v._id), newCost: 600 }]);
      spy.mockRestore();
      expect(out.results[0].status).toBe('stale');
      expect((await fresh(ProductVariant, v._id)).cost).toBe(777);
    });

    test('every line is recorded — applied and skipped alike — against the right product', async () => {
      const good = await makeProduct({ name: 'Good' });
      const missing = String(new mongoose.Types.ObjectId());
      const same = await makeProduct({ name: 'Same' });
      const stale = await makeProduct({ name: 'Stale' });
      await apply(
        [
          { productId: missing, newCost: 5 },
          { productId: String(good._id), newCost: 37000 },
          { productId: String(same._id), newCost: 36000 },
          { productId: String(stale._id), newCost: 37000, expectedOldCost: 1 },
        ],
        {},
      );
      const rows = await PriceChange.find({}).lean();
      const byName = (n) => rows.find((r) => r.productName === n);
      expect(rows).toHaveLength(4);
      expect(byName('Good')).toMatchObject({ status: 'applied', newCost: 37000 });
      expect(byName('Same')).toMatchObject({ status: 'unchanged' });
      expect(byName('Stale')).toMatchObject({ status: 'stale' });
      expect(rows.find((r) => String(r.productId) === missing)).toMatchObject({ status: 'failed' });
    });

    test('a product with variants cannot be updated through its legacy fields', async () => {
      const tee = await makeProduct({ name: 'Cotton Tee', hasVariants: true });
      const out = await apply([{ productId: String(tee._id), newCost: 1, newPrice: 2 }]);
      expect(out.results[0]).toMatchObject({ status: 'failed', message: expect.stringMatching(/variant/i) });
      expect(await fresh(Product, tee._id)).toMatchObject({ cost: 36000, price: 40000 });
    });

    test('a variant is updated on the variant, and the parent product is left untouched', async () => {
      const tee = await makeProduct({ name: 'Cotton Tee', hasVariants: true, price: 0, cost: 0 });
      const small = await ProductVariant.create({ organizationId: ORG, branchId: BRANCH, productId: tee._id, attributes: { Size: 'Small' }, price: 900, cost: 500 });
      const out = await apply([{ productId: String(tee._id), variantId: String(small._id), newCost: 600, newPrice: 1100 }]);
      expect(out.results[0].status).toBe('applied');
      expect(await fresh(ProductVariant, small._id)).toMatchObject({ cost: 600, price: 1100 });
      expect(await fresh(Product, tee._id)).toMatchObject({ cost: 0, price: 0, syncVersion: 1 });
      const change = await PriceChange.findOne({ variantId: small._id }).lean();
      expect(change.variantLabel).toBe('Small');
    });

    test('a variant id that belongs to a different product is rejected', async () => {
      const a = await makeProduct({ name: 'A', hasVariants: true });
      const b = await makeProduct({ name: 'B', hasVariants: true });
      const vb = await ProductVariant.create({ organizationId: ORG, branchId: BRANCH, productId: b._id, price: 1, cost: 1 });
      const out = await apply([{ productId: String(a._id), variantId: String(vb._id), newCost: 5 }]);
      expect(out.results[0].status).toBe('failed');
      expect(await fresh(ProductVariant, vb._id)).toMatchObject({ cost: 1 });
    });

    test('two lines for the same product: the last wins, the repeat is reported', async () => {
      const p = await makeProduct();
      const out = await apply([
        { productId: String(p._id), newCost: 37000 },
        { productId: String(p._id), newCost: 38000 },
      ]);
      expect((await fresh(Product, p._id)).cost).toBe(38000);
      expect(out.stats).toMatchObject({ applied: 1, failed: 1 });
    });

    test('rejects negative or missing prices per item without failing the batch', async () => {
      const good = await makeProduct();
      const bad = await makeProduct({ name: 'Other' });
      const out = await apply([
        { productId: String(good._id), newCost: 37000 },
        { productId: String(bad._id), newCost: -5 },
      ]);
      expect(out.results.map((r) => r.status)).toEqual(['applied', 'failed']);
      expect((await fresh(Product, bad._id)).cost).toBe(36000);
    });

    test('rejects an empty or oversized request', async () => {
      await expect(apply([])).rejects.toThrow(/Nothing to update/);
      await expect(apply(new Array(5001).fill({ productId: String(new mongoose.Types.ObjectId()), newCost: 1 }))).rejects.toThrow(/Too many/);
    });
  });

  describe('remembered matches (aliases)', () => {
    test('a match the user chose by hand is learned and used next time, ahead of fuzzy matching', async () => {
      const p = await makeProduct({ name: 'Samsung Galaxy A15 4GB/128GB' });
      // "Galaxy Fifteen" would never fuzzy-match; the user linked it manually.
      const before = await service.analyze({ ...scope, text: 'Galaxy Fifteen - 38500' });
      expect(before.rows[0].match.status).toBe('none');

      await apply([{ productId: String(p._id), newCost: 38500, listName: 'Galaxy Fifteen', matchMethod: 'manual' }]);
      const after = await service.analyze({ ...scope, text: 'Galaxy Fifteen - 39000' });
      expect(after.rows[0].match).toMatchObject({ status: 'high', method: 'alias' });
      expect(after.rows[0].match.entry.productId).toBe(String(p._id));
    });

    test('an automatic match is NOT learned (one bad auto-match must not become permanent)', async () => {
      const p = await makeProduct();
      await apply([{ productId: String(p._id), newCost: 38500, listName: 'Samsung Galaxy A15 4/128', matchMethod: 'name' }]);
      expect(await PriceListAlias.countDocuments()).toBe(0);
    });

    test('a supplier-specific alias beats the general one for the same text', async () => {
      const a = await makeProduct({ name: 'Product A' });
      const b = await makeProduct({ name: 'Product B' });
      const supplierId = String(new mongoose.Types.ObjectId());
      await apply([{ productId: String(a._id), newCost: 1, listName: 'Widget', matchMethod: 'manual' }]);
      await apply([{ productId: String(b._id), newCost: 1, listName: 'Widget', matchMethod: 'manual' }], { supplierId });

      const general = await service.analyze({ ...scope, text: 'Widget - 500' });
      const forSupplier = await service.analyze({ ...scope, supplierId, text: 'Widget - 500' });
      expect(general.rows[0].match.entry.productId).toBe(String(a._id));
      expect(forSupplier.rows[0].match.entry.productId).toBe(String(b._id));
    });

    test('an alias pointing at a deleted product falls back to normal matching', async () => {
      const p = await makeProduct();
      await apply([{ productId: String(p._id), newCost: 1, listName: 'Old Name', matchMethod: 'manual' }]);
      await Product.deleteOne({ _id: p._id });
      const out = await service.analyze({ ...scope, text: 'Old Name - 500' });
      expect(out.rows[0].match.status).toBe('none');
    });

    test('saved matches can be listed and deleted', async () => {
      const p = await makeProduct();
      await apply([{ productId: String(p._id), newCost: 1, listName: 'Widget', matchMethod: 'manual' }]);
      const [alias] = await service.listAliases(scope);
      expect(alias).toMatchObject({ aliasText: 'Widget', productName: p.name });
      await service.deleteAlias({ ...scope, aliasId: alias.id });
      expect(await service.listAliases(scope)).toHaveLength(0);
      await expect(service.deleteAlias({ ...scope, aliasId: alias.id })).rejects.toThrow(/not found/i);
    });
  });

  describe('rollbackBatch', () => {
    test('restores every changed product to exactly what it held', async () => {
      const a = await makeProduct({ name: 'A' });
      const b = await makeProduct({ name: 'B', cost: 100, price: 150 });
      const { batch } = await apply([
        { productId: String(a._id), newCost: 38000, newPrice: 42000 },
        { productId: String(b._id), newCost: 120 },
      ]);

      const out = await service.rollbackBatch({ ...scope, userId: String(USER), batchId: batch.id });
      expect(out).toMatchObject({ reverted: 2, conflicts: 0 });
      expect(await fresh(Product, a._id)).toMatchObject({ cost: 36000, price: 40000 });
      expect(await fresh(Product, b._id)).toMatchObject({ cost: 100, price: 150 });
      expect((await PriceUpdateBatch.findById(batch.id)).status).toBe('rolled_back');
      expect(await PriceChange.countDocuments({ batchId: batch.id, status: 'reverted' })).toBe(2);
    });

    test('a product changed AFTER the update is not clobbered by the undo', async () => {
      const a = await makeProduct({ name: 'A' });
      const b = await makeProduct({ name: 'B' });
      const { batch } = await apply([
        { productId: String(a._id), newCost: 38000 },
        { productId: String(b._id), newCost: 38000 },
      ]);
      // A purchase then sets B's cost to something newer.
      await Product.updateOne({ _id: b._id }, { $set: { cost: 39500 } });

      const out = await service.rollbackBatch({ ...scope, userId: String(USER), batchId: batch.id });
      expect(out).toMatchObject({ reverted: 1, conflicts: 1 });
      expect((await fresh(Product, a._id)).cost).toBe(36000);
      expect((await fresh(Product, b._id)).cost).toBe(39500); // newer value preserved
      expect((await PriceUpdateBatch.findById(batch.id)).status).toBe('partially_rolled_back');
      expect(await PriceChange.countDocuments({ batchId: batch.id, status: 'revert_conflict' })).toBe(1);
    });

    test('force restores even a conflicting product', async () => {
      const a = await makeProduct();
      const { batch } = await apply([{ productId: String(a._id), newCost: 38000 }]);
      await Product.updateOne({ _id: a._id }, { $set: { cost: 39500 } });
      const out = await service.rollbackBatch({ ...scope, userId: String(USER), batchId: batch.id, force: true });
      expect(out).toMatchObject({ reverted: 1, conflicts: 0 });
      expect((await fresh(Product, a._id)).cost).toBe(36000);
    });

    test('only touches the price fields the batch changed', async () => {
      const a = await makeProduct();
      const { batch } = await apply([{ productId: String(a._id), newCost: 38000 }]);
      await Product.updateOne({ _id: a._id }, { $set: { price: 45000 } }); // price edited by hand afterwards
      const out = await service.rollbackBatch({ ...scope, userId: String(USER), batchId: batch.id });
      expect(out.conflicts).toBe(0);
      expect(await fresh(Product, a._id)).toMatchObject({ cost: 36000, price: 45000 });
    });

    test('a PRICE edited after the update is not clobbered by the undo either', async () => {
      const a = await makeProduct();
      const { batch } = await apply([{ productId: String(a._id), newPrice: 42000 }]);
      await Product.updateOne({ _id: a._id }, { $set: { price: 43500 } });
      const out = await service.rollbackBatch({ ...scope, userId: String(USER), batchId: batch.id });
      expect(out).toMatchObject({ reverted: 0, conflicts: 1 });
      expect((await fresh(Product, a._id)).price).toBe(43500);
    });

    test('a variant change is undone on the variant', async () => {
      const tee = await makeProduct({ name: 'Cotton Tee', hasVariants: true });
      const v = await ProductVariant.create({ organizationId: ORG, branchId: BRANCH, productId: tee._id, price: 900, cost: 500 });
      const { batch } = await apply([{ productId: String(tee._id), variantId: String(v._id), newCost: 600 }]);
      await service.rollbackBatch({ ...scope, userId: String(USER), batchId: batch.id });
      expect((await fresh(ProductVariant, v._id)).cost).toBe(500);
    });

    test('cannot be undone twice, or from another branch', async () => {
      const a = await makeProduct();
      const { batch } = await apply([{ productId: String(a._id), newCost: 38000 }]);
      await expect(service.rollbackBatch({ organizationId: String(ORG), branchId: String(OTHER_BRANCH), userId: String(USER), batchId: batch.id })).rejects.toThrow(/not found/i);
      await service.rollbackBatch({ ...scope, userId: String(USER), batchId: batch.id });
      await expect(service.rollbackBatch({ ...scope, userId: String(USER), batchId: batch.id })).rejects.toThrow(/Only an applied/);
    });
  });

  describe('history', () => {
    test('a product\'s timeline is newest-first with batch context, and skips non-applied rows', async () => {
      const p = await makeProduct();
      await apply([{ productId: String(p._id), newCost: 37000 }], { supplierName: 'Ali Traders', sourceType: 'whatsapp' });
      await new Promise((r) => setTimeout(r, 5));
      await apply([{ productId: String(p._id), newCost: 38000 }], { sourceType: 'pdf' });
      await apply([{ productId: String(p._id), newCost: 38000 }]); // unchanged → not in the timeline

      const history = await service.getProductHistory({ ...scope, productId: String(p._id) });
      expect(history.map((h) => h.newCost)).toEqual([38000, 37000]);
      expect(history[1]).toMatchObject({ supplierName: 'Ali Traders', sourceType: 'whatsapp', batchNumber: 1 });
    });

    test('lists batches newest-first with the applier, and returns a batch with its lines', async () => {
      const p = await makeProduct();
      await apply([{ productId: String(p._id), newCost: 37000 }], { sourceText: 'raw message', note: 'Sept rates' });
      const list = await service.listBatches(scope);
      expect(list.totalResults).toBe(1);
      expect(list.results[0]).toMatchObject({ batchNumber: 1, note: 'Sept rates' });
      expect(list.results[0].sourceText).toBeUndefined(); // heavy text stays out of the list

      const detail = await service.getBatch({ ...scope, batchId: list.results[0].id });
      expect(detail.batch.sourceText).toBe('raw message');
      expect(detail.items).toHaveLength(1);
      expect(detail.items[0]).toMatchObject({ productName: p.name, oldCost: 36000, newCost: 37000 });
    });

    test('cannot read another branch\'s batch', async () => {
      const p = await makeProduct();
      const { batch } = await apply([{ productId: String(p._id), newCost: 37000 }]);
      await expect(service.getBatch({ organizationId: String(ORG), branchId: String(OTHER_BRANCH), batchId: batch.id })).rejects.toThrow(/not found/i);
    });
  });

  describe('searchCatalog', () => {
    test('finds by name words, barcode and sku, scoped to the branch', async () => {
      await makeProduct({ barcode: '8801643123456', sku: 'SM-A155' });
      await makeProduct({ name: 'Samsung Galaxy A15 4GB/128GB', branchId: OTHER_BRANCH });
      expect(await service.searchCatalog({ ...scope, q: 'galaxy a15' })).toHaveLength(1);
      expect(await service.searchCatalog({ ...scope, q: '8801643' })).toHaveLength(1);
      expect(await service.searchCatalog({ ...scope, q: 'sm-a155' })).toHaveLength(1);
      expect(await service.searchCatalog({ ...scope, q: 'nothing like this' })).toHaveLength(0);
      expect(await service.searchCatalog({ ...scope, q: '   ' })).toEqual([]);
    });

    test('is safe against regex metacharacters in the query', async () => {
      await makeProduct();
      await expect(service.searchCatalog({ ...scope, q: '(a15[' })).resolves.toEqual([]);
    });
  });
});
