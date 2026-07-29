/**
 * Resolves a discount type + raw entered value (Rs or %) against a base amount,
 * clamped so a discount can never exceed (and flip the sign of) what it applies to.
 * Mirrors client/src/features/purchase-invoice/utils/discount.ts — keep both in sync.
 */
const computeDiscountAmount = (baseAmount, discountType, discountValue) => {
  const base = Number(baseAmount) || 0;
  const value = Number(discountValue) || 0;
  if (base <= 0 || value <= 0) return 0;
  const raw = discountType === 'percentage' ? (base * value) / 100 : value;
  return Math.min(base, raw);
};

module.exports = {
  computeDiscountAmount,
};
