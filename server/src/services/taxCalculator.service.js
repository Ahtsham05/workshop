const { Organization, TaxCategory, TaxExemption, Customer } = require('../models');
const Money = require('../utils/money');
const internalTaxProvider = require('./providers/internalTaxProvider');

/**
 * The single central tax-calculation service, per CLAUDE.md localization spec section 19 —
 * Invoice/POS/Purchase services call this instead of embedding their own tax logic. This
 * function is PURE / never writes to the database: it resolves rates and computes amounts
 * only. The caller is responsible for embedding the returned lines/taxLines as an immutable
 * snapshot on the transaction document at save time (see spec sections 20 and 40) — this
 * service is never called again to "re-check" an already-saved, finalized transaction.
 */

const zeroLineResult = (line, decimalPlaces) => ({
  lineId: line.lineId,
  taxableAmount: Money.roundMoney(line.amount, decimalPlaces),
  taxAmount: 0,
  effectiveRatePercent: 0,
  components: [],
});

/**
 * @param {Object} input
 * @param {string} input.organizationId
 * @param {string} [input.customerId] - resolves any active TaxExemption for this customer
 * @param {Date} [input.asOfDate] - resolves rates/exemptions effective on this date (defaults to now)
 * @param {boolean} [input.taxInclusive] - when true, `line.amount` already includes tax; tax is backed out rather than added on top
 * @param {number} [input.currencyDecimalPlaces] - decimal places of the transaction currency (default 2)
 * @param {Array<{lineId: string, amount: number, taxCategoryId?: string}>} input.lines
 * @param {string[]} [input.jurisdictionIds] - jurisdictions to match against jurisdiction-scoped TaxRates (US-style stacking)
 */
const calculateTax = async ({
  organizationId,
  customerId = null,
  asOfDate = new Date(),
  taxInclusive = false,
  currencyDecimalPlaces = Money.DEFAULT_DECIMAL_PLACES,
  lines = [],
  jurisdictionIds = [],
}) => {
  const organization = await Organization.findById(organizationId).select('taxSystem defaultTaxCategoryId').lean();
  const taxSystem = organization?.taxSystem || 'NONE';

  if (taxSystem === 'NONE' || !lines.length) {
    return {
      lines: lines.map((line) => zeroLineResult(line, currencyDecimalPlaces)),
      totalTax: 0,
      taxBreakdownByCategory: [],
      exemptionApplied: false,
    };
  }

  // Organization.defaultTaxCategoryId is a denormalized copy of TaxCategory.isDefault (kept
  // in sync by taxCategory.service.js on every create/update/soft-delete). Fall back to the
  // live flag directly in case the pointer predates that sync (e.g. data seeded before this
  // was wired up) — otherwise every line with no explicit category would silently resolve to
  // "no category" and zero tax despite a default category existing.
  let defaultTaxCategoryId = organization?.defaultTaxCategoryId ? String(organization.defaultTaxCategoryId) : null;
  if (!defaultTaxCategoryId) {
    const defaultCategory = await TaxCategory.findOne({ organizationId, isDefault: true, status: 'active' }).select('_id').lean();
    defaultTaxCategoryId = defaultCategory ? String(defaultCategory._id) : null;
  }

  let fullyExempt = false;
  const exemptCategoryIds = new Set();
  if (customerId) {
    // Customer.taxExempt is documented (see taxExemption.model.js) as the quick boolean
    // fast-path checked at calculation time, with the TaxExemption collection holding the
    // auditable detail behind it — check both rather than only the detail records, so
    // toggling "Tax Exempt" directly on a customer actually has an effect.
    const customer = await Customer.findById(customerId).select('taxExempt').lean();
    const exemptions = await TaxExemption.find({
      organizationId,
      customerId,
      status: 'active',
      validFrom: { $lte: asOfDate },
      $or: [{ validTo: null }, { validTo: { $gte: asOfDate } }],
    }).lean();
    fullyExempt = !!customer?.taxExempt || exemptions.some((exemption) => !exemption.taxCategoryId);
    exemptions
      .filter((exemption) => exemption.taxCategoryId)
      .forEach((exemption) => exemptCategoryIds.add(String(exemption.taxCategoryId)));
  }

  const categoryNameCache = new Map();
  const resolveCategoryName = async (taxCategoryId) => {
    if (categoryNameCache.has(taxCategoryId)) return categoryNameCache.get(taxCategoryId);
    const category = await TaxCategory.findById(taxCategoryId).select('name').lean();
    const name = category?.name || null;
    categoryNameCache.set(taxCategoryId, name);
    return name;
  };

  const resultLines = [];
  const categoryTotals = new Map();
  let totalTaxMinorUnits = 0;
  let exemptionApplied = fullyExempt;

  // eslint-disable-next-line no-restricted-syntax
  for (const line of lines) {
    const taxCategoryId = line.taxCategoryId ? String(line.taxCategoryId) : defaultTaxCategoryId;

    if (fullyExempt || !taxCategoryId || exemptCategoryIds.has(taxCategoryId)) {
      if (exemptCategoryIds.has(taxCategoryId)) exemptionApplied = true;
      resultLines.push(zeroLineResult(line, currencyDecimalPlaces));
      // eslint-disable-next-line no-continue
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const rates = await internalTaxProvider.resolveApplicableRates({
      organizationId,
      taxCategoryId,
      jurisdictionIds,
      asOfDate,
    });

    if (!rates.length) {
      resultLines.push(zeroLineResult(line, currencyDecimalPlaces));
      // eslint-disable-next-line no-continue
      continue;
    }

    let taxableAmountMinorUnits = Money.toMinorUnits(line.amount, currencyDecimalPlaces);
    if (taxInclusive) {
      const totalNonCompoundPercent = rates
        .filter((rate) => rate.rateType === 'PERCENTAGE' && !rate.isCompound)
        .reduce((sum, rate) => sum + rate.rate, 0);
      taxableAmountMinorUnits = Math.round(taxableAmountMinorUnits / (1 + totalNonCompoundPercent / 100));
    }

    let lineTaxMinorUnits = 0;
    const components = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const rate of rates) {
      const baseMinorUnits = rate.isCompound ? taxableAmountMinorUnits + lineTaxMinorUnits : taxableAmountMinorUnits;
      const rateAmountMinorUnits =
        rate.rateType === 'PERCENTAGE'
          ? Math.round((baseMinorUnits * rate.rate) / 100)
          : Money.toMinorUnits(rate.rate, currencyDecimalPlaces);
      lineTaxMinorUnits += rateAmountMinorUnits;
      components.push({
        taxRateId: rate._id,
        name: rate.name,
        ratePercent: rate.rateType === 'PERCENTAGE' ? rate.rate : null,
        isCompound: !!rate.isCompound,
        amount: Money.fromMinorUnits(rateAmountMinorUnits, currencyDecimalPlaces),
      });
    }

    totalTaxMinorUnits += lineTaxMinorUnits;

    // eslint-disable-next-line no-await-in-loop
    const categoryName = await resolveCategoryName(taxCategoryId);
    const bucket = categoryTotals.get(taxCategoryId) || {
      taxCategoryId,
      taxCategoryName: categoryName,
      taxableAmountMinorUnits: 0,
      taxAmountMinorUnits: 0,
    };
    bucket.taxableAmountMinorUnits += taxableAmountMinorUnits;
    bucket.taxAmountMinorUnits += lineTaxMinorUnits;
    categoryTotals.set(taxCategoryId, bucket);

    resultLines.push({
      lineId: line.lineId,
      taxableAmount: Money.fromMinorUnits(taxableAmountMinorUnits, currencyDecimalPlaces),
      taxAmount: Money.fromMinorUnits(lineTaxMinorUnits, currencyDecimalPlaces),
      effectiveRatePercent: taxableAmountMinorUnits > 0 ? Money.roundMoney((lineTaxMinorUnits / taxableAmountMinorUnits) * 100, 2) : 0,
      components,
    });
  }

  return {
    lines: resultLines,
    totalTax: Money.fromMinorUnits(totalTaxMinorUnits, currencyDecimalPlaces),
    taxBreakdownByCategory: Array.from(categoryTotals.values()).map((bucket) => ({
      taxCategoryId: bucket.taxCategoryId,
      taxCategoryName: bucket.taxCategoryName,
      taxableAmount: Money.fromMinorUnits(bucket.taxableAmountMinorUnits, currencyDecimalPlaces),
      taxAmount: Money.fromMinorUnits(bucket.taxAmountMinorUnits, currencyDecimalPlaces),
    })),
    exemptionApplied,
  };
};

module.exports = { calculateTax };
