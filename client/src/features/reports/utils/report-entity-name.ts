import type { SupportedLanguage } from '@/i18n'
import { getTextClassesWithDirection } from '@/utils/urdu-text-utils'

/** Primary label for entity names in reports: Urdu when UI language is Urdu and available. */
export function reportEntityName(
  lang: SupportedLanguage,
  nameEn: string | undefined | null,
  nameUr?: string | undefined | null,
): string {
  const ur = String(nameUr ?? '').trim()
  const en = String(nameEn ?? '').trim()
  if (lang === 'ur' && ur) return ur
  return en || ur || '—'
}

export function reportEntityNameClass(lang: SupportedLanguage, displayName: string): string {
  if (lang !== 'ur') return ''
  return getTextClassesWithDirection(displayName)
}
