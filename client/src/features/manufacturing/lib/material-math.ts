import type {
  ProductionMaterial,
  ProductionOrder,
} from '@/stores/manufacturing.api'

/*
 * Material-line arithmetic, mirroring server/src/services/manufacturing/wip.js.
 * All quantities are in the line's own units.
 */
export const n = (v: number | undefined) => v || 0

/** Issued net of returns. */
export const lineIssuedNet = (m: ProductionMaterial) =>
  Math.max(0, n(m.issuedQuantity) - n(m.returnedQuantity))

/** Sitting in WIP now = issued − returned − consumed − scrapped. */
export const lineWip = (m: ProductionMaterial) =>
  Math.max(
    0,
    n(m.issuedQuantity) -
      n(m.returnedQuantity) -
      n(m.consumedQuantity) -
      n(m.scrappedQuantity)
  )

/**
 * Still to issue = required − issued + returned + scrapped (scrapped material must be
 * replaced). A production-stock line is never issued to the order — receipts use it from
 * the floor — so nothing is ever "still to issue" on it.
 */
export const lineRemaining = (m: ProductionMaterial) =>
  m.supply === 'floor'
    ? 0
    : Math.max(
        0,
        m.requiredQuantity -
          n(m.issuedQuantity) +
          n(m.returnedQuantity) +
          n(m.scrappedQuantity)
      )

/** Used from production stock (issued to the floor in bulk), not issued to the order. */
export const isFloorLine = (m: Pick<ProductionMaterial, 'supply'>) =>
  m.supply === 'floor'

export type IssueState = 'none' | 'partial' | 'full' | 'over'

export const issueState = (m: ProductionMaterial): IssueState => {
  const net = lineIssuedNet(m) - n(m.scrappedQuantity)
  if (net <= 1e-6) return 'none'
  if (net > m.requiredQuantity + 1e-6) return 'over'
  return lineRemaining(m) <= 1e-6 ? 'full' : 'partial'
}

/**
 * What scrapping `quantity` of a line out of WIP is worth — the server takes the oldest
 * lots first (services/manufacturing/wip.js#takeFromWip), each at its own issue cost.
 */
export const wipScrapCost = (
  order: ProductionOrder,
  materialLineId: string,
  quantity: number
) => {
  let left = quantity
  let cost = 0
  const lots = order.wipLots
    .filter((l) => l.materialLineId === materialLineId && l.quantity > 1e-6)
    .sort((a, b) => +new Date(a.issuedAt) - +new Date(b.issuedAt))
  for (const lot of lots) {
    if (left <= 1e-6) break
    const ratio = lot.ratio || 1
    const units = Math.min(lot.quantity, left * ratio)
    cost += units * (lot.unitCost || 0)
    left -= units / ratio
  }
  return cost
}
