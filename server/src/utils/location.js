// City / State / Country for customers and suppliers. Stored on the existing
// `billingAddress` sub-document (city, state, countryCode) so tax-jurisdiction resolution
// reads the same values the forms, imports and prints show. The free-text `address`
// field stays the street line.

const REGION_NAMES = new Intl.DisplayNames(['en'], { type: 'region' });

// ISO-3166 alpha-2 codes (+ XK Kosovo), named in English by Intl.
const ISO_COUNTRY_CODES = [
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI',
  'BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN',
  'CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK',
  'FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM',
  'HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN',
  'KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK',
  'ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP',
  'NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW',
  'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF',
  'TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI',
  'VN VU WF WS XK YE YT ZA ZM ZW',
]
  .join(' ')
  .split(' ');

const squash = (value) =>
  String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');

// Common ways people type a country that are not its official English name.
const COUNTRY_ALIASES = {
  usa: 'US',
  us: 'US',
  america: 'US',
  unitedstatesofamerica: 'US',
  uk: 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  greatbritain: 'GB',
  britain: 'GB',
  uae: 'AE',
  emirates: 'AE',
  ksa: 'SA',
  saudi: 'SA',
  pak: 'PK',
  korea: 'KR',
  southkorea: 'KR',
  northkorea: 'KP',
  russia: 'RU',
  holland: 'NL',
  turkey: 'TR',
  turkiye: 'TR',
  czechrepublic: 'CZ',
  ivorycoast: 'CI',
  burma: 'MM',
};

const COUNTRY_LOOKUP = (() => {
  const map = new Map(Object.entries(COUNTRY_ALIASES));
  ISO_COUNTRY_CODES.forEach((code) => {
    map.set(squash(code), code);
    map.set(squash(REGION_NAMES.of(code)), code);
  });
  return map;
})();

/**
 * Turn whatever a user or spreadsheet gave as a country ("Pakistan", "pk", "USA",
 * "United States") into an ISO alpha-2 code.
 * @returns {{ code: string, invalid: boolean }} code '' when empty; invalid when given but unknown
 */
const resolveCountryCode = (input) => {
  const raw = String(input === undefined || input === null ? '' : input).trim();
  if (!raw) return { code: '', invalid: false };
  const code = COUNTRY_LOOKUP.get(squash(raw));
  return code ? { code, invalid: false } : { code: '', invalid: true };
};

const countryName = (code) => {
  if (!code) return '';
  try {
    return REGION_NAMES.of(String(code).toUpperCase()) || String(code);
  } catch (e) {
    return String(code);
  }
};

const cleanText = (value) => (value === undefined || value === null ? '' : String(value).trim());

/**
 * Merge a city/state/country patch into an existing billingAddress without dropping the
 * fields the patch does not mention (line1, postalCode… set by other screens).
 */
const mergeBillingAddress = (existing, patch) => {
  const base = existing && typeof existing.toObject === 'function' ? existing.toObject() : { ...(existing || {}) };
  const next = { ...base };
  ['line1', 'line2', 'city', 'state', 'postalCode'].forEach((key) => {
    if (patch && Object.prototype.hasOwnProperty.call(patch, key)) next[key] = cleanText(patch[key]);
  });
  if (patch && Object.prototype.hasOwnProperty.call(patch, 'countryCode')) {
    const raw = cleanText(patch.countryCode);
    next.countryCode = raw ? resolveCountryCode(raw).code || raw.toUpperCase() : '';
  }
  return next;
};

/**
 * City / State / Country columns of one spreadsheet row, as dotted `billingAddress.*`
 * keys — `$set` merges them into an existing customer/supplier, and
 * `nestBillingAddress` turns them into a sub-document for a new one. Empty cells are ''
 * (the importers drop '' on update, so an empty cell never erases a saved value).
 * @returns {{ fields: Object, invalidCountry: string }}
 */
const importLocationFields = (row = {}) => {
  const country = resolveCountryCode(row.country);
  return {
    fields: {
      'billingAddress.city': cleanText(row.city),
      'billingAddress.state': cleanText(row.state),
      'billingAddress.countryCode': country.code,
    },
    invalidCountry: country.invalid ? cleanText(row.country) : '',
  };
};

/** `{ 'billingAddress.city': 'Lahore', name: 'x' }` → `{ billingAddress: { city: 'Lahore' }, name: 'x' }`, empties dropped. */
const nestBillingAddress = (doc) => {
  const out = {};
  const billing = {};
  Object.entries(doc).forEach(([key, value]) => {
    if (key.startsWith('billingAddress.')) {
      if (value !== '' && value !== undefined && value !== null) billing[key.slice('billingAddress.'.length)] = value;
    } else {
      out[key] = value;
    }
  });
  if (Object.keys(billing).length) out.billingAddress = billing;
  return out;
};

module.exports = {
  importLocationFields,
  nestBillingAddress,
  ISO_COUNTRY_CODES,
  resolveCountryCode,
  countryName,
  mergeBillingAddress,
};
