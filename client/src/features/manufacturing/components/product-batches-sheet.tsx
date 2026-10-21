import { Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  Factory,
  GitBranch,
  Layers,
  Loader2,
  PackagePlus,
  Truck,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  useBatchUnbatchedStockMutation,
  useGetManufacturingProductOverviewQuery,
  type ProductBatch,
} from '@/stores/manufacturing.api'
import { useFormatMoney } from '@/features/manufacturing/lib/use-mfg-money'
import { getErrorMessage } from '@/lib/get-error-message'
import { getUnitLabel } from '@/lib/units'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { fmtDate, fmtQty } from '../lib/constants'
import { BatchBadge } from './badges'
import { EmptyState } from './page'

const SOON_DAYS = 30

/** "Expired 3 days ago" / "12 days left" / "No expiry", coloured by urgency. */
export function ExpiryText({
  days,
  date,
}: {
  days: number | null
  date: string | null
}) {
  const { t } = useLanguage()
  if (days === null || !date)
    return <span className='text-muted-foreground'>{t('No expiry')}</span>
  return (
    <span
      className={cn(
        'tabular-nums',
        days < 0
          ? 'font-medium text-rose-600 dark:text-rose-400'
          : days <= SOON_DAYS
            ? 'font-medium text-amber-600 dark:text-amber-400'
            : 'text-muted-foreground'
      )}
    >
      {fmtDate(date)} ·{' '}
      {days < 0
        ? t('expired {{n}}d ago').replace('{{n}}', String(-days))
        : t('{{n}}d left').replace('{{n}}', String(days))}
    </span>
  )
}

function SourceText({ source }: { source: ProductBatch['source'] }) {
  const { t } = useLanguage()
  if (source.kind === 'production')
    return (
      <span className='inline-flex items-center gap-1'>
        <Factory className='h-3 w-3' />
        {source.label}
      </span>
    )
  if (source.kind === 'purchase')
    return (
      <span className='inline-flex items-center gap-1'>
        <Truck className='h-3 w-3' />
        {source.label || t('Purchase')}
      </span>
    )
  return <span>{source.kind === 'opening' ? t('Opening stock') : '—'}</span>
}

/**
 * Every batch of one product holding stock, soonest expiry first (the order FEFO issues
 * and sells them in): quantity, value, manufacture / expiry dates and where it came from,
 * each linked to its full trace.
 */
export function ProductBatchesSheet({
  productId,
  productName,
  unit,
  onClose,
}: {
  productId: string
  productName: string
  unit: string
  onClose: () => void
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { data, isLoading } = useGetManufacturingProductOverviewQuery(productId)
  const [batchUnbatched, { isLoading: assigning }] =
    useBatchUnbatchedStockMutation()
  const unbatched = data?.tracking.unbatchedQuantity || 0
  const assign = async () => {
    try {
      const made = await batchUnbatched({ productId }).unwrap()
      toast.success(
        `${fmtQty(made.quantity)} ${getUnitLabel(unit)} → ${t('batch')} ${made.batchNumber}`
      )
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not create the batch')))
    }
  }
  const batches = data?.batches || []
  const total = batches.reduce((s, b) => s + b.quantity, 0)
  const value = batches.reduce((s, b) => s + b.value, 0)

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className='flex w-full flex-col gap-0 sm:max-w-xl'>
        <SheetHeader className='border-b px-5 py-4'>
          <SheetTitle className='flex items-center gap-2'>
            <Layers className='h-4 w-4' />
            {productName}
          </SheetTitle>
          <SheetDescription>
            {t(
              'Batches in stock, soonest expiry first — the order they are issued and sold in.'
            )}
          </SheetDescription>
        </SheetHeader>
        <div className='bg-muted/30 grid grid-cols-3 gap-3 border-b px-5 py-3 text-sm'>
          <div>
            <div className='text-muted-foreground text-xs'>{t('Batches')}</div>
            <div className='font-semibold tabular-nums'>{batches.length}</div>
          </div>
          <div>
            <div className='text-muted-foreground text-xs'>{t('Quantity')}</div>
            <div className='font-semibold tabular-nums'>
              {fmtQty(total)} {getUnitLabel(unit)}
            </div>
          </div>
          <div>
            <div className='text-muted-foreground text-xs'>{t('Value')}</div>
            <div className='font-semibold tabular-nums'>
              {formatMoney(value)}
            </div>
          </div>
        </div>
        <div className='flex-1 overflow-y-auto px-3 py-3'>
          {unbatched > 0 && (
            <div className='mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm'>
              <AlertTriangle className='h-4 w-4 shrink-0 text-amber-600' />
              <span className='min-w-0 flex-1 text-amber-800 dark:text-amber-300'>
                <b className='tabular-nums'>
                  {fmtQty(unbatched)} {getUnitLabel(unit)}
                </b>{' '}
                {t(
                  'in stock have no batch — they can’t be issued or sold by batch.'
                )}
              </span>
              <Button
                size='sm'
                variant='outline'
                className='h-8 gap-1.5'
                disabled={assigning}
                onClick={assign}
              >
                {assigning ? (
                  <Loader2 className='h-3.5 w-3.5 animate-spin' />
                ) : (
                  <PackagePlus className='h-3.5 w-3.5' />
                )}
                {t('Put them into a batch')}
              </Button>
            </div>
          )}
          {isLoading ? (
            <div className='space-y-2 px-2'>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className='h-16 w-full' />
              ))}
            </div>
          ) : !data?.tracking.trackBatch && !data?.tracking.trackExpiry ? (
            <EmptyState
              bordered={false}
              icon={Layers}
              title={t('Batch tracking is off')}
              description={t(
                'Turn it on in this product’s Manufacturing settings.'
              )}
            />
          ) : !batches.length ? (
            <EmptyState
              bordered={false}
              icon={Layers}
              title={t('No batch holds stock')}
              description={t(
                'Batches appear here when stock is purchased or produced.'
              )}
            />
          ) : (
            <ul className='divide-y rounded-lg border'>
              {batches.map((b) => (
                <li
                  key={b.id}
                  className='flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2.5'
                >
                  <div className='min-w-0 flex-1 basis-48'>
                    <BatchBadge
                      batchNumber={b.batchNumber}
                      tone={
                        b.daysToExpiry !== null && b.daysToExpiry < 0
                          ? 'danger'
                          : 'default'
                      }
                    />
                    <div className='text-muted-foreground mt-1 flex flex-wrap gap-x-3 text-xs'>
                      <SourceText source={b.source} />
                      {b.manufactureDate && (
                        <span>
                          {t('Mfg.')} {fmtDate(b.manufactureDate)}
                        </span>
                      )}
                    </div>
                    <div className='mt-0.5 text-xs'>
                      <ExpiryText days={b.daysToExpiry} date={b.expiryDate} />
                    </div>
                  </div>
                  <div className='text-right'>
                    <div className='font-semibold tabular-nums'>
                      {fmtQty(b.quantity)} {getUnitLabel(unit)}
                    </div>
                    <div className='text-muted-foreground text-xs tabular-nums'>
                      {formatMoney(b.value)}
                    </div>
                  </div>
                  <Button
                    asChild
                    size='sm'
                    variant='ghost'
                    className='h-8 gap-1'
                  >
                    <Link
                      to={'/manufacturing/reports' as never}
                      search={{ report: 'batch-trace', batchId: b.id } as never}
                    >
                      <GitBranch className='h-3.5 w-3.5' />
                      {t('Trace')}
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
