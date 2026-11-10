import { useEffect } from 'react'
import { useWarehousePicker } from '@/components/warehouse-field'
import { useWarehouseSettings } from '@/hooks/use-warehouse-settings'
import { setWarehousePrintResolver } from '@/features/invoice/utils/print-utils'

/**
 * Tells the invoice print builder how to name a warehouse: on while Settings → Warehouses →
 * "Show warehouse on invoice prints" is on and the branch has more than one warehouse.
 * An invoice without a warehouse came from the default one. Renders nothing.
 */
export function WarehousePrintSync() {
  const { showOnPrints } = useWarehouseSettings()
  const { visible, warehouses, defaultId } = useWarehousePicker('any')
  useEffect(() => {
    if (!showOnPrints || !visible) {
      setWarehousePrintResolver(null)
      return
    }
    const names = new Map(warehouses.map((w) => [w.id, w.name]))
    setWarehousePrintResolver((id) => names.get(String(id || defaultId)) || '')
    return () => setWarehousePrintResolver(null)
  }, [showOnPrints, visible, warehouses, defaultId])
  return null
}
