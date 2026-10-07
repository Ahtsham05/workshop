import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Plus, Recycle } from 'lucide-react'
import {
  useGetScrapRecordsQuery,
  type ScrapReason,
  type ScrapRecord,
  type ScrapStage,
} from '@/stores/manufacturing.api'
import { useFormatMoney } from '@/lib/format-money'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CellStack, DataTable, type Column } from '../components/data-table'
import { RecordScrapDialog } from '../components/execution-dialogs'
import { FilterChips, SearchField, Toolbar } from '../components/list-controls'
import { EmptyState, PageHeader } from '../components/page'
import { Pager } from '../components/pager'
import {
  SCRAP_REASON_LABELS,
  SCRAP_STAGE_LABELS,
  fmtDate,
  fmtQty,
} from '../lib/constants'

export default function ScrapPage() {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { hasPermission } = usePermissions()
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 300)
  const [stage, setStage] = useState<string>('all')
  const [reason, setReason] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [recording, setRecording] = useState(false)
  const { data, isLoading, isFetching } = useGetScrapRecordsQuery({
    page,
    limit: 20,
    search: debounced || undefined,
    ...(stage !== 'all' ? { stage: stage as ScrapStage } : {}),
    ...(reason !== 'all' ? { reason: reason as ScrapReason } : {}),
  })
  const filtered = !!debounced || stage !== 'all' || reason !== 'all'

  const columns: Column<ScrapRecord>[] = [
    {
      id: 'scrap',
      header: t('Record'),
      className: 'w-36',
      cell: (s) => (
        <CellStack
          mono
          primary={s.scrapNumber}
          secondary={fmtDate(s.scrapDate)}
        />
      ),
    },
    {
      id: 'product',
      header: t('Product'),
      cell: (s) => (
        <div className='min-w-0'>
          <div className='truncate font-medium'>{s.productName}</div>
          {s.productionOrderId ? (
            <Link
              to={
                `/manufacturing/production-orders/${s.productionOrderId}` as never
              }
              className='text-muted-foreground font-mono text-xs hover:underline'
            >
              {s.orderNumber}
            </Link>
          ) : (
            <span className='text-muted-foreground text-xs'>
              {t('No order')}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'stage',
      header: t('Stage'),
      hideBelow: 'md',
      cell: (s) => (
        <div className='flex flex-wrap items-center gap-1.5'>
          <span>{t(SCRAP_STAGE_LABELS[s.stage])}</span>
          {s.affectsStock && (
            <Badge
              variant='outline'
              className='h-5 px-1.5 text-[10px] font-normal'
            >
              {t('stock deducted')}
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: 'reason',
      header: t('Reason'),
      hideBelow: 'lg',
      cell: (s) => (
        <span className='text-muted-foreground'>
          {t(SCRAP_REASON_LABELS[s.reason])}
        </span>
      ),
    },
    {
      id: 'qty',
      header: t('Quantity'),
      align: 'right',
      cell: (s) => (
        <span className='tabular-nums'>
          {fmtQty(s.quantity)}{' '}
          <span className='text-muted-foreground text-xs'>{s.unit}</span>
        </span>
      ),
    },
    {
      id: 'value',
      header: t('Value'),
      align: 'right',
      cell: (s) => (
        <span className='text-rose-600 tabular-nums dark:text-rose-400'>
          {formatMoney(s.totalCost)}
        </span>
      ),
    },
  ]

  return (
    <div className='space-y-5'>
      <PageHeader
        title={t('Scrap')}
        description={t(
          'Manufacturing losses by stage and reason. Material and WIP scrap is recorded against an order; finished-stock scrap also deducts stock.'
        )}
        actions={
          hasPermission('executeProduction') && (
            <Button variant='outline' onClick={() => setRecording(true)}>
              <Plus className='mr-1.5 h-4 w-4' />
              {t('Write off finished stock')}
            </Button>
          )
        }
      />
      <div className='space-y-3'>
        <Toolbar
          end={
            <Select
              value={reason}
              onValueChange={(v) => {
                setReason(v)
                setPage(1)
              }}
            >
              <SelectTrigger
                className='h-9 w-44 max-sm:w-full'
                aria-label={t('Reason')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>{t('All reasons')}</SelectItem>
                {(Object.keys(SCRAP_REASON_LABELS) as ScrapReason[]).map(
                  (r) => (
                    <SelectItem key={r} value={r}>
                      {t(SCRAP_REASON_LABELS[r])}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          }
        >
          <SearchField
            value={search}
            onChange={(v) => {
              setSearch(v)
              setPage(1)
            }}
            placeholder={t('Search record, order or product')}
          />
        </Toolbar>
        <FilterChips
          label={t('Filter by stage')}
          value={stage}
          onChange={(v) => {
            setStage(v)
            setPage(1)
          }}
          options={[
            { value: 'all', label: t('All stages') },
            ...(Object.keys(SCRAP_STAGE_LABELS) as ScrapStage[]).map((st) => ({
              value: st,
              label: t(SCRAP_STAGE_LABELS[st]),
            })),
          ]}
        />
      </div>
      <DataTable
        caption={t('Scrap')}
        columns={columns}
        rows={data?.results}
        rowKey={(s) => s.id}
        loading={isLoading}
        fetching={isFetching}
        empty={
          <EmptyState
            bordered={false}
            icon={Recycle}
            title={
              filtered
                ? t('Nothing matches these filters')
                : t('No scrap recorded')
            }
            description={
              filtered
                ? t('Try another stage, reason or search.')
                : t(
                    'Record scrap from a production order, or write off finished stock here.'
                  )
            }
          />
        }
        mobileCard={(s) => (
          <div className='space-y-1'>
            <div className='flex items-start justify-between gap-3'>
              <div className='truncate font-medium'>{s.productName}</div>
              <span className='shrink-0 text-sm text-rose-600 tabular-nums dark:text-rose-400'>
                {formatMoney(s.totalCost)}
              </span>
            </div>
            <div className='text-muted-foreground text-xs'>
              {fmtQty(s.quantity)} {s.unit} · {t(SCRAP_STAGE_LABELS[s.stage])} ·{' '}
              {t(SCRAP_REASON_LABELS[s.reason])}
            </div>
          </div>
        )}
        footer={
          data && data.totalPages > 1 ? (
            <Pager data={data} page={page} onPageChange={setPage} />
          ) : undefined
        }
      />
      {recording && <RecordScrapDialog onClose={() => setRecording(false)} />}
    </div>
  )
}
