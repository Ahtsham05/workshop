/**
 * Utility functions for handling Urdu text display
 */

/**
 * Check if text contains Urdu/Arabic characters
 * @param text - The text to check
 * @returns boolean - true if text contains Urdu/Arabic characters
 */
export const containsUrduText = (text: string | undefined | null): boolean => {
  if (!text) return false
  
  // Unicode ranges for Urdu/Arabic characters
  const urduRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/
  return urduRegex.test(text)
}

/**
 * Get appropriate CSS classes for text based on whether it contains Urdu characters
 * @param text - The text to check (can be undefined)
 * @param additionalClasses - Additional CSS classes to include
 * @returns string - CSS classes with appropriate font family
 */
export const getTextClasses = (text: string | undefined | null, additionalClasses: string = ''): string => {
  const hasUrduText = containsUrduText(text)
  const fontClass = hasUrduText ? 'font-urdu' : ''
  
  return [fontClass, additionalClasses].filter(Boolean).join(' ')
}

/**
 * Get appropriate CSS classes for text with RTL direction if needed
 * @param text - The text to check (can be undefined)
 * @param additionalClasses - Additional CSS classes to include
 * @returns string - CSS classes with appropriate font family and direction
 */
export const getTextClassesWithDirection = (text: string | undefined | null, additionalClasses: string = ''): string => {
  const hasUrduText = containsUrduText(text)
  const fontClass = hasUrduText ? 'font-urdu' : ''
  const dirClass = hasUrduText ? 'rtl' : ''
  
  return [fontClass, dirClass, additionalClasses].filter(Boolean).join(' ')
}

/**
 * Urdu line under an English name (tables, lists: products, categories, customers, suppliers).
 * Intentionally does **not** use `font-urdu` (Nastaliq / Jameel stack in index.css) so script matches
 * the app default UI font: `var(--font-ui)` → Noto Naskh Arabic for Arabic/Urdu glyphs (clearer in dense tables).
 */
export function getUrduSecondaryNameClasses(_text: string | undefined | null): string {
  return 'text-sm font-medium leading-normal text-foreground/90'
}

/** Match search against Latin (case-insensitive) and scripts such as Urdu (substring). */
export function matchesBilingualSearch(
  query: string,
  ...fields: (string | undefined | null)[]
): boolean {
  const q = query.trim()
  if (!q) return true
  const lower = q.toLowerCase()
  return fields.some((field) => {
    if (field == null || field === '') return false
    const s = String(field)
    if (s.toLowerCase().includes(lower)) return true
    return s.includes(q)
  })
}
