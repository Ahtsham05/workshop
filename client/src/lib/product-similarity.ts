/**
 * "Is this product already in the catalogue?" — the ranking behind Add Product's live
 * similar-products panel. Runs in the browser on every keystroke against the branch's
 * name index (GET /products/name-index, inactive and imported products included).
 *
 * `productNameKey` must stay identical to server/src/utils/productNameKey.js — the
 * server refuses a create whose key matches an existing product's (409
 * DUPLICATE_PRODUCT_NAME), and this is what tells the person beforehand.
 */

/** Name with case, accents, spaces and punctuation removed: "iPhone 13 Pro" ≡ "i-phone 13pro". */
export function productNameKey(name: string | null | undefined): string {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

export type SimilarityKind =
  /** Same name once case/spaces/punctuation are ignored — the server refuses it. */
  | 'exact'
  /** The typed barcode/SKU belongs to this product. */
  | 'code'
  /** Same words in a different order ("Pro iPhone 13"). */
  | 'same_words'
  /** Same words but a different number — usually a different size/model ("1kg" vs "5kg"). */
  | 'different_size'
  | 'similar'

export interface SimilarityCandidate {
  name: string
  nameUrdu?: string
  barcode?: string
  sku?: string
}

export interface SimilarMatch<T> {
  item: T
  /** 0–1. */
  score: number
  kind: SimilarityKind
}

const UNIT_RE = /^(kg|kgs|g|gm|gms|gram|grams|mg|l|ltr|litre|liter|ml|mah|gb|tb|mb|w|watt|v|volt|mm|cm|m|inch|in|ft|pcs|pc|pack|x)$/

/** Normalized words; a number followed by its unit becomes one word ("1 kg" → "1kg"). */
export function productNameWords(name: string | null | undefined): string[] {
  const raw = String(name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // A dot only survives inside a number ("1.5l"); "i.phone" is "i phone".
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
    // "13pro" → "13 pro", "pro13" → "pro 13" — so digits and letters compare separately…
    .replace(/(\p{N})(\p{L})/gu, '$1 $2')
    .replace(/(\p{L})(\p{N})/gu, '$1 $2')
    .split(/[^\p{L}\p{N}.]+/u)
    .map((w) => w.replace(/^\.+|\.+$/g, ''))
    .filter(Boolean)
  // …except a unit right after a number, which belongs to it.
  const words: string[] = []
  for (const w of raw) {
    const prev = words[words.length - 1]
    if (prev && /^\d+(\.\d+)?$/.test(prev) && UNIT_RE.test(w)) words[words.length - 1] = `${prev}${w}`
    else words.push(w)
  }
  return words
}

const hasDigit = (w: string) => /\d/.test(w)

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>()
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2)
    m.set(g, (m.get(g) || 0) + 1)
  }
  return m
}

/** Sørensen–Dice over character bigrams — tolerant of typos and spacing. */
function dice(a: Map<string, number>, aLen: number, b: Map<string, number>, bLen: number): number {
  if (aLen < 2 || bLen < 2) return 0
  let overlap = 0
  for (const [g, n] of a) {
    const m = b.get(g)
    if (m) overlap += Math.min(n, m)
  }
  return (2 * overlap) / (aLen - 1 + (bLen - 1))
}

/** Levenshtein distance, giving up (returns max+1) once it can't stay within `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      cur.push(v)
      if (v < rowMin) rowMin = v
    }
    if (rowMin > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}

/** How well one word matches another: equal 1, prefix (still typing) or a typo partly. */
function wordSimilarity(q: string, c: string): number {
  if (q === c) return 1
  // Numbers only ever match exactly — "13" is not a typo of "14".
  if (hasDigit(q) || hasDigit(c)) return 0
  if (q.length >= 2 && c.startsWith(q)) return 0.85 * Math.pow(q.length / c.length, 0.3)
  if (c.length >= 3 && q.startsWith(c)) return 0.7
  const longest = Math.max(q.length, c.length)
  if (longest >= 4) {
    // One typo allowed in a word of 4+ letters, two in 7+.
    const max = longest >= 7 ? 2 : 1
    const d = editDistance(q, c, max)
    if (d <= max) return d === 1 ? 0.8 : 0.65
  }
  return 0
}

/** Length-weighted share of `from`'s words found in `to`. `memo` caches word pairs for one ranking pass. */
function coverage(from: string[], to: string[], memo?: Map<string, number>): number {
  if (!from.length || !to.length) return 0
  let total = 0
  let got = 0
  for (const w of from) {
    const weight = Math.max(w.length, 2)
    total += weight
    let best = 0
    for (const v of to) {
      let s: number
      if (memo) {
        const k = `${w}\u0000${v}`
        const hit = memo.get(k)
        if (hit === undefined) memo.set(k, (s = wordSimilarity(w, v)))
        else s = hit
      } else s = wordSimilarity(w, v)
      if (s > best) best = s
      if (best === 1) break
    }
    got += weight * best
  }
  return got / total
}

export interface PreparedCandidate<T> {
  item: T
  key: string
  words: string[]
  grams: Map<string, number>
  urduKey: string
  codes: string[]
}

/** Per-candidate work done once per index, not on every keystroke. */
export function prepareCandidates<T extends SimilarityCandidate>(items: readonly T[]): PreparedCandidate<T>[] {
  return items.map((item) => {
    const key = productNameKey(item.name)
    return {
      item,
      key,
      words: productNameWords(item.name),
      grams: bigrams(key),
      urduKey: productNameKey(item.nameUrdu),
      codes: [item.barcode, item.sku].map((c) => (c || '').trim().toLowerCase()).filter(Boolean),
    }
  })
}

export interface RankOptions {
  /** Typed barcode/SKU — an exact hit on another product is always shown first. */
  code?: string
  limit?: number
  /** Below this a candidate isn't shown. */
  minScore?: number
}

/**
 * Closest products to a name being typed, best first. Under 3 meaningful characters
 * nothing is returned (everything would "match").
 */
export function rankSimilarProducts<T>(
  name: string,
  candidates: readonly PreparedCandidate<T>[],
  { code, limit = 8, minScore = 0.55 }: RankOptions = {},
): SimilarMatch<T>[] {
  const key = productNameKey(name)
  const codeKey = (code || '').trim().toLowerCase()
  const words = productNameWords(name)
  const grams = bigrams(key)
  const sortedWords = [...words].sort().join(' ')
  const numbers = words.filter(hasDigit).sort().join(' ')
  const starts = new Set(words.map((w) => w.slice(0, 2)))
  // Catalogue words repeat a lot ("cable", "1kg", brand names) — compare each pair once.
  const memo = new Map<string, number>()
  const out: SimilarMatch<T>[] = []

  for (const c of candidates) {
    if (codeKey && c.codes.includes(codeKey)) {
      out.push({ item: c.item, score: 1, kind: 'code' })
      continue
    }
    if (key.length < 3) continue
    if (key === c.key || (c.urduKey && key === c.urduKey)) {
      out.push({ item: c.item, score: 1, kind: 'exact' })
      continue
    }
    if (words.length > 1 && sortedWords === [...c.words].sort().join(' ')) {
      out.push({ item: c.item, score: 0.97, kind: 'same_words' })
      continue
    }
    const d = dice(grams, key.length, c.grams, c.key.length)
    // Cheap skip for the bulk of a big catalogue: nothing near on characters and no word
    // starting the same way — word coverage couldn't reach the bar either.
    if (d < minScore && !c.words.some((w) => starts.has(w.slice(0, 2)))) continue
    const q = coverage(words, c.words, memo)
    const r = coverage(c.words, words, memo)
    let score = Math.max(d, 0.6 * q + 0.4 * r)
    if (score < minScore) continue
    let kind: SimilarityKind = 'similar'
    const cNumbers = c.words.filter(hasDigit).sort().join(' ')
    if (numbers && cNumbers && numbers !== cNumbers) {
      // Same words, different numbers: a sibling size/model, not the same product.
      const lettersQ = words.filter((w) => !hasDigit(w))
      const lettersC = c.words.filter((w) => !hasDigit(w))
      const sameLetters =
        productNameKey(lettersQ.join('')) === productNameKey(lettersC.join('')) ||
        (coverage(lettersQ, lettersC) >= 0.8 && coverage(lettersC, lettersQ) >= 0.8)
      if (sameLetters) kind = 'different_size'
      score = Math.min(score, 0.8)
    } else if (numbers && !cNumbers) {
      // The typed name has a size/model number this product lacks — less likely the same
      // item. (Not the other way round: while typing, the number usually comes last.)
      score *= 0.85
    }
    if (score < minScore) continue
    out.push({ item: c.item, score, kind })
  }

  const rank: Record<SimilarityKind, number> = { code: 0, exact: 1, same_words: 2, similar: 3, different_size: 3 }
  return out
    .sort((a, b) => rank[a.kind] - rank[b.kind] || b.score - a.score)
    .slice(0, limit)
}

/** Strong enough that saving should stop and ask "create anyway?". */
export const isLikelyDuplicate = (m: Pick<SimilarMatch<unknown>, 'kind' | 'score'>) =>
  m.kind === 'exact' || m.kind === 'code' || m.kind === 'same_words' || (m.kind === 'similar' && m.score >= 0.9)
