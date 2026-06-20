/**
 * Formatting utilities for Pakistani phone numbers and CNIC.
 *
 * Phone: 11 digits, e.g. 03001234567
 * CNIC:  13 digits formatted as XXXXX-XXXXXXX-X
 */

export function formatPhoneInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, 11)
}

export function formatCNICInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 13)
  if (digits.length <= 5) return digits
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`
}

/**
 * Smart voice transcript processing for general text/search fields.
 * - Name/text (contains letters) → keep spaces between words
 * - Digits only (phone/CNIC spoken as numbers) → strip spaces so they become a single number string
 */
export function processVoiceText(transcript: string): string {
  const trimmed = transcript.trim()
  // Arabic, Urdu, Hindi, Latin letters
  const hasAlpha = /[a-zA-Z؀-ۿݐ-ݿऀ-ॿঀ-৿]/.test(trimmed)
  if (hasAlpha) {
    // It's a name or descriptive text — normalise spaces
    return trimmed.replace(/\s+/g, ' ')
  }
  // All digits/spaces/dashes — collapse into a single digit string
  return trimmed.replace(/[\s\-]/g, '')
}

/** Voice → phone field: strip non-digits, cap at 11 */
export function processVoiceForPhone(transcript: string): string {
  return transcript.replace(/\D/g, '').slice(0, 11)
}

/** Voice → CNIC field: strip non-digits, auto-format */
export function processVoiceForCNIC(transcript: string): string {
  return formatCNICInput(transcript.replace(/\D/g, ''))
}
