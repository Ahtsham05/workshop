const { TaxRate } = require('../../models');

/**
 * @typedef {Object} TaxProvider
 * @property {(input: Object) => Promise<Array>} resolveApplicableRates
 *
 * The only implementation wired up today — resolves TaxRate rows an admin has configured
 * directly. The interface boundary (this file) exists so a future external tax provider
 * (e.g. a live US per-jurisdiction rate lookup) can be swapped in without touching
 * taxCalculator.service.js — see CLAUDE.md localization spec section 14 ("build an internal
 * tax engine abstraction that can later connect to an external tax provider").
 */

/**
 * Active TaxRate rows for a category, effective as of `asOfDate`, that either apply
 * everywhere (taxJurisdictionId: null) or match one of `jurisdictionIds`. Sorted by
 * priority so compound rates stack in the right order.
 */
const resolveApplicableRates = async ({ organizationId, taxCategoryId, jurisdictionIds = [], asOfDate = new Date() }) => {
  if (!taxCategoryId) return [];

  const jurisdictionOr = jurisdictionIds.length
    ? [{ taxJurisdictionId: null }, { taxJurisdictionId: { $in: jurisdictionIds } }]
    : [{ taxJurisdictionId: null }];

  const rates = await TaxRate.find({
    organizationId,
    taxCategoryId,
    status: 'active',
    effectiveFrom: { $lte: asOfDate },
    $and: [{ $or: [{ effectiveTo: null }, { effectiveTo: { $gte: asOfDate } }] }, { $or: jurisdictionOr }],
  })
    .sort({ priority: 1 })
    .lean();

  return rates;
};

module.exports = { resolveApplicableRates };
