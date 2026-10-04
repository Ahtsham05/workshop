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

/** Split a search box value into words (duplicates dropped, capped so a paste can't explode). */
export function searchWords(query: string): string[] {
  const seen = new Set<string>()
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => {
      const key = word.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 8)
}

/**
 * Word-based match: EVERY word of the query must appear (case-insensitive substring, any order,
 * any gap) in at least one of the fields. "jbl speaker" therefore finds "JBL Charge 3 BT
 * Speaker", and "speaker jbl" finds it too. Works for Urdu words as well (split on spaces).
 */
export function matchesBilingualSearch(
  query: string,
  ...fields: (string | undefined | null)[]
): boolean {
  const words = searchWords(query)
  if (words.length === 0) return true
  const haystacks = fields
    .filter((field) => field != null && field !== '')
    .map((field) => String(field))
  if (haystacks.length === 0) return false
  const lowered = haystacks.map((h) => h.toLowerCase())
  return words.every((word) => {
    const lower = word.toLowerCase()
    return lowered.some((h, i) => h.includes(lower) || haystacks[i].includes(word))
  })
}

// Compiled per word and reused — a picker scores every match on every keystroke.
const wordRegexCache = new Map<string, [RegExp, RegExp]>()
function wordRegexes(word: string): [RegExp, RegExp] {
  let pair = wordRegexCache.get(word)
  if (!pair) {
    if (wordRegexCache.size > 200) wordRegexCache.clear()
    const e = escapeRegex(word)
    pair = [
      new RegExp(`(^|[^\\p{L}\\p{N}])${e}`, 'u'),
      new RegExp(`(^|[^\\p{L}\\p{N}])${e}([^\\p{L}\\p{N}]|$)`, 'u'),
    ]
    wordRegexCache.set(word, pair)
  }
  return pair
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Relevance of one field to a query (0 = no match). Exact > starts-with > whole phrase >
 * starts with first word / ends with last word > words at word starts > anywhere.
 * Same ordering the server uses for list searches.
 */
export function scoreSearchText(query: string, text: string | undefined | null): number {
  const words = searchWords(query).map((w) => w.toLowerCase())
  const t = String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
  if (words.length === 0 || !t) return 0
  const phrase = words.join(' ')
  let score = 0
  if (t === phrase) score += 1000
  if (t.startsWith(phrase)) score += 500
  if (t.includes(phrase)) score += 300
  if (t.startsWith(words[0])) score += 120
  if (words.length > 1 && t.endsWith(words[words.length - 1])) score += 80
  for (const w of words) {
    const [wordStart, wholeWord] = wordRegexes(w)
    if (wordStart.test(t)) score += 30
    if (wholeWord.test(t)) score += 20
    if (t.includes(w)) score += 10
  }
  return score
}

/**
 * Filter by the word-based match and order best match first. `getFields` returns the item's
 * searchable texts, MOST important first (the name before codes/notes); a later field counts
 * slightly less. Items keep their incoming order on ties, so any existing sort acts as the
 * tiebreaker. With an empty query the list is returned unchanged.
 */
export function filterAndRankBySearch<T>(
  items: readonly T[],
  query: string,
  getFields: (item: T) => (string | undefined | null)[],
): T[] {
  if (!query.trim()) return items as T[]
  const lowerQuery = query.trim().toLowerCase()
  const scored: { item: T; index: number; score: number }[] = []
  items.forEach((item, index) => {
    const fields = getFields(item)
    if (!matchesBilingualSearch(query, ...fields)) return
    let score = 0
    fields.forEach((field, i) => {
      if (field != null && String(field).toLowerCase() === lowerQuery) score = Math.max(score, 900 - i)
      score = Math.max(score, scoreSearchText(query, field) - i)
    })
    scored.push({ item, index, score })
  })
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map((entry) => entry.item)
}
