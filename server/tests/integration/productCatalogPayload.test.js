const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const setupTestDB = require('../utils/setupTestDB');

const mockScope = {};
// A real User document: the cost-redaction check (userHasAnyPermission) populates its role.
jest.mock('../../src/middlewares/auth', () => () => async (req, res, next) => {
  const { User: UserModel } = require('../../src/models');
  req.user = await UserModel.findById(mockScope.userId);
  next();
});
jest.mock('../../src/middlewares/branchScope', () => () => (req, res, next) => {
  req.organizationId = mockScope.organizationId;
  req.branchId = mockScope.branchId;
  next();
});

const { errorConverter, errorHandler } = require('../../src/middlewares/error');
const { Branch, Product, User } = require('../../src/models');
const productService = require('../../src/services/product.service');
const productRoute = require('../../src/routes/v1/product.route');

setupTestDB();
jest.setTimeout(60000);

const app = express();
app.use(express.json());
app.use('/v1/products', productRoute);
app.use(errorConverter);
app.use(errorHandler);

const ORG = new mongoose.Types.ObjectId();
let branch;

// The whole-branch catalog endpoints behind every item picker. stockoutHistory (one
// date per zero-stock day) was ~half of a 7,000-product branch's response and pushed the
// request past the client timeout — it must stay out of both, while purchase
// suggestions (the one reader) still gets it.
beforeEach(async () => {
  branch = await Branch.create({ organizationId: ORG, name: 'Main' });
  const owner = await User.create({ name: 'Owner', email: 'owner@example.com', password: 'password1', organizationId: ORG, systemRole: 'superAdmin' });
  mockScope.organizationId = String(ORG);
  mockScope.branchId = String(branch._id);
  mockScope.userId = String(owner._id);
  await Product.create({
    organizationId: ORG,
    branchId: branch._id,
    name: 'Speaker',
    description: 'Bluetooth speaker',
    barcode: 'SPK-1',
    stockQuantity: 0,
    cost: 4000,
    price: 6500,
    stockoutHistory: [new Date('2026-10-01'), new Date('2026-10-02')],
  });
});

describe('GET /v1/products/purchasable', () => {
  test('sends the picker fields without stockoutHistory or unread product fields', async () => {
    const res = await request(app).get('/v1/products/purchasable').expect(200);
    expect(res.body).toHaveLength(1);
    const [row] = res.body;
    expect(row).toMatchObject({ type: 'product', name: 'Speaker', barcode: 'SPK-1', price: 6500, cost: 4000, stockQuantity: 0 });
    expect(row).not.toHaveProperty('stockoutHistory');
  });

  test('purchase suggestions still read stockoutHistory from the service', async () => {
    const [row] = await productService.getPurchasableCatalog(
      { organizationId: ORG, branchId: branch._id },
      { includeStockoutHistory: true }
    );
    expect(row.stockoutHistory).toHaveLength(2);
  });
});

describe('GET /v1/products/all', () => {
  test('keeps the full product shape except stockoutHistory', async () => {
    const res = await request(app).get('/v1/products/all').expect(200);
    expect(res.body).toHaveLength(1);
    const [row] = res.body;
    expect(row).toMatchObject({ name: 'Speaker', description: 'Bluetooth speaker', barcode: 'SPK-1', trackBatch: false });
    expect(row.id).toEqual(expect.any(String));
    expect(row).not.toHaveProperty('stockoutHistory');
  });
});
