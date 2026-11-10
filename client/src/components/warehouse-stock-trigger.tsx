import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Loader2, MapPin, Warehouse as WarehouseIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useWarehousePicker } from '@/components/warehouse-field'
import { cn } from '@/lib/utils'
import { useLazyGetProductWarehousesQuery } from '@/stores/warehouse.api'

/**
 * "Warehouses" pill beside a product's stock: opens how much of this product / variant each
 * warehouse — and each bin inside it — holds. Fetches only when opened. Renders nothing
 * while warehouses are off or the branch has a single warehouse.
 */
export function WarehouseStockTrigger({
  productId,
  variantId,
  itemName,
  className,
  iconOnly = false,
}: {
  productId?: string
  variantId?: string | null
  itemName?: string
  className?: string
  iconOnly?: boolean
}) {
  const { visible } = useWarehousePicker('any')
  const [open, setOpen] = useState(false)
  const [fetchBreakdown, { data, isFetching, isError }] = useLazyGetProductWarehousesQuery()
  if (!visible || !productId) return null

  const openDialog = () => {
    setOpen(true)
    fetchBreakdown({ productId, variantId })
  }
  const rows = (data?.warehouses || []).filter((w) => w.isActive || w.quantity !== 0)

  return (
    <>
      <button
        type='button'
        title={iconOnly ? 'Stock per warehouse' : undefined}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          openDialog()
        }}
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          iconOnly ? 'p-1' : 'px-1.5 py-0.5',
          className
        )}
      >
        <WarehouseIcon className='h-2.5 w-2.5' />
        {iconOnly ? null : 'Warehouses'}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='sm:max-w-md' onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2 text-base'>
              <WarehouseIcon className='h-4 w-4 text-primary' />
              Stock per warehouse
            </DialogTitle>
            <DialogDescription className='truncate'>
              {itemName || data?.name}
              {data ? ` · Branch total ${data.branchQty}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className='max-h-[380px] space-y-1.5 overflow-y-auto'>
            {isFetching && !data ? (
              <div className='flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground'>
                <Loader2 className='h-4 w-4 animate-spin' /> Loading…
              </div>
            ) : isError ? (
              <div className='py-8 text-center text-sm text-muted-foreground'>Couldn't load warehouse stock. Try again.</div>
            ) : (
              rows.map((w) => (
                <Link
                  key={w.id}
                  to='/warehouses/$warehouseId'
                  params={{ warehouseId: w.id }}
                  className='block rounded-lg border px-3 py-2 transition hover:bg-muted/40'
                  onClick={() => setOpen(false)}
                >
                  <div className='flex items-center justify-between gap-2'>
                    <span className='min-w-0 truncate text-sm font-medium'>
                      {w.name}
                      {w.isDefault ? <span className='ml-1.5 text-[10px] font-normal text-muted-foreground'>Default</span> : null}
                    </span>
                    <span
                      className={cn(
                        'text-sm font-semibold tabular-nums',
                        w.quantity < 0 ? 'text-red-600' : w.quantity === 0 ? 'text-muted-foreground' : 'text-green-600'
                      )}
                    >
                      {w.quantity}
                    </span>
                  </div>
                  {w.locations.length ? (
                    <div className='mt-1 flex flex-wrap gap-1'>
                      {w.locations.map((l) => (
                        <span key={l.locationId} className='inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground'>
                          <MapPin className='h-2.5 w-2.5' />
                          {l.path}: <b className='font-medium text-foreground'>{l.quantity}</b>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </Link>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
