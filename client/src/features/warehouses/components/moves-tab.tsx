import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Loader2, Search } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SimplePagination } from '@/components/ui/simple-pagination'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import { useGetWarehouseMovesQuery, useGetWarehousesQuery, type MoveType } from '@/stores/warehouse.api'
import { MOVE_TYPE_LABELS, fmtDateTime, fmtQty } from '../lib/labels'

const ALL = '__all__'

/** Every stock movement recorded against a warehouse: purchases in, sales out, transfers. */
export function MovesTab({ warehouseId: fixedWarehouse, productId }: { warehouseId?: string; productId?: string }) {
  const { t } = useLanguage()
  const { data: warehouses = [] } = useGetWarehousesQuery(undefined, { skip: Boolean(fixedWarehouse) })
  const [warehouseId, setWarehouseId] = useState(ALL)
  const [moveType, setMoveType] = useState(ALL)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(id)
  }, [search])

  const { data, isFetching } = useGetWarehouseMovesQuery({
    warehouseId: fixedWarehouse || (warehouseId === ALL ? undefined : warehouseId),
    moveType: moveType === ALL ? undefined : (moveType as MoveType),
    productId,
    search: debounced || undefined,
    page,
    limit,
  })

  const refLink = (refType: string, number: string) => {
    if (refType === 'Invoice') return { label: t('Invoice'), to: '/invoice' as const, number }
    if (refType === 'Purchase') return { label: t('Purchase'), to: '/purchase-invoice' as const, number }
    if (refType === 'SalesReturn') return { label: t('Sales return'), to: '/sales-returns' as const, number }
    if (refType === 'PurchaseReturn') return { label: t('Purchase return'), to: '/purchase-returns' as const, number }
    if (refType === 'StockAdjustment') return { label: t('Adjustment'), to: '/stock-adjustments' as const, number }
    if (refType === 'InventoryTransfer') return { label: t('Branch transfer'), to: '/stock-transfer' as const, number }
    return { label: t('Transfer'), to: null, number }
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center'>
        <div className='relative w-full sm:w-64'>
          <Search className='absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Product or document number…')} className='pl-8' />
        </div>
        {!fixedWarehouse ? (
          <Select
            value={warehouseId}
            onValueChange={(v) => {
              setWarehouseId(v)
              setPage(1)
            }}
          >
            <SelectTrigger className='w-full sm:w-52'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('All warehouses')}</SelectItem>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Select
          value={moveType}
          onValueChange={(v) => {
            setMoveType(v)
            setPage(1)
          }}
        >
          <SelectTrigger className='w-full sm:w-48'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('All movements')}</SelectItem>
            {Object.entries(MOVE_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {t(label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className='overflow-hidden p-0'>
        <div className='overflow-x-auto'>
          <table className='w-full min-w-[760px] text-sm'>
            <thead className='bg-muted/50 text-xs text-muted-foreground'>
              <tr>
                <th className='px-4 py-2.5 text-left font-medium'>{t('Date')}</th>
                <th className='px-4 py-2.5 text-left font-medium'>{t('Document')}</th>
                <th className='px-4 py-2.5 text-left font-medium'>{t('Product')}</th>
                <th className='px-4 py-2.5 text-left font-medium'>{t('Warehouse / bin')}</th>
                <th className='px-4 py-2.5 text-left font-medium'>{t('From / to')}</th>
                <th className='px-4 py-2.5 text-right font-medium'>{t('Quantity')}</th>
              </tr>
            </thead>
            <tbody>
              {isFetching && !data ? (
                <tr>
                  <td colSpan={6} className='py-10 text-center'>
                    <Loader2 className='mx-auto h-5 w-5 animate-spin text-muted-foreground' />
                  </td>
                </tr>
              ) : !data?.results.length ? (
                <tr>
                  <td colSpan={6} className='py-12 text-center text-muted-foreground'>
                    {t('No stock movements yet.')}
                  </td>
                </tr>
              ) : (
                data.results.map((m) => {
                  const ref = refLink(m.refType, m.refNumber)
                  return (
                    <tr key={m.id} className='border-t'>
                      <td className='px-4 py-2.5 whitespace-nowrap'>{fmtDateTime(m.date)}</td>
                      <td className='px-4 py-2.5'>
                        <p className='text-xs text-muted-foreground'>{t(MOVE_TYPE_LABELS[m.moveType])}</p>
                        {ref.to ? (
                          <Link to={ref.to} className='font-mono text-xs font-medium text-primary hover:underline'>
                            {ref.number || ref.label}
                          </Link>
                        ) : (
                          <span className='font-mono text-xs font-medium'>{ref.number}</span>
                        )}
                      </td>
                      <td className='px-4 py-2.5'>
                        <p className='font-medium'>{m.productId?.name || '—'}</p>
                        {m.productId?.sku ? <p className='text-xs text-muted-foreground'>{m.productId.sku}</p> : null}
                      </td>
                      <td className='px-4 py-2.5'>
                        {m.warehouseId?.name || '—'}
                        {m.locationId?.path ? <span className='text-muted-foreground'> / {m.locationId.path}</span> : null}
                      </td>
                      <td className='px-4 py-2.5 text-muted-foreground'>
                        {m.counterpartWarehouseId ? (
                          <>
                            {m.quantity < 0 ? `${t('to')} ` : `${t('from')} `}
                            {m.counterpartWarehouseId.name}
                            {m.counterpartLocationId?.path ? ` / ${m.counterpartLocationId.path}` : ''}
                          </>
                        ) : m.refType === 'Invoice' || m.refType === 'SalesReturn' ? (
                          t('Customer')
                        ) : m.refType === 'Purchase' || m.refType === 'PurchaseReturn' ? (
                          t('Supplier')
                        ) : m.refType === 'InventoryTransfer' ? (
                          t('Other branch')
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={cn('px-4 py-2.5 text-right font-medium tabular-nums', m.quantity < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
                        {m.quantity > 0 ? '+' : ''}
                        {fmtQty(m.quantity)} {m.productId?.unit || ''}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {data && data.totalResults > 0 ? (
        <SimplePagination
          currentPage={data.page}
          totalPages={data.totalPages}
          totalResults={data.totalResults}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={(l) => {
            setLimit(l)
            setPage(1)
          }}
          pageSizeOptions={[25, 50, 100, 200]}
        />
      ) : null}
    </div>
  )
}
