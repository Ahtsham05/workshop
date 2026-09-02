const { COUNTRIES, getCountryDefaults } = require('../config/countries');
const { CURRENCIES, getCurrencyMeta } = require('../config/currencies');

/**
 * Read-only country/currency reference data + "country → currency/tax-system/date-format"
 * defaults (CLAUDE.md localization spec sections 1-3). Consumed by the onboarding wizard,
 * the Localization settings page, and Joi validation (currency/country code enums). Country
 * selection only ever PREFILLS these defaults — callers always let the user override them
 * afterwards, never treat this as permanent business logic.
 */

const getCountries = () => COUNTRIES.map(({ code, name }) => ({ code, name }));

const getCurrencies = () => CURRENCIES;

module.exports = {
  getCountries,
  getCurrencies,
  getCountryDefaults,
  getCurrencyMeta,
};
