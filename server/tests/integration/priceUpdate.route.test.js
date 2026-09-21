const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const setupTestDB = require('../utils/setupTestDB');

// Auth and branch scope are replaced with fakes so the router can be driven without a login:
// the fake auth grants only the permissions listed in `mockGranted.perms`, and (like the real
// one) rejects with 403 when none of a route's required permissions is held.
const mockGranted = { perms: new Set() };
const mockScope = {};
jest.mock('../../src/middlewares/auth', () => (...required) => (req, res, next) => {
  const ApiErrorLocal = require('../../src/utils/ApiError');
  req.user = { id: mockScope.userId, name: 'Test User', email: 'test@example.com' };
  if (required.length && !required.some((p) => mockGranted.perms.has(p))) {
    return next(new ApiErrorLocal(403, `You do not have permission to ${required.join(' or ')}.`));
  }
  return next();
});
jest.mock('../../src/middlewares/branchScope', () => () => (req, res, next) => {
  req.organizationId = mockScope.organizationId;
  req.branchId = mockScope.branchId;
  next();
});
jest.mock('../../src/services/priceListExtract.service', () => ({
  extractText: jest.fn(async () => ({ text: 'Galaxy A15 - 38500\nHot 40i - 27500', method: 'ai', truncated: false })),
}));

const { errorConverter, errorHandler } = require('../../src/middlewares/error');
const { Product, Supplier, AuditLog, PriceUpdateBatch } = require('../../src/models');
const priceUpdateRoute = require('../../src/routes/v1/priceUpdate.route');
const extractService = require('../../src/services/priceListExtract.service');

setupTestDB();
jest.setTimeout(60000);

const app = express();
app.use(express.json());
app.use('/v1/price-updates', priceUpdateRoute);
app.use(errorConverter);
app.use(errorHandler);

const ORG = new mongoose.Types.ObjectId();
const BRANCH = new mongoose.Types.ObjectId();
const USER = new mongoose.Types.ObjectId();

beforeEach(() => {
  mockScope.organizationId = String(ORG);
  mockScope.branchId = String(BRANCH);
  mockScope.userId = String(USER);
  mockGranted.perms = new Set(['viewPriceUpdates', 'managePriceUpdates']);
  jest.clearAllMocks();
});

const makeProduct = (over = {}) =>
  Product.create({ organizationId: ORG, branchId: BRANCH, name: 'Samsung Galaxy A15 4GB/128GB', price: 40000, cost: 36000, stockQuantity: 5, ...over });

describe('price-updates routes', () => {
  describe('POST /analyze', () => {
    test('returns parsed + matched rows', async () => {
      const p = await makeProduct();
      const res = await request(app).post('/v1/price-updates/analyze').send({ text: 'A15 4/128 - 38,500' }).expect(200);
      expect(res.body.rows[0].match).toMatchObject({ status: 'review' });
      expect(res.body.rows[0].match.entry.productId).toBe(String(p._id));
      expect(res.body.stats).toMatchObject({ parsed: 1, catalogSize: 1 });
    });

    test('400 when neither text nor rows is sent', async () => {
      await request(app).post('/v1/price-updates/analyze').send({}).expect(400);
    });

    test('400 for a malformed supplier id or oversize text', async () => {
      await request(app).post('/v1/price-updates/analyze').send({ text: 'x', supplierId: 'nope' }).expect(400);
      await request(app).post('/v1/price-updates/analyze').send({ text: 'a'.repeat(400001) }).expect(400);
    });

    test('an empty pasted message is a clear 400, not a crash', async () => {
      const res = await request(app).post('/v1/price-updates/analyze').send({ text: '   ' }).expect(400);
      expect(res.body.message).toMatch(/Paste a price list/);
    });
  });

  describe('POST /apply', () => {
    test('applies, snapshots the supplier name server-side, and writes an audit entry', async () => {
      const p = await makeProduct();
      const supplier = await Supplier.create({ organizationId: ORG, branchId: BRANCH, name: 'Ali Traders' });
      const res = await request(app)
        .post('/v1/price-updates/apply')
        .send({
          items: [{ productId: String(p._id), newCost: 38000, newPrice: 42000, matchMethod: 'name' }],
          meta: { sourceType: 'whatsapp', supplierId: String(supplier._id), priceMode: 'cost' },
        })
        .expect(201);

      expect(res.body.stats).toMatchObject({ applied: 1 });
      expect(res.body.results[0].status).toBe('applied');
      const batch = await PriceUpdateBatch.findById(res.body.batch.id).lean();
      expect(batch.source).toMatchObject({ type: 'whatsapp', supplierName: 'Ali Traders' });
      expect(await Product.findById(p._id).lean()).toMatchObject({ cost: 38000, price: 42000 });

      const audit = await AuditLog.findOne({ module: 'Price Update' }).lean();
      expect(audit).toMatchObject({ action: 'create' });
    });

    test('rejects a supplier from another organization', async () => {
      const p = await makeProduct();
      const foreign = await Supplier.create({ organizationId: new mongoose.Types.ObjectId(), branchId: BRANCH, name: 'Foreign' });
      await request(app)
        .post('/v1/price-updates/apply')
        .send({ items: [{ productId: String(p._id), newCost: 1 }], meta: { supplierId: String(foreign._id) } })
        .expect(400);
      expect((await Product.findById(p._id).lean()).cost).toBe(36000);
    });

    test.each([
      ['empty items', { items: [] }],
      ['missing items', {}],
      ['bad product id', { items: [{ productId: 'abc', newCost: 1 }] }],
      ['negative cost', { items: [{ productId: String(new mongoose.Types.ObjectId()), newCost: -1 }] }],
      ['unknown match method', { items: [{ productId: String(new mongoose.Types.ObjectId()), newCost: 1, matchMethod: 'guess' }] }],
      ['unknown source type', { items: [{ productId: String(new mongoose.Types.ObjectId()), newCost: 1 }], meta: { sourceType: 'telepathy' } }],
    ])('400 for %s', async (_name, body) => {
      await request(app).post('/v1/price-updates/apply').send(body).expect(400);
    });
  });

  describe('permissions', () => {
    test('viewing history needs only viewPriceUpdates; changing prices needs managePriceUpdates', async () => {
      mockGranted.perms = new Set(['viewPriceUpdates']);
      await request(app).get('/v1/price-updates/batches').expect(200);
      await request(app).post('/v1/price-updates/analyze').send({ text: 'A - 100' }).expect(403);
      await request(app).post('/v1/price-updates/apply').send({ items: [{ productId: String(new mongoose.Types.ObjectId()), newCost: 1 }] }).expect(403);
      await request(app).post(`/v1/price-updates/batches/${new mongoose.Types.ObjectId()}/rollback`).send({}).expect(403);
      await request(app).get('/v1/price-updates/products/search?q=a').expect(403);
      await request(app).delete(`/v1/price-updates/aliases/${new mongoose.Types.ObjectId()}`).expect(403);
    });

    test('with no price-update permission at all, nothing is reachable', async () => {
      mockGranted.perms = new Set();
      await request(app).get('/v1/price-updates/batches').expect(403);
      await request(app).get('/v1/price-updates/aliases').expect(403);
    });

    test('a product\'s history is readable by anyone who can view products', async () => {
      mockGranted.perms = new Set(['viewProducts']);
      const id = new mongoose.Types.ObjectId();
      const res = await request(app).get(`/v1/price-updates/history/${id}`).expect(200);
      expect(res.body.results).toEqual([]);
    });
  });

  describe('rollback, history, aliases', () => {
    test('apply → list → detail → rollback round trip over HTTP', async () => {
      const p = await makeProduct();
      const applied = await request(app).post('/v1/price-updates/apply').send({ items: [{ productId: String(p._id), newCost: 38000 }] }).expect(201);
      const batchId = applied.body.batch.id;

      const list = await request(app).get('/v1/price-updates/batches').expect(200);
      expect(list.body.results[0]).toMatchObject({ id: batchId, batchNumber: 1, status: 'applied' });

      const detail = await request(app).get(`/v1/price-updates/batches/${batchId}`).expect(200);
      expect(detail.body.items[0]).toMatchObject({ oldCost: 36000, newCost: 38000 });

      const hist = await request(app).get(`/v1/price-updates/history/${p._id}`).expect(200);
      expect(hist.body.results).toHaveLength(1);

      const undone = await request(app).post(`/v1/price-updates/batches/${batchId}/rollback`).send({}).expect(200);
      expect(undone.body).toMatchObject({ reverted: 1, conflicts: 0 });
      expect((await Product.findById(p._id).lean()).cost).toBe(36000);
      expect(await AuditLog.countDocuments({ module: 'Price Update' })).toBe(2);
      await request(app).post(`/v1/price-updates/batches/${batchId}/rollback`).send({}).expect(400); // already undone
    });

    test('malformed ids are 400, unknown ones 404', async () => {
      await request(app).get('/v1/price-updates/batches/not-an-id').expect(400);
      await request(app).get(`/v1/price-updates/batches/${new mongoose.Types.ObjectId()}`).expect(404);
      await request(app).delete(`/v1/price-updates/aliases/${new mongoose.Types.ObjectId()}`).expect(404);
    });

    test('product search is routed (not swallowed by a param route) and validated', async () => {
      await makeProduct();
      const res = await request(app).get('/v1/price-updates/products/search?q=galaxy').expect(200);
      expect(res.body.results).toHaveLength(1);
      await request(app).get('/v1/price-updates/products/search').expect(400);
    });
  });

  describe('POST /extract (upload)', () => {
    test('accepts a PDF and returns the extracted text with the original file name', async () => {
      const res = await request(app).post('/v1/price-updates/extract').attach('file', Buffer.from('%PDF-1.4 fake'), { filename: 'rates.pdf', contentType: 'application/pdf' }).expect(200);
      expect(res.body).toMatchObject({ method: 'ai', fileName: 'rates.pdf' });
      expect(extractService.extractText).toHaveBeenCalledWith(expect.any(Buffer), 'application/pdf');
    });

    test('a wrong file type is a clear 400', async () => {
      const res = await request(app).post('/v1/price-updates/extract').attach('file', Buffer.from('a,b'), { filename: 'x.csv', contentType: 'text/csv' }).expect(400);
      expect(res.body.message).toMatch(/image or PDF/i);
      expect(extractService.extractText).not.toHaveBeenCalled();
    });

    test('an oversize file is a clear 400', async () => {
      const res = await request(app)
        .post('/v1/price-updates/extract')
        .attach('file', Buffer.alloc(10 * 1024 * 1024 + 10, 1), { filename: 'big.pdf', contentType: 'application/pdf' })
        .expect(400);
      expect(res.body.message).toMatch(/too large/i);
    });

    test('no file is a clear 400', async () => {
      const res = await request(app).post('/v1/price-updates/extract').expect(400);
      expect(res.body.message).toMatch(/No file/i);
    });
  });
});
