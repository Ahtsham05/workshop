import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ClipboardCheck } from 'lucide-react'
import {
  useGetOutputsQuery,
  useGetProductionOrderQuery,
  type ProductionOutput,
} from '@/stores/manufacturing.api'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { Button } from '@/components/ui/button'
import { CellStack, DataTable, type Column } from '../components/data-table'
import { InspectOutputDialog } from '../components/execution-dialogs'
import { FilterChips } from '../components/list-controls'
import { EmptyState, PageHeader } from '../components/page'
import { Pager } from '../components/pager'
import { fmtDate, fmtQty, refName } from '../lib/constants'

/** Quality check queue: reported output waiting for inspection, and the inspection history. */
export default function QualityPage() {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { hasPermission } = usePermissions()
  const canInspect = hasPermission('inspectProduction')
  const [view, setView] = useState<'pending_qc' | 'inspected'>('pending_qc')
  const [page, setPage] = useState(1)
  const [inspecting, setInspecting] = useState<ProductionOutput | null>(null)
  const { data, isLoading, isFetching } = useGetOutputsQuery({
    status: view,
    page,
    limit: 20,
  })
  // Pending count stays visible on the chip while browsing history.
  const { data: pending } = useGetOutputsQuery({
    status: 'pending_qc',
    page: 1,
    limit: 1,
  })
  const pendingView = view === 'pending_qc'

  const columns: Column<ProductionOutput>[] = [
    {
      id: 'output',
      header: t('Output'),
      className: 'w-44',
      cell: (o) => (
        <CellStack
          mono
          primary={o.outputNumber}
          secondary={`${fmtDate(o.reportedAt)} · ${refName(o.reportedBy) || '—'}`}
        />
      ),
    },
    {
      id: 'product',
      header: t('Product'),
      cell: (o) => (
        <div className='min-w-0'>
          <div className='truncate font-medium'>{o.productName}</div>
          <Link
            to={
              `/manufacturing/production-orders/${o.productionOrderId}` as never
            }
            className='text-muted-foreground font-mono text-xs hover:underline'
          >
            {o.orderNumber}
          </Link>
        </div>
      ),
    },
    {
      id: 'produced',
      header: t('Produced'),
      align: 'right',
      cell: (o) => (
        <span className='tabular-nums'>
          {fmtQty(o.producedQuantity)}{' '}
          <span className='text-muted-foreground text-xs'>{o.unit}</span>
        </span>
      ),
    },
    ...(!pendingView
      ? ([
          {
            id: 'good',
            header: t('Good'),
            align: 'right',
            cell: (o) => (
              <span className='text-emerald-600 tabular-nums dark:text-emerald-400'>
                {fmtQty(o.goodQuantity)}
              </span>
            ),
          },
          {
            id: 'rejected',
            header: t('Rejected'),
            align: 'right',
            hideBelow: 'md',
            cell: (o) => (
              <span
                className={cn(
                  'tabular-nums',
                  o.rejectedQuantity > 0 && 'text-rose-600 dark:text-rose-400'
                )}
              >
                {fmtQty(o.rejectedQuantity)}
                {o.rejectedQuantity > 0 && o.rejectDisposition && (
                  <span className='text-muted-foreground ml-1 text-xs'>
                    → {t(o.rejectDisposition)}
                  </span>
                )}
              </span>
            ),
          },
        ] satisfies Column<ProductionOutput>[])
      : []),
    {
      id: 'value',
      header: t('Value'),
      align: 'right',
      hideBelow: 'lg',
      cell: (o) => (
        <span className='tabular-nums'>{formatMoney(o.materialCost)}</span>
      ),
    },
    ...(pendingView && canInspect
      ? ([
          {
            id: 'action',
            header: <span className='sr-only'>{t('Actions')}</span>,
            align: 'right',
            className: 'w-28',
            cell: (o) => (
              <Button
                size='sm'
                className='h-8'
                onClick={() => setInspecting(o)}
              >
                {t('Inspect')}
              </Button>
            ),
          },
        ] satisfies Column<ProductionOutput>[])
      : []),
  ]

  return (
    <div className='space-y-5'>
      <PageHeader
        title={t('Quality check')}
        description={t(
          'Output reported from the floor waits here. Passing units go to finished stock; rejected units go to scrap or rework.'
        )}
      />
      <FilterChips
        label={t('Inspection status')}
        value={view}
        onChange={(v) => {
          setView(v as typeof view)
          setPage(1)
        }}
        options={[
          {
            value: 'pending_qc',
            label: t('Waiting for inspection'),
            count: pending?.totalResults,
            tone: 'warning',
          },
          { value: 'inspected', label: t('Inspected') },
        ]}
      />
      <DataTable
        caption={t('Quality check')}
        columns={columns}
        rows={data?.results}
        rowKey={(o) => o.id}
        loading={isLoading}
        fetching={isFetching}
        empty={
          <EmptyState
            bordered={false}
            icon={ClipboardCheck}
            title={
              pendingView
                ? t('Nothing waiting for inspection')
                : t('No inspections yet')
            }
            description={
              pendingView
                ? t(
                    'Output reported on an order appears here when quality check is required.'
                  )
                : undefined
            }
          />
        }
        mobileCard={(o) => (
          <div className='space-y-2'>
            <div className='flex items-start justify-between gap-3'>
              <div className='min-w-0'>
                <div className='truncate font-medium'>{o.productName}</div>
                <div className='text-muted-foreground font-mono text-xs'>
                  {o.outputNumber} · {o.orderNumber}
                </div>
              </div>
              <span className='shrink-0 text-sm tabular-nums'>
                {fmtQty(o.producedQuantity)} {o.unit}
              </span>
            </div>
            {pendingView && canInspect ? (
              <Button
                size='sm'
                className='h-9 w-full'
                onClick={() => setInspecting(o)}
              >
                {t('Inspect')}
              </Button>
            ) : (
              !pendingView && (
                <div className='text-muted-foreground text-xs tabular-nums'>
                  {t('Good')} {fmtQty(o.goodQuantity)} · {t('Rejected')}{' '}
                  {fmtQty(o.rejectedQuantity)}
                </div>
              )
            )}
          </div>
        )}
        footer={
          data && data.totalPages > 1 ? (
            <Pager data={data} page={page} onPageChange={setPage} />
          ) : undefined
        }
      />
      {inspecting && (
        <InspectFromQueue
          output={inspecting}
          onClose={() => setInspecting(null)}
        />
      )}
    </div>
  )
}

/** The inspection dialog needs the order (for finished-goods tracking inputs). */
function InspectFromQueue({
  output,
  onClose,
}: {
  output: ProductionOutput
  onClose: () => void
}) {
  const { data: order } = useGetProductionOrderQuery(output.productionOrderId)
  if (!order) return null
  return <InspectOutputDialog order={order} output={output} onClose={onClose} />
}
