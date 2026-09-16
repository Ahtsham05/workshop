import type { ProductAnalyticsResponse } from '@/stores/productAnalytics.api'

/** Days of stock a reorder aims to cover at the current selling pace. */
const REORDER_COVER_DAYS = 30

export function suggestReorderQuantity(metrics: ProductAnalyticsResponse['metrics']): number {
  const needed = Math.ceil(metrics.velocity * REORDER_COVER_DAYS - Math.max(0, metrics.currentStock))
  return Math.max(1, needed)
}
