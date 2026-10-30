import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { PackagePlus, Plus } from 'lucide-react'
import {
  useGetMaterialReceiptsQuery,
  type MaterialReceipt,
} from '@/stores/manufacturing.api'
import { formatTotalsByUnit } from '@/lib/units'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DateRangeFilter } from '@/components/filters/date-range-filter'
import { useFormatMoney } from '@/features/manufacturing/lib/use-mfg-money'
import { CellStack, DataTable, type Column } from '../components/data-table'
import { FilterChips, SearchField, Toolbar } from '../components/list-controls'
import { EmptyState, PageHeader } from '../components/page'
import { Pager } from '../components/pager'
import { fmtDate } from '../lib/constants'

const LIST = '/manufacturing/material-receipts'

function StatusBadge({ v }: { v: MaterialReceipt }) {
  const { t } = useLanguage()
  return (
    <Badge
      variant='outline'
      className={cn(
        'h-5 px-1.5 text-[10px] font-medium',
        v.status === 'confirmed'
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : v.status === 'draft'
            ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
            : 'text-muted-foreground'
      )}
    >
      {v.status === 'confirmed'
        ? t('Posted')
        : v.status === 'draft'
          ? t('Draft')
          : t('Cancelled')}
    </Badge>
  )
}

/** Raw material receipt vouchers (RMV): drafts and posted receipts. */
export default function MaterialReceiptsPage() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const formatMoney = useFormatMoney()
  const { hasPermission } = usePermissions()
  const canCreate = hasPermission('createPurchases')
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 300)
  const [status, setStatus] = useState<'all' | 'draft' | 'confirmed'>('all')
  const [range, setRange] = useState<{ startDate?: string; endDate?: string }>(
    {}
  )
  const [page, setPage] = useState(1)
  const { data, isLoading, isFetching } = useGetMaterialReceiptsQuery({
    page,
    limit: 20,
    search: debounced || undefined,
    status: status === 'all' ? undefined : status,
    dateFrom: range.startDate,
    dateTo: range.endDate,
  })
  const filtered = !!debounced || status !== 'all' || !!range.startDate
  const open = (v: MaterialReceipt) =>
    navigate({ to: `${LIST}/${v.id}` as never })

  const columns: Column<MaterialReceipt>[] = [
    {
      id: 'voucher',
      header: t('Voucher'),
      className: 'w-44',
      cell: (v) => (
        <div className='space-y-1'>
          <div className='flex items-center gap-1.5'>
            <Link
              to={`${LIST}/${v.id}` as never}
              onClick={(e) => e.stopPropagation()}
              className='font-mono text-xs font-medium hover:underline'
            >
              {v.voucherNumber}
            </Link>
            <StatusBadge v={v} />
          </div>
          <div className='text-muted-foreground text-xs tabular-nums'>
            {fmtDate(v.date)}
          </div>
        </div>
      ),
    },
    {
      id: 'supplier',
      header: t('Supplier'),
      cell: (v) => (
        <CellStack
          primary={v.supplierName || '—'}
          secondary={
            [v.purchaseOrderNumber, v.reference].filter(Boolean).join(' · ') ||
            undefined
          }
        />
      ),
    },
    {
      id: 'items',
      header: t('Items'),
      hideBelow: 'md',
      cell: (v) => (
        <CellStack
          primary={
            <span className='font-normal'>
              {v.lines[0]?.productName || '—'}
            </span>
          }
          secondary={`${v.totals.items} ${t('item(s)')} · ${formatTotalsByUnit(v.lines)}`}
        />
      ),
    },
    {
      id: 'purchase',
      header: t('Purchase'),
      hideBelow: 'lg',
      cell: (v) => (
        <span className='text-muted-foreground font-mono text-xs'>
          {v.purchaseInvoiceNumber || '—'}
        </span>
      ),
    },
    {
      id: 'total',
      header: t('Grand total'),
      align: 'right',
      cell: (v) => (
        <span className='tabular-nums'>{formatMoney(v.totals.grandTotal)}</span>
      ),
    },
  ]

  return (
    <div className='space-y-5'>
      <PageHeader
        title={t('Raw material receipts')}
        description={t(
          'Raw materials, components and packaging received from suppliers. Drafts don’t change stock; a posted receipt adds the stock and the supplier’s bill.'
        )}
        actions={
          canCreate ? (
            <Button asChild>
              <Link to={`${LIST}/new` as never}>
                <Plus className='mr-2 h-4 w-4' />
                {t('New receipt')}
              </Link>
            </Button>
          ) : undefined
        }
      />
      <Toolbar
        end={
          <DateRangeFilter
            startDate={range.startDate}
            endDate={range.endDate}
            onChange={(r) => {
              setRange(r)
              setPage(1)
            }}
          />
        }
      >
        <SearchField
          value={search}
          onChange={(v) => {
            setSearch(v)
            setPage(1)
          }}
          placeholder={t('Search voucher, supplier, reference or item')}
        />
        <FilterChips
          label={t('Filter by status')}
          value={status}
          onChange={(v) => {
            setStatus(v as typeof status)
            setPage(1)
          }}
          options={[
            { value: 'all', label: t('All') },
            { value: 'draft', label: t('Drafts') },
            { value: 'confirmed', label: t('Posted') },
          ]}
        />
      </Toolbar>
      <DataTable
        caption={t('Raw material receipts')}
        columns={columns}
        rows={data?.results}
        rowKey={(v) => v.id}
        loading={isLoading}
        fetching={isFetching}
        onRowClick={open}
        empty={
          <EmptyState
            bordered={false}
            icon={PackagePlus}
            title={
              filtered
                ? t('Nothing matches these filters')
                : t('No receipts yet')
            }
            description={
              filtered
                ? t('Try another status, date range or search.')
                : t(
                    'Receive raw materials from a supplier with a new receipt voucher.'
                  )
            }
          />
        }
        mobileCard={(v) => (
          <div className='space-y-1.5'>
            <div className='flex items-center justify-between gap-3'>
              <div className='flex items-center gap-1.5'>
                <span className='font-mono text-xs font-medium'>
                  {v.voucherNumber}
                </span>
                <StatusBadge v={v} />
              </div>
              <span className='text-sm tabular-nums'>
                {formatMoney(v.totals.grandTotal)}
              </span>
            </div>
            <div className='text-muted-foreground truncate text-xs'>
              {v.supplierName || '—'} · {fmtDate(v.date)} · {v.totals.items}{' '}
              {t('item(s)')}
            </div>
          </div>
        )}
        footer={
          data && data.totalPages > 1 ? (
            <Pager data={data} page={page} onPageChange={setPage} />
          ) : undefined
        }
      />
    </div>
  )
}
