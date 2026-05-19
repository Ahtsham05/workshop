import type { Product } from '@/features/invoice'
import type { PurchaseItem, Supplier } from '../index'
import { matchesBilingualSearch } from '@/utils/urdu-text-utils'
import { getProductUnitOptions } from '@/lib/inventory-unit-conversions'
import { extractFirstPhone, resolveEntityId } from './catalog-helpers'

export interface ScannedSupplierHint {
  name?: string
  nameUrdu?: string
  phone?: string
  matchedSupplierId?: string | null
}

export interface ScannedLineHint {
  name?: string
  nameUrdu?: string
  barcode?: string
  quantity?: number
  purchasePrice?: number
  sellingPrice?: number
  matchedProductId?: string | null
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'co',
  'company',
  'ltd',
  'pvt',
  'store',
  'shop',
  'traders',
  'trader',
  'trading',
  'enterprise',
  'supplier',
  'mobile',
  'communication',
  'اسٹور',
  'شاپ',
  'ٹریڈرز',
  'ٹریڈر',
  'کمپنی',
])

export function normalizePhoneDigits(phone: string | undefined | null): string {
  return String(phone || '').replace(/\D/g, '').slice(-10)
}

function phonesMatch(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  return a.length >= 7 && b.length >= 7 && (a.endsWith(b) || b.endsWith(a))
}

function normalizeText(value: string | undefined | null): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\w\u0600-\u06FF\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(value: string | undefined | null): string[] {
  return normalizeText(value)
    .split(' ')
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
  )
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      )
    }
  }
  return matrix[a.length][b.length]
}

function similarityRatio(a: string, b: string): number {
  const na = normalizeText(a)
  const nb = normalizeText(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.92
  const dist = levenshtein(na, nb)
  const maxLen = Math.max(na.length, nb.length)
  return maxLen > 0 ? 1 - dist / maxLen : 0
}

function tokenOverlapScore(a: string, b: string): number {
  const ta = tokenize(a)
  const tb = tokenize(b)
  if (!ta.length || !tb.length) return 0
  const setB = new Set(tb)
  let inter = 0
  ta.forEach((t) => {
    if (setB.has(t)) inter += 1
  })
  return inter / Math.max(ta.length, tb.length)
}

function bilingualScore(scannedParts: string[], entityParts: string[]): number {
  let best = 0
  scannedParts.forEach((s) => {
    entityParts.forEach((e) => {
      if (!s || !e) return
      best = Math.max(best, similarityRatio(s, e), tokenOverlapScore(s, e))
    })
  })
  return best
}

export function getSupplierId(supplier: Supplier | { id?: string; _id?: string }): string {
  return resolveEntityId(supplier)
}

export function matchSupplierFromScan(
  scanned: ScannedSupplierHint,
  suppliers: Supplier[],
): Supplier | null {
  if (!suppliers.length) return null

  if (scanned.matchedSupplierId) {
    const fromApi = suppliers.find((s) => getSupplierId(s) === scanned.matchedSupplierId)
    if (fromApi) return fromApi
  }

  const phone = normalizePhoneDigits(extractFirstPhone(scanned.phone))
  if (phone.length >= 7) {
    const byPhone = suppliers.find((s) => {
      const sp = normalizePhoneDigits(s.phone)
      const sw = normalizePhoneDigits((s as { whatsapp?: string }).whatsapp)
      return phonesMatch(phone, sp) || phonesMatch(phone, sw)
    })
    if (byPhone) return byPhone
  }

  const scannedParts = [scanned.name, scanned.nameUrdu].filter(Boolean) as string[]
  if (!scannedParts.length) return null

  const quickMatches = suppliers.filter((s) =>
    matchesBilingualSearch(scannedParts.join(' '), s.name, s.nameUrdu, s.phone),
  )

  let best: Supplier | null = null
  let bestScore = 0

  const pool = quickMatches.length > 0 ? quickMatches : suppliers
  for (const s of pool) {
    const entityParts = [s.name, s.nameUrdu].filter(Boolean) as string[]
    const score = bilingualScore(scannedParts, entityParts)
    if (score > bestScore) {
      bestScore = score
      best = s
    }
  }

  if (bestScore >= 0.55) return best
  if (quickMatches.length === 1) return quickMatches[0]
  return null
}

export function getProductId(product: Product | { id?: string; _id?: string }): string {
  return resolveEntityId(product)
}

export function matchProductFromScan(
  scanned: ScannedLineHint,
  products: Product[],
): Product | null {
  if (!products.length) return null

  if (scanned.matchedProductId) {
    const fromApi = products.find((p) => getProductId(p) === scanned.matchedProductId)
    if (fromApi) return fromApi
  }

  const barcode = String(scanned.barcode || '').trim()
  if (barcode) {
    const exact = products.find((p) => String(p.barcode || '').trim() === barcode)
    if (exact) return exact
  }

  const scannedParts = [scanned.name, scanned.nameUrdu].filter(Boolean) as string[]
  if (!scannedParts.length) return null

  const quickMatches = products.filter((p) =>
    matchesBilingualSearch(scannedParts.join(' '), p.name, p.nameUrdu, p.barcode),
  )

  let best: Product | null = null
  let bestScore = 0
  const pool = quickMatches.length > 0 ? quickMatches : products

  for (const p of pool) {
    const entityParts = [p.name, p.nameUrdu, p.barcode].filter(Boolean) as string[]
    const score = bilingualScore(scannedParts, entityParts)
    if (score > bestScore) {
      bestScore = score
      best = p
    }
  }

  if (bestScore >= 0.4) return best
  if (quickMatches.length === 1) return quickMatches[0]
  if (best && bestScore >= 0.32 && bestScore === getBestAmongAll(products, scannedParts)) {
    return best
  }
  return null
}

function getBestAmongAll(
  products: Product[],
  scannedParts: string[],
): number {
  let top = 0
  for (const p of products) {
    const entityParts = [p.name, p.nameUrdu, p.barcode].filter(Boolean) as string[]
    top = Math.max(top, bilingualScore(scannedParts, entityParts))
  }
  return top
}

export function buildPurchaseItemFromMatch(
  product: Product,
  quantity: number,
  purchasePrice: number,
  sellingPrice: number,
): PurchaseItem {
  const unitOptions = getProductUnitOptions(product)
  return {
    product,
    quantity: quantity > 0 ? quantity : 1,
    unit: unitOptions[0]?.value || product.unit || 'pcs',
    conversionFactor: unitOptions[0]?.factor || 1,
    stockQuantity: quantity > 0 ? quantity : 1,
    purchasePrice: purchasePrice >= 0 ? purchasePrice : product.cost || 0,
    sellingPrice:
      sellingPrice > 0 ? sellingPrice : product.price || product.cost || 0,
    isManualEntry: false,
  }
}
