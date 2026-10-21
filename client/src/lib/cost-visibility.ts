import { usePermissions } from '@/context/permission-context'

/**
 * Money a role may be barred from seeing. The server strips these fields from its
 * responses (server/src/middlewares/costVisibility.js); these hooks hide the matching
 * columns, cards and inputs so the screen shows no empty "Cost" column either.
 */

/** Cost / purchase price, stock value, margin and profit (sale prices are always shown). */
export function useCanViewCostPrices(): boolean {
  return usePermissions().hasExplicitPermission('viewCostPrices')
}

/** Every cost, value and price inside Manufacturing. */
export function useCanViewManufacturingCosts(): boolean {
  return usePermissions().hasExplicitPermission('viewManufacturingCosts')
}
