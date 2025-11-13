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
