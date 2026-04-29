/**
 * Language Context
 *
 * Thin wrapper around the i18n engine at @/i18n. Subscribes to the auto-translate
 * engine so the tree re-renders whenever a new translation arrives from the API.
 *
 *   const { t, language, setLanguage, isRTL } = useLanguage()
 *   t('invoice')                          → "Invoice" / "فاتورة" / ...
 *   t('Hello {{name}}', { name: 'Ali' })  → interpolation
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useReducer,
  ReactNode,
} from 'react'
import {
  type SupportedLanguage,
  translate,
  applyLanguageToDocument,
  getStoredLanguage,
  storeLanguage,
  subscribeToTranslations,
  loadCacheFor,
  startDomTranslator,
  stopDomTranslator,
  LANGUAGES,
} from '@/i18n'

export interface LanguageContextType {
  language: SupportedLanguage
  setLanguage: (lang: SupportedLanguage) => void
  t: (key: string, vars?: Record<string, string | number>) => string
  isRTL: boolean
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  setLanguage: () => {},
  t: (key) => key,
  isRTL: false,
})

export const useLanguage = () => useContext(LanguageContext)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>(getStoredLanguage)

  // Forces a full re-render whenever the auto-translate cache changes.
  const [, bumpRevision] = useReducer((x: number) => x + 1, 0)

  const isRTL = LANGUAGES[language]?.dir === 'rtl'

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string =>
      translate(language, key, vars),
    [language]
  )

  const setLanguage = useCallback((lang: SupportedLanguage) => {
    loadCacheFor(lang) // hydrate immediately so first render uses cache
    setLanguageState(lang)
    storeLanguage(lang)
  }, [])

  // Re-render whenever auto-translations arrive from the API
  useEffect(() => subscribeToTranslations(bumpRevision), [])

  // Apply document-level effects + start whole-DOM translator on language change.
  // The DOM translator walks the entire rendered HTML and translates anything
  // that wasn't wrapped in t() — covering modules whose source still uses raw
  // English (mobile shop, reports, dialogs, etc.).
  useEffect(() => {
    applyLanguageToDocument(language)
    startDomTranslator(language)
    return () => {
      // Don't restore on every cleanup — only when actually switching to English.
      // The next start() call will replace the observer.
    }
  }, [language])

  // Stop the translator on full unmount (e.g. HMR).
  useEffect(() => {
    return () => stopDomTranslator(true)
  }, [])

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isRTL }}>
      {children}
    </LanguageContext.Provider>
  )
}
