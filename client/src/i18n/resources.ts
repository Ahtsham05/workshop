// Static translation dictionaries — single source of truth for the i18n engine.
// Auto-translation falls back to these via reverse-lookup before hitting the API.

import en from './locales/en'
import ur from './locales/ur'
import ar from './locales/ar'
import hi from './locales/hi'

export type SupportedLanguage = 'en' | 'ur' | 'ar' | 'hi'

export const resources: Record<SupportedLanguage, Record<string, string>> = {
  en,
  ur,
  ar,
  hi,
}
