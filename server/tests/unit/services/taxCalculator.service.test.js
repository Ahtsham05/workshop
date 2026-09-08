const setupTestDB = require('../../utils/setupTestDB');
const taxCalculatorService = require('../../../src/services/taxCalculator.service');
const {
  insertOrganization,
  insertBranch,
  insertCustomer,
  insertTaxCategory,
  insertTaxRate,
  insertTaxJurisdiction,
  insertTaxExemption,
  setDefaultTaxCategory,
} = require('../../fixtures/tax.fixture');

// Calls taxCalculator.service.js's calculateTax() directly against real (in-memory Mongo)
// fixtures — no HTTP/Express/auth layer involved (supertest(app) currently can't load at
// all in this repo, since app.js's dependency chain pulls in an ESM-only puppeteer-core
// package Jest can't require() — a pre-existing, unrelated issue). Testing the calculator
// directly is also simply the right level for these scenarios: they're about tax-resolution
// logic, not HTTP/auth behavior.
setupTestDB();
// Spinning up this suite's own in-memory MongoDB instance can push past Jest's default
// 5s per-test timeout when several suites' setupTestDB() run back-to-back in one process
// (each suite gets its own server) — bump it rather than the global default.
jest.setTimeout(30000);

describe('taxCalculatorService.calculateTax', () => {
  test('no tax configured — taxSystem NONE returns zero tax and empty taxLines', async () => {
    const org = await insertOrganization({ taxSystem: 'NONE' });
    const result = await taxCalculatorService.calculateTax({
      organizationId: org._id,
      lines: [{ lineId: '0', amount: 1000 }],
    });
    expect(result.totalTax).toBe(0);
    expect(result.taxBreakdownByCategory).toEqual([]);
    expect(result.lines[0].taxAmount).toBe(0);
    expect(result.lines[0].taxableAmount).toBe(1000);
  });

  test('no tax configured — real taxSystem but zero TaxCategory/TaxRate docs resolves to zero tax, not a crash', async () => {
    const org = await insertOrganization({ taxSystem: 'VAT' });
    const result = await taxCalculatorService.calculateTax({
      organizationId: org._id,
      lines: [{ lineId: '0', amount: 1000 }],
    });
    expect(result.totalTax).toBe(0);
    expect(result.lines[0].taxAmount).toBe(0);
  });

  test('default tax category — a line with no taxCategoryId falls back to the org default', async () => {
    const org = await insertOrganization({ taxSystem: 'VAT' });
    const category = await insertTaxCategory(org._id, { name: 'Standard', isDefault: true });
    await setDefaultTaxCategory(org._id, category._id);
    await insertTaxRate(org._id, category._id, { rate: 20 });

    const result = await taxCalculatorService.calculateTax({
      organizationId: org._id,
      lines: [{ lineId: '0', amount: 1000 }], // no taxCategoryId on the line
    });
    expect(result.totalTax).toBe(200);
    expect(result.taxBreakdownByCategory[0].taxCategoryName).toBe('Standard');
  });

  test('default tax category self-heals when Organization.defaultTaxCategoryId pointer is stale/unset', async () => {
    const org = await insertOrganization({ taxSystem: 'VAT' }); // defaultTaxCategoryId never set
    const category = await insertTaxCategory(org._id, { name: 'Standard', isDefault: true }); // isDefault true, but pointer not synced
    await insertTaxRate(org._id, category._id, { rate: 20 });

    const result = await taxCalculatorService.calculateTax({
      organizationId: org._id,
      lines: [{ lineId: '0', amount: 1000 }],
    });
    expect(result.totalTax).toBe(200); // live isDefault query fallback still resolves it
  });

  test('VAT 20%', async () => {
    const org = await insertOrganization({ taxSystem: 'VAT' });
    const category = await insertTaxCategory(org._id, { name: 'Standard' });
    await insertTaxRate(org._id, category._id, { name: 'VAT 20%', rate: 20 });
    const result = await taxCalculatorService.calculateTax({
      organizationId: org._id,
      lines: [{ lineId: '0', amount: 1000, taxCategoryId: category._id }],
    });
    expect(result.totalTax).toBe(200);
  });

  test('VAT 5% (reduced rate)', async () => {
    const org = await insertOrganization({ taxSystem: 'VAT' });
    const category = await insertTaxCategory(org._id, { name: 'Reduced' });
    await insertTaxRate(org._id, category._id, { name: 'VAT 5%', rate: 5 });
    const result = await taxCalculatorService.calculateTax({
      organizationId: org._id,
      lines: [{ lineId: '0', amount: 1000, taxCategoryId: category._id }],
    });
    expect(result.totalTax).toBe(50);
  });

  test('VAT 0% (zero-rated) — a real 0% rate still resolves to an explicit zero, not "no category"', async () => {
    const org = await insertOrganization({ taxSystem: 'VAT' });
    const category = await insertTaxCategory(org._id, { name: 'Zero Rated' });
    await insertTaxRate(org._id, category._id, { name: 'VAT 0%', rate: 0 });
    const result = await taxCalculatorService.calculateTax({
      organizationId: org._id,
      lines: [{ lineId: '0', amount: 1000, taxCategoryId: category._id }],
    });
    expect(result.totalTax).toBe(0);
    expect(result.lines[0].components[0].ratePercent).toBe(0);
  });

  test('VAT exclusive — tax is added on top of the line amount', async () => {
    const org = await insertOrganization({ taxSystem: 'VAT' });
    const category = await insertTaxCategory(org._id, { name: 'Standard' });
    await insertTaxRate(org._id, category._id, { rate: 20 });
    const result = await taxCalculatorService.calculateTax({
      organizationId: org._id,
      taxInclusive: false,
      lines: [{ lineId: '0', amount: 100, taxCategoryId: category._id }],
    });
    expect(result.lines[0].taxableAmount).toBe(100);
    expect(result.lines[0].taxAmount).toBe(20);
  });

  test('VAT inclusive — tax is backed out of the line amount, not added on top', async () => {
    const org = await insertOrganization({ taxSystem: 'VAT' });
    const category = await insertTaxCategory(org._id, { name: 'Standard' });
    await insertTaxRate(org._id, category._id, { rate: 20 });
    // £120 inclusive of 20% VAT => £100 net + £20 tax
    const result = await taxCalculatorService.calculateTax({
      organizationId: org._id,
      taxInclusive: true,
      lines: [{ lineId: '0', amount: 120, taxCategoryId: category._id }],
    });
    expect(result.lines[0].taxableAmount).toBe(100);
    expect(result.lines[0].taxAmount).toBe(20);
  });

  test('tax exempt customer — Customer.taxExempt boolean fast-path zeroes all lines', async () => {
    const org = await insertOrganization({ taxSystem: 'VAT' });
    const category = await insertTaxCategory(org._id, { name: 'Standard' });
    await insertTaxRate(org._id, category._id, { rate: 20 });
    const branch = await insertBranch(org._id);
    const customer = await insertCustomer(org._id, branch._id, { taxExempt: true });
    const result = await taxCalculatorService.calculateTax({
      organizationId: org._id,
      customerId: customer._id,
      lines: [{ lineId: '0', amount: 1000, taxCategoryId: category._id }],
    });
    expect(result.totalTax).toBe(0);
    expect(result.exemptionApplied).toBe(true);
  });

  test('tax exempt customer — fully-exempt TaxExemption record (taxCategoryId null)', async () => {
    const org = await insertOrganization({ taxSystem: 'VAT' });
    const category = await insertTaxCategory(org._id, { name: 'Standard' });
    await insertTaxRate(org._id, category._id, { rate: 20 });
    const branch = await insertBranch(org._id);
    const customer = await insertCustomer(org._id, branch._id);
    await insertTaxExemption(org._id, customer._id, { taxCategoryId: null, exemptionType: 'Diplomatic' });
    const result = await taxCalculatorService.calculateTax({
      organizationId: org._id,
      customerId: customer._id,
      lines: [{ lineId: '0', amount: 1000, taxCategoryId: category._id }],
    });
    expect(result.totalTax).toBe(0);
    expect(result.exemptionApplied).toBe(true);
  });

  test('tax exempt customer — category-specific TaxExemption only exempts that one category', async () => {
    const org = await insertOrganization({ taxSystem: 'VAT' });
    const exemptCategory = await insertTaxCategory(org._id, { name: 'Books' });
    const taxableCategory = await insertTaxCategory(org._id, { name: 'Standard' });
    await insertTaxRate(org._id, exemptCategory._id, { rate: 20 });
    await insertTaxRate(org._id, taxableCategory._id, { rate: 20 });
    const branch = await insertBranch(org._id);
    const customer = await insertCustomer(org._id, branch._id);
    await insertTaxExemption(org._id, customer._id, { taxCategoryId: exemptCategory._id });

    const result = await taxCalculatorService.calculateTax({
      organizationId: org._id,
      customerId: customer._id,
      lines: [
        { lineId: 'exempt-line', amount: 1000, taxCategoryId: exemptCategory._id },
        { lineId: 'taxable-line', amount: 1000, taxCategoryId: taxableCategory._id },
      ],
    });
    const exemptLine = result.lines.find((l) => l.lineId === 'exempt-line');
    const taxableLine = result.lines.find((l) => l.lineId === 'taxable-line');
    expect(exemptLine.taxAmount).toBe(0);
    expect(taxableLine.taxAmount).toBe(200);
  });

  test('product/line-specific tax category override beats the org default', async () => {
    const org = await insertOrganization({ taxSystem: 'VAT' });
    const defaultCategory = await insertTaxCategory(org._id, { name: 'Standard', isDefault: true });
    await setDefaultTaxCategory(org._id, defaultCategory._id);
    await insertTaxRate(org._id, defaultCategory._id, { rate: 20 });

    const zeroCategory = await insertTaxCategory(org._id, { name: 'Zero Rated' });
    await insertTaxRate(org._id, zeroCategory._id, { rate: 0 });

    const result = await taxCalculatorService.calculateTax({
      organizationId: org._id,
      lines: [{ lineId: '0', amount: 1000, taxCategoryId: zeroCategory._id }], // explicit override
    });
    expect(result.totalTax).toBe(0); // used the override, not the 20% default
  });

  test('multiple tax categories in one calculation resolve independently', async () => {
    const org = await insertOrganization({ taxSystem: 'VAT' });
    const standard = await insertTaxCategory(org._id, { name: 'Standard' });
    const reduced = await insertTaxCategory(org._id, { name: 'Reduced' });
    await insertTaxRate(org._id, standard._id, { rate: 20 });
    await insertTaxRate(org._id, reduced._id, { rate: 5 });

    const result = await taxCalculatorService.calculateTax({
      organizationId: org._id,
      lines: [
        { lineId: 'a', amount: 1000, taxCategoryId: standard._id },
        { lineId: 'b', amount: 1000, taxCategoryId: reduced._id },
      ],
    });
    expect(result.totalTax).toBe(250);
    expect(result.taxBreakdownByCategory).toHaveLength(2);
  });

  test('tax rule priority — multiple rates on the same category apply in priority order (lowest first)', async () => {
    const org = await insertOrganization({ taxSystem: 'SALES_TAX' });
    const category = await insertTaxCategory(org._id, { name: 'Standard' });
    // Two flat (non-compound) rates on the same category — order shouldn't matter for
    // non-compound, but priority determines the components[] array order deterministically.
    await insertTaxRate(org._id, category._id, { name: 'Rate B', rate: 3, priority: 2 });
    await insertTaxRate(org._id, category._id, { name: 'Rate A', rate: 2, priority: 1 });

    const result = await taxCalculatorService.calculateTax({
      organizationId: org._id,
      lines: [{ lineId: '0', amount: 1000, taxCategoryId: category._id }],
    });
    expect(result.totalTax).toBe(50); // 2% + 3%
    expect(result.lines[0].components.map((c) => c.name)).toEqual(['Rate A', 'Rate B']); // priority-ordered, deterministic
  });

  describe('US-style jurisdiction stacking (Sales Tax)', () => {
    const setupUsStack = async () => {
      const org = await insertOrganization({ taxSystem: 'SALES_TAX', baseCurrency: 'USD' });
      const category = await insertTaxCategory(org._id, { name: 'Standard' });
      const state = await insertTaxJurisdiction(org._id, { name: 'California', level: 'STATE', countryCode: 'US' });
      const county = await insertTaxJurisdiction(org._id, {
        name: 'Los Angeles County',
        level: 'COUNTY',
        countryCode: 'US',
        parentJurisdictionId: state._id,
      });
      const city = await insertTaxJurisdiction(org._id, {
        name: 'Los Angeles',
        level: 'CITY',
        countryCode: 'US',
        parentJurisdictionId: county._id,
      });
      await insertTaxRate(org._id, category._id, {
        name: 'CA State Tax',
        rate: 6,
        taxJurisdictionId: state._id,
        priority: 1,
      });
      await insertTaxRate(org._id, category._id, {
        name: 'LA County Tax',
        rate: 1,
        taxJurisdictionId: county._id,
        priority: 2,
      });
      await insertTaxRate(org._id, category._id, {
        name: 'LA City Tax',
        rate: 0.5,
        taxJurisdictionId: city._id,
        priority: 3,
      });
      return { org, category, state, county, city };
    };

    test('US state tax alone', async () => {
      const { org, category, state } = await setupUsStack();
      const result = await taxCalculatorService.calculateTax({
        organizationId: org._id,
        currencyDecimalPlaces: 2,
        jurisdictionIds: [state._id],
        lines: [{ lineId: '0', amount: 100, taxCategoryId: category._id }],
      });
      expect(result.totalTax).toBe(6);
    });

    test('US state + county tax', async () => {
      const { org, category, state, county } = await setupUsStack();
      const result = await taxCalculatorService.calculateTax({
        organizationId: org._id,
        jurisdictionIds: [state._id, county._id],
        lines: [{ lineId: '0', amount: 100, taxCategoryId: category._id }],
      });
      expect(result.totalTax).toBe(7); // 6 + 1
    });

    test('US city tax alone (no state/county in the resolved jurisdiction set)', async () => {
      const { org, category, city } = await setupUsStack();
      const result = await taxCalculatorService.calculateTax({
        organizationId: org._id,
        jurisdictionIds: [city._id],
        lines: [{ lineId: '0', amount: 100, taxCategoryId: category._id }],
      });
      expect(result.totalTax).toBe(0.5);
    });

    test('combined US state + county + city tax (full stack) = 7.5%', async () => {
      const { org, category, state, county, city } = await setupUsStack();
      const result = await taxCalculatorService.calculateTax({
        organizationId: org._id,
        jurisdictionIds: [state._id, county._id, city._id],
        lines: [{ lineId: '0', amount: 100, taxCategoryId: category._id }],
      });
      expect(result.totalTax).toBe(7.5);
      expect(result.lines[0].components).toHaveLength(3);
    });

    test('a jurisdiction-scoped rate does NOT apply when its jurisdiction is not in the resolved set', async () => {
      const org = await insertOrganization({ taxSystem: 'SALES_TAX' });
      const category = await insertTaxCategory(org._id, { name: 'Standard' });
      const texas = await insertTaxJurisdiction(org._id, { name: 'Texas', level: 'STATE' });
      await insertTaxRate(org._id, category._id, { name: 'TX State Tax', rate: 6.25, taxJurisdictionId: texas._id });
      // Buyer is not in Texas — no jurisdictionIds passed.
      const result = await taxCalculatorService.calculateTax({
        organizationId: org._id,
        lines: [{ lineId: '0', amount: 100, taxCategoryId: category._id }],
      });
      expect(result.totalTax).toBe(0);
    });

    test('compound tax stacks on top of tax already applied, not the flat base', async () => {
      const org = await insertOrganization({ taxSystem: 'SALES_TAX' });
      const category = await insertTaxCategory(org._id, { name: 'Standard' });
      await insertTaxRate(org._id, category._id, { name: 'Base Tax', rate: 10, priority: 1, isCompound: false });
      await insertTaxRate(org._id, category._id, { name: 'Compound Surcharge', rate: 10, priority: 2, isCompound: true });
      // Base: 10% of 100 = 10. Compound: 10% of (100 + 10) = 11. Total = 21, not 20.
      const result = await taxCalculatorService.calculateTax({
        organizationId: org._id,
        lines: [{ lineId: '0', amount: 100, taxCategoryId: category._id }],
      });
      expect(result.totalTax).toBe(21);
    });
  });

  test('GST — same engine, different taxSystem label, still resolves configured rates', async () => {
    const org = await insertOrganization({ taxSystem: 'GST' });
    const category = await insertTaxCategory(org._id, { name: 'Standard GST' });
    await insertTaxRate(org._id, category._id, { name: 'GST 18%', rate: 18 });
    const result = await taxCalculatorService.calculateTax({
      organizationId: org._id,
      lines: [{ lineId: '0', amount: 1000, taxCategoryId: category._id }],
    });
    expect(result.totalTax).toBe(180);
  });

  test('historical/effective-dated rate — an old rate change never affects a calculation as-of a past date', async () => {
    const org = await insertOrganization({ taxSystem: 'VAT' });
    const category = await insertTaxCategory(org._id, { name: 'Standard' });
    // Old rate: 17%, effective until 2023-12-31. New rate: 18%, effective from 2024-01-01.
    await insertTaxRate(org._id, category._id, {
      name: 'VAT 17% (old)',
      rate: 17,
      effectiveFrom: new Date('2020-01-01'),
      effectiveTo: new Date('2023-12-31'),
    });
    await insertTaxRate(org._id, category._id, {
      name: 'VAT 18% (new)',
      rate: 18,
      effectiveFrom: new Date('2024-01-01'),
      effectiveTo: null,
    });

    const historical = await taxCalculatorService.calculateTax({
      organizationId: org._id,
      asOfDate: new Date('2023-06-15'), // inside the old rate's window
      lines: [{ lineId: '0', amount: 1000, taxCategoryId: category._id }],
    });
    expect(historical.totalTax).toBe(170); // old invoice keeps the old rate

    const current = await taxCalculatorService.calculateTax({
      organizationId: org._id,
      asOfDate: new Date('2024-06-15'),
      lines: [{ lineId: '0', amount: 1000, taxCategoryId: category._id }],
    });
    expect(current.totalTax).toBe(180); // a new calculation uses the new rate
  });

  test('rounding — a rate that does not divide evenly rounds to the nearest minor unit, not truncates', async () => {
    const org = await insertOrganization({ taxSystem: 'SALES_TAX' });
    const category = await insertTaxCategory(org._id, { name: 'Standard' });
    await insertTaxRate(org._id, category._id, { name: '8.375% Combined', rate: 8.375 });
    // $0.03 at 8.375% = $0.0025125 -> rounds to $0.00 (not negative, not truncated oddly)
    const tiny = await taxCalculatorService.calculateTax({
      organizationId: org._id,
      currencyDecimalPlaces: 2,
      lines: [{ lineId: '0', amount: 0.03, taxCategoryId: category._id }],
    });
    expect(tiny.lines[0].taxAmount).toBe(0);

    // $100 at 8.375% = $8.375 -> rounds to $8.38 (round-half-up on the third decimal)
    const rounded = await taxCalculatorService.calculateTax({
      organizationId: org._id,
      currencyDecimalPlaces: 2,
      lines: [{ lineId: '0', amount: 100, taxCategoryId: category._id }],
    });
    expect(rounded.lines[0].taxAmount).toBe(8.38);
  });

  test('multi-currency — a currency with 0 decimal places computes tax in whole units', async () => {
    const org = await insertOrganization({ taxSystem: 'VAT', baseCurrency: 'JPY' });
    const category = await insertTaxCategory(org._id, { name: 'Standard' });
    await insertTaxRate(org._id, category._id, { rate: 10 });
    const result = await taxCalculatorService.calculateTax({
      organizationId: org._id,
      currencyDecimalPlaces: 0,
      lines: [{ lineId: '0', amount: 1000, taxCategoryId: category._id }],
    });
    expect(result.totalTax).toBe(100);
    expect(Number.isInteger(result.totalTax)).toBe(true);
  });

  test('tenant isolation — org A tax configuration never leaks into org B calculation', async () => {
    const orgA = await insertOrganization({ taxSystem: 'VAT', name: 'Org A' });
    const categoryA = await insertTaxCategory(orgA._id, { name: 'Standard A', isDefault: true });
    await setDefaultTaxCategory(orgA._id, categoryA._id);
    await insertTaxRate(orgA._id, categoryA._id, { rate: 20 });

    // Org B has its own, different tax system and no categories/rates at all.
    const orgB = await insertOrganization({ taxSystem: 'VAT', name: 'Org B' });

    const resultB = await taxCalculatorService.calculateTax({
      organizationId: orgB._id,
      lines: [{ lineId: '0', amount: 1000 }], // no explicit category — would use org A's default if isolation were broken
    });
    expect(resultB.totalTax).toBe(0); // org B has no default category of its own — must not inherit org A's

    // Sanity: org A's own calculation is unaffected and still resolves correctly.
    const resultA = await taxCalculatorService.calculateTax({
      organizationId: orgA._id,
      lines: [{ lineId: '0', amount: 1000 }],
    });
    expect(resultA.totalTax).toBe(200);
  });

  test('inactive tax rate is not applied', async () => {
    const org = await insertOrganization({ taxSystem: 'VAT' });
    const category = await insertTaxCategory(org._id, { name: 'Standard' });
    await insertTaxRate(org._id, category._id, { rate: 20, status: 'inactive' });
    const result = await taxCalculatorService.calculateTax({
      organizationId: org._id,
      lines: [{ lineId: '0', amount: 1000, taxCategoryId: category._id }],
    });
    expect(result.totalTax).toBe(0);
  });

  test('inactive tax category is never used as the org default (self-heal query filters by status: active)', async () => {
    const org = await insertOrganization({ taxSystem: 'VAT' });
    const category = await insertTaxCategory(org._id, { name: 'Old Default', isDefault: true, status: 'inactive' });
    await insertTaxRate(org._id, category._id, { rate: 20 });
    const result = await taxCalculatorService.calculateTax({
      organizationId: org._id,
      lines: [{ lineId: '0', amount: 1000 }], // no explicit category — relies on default resolution
    });
    expect(result.totalTax).toBe(0); // inactive category is not eligible as a default
  });
});
