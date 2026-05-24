/** Remaining amount owed on this purchase invoice (0 when paid in full or overpaid). */
const resolvePurchaseInvoiceBalance = (totalAmount, paidAmount) =>
  Math.max(0, Number(totalAmount || 0) - Number(paidAmount || 0));

module.exports = {
  resolvePurchaseInvoiceBalance,
};
