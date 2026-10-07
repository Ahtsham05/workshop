import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  useGetMovementsQuery,
  type StockBucket,
  type StockMovement,
} from '@/stores/manufacturing.api'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { BUCKET_META, MOVEMENT_LABELS, fmtQty, refName } from '../lib/constants'
import { Pager } from './pager'

const productLabel = (m: StockMovement) =>
  typeof m.productId === 'object' && m.productId ? m.productId.name : '—'
const batchLabel = (m: StockMovement) =>
  typeof m.batchId === 'object' && m.batchId ? m.batchId.batchNumber : null

/**
 * Rows of the existing inventory ledger (InventoryTransaction) written by manufacturing —
 * every movement with its reference, bucket, item, batch/serials, location, user and time.
 */
export function MovementsTable({
  productionOrderId,
  bucket,
  showOrder = false,
}: {
  productionOrderId?: string
  bucket?: StockBucket
  showOrder?: boolean
}) {
  const { t } = useLanguage()
  const [page, setPage] = useState(1)
  const { data, isLoading } = useGetMovementsQuery({
    productionOrderId,
    bucket,
    page,
    limit: 25,
  })
  const rows = data?.results || []
  return (
    <div>
      <div className='overflow-x-auto'>
        <Table>
          <TableHeader>
            <TableRow className='bg-muted/40'>
              <TableHead>{t('When')}</TableHead>
              <TableHead>{t('Movement')}</TableHead>
              <TableHead>{t('Item')}</TableHead>
              <TableHead className='text-right'>{t('Qty')}</TableHead>
              <TableHead className='text-right'>{t('Balance')}</TableHead>
              <TableHead>{t('Batch / serials')}</TableHead>
              <TableHead>{t('Reference')}</TableHead>
              <TableHead>{t('Location')}</TableHead>
              <TableHead>{t('By')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={9}>
                  <Skeleton className='h-16 w-full' />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className='text-muted-foreground py-8 text-center text-sm'
                >
                  {t('No stock movements yet.')}
                </TableCell>
              </TableRow>
            )}
            {rows.map((m) => {
              const bucketMeta = BUCKET_META[m.stockBucket || 'available']
              return (
                <TableRow key={m.id}>
                  <TableCell className='text-muted-foreground text-xs whitespace-nowrap'>
                    {new Date(m.createdAt).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </TableCell>
                  <TableCell>
                    <div className='flex items-center gap-1.5'>
                      <Badge
                        variant='outline'
                        className={cn(
                          'h-5 px-1.5 text-[10px]',
                          bucketMeta.className
                        )}
                      >
                        {t(bucketMeta.label)}
                      </Badge>
                      <span className='text-sm'>
                        {t(MOVEMENT_LABELS[m.type] || m.type)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className='font-medium'>
                    {productLabel(m)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right font-medium tabular-nums',
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
                  </TableCell>
                  <TableCell className='text-muted-foreground text-right tabular-nums'>
                    {fmtQty(m.balanceAfter)}
                  </TableCell>
                  <TableCell className='max-w-48 text-xs'>
                    {batchLabel(m) && (
                      <span className='font-mono'>{batchLabel(m)}</span>
                    )}
                    {m.serialNumbers?.length ? (
                      <span
                        className='text-muted-foreground block truncate font-mono'
                        title={m.serialNumbers.join(', ')}
                      >
                        {m.serialNumbers.join(', ')}
                      </span>
                    ) : null}
                    {!batchLabel(m) && !m.serialNumbers?.length && (
                      <span className='text-muted-foreground'>—</span>
                    )}
                  </TableCell>
                  <TableCell className='text-xs'>
                    <div>{m.refType}</div>
                    {showOrder && m.productionOrderId && (
                      <Link
                        to={
                          `/manufacturing/production-orders/${m.productionOrderId}` as never
                        }
                        className='text-primary hover:underline'
                      >
                        {t('Open order')}
                      </Link>
                    )}
                  </TableCell>
                  <TableCell className='text-muted-foreground text-xs'>
                    {m.location || '—'}
                  </TableCell>
                  <TableCell className='text-muted-foreground text-xs'>
                    {refName(m.createdBy) || '—'}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <div className='px-3 pb-3'>
        <Pager data={data} page={page} onPageChange={setPage} />
      </div>
    </div>
  )
}
