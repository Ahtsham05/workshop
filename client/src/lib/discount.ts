export type DiscountType = 'fixed' | 'percentage'

/**
 * Resolves a discount type + raw entered value (Rs or %) against a base amount,
 * clamped so a discount can never exceed (and flip the sign of) what it applies to.
 */
export function computeDiscountAmount(
  baseAmount: number,
  discountType: DiscountType | undefined,
  discountValue: number | undefined,
): number {
  const base = Number(baseAmount) || 0
  const value = Number(discountValue) || 0
  if (base <= 0 || value <= 0) return 0
  const raw = discountType === 'percentage' ? (base * value) / 100 : value
  return Math.min(base, raw)
}
