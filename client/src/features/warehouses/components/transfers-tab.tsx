import { useEffect, useState } from 'react'
import { ArrowRight, Loader2, Plus, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { SimplePagination } from '@/components/ui/simple-pagination'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { cn } from '@/lib/utils'
import { useGetTransfersQuery, type TransferStatus, type WarehouseTransfer } from '@/stores/warehouse.api'
import { TRANSFER_STATUS_META, WAREHOUSE_PERMS, fmtDate, fmtQty } from '../lib/labels'
import { TransferDialog, type TransferPreset } from './transfer-dialog'
import { TransferSheet } from './transfer-sheet'

const STATUS_FILTERS: { value: TransferStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
]

export function TransfersTab({ warehouseId, preset }: { warehouseId?: string; preset?: TransferPreset }) {
  const { t } = useLanguage()
  const { hasAnyPermission } = usePermissions()
  const canTransfer = hasAnyPermission(...WAREHOUSE_PERMS.transfer)
  const [status, setStatus] = useState<TransferStatus | ''>('')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [openId, setOpenId] = useState<string | null>(null)
  const [editing, setEditing] = useState<WarehouseTransfer | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(id)
  }, [search])

  const { data, isFetching } = useGetTransfersQuery({ status: status || undefined, warehouseId, search: debounced || undefined, page, limit })

  return (
    <div className='space-y-4'>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex flex-wrap items-center gap-2'>
          <div className='flex rounded-lg border p-0.5'>
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value || 'all'}
                type='button'
                onClick={() => {
                  setStatus(f.value)
                  setPage(1)
                }}
                className={cn('rounded-md px-3 py-1 text-sm', status === f.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
              >
                {t(f.label)}
              </button>
            ))}
          </div>
          <div className='relative w-full sm:w-64'>
            <Search className='absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Number, reference or product…')} className='pl-8' />
          </div>
        </div>
        {canTransfer ? (
          <Button onClick={() => setCreating(true)}>
            <Plus className='mr-2 h-4 w-4' />
            {t('New transfer')}
          </Button>
        ) : null}
      </div>

      <Card className='overflow-hidden p-0'>
        <div className='overflow-x-auto'>
          <table className='w-full min-w-[640px] text-sm'>
            <thead className='bg-muted/50 text-xs text-muted-foreground'>
              <tr>
                <th className='px-4 py-2.5 text-left font-medium'>{t('Number')}</th>
                <th className='px-4 py-2.5 text-left font-medium'>{t('Date')}</th>
                <th className='px-4 py-2.5 text-left font-medium'>{t('From → To')}</th>
                <th className='px-4 py-2.5 text-right font-medium'>{t('Products')}</th>
                <th className='px-4 py-2.5 text-right font-medium'>{t('Quantity')}</th>
                <th className='px-4 py-2.5 text-left font-medium'>{t('Status')}</th>
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
                    {t('No transfers yet.')}
                  </td>
                </tr>
              ) : (
                data.results.map((tr) => {
                  const meta = TRANSFER_STATUS_META[tr.status]
                  return (
                    <tr key={tr.id} className='cursor-pointer border-t hover:bg-muted/40' onClick={() => setOpenId(tr.id)}>
                      <td className='px-4 py-2.5 font-mono text-xs font-medium'>{tr.number}</td>
                      <td className='px-4 py-2.5 whitespace-nowrap'>{fmtDate(tr.date)}</td>
                      <td className='px-4 py-2.5'>
                        <span className='flex items-center gap-1.5'>
                          <span className='truncate'>
                            {tr.fromWarehouseId?.name}
                            {tr.fromLocationId?.path ? <span className='text-muted-foreground'> / {tr.fromLocationId.path}</span> : null}
                          </span>
                          <ArrowRight className='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
                          <span className='truncate'>
                            {tr.toWarehouseId?.name}
                            {tr.toLocationId?.path ? <span className='text-muted-foreground'> / {tr.toLocationId.path}</span> : null}
                          </span>
                        </span>
                      </td>
                      <td className='px-4 py-2.5 text-right tabular-nums'>{tr.lines.length}</td>
                      <td className='px-4 py-2.5 text-right tabular-nums'>{fmtQty(tr.totalQuantity)}</td>
                      <td className='px-4 py-2.5'>
                        <Badge variant='outline' className={meta.className}>
                          {t(meta.label)}
                        </Badge>
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
        />
      ) : null}

      <TransferSheet
        transferId={openId}
        onOpenChange={(o) => !o && setOpenId(null)}
        onEdit={(tr) => {
          setOpenId(null)
          setEditing(tr)
        }}
      />
      <TransferDialog
        open={creating || Boolean(editing)}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false)
            setEditing(null)
          }
        }}
        transfer={editing}
        preset={preset}
        onSaved={(tr) => setOpenId(tr.id)}
      />
    </div>
  )
}
