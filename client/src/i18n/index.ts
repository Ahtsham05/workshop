/**
 * Professional i18n Engine
 *
 * Architecture:
 *   - Static dictionaries (en/ur/ar/hi) for hand-curated UI strings.
 *   - Runtime auto-translation via MyMemory API for everything else.
 *   - localStorage cache so each phrase is fetched at most once per device.
 *   - React subscribes to the cache and re-renders as translations stream in.
 *
 * Usage in components is unchanged: `const { t } = useLanguage()`.
 */

import { resources, type SupportedLanguage } from './resources'
import {
  getCachedTranslation,
  loadCacheFor,
  requestTranslation,
} from './auto-translate'

// ─── Re-exports ───────────────────────────────────────────────────────────────

export type { SupportedLanguage } from './resources'
export {
  subscribeToTranslations,
  getInflightCount,
  loadCacheFor,
  retryFailures,
} from './auto-translate'
export {
  startDomTranslator,
  stopDomTranslator,
  rescanDomTranslator,
} from './dom-translator'

// ─── Language Config ──────────────────────────────────────────────────────────

export interface LanguageConfig {
  code: SupportedLanguage
  name: string
  nativeName: string
  flag: string
  dir: 'ltr' | 'rtl'
}

export const LANGUAGES: Record<SupportedLanguage, LanguageConfig> = {
  en: {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    flag: '🇺🇸',
    dir: 'ltr',
  },
  ur: {
    code: 'ur',
    name: 'Urdu',
    nativeName: 'اردو',
    flag: '🇵🇰',
    dir: 'ltr',
  },
  ar: {
    code: 'ar',
    name: 'Arabic',
    nativeName: 'العربية',
    flag: '🇸🇦',
    dir: 'rtl',
  },
  hi: {
    code: 'hi',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    flag: '🇮🇳',
    dir: 'ltr',
  },
}

export const SUPPORTED_LANGUAGES = Object.values(LANGUAGES)

// ─── Persistence ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'language'

function detectBrowserLanguage(): SupportedLanguage {
  const nav = navigator.language || (navigator as any).userLanguage || ''
  const code = nav.split('-')[0].toLowerCase() as SupportedLanguage
  return resources[code] ? code : 'en'
}

export function getStoredLanguage(): SupportedLanguage {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as SupportedLanguage | null
    if (stored && resources[stored]) return stored
  } catch {}
  return detectBrowserLanguage()
}

export function storeLanguage(lang: SupportedLanguage): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {}
}

// ─── Interpolation ────────────────────────────────────────────────────────────

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars || !template.includes('{{')) return template
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key]
    return v !== undefined ? String(v) : `{{${key}}}`
  })
}

// ─── Core translate() ─────────────────────────────────────────────────────────

/**
 * Resolve a translation for the given key in the given language.
 *
 * Resolution order:
 *   1. If lang is English: return EN dict value, or the key itself.
 *   2. Try the target language's static dictionary.
 *   3. Try the auto-translate cache (in-memory + localStorage).
 *   4. Fire a background API request, return EN fallback now.
 *
 * `key` is treated as both a translation key AND as raw English source text:
 * passing 'Suppliers' (a label) works just like passing 'invoice_details' (a key).
 */
export function translate(
  lang: SupportedLanguage,
  key: string,
  vars?: Record<string, string | number>
): string {
  if (!key) return ''

  // English: return the EN dict value if present, else the raw key.
  if (lang === 'en') {
    return interpolate(resources.en[key] ?? key, vars)
  }

  // Try the target language's static dict (key match)
  const targetVal = resources[lang]?.[key]
  if (targetVal) return interpolate(targetVal, vars)

  // Resolve the English source text for this key, so we can translate ENGLISH
  // (e.g. key="invoice_details" → enText="Invoice Details", which is what we
  // send to the translation API). If the key isn't in the EN dict, treat the
  // key itself as the English source (e.g. key="Suppliers").
  const enText = resources.en[key] ?? key

  // Auto-translate cache (sync read)
  const cached = getCachedTranslation(lang, enText)
  if (cached) return interpolate(cached, vars)

  // Schedule a background fetch and return EN fallback for now.
  requestTranslation(enText, lang)
  return interpolate(enText, vars)
}

// ─── Document Effects ─────────────────────────────────────────────────────────

/** Apply <html lang>, <html dir>, body font, RTL/LTR class, and notranslate. */
export function applyLanguageToDocument(lang: SupportedLanguage): void {
  const config = LANGUAGES[lang]
  if (!config) return

  const root = document.documentElement
  const body = document.body

  root.setAttribute('lang', lang)
  body.setAttribute('lang', lang)
  root.setAttribute('dir', config.dir)

  if (config.dir === 'rtl') {
    root.classList.add('rtl')
    root.classList.remove('ltr')
  } else {
    root.classList.add('ltr')
    root.classList.remove('rtl')
  }

  if (lang !== 'en') {
    root.classList.add('notranslate')
    root.setAttribute('translate', 'no')
    body.classList.add('notranslate')
    body.setAttribute('translate', 'no')
  } else {
    root.classList.remove('notranslate')
    root.removeAttribute('translate')
    body.classList.remove('notranslate')
    body.removeAttribute('translate')
  }

  // Font is handled via CSS unicode-range in index.css — no JS override needed.
  // English glyphs always render in Inter, Arabic/Urdu glyphs in Naskh, etc.

  // Hydrate the auto-translation cache for this language.
  loadCacheFor(lang)
}
