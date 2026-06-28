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

/** Single number when min===max (or no variants), else a "min–max" range string. */
export function formatDisplayPrice(product: DisplayableProduct, field: 'price' | 'cost'): string {
  const range = product.hasVariants ? product.variantPriceRange : null
  if (range) {
    const min = field === 'price' ? range.minPrice : range.minCost
    const max = field === 'price' ? range.maxPrice : range.maxCost
    return min === max ? String(min) : `${min}–${max}`
  }
  return String(product[field] ?? 0)
}

/** Lowest variant price/cost (or the legacy value) — for sort/disable comparisons
 *  like "out of stock" checks that need a single number, not a range string. */
export function getDisplayPriceValue(product: DisplayableProduct, field: 'price' | 'cost'): number {
  const range = product.hasVariants ? product.variantPriceRange : null
  if (range) return field === 'price' ? range.minPrice : range.minCost
  return product[field] ?? 0
}
