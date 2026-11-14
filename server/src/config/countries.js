// Country reference data driving the searchable country picker and the "country → currency
// + tax system + date format" defaults (see services/localization.service.js). These are
// DEFAULTS applied once at selection time (timeZone: the business time zone for single-zone
// countries; null where the country spans several and the business must pick/detect one), never a source of live business logic — the
// actual currency/tax-system an org operates under are the fields it saves on Organization,
// which the user can freely override afterwards (see CLAUDE.md localization spec, section 3).
//
// TAX_SYSTEMS mirrors the enum used on Organization.taxSystem / Invoice.taxSystem /
// Purchase.taxSystem.
const TAX_SYSTEMS = ['NONE', 'VAT', 'SALES_TAX', 'GST', 'CUSTOM'];

// Only a curated subset gets non-trivial defaults; every other ISO-3166 country still
// selects fine (COUNTRIES below covers a broad list) but falls back to FALLBACK_DEFAULTS.
const COUNTRIES = [
  {
    code: 'PK',
    name: 'Pakistan',
    defaultCurrency: 'PKR',
    taxSystem: 'SALES_TAX',
    taxRegistrationLabel: 'NTN / Sales Tax Registration No.',
    dateFormat: 'DD/MM/YYYY',
    locale: 'en-PK',
    timeZone: 'Asia/Karachi',
  },
  {
    code: 'US',
    name: 'United States',
    defaultCurrency: 'USD',
    taxSystem: 'SALES_TAX',
    taxRegistrationLabel: 'EIN / Tax ID',
    dateFormat: 'MM/DD/YYYY',
    locale: 'en-US',
    timeZone: null, // several zones — picked per business (device-detected)
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    defaultCurrency: 'GBP',
    taxSystem: 'VAT',
    taxRegistrationLabel: 'VAT Number',
    dateFormat: 'DD/MM/YYYY',
    locale: 'en-GB',
    timeZone: 'Europe/London',
  },
  {
    code: 'CA',
    name: 'Canada',
    defaultCurrency: 'CAD',
    taxSystem: 'GST',
    taxRegistrationLabel: 'GST/HST Number',
    dateFormat: 'MM/DD/YYYY',
    locale: 'en-CA',
    timeZone: null, // several zones — picked per business (device-detected)
  },
  {
    code: 'AU',
    name: 'Australia',
    defaultCurrency: 'AUD',
    taxSystem: 'GST',
    taxRegistrationLabel: 'ABN / GST Number',
    dateFormat: 'DD/MM/YYYY',
    locale: 'en-AU',
    timeZone: null, // several zones — picked per business (device-detected)
  },
  {
    code: 'AE',
    name: 'United Arab Emirates',
    defaultCurrency: 'AED',
    taxSystem: 'VAT',
    taxRegistrationLabel: 'TRN (Tax Registration Number)',
    dateFormat: 'DD/MM/YYYY',
    locale: 'en-AE',
    timeZone: 'Asia/Dubai',
  },
  {
    code: 'SA',
    name: 'Saudi Arabia',
    defaultCurrency: 'SAR',
    taxSystem: 'VAT',
    taxRegistrationLabel: 'VAT Registration Number',
    dateFormat: 'DD/MM/YYYY',
    locale: 'ar-SA',
    timeZone: 'Asia/Riyadh',
  },
  {
    code: 'IN',
    name: 'India',
    defaultCurrency: 'INR',
    taxSystem: 'GST',
    taxRegistrationLabel: 'GSTIN',
    dateFormat: 'DD/MM/YYYY',
    locale: 'en-IN',
    timeZone: 'Asia/Kolkata',
  },
  {
    code: 'DE',
    name: 'Germany',
    defaultCurrency: 'EUR',
    taxSystem: 'VAT',
    taxRegistrationLabel: 'USt-IdNr. (VAT ID)',
    dateFormat: 'DD/MM/YYYY',
    locale: 'de-DE',
    timeZone: 'Europe/Berlin',
  },
  {
    code: 'FR',
    name: 'France',
    defaultCurrency: 'EUR',
    taxSystem: 'VAT',
    taxRegistrationLabel: 'Numéro de TVA',
    dateFormat: 'DD/MM/YYYY',
    locale: 'fr-FR',
    timeZone: 'Europe/Paris',
  },
  {
    code: 'IT',
    name: 'Italy',
    defaultCurrency: 'EUR',
    taxSystem: 'VAT',
    taxRegistrationLabel: 'Partita IVA',
    dateFormat: 'DD/MM/YYYY',
    locale: 'it-IT',
    timeZone: 'Europe/Rome',
  },
  {
    code: 'ES',
    name: 'Spain',
    defaultCurrency: 'EUR',
    taxSystem: 'VAT',
    taxRegistrationLabel: 'NIF/CIF (VAT Number)',
    dateFormat: 'DD/MM/YYYY',
    locale: 'es-ES',
    timeZone: 'Europe/Madrid',
  },
  {
    code: 'NL',
    name: 'Netherlands',
    defaultCurrency: 'EUR',
    taxSystem: 'VAT',
    taxRegistrationLabel: 'BTW-nummer (VAT Number)',
    dateFormat: 'DD/MM/YYYY',
    locale: 'nl-NL',
    timeZone: 'Europe/Amsterdam',
  },
  {
    code: 'IE',
    name: 'Ireland',
    defaultCurrency: 'EUR',
    taxSystem: 'VAT',
    taxRegistrationLabel: 'VAT Number',
    dateFormat: 'DD/MM/YYYY',
    locale: 'en-IE',
    timeZone: 'Europe/Dublin',
  },
  {
    code: 'CH',
    name: 'Switzerland',
    defaultCurrency: 'CHF',
    taxSystem: 'VAT',
    taxRegistrationLabel: 'UID/VAT Number',
    dateFormat: 'DD.MM.YYYY',
    locale: 'de-CH',
    timeZone: 'Europe/Zurich',
  },
  {
    code: 'JP',
    name: 'Japan',
    defaultCurrency: 'JPY',
    taxSystem: 'CUSTOM',
    taxRegistrationLabel: 'Corporate Number',
    dateFormat: 'YYYY/MM/DD',
    locale: 'ja-JP',
    timeZone: 'Asia/Tokyo',
  },
  {
    code: 'CN',
    name: 'China',
    defaultCurrency: 'CNY',
    taxSystem: 'VAT',
    taxRegistrationLabel: 'Unified Social Credit Code',
    dateFormat: 'YYYY-MM-DD',
    locale: 'zh-CN',
    timeZone: 'Asia/Shanghai',
  },
];

const FALLBACK_DEFAULTS = {
  defaultCurrency: null,
  taxSystem: 'NONE',
  taxRegistrationLabel: 'Tax Registration Number',
  dateFormat: 'DD/MM/YYYY',
  locale: 'en-US',
  timeZone: null,
};

const COUNTRY_CODES = COUNTRIES.map((c) => c.code);

const getCountryDefaults = (countryCode) => {
  const country = COUNTRIES.find((c) => c.code === String(countryCode || '').toUpperCase());
  if (!country) return { ...FALLBACK_DEFAULTS };
  const { code, name, ...defaults } = country;
  return defaults;
};

module.exports = {
  COUNTRIES,
  COUNTRY_CODES,
  TAX_SYSTEMS,
  FALLBACK_DEFAULTS,
  getCountryDefaults,
};
