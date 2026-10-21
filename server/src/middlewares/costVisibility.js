const { userHasAnyPermission } = require('./permission');

/**
 * Hiding money from roles that may not see it — enforced at the API boundary, so a value
 * never leaves the server for such a role (the client hides the matching columns too).
 *
 *   viewCostPrices         — cost / purchase price, stock value, margin and profit on the
 *                            product, stock and dashboard endpoints (sale prices stay).
 *   viewManufacturingCosts — every cost, price and value inside Manufacturing; the role
 *                            still runs BOMs, orders, issues and receipts by quantity.
 *
 * A key is removed when its NAME says money and its VALUE is a number (or null); money-named
 * objects are walked, not dropped. Strings are never touched, so `{ label, value: '<id>' }` options survive.
 * Money with an irregular name (e.g. the daily report's `issued`) is listed explicitly.
 *
 * Writes from such a role have the same keys dropped from the request body, so they can
 * neither set a cost nor wipe one they cannot see (see bom.service#normalizeOperations).
 */

// Only the figures themselves go: a money-named object (e.g. `wipValue: { value, orders }`)
// is walked instead of dropped, so its counts stay and the screen keeps its shape.
const isMoneyShaped = (value) => value === null || typeof value === 'number';

const deepStrip = (data, shouldStrip) => {
  if (Array.isArray(data)) return data.map((item) => deepStrip(item, shouldStrip));
  if (!data || typeof data !== 'object') return data;
  const out = {};
  Object.keys(data).forEach((key) => {
    const value = data[key];
    if (shouldStrip(key, value)) return;
    out[key] = deepStrip(value, shouldStrip);
  });
  return out;
};

/** viewCostPrices: what the stock cost — not what it sells for. */
const COST_NAME = /cost|profit|margin/i;
const COST_EXACT = new Set([
  'purchasePrice',
  'lastPurchasePrice',
  'buyPrice',
  'stockValue',
  'totalStockValue',
  'inventoryValue',
  'totalInventoryValue',
  'valuation',
]);
const isCostKey = (key, value) => (COST_NAME.test(key) || COST_EXACT.has(key)) && isMoneyShaped(value);
/** Stock movements (adjustments, transfers, batches, counts) are valued at cost throughout. */
const STOCK_VALUE_NAME = /cost|profit|margin|value|amount/i;
const isStockValueKey = (key, value) => (STOCK_VALUE_NAME.test(key) || COST_EXACT.has(key)) && isMoneyShaped(value);

/** viewManufacturingCosts: costs AND prices/values — production staff work in quantities. */
const MFG_MONEY_NAME = /cost|price|value|amount|profit|margin|valuation/i;
const MFG_MONEY_EXACT = new Set(['rate', 'subtotal', 'discount', 'tax', 'grandTotal']);
/** Report columns that are money but not named like it (services/manufacturing/reports.service.js). */
const MFG_REPORT_MONEY = {
  production: ['periodIssued'],
  'material-issues': ['total'],
  daily: ['issued', 'returned', 'consumed', 'floorScrap', 'wipBalance', 'openingWip', 'closingWip'],
  batch: ['balance'],
};

const mfgStripper = (req) => {
  const reportMatch = /^\/reports\/([^/?]+)/.exec(req.path);
  const extra = new Set(reportMatch ? MFG_REPORT_MONEY[reportMatch[1]] || [] : []);
  return (key, value) => (MFG_MONEY_NAME.test(key) || MFG_MONEY_EXACT.has(key) || extra.has(key)) && isMoneyShaped(value);
};

const install = (req, res, shouldStrip) => {
  if (req.method !== 'GET' && req.body && typeof req.body === 'object') {
    req.body = deepStrip(req.body, shouldStrip);
  }
  const json = res.json.bind(res);
  res.json = (body) =>
    body && typeof body === 'object' ? json(deepStrip(JSON.parse(JSON.stringify(body)), shouldStrip)) : json(body);
};

/**
 * @param {string} permission the key that lets money through
 * @param {(req) => (key, value) => boolean} stripperFor
 * @param {{ exempt?: (req) => Promise<boolean>|boolean }} [opts]
 */
const hideMoneyUnless =
  (permission, stripperFor, opts = {}) =>
  async (req, res, next) => {
    try {
      if (!req.user) return next();
      if (await userHasAnyPermission(req.user, [permission])) return next();
      if (opts.exempt && (await opts.exempt(req))) return next();
      install(req, res, stripperFor(req));
      return next();
    } catch (error) {
      return next(error);
    }
  };

/** Synchronous check on the role passport already populated (owners/platform admins pass). */
const roleAllows = (user, permission) =>
  !!user &&
  (user.systemRole === 'superAdmin' ||
    user.systemRole === 'system_admin' ||
    !!(user.role && user.role.permissions && user.role.permissions[permission] === true));

/**
 * Router-level: these routers authenticate per route, so the user is only known once the
 * handler answers — the check happens when the response is sent.
 */
const hideCostPrices =
  ({ stockValued = false } = {}) =>
  (req, res, next) => {
    const strip = stockValued ? isStockValueKey : isCostKey;
    const json = res.json.bind(res);
    res.json = (body) =>
      body && typeof body === 'object' && req.user && !roleAllows(req.user, 'viewCostPrices')
        ? json(deepStrip(JSON.parse(JSON.stringify(body)), strip))
        : json(body);
    next();
  };

/** Drops cost fields from a write by a role that may not see cost (product forms, adjustments). */
const stripCostFromBody = (req) => {
  if (!roleAllows(req.user, 'viewCostPrices') && req.body && typeof req.body === 'object') {
    // By name alone: multipart forms send numbers as strings.
    req.body = deepStrip(req.body, (key) => COST_NAME.test(key) || COST_EXACT.has(key));
  }
};

const PURCHASING = ['viewPurchases', 'createPurchases', 'editPurchases'];
const hideManufacturingCosts = () =>
  hideMoneyUnless('viewManufacturingCosts', mfgStripper, {
    // Material receipts are the factory's purchase invoices — their rates belong to
    // whoever may buy, exactly like the Purchases page.
    exempt: (req) => req.path.startsWith('/material-receipts') && userHasAnyPermission(req.user, PURCHASING),
  });

const canViewCostPrices = (user) => roleAllows(user, 'viewCostPrices');

module.exports = {
  roleAllows,
  isStockValueKey,
  hideCostPrices,
  stripCostFromBody,
  hideManufacturingCosts,
  canViewCostPrices,
  deepStrip,
  isCostKey,
};
