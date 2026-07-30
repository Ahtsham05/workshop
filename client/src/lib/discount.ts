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

/**
 * Applies an item's discount (type + raw value) to its gross line result (subtotal/profit
 * from calculateInvoiceLineValues), returning the net subtotal/profit that actually get
 * stored on the invoice item — profit drops by exactly the discount since cost is unaffected.
 */
export function applyLineDiscount(
  line: { subtotal: number; profit: number },
  discountType: DiscountType | undefined,
  discountValue: number | undefined,
): { subtotal: number; profit: number; discountAmount: number } {
  const discountAmount = computeDiscountAmount(line.subtotal, discountType, discountValue)
  return {
    subtotal: line.subtotal - discountAmount,
    profit: line.profit - discountAmount,
    discountAmount,
  }
}
