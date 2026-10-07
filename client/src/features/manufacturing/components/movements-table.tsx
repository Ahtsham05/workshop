import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeftRight } from 'lucide-react'
import {
  useGetMovementsQuery,
  type StockBucket,
  type StockMovement,
} from '@/stores/manufacturing.api'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Badge } from '@/components/ui/badge'
import { BUCKET_META, MOVEMENT_LABELS, fmtQty, refName } from '../lib/constants'
import { DataTable, type Column } from './data-table'
import { EmptyState } from './page'
import { Pager } from './pager'

const productLabel = (m: StockMovement) =>
  typeof m.productId === 'object' && m.productId ? m.productId.name : '—'
const batchLabel = (m: StockMovement) =>
  typeof m.batchId === 'object' && m.batchId ? m.batchId.batchNumber : null
const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

function Delta({ m }: { m: StockMovement }) {
  return (
    <span
      className={cn(
        'font-medium tabular-nums',
        m.quantityDelta < 0
          ? 'text-rose-600 dark:text-rose-400'
          : 'text-emerald-600 dark:text-emerald-400'
      )}
    >
      {m.quantityDelta > 0 ? '+' : ''}
      {fmtQty(m.quantityDelta)}{' '}
      <span className='text-muted-foreground text-xs font-normal'>
        {m.unit}
      </span>
    </span>
  )
}

function Movement({ m }: { m: StockMovement }) {
  const { t } = useLanguage()
  const bucket = BUCKET_META[m.stockBucket || 'available']
  return (
    <div className='flex items-center gap-1.5'>
      <Badge
        variant='outline'
        className={cn('h-5 px-1.5 text-[10px]', bucket.className)}
      >
        {t(bucket.label)}
      </Badge>
      <span>{t(MOVEMENT_LABELS[m.type] || m.type)}</span>
    </div>
  )
}

/**
 * Rows of the existing inventory ledger (InventoryTransaction) written by manufacturing —
 * every movement with its reference, bucket, item, batch/serials, location, user and time.
 */
export function MovementsTable({
  productionOrderId,
  bucket,
  showOrder = false,
  className,
}: {
  productionOrderId?: string
  bucket?: StockBucket
  showOrder?: boolean
  className?: string
}) {
  const { t } = useLanguage()
  const [page, setPage] = useState(1)
  const { data, isLoading, isFetching } = useGetMovementsQuery({
    productionOrderId,
    bucket,
    page,
    limit: 25,
  })

  const columns: Column<StockMovement>[] = [
    {
      id: 'when',
      header: t('When'),
      className: 'whitespace-nowrap',
      cell: (m) => (
        <span className='text-muted-foreground text-xs tabular-nums'>
          {when(m.createdAt)}
        </span>
      ),
    },
    {
      id: 'movement',
      header: t('Movement'),
      cell: (m) => <Movement m={m} />,
    },
    {
      id: 'item',
      header: t('Item'),
      cell: (m) => <span className='font-medium'>{productLabel(m)}</span>,
    },
    {
      id: 'qty',
      header: t('Qty'),
      align: 'right',
      cell: (m) => <Delta m={m} />,
    },
    {
      id: 'balance',
      header: t('Balance'),
      align: 'right',
      hideBelow: 'lg',
      cell: (m) => (
        <span className='text-muted-foreground tabular-nums'>
          {fmtQty(m.balanceAfter)}
        </span>
      ),
    },
    {
      id: 'tracking',
      header: t('Batch / serials'),
      hideBelow: 'lg',
      className: 'max-w-48',
      cell: (m) =>
        batchLabel(m) || m.serialNumbers?.length ? (
          <div className='text-xs'>
            {batchLabel(m) && (
              <span className='font-mono'>{batchLabel(m)}</span>
            )}
            {!!m.serialNumbers?.length && (
              <span
                className='text-muted-foreground block truncate font-mono'
                title={m.serialNumbers.join(', ')}
              >
                {m.serialNumbers.join(', ')}
              </span>
            )}
          </div>
        ) : (
          <span className='text-muted-foreground'>—</span>
        ),
    },
    {
      id: 'reference',
      header: t('Reference'),
      hideBelow: 'md',
      cell: (m) => (
        <div className='text-xs'>
          <div>{m.refType}</div>
          {showOrder && m.productionOrderId && (
            <Link
              to={
                `/manufacturing/production-orders/${m.productionOrderId}` as never
              }
              className='text-muted-foreground hover:text-foreground underline-offset-2 hover:underline'
            >
              {t('Open order')}
            </Link>
          )}
        </div>
      ),
    },
    {
      id: 'location',
      header: t('Location'),
      hideBelow: 'xl',
      cell: (m) => (
        <span className='text-muted-foreground text-xs'>
          {m.location || '—'}
        </span>
      ),
    },
    {
      id: 'by',
      header: t('By'),
      hideBelow: 'xl',
      cell: (m) => (
        <span className='text-muted-foreground text-xs'>
          {refName(m.createdBy) || '—'}
        </span>
      ),
    },
  ]

  return (
    <DataTable
      className={className}
      caption={t('Stock movements')}
      columns={columns}
      rows={data?.results}
      rowKey={(m) => m.id}
      loading={isLoading}
      fetching={isFetching}
      skeletonRows={5}
      empty={
        <EmptyState
          bordered={false}
          icon={ArrowLeftRight}
          title={t('No stock movements yet')}
          description={t(
            'Issues, returns, output, QC and scrap all write to this ledger.'
          )}
        />
      }
      mobileCard={(m) => (
        <div className='space-y-1.5'>
          <div className='flex items-start justify-between gap-3'>
            <span className='truncate font-medium'>{productLabel(m)}</span>
            <Delta m={m} />
          </div>
          <div className='text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs'>
            <Movement m={m} />
            <span className='tabular-nums'>{when(m.createdAt)}</span>
          </div>
        </div>
      )}
      footer={
        data && data.totalPages > 1 ? (
          <Pager data={data} page={page} onPageChange={setPage} />
        ) : undefined
      }
    />
  )
}
