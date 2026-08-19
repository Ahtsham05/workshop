import type { VoiceLanguageOption } from './voice-languages'

// Script-based detection, not dictionary/ML-based — Urdu (Arabic script) and Punjabi (Gurmukhi
// script) live in disjoint Unicode blocks from Latin, so counting characters in each range is a
// cheap, dependency-free way to tell them apart reliably. Romanized Urdu/Punjabi typed or
// transcribed in Latin letters is indistinguishable from English this way and falls back to 'en'
// — an inherent limit of script-based detection, not something worth a dictionary lookup for.
//
// Ranges are numeric code points rather than a literal regex character class so nothing here
// embeds raw (in places invisible/format) Unicode characters directly in source.
const URDU_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0600, 0x06ff], // Arabic
  [0x0750, 0x077f], // Arabic Supplement
  [0x08a0, 0x08ff], // Arabic Extended-A
  [0xfb50, 0xfdff], // Arabic Presentation Forms-A
  [0xfe70, 0xfeff], // Arabic Presentation Forms-B
]
const PUNJABI_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0a00, 0x0a7f], // Gurmukhi
]

function countInRanges(text: string, ranges: ReadonlyArray<readonly [number, number]>): number {
  let count = 0
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if (ranges.some(([start, end]) => code >= start && code <= end)) count += 1
  }
  return count
}

/**
 * Detects which of the app's supported voice languages a piece of text is written in, so voice
 * mode can pick a matching reply voice automatically instead of relying on a manually pre-set
 * language. Falls back to English for empty/whitespace-only text or anything else in Latin script.
 */
export function detectVoiceLanguage(text: string): VoiceLanguageOption['code'] {
  if (!text) return 'en'

  const urduMatches = countInRanges(text, URDU_RANGES)
  const punjabiMatches = countInRanges(text, PUNJABI_RANGES)

  if (urduMatches === 0 && punjabiMatches === 0) return 'en'
  return urduMatches >= punjabiMatches ? 'ur' : 'pa'
}
