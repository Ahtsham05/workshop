const Money = require('./money');

/**
 * Computes the reversed tax for one returned line, scaled by how much of the original
 * line's quantity is being returned — NEVER recalculated at current tax rates. Shared by
 * Sales Return (reversing Output Tax from the original Invoice) and Purchase Return
 * (reversing Input Tax Recoverable from the original Purchase), since both need the exact
 * same "prorate a persisted snapshot by returned-quantity ratio" logic. Reusing a scaled
 * historical value — rather than `Money.allocateProportionally` (which splits one new
 * total across several weighted recipients) — is what preserves the "old invoice keeps
 * its old rate" guarantee even if tax rates changed since the original sale/purchase.
 *
 * @param {Object} originalLineItem - the source Invoice/Purchase item: {taxCategoryId, taxableAmount, taxAmount, quantity, stockQuantity}
 * @param {number} returnedQuantity - quantity (in the line's own unit) being returned
 * @param {number} [decimalPlaces]
 * @returns {{taxCategoryId: string|null, taxableAmount: number, taxAmount: number}}
 */
const proportionLineTax = (originalLineItem, returnedQuantity, decimalPlaces = Money.DEFAULT_DECIMAL_PLACES) => {
  if (!originalLineItem || !(Number(originalLineItem.taxAmount) > 0)) {
    return { taxCategoryId: null, taxableAmount: 0, taxAmount: 0 };
  }
  const rawQuantity = originalLineItem.stockQuantity != null ? originalLineItem.stockQuantity : originalLineItem.quantity;
  const originalQuantity = Number(rawQuantity || 0);
  if (originalQuantity <= 0) {
    return { taxCategoryId: null, taxableAmount: 0, taxAmount: 0 };
  }
  // Clamped to [0,1] — a return can't exceed what was sold/purchased (already enforced
  // upstream by validateReturnQuantities-equivalent checks), but never let a rounding/
  // data edge case invert or exceed the original amount.
  const ratio = Math.min(1, Math.max(0, Number(returnedQuantity || 0) / originalQuantity));
  return {
    taxCategoryId: originalLineItem.taxCategoryId || null,
    taxableAmount: Money.multiplyMoney(Number(originalLineItem.taxableAmount || 0), ratio, decimalPlaces),
    taxAmount: Money.multiplyMoney(Number(originalLineItem.taxAmount || 0), ratio, decimalPlaces),
  };
};

/**
 * Rolls prorated per-item tax up into the header taxLines[] snapshot shape, grouped by
 * taxCategoryId. Component-level (per-rate) detail can't be exactly reconstructed per
 * proration — the source Invoice/Purchase only persists per-item taxCategoryId/taxAmount,
 * not a per-item rate-component breakdown (only the header taxLines[].components is that
 * granular, already aggregated across every line of that category) — so a return's
 * taxLines carry category-level totals only, with an empty components[]. Disclosed,
 * deliberate scope reduction rather than a fabricated/approximated component split.
 *
 * @param {Array<{taxCategoryId, taxableAmount, taxAmount}>} itemsWithTax
 * @param {Map<string, string>} [categoryNameById] - resolved from the original document's own taxLines, to avoid an extra TaxCategory query
 */
const buildReturnTaxLines = (itemsWithTax, categoryNameById) => {
  const byCategoryId = new Map();
  itemsWithTax.forEach((item) => {
    if (!item.taxCategoryId || !(item.taxAmount > 0)) return;
    const key = String(item.taxCategoryId);
    const existing = byCategoryId.get(key) || {
      taxCategoryId: item.taxCategoryId,
      taxCategoryName: (categoryNameById && categoryNameById.get(key)) || null,
      taxableAmount: 0,
      taxAmount: 0,
      components: [],
    };
    existing.taxableAmount += item.taxableAmount;
    existing.taxAmount += item.taxAmount;
    byCategoryId.set(key, existing);
  });
  return Array.from(byCategoryId.values());
};

module.exports = { proportionLineTax, buildReturnTaxLines };
