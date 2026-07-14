/** Parses a scanner prefix like `3*` / `3x` before a barcode/name — quantity multiplier for one scan. */
export function parseQuantityPrefix(raw: string): { quantity: number; rest: string } {
  const match = raw.match(/^(\d{1,4})\s*[*xX]\s*(.+)$/)
  if (match) {
    const quantity = Math.max(1, parseInt(match[1]!, 10) || 1)
    return { quantity, rest: match[2]!.trim() }
  }
  return { quantity: 1, rest: raw }
}
