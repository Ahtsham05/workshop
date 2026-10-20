/**
 * The business's native (second) language: Urdu for Pakistan, Arabic for the UAE and the
 * Gulf, Hindi for India, … It decides
 *   - which language the "Name (…)" fields on forms auto-translate into,
 *   - which script shows under English names in lists and pickers,
 *   - which language the "native" print toggle prints invoices, receipts and statements in.
 *
 * Every `nameUrdu` field (products, customers, suppliers, categories, branches, the
 * organization) stores this language. The field keeps its historical name so no data
 * migration is needed: for a UAE business it simply holds Arabic.
 *
 * Organization.nativeLanguage holds 'auto' (follow the country), 'none' or a code; see
 * server/src/config/nativeLanguages.js, which must list the same codes.
 *
 * Print templates build raw HTML outside React, so the resolved language also lives in a
 * module-level store (persisted, so a cold or offline start prints right before the
 * organization loads). React reads it through useNativeLanguage().
 */
import { useSyncExternalStore } from 'react'

export const NATIVE_LANGUAGES = [
  'ur',
  'ar',
  'hi',
  'bn',
  'fa',
  'tr',
  'zh',
  'ja',
  'fr',
  'de',
  'es',
  'it',
  'nl',
] as const

export type NativeLanguageCode = (typeof NATIVE_LANGUAGES)[number]
export type NativeLanguageSetting = 'auto' | 'none' | NativeLanguageCode

/** Languages with their own hand-written print headings (see invoice/utils/language.ts). */
export const PRINT_LANGUAGES = ['en', 'ur', 'ar', 'hi'] as const
export type PrintLanguage = (typeof PRINT_LANGUAGES)[number]

export interface NativeLanguageInfo {
  code: NativeLanguageCode
  /** English name, e.g. "Arabic". */
  label: string
  /** Name in its own script, e.g. "العربية". */
  nativeLabel: string
  dir: 'rtl' | 'ltr'
  /** Matches text already written in this language's script (undefined for Latin scripts). */
  script?: RegExp
  /** Placeholder for the native name input, written in that language. */
  placeholder: string
  /** BCP-47 tag for numbers/dates on native prints. */
  locale: string
  /** Code the translation providers expect (Google wants zh-CN, not zh). */
  providerCode: string
  /** Google Fonts family for this script on prints; undefined = system fonts cover it. */
  printFont?: { family: string; query: string }
}

const ARABIC_SCRIPT = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/
const NASKH = { family: 'Noto Naskh Arabic', query: 'Noto+Naskh+Arabic:wght@400;500;600;700' }

export const NATIVE_LANGUAGE_INFO: Record<NativeLanguageCode, NativeLanguageInfo> = {
  ur: { code: 'ur', label: 'Urdu', nativeLabel: 'اردو', dir: 'rtl', script: ARABIC_SCRIPT, placeholder: 'اردو میں نام', locale: 'ur-PK', providerCode: 'ur', printFont: NASKH },
  ar: { code: 'ar', label: 'Arabic', nativeLabel: 'العربية', dir: 'rtl', script: ARABIC_SCRIPT, placeholder: 'الاسم بالعربية', locale: 'ar-AE', providerCode: 'ar', printFont: NASKH },
  fa: { code: 'fa', label: 'Persian', nativeLabel: 'فارسی', dir: 'rtl', script: ARABIC_SCRIPT, placeholder: 'نام به فارسی', locale: 'fa-IR', providerCode: 'fa', printFont: NASKH },
  hi: { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी', dir: 'ltr', script: /[ऀ-ॿ]/, placeholder: 'हिन्दी में नाम', locale: 'hi-IN', providerCode: 'hi', printFont: { family: 'Noto Sans Devanagari', query: 'Noto+Sans+Devanagari:wght@400;500;600;700' } },
  bn: { code: 'bn', label: 'Bengali', nativeLabel: 'বাংলা', dir: 'ltr', script: /[ঀ-৿]/, placeholder: 'বাংলায় নাম', locale: 'bn-BD', providerCode: 'bn', printFont: { family: 'Noto Sans Bengali', query: 'Noto+Sans+Bengali:wght@400;500;600;700' } },
  zh: { code: 'zh', label: 'Chinese', nativeLabel: '中文', dir: 'ltr', script: /[㐀-䶿一-鿿]/, placeholder: '中文名称', locale: 'zh-CN', providerCode: 'zh-CN' },
  ja: { code: 'ja', label: 'Japanese', nativeLabel: '日本語', dir: 'ltr', script: /[぀-ヿ㐀-䶿一-鿿]/, placeholder: '日本語の名前', locale: 'ja-JP', providerCode: 'ja' },
  tr: { code: 'tr', label: 'Turkish', nativeLabel: 'Türkçe', dir: 'ltr', placeholder: 'Türkçe ad', locale: 'tr-TR', providerCode: 'tr' },
  fr: { code: 'fr', label: 'French', nativeLabel: 'Français', dir: 'ltr', placeholder: 'Nom en français', locale: 'fr-FR', providerCode: 'fr' },
  de: { code: 'de', label: 'German', nativeLabel: 'Deutsch', dir: 'ltr', placeholder: 'Name auf Deutsch', locale: 'de-DE', providerCode: 'de' },
  es: { code: 'es', label: 'Spanish', nativeLabel: 'Español', dir: 'ltr', placeholder: 'Nombre en español', locale: 'es-ES', providerCode: 'es' },
  it: { code: 'it', label: 'Italian', nativeLabel: 'Italiano', dir: 'ltr', placeholder: 'Nome in italiano', locale: 'it-IT', providerCode: 'it' },
  nl: { code: 'nl', label: 'Dutch', nativeLabel: 'Nederlands', dir: 'ltr', placeholder: 'Naam in het Nederlands', locale: 'nl-NL', providerCode: 'nl' },
}

/**
 * Country → native language for Organization.nativeLanguage = 'auto'. English-speaking
 * countries are deliberately absent: they get no second language (English only).
 */
export const COUNTRY_NATIVE_LANGUAGE: Record<string, NativeLanguageCode> = {
  PK: 'ur',
  // Arabic-speaking countries (GCC first).
  AE: 'ar', SA: 'ar', QA: 'ar', KW: 'ar', BH: 'ar', OM: 'ar', EG: 'ar', JO: 'ar', IQ: 'ar',
  LB: 'ar', SY: 'ar', YE: 'ar', LY: 'ar', TN: 'ar', DZ: 'ar', MA: 'ar', SD: 'ar', PS: 'ar',
  IN: 'hi',
  BD: 'bn',
  IR: 'fa', AF: 'fa',
  TR: 'tr',
  CN: 'zh', TW: 'zh', HK: 'zh', SG: 'zh',
  JP: 'ja',
  FR: 'fr', BE: 'fr', LU: 'fr', MC: 'fr',
  DE: 'de', AT: 'de', CH: 'de', LI: 'de',
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es',
  IT: 'it', SM: 'it',
  NL: 'nl',
}

export const isNativeLanguageCode = (value: unknown): value is NativeLanguageCode =>
  typeof value === 'string' && (NATIVE_LANGUAGES as readonly string[]).includes(value)

/** What 'auto' resolves to for a country; null = English only. */
export function countryNativeLanguage(countryCode: string | null | undefined): NativeLanguageCode | null {
  return COUNTRY_NATIVE_LANGUAGE[String(countryCode ?? '').toUpperCase()] ?? null
}

/**
 * Organization setting + country → the language in force. An organization that never picked
 * a country keeps Urdu, which is what every business had before this setting existed.
 */
export function resolveNativeLanguage(
  setting: string | null | undefined,
  countryCode: string | null | undefined,
): NativeLanguageCode | null {
  if (setting === 'none') return null
  if (isNativeLanguageCode(setting)) return setting
  if (!countryCode) return 'ur'
  return countryNativeLanguage(countryCode)
}

/** "Arabic" in the reader's UI language ("عربی" for Urdu UI); English name as fallback. */
export function nativeLanguageDisplayName(code: NativeLanguageCode, uiLanguage = 'en'): string {
  if (uiLanguage !== 'en') {
    try {
      const name = new Intl.DisplayNames([uiLanguage], { type: 'language' }).of(code)
      if (name && name !== code) return name
    } catch {
      /* older engines: fall through */
    }
  }
  return NATIVE_LANGUAGE_INFO[code].label
}

// ─── Active language store ───────────────────────────────────────────────────

const STORAGE_KEY = 'native-language'
// Stored as the code, or 'none'. Missing = never resolved yet → Urdu (the legacy default).
function readStored(): NativeLanguageCode | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'none') return null
    if (isNativeLanguageCode(raw)) return raw
  } catch {
    /* storage blocked */
  }
  return 'ur'
}

let active: NativeLanguageCode | null = readStored()
const listeners = new Set<() => void>()

export function getNativeLanguageCode(): NativeLanguageCode | null {
  return active
}

export function getNativeLanguage(): NativeLanguageInfo | null {
  return active ? NATIVE_LANGUAGE_INFO[active] : null
}

export function setNativeLanguageCode(code: NativeLanguageCode | null): void {
  if (code === active) return
  active = code
  try {
    localStorage.setItem(STORAGE_KEY, code ?? 'none')
  } catch {
    /* storage blocked */
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The native language in force, re-rendering when the organization changes it. */
export function useNativeLanguage(): NativeLanguageInfo | null {
  const code = useSyncExternalStore(subscribe, getNativeLanguageCode, getNativeLanguageCode)
  return code ? NATIVE_LANGUAGE_INFO[code] : null
}

// ─── Print helpers ───────────────────────────────────────────────────────────

/** A "print in native language" switch only counts while the business has a native language. */
export const isNativePrintOn = (flag: boolean | undefined): boolean => flag === true && active !== null

/**
 * The heading language for a "print in native language" request: the native language when
 * it has hand-written print headings, otherwise English headings (names still print in
 * the native script, see printNamesInNative).
 */
export function nativePrintLanguage(): PrintLanguage {
  const code = active
  return code && (PRINT_LANGUAGES as readonly string[]).includes(code) ? (code as PrintLanguage) : 'en'
}

export const isRtlPrintLanguage = (lang: string): boolean => lang === 'ur' || lang === 'ar'

export const printDirection = (lang: string): 'rtl' | 'ltr' => (isRtlPrintLanguage(lang) ? 'rtl' : 'ltr')

/**
 * Number/date locale for a print language, always with Western digits (ar-SA, fa-IR and
 * bn-BD would otherwise print ٧:١٩ / ۱۹:۱۹ / ৭:১৯ next to amounts printed as 1,234.50).
 */
export function printLocale(lang: string): string {
  if (!isNativeLanguageCode(lang)) return 'en-PK'
  return `${NATIVE_LANGUAGE_INFO[lang].locale}-u-nu-latn`
}

const SANS_ARABIC_QUERY = 'Noto+Sans+Arabic:wght@400;500;600;700'

/**
 * Google Fonts `&family=` parameters a print needs on top of its Latin fonts: Naskh for the
 * Arabic script (Urdu, Arabic, Persian), Devanagari for Hindi, … Always includes the Arabic
 * script fonts so prints that show Urdu text from older records keep rendering.
 */
export function printScriptFontParams(): string {
  const queries = [NASKH.query, SANS_ARABIC_QUERY]
  const font = getNativeLanguage()?.printFont
  if (font && !queries.includes(font.query)) queries.push(font.query)
  return queries.map((query) => `&family=${query}`).join('')
}

/** CSS font-family entries for the native script, to append after the Latin fonts. */
export function printScriptFontFamilies(): string {
  const families = [`'${NASKH.family}'`, `'Noto Sans Arabic'`]
  const font = getNativeLanguage()?.printFont
  if (font && font.family !== NASKH.family) families.push(`'${font.family}'`)
  return families.join(', ')
}

/** "Name (Arabic)" — a field label for the native language as it stands now (English UI). */
export function nativeFieldLabel(base: string): string {
  const native = getNativeLanguage()
  return `${base} (${native ? native.label : 'Native'})`
}

/** `dir` for a native-name input: right-to-left for Urdu/Arabic, left-to-right for Hindi, … */
export const nativeTextDir = (): 'rtl' | 'ltr' | 'auto' => getNativeLanguage()?.dir ?? 'auto'
