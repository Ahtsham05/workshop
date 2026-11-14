import { getTimeZoneNames, getTimeZoneOffsetMs, isValidTimeZone } from '@/lib/business-timezone'

/** One pickable zone with a human name; `region` groups the picker. */
export type TimeZoneOption = { zone: string; name: string; region: 'us' | 'common' | 'all' }

/**
 * US zones by the names Americans use. Arizona is separate from Mountain Time because most of
 * it never changes clocks (no daylight saving), so it matches Pacific time in summer.
 */
export const US_TIME_ZONES: TimeZoneOption[] = [
  { zone: 'America/New_York', name: 'Eastern Time (New York, Miami, Atlanta)', region: 'us' },
  { zone: 'America/Chicago', name: 'Central Time (Chicago, Houston, Dallas)', region: 'us' },
  { zone: 'America/Denver', name: 'Mountain Time (Denver, Salt Lake City)', region: 'us' },
  { zone: 'America/Phoenix', name: 'Arizona (Phoenix — no daylight saving)', region: 'us' },
  { zone: 'America/Los_Angeles', name: 'Pacific Time (Los Angeles, Seattle, Las Vegas)', region: 'us' },
  { zone: 'America/Anchorage', name: 'Alaska Time (Anchorage)', region: 'us' },
  { zone: 'Pacific/Honolulu', name: 'Hawaii Time (Honolulu)', region: 'us' },
  { zone: 'America/Puerto_Rico', name: 'Atlantic Time (Puerto Rico)', region: 'us' },
]

export const COMMON_TIME_ZONES: TimeZoneOption[] = [
  { zone: 'Asia/Karachi', name: 'Pakistan (Karachi, Lahore, Islamabad)', region: 'common' },
  { zone: 'Asia/Dubai', name: 'UAE (Dubai, Abu Dhabi)', region: 'common' },
  { zone: 'Asia/Riyadh', name: 'Saudi Arabia (Riyadh, Jeddah)', region: 'common' },
  { zone: 'Asia/Kolkata', name: 'India (Delhi, Mumbai)', region: 'common' },
  { zone: 'Europe/London', name: 'United Kingdom (London)', region: 'common' },
  { zone: 'America/Toronto', name: 'Canada — Eastern (Toronto)', region: 'common' },
  { zone: 'America/Vancouver', name: 'Canada — Pacific (Vancouver)', region: 'common' },
  { zone: 'Australia/Sydney', name: 'Australia — Eastern (Sydney)', region: 'common' },
]

const NAMED = new Map([...US_TIME_ZONES, ...COMMON_TIME_ZONES].map((o) => [o.zone, o]))

/** Fallback if the browser can't enumerate its zones (very old engines). */
const FALLBACK_ZONES = ['UTC', 'Europe/Berlin', 'Europe/Paris', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Singapore']

let allZonesCache: TimeZoneOption[] | null = null
/** Every zone the browser knows, named + grouped (US first, then common, then A–Z). */
export function getAllTimeZoneOptions(): TimeZoneOption[] {
  if (allZonesCache) return allZonesCache
  let zones: string[] = []
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf
    zones = supported ? supported('timeZone') : FALLBACK_ZONES
  } catch {
    zones = FALLBACK_ZONES
  }
  const rest = zones
    .filter((zone) => !NAMED.has(zone) && isValidTimeZone(zone))
    .map((zone) => ({ zone, name: zone.replace(/_/g, ' ').replace(/\//g, ' / '), region: 'all' as const }))
  allZonesCache = [...US_TIME_ZONES, ...COMMON_TIME_ZONES, ...rest].filter((o) => isValidTimeZone(o.zone))
  return allZonesCache
}

/** Friendly name for a zone: "Central Time (Chicago, Houston, Dallas)" or "Europe / Berlin". */
export function timeZoneDisplayName(zone: string): string {
  return NAMED.get(zone)?.name ?? zone.replace(/_/g, ' ').replace(/\//g, ' / ')
}

/** Short name without the city list: "Central Time", "Pakistan". */
export function timeZoneShortName(zone: string): string {
  return timeZoneDisplayName(zone).replace(/\s*\(.*\)$/, '')
}

/** Whole-minute difference "+1 h", "−10 h 30 min" between two zones right now (a − b). */
export function describeZoneDifference(a: string, b: string, date: Date = new Date()): string {
  const minutes = Math.round((getTimeZoneOffsetMs(date, a) - getTimeZoneOffsetMs(date, b)) / 60000)
  if (minutes === 0) return 'same time'
  const abs = Math.abs(minutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  const span = [h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ')
  return `${span} ${minutes > 0 ? 'ahead' : 'behind'}`
}

/** True when two zones show the same wall-clock time right now and all year (same rules). */
export function sameClock(a: string, b: string): boolean {
  if (a === b) return true
  const year = new Date().getUTCFullYear()
  // Compare offsets across the year (catches different DST rules, e.g. Phoenix vs Denver).
  return [0, 3, 6, 9].every((month) => {
    const d = new Date(Date.UTC(year, month, 15))
    return getTimeZoneOffsetMs(d, a) === getTimeZoneOffsetMs(d, b)
  })
}

export { getTimeZoneNames }

/**
 * Mirrors server config/countries.js `timeZone`: the zone "Automatic" means for countries with
 * a single zone. Countries spanning several (US, CA, AU) have none — the business picks one.
 */
const COUNTRY_TIME_ZONES: Record<string, string> = {
  PK: 'Asia/Karachi',
  GB: 'Europe/London',
  AE: 'Asia/Dubai',
  SA: 'Asia/Riyadh',
  IN: 'Asia/Kolkata',
  DE: 'Europe/Berlin',
  FR: 'Europe/Paris',
  IT: 'Europe/Rome',
  ES: 'Europe/Madrid',
  NL: 'Europe/Amsterdam',
  IE: 'Europe/Dublin',
  CH: 'Europe/Zurich',
  JP: 'Asia/Tokyo',
  CN: 'Asia/Shanghai',
}

/** The zone "Automatic" resolves to for a country (server fallback rules). */
export function automaticTimeZoneFor(countryCode?: string | null): { zone: string; fromCountry: boolean } {
  const zone = COUNTRY_TIME_ZONES[String(countryCode || '').toUpperCase()]
  return zone ? { zone, fromCountry: true } : { zone: 'Asia/Karachi', fromCountry: false }
}
