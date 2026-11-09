import { useMemo } from 'react'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { DEFAULT_WAREHOUSE_SETTINGS, type WarehouseSettings } from '@/stores/warehouse.api'

/**
 * Multi-warehouse on/off + options, read from the organization record every screen already
 * loads (no extra request). Settings → Warehouses changes it; while off the whole module
 * (menu, pickers on invoices/purchases) stays out of sight.
 */
export function useWarehouseSettings(): WarehouseSettings & { loaded: boolean } {
  const { data: org } = useGetMyOrganizationQuery()
  return useMemo(() => {
    const raw = ((org as unknown as { warehouseSettings?: Partial<WarehouseSettings> } | undefined)?.warehouseSettings || {}) as Partial<WarehouseSettings>
    const out = { ...DEFAULT_WAREHOUSE_SETTINGS }
    ;(Object.keys(DEFAULT_WAREHOUSE_SETTINGS) as (keyof WarehouseSettings)[]).forEach((key) => {
      if (typeof raw[key] === 'boolean') out[key] = raw[key] as boolean
    })
    return { ...out, loaded: Boolean(org) }
  }, [org])
}
