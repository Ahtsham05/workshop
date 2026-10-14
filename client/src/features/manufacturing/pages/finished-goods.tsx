import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Network, PackageCheck } from 'lucide-react'
import {
  useGetProductionReceiptsQuery,
  type ProductionReceipt,
} from '@/stores/manufacturing.api'
import { useFormatMoney } from '@/lib/format-money'
import { useLanguage } from '@/context/language-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DateRangeFilter } from '@/components/filters/date-range-filter'
import { CellStack, DataTable, type Column } from '../components/data-table'
import { DetailSheet, SheetSection } from '../components/detail-sheet'
import { SearchField, Toolbar } from '../components/list-controls'
import { EmptyState, Field, PageHeader } from '../components/page'
import { Pager } from '../components/pager'
import { fmtDate, fmtQty, refName } from '../lib/constants'

function Tracking({ r }: { r: ProductionReceipt }) {
  const { t } = useLanguage()
  if (r.batchNumber) {
    return (
      <span className='font-mono text-xs'>
        {t('Batch')} {r.batchNumber}
      </span>
    )
  }
  if (r.serialNumbers?.length) {
    return (
      <span className='font-mono text-xs' title={r.serialNumbers.join(', ')}>
        {r.serialNumbers.length === 1
          ? r.serialNumbers[0]
          : t('{{n}} serials').replace('{{n}}', String(r.serialNumbers.length))}
      </span>
    )
  }
  return <span className='text-muted-foreground'>—</span>
}

export default function FinishedGoodsPage() {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 300)
  const [range, setRange] = useState<{ startDate?: string; endDate?: string }>(
    {}
  )
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<ProductionReceipt | null>(null)
  const { data, isLoading, isFetching } = useGetProductionReceiptsQuery({
    page,
    limit: 20,
    search: debounced || undefined,
    dateFrom: range.startDate,
    dateTo: range.endDate,
  })
  const filtered = !!debounced || !!range.startDate

  const columns: Column<ProductionReceipt>[] = [
    {
      id: 'receipt',
      header: t('Receipt'),
      className: 'w-40',
      cell: (r) => (
        <CellStack
          mono
          primary={r.receiptNumber}
          secondary={fmtDate(r.receiptDate)}
        />
      ),
    },
    {
      id: 'product',
      header: t('Product'),
      cell: (r) => (
        <div className='min-w-0'>
          <div className='truncate font-medium'>{r.productName}</div>
          <Link
            to={
              `/manufacturing/production-orders/${r.productionOrderId}` as never
            }
            onClick={(e) => e.stopPropagation()}
            className='text-muted-foreground font-mono text-xs hover:underline'
          >
            {r.orderNumber}
          </Link>
        </div>
      ),
    },
    {
      id: 'qty',
      header: t('Quantity'),
      align: 'right',
      cell: (r) => (
        <span className='tabular-nums'>
          +{fmtQty(r.quantity)}{' '}
          <span className='text-muted-foreground text-xs'>{r.unit}</span>
        </span>
      ),
    },
    {
      id: 'unitcost',
      header: t('Unit cost'),
      align: 'right',
      hideBelow: 'xl',
      cell: (r) => (
        <span className='text-muted-foreground tabular-nums'>
          {formatMoney(r.unitCost)}
        </span>
      ),
    },
    {
      id: 'value',
      header: t('Value'),
      align: 'right',
      hideBelow: 'md',
      cell: (r) => (
        <span className='tabular-nums'>{formatMoney(r.totalCost)}</span>
      ),
    },
    {
      id: 'tracking',
      header: t('Tracking'),
      hideBelow: 'lg',
      cell: (r) => (
        <div className='flex items-center gap-1.5'>
          <Tracking r={r} />
          {r.source === 'rework' && (
            <Badge
              variant='outline'
              className='h-5 px-1.5 text-[10px] font-normal'
            >
              {t('from rework')}
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: 'location',
      header: t('Location'),
      hideBelow: 'xl',
      cell: (r) => (
        <span className='text-muted-foreground'>{r.location || '—'}</span>
      ),
    },
  ]

  return (
    <div className='space-y-5'>
      <PageHeader
        title={t('Finished goods')}
        description={t(
          'Inspected good output received into stock, with its batch or serial numbers, valued at the material it consumed.'
        )}
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
          placeholder={t('Search receipt, order or product')}
        />
      </Toolbar>
      <DataTable
        caption={t('Finished goods')}
        columns={columns}
        rows={data?.results}
        rowKey={(r) => r.id}
        loading={isLoading}
        fetching={isFetching}
        onRowClick={setOpen}
        empty={
          <EmptyState
            bordered={false}
            icon={PackageCheck}
            title={
              filtered
                ? t('Nothing matches these filters')
                : t('No finished goods received yet')
            }
            description={
              filtered
                ? t('Try another date range or search.')
                : t(
                    'Good output from production and assembly orders lands here once it passes QC.'
                  )
            }
          />
        }
        mobileCard={(r) => (
          <div className='space-y-1'>
            <div className='flex items-start justify-between gap-3'>
              <div className='truncate font-medium'>{r.productName}</div>
              <span className='shrink-0 text-sm tabular-nums'>
                +{fmtQty(r.quantity)} {r.unit}
              </span>
            </div>
            <div className='text-muted-foreground flex justify-between gap-3 text-xs'>
              <span className='font-mono'>
                {r.receiptNumber} · {r.orderNumber}
              </span>
              <span>{fmtDate(r.receiptDate)}</span>
            </div>
          </div>
        )}
        footer={
          data && data.totalPages > 1 ? (
            <Pager data={data} page={page} onPageChange={setPage} />
          ) : undefined
        }
      />

      {open && (
        <DetailSheet
          open
          onOpenChange={(o) => !o && setOpen(null)}
          title={<span className='font-mono'>{open.receiptNumber}</span>}
          description={`${open.productName} · ${t('received into stock')}`}
          footer={
            <>
              {(open.batchId || !!open.imeiIds?.length) && (
                <Button asChild variant='outline'>
                  <Link
                    to={'/manufacturing/traceability' as never}
                    search={
                      (open.batchId
                        ? {
                            kind: 'batch',
                            id: open.batchId,
                            label: open.batchNumber,
                          }
                        : open.imeiIds?.length
                          ? {
                              kind: 'serial',
                              id: open.imeiIds[0],
                              label: open.serialNumbers?.[0],
                            }
                          : {
                              kind: 'order',
                              id: open.productionOrderId,
                              label: open.orderNumber,
                            }) as never
                    }
                  >
                    <Network className='mr-1.5 h-3.5 w-3.5' />
                    {t('Trace')}
                  </Link>
                </Button>
              )}
              <Button asChild>
                <Link
                  to={
                    `/manufacturing/production-orders/${open.productionOrderId}` as never
                  }
                >
                  {t('Open order')}
                  <ArrowRight className='ml-1.5 h-3.5 w-3.5' />
                </Link>
              </Button>
            </>
          }
        >
          <dl className='grid grid-cols-2 gap-4'>
            <Field label={t('Quantity')}>
              {fmtQty(open.quantity)} {open.unit}
            </Field>
            <Field label={t('Date')}>{fmtDate(open.receiptDate)}</Field>
            <Field label={t('Unit cost')}>{formatMoney(open.unitCost)}</Field>
            <Field label={t('Value')}>{formatMoney(open.totalCost)}</Field>
            <Field label={t('Order')}>{open.orderNumber}</Field>
            <Field label={t('Location')}>{open.location || '—'}</Field>
            <Field label={t('Received by')}>
              {refName(open.createdBy) || '—'}
            </Field>
            <Field label={t('Source')}>
              {open.source === 'rework' ? t('Rework') : t('Production')}
            </Field>
          </dl>
          {open.batchNumber && (
            <SheetSection title={t('Batch')}>
              <p className='font-mono text-sm'>{open.batchNumber}</p>
            </SheetSection>
          )}
          {!!open.serialNumbers?.length && (
            <SheetSection
              title={t('Serial numbers ({{n}})').replace(
                '{{n}}',
                String(open.serialNumbers.length)
              )}
            >
              <div className='flex flex-wrap gap-1.5'>
                {open.serialNumbers.map((sn) => (
                  <span
                    key={sn}
                    className='bg-muted rounded px-1.5 py-0.5 font-mono text-xs'
                  >
                    {sn}
                  </span>
                ))}
              </div>
            </SheetSection>
          )}
        </DetailSheet>
      )}
    </div>
  )
}
