import { useCallback, useMemo } from 'react'
import { useWarehousePicker } from '@/components/warehouse-field'
import { useGetWarehouseQuantitiesQuery } from '@/stores/warehouse.api'

/**
 * Stock held in the warehouse a sale / issue is taken from. Only active for a non-default
 * warehouse (the default one is what the screen already shows as "Stock"). `qtyOf` returns
 * null when there is nothing to show.
 */
export function useWarehouseQuantities(warehouseId: string | null | undefined, kind: 'sale' | 'receipt' | 'any' = 'sale') {
  const { visible, warehouses, defaultId } = useWarehousePicker(kind)
  const active = Boolean(visible && warehouseId && warehouseId !== defaultId)
  // Refreshed when stock moves (catalog-invalidation.middleware.ts) — no timer.
  const { data } = useGetWarehouseQuantitiesQuery(warehouseId || '', { skip: !active })
  const warehouse = useMemo(() => warehouses.find((w) => w.id === warehouseId) || null, [warehouses, warehouseId])
  const qtyOf = useCallback(
    (productId?: string | null, variantId?: string | null): number | null => {
      if (!active || !data || !productId) return null
      if (variantId && data[`v:${variantId}`] !== undefined) return data[`v:${variantId}`]
      return data[productId] ?? 0
    },
    [active, data]
  )
  return { active, warehouse, qtyOf }
}
