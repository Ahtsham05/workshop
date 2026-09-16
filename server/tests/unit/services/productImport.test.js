/**
 * Behaviour of the Excel/CSV product import: messy cells, rows that are already in the
 * catalogue, duplicates inside one file, and a batch where only some rows fail.
 */

// `mock`-prefixed names are the ones jest.mock() factories are allowed to reach.
const mockProductFind = jest.fn();
const mockProductInsertMany = jest.fn();
const mockProductBulkWrite = jest.fn();
const mockCategoryFind = jest.fn();
const mockCategoryInsertMany = jest.fn();
const mockSubCategoryFind = jest.fn();
const mockSupplierFind = jest.fn();
const mockLinkProducts = jest.fn();

jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    connection: {
      // ensureProductIndexes() reaches for the live collection; without a database there
      // is nothing to migrate, so this stands in for one that is already in shape.
      collection: () => ({
        indexes: async () => [],
        dropIndex: async () => {},
        updateMany: async () => {},
      }),
    },
  };
});

jest.mock('../../../src/models', () => {
  function Product(doc) {
    Object.assign(this, doc);
  }
  // The service pre-validates each document against the schema before insertMany().
  Product.prototype.validateSync = function validateSync() {
    return this.name ? undefined : { errors: {}, message: 'Product validation failed' };
  };
  Product.find = (...args) => mockProductFind(...args);
  Product.insertMany = (...args) => mockProductInsertMany(...args);
  Product.bulkWrite = (...args) => mockProductBulkWrite(...args);
  Product.syncIndexes = async () => {};

  return {
    Product,
    Category: { find: (...args) => mockCategoryFind(...args), insertMany: (...args) => mockCategoryInsertMany(...args) },
    SubCategory: { find: (...args) => mockSubCategoryFind(...args), insertMany: async () => [] },
    Supplier: { find: (...args) => mockSupplierFind(...args) },
    ProductVariant: {},
    Inventory: {},
    Batch: {},
    Imei: {},
    Organization: {},
  };
});

jest.mock('../../../src/services/masterProduct.service', () => ({
  linkProductsToMasterProductsBulk: (...args) => mockLinkProducts(...args),
  linkProductToMasterProduct: async () => {},
}));
jest.mock('../../../src/services/imei.service', () => ({}));
jest.mock('../../../src/services/batch.service', () => ({}));
jest.mock('../../../src/services/inventorySync.service', () => ({
  getOrCreateDefaultVariant: async () => ({}),
  getOrCreateInventory: async () => ({}),
}));

const productService = require('../../../src/services/product.service');

const CONTEXT = { organizationId: 'org1', branchId: 'branch1', createdBy: 'user1' };

/** `Product.find()` is used for the barcode lookup and then the SKU lookup, in that order. */
const mockExistingProducts = ({ barcodes = [], skus = [] } = {}) => {
  mockProductFind.mockImplementation((query) => ({
    select: () => ({
      lean: async () => (query.barcode ? barcodes : skus),
    }),
  }));
};

beforeEach(() => {
  jest.clearAllMocks();
  mockExistingProducts();
  mockProductInsertMany.mockImplementation(async (docs) => docs.map((doc, i) => ({ ...doc, _id: `new${i}` })));
  mockProductBulkWrite.mockResolvedValue({ modifiedCount: 0, matchedCount: 0 });
  mockCategoryFind.mockReturnValue({ select: () => ({ lean: async () => [] }) });
  mockCategoryInsertMany.mockImplementation(async (docs) => docs.map((doc, i) => ({ ...doc, _id: `cat${i}` })));
  mockSubCategoryFind.mockReturnValue({ select: () => ({ lean: async () => [] }) });
  mockSupplierFind.mockReturnValue({ select: () => ({ lean: async () => [] }) });
  mockLinkProducts.mockResolvedValue(undefined);
});

describe('bulkAddProducts', () => {
  test('reads money and quantity cells as they are actually written', async () => {
    const result = await productService.bulkAddProducts(
      [{ name: 'Charger', price: 'Rs 1,250.50', cost: '900', stockQuantity: '10' }],
      CONTEXT,
    );

    expect(result.errors).toHaveLength(0);
    expect(result.insertedCount).toBe(1);
    expect(mockProductInsertMany.mock.calls[0][0][0]).toMatchObject({ price: 1250.5, cost: 900, stockQuantity: 10 });
  });

  test('fails only the unusable row and imports the rest', async () => {
    const result = await productService.bulkAddProducts(
      [
        { name: 'Charger', price: 100, cost: 80, stockQuantity: 5 },
        { name: '', price: 100, cost: 80, stockQuantity: 5 },
        { name: 'Cable', price: 'free', cost: 80, stockQuantity: 5 },
        { name: 'Power Bank', price: 2999, cost: 2100, stockQuantity: 3 },
      ],
      CONTEXT,
    );

    expect(result.insertedCount).toBe(2);
    expect(result.errors.map((error) => error.index)).toEqual([1, 2]);
    expect(result.errors[1].error).toMatch(/Invalid price/);
  });

  test('leaves a product that is already in the catalogue alone by default', async () => {
    mockExistingProducts({ barcodes: [{ _id: 'p1', barcode: '8901234567890' }] });

    const result = await productService.bulkAddProducts(
      [
        { name: 'Charger', barcode: '8901234567890', price: 150, cost: 100, stockQuantity: 5 },
        { name: 'Cable', barcode: '8901234567891', price: 350, cost: 200, stockQuantity: 5 },
      ],
      CONTEXT,
    );

    expect(result.insertedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(result.skipped[0].reason).toMatch(/Already in the catalogue/);
    expect(mockProductInsertMany.mock.calls[0][0].map((doc) => doc.name)).toEqual(['Cable']);
  });

  test('updates price and cost on request, and never overwrites stock', async () => {
    mockExistingProducts({ barcodes: [{ _id: 'p1', barcode: '8901234567890' }] });
    mockProductBulkWrite.mockResolvedValue({ modifiedCount: 1, matchedCount: 1 });

    const result = await productService.bulkAddProducts(
      [{ name: 'Charger', barcode: '8901234567890', price: 175, cost: 120, stockQuantity: 999 }],
      CONTEXT,
      { duplicateStrategy: 'update' },
    );

    expect(result.updatedCount).toBe(1);
    expect(result.insertedCount).toBe(0);
    const [[ops]] = mockProductBulkWrite.mock.calls;
    expect(ops[0].updateOne.update.$set).toMatchObject({ price: 175, cost: 120 });
    expect(ops[0].updateOne.update.$set.stockQuantity).toBeUndefined();
  });

  test('reports an existing barcode as an error only when asked to', async () => {
    mockExistingProducts({ barcodes: [{ _id: 'p1', barcode: '8901234567890' }] });

    const result = await productService.bulkAddProducts(
      [{ name: 'Charger', barcode: '8901234567890', price: 150, cost: 100, stockQuantity: 5 }],
      CONTEXT,
      { duplicateStrategy: 'error' },
    );

    expect(result.insertedCount).toBe(0);
    expect(result.errors[0].error).toMatch(/already exists/);
  });

  test('names both rows when one file uses the same barcode twice', async () => {
    const result = await productService.bulkAddProducts(
      [
        { name: 'Charger', barcode: '8901234567890', price: 150, cost: 100, stockQuantity: 5 },
        { name: 'Charger copy', barcode: '8901234567890', price: 150, cost: 100, stockQuantity: 5 },
      ],
      CONTEXT,
    );

    expect(result.insertedCount).toBe(1);
    expect(result.errors[0].error).toMatch(/also used by row 1 in this import/);
  });

  test('creates the categories the file names and says which ones were new', async () => {
    const result = await productService.bulkAddProducts(
      [{ name: 'Charger', price: 150, cost: 100, stockQuantity: 5, category: 'Accessories' }],
      CONTEXT,
    );

    expect(result.createdCategories).toEqual(['Accessories']);
    expect(mockProductInsertMany.mock.calls[0][0][0].category).toBe('Accessories');
  });

  test('imports the row without a supplier when the name matches nothing, and says so', async () => {
    const result = await productService.bulkAddProducts(
      [{ name: 'Charger', price: 150, cost: 100, stockQuantity: 5, supplier: 'Nowhere Traders' }],
      CONTEXT,
    );

    expect(result.insertedCount).toBe(1);
    expect(result.warnings[0].message).toMatch(/was not found/);
  });

  test('keeps the rows that were written when part of the batch is rejected', async () => {
    mockProductInsertMany.mockImplementation(async (docs) => {
      const error = new Error('bulk write failed');
      error.writeErrors = [{ index: 1, err: { errmsg: 'E11000 duplicate key', code: 11000 } }];
      error.insertedDocs = [{ ...docs[0], _id: 'new0' }];
      throw error;
    });

    const result = await productService.bulkAddProducts(
      [
        { name: 'Charger', price: 150, cost: 100, stockQuantity: 5 },
        { name: 'Cable', price: 350, cost: 200, stockQuantity: 5 },
      ],
      CONTEXT,
    );

    expect(result.insertedCount).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].name).toBe('Cable');
  });
});
