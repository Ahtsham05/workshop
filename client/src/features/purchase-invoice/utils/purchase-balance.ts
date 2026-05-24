/** Remaining amount owed on this purchase invoice (never negative when overpaid). */
export function resolvePurchaseInvoiceBalance(total: number, paid: number): number {
  return Math.max(0, Number(total || 0) - Number(paid || 0))
}
