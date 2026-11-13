// City / State / Country for customers and suppliers (wholesale & distributor orgs).
// Saved on the contact's `billingAddress` (city, state, countryCode — ISO alpha-2), the
// same sub-document server tax-jurisdiction resolution reads. Mirrors
// server/src/utils/location.js.

// ISO-3166 alpha-2 codes (+ XK Kosovo); names come from Intl so they stay correct.
export const ISO_COUNTRY_CODES = [
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
  'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS',
  'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN',
  'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE',
  'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF',
  'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM',
  'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM',
  'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC',
  'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK',
  'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA',
  'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG',
  'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW',
  'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS',
  'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO',
  'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI',
  'VN', 'VU', 'WF', 'WS', 'XK', 'YE', 'YT', 'ZA', 'ZM', 'ZW',
] as const

let regionNames: Intl.DisplayNames | null = null
function regions(): Intl.DisplayNames | null {
  if (regionNames) return regionNames
  try {
    regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
  } catch {
    regionNames = null
  }
  return regionNames
}

/** "PK" → "Pakistan". Unknown / empty codes come back as given. */
export function countryName(code?: string | null): string {
  const value = String(code || '').trim().toUpperCase()
  if (!value) return ''
  try {
    return regions()?.of(value) || value
  } catch {
    return value
  }
}

export interface CountryOption {
  value: string
  label: string
  sublabel: string
}

let countryOptionsCache: CountryOption[] | null = null
/** Every country, A→Z by English name, for the searchable picker. */
export function getCountryOptions(): CountryOption[] {
  if (!countryOptionsCache) {
    countryOptionsCache = ISO_COUNTRY_CODES.map((code) => ({ value: code, label: countryName(code), sublabel: code })).sort(
      (a, b) => a.label.localeCompare(b.label),
    )
  }
  return countryOptionsCache
}

// State / province suggestions for the countries this app is used in most. Free text is
// always allowed — these only feed the field's autocomplete. US / CA / AU use the postal
// abbreviation (how a "City, ST" address line is written there).
export const STATE_SUGGESTIONS: Record<string, { value: string; label: string }[]> = {
  US: [
    ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'],
    ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'],
    ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'],
    ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'],
    ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'],
    ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'],
    ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'],
    ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'], ['OR', 'Oregon'],
    ['PA', 'Pennsylvania'], ['PR', 'Puerto Rico'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'],
    ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'],
    ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
  ].map(([value, label]) => ({ value, label })),
  CA: [
    ['AB', 'Alberta'], ['BC', 'British Columbia'], ['MB', 'Manitoba'], ['NB', 'New Brunswick'],
    ['NL', 'Newfoundland and Labrador'], ['NS', 'Nova Scotia'], ['NT', 'Northwest Territories'],
    ['NU', 'Nunavut'], ['ON', 'Ontario'], ['PE', 'Prince Edward Island'], ['QC', 'Quebec'],
    ['SK', 'Saskatchewan'], ['YT', 'Yukon'],
  ].map(([value, label]) => ({ value, label })),
  AU: [
    ['ACT', 'Australian Capital Territory'], ['NSW', 'New South Wales'], ['NT', 'Northern Territory'],
    ['QLD', 'Queensland'], ['SA', 'South Australia'], ['TAS', 'Tasmania'], ['VIC', 'Victoria'],
    ['WA', 'Western Australia'],
  ].map(([value, label]) => ({ value, label })),
  PK: [
    'Punjab', 'Sindh', 'Khyber Pakhtunkhwa', 'Balochistan', 'Islamabad Capital Territory',
    'Gilgit-Baltistan', 'Azad Jammu and Kashmir',
  ].map((value) => ({ value, label: value })),
  IN: [
    'Andhra Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
    'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Odisha',
    'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  ].map((value) => ({ value, label: value })),
  AE: ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'].map((value) => ({
    value,
    label: value,
  })),
  GB: ['England', 'Scotland', 'Wales', 'Northern Ireland'].map((value) => ({ value, label: value })),
}

export interface ContactLocation {
  line1?: string
  line2?: string
  city?: string
  state?: string
  postalCode?: string
  countryCode?: string
}

const clean = (value?: string | null) => String(value ?? '').trim()

/** "Houston, TX 77001" — city, then state + postal code. '' when none set. */
export function formatCityStateLine(location?: ContactLocation | null): string {
  if (!location) return ''
  const stateZip = [clean(location.state), clean(location.postalCode)].filter(Boolean).join(' ')
  return [clean(location.city), stateZip].filter(Boolean).join(', ')
}

/** "Houston, TX, United States" — one line for tables, cards and screen headers. */
export function formatLocation(location?: ContactLocation | null): string {
  if (!location) return ''
  return [formatCityStateLine(location), countryName(location.countryCode)].filter(Boolean).join(', ')
}

/**
 * A contact's full postal address as print lines: street (free-text `address`, or the
 * structured line1/line2), then "City, ST ZIP", then the country.
 *   12 Main Street
 *   Houston, TX 77001
 *   United States
 */
export function contactAddressLines(contact?: { address?: string | null; billingAddress?: ContactLocation | null } | null): string[] {
  if (!contact) return []
  const b = contact.billingAddress || {}
  const structuredStreet = [clean(b.line1), clean(b.line2)].filter(Boolean)
  const street = structuredStreet.length
    ? structuredStreet
    : clean(contact.address)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
  const lines = [...street]
  const cityLine = formatCityStateLine(b)
  // Skip parts the free-text address already spells out (older records typed them in).
  const tail = street.join(' ').toLowerCase()
  if (cityLine && !tail.includes(cityLine.toLowerCase())) lines.push(cityLine)
  const country = countryName(b.countryCode)
  if (country && !tail.includes(country.toLowerCase())) lines.push(country)
  return lines
}

/** Same as contactAddressLines, joined with ", " for one-line spots. */
export function contactAddressText(contact?: { address?: string | null; billingAddress?: ContactLocation | null } | null): string {
  return contactAddressLines(contact).join(', ')
}

/** Form defaults for an existing contact (or a new one, starting in `defaultCountry`). */
export function locationFormDefaults(
  billingAddress?: ContactLocation | null,
  defaultCountry = '',
): { city: string; state: string; countryCode: string } {
  return {
    city: billingAddress?.city || '',
    state: billingAddress?.state || '',
    countryCode: billingAddress?.countryCode || defaultCountry,
  }
}

/** Flat form fields → the `billingAddress` patch the server merges into the contact. */
export function locationToPayload(values: { city?: string; state?: string; countryCode?: string }) {
  return {
    billingAddress: {
      city: (values.city || '').trim(),
      state: (values.state || '').trim(),
      countryCode: (values.countryCode || '').trim().toUpperCase(),
    },
  }
}
