/**
 * Remaining amount owed on this purchase invoice. Negative means the supplier was paid more
 * than this invoice's own total — e.g. settling some of their previous balance at the same
 * time — which correctly shows as a receivable from the supplier, mirroring Invoice's own
 * (uncapped) balance math.
 */
const resolvePurchaseInvoiceBalance = (totalAmount, paidAmount) =>
  Number(totalAmount || 0) - Number(paidAmount || 0);

module.exports = {
  resolvePurchaseInvoiceBalance,
};
