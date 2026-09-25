/**
 * The flag for an ISO 3166-1 alpha-2 country code, as a pair of regional-indicator
 * symbols (🇺🇸). Platforms that don't draw flag emoji (Windows) fall back to showing the
 * two letters, which still reads correctly — that is why the code is never hidden.
 */
export function countryFlagEmoji(code?: string | null): string {
  const normalized = String(code ?? '').trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(normalized)) return ''
  const REGIONAL_INDICATOR_A = 0x1f1e6
  const LETTER_A = 'A'.charCodeAt(0)
  return String.fromCodePoint(
    ...[...normalized].map((letter) => REGIONAL_INDICATOR_A + letter.charCodeAt(0) - LETTER_A)
  )
}
