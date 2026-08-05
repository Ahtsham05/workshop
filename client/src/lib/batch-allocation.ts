export interface BatchAllocation {
  batchId: string
  batchNumber: string
  quantity: number
}

/**
 * Greedily fills `neededQty` from `batches` in the order given (the catalog already
 * sorts by earliest expiry — FEFO) — the "big ERP" default for splitting a sale across
 * lots when no single one has enough. Returns however much it could allocate; if
 * `remaining > 0`, total stock across every batch fell short of what was asked for.
 */
export function autoAllocateBatches(
  batches: { id: string; batchNumber: string; quantity: number }[],
  neededQty: number,
): { allocations: BatchAllocation[]; remaining: number } {
  const allocations: BatchAllocation[] = []
  let remaining = neededQty
  for (const b of batches) {
    if (remaining <= 0) break
    if (b.quantity <= 0) continue
    const take = Math.min(b.quantity, remaining)
    allocations.push({ batchId: b.id, batchNumber: b.batchNumber, quantity: take })
    remaining -= take
  }
  return { allocations, remaining }
}
