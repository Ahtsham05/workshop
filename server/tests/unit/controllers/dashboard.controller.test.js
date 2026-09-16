const mongoose = require('mongoose');
const setupTestDB = require('../../utils/setupTestDB');
const { Inventory, Product } = require('../../../src/models');
const { getDashboardStats, getLowStockProducts } = require('../../../src/controllers/dashboard.controller');

/**
 * Stock figures are resolved in the database now (no more loading every product per
 * request). hasVariants products keep Product.stockQuantity at a legacy fallback, so their
 * real stock has to come from Inventory — a variant product with no Inventory rows is out
 * of stock regardless of what Product.stockQuantity says.
 */
setupTestDB();
jest.setTimeout(30000);

const ORG = new mongoose.Types.ObjectId();
const BRANCH = new mongoose.Types.ObjectId();

const call = (handler, query = {}) =>
  new Promise((resolve, reject) => {
    const req = {
      query,
      organizationId: String(ORG),
      branchId: String(BRANCH),
      user: { organizationId: ORG, businessType: 'retail' },
    };
    const res = {
      status() {
        return this;
      },
      send: (body) => resolve(JSON.parse(JSON.stringify(body))),
    };
    handler(req, res, reject);
  });

const seedProducts = async () => {
  const product = (name, fields) => ({
    _id: new mongoose.Types.ObjectId(),
    organizationId: ORG,
    branchId: BRANCH,
    name,
    price: 10,
    cost: 4,
    ...fields,
  });
  const products = {
    outOfStock: product('Out of stock', { stockQuantity: 0 }),
    low: product('Low', { stockQuantity: 5 }),
    // cost 0 → valued at price, same as `cost || price`
    healthy: product('Healthy', { stockQuantity: 50, cost: 0 }),
    variantLow: product('Variant low', { hasVariants: true, stockQuantity: 0 }),
    variantEmpty: product('Variant without inventory', { hasVariants: true, stockQuantity: 99 }),
  };
  await Product.collection.insertMany(Object.values(products));
  await Product.collection.insertOne(product('Other branch', { branchId: new mongoose.Types.ObjectId(), stockQuantity: 0 }));
  await Inventory.collection.insertMany([
    { organizationId: ORG, branchId: BRANCH, productId: products.variantLow._id, variantId: new mongoose.Types.ObjectId(), quantity: 1, averageCost: 7 },
    { organizationId: ORG, branchId: BRANCH, productId: products.variantLow._id, variantId: new mongoose.Types.ObjectId(), quantity: 2, averageCost: 7 },
  ]);
  return products;
};

describe('dashboard stock figures', () => {
  test('stats count low/out-of-stock and value stock from Inventory for variant products', async () => {
    await seedProducts();

    const stats = await call(getDashboardStats, { period: 'today' });

    expect(stats.lowStockCount).toBe(2);
    expect(stats.outOfStockCount).toBe(2);
    // low 5×4 + healthy 50×10 + variantLow 3×7
    expect(stats.totalInventoryValue).toBe(541);
    expect(stats.totalProducts).toBe(5);
  });

  test('low-stock widget lists lowest stock first across simple and variant products, with ids', async () => {
    const products = await seedProducts();

    const rows = await call(getLowStockProducts);

    expect(rows.map((row) => [row.name, row.stockQuantity])).toEqual([
      ['Out of stock', 0],
      ['Variant without inventory', 0],
      ['Variant low', 3],
      ['Low', 5],
    ]);
    expect(rows[0].id).toBe(String(products.outOfStock._id));
  });
});
