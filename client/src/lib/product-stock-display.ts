/**
 * Once a product has variants, its legacy price/cost/stockQuantity fields stay at
 * their fallback values (often 0) — the real numbers live on ProductVariant/Inventory
 * and arrive as `variantStockTotal`/`variantPriceRange` (see
 * docs/architecture/universal-product-migration.md). Every place that lists or searches
 * products (Products List, Purchase/Invoice catalogs and pickers) must read through
 * these helpers instead of the raw legacy fields, or variant products show as Rs0/0 in
 * stock everywhere outside the product page itself.
 */

interface DisplayableProduct {
  hasVariants?: boolean
  price?: number
  cost?: number
  stockQuantity?: number
  variantStockTotal?: number
  variantPriceRange?: { minPrice: number; maxPrice: number; minCost: number; maxCost: number } | null
}

export function getDisplayStock(product: DisplayableProduct): number {
  if (product.hasVariants) return product.variantStockTotal ?? 0
  return product.stockQuantity ?? 0
}

interface ThresholdableProduct {
  lowStockThreshold?: number | null
  criticalStockThreshold?: number | null
}

export type StockStatus = 'out_of_stock' | 'critical_stock' | 'low_stock' | 'in_stock'

/**
 * Resolves the low/critical thresholds that actually apply to this product: its own
 * per-product override when set, else the store-wide defaults from the Low Stock Alert
 * settings — and if the store-wide critical default was never set either, half of
 * whichever low-stock value is in effect. Shared by every place that classifies stock
 * status, so a per-product override set in one view (e.g. the row popover) — or a
 * store-wide default changed in the Low Stock Alert settings — is reflected identically
 * everywhere else (stat cards, the low-stock banner, the "View All" details page).
 */
export function getEffectiveStockThresholds(
  product: ThresholdableProduct,
  defaultLowStockThreshold: number,
  defaultCriticalStockThreshold?: number | null,
): { low: number; critical: number } {
  const low = product.lowStockThreshold ?? defaultLowStockThreshold
  const fallbackCritical = defaultCriticalStockThreshold ?? Math.floor(low / 2)
  const critical = Math.min(product.criticalStockThreshold ?? fallbackCritical, low)
  return { low, critical }
}

export function getStockStatus(
  product: DisplayableProduct & ThresholdableProduct,
  defaultLowStockThreshold: number,
  defaultCriticalStockThreshold?: number | null,
): StockStatus {
  const stock = getDisplayStock(product)
  if (stock === 0) return 'out_of_stock'
  const { low, critical } = getEffectiveStockThresholds(product, defaultLowStockThreshold, defaultCriticalStockThreshold)
  if (stock <= critical) return 'critical_stock'
  if (stock <= low) return 'low_stock'
  return 'in_stock'
}

/**
 * Single number when min===max (or no variants), else a "min–max" range string.
 * `format` defaults to a bare `String(...)` (e.g. for CSV/Excel export cells, which want a
 * plain number, not a currency-formatted one) — callers rendering this for on-screen
 * display should pass `useFormatMoney()`'s returned function so both the single-value and
 * range cases come out through the centralized currency formatter instead of a hardcoded
 * "Rs" prefix wrapped around this function's return value.
 */
export function formatDisplayPrice(
  product: DisplayableProduct,
  field: 'price' | 'cost',
  format: (amount: number) => string = String,
): string {
  const range = product.hasVariants ? product.variantPriceRange : null
  if (range) {
    const min = field === 'price' ? range.minPrice : range.minCost
    const max = field === 'price' ? range.maxPrice : range.maxCost
    return min === max ? format(min) : `${format(min)}–${format(max)}`
  }
  return format(product[field] ?? 0)
}

/** Lowest variant price/cost (or the legacy value) — for sort/disable comparisons
 *  like "out of stock" checks that need a single number, not a range string. */
export function getDisplayPriceValue(product: DisplayableProduct, field: 'price' | 'cost'): number {
  const range = product.hasVariants ? product.variantPriceRange : null
  if (range) return field === 'price' ? range.minPrice : range.minCost
  return product[field] ?? 0
}

/** Stock valued at cost (qty on hand × cost/unit) — the standard "inventory value"
 *  figure, matching the Inventory Report's `stock_value` stat. For a variant product
 *  this multiplies total stock by the *lowest* variant cost (see getDisplayPriceValue),
 *  so it under-values products whose variants have mixed costs — an accepted
 *  approximation for a list column, not a substitute for a real per-variant valuation. */
export function getDisplayStockValue(product: DisplayableProduct): number {
  return getDisplayStock(product) * getDisplayPriceValue(product, 'cost')
}
