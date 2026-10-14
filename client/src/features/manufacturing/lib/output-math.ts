import type {
  FinishedGoodsInput,
  ProductionOrder,
} from '@/stores/manufacturing.api'
import { lineWip } from './material-math'

/*
 * Output arithmetic for receiving finished goods, mirroring the server's backflush
 * (services/manufacturing/execution.service.js#backflush): each material line's cumulative
 * consumption follows its requirement in proportion to cumulative output.
 */

const floor3 = (n: number) => Math.floor(n * 1000 + 1e-6) / 1000

/** What `quantity` more output takes from each material line's WIP (the server's backflush). */
export function consumptionFor(order: ProductionOrder, quantity: number) {
  const share = Math.min(
    1,
    (order.producedQuantity + quantity) / order.plannedQuantity
  )
  return order.materials.map((m) => {
    const inWip = lineWip(m)
    let need = Math.max(0, m.requiredQuantity * share - m.consumedQuantity)
    if (m.isOptional) need = Math.min(need, inWip)
    const avgCost = m.issuedQuantity > 0 ? m.issuedCost / m.issuedQuantity : 0
    return {
      material: m,
      need,
      inWip,
      short: m.isOptional ? 0 : Math.max(0, need - inWip),
      cost: need * avgCost,
    }
  })
}

/** How many more units the material on the floor covers (every required line). */
export function buildableFrom(order: ProductionOrder) {
  const limits = order.materials
    .filter((m) => !m.isOptional && m.requiredQuantity > 0)
    .map(
      (m) =>
        ((m.consumedQuantity + lineWip(m)) / m.requiredQuantity) *
          order.plannedQuantity -
        order.producedQuantity
    )
  if (!limits.length) return Infinity
  return Math.max(0, floor3(Math.min(...limits)))
}

/** Finished-goods batch / serial input as the API takes it (trimmed, blanks dropped). */
export const cleanFg = (fg: FinishedGoodsInput): FinishedGoodsInput => ({
  ...fg,
  serialNumbers: fg.serialNumbers?.map((x) => x.trim()).filter(Boolean),
  batchNumber: fg.batchNumber?.trim() || undefined,
})
