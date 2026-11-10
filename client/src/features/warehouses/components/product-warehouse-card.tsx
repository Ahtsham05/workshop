import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeftRight, Warehouse as WarehouseIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useWarehousePicker } from '@/components/warehouse-field'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { cn } from '@/lib/utils'
import { useGetProductWarehousesQuery } from '@/stores/warehouse.api'
import { WAREHOUSE_PERMS, colorOf, fmtQty } from '../lib/labels'
import { TransferDialog } from './transfer-dialog'

/** Product page: how much of this product each warehouse (and bin) holds. */
export function ProductWarehouseCard({ productId, productName, unit, hasVariants }: { productId: string; productName: string; unit?: string; hasVariants?: boolean }) {
  const { t } = useLanguage()
  const { visible } = useWarehousePicker('any')
  const { hasAnyPermission } = usePermissions()
  const canView = hasAnyPermission(...WAREHOUSE_PERMS.view)
  const canTransfer = hasAnyPermission(...WAREHOUSE_PERMS.transfer)
  const { data } = useGetProductWarehousesQuery(productId, { skip: !visible || !canView || !productId })
  const [moving, setMoving] = useState(false)

  if (!visible || !canView || !data) return null
  const shown = data.warehouses.filter((w) => w.isActive || w.quantity !== 0)
  const max = Math.max(1, ...shown.map((w) => Math.abs(w.quantity)))

  return (
    <Card className='gap-3'>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-0'>
        <CardTitle className='flex items-center gap-2 text-base'>
          <WarehouseIcon className='h-4 w-4 text-primary' />
          {t('Stock by warehouse')}
          <span className='text-sm font-normal text-muted-foreground'>
            · {t('Branch total')} {fmtQty(data.branchQty)} {unit || ''}
          </span>
        </CardTitle>
        {canTransfer ? (
          <Button variant='outline' size='sm' onClick={() => setMoving(true)}>
            <ArrowLeftRight className='mr-1.5 h-3.5 w-3.5' />
            {t('Move stock')}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className='grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3'>
        {shown.map((w) => {
          const c = colorOf(w.color)
          return (
            <Link
              key={w.id}
              to='/warehouses/$warehouseId'
              params={{ warehouseId: w.id }}
              className='rounded-lg border p-3 transition hover:bg-muted/40'
            >
              <div className='flex items-center justify-between gap-2'>
                <span className='flex min-w-0 items-center gap-2'>
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', c.dot)} />
                  <span className='truncate text-sm font-medium'>{w.name}</span>
                  {w.isDefault ? <span className='text-[10px] text-muted-foreground'>{t('Default')}</span> : null}
                </span>
                <span className={cn('text-sm font-semibold tabular-nums', w.quantity < 0 && 'text-destructive', w.quantity === 0 && 'text-muted-foreground')}>
                  {fmtQty(w.quantity)}
                </span>
              </div>
              <div className='mt-2 h-1 overflow-hidden rounded-full bg-muted'>
                <div className={cn('h-full rounded-full', c.dot)} style={{ width: `${Math.max(0, (w.quantity / max) * 100)}%` }} />
              </div>
              {w.locations.length ? (
                <p className='mt-1.5 truncate text-[11px] text-muted-foreground'>
                  {w.locations.map((l) => `${l.path}: ${fmtQty(l.quantity)}`).join(' · ')}
                </p>
              ) : null}
            </Link>
          )
        })}
      </CardContent>
      <TransferDialog
        open={moving}
        onOpenChange={setMoving}
        preset={{
          fromWarehouseId: [...shown].sort((a, b) => b.quantity - a.quantity)[0]?.id,
          // A product with variants: the variant is picked in the dialog.
          product: hasVariants ? undefined : { productId, name: productName, unit },
        }}
      />
    </Card>
  )
}
