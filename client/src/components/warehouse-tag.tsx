import { Warehouse as WarehouseIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWarehousePicker } from '@/components/warehouse-field'

/**
 * Small "which warehouse" chip for document lists. Shows only while warehouses are on and
 * the document used a warehouse other than the default (the default is the norm, so
 * printing it on every row would just be noise).
 */
export function WarehouseTag({ warehouseId, className }: { warehouseId?: string | { id?: string; _id?: string } | null; className?: string }) {
  const { visible, warehouses, defaultId } = useWarehousePicker('any')
  const id = typeof warehouseId === 'string' ? warehouseId : warehouseId?.id || warehouseId?._id || ''
  if (!visible || !id || id === defaultId) return null
  const wh = warehouses.find((w) => w.id === id)
  if (!wh) return null
  return (
    <span className={cn('inline-flex max-w-[160px] items-center gap-1 truncate rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground', className)} title={wh.name}>
      <WarehouseIcon className='h-3 w-3 shrink-0' />
      <span className='truncate'>{wh.name}</span>
    </span>
  )
}
