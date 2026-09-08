const { proportionLineTax, buildReturnTaxLines } = require('../../../src/utils/taxReturnProration');

// Pure-function tests — no database needed. This is the exact logic salesReturn.service.js
// and purchaseReturn.service.js call to reverse a return's tax; a full end-to-end service
// test (creating a real SalesReturn/PurchaseReturn via the service, including its journal
// entry) needs MongoDB multi-document transactions, which this sandbox's
// mongodb-memory-server can't currently provide as a replica set (see setupTestDB.js) — so
// this suite is what actually exercises the new proration logic added for that work.

describe('proportionLineTax', () => {
  const originalLine = { taxCategoryId: 'cat-1', taxableAmount: 400, taxAmount: 80, quantity: 4, stockQuantity: 4 };

  test('returning the full quantity reverses the full tax', () => {
    const result = proportionLineTax(originalLine, 4);
    expect(result).toEqual({ taxCategoryId: 'cat-1', taxableAmount: 400, taxAmount: 80 });
  });

  test('returning a partial quantity prorates tax by the same ratio', () => {
    const result = proportionLineTax(originalLine, 1); // 1 of 4 = 25%
    expect(result.taxableAmount).toBe(100);
    expect(result.taxAmount).toBe(20);
  });

  test('returning zero quantity reverses zero tax', () => {
    const result = proportionLineTax(originalLine, 0);
    expect(result.taxAmount).toBe(0);
  });

  test('a returned quantity exceeding the original is clamped to 100%, never inverts or exceeds', () => {
    const result = proportionLineTax(originalLine, 999);
    expect(result.taxAmount).toBe(80);
  });

  test('a null/undefined original line item reverses zero tax rather than throwing', () => {
    expect(proportionLineTax(null, 1)).toEqual({ taxCategoryId: null, taxableAmount: 0, taxAmount: 0 });
    expect(proportionLineTax(undefined, 1)).toEqual({ taxCategoryId: null, taxableAmount: 0, taxAmount: 0 });
  });

  test('an original line with zero tax (taxSystem NONE, or a zero-rated/exempt line) reverses zero — the "no linked snapshot" / no-tax-configured case', () => {
    const result = proportionLineTax({ taxCategoryId: null, taxableAmount: 400, taxAmount: 0, quantity: 4 }, 2);
    expect(result).toEqual({ taxCategoryId: null, taxableAmount: 0, taxAmount: 0 });
  });

  test('an original line with a zero original quantity does not divide by zero', () => {
    const result = proportionLineTax({ taxCategoryId: 'cat-1', taxableAmount: 0, taxAmount: 80, quantity: 0 }, 1);
    expect(result.taxAmount).toBe(0);
  });

  test('respects a currency-specific decimalPlaces argument when rounding', () => {
    // JPY-style 0-decimal-place currency: 1/3 of ¥100 tax should round to a whole yen.
    const result = proportionLineTax({ taxCategoryId: 'cat-1', taxableAmount: 300, taxAmount: 100, quantity: 3 }, 1, 0);
    expect(Number.isInteger(result.taxAmount)).toBe(true);
  });
});

describe('buildReturnTaxLines', () => {
  test('groups prorated items by taxCategoryId into header-level taxLines', () => {
    const items = [
      { taxCategoryId: 'cat-1', taxableAmount: 100, taxAmount: 20 },
      { taxCategoryId: 'cat-1', taxableAmount: 50, taxAmount: 10 },
      { taxCategoryId: 'cat-2', taxableAmount: 200, taxAmount: 10 },
    ];
    const categoryNameById = new Map([
      ['cat-1', 'Standard'],
      ['cat-2', 'Reduced'],
    ]);
    const taxLines = buildReturnTaxLines(items, categoryNameById);

    expect(taxLines).toHaveLength(2);
    const cat1 = taxLines.find((l) => l.taxCategoryId === 'cat-1');
    expect(cat1.taxableAmount).toBe(150);
    expect(cat1.taxAmount).toBe(30);
    expect(cat1.taxCategoryName).toBe('Standard');
    expect(cat1.components).toEqual([]); // component-level detail is a disclosed, deliberate scope reduction

    const cat2 = taxLines.find((l) => l.taxCategoryId === 'cat-2');
    expect(cat2.taxAmount).toBe(10);
  });

  test('items with no taxCategoryId or zero tax are excluded from the breakdown', () => {
    const items = [
      { taxCategoryId: null, taxableAmount: 0, taxAmount: 0 },
      { taxCategoryId: 'cat-1', taxableAmount: 0, taxAmount: 0 },
    ];
    expect(buildReturnTaxLines(items, new Map())).toEqual([]);
  });

  test('an unresolved category name falls back to null rather than throwing', () => {
    const items = [{ taxCategoryId: 'cat-unknown', taxableAmount: 100, taxAmount: 20 }];
    const taxLines = buildReturnTaxLines(items, new Map());
    expect(taxLines[0].taxCategoryName).toBeNull();
  });

  test('an empty items array returns an empty taxLines array', () => {
    expect(buildReturnTaxLines([], new Map())).toEqual([]);
  });
});
