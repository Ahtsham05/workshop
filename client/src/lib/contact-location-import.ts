import type { CellValue, ImportFieldSpec } from '@/lib/excel-import'
import { parseText } from '@/lib/excel-import'
import { countryName } from '@/lib/countries'

/**
 * City / State / Country spreadsheet columns for the customer and supplier imports and
 * exports (wholesale & distributor orgs). The server resolves the country text
 * (server/src/utils/location.js), so a file can say "Pakistan", "PK" or "USA".
 */
export const LOCATION_IMPORT_FIELDS: ImportFieldSpec[] = [
  { key: 'city', label: 'City', width: 18, aliases: ['Town', 'City Name', 'شہر'] },
  {
    key: 'state',
    label: 'State / Province',
    width: 18,
    aliases: ['State', 'Province', 'Region', 'County', 'Emirate', 'State Code', 'صوبہ'],
  },
  { key: 'country', label: 'Country', width: 18, aliases: ['Country Name', 'Country Code', 'Nation', 'ملک'] },
]

const LOCATION_ALIAS_WORDS = new Set(['city', 'town', 'state', 'province', 'country'])

/**
 * Insert the location columns right after Address. The shared Address aliases include
 * "City" (for files with a single "City" column as the whole address), so that alias is
 * dropped here — a City column then fills City, not Address.
 */
export function withLocationFields(fields: ImportFieldSpec[], enabled: boolean): ImportFieldSpec[] {
  if (!enabled) return fields
  const out: ImportFieldSpec[] = []
  fields.forEach((field) => {
    if (field.key === 'address') {
      out.push({
        ...field,
        label: 'Street Address',
        aliases: [
          'Address',
          'Street Address',
          'Address Line 1',
          ...(field.aliases || []).filter((alias) => !LOCATION_ALIAS_WORDS.has(alias.trim().toLowerCase())),
        ],
      })
      out.push(...LOCATION_IMPORT_FIELDS)
    } else {
      out.push(field)
    }
  })
  return out
}

/** Sample-row values so the downloadable template shows the columns filled in. */
export function withLocationSample<T extends Record<string, unknown>>(rows: T[], enabled: boolean, defaultCountry = ''): T[] {
  if (!enabled) return rows
  const country = countryName(defaultCountry) || 'Pakistan'
  const examples =
    defaultCountry === 'US'
      ? [
          { city: 'Houston', state: 'TX' },
          { city: 'Dallas', state: 'TX' },
        ]
      : [
          { city: 'Lahore', state: 'Punjab' },
          { city: 'Karachi', state: 'Sindh' },
        ]
  return rows.map((row, i) => ({ ...row, ...examples[i % examples.length], country }))
}

export interface ImportLocation {
  city?: string
  state?: string
  country?: string
}

/** Read the three cells of one row; the server resolves the country (and warns if unknown). */
export function readLocationCells(values: Record<string, CellValue>): ImportLocation {
  const location: ImportLocation = {}
  const city = parseText(values.city)
  if (city) location.city = city
  const state = parseText(values.state, { code: true })
  if (state) location.state = state
  const country = parseText(values.country)
  if (country) location.country = country
  return location
}

/** "Lahore, Punjab, Pakistan" for the import preview. */
export function locationPreview(location: ImportLocation): string {
  return [location.city, location.state, location.country].filter(Boolean).join(', ')
}
