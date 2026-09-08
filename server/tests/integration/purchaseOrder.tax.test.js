const setupTestDB = require('../utils/setupTestDB');
const { Supplier } = require('../../src/models');
const purchaseOrderService = require('../../src/services/purchaseOrder.service');
const {
  insertOrganization,
  insertBranch,
  insertProduct,
  insertTaxCategory,
  insertTaxRate,
} = require('../fixtures/tax.fixture');

// Calls purchaseOrder.service.js directly (no HTTP/supertest — see
// taxCalculator.service.test.js for why). purchaseOrder.service.js doesn't use MongoDB
// transactions, so unlike Sales/Purchase Return this can run end-to-end here.
setupTestDB();
// Spinning up this suite's own in-memory MongoDB instance can push past Jest's default
// 5s per-test timeout when several suites' setupTestDB() run back-to-back in one process
// (each suite gets its own server) — bump it rather than the global default.
jest.setTimeout(30000);

const insertSupplier = async (organizationId, branchId) =>
  Supplier.create({ organizationId, branchId, name: 'Test Supplier' });

describe('Purchase Order — tax wiring', () => {
  test('a VAT-configured org resolves real tax from the product tax category, not a client-supplied number', async () => {
    const org = await insertOrganization({ taxSystem: 'VAT' });
    const branch = await insertBranch(org._id);
    const supplier = await insertSupplier(org._id, branch._id);
    const category = await insertTaxCategory(org._id, { name: 'Standard' });
    await insertTaxRate(org._id, category._id, { name: 'Standard VAT 20%', rate: 20 });
    const product = await insertProduct(org._id, branch._id, { taxCategoryId: category._id });

    const order = await purchaseOrderService.createPurchaseOrder({
      organizationId: org._id,
      branchId: branch._id,
      supplier: supplier._id,
      items: [{ product: product._id, quantity: 10, expectedPrice: 100 }],
      // A client-supplied flat tax figure — must be IGNORED once a real tax system is
      // configured (the whole point of this wiring fix).
      tax: 999999,
    });

    expect(order.tax).toBe(200); // 10 * £100 * 20%, not 999999
    expect(order.taxSystem).toBe('VAT');
    expect(order.taxLines).toHaveLength(1);
    expect(order.items[0].taxCategoryId.toString()).toBe(category._id.toString());
    expect(order.items[0].taxAmount).toBe(200);
    expect(order.totalAmount).toBe(1200); // 1000 subtotal + 200 tax
  });

  test('a taxSystem NONE org keeps the client-supplied flat tax figure unchanged (backward compatibility)', async () => {
    const org = await insertOrganization({ taxSystem: 'NONE' });
    const branch = await insertBranch(org._id);
    const supplier = await insertSupplier(org._id, branch._id);
    const product = await insertProduct(org._id, branch._id);

    const order = await purchaseOrderService.createPurchaseOrder({
      organizationId: org._id,
      branchId: branch._id,
      supplier: supplier._id,
      items: [{ product: product._id, quantity: 10, expectedPrice: 100 }],
      tax: 50, // manual figure — must pass through exactly as before this change
    });

    expect(order.tax).toBe(50);
    expect(order.taxSystem).toBe('NONE');
    expect(order.taxLines).toEqual([]);
    expect(order.totalAmount).toBe(1050); // 1000 + 50
  });

  test('updating an order recomputes tax server-side and overwrites a client-supplied tax value', async () => {
    const org = await insertOrganization({ taxSystem: 'VAT' });
    const branch = await insertBranch(org._id);
    const supplier = await insertSupplier(org._id, branch._id);
    const category = await insertTaxCategory(org._id, { name: 'Standard' });
    await insertTaxRate(org._id, category._id, { rate: 10 });
    const product = await insertProduct(org._id, branch._id, { taxCategoryId: category._id });

    const order = await purchaseOrderService.createPurchaseOrder({
      organizationId: org._id,
      branchId: branch._id,
      supplier: supplier._id,
      items: [{ product: product._id, quantity: 10, expectedPrice: 100 }],
    });
    expect(order.tax).toBe(100); // 1000 * 10%

    const updated = await purchaseOrderService.updatePurchaseOrderById(order._id, {
      items: [{ product: product._id, quantity: 20, expectedPrice: 100 }],
      tax: 1, // client sends a bogus value — must be overwritten by the server-resolved one
    });
    expect(updated.tax).toBe(200); // 2000 * 10%, not the client's "1"
  });
});
