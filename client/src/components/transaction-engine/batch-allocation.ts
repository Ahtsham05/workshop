import type { EntryBatch, EntryBatchAllocation } from './types'

/*
 * Splitting a row's quantity over batches — the same rules the server applies:
 * automatic = earliest expiry first (FEFO), expired batches skipped; a picked batch is
 * drawn first and, when it can't cover the row, the rest comes from the next batches by
 * expiry. Pure functions, so cells, configs and summaries all agree.
 */

const EPS = 1e-9
const round = (n: number) => Math.round(n * 1e6) / 1e6

const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Whole calendar days until a batch expires (negative = expired), or null. */
export const daysToExpiry = (b: Pick<EntryBatch, 'expiryDate'>) =>
  b.expiryDate
    ? Math.floor((new Date(b.expiryDate).getTime() - startOfToday()) / 86400000)
    : null

export const isExpiredBatch = (b: Pick<EntryBatch, 'expiryDate'>) => {
  const d = daysToExpiry(b)
  return d !== null && d < 0
}

/** Earliest expiry first; batches without an expiry last; otherwise as given (oldest first). */
export const fefoOrder = (batches: EntryBatch[]) =>
  batches
    .map((b, i) => ({ b, i }))
    .sort((x, y) => {
      const ex = x.b.expiryDate ? new Date(x.b.expiryDate).getTime() : Infinity
      const ey = y.b.expiryDate ? new Date(y.b.expiryDate).getTime() : Infinity
      return ex - ey || x.i - y.i
    })
    .map(({ b }) => b)

export const allocationTotal = (a: EntryBatchAllocation[] | null | undefined) =>
  round((a || []).reduce((s, x) => s + (Number(x.quantity) || 0), 0))

export interface BatchPlan {
  allocations: EntryBatchAllocation[]
  /** Quantity no batch could cover. */
  short: number
}

/** Fills `quantity` from `order`, each batch up to what it holds. */
const fill = (
  order: EntryBatch[],
  quantity: number,
  start: EntryBatchAllocation[] = []
): BatchPlan => {
  const allocations = start.map((a) => ({ ...a }))
  let left = round(quantity - allocationTotal(allocations))
  for (const b of order) {
    if (left <= EPS) break
    if (allocations.some((a) => a.batchId === b.id) || b.quantity <= EPS)
      continue
    const take = round(Math.min(left, b.quantity))
    allocations.push({
      batchId: b.id,
      batchNumber: b.batchNumber,
      quantity: take,
    })
    left = round(left - take)
  }
  return { allocations, short: Math.max(0, left) }
}

/** Automatic split: unexpired batches, earliest expiry first. */
export const planFefo = (batches: EntryBatch[], quantity: number): BatchPlan =>
  fill(
    fefoOrder(batches).filter((b) => !isExpiredBatch(b)),
    quantity
  )

/** `first` is drawn first; the rest of the quantity from the next unexpired batches by expiry. */
export const planFrom = (
  batches: EntryBatch[],
  quantity: number,
  first: EntryBatch
): BatchPlan => {
  const take = round(Math.min(quantity, Math.max(0, first.quantity)))
  return fill(
    fefoOrder(batches).filter((b) => !isExpiredBatch(b)),
    quantity,
    take > EPS
      ? [{ batchId: first.id, batchNumber: first.batchNumber, quantity: take }]
      : []
  )
}

/**
 * The row's quantity changed: keep the picked batches in their order (each up to what it
 * holds), top up from the next unexpired batches if they no longer cover it, drop what is
 * no longer needed.
 */
export const refitAllocations = (
  current: EntryBatchAllocation[],
  batches: EntryBatch[],
  quantity: number
): BatchPlan => {
  const cap = new Map(batches.map((b) => [b.id, b.quantity]))
  const kept: EntryBatchAllocation[] = []
  let left = round(quantity)
  for (const a of current) {
    if (left <= EPS) break
    const take = round(Math.min(left, cap.get(a.batchId) ?? a.quantity))
    if (take > EPS) kept.push({ ...a, quantity: take })
    left = round(left - take)
  }
  return fill(
    fefoOrder(batches).filter((b) => !isExpiredBatch(b)),
    quantity,
    kept
  )
}

export const sameAllocations = (
  a: EntryBatchAllocation[] | null | undefined,
  b: EntryBatchAllocation[] | null | undefined
) =>
  (a || []).length === (b || []).length &&
  (a || []).every(
    (x, i) =>
      x.batchId === b![i].batchId &&
      Math.abs(x.quantity - b![i].quantity) < 1e-6
  )

/** Row fields for a picked split (`batchId` mirrors a single batch; empty = automatic). */
export const allocationFields = (
  allocations: EntryBatchAllocation[] | null
) => {
  const list = allocations && allocations.length ? allocations : null
  return {
    batches: list,
    batchId: list && list.length === 1 ? list[0].batchId : null,
    batchNumber: list && list.length === 1 ? list[0].batchNumber : null,
  }
}
