const BUSINESS_TYPES = [
  'retail',
  'wholesale',
  'wholesale_retail',
  'distributor',
  'services',
  'restaurant',
  'education',
  'healthcare',
  'other',
  'mobile_shop',
  'pharmacy',
  'factory',
  'school',
];

const BUSINESS_TYPE_ALIASES = {
  mobileshope: 'mobile_shop',
  'mobile shop': 'mobile_shop',
  'mobile-shop': 'mobile_shop',
  'wholesale to retail': 'wholesale_retail',
  'wholesaler to retail': 'wholesale_retail',
  'whole saler to retail': 'wholesale_retail',
  'wholesale-retail': 'wholesale_retail',
  manufacturing: 'factory',
  wholesaler: 'distributor',
  distributors: 'distributor',
  'wholesaler distributors': 'distributor',
  'wholesaler / distributors': 'distributor',
  'wholesale & distribution': 'distributor',
};

const MOBILE_SHOP_BUSINESS_TYPES = ['mobile_shop'];
const SCHOOL_BUSINESS_TYPES = ['school'];

const normalizeBusinessType = (value) => {
  if (!value) {
    return 'other';
  }

  const normalizedValue = String(value).trim().toLowerCase();
  return BUSINESS_TYPE_ALIASES[normalizedValue] || normalizedValue;
};

/**
 * Which menu pages an organization shows — mirrors client/src/lib/business-types.ts
 * (keep the two in sync):
 *  1. Business-type defaults: whole modules a type doesn't use start switched off.
 *  2. The org's Settings → Menu & Pages choices (Organization.menuVisibility: page URL →
 *     on/off), which always win over the defaults.
 * The most specific matching rule decides. Used to keep switched-off pages out of
 * Quick Links; nothing is deleted, so switching a page back on restores it.
 */
const BUSINESS_TYPE_HIDDEN_MODULES = {
  distributor: ['salesmen', 'communications'],
};

const HIDEABLE_MODULE_ROUTES = {
  hr: ['/hr'],
  branches: ['/branches', '/branch-overview'],
  salesmen: ['/salesmen', '/reports?tab=salesman-commission'],
  communications: ['/whatsapp', '/sms/log'],
};

const routeMatches = (route, rule) => {
  const [path, query = ''] = String(route).split('?');
  const [basePath, baseQuery] = rule.split('?');
  const cleanPath = path.replace(/\/+$/, '') || '/';
  if (!baseQuery) return cleanPath === basePath || (basePath !== '/' && cleanPath.startsWith(`${basePath}/`));
  if (cleanPath !== basePath) return false;
  const params = new URLSearchParams(query);
  return [...new URLSearchParams(baseQuery)].every(([key, value]) => params.get(key) === value);
};

/** True when `route` is switched off for this org (type default or Menu & Pages choice). */
const isRouteHiddenForBusinessType = (businessType, route, overrides) => {
  if (!route) return false;
  let best = null;
  const consider = (rule, hidden, override) => {
    if (!routeMatches(route, rule)) return;
    if (!best || rule.length > best.length || (rule.length === best.length && override && !best.override)) {
      best = { length: rule.length, hidden, override };
    }
  };
  (BUSINESS_TYPE_HIDDEN_MODULES[normalizeBusinessType(businessType)] || []).forEach((module) =>
    HIDEABLE_MODULE_ROUTES[module].forEach((rule) => consider(rule, true, false))
  );
  Object.entries(overrides || {}).forEach(([rule, shown]) => consider(rule, !shown, true));
  return best ? best.hidden : false;
};

/**
 * Print defaults a business type starts with. A branch keeps the schema defaults
 * (thermal 80mm, Standard) unless its organization's type is listed here. Wholesale
 * distributors print full-page A4 invoices on the Distributor layout.
 */
const BUSINESS_TYPE_PRINT_DEFAULTS = {
  distributor: { paperSize: 'a4', template: 'distributor' },
};

/** The branch schema's own print defaults — a branch still on these was never set up by hand. */
const FACTORY_PRINT_DEFAULTS = { paperSize: 'thermal80', template: 'standard' };

const printDefaultsForBusinessType = (businessType) =>
  BUSINESS_TYPE_PRINT_DEFAULTS[normalizeBusinessType(businessType)] || null;

module.exports = {
  BUSINESS_TYPES,
  BUSINESS_TYPE_PRINT_DEFAULTS,
  FACTORY_PRINT_DEFAULTS,
  printDefaultsForBusinessType,
  BUSINESS_TYPE_HIDDEN_MODULES,
  isRouteHiddenForBusinessType,
  MOBILE_SHOP_BUSINESS_TYPES,
  SCHOOL_BUSINESS_TYPES,
  normalizeBusinessType,
};
