import { useFormatMoney as useAppFormatMoney } from '@/lib/format-money'
import { useCanViewManufacturingCosts } from '@/lib/cost-visibility'

/**
 * Manufacturing's money formatter. For a role without viewManufacturingCosts the server
 * never sends the figure (see server/src/middlewares/costVisibility.js); this shows "—"
 * instead of a misleading 0 wherever a value would have been. Columns and cards that are
 * nothing but money are hidden outright (DataTable `money` columns, canSeeCosts checks).
 */
export function useFormatMoney(): (amount: number) => string {
  const format = useAppFormatMoney()
  const canSeeCosts = useCanViewManufacturingCosts()
  return canSeeCosts ? format : () => '—'
}
