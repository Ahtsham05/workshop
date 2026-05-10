/** Minimal shapes — avoids circular imports with invoice page */
type StockProduct = { _id?: string; id?: string; stockQuantity?: number }
type SaleLineStockLike = {
  productId?: string
  stockQuantity?: number
  quantity?: number
}

/** Restore catalog stock preview when removing sale lines or holding a draft */
export function revertSaleDraftStock(products: StockProduct[], items: SaleLineStockLike[]): StockProduct[] {
  let next = products.map((p) => ({ ...p }))
  for (const item of items) {
    if (!item.productId) continue
    const idx = next.findIndex((p) => String(p._id || p.id) === String(item.productId))
    if (idx === -1) continue
    const qty = item.stockQuantity ?? item.quantity ?? 0
    next[idx] = {
      ...next[idx],
      stockQuantity: (next[idx].stockQuantity ?? 0) + qty,
    }
  }
  return next
}

/** Apply catalog stock preview when loading a held / recovered sale draft */
export function applySaleDraftStock(products: StockProduct[], items: SaleLineStockLike[]): StockProduct[] {
  let next = products.map((p) => ({ ...p }))
  for (const item of items) {
    if (!item.productId) continue
    const idx = next.findIndex((p) => String(p._id || p.id) === String(item.productId))
    if (idx === -1) continue
    const qty = item.stockQuantity ?? item.quantity ?? 0
    next[idx] = {
      ...next[idx],
      stockQuantity: Math.max(0, (next[idx].stockQuantity ?? 0) - qty),
    }
  }
  return next
}
