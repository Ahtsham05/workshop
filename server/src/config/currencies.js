// ISO 4217 currency reference data used to drive the Localization/Currency settings UI
// and all money-formatting/rounding logic (see utils/money.js). This is static reference
// data, not tenant data — an Organization simply stores which of these codes it uses
// (baseCurrency/enabledCurrencies), the same way config/businessTypes.js works.
const CURRENCIES = [
  { code: 'PKR', name: 'Pakistani Rupee', symbol: '₨', decimalPlaces: 2, symbolPosition: 'before' },
  { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2, symbolPosition: 'before' },
  { code: 'GBP', name: 'British Pound', symbol: '£', decimalPlaces: 2, symbolPosition: 'before' },
  { code: 'EUR', name: 'Euro', symbol: '€', decimalPlaces: 2, symbolPosition: 'before' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: '$', decimalPlaces: 2, symbolPosition: 'before' },
  { code: 'AUD', name: 'Australian Dollar', symbol: '$', decimalPlaces: 2, symbolPosition: 'before' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', decimalPlaces: 2, symbolPosition: 'before' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', decimalPlaces: 2, symbolPosition: 'before' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimalPlaces: 2, symbolPosition: 'before' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimalPlaces: 0, symbolPosition: 'before' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', decimalPlaces: 2, symbolPosition: 'before' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', decimalPlaces: 2, symbolPosition: 'before' },
];

const CURRENCY_CODES = CURRENCIES.map((c) => c.code);

const CURRENCY_BY_CODE = CURRENCIES.reduce((acc, c) => {
  acc[c.code] = c;
  return acc;
}, {});

const getCurrencyMeta = (code) => CURRENCY_BY_CODE[String(code || '').toUpperCase()] || null;

module.exports = {
  CURRENCIES,
  CURRENCY_CODES,
  getCurrencyMeta,
};
