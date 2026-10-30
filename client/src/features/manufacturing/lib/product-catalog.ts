import { useMemo } from 'react'
import {
  useGetManufacturingProductCatalogQuery,
  type ManufacturingCatalogProduct,
} from '@/stores/manufacturing.api'

/**
 * The branch catalog, cached once (getManufacturingProductCatalog) and filtered/searched
 * in memory — so opening a picker or typing in it never waits on the server. Filters mirror
 * the server's buildProductQuery (services/manufacturing/products.service.js).
 */
export interface CatalogFilter {
  /** One type, or a comma list (may include 'unclassified'). */
  productType?: string
  hasBom?: boolean
  /** 'make': not a pack product · 'packs': pack products only · 'pack': what a pack size
   *  may be stocked as (pack products, or goods with no BOM that are not packed themselves). */
  packRole?: 'make' | 'pack' | 'packs'
}

export function filterCatalog(
  list: ManufacturingCatalogProduct[],
  { productType, hasBom, packRole }: CatalogFilter
) {
  const types = productType
    ? new Set(
        productType
          .split(',')
          .map((v) => (v === 'unclassified' ? null : (v as string | null)))
      )
    : null
  return list.filter((p) => {
    if (types && !types.has(p.productType ?? null)) return false
    if (hasBom && !p.defaultBomId) return false
    if (packRole === 'make' && p.packOf) return false
    if (packRole === 'packs' && !p.packOf) return false
    if (
      packRole === 'pack' &&
      !p.packOf &&
      (p.defaultBomId || p.packSizeCount)
    )
      return false
    return true
  })
}

// Filtered lists per fetched catalog, shared by every picker with the same filter (a BOM's
// component rows all ask for the same one).
const filteredCache = new WeakMap<
  object,
  Map<string, ManufacturingCatalogProduct[]>
>()
const EMPTY: ManufacturingCatalogProduct[] = []

/** The cached catalog with a filter applied. Mounting it prefetches; it never refetches per use. */
export function useCatalogProducts(filter: CatalogFilter = {}) {
  const query = useGetManufacturingProductCatalogQuery(undefined, {
    // Another user's stock changes: refresh when a picker mounts on an old copy.
    refetchOnMountOrArgChange: 300,
  })
  const { productType, hasBom, packRole } = filter
  const products = useMemo(() => {
    const data = query.data
    if (!data) return EMPTY
    let byFilter = filteredCache.get(data)
    if (!byFilter) filteredCache.set(data, (byFilter = new Map()))
    const key = `${productType ?? ''}|${hasBom ? 1 : 0}|${packRole ?? ''}`
    let list = byFilter.get(key)
    if (!list) {
      list = filterCatalog(data, { productType, hasBom, packRole })
      byFilter.set(key, list)
    }
    return list
  }, [query.data, productType, hasBom, packRole])
  return { ...query, products }
}

const byIdCache = new WeakMap<object, Map<string, ManufacturingCatalogProduct>>()
/** One catalog product by id (the id → product map is built once per fetched catalog). */
export function useCatalogProduct(id: string | null | undefined) {
  const { data, isLoading } = useGetManufacturingProductCatalogQuery()
  let byId = data && byIdCache.get(data)
  if (data && !byId) {
    byId = new Map(data.map((p) => [p.id, p]))
    byIdCache.set(data, byId)
  }
  return { product: (id && byId?.get(id)) || null, isLoading }
}

// ── Search ─────────────────────────────────────────────────────────────────────────

export const normalize = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

interface Indexed {
  name: string
  words: string[]
  codes: string[]
  haystack: string
}

// Built once per product object; a refetch brings new objects and so a fresh index.
const indexCache = new WeakMap<object, Indexed>()
const indexOf = (p: ManufacturingCatalogProduct): Indexed => {
  let idx = indexCache.get(p)
  if (!idx) {
    const name = normalize(p.name || '')
    const codes = [p.sku, p.barcode]
      .filter(Boolean)
      .map((c) => normalize(String(c)))
    const urdu = p.nameUrdu ? normalize(p.nameUrdu) : ''
    idx = {
      name,
      words: name.split(/[\s\-_/.,()]+/).filter(Boolean),
      codes,
      haystack: [name, ...codes, urdu].join(' '),
    }
    indexCache.set(p, idx)
  }
  return idx
}

/** Optimal-string-alignment distance, stopping early once it passes `max`. */
function editDistance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const rows: number[][] = [Array.from({ length: b.length + 1 }, (_, j) => j)]
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(row[j - 1] + 1, rows[i - 1][j] + 1, rows[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        v = Math.min(v, rows[i - 2][j - 2] + 1)
      row.push(v)
      if (v < best) best = v
    }
    if (best > max) return max + 1
    rows.push(row)
  }
  return rows[a.length][b.length]
}

/** How far `token` is from the start of `word` (a typo in what is being typed). */
function prefixDistance(token: string, word: string, max: number) {
  let best = max + 1
  for (let len = token.length - 1; len <= token.length + 1; len++) {
    if (len < 1 || len > word.length) continue
    best = Math.min(best, editDistance(token, word.slice(0, len), max))
  }
  return best
}

function strictScore(idx: Indexed, q: string, tokens: string[]) {
  if (idx.codes.includes(q)) return 1000
  if (idx.name === q) return 900
  if (idx.name.startsWith(q)) return 700
  if (idx.words.some((w) => w.startsWith(q))) return 550
  if (idx.name.includes(q)) return 450
  if (idx.codes.some((c) => c.startsWith(q))) return 400
  if (!tokens.every((t) => idx.haystack.includes(t))) return 0
  // Every word typed appears somewhere: better when they start words.
  return (
    200 +
    tokens.filter((t) => idx.words.some((w) => w.startsWith(t))).length * 20
  )
}

/**
 * Near-spelling score. `seen` memoises token → word distances for one search: catalogs
 * repeat the same words ("steel", "pack", "kg") across thousands of names, so each
 * distinct word is measured once. A typo rarely changes the first letter (or swaps the
 * first two), which rules most words out before any distance is computed.
 */
function fuzzyScore(
  idx: Indexed,
  tokens: string[],
  seen: Map<string, number>[]
) {
  let total = 0
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k]
    if (idx.haystack.includes(t)) continue
    if (t.length < 3) return 0
    const max = t.length >= 7 ? 2 : 1
    let best = max + 1
    for (const w of idx.words) {
      if (w[0] !== t[0] && !(w[0] === t[1] && w[1] === t[0])) continue
      let d = seen[k].get(w)
      if (d === undefined) {
        d = prefixDistance(t, w, max)
        seen[k].set(w, d)
      }
      if (d < best) best = d
      if (best === 0) break
    }
    if (best > max) return 0
    total += best
  }
  return 100 - total * 10
}

export interface CatalogSearchResult<T> {
  items: T[]
  /** How many match in all (items is capped at `limit`). */
  total: number
  /** Nothing matched as typed — these are close spellings ("aple" → Apple). */
  fuzzy: boolean
}

/**
 * Ranked in-memory search over name, SKU, barcode and native name: exact code, whole
 * name, name prefix, word prefix, contains, then every typed word anywhere. Only when
 * nothing matches that way are near-spellings offered (one typo per word, two in long
 * words). Ties keep the catalog's order (by name), active products first.
 */
export function searchCatalog<T extends ManufacturingCatalogProduct>(
  list: T[],
  query: string,
  limit: number
): CatalogSearchResult<T> {
  const q = normalize(query)
  if (!q) {
    const active = list.filter((p) => p.isActive !== false)
    const ordered =
      active.length === list.length
        ? list
        : active.concat(list.filter((p) => p.isActive === false))
    return { items: ordered.slice(0, limit), total: list.length, fuzzy: false }
  }
  const tokens = q.split(' ')
  const rank = (scoreOf: (idx: Indexed) => number) => {
    const scored: { p: T; s: number; i: number }[] = []
    list.forEach((p, i) => {
      const s = scoreOf(indexOf(p))
      if (s > 0) scored.push({ p, s: s - (p.isActive === false ? 50 : 0), i })
    })
    scored.sort((a, b) => b.s - a.s || a.i - b.i)
    return scored
  }
  let scored = rank((idx) => strictScore(idx, q, tokens))
  let fuzzy = false
  if (!scored.length) {
    const seen = tokens.map(() => new Map<string, number>())
    scored = rank((idx) => fuzzyScore(idx, tokens, seen))
    fuzzy = scored.length > 0
  }
  return {
    items: scored.slice(0, limit).map((x) => x.p),
    total: scored.length,
    fuzzy,
  }
}

/** Splits `text` into plain / matched parts for highlighting the typed words. */
export function highlightParts(text: string, query: string) {
  const tokens = normalize(query).split(' ').filter(Boolean)
  if (!tokens.length || !text) return [{ text, match: false }]
  const lower = text.toLowerCase()
  const marks = new Array<boolean>(text.length).fill(false)
  tokens.forEach((t) => {
    let from = lower.indexOf(t)
    while (from !== -1) {
      for (let i = from; i < from + t.length; i++) marks[i] = true
      from = lower.indexOf(t, from + t.length)
    }
  })
  const parts: { text: string; match: boolean }[] = []
  for (let i = 0; i < text.length; i++) {
    const last = parts[parts.length - 1]
    if (last && last.match === marks[i]) last.text += text[i]
    else parts.push({ text: text[i], match: marks[i] })
  }
  return parts
}
