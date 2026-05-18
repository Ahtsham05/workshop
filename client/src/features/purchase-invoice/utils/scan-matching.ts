import type { Product } from '@/features/invoice'
import type { PurchaseItem, Supplier } from '../index'
import { matchesBilingualSearch } from '@/utils/urdu-text-utils'
import { getProductUnitOptions } from '@/lib/inventory-unit-conversions'

export interface ScannedSupplierHint {
  name?: string
  nameUrdu?: string
  phone?: string
}

export interface ScannedLineHint {
  name?: string
  nameUrdu?: string
  barcode?: string
  quantity?: number
  purchasePrice?: number
  sellingPrice?: number
}

export function normalizePhoneDigits(phone: string | undefined | null): string {
  return String(phone || '').replace(/\D/g, '').slice(-10)
}

function phonesMatch(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  return a.endsWith(b) || b.endsWith(a)
}

export function matchSupplierFromScan(
  scanned: ScannedSupplierHint,
  suppliers: Supplier[],
): Supplier | null {
  if (!suppliers.length) return null

  const phone = normalizePhoneDigits(scanned.phone)
  if (phone.length >= 7) {
    const byPhone = suppliers.find((s) => {
      const sp = normalizePhoneDigits(s.phone)
      const sw = normalizePhoneDigits((s as { whatsapp?: string }).whatsapp)
      return phonesMatch(phone, sp) || phonesMatch(phone, sw)
    })
    if (byPhone) return byPhone
  }

  const queryParts = [scanned.name, scanned.nameUrdu].filter(Boolean) as string[]
  const q = queryParts.join(' ').trim()
  if (!q) return null

  const candidates = suppliers.filter((s) =>
    matchesBilingualSearch(q, s.name, s.nameUrdu, s.phone),
  )
  if (candidates.length === 1) return candidates[0]

  const lower = q.toLowerCase()
  let best: Supplier | null = null
  let bestScore = 0

  for (const s of suppliers) {
    let score = 0
    const name = (s.name || '').toLowerCase()
    const nameUrdu = s.nameUrdu || ''
    if (name === lower || nameUrdu === q) score += 12
    else if (name.includes(lower) || lower.includes(name)) score += 6
    if (nameUrdu && (nameUrdu.includes(q) || q.includes(nameUrdu))) score += 6
    if (score > bestScore) {
      bestScore = score
      best = s
    }
  }

  if (bestScore >= 6) return best
  return candidates[0] || null
}

export function getProductId(product: Product): string {
  return product.id || (product._id as string) || ''
}

export function matchProductFromScan(
  scanned: ScannedLineHint,
  products: Product[],
): Product | null {
  if (!products.length) return null

  const barcode = String(scanned.barcode || '').trim()
  if (barcode) {
    const exact = products.find((p) => p.barcode === barcode)
    if (exact) return exact
  }

  const q = [scanned.name, scanned.nameUrdu].filter(Boolean).join(' ').trim()
  if (!q) return null

  const matches = products.filter((p) =>
    matchesBilingualSearch(q, p.name, p.nameUrdu, p.barcode),
  )
  if (matches.length === 1) return matches[0]

  const lower = q.toLowerCase()
  const exactName = matches.filter(
    (p) => p.name?.toLowerCase() === lower || p.nameUrdu === q,
  )
  if (exactName.length === 1) return exactName[0]

  return matches[0] || null
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
