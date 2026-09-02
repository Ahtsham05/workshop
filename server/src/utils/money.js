const { getCurrencyMeta } = require('../config/currencies');

/**
 * Precision-safe money math. Every existing Number field in the schema layer (Product.price,
 * Invoice.total, Purchase.totalAmount, ...) is left exactly as-is — these helpers are used
 * DURING calculation (inside services), converting to integer minor units (e.g. cents) so
 * chained arithmetic never accumulates binary-float drift (19.9999999997-style bugs), then
 * rounding back to a plain Number for storage, exactly as today. See CLAUDE.md localization
 * spec section 8.
 */

const DEFAULT_DECIMAL_PLACES = 2;

const toMinorUnits = (amount, decimalPlaces = DEFAULT_DECIMAL_PLACES) =>
  Math.round((Number(amount) || 0) * 10 ** decimalPlaces);

const fromMinorUnits = (minorUnits, decimalPlaces = DEFAULT_DECIMAL_PLACES) =>
  (Number(minorUnits) || 0) / 10 ** decimalPlaces;

const roundMoney = (amount, decimalPlaces = DEFAULT_DECIMAL_PLACES) =>
  fromMinorUnits(toMinorUnits(amount, decimalPlaces), decimalPlaces);

const addMoney = (a, b, decimalPlaces = DEFAULT_DECIMAL_PLACES) =>
  fromMinorUnits(toMinorUnits(a, decimalPlaces) + toMinorUnits(b, decimalPlaces), decimalPlaces);

const subtractMoney = (a, b, decimalPlaces = DEFAULT_DECIMAL_PLACES) =>
  fromMinorUnits(toMinorUnits(a, decimalPlaces) - toMinorUnits(b, decimalPlaces), decimalPlaces);

const sumMoney = (amounts = [], decimalPlaces = DEFAULT_DECIMAL_PLACES) =>
  fromMinorUnits(
    amounts.reduce((sum, amount) => sum + toMinorUnits(amount, decimalPlaces), 0),
    decimalPlaces
  );

// factor is a plain multiplier (quantity, a rate ratio, ...) — not itself a money amount.
const multiplyMoney = (amount, factor, decimalPlaces = DEFAULT_DECIMAL_PLACES) =>
  roundMoney((Number(amount) || 0) * (Number(factor) || 0), decimalPlaces);

const applyPercentage = (amount, percent, decimalPlaces = DEFAULT_DECIMAL_PLACES) => {
  const minorUnits = toMinorUnits(amount, decimalPlaces);
  const resultMinorUnits = Math.round((minorUnits * (Number(percent) || 0)) / 100);
  return fromMinorUnits(resultMinorUnits, decimalPlaces);
};

/**
 * Largest-remainder allocation: splits `totalMinorUnits` (an integer) across `weights`
 * proportionally, guaranteed to sum exactly back to `totalMinorUnits` — unlike naive
 * proportional rounding (each share rounded independently), which can be off by a unit or
 * two. Centralizes the proportional-discount-spread pattern purchase.service.js's
 * resolveItemNetUnitCost currently hand-rolls in float across purchase line items.
 * Returns an array of integers (minor units), same length/order as `weights`.
 */
const allocateProportionally = (totalMinorUnits, weights = []) => {
  const totalWeight = weights.reduce((sum, weight) => sum + (Number(weight) || 0), 0);
  if (!weights.length || totalWeight <= 0) {
    return weights.map(() => 0);
  }

  const rawShares = weights.map((weight) => (totalMinorUnits * (Number(weight) || 0)) / totalWeight);
  const flooredShares = rawShares.map(Math.floor);
  let remainder = totalMinorUnits - flooredShares.reduce((sum, share) => sum + share, 0);

  const byRemainingFraction = rawShares
    .map((value, index) => ({ index, fraction: value - flooredShares[index] }))
    .sort((a, b) => b.fraction - a.fraction);

  const result = [...flooredShares];
  for (let k = 0; k < byRemainingFraction.length && remainder > 0; k += 1) {
    result[byRemainingFraction[k].index] += 1;
    remainder -= 1;
  }
  return result;
};

const convertMoney = (amount, rate, decimalPlaces = DEFAULT_DECIMAL_PLACES) =>
  roundMoney((Number(amount) || 0) * (Number(rate) || 0), decimalPlaces);

const FALLBACK_CURRENCY_META = { code: 'PKR', name: 'Pakistani Rupee', symbol: 'Rs', decimalPlaces: 2, symbolPosition: 'before' };

/**
 * Server-side counterpart to client/src/lib/format-money.ts's formatMoneyWithMeta — used
 * when generating user-facing TEXT on the backend (ledger notes, AI/insight descriptions,
 * WhatsApp/SMS message bodies), as opposed to the client's React rendering. Defaults to the
 * app's pre-existing Rs/PKR-with-2-decimals behavior when no meta is given, so migrating an
 * existing hardcoded `` `Rs${amount.toFixed(2)}` `` call site to this function is a no-op
 * unless/until the caller also threads through the organization's actual currency meta.
 */
const formatMoney = (amount, meta = FALLBACK_CURRENCY_META) => {
  const value = Number(amount) || 0;
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: meta.decimalPlaces,
    maximumFractionDigits: meta.decimalPlaces,
  });
  return meta.symbolPosition === 'after' ? `${formatted} ${meta.symbol}` : `${meta.symbol}${formatted}`;
};

module.exports = {
  FALLBACK_CURRENCY_META,
  formatMoney,
  DEFAULT_DECIMAL_PLACES,
  toMinorUnits,
  fromMinorUnits,
  roundMoney,
  addMoney,
  subtractMoney,
  sumMoney,
  multiplyMoney,
  applyPercentage,
  allocateProportionally,
  convertMoney,
  getCurrencyMeta,
};
