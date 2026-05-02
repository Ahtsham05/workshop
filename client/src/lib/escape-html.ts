/** Escape text for safe insertion into HTML (prevents XSS in print templates). */
export function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/** Branch / invoice footers: escape and turn newlines into `<br />`. */
export function invoiceNoteToSafeHtml(note: string): string {
  const trimmed = note.trim()
  if (!trimmed) return ''
  return escapeHtml(trimmed).replace(/\r\n/g, '\n').replace(/\n/g, '<br />')
}
