import { useLanguage } from '@/context/language-context'
import { nativeLanguageDisplayName, useNativeLanguage } from '@/lib/native-language'

/**
 * The business's native language named in the reader's UI language ("Arabic", "عربی", …),
 * for labels like t('name_in_urdu', { lang }). Empty when the business is English only.
 */
export function useNativeLanguageName(): string {
  const native = useNativeLanguage()
  const { language } = useLanguage()
  return native ? nativeLanguageDisplayName(native.code, language) : ''
}
