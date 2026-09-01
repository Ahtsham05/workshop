import type { PriceComparisonEntry } from '@/stores/purchase.api'

export type PriceChangeDirection = 'increase' | 'decrease' | 'none'
export type PriceChangeSeverity = 'none' | 'minor' | 'moderate' | 'significant'

export interface PriceChangeResult {
  /** currentPrice - previousPrice, rounded to 2dp for display; unrounded math happens above this. */
  difference: number
  /** null when previousPrice is 0 — a percentage against zero is meaningless, never shown. */
  percentageChange: number | null
  direction: PriceChangeDirection
  severity: PriceChangeSeverity
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * ((current - previous) / previous) * 100, guarding every non-comparable input the spec
 * calls out: missing/invalid prices, a zero previous price (division by zero), and
 * floating-point noise (round2 only at the boundary, not mid-calculation).
 */
export function calculatePriceChange(
  previousPrice: number | null | undefined,
  currentPrice: number | null | undefined,
): PriceChangeResult | null {
  if (previousPrice === null || previousPrice === undefined || !Number.isFinite(previousPrice)) return null
  if (currentPrice === null || currentPrice === undefined || !Number.isFinite(currentPrice)) return null

  const difference = round2(currentPrice - previousPrice)
  const percentageChange = previousPrice !== 0 ? round2((difference / previousPrice) * 100) : null
  const direction: PriceChangeDirection = difference > 0 ? 'increase' : difference < 0 ? 'decrease' : 'none'

  return { difference, percentageChange, direction, severity: getPriceStatus(percentageChange, direction) }
}

/** Suggested thresholds: <3% minor, 3–<10% moderate, >=10% significant. */
export function getPriceStatus(percentageChange: number | null, direction: PriceChangeDirection): PriceChangeSeverity {
  if (direction === 'none') return 'none'
  // No previous price to divide by (previousPrice === 0) but the amount still moved —
  // can't rate it by %, so treat any nonzero move off a zero baseline as worth flagging.
  if (percentageChange === null) return 'significant'
  const abs = Math.abs(percentageChange)
  if (abs === 0) return 'none'
  if (abs < 3) return 'minor'
  if (abs < 10) return 'moderate'
  return 'significant'
}

export interface FormattedPriceChange {
  text: string
  icon: 'up' | 'down' | 'equal'
  /** Semantic tone for the row indicator's color, independent of increase/decrease —
   *  a significant decrease is still good news (tone 'good'), a significant increase is
   *  the one case worth a warning color (tone 'warning'). */
  tone: 'good' | 'bad' | 'warning' | 'neutral'
}

/**
 * ↑/↓/= + Rs amount (+ % when it's meaningful) — kept deliberately short (no "Significant
 * increase:" wording) since this renders in a ~100px column; severity is instead carried
 * by the icon (a warning triangle vs a plain arrow) and color, with the full sentence
 * available in the indicator's tooltip. The Summary card's price-change list uses this
 * same compact text too, so it stays consistent between the two places it appears.
 */
export function formatPriceChange(change: PriceChangeResult): FormattedPriceChange {
  const pct = change.percentageChange !== null ? ` (${change.percentageChange > 0 ? '+' : ''}${change.percentageChange.toFixed(2)}%)` : ''

  if (change.direction === 'none') {
    return { text: 'No price change', icon: 'equal', tone: 'neutral' }
  }
  if (change.direction === 'increase') {
    return {
      text: `+Rs${change.difference.toFixed(2)}${pct}`,
      icon: 'up',
      tone: change.severity === 'significant' ? 'warning' : 'bad',
    }
  }
  return {
    text: `-Rs${Math.abs(change.difference).toFixed(2)}${pct}`,
    icon: 'down',
    tone: 'good',
  }
}

export interface PriceComparisonBasis {
  previousPrice: number
  /** e.g. "vs Supplier A's last purchase" or "vs last purchase (Supplier B)" — always
   *  names the supplier when it differs from the one on this purchase, per the spec's
   *  "don't imply a price change against a different supplier without saying so". */
  label: string
  supplierSpecific: boolean
  lastPurchaseDate: string | null
}

/**
 * Picks which previous price to compare against: the current supplier's own last price
 * when we have one, else the overall (any-supplier) last price. Returns null when there
 * is no purchase history at all for this product/variant.
 */
export function resolvePriceComparisonBasis(
  comparison: PriceComparisonEntry | undefined,
  currentSupplierName: string | undefined,
): PriceComparisonBasis | null {
  if (!comparison) return null

  if (comparison.supplierPrice?.hasHistory && comparison.supplierPrice.lastPurchasePrice !== null) {
    return {
      previousPrice: comparison.supplierPrice.lastPurchasePrice,
      label: currentSupplierName ? `vs ${currentSupplierName}'s last purchase` : "vs this supplier's last purchase",
      supplierSpecific: true,
      lastPurchaseDate: comparison.supplierPrice.lastPurchaseDate,
    }
  }

  if (comparison.hasHistory && comparison.lastPurchasePrice !== null) {
    return {
      previousPrice: comparison.lastPurchasePrice,
      label: comparison.lastPurchaseSupplierName
        ? `vs last purchase (${comparison.lastPurchaseSupplierName})`
        : 'vs last purchase',
      supplierSpecific: false,
      lastPurchaseDate: comparison.lastPurchaseDate,
    }
  }

  return null
}
