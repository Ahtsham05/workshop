const { Organization } = require('../models');
const Money = require('../utils/money');
const taxCalculatorService = require('./taxCalculator.service');
const exchangeRateService = require('./exchangeRate.service');

/**
 * Rolls a taxCalculator.service.js calculateTax() result's per-line rate components up
 * into per-category totals — the shape persisted as header `taxLines[]` on Invoice/
 * Purchase/PurchaseOrder/RestaurantOrder. Shared by resolveTransactionTaxAndCurrency below
 * and by any caller (e.g. restaurant.service.js) that invokes calculateTax directly because
 * it doesn't need this function's currency-snapshot/discount-proration wrapper.
 *
 * @param {Object} taxResult - return value of taxCalculatorService.calculateTax
 * @param {Array<{taxCategoryId: string|null}>} calculatorLines - the lines passed into calculateTax (same order/index)
 * @param {number} decimalPlaces
 */
const buildTaxLinesFromResult = (taxResult, calculatorLines, decimalPlaces) => {
  const componentsByCategory = new Map();
  taxResult.lines.forEach((lineResult, index) => {
    const taxCategoryId = calculatorLines[index].taxCategoryId;
    if (!taxCategoryId) return;
    const categoryComponents = componentsByCategory.get(taxCategoryId) || new Map();
    (lineResult.components || []).forEach((component) => {
      const key = String(component.taxRateId);
      const existing = categoryComponents.get(key) || {
        taxRateId: component.taxRateId,
        name: component.name,
        ratePercent: component.ratePercent,
        isCompound: component.isCompound,
        amount: 0,
      };
      existing.amount = Money.addMoney(existing.amount, component.amount, decimalPlaces);
      categoryComponents.set(key, existing);
    });
    componentsByCategory.set(taxCategoryId, categoryComponents);
  });

  return taxResult.taxBreakdownByCategory.map((bucket) => ({
    taxCategoryId: bucket.taxCategoryId,
    taxCategoryName: bucket.taxCategoryName,
    taxableAmount: bucket.taxableAmount,
    taxAmount: bucket.taxAmount,
    components: Array.from((componentsByCategory.get(bucket.taxCategoryId) || new Map()).values()),
  }));
};

/**
 * Shared by invoice.service.js and purchase.service.js — resolves per-item tax (via the
 * central TaxCalculatorService) and the multi-currency snapshot (via ExchangeRateService)
 * for a set of already-validated line items + an already-resolved overall discount.
 *
 * This does not mutate its inputs; it returns the fields the caller should assign onto the
 * Invoice/Purchase document before running its own calculateTotals()-equivalent, so the
 * existing total/balance formula in each model stays exactly as it is today — this only
 * changes who supplies `tax`/`taxLines`/currency fields going in. See CLAUDE.md
 * localization spec sections 19-20.
 *
 * @param {Object} input
 * @param {string} input.organizationId
 * @param {string|null} [input.customerId] - only meaningful for sales (Invoice); omit for Purchase
 * @param {Date} [input.asOfDate]
 * @param {Array<{subtotal: number, productId?: string, taxCategoryId?: string|null}>} input.items - validated line items (already net of per-line discount)
 * @param {Map<string, string|null>} input.productTaxCategoryById - productId (string) -> taxCategoryId (string|null), for items that didn't specify their own taxCategoryId
 * @param {number} input.overallDiscount - the resolved overall (header-level) discount amount, in the transaction currency's major units
 * @param {string|null} [input.requestedCurrency] - an explicit currency the caller wants to (re)set; omit/null to keep the existing snapshot's currency or fall back to the org base currency
 * @param {{currency: string, baseCurrency: string, exchangeRate: number, exchangeRateDate: Date}|null} [input.existingCurrencySnapshot] - pass an already-saved document's currency fields on UPDATE so an unrelated edit never silently re-prices the exchange rate; omit/null on create
 * @param {number} [input.fallbackTax] - the caller's own manually-entered/previously-stored tax amount. Used verbatim (no line-level breakdown) ONLY when the organization has never configured a tax system (taxSystem === 'NONE', the default for every org until someone visits the new Tax settings pages) — this preserves the pre-existing "type a tax rate/amount by hand" behavior on Invoice/POS for orgs that haven't opted into the new engine yet, instead of silently zeroing out tax they were already charging.
 * @returns {Promise<{items: Array, tax: number, taxLines: Array, currency: string|null, baseCurrency: string|null, exchangeRate: number, exchangeRateDate: Date|null, taxSystem: string, taxInclusive: boolean}>}
 */
const resolveTransactionTaxAndCurrency = async ({
  organizationId,
  customerId = null,
  asOfDate = new Date(),
  items,
  productTaxCategoryById,
  overallDiscount,
  requestedCurrency = null,
  existingCurrencySnapshot = null,
  fallbackTax = 0,
}) => {
  const organization = await Organization.findById(organizationId)
    .select('baseCurrency taxInclusivePricingDefault taxSystem')
    .lean();
  const baseCurrency = organization?.baseCurrency || null;
  const currency = requestedCurrency || existingCurrencySnapshot?.currency || baseCurrency;
  const decimalPlaces = Money.getCurrencyMeta(currency)?.decimalPlaces ?? Money.DEFAULT_DECIMAL_PLACES;

  // Never silently reprice an already-snapshotted exchange rate just because some other
  // field on the transaction changed — only re-resolve when the currency itself is
  // actually changing (or there was no snapshot yet, e.g. create, or a legacy document).
  let currencySnapshot;
  if (existingCurrencySnapshot?.currency && (!requestedCurrency || requestedCurrency === existingCurrencySnapshot.currency)) {
    currencySnapshot = {
      currency: existingCurrencySnapshot.currency,
      baseCurrency: existingCurrencySnapshot.baseCurrency || baseCurrency,
      exchangeRate: existingCurrencySnapshot.exchangeRate ?? 1,
      exchangeRateDate: existingCurrencySnapshot.exchangeRateDate || null,
    };
  } else if (currency && baseCurrency) {
    const resolved = await exchangeRateService.getLatestRate(organizationId, currency, baseCurrency, asOfDate);
    currencySnapshot = { currency, baseCurrency, exchangeRate: resolved.rate, exchangeRateDate: resolved.rateDate };
  } else {
    currencySnapshot = { currency: currency || null, baseCurrency, exchangeRate: 1, exchangeRateDate: null };
  }

  const taxSystem = organization?.taxSystem || 'NONE';
  if (taxSystem === 'NONE') {
    return {
      items: items.map((item) => ({ ...item, taxCategoryId: null, taxableAmount: 0, taxAmount: 0 })),
      tax: Number(fallbackTax) || 0,
      taxLines: [],
      taxSystem: 'NONE',
      taxInclusive: false,
      ...currencySnapshot,
    };
  }

  // Tax applies after ALL discounts — spread the header-level discount across lines
  // proportionally (by their own already-net-of-line-discount subtotal) so each line's
  // taxable base matches what calculateTotals() treats as the discounted subtotal overall.
  const discountMinorUnits = Money.toMinorUnits(overallDiscount, decimalPlaces);
  const weights = items.map((item) => item.subtotal);
  const perItemDiscountMinorUnits = Money.allocateProportionally(discountMinorUnits, weights);

  const calculatorLines = items.map((item, index) => {
    const itemSubtotalMinorUnits = Money.toMinorUnits(item.subtotal, decimalPlaces);
    const taxableMinorUnits = Math.max(0, itemSubtotalMinorUnits - (perItemDiscountMinorUnits[index] || 0));
    const taxCategoryId = item.taxCategoryId || (item.productId ? productTaxCategoryById.get(String(item.productId)) : null) || null;
    return { lineId: String(index), amount: Money.fromMinorUnits(taxableMinorUnits, decimalPlaces), taxCategoryId };
  });

  const taxResult = await taxCalculatorService.calculateTax({
    organizationId,
    customerId,
    asOfDate,
    taxInclusive: !!organization?.taxInclusivePricingDefault,
    currencyDecimalPlaces: decimalPlaces,
    lines: calculatorLines,
  });

  const itemsWithTax = items.map((item, index) => ({
    ...item,
    taxCategoryId: calculatorLines[index].taxCategoryId,
    taxableAmount: taxResult.lines[index]?.taxableAmount ?? 0,
    taxAmount: taxResult.lines[index]?.taxAmount ?? 0,
  }));

  // Roll per-line components up into per-category totals for the header taxLines snapshot.
  const taxLines = buildTaxLinesFromResult(taxResult, calculatorLines, decimalPlaces);

  return {
    items: itemsWithTax,
    tax: taxResult.totalTax,
    taxLines,
    taxSystem: organization?.taxSystem || 'NONE',
    taxInclusive: !!organization?.taxInclusivePricingDefault,
    ...currencySnapshot,
  };
};

module.exports = { resolveTransactionTaxAndCurrency, buildTaxLinesFromResult };
