import type { EntryProduct, PastedLine } from './types'

/*
 * Pure helpers (no React): product search ranking over an in-memory list, and the
 * bulk-paste parser. Kept separate so they're cheap to test and reuse.
 */

export interface ProductIndex {
  items: { product: EntryProduct; name: string; code: string; hay: string }[]
  byCode: Map<string, EntryProduct>
  byName: Map<string, EntryProduct>
}

const norm = (s: string | null | undefined) =>
  (s || '').toLocaleLowerCase().normalize('NFKD').replace(/\s+/g, ' ').trim()

/** Built once per catalog load — searching never rebuilds it. */
export function buildProductIndex(products: EntryProduct[]): ProductIndex {
  const byCode = new Map<string, EntryProduct>()
  const byName = new Map<string, EntryProduct>()
  const items = products.map((product) => {
    const name = norm(product.name)
    const code = norm(product.code)
    if (code && !byCode.has(code)) byCode.set(code, product)
    if (name && !byName.has(name)) byName.set(name, product)
    return {
      product,
      name,
      code,
      hay: `${name} ${code} ${norm(product.subtitle)}`,
    }
  })
  return { items, byCode, byName }
}

/**
 * Exact code first, then code prefix, name prefix, a word in the name starting with the
 * query, then every typed word found anywhere — shorter names first within a rank.
 */
export function rankProducts(
  index: ProductIndex,
  query: string,
  limit: number
): EntryProduct[] {
  const q = norm(query)
  if (!q) return index.items.slice(0, limit).map((i) => i.product)
  const words = q.split(' ')
  const scored: { product: EntryProduct; score: number; len: number }[] = []
  for (const item of index.items) {
    let score = -1
    if (item.code && item.code === q) score = 0
    else if (item.code && item.code.startsWith(q)) score = 1
    else if (item.name.startsWith(q)) score = 2
    else if (item.name.includes(` ${q}`)) score = 3
    else if (words.every((w) => item.hay.includes(w))) score = 4
    if (score >= 0)
      scored.push({ product: item.product, score, len: item.name.length })
  }
  scored.sort((a, b) => a.score - b.score || a.len - b.len)
  return scored.slice(0, limit).map((s) => s.product)
}

export const lookupInIndex = (index: ProductIndex, code: string) =>
  index.byCode.get(norm(code)) ?? null
export const lookupNameInIndex = (index: ProductIndex, name: string) =>
  index.byName.get(norm(name)) ?? null

/** "1,250.50" / "1250,5" / "12" → number; anything else → null. */
export function parseNumber(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null
  let s = String(raw)
    .trim()
    .replace(/[^\d.,-]/g, '')
  if (!s) return null
  // "1,250.50" → thousands comma; "1250,5" (no dot) → decimal comma.
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '')
  else if (s.includes(','))
    s = /,\d{3}(,|$)/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * Lines copied from Excel / Sheets (tab-separated) or CSV: product (code or name),
 * quantity, rate, then anything else. A header line ("item, qty…") is skipped.
 */
export function parsePasted(text: string): PastedLine[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const out: PastedLine[] = []
  lines.forEach((raw, i) => {
    if (!raw.trim()) return
    const cells = (raw.includes('\t') ? raw.split('\t') : splitCsv(raw)).map(
      (c) => c.trim()
    )
    const [productText = '', qty, rate, ...extra] = cells
    if (!productText) return
    const quantity = parseNumber(qty)
    // A first line whose quantity column isn't a number is a header row.
    if (
      out.length === 0 &&
      qty !== undefined &&
      quantity === null &&
      /qty|quantity|item|product|code|name/i.test(raw)
    ) {
      return
    }
    out.push({
      line: i + 1,
      productText,
      quantity,
      rate: parseNumber(rate),
      extra,
    })
  })
  return out
}

function splitCsv(line: string): string[] {
  const cells: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i += 1
      } else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',' || ch === ';') {
      cells.push(cur)
      cur = ''
    } else cur += ch
  }
  cells.push(cur)
  return cells
}

/** True when clipboard text looks like several rows/columns rather than one value. */
export const looksLikeTable = (text: string) =>
  /\n\S/.test(text.trim()) || text.includes('\t')
