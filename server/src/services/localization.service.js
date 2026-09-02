const { COUNTRIES, getCountryDefaults } = require('../config/countries');
const { CURRENCIES, getCurrencyMeta } = require('../config/currencies');
const { FALLBACK_CURRENCY_META } = require('../utils/money');

/**
 * Read-only country/currency reference data + "country → currency/tax-system/date-format"
 * defaults (CLAUDE.md localization spec sections 1-3). Consumed by the onboarding wizard,
 * the Localization settings page, and Joi validation (currency/country code enums). Country
 * selection only ever PREFILLS these defaults — callers always let the user override them
 * afterwards, never treat this as permanent business logic.
 */

const getCountries = () => COUNTRIES.map(({ code, name }) => ({ code, name }));

const getCurrencies = () => CURRENCIES;

/**
 * Resolve an organization's configured currency for formatting a one-off string (an audit-log
 * entityName, an error message) outside of any request context that already has the
 * organization loaded. Falls back to PKR when the org can't be found or hasn't configured one —
 * same as every other formatMoney() call site in this app.
 */
const resolveOrganizationCurrencyMeta = async (organizationId) => {
  if (!organizationId) return FALLBACK_CURRENCY_META;
  const { Organization } = require('../models');
  const organization = await Organization.findById(organizationId).select('baseCurrency').lean();
  return getCurrencyMeta(organization?.baseCurrency) || FALLBACK_CURRENCY_META;
};

module.exports = {
  getCountries,
  getCurrencies,
  getCountryDefaults,
  getCurrencyMeta,
  resolveOrganizationCurrencyMeta,
};
