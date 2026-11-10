import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, Download, Loader2, Search } from 'lucide-react'
import * as XLSX from 'xlsx'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SimplePagination } from '@/components/ui/simple-pagination'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { useGetWarehouseStockQuery, useLazyGetWarehouseStockQuery, type StockQuery, type StockRow } from '@/stores/warehouse.api'
import { WAREHOUSE_PERMS, colorOf, fmtQty, SHARED_STOCK_REFRESH_S } from '../lib/labels'
import { TransferDialog, type TransferPreset } from './transfer-dialog'

type Filter = NonNullable<StockQuery['filter']>
type Sort = NonNullable<StockQuery['sortBy']>

/**
 * warehouseId omitted → product × warehouse matrix (Stock by warehouse report).
 * warehouseId given   → that warehouse's stock with a per-bin breakdown.
 */
export function StockTab({ warehouseId }: { warehouseId?: string }) {
  const { t } = useLanguage()
  const { hasAnyPermission } = usePermissions()
  const canTransfer = hasAnyPermission(...WAREHOUSE_PERMS.transfer)
  const formatMoney = useFormatMoney()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [filter, setFilter] = useState<Filter>('in_stock')
  const [sortBy, setSortBy] = useState<Sort>('name')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [preset, setPreset] = useState<TransferPreset | null>(null)

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(search.trim())
      setPage(1)
    }, 250)
    return () => clearTimeout(id)
  }, [search])

  const query: StockQuery = { warehouseId, search: debounced || undefined, filter, sortBy, page, limit }
  const { data, isFetching } = useGetWarehouseStockQuery(query, { refetchOnMountOrArgChange: SHARED_STOCK_REFRESH_S })
  const [fetchAll, { isFetching: exporting }] = useLazyGetWarehouseStockQuery()
  const showCost = data?.totals.value !== undefined
  const warehouses = useMemo(() => (data?.warehouses || []).filter((w) => w.isActive || w.id === warehouseId), [data, warehouseId])
  const matrix = !warehouseId

  const exportExcel = async () => {
    const all = await fetchAll({ ...query, page: 1, limit: 1000 }).unwrap()
    const rows = all.results.map((r: StockRow) => {
      const base: Record<string, string | number> = { Product: r.name, SKU: r.sku, Barcode: r.barcode, Unit: r.unit }
      if (matrix) {
        all.warehouses.forEach((w) => {
          base[`${w.code} ${w.name}`] = r.byWarehouse[w.id] || 0
        })
        base['Branch total'] = r.branchQty
      } else {
        base.Quantity = r.quantity
        base.Bins = (r.locations || []).map((l) => `${l.path || 'No bin'}: ${l.quantity}`).join(', ')
      }
      if (r.value !== undefined) base.Value = r.value
      return base
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Stock')
    XLSX.writeFile(wb, `warehouse-stock-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between'>
        <div className='flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center'>
          <div className='relative w-full sm:w-72'>
            <Search className='absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search name, SKU or barcode…')} className='pl-8' />
          </div>
          <Select
            value={filter}
            onValueChange={(v) => {
              setFilter(v as Filter)
              setPage(1)
            }}
          >
            <SelectTrigger className='w-full sm:w-52'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='in_stock'>{t('With stock')}</SelectItem>
              <SelectItem value='all'>{t('All products')}</SelectItem>
              <SelectItem value='split'>{t('Spread over 2+ warehouses')}</SelectItem>
              <SelectItem value='negative'>{t('Negative (needs fixing)')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as Sort)}>
            <SelectTrigger className='w-full sm:w-44'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='name'>{t('Name A–Z')}</SelectItem>
              <SelectItem value='qty_desc'>{t('Most stock')}</SelectItem>
              <SelectItem value='qty_asc'>{t('Least stock')}</SelectItem>
              {showCost ? <SelectItem value='value_desc'>{t('Highest value')}</SelectItem> : null}
            </SelectContent>
          </Select>
        </div>
        <div className='flex items-center gap-3'>
          {data ? (
            <p className='text-sm text-muted-foreground'>
              {data.totals.products.toLocaleString()} {t('products')} · {fmtQty(data.totals.quantity)} {t('units')}
              {showCost ? ` · ${formatMoney(data.totals.value || 0)}` : ''}
            </p>
          ) : null}
          <Button variant='outline' size='sm' onClick={exportExcel} disabled={exporting || !data?.totalResults}>
            {exporting ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : <Download className='mr-2 h-4 w-4' />}
            {t('Excel')}
          </Button>
        </div>
      </div>

      <Card className='overflow-hidden p-0'>
        <div className='overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50 text-xs text-muted-foreground'>
              <tr>
                <th className='sticky left-0 z-10 min-w-[220px] bg-muted/95 px-4 py-2.5 text-left font-medium backdrop-blur'>{t('Product')}</th>
                {matrix ? (
                  <>
                    {warehouses.map((w) => (
                      <th key={w.id} className='min-w-[110px] px-3 py-2.5 text-right font-medium whitespace-nowrap'>
                        <span className='inline-flex items-center gap-1.5'>
                          <span className={cn('h-2 w-2 rounded-full', colorOf(w.color).dot)} />
                          {w.name}
                        </span>
                      </th>
                    ))}
                    <th className='px-3 py-2.5 text-right font-medium whitespace-nowrap'>{t('Branch total')}</th>
                  </>
                ) : (
                  <>
                    <th className='min-w-[200px] px-3 py-2.5 text-left font-medium'>{t('Where (bins)')}</th>
                    <th className='px-3 py-2.5 text-right font-medium'>{t('Quantity')}</th>
                  </>
                )}
                {showCost ? <th className='px-3 py-2.5 text-right font-medium'>{t('Value')}</th> : null}
                {canTransfer ? <th className='w-12 px-2 py-2.5' /> : null}
              </tr>
            </thead>
            <tbody>
              {isFetching && !data ? (
                <tr>
                  <td colSpan={20} className='py-10 text-center'>
                    <Loader2 className='mx-auto h-5 w-5 animate-spin text-muted-foreground' />
                  </td>
                </tr>
              ) : !data?.results.length ? (
                <tr>
                  <td colSpan={20} className='py-12 text-center text-muted-foreground'>
                    {debounced ? t('No product matches') : t('No stock here yet.')}
                  </td>
                </tr>
              ) : (
                data.results.map((r) => (
                  <tr key={`${r.productId}|${r.variantId || ''}`} className='border-t hover:bg-muted/30'>
                    <td className='sticky left-0 z-10 bg-background px-4 py-2'>
                      <p className='font-medium'>{r.name}</p>
                      <p className='text-xs text-muted-foreground'>{[r.sku, r.barcode].filter(Boolean).join(' · ') || r.category || '—'}</p>
                    </td>
                    {matrix ? (
                      <>
                        {warehouses.map((w) => {
                          const q = r.byWarehouse[w.id] || 0
                          return (
                            <td key={w.id} className={cn('px-3 py-2 text-right tabular-nums', q === 0 && 'text-muted-foreground/50', q < 0 && 'font-medium text-destructive')}>
                              {q === 0 ? '—' : fmtQty(q)}
                            </td>
                          )
                        })}
                        <td className='px-3 py-2 text-right font-medium tabular-nums'>
                          {fmtQty(r.branchQty)} <span className='text-xs font-normal text-muted-foreground'>{r.unit}</span>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className='px-3 py-2'>
                          <div className='flex flex-wrap gap-1'>
                            {(r.locations || []).map((l) => (
                              <span
                                key={l.locationId || 'top'}
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs',
                                  l.quantity < 0 ? 'border-destructive/40 text-destructive' : 'bg-muted/40'
                                )}
                              >
                                <span className='text-muted-foreground'>{l.path || t('No bin')}</span>
                                <span className='font-medium tabular-nums'>{fmtQty(l.quantity)}</span>
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className={cn('px-3 py-2 text-right font-medium tabular-nums', r.quantity < 0 && 'text-destructive')}>
                          {fmtQty(r.quantity)} <span className='text-xs font-normal text-muted-foreground'>{r.unit}</span>
                        </td>
                      </>
                    )}
                    {showCost ? <td className='px-3 py-2 text-right tabular-nums'>{formatMoney(r.value || 0)}</td> : null}
                    {canTransfer ? (
                      <td className='px-2 py-2 text-right'>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='h-8 w-8'
                          title={t('Move stock')}
                          onClick={() =>
                            setPreset({
                              fromWarehouseId: warehouseId || Object.entries(r.byWarehouse).sort((a, b) => b[1] - a[1])[0]?.[0],
                              product: { productId: r.productId, variantId: r.variantId, name: r.name, sku: r.sku, unit: r.unit },
                            })
                          }
                        >
                          <ArrowLeftRight className='h-4 w-4' />
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))
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

      <TransferDialog open={Boolean(preset)} onOpenChange={(o) => !o && setPreset(null)} preset={preset || undefined} />
    </div>
  )
}
