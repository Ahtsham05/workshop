/**
 * SMS segment accounting (GSM 03.38 / UCS-2).
 *
 * Unlike WhatsApp, SMS is billed per 160-character *segment*, not per message — and a
 * single character outside the GSM-7 alphabet (an Urdu word, a curly quote pasted from
 * Word, an emoji) silently switches the whole message to UCS-2 and drops the limit to 70.
 * A school sending one announcement to 400 parents can therefore pay for 400 or 1,600
 * messages depending on one character, so the composer shows this rather than a plain
 * character count.
 */

// GSM 03.38 basic character set — one unit each.
const GSM7_BASIC = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'.split(
    '',
  ),
)

// GSM 03.38 extension table — each costs two units because it is sent as an escape pair.
const GSM7_EXTENDED = new Set('^{}\\[~]|€'.split(''))

export type SmsEncoding = 'GSM-7' | 'UCS-2'

export type SmsSegmentInfo = {
  encoding: SmsEncoding
  /** Characters as the user sees them (code points, so an emoji counts once). */
  characters: number
  /** Billed units — differs from `characters` for GSM-7 escapes and non-BMP characters. */
  units: number
  segments: number
  /** Capacity of the current segment layout. */
  perSegment: number
  /** Units still free before the message rolls into another segment. */
  remaining: number
  /** The characters that forced UCS-2, if any — shown so the user can swap them out. */
  nonGsmSample: string[]
}

export function analyzeSms(text: string): SmsSegmentInfo {
  const chars = Array.from(text ?? '')

  const nonGsm: string[] = []
  for (const ch of chars) {
    if (!GSM7_BASIC.has(ch) && !GSM7_EXTENDED.has(ch) && !nonGsm.includes(ch)) nonGsm.push(ch)
  }
  const encoding: SmsEncoding = nonGsm.length > 0 ? 'UCS-2' : 'GSM-7'

  let units: number
  if (encoding === 'GSM-7') {
    units = chars.reduce((sum, ch) => sum + (GSM7_EXTENDED.has(ch) ? 2 : 1), 0)
  } else {
    // UCS-2 bills per 16-bit unit, so characters outside the BMP (emoji) cost two.
    units = chars.reduce((sum, ch) => sum + (ch.codePointAt(0)! > 0xffff ? 2 : 1), 0)
  }

  const single = encoding === 'GSM-7' ? 160 : 70
  const concatenated = encoding === 'GSM-7' ? 153 : 67

  let segments: number
  let perSegment: number
  if (units === 0) {
    segments = 0
    perSegment = single
  } else if (units <= single) {
    segments = 1
    perSegment = single
  } else {
    perSegment = concatenated
    segments = Math.ceil(units / concatenated)
  }

  const capacity = segments <= 1 ? single : segments * concatenated
  return {
    encoding,
    characters: chars.length,
    units,
    segments,
    perSegment,
    remaining: Math.max(0, capacity - units),
    nonGsmSample: nonGsm.slice(0, 6),
  }
}

/**
 * Worst-case segments for a template, since `{name}` (and the fee placeholders) expand to
 * different lengths per parent. Callers pass the longest realistic substitution so the
 * estimate never under-reports the bill.
 */
export function analyzeSmsTemplate(template: string, samples: Record<string, string>[]): SmsSegmentInfo {
  if (!samples.length) return analyzeSms(template)
  let worst = analyzeSms(renderSmsTemplate(template, samples[0]))
  for (const sample of samples.slice(1)) {
    const info = analyzeSms(renderSmsTemplate(template, sample))
    if (info.segments > worst.segments || (info.segments === worst.segments && info.units > worst.units)) {
      worst = info
    }
  }
  return worst
}

export function renderSmsTemplate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.replace(new RegExp(`\\{${key}\\}`, 'gi'), value ?? ''),
    String(template ?? ''),
  )
}
