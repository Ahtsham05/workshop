import type { ProductionMaterial } from '@/stores/manufacturing.api'

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

/** Still to issue = required − issued + returned + scrapped (scrapped material must be replaced). */
export const lineRemaining = (m: ProductionMaterial) =>
  Math.max(
    0,
    m.requiredQuantity -
      n(m.issuedQuantity) +
      n(m.returnedQuantity) +
      n(m.scrappedQuantity)
  )

export type IssueState = 'none' | 'partial' | 'full' | 'over'

export const issueState = (m: ProductionMaterial): IssueState => {
  const net = lineIssuedNet(m) - n(m.scrappedQuantity)
  if (net <= 1e-6) return 'none'
  if (net > m.requiredQuantity + 1e-6) return 'over'
  return lineRemaining(m) <= 1e-6 ? 'full' : 'partial'
}
