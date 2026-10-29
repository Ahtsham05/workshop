import { AlertTriangle, CheckCircle2, Factory, PackageCheck } from 'lucide-react'
import type { WipRow } from '@/stores/manufacturing.api'
import { getUnitLabel } from '@/lib/units'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Skeleton } from '@/components/ui/skeleton'
import { PriorityText, ProgressBar, StatusBadge } from './badges'
import { EmptyState } from './page'
import { fmtDate, fmtQty } from '../lib/constants'

const EPS = 1e-6

/**
 * The orders on the floor as cards — what was made so far, what is left, what is waiting
 * for QC — each one tap from receiving its finished goods.
 */
export function ReadyToReceiveGrid({
  orders,
  loading,
  onPick,
  selectedId,
  compact = false,
  canReceive = true,
}: {
  orders: WipRow[]
  loading?: boolean
  onPick: (order: WipRow) => void
  selectedId?: string
  /** Smaller cards (the receipt page's quick pick). */
  compact?: boolean
  canReceive?: boolean
}) {
  const { t } = useLanguage()
  if (loading) {
    return (
      <div className='grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3'>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn('w-full rounded-xl', compact ? 'h-24' : 'h-40')}
          />
        ))}
      </div>
    )
  }
  if (!orders.length) {
    return (
      <EmptyState
        icon={Factory}
        title={t('Nothing on the floor to receive')}
        description={t(
          'Release a production order and issue its materials — it shows up here, ready to receive.'
        )}
      />
    )
  }
  return (
    <ul className='grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3'>
      {orders.map((o) => {
        const done = o.remainingQuantity <= EPS
        const unit = getUnitLabel(o.unit)
        const selected = o.id === selectedId
        return (
          <li key={o.id} className='min-w-0'>
            <button
              type='button'
              onClick={() => onPick(o)}
              disabled={!canReceive}
              aria-pressed={selectedId ? selected : undefined}
              className={cn(
                'bg-card group focus-visible:ring-ring flex h-full w-full flex-col gap-3 rounded-xl border p-4 text-left transition-colors outline-none focus-visible:ring-2 disabled:cursor-default',
                canReceive && 'hover:border-foreground/25 hover:bg-muted/30',
                o.isOverdue && 'border-rose-500/40',
                selected && 'border-primary ring-primary/30 ring-2'
              )}
            >
              <div className='flex items-start justify-between gap-2'>
                <div className='min-w-0'>
                  <div className='flex items-center gap-2'>
                    <span className='text-muted-foreground font-mono text-xs'>
                      {o.orderNumber}
                    </span>
                    <PriorityText priority={o.priority} />
                  </div>
                  <div className='truncate font-semibold'>{o.productName}</div>
                </div>
                <StatusBadge status={o.status} orderType={o.orderType} />
              </div>

              <div className='space-y-1'>
                <div className='text-muted-foreground flex justify-between text-xs'>
                  <span>{t('Made')}</span>
                  <span className='tabular-nums'>
                    {fmtQty(o.producedQuantity)} / {fmtQty(o.plannedQuantity)}{' '}
                    {unit}
                  </span>
                </div>
                <ProgressBar value={o.outputPercent} tone='emerald' />
              </div>

              {!compact && (
                <div className='grid grid-cols-3 gap-2 text-center'>
                  <Fact label={t('Left to make')} value={o.remainingQuantity} />
                  <Fact
                    label={t('In QC')}
                    value={o.qcPendingQuantity}
                    tone={o.qcPendingQuantity > EPS ? 'info' : undefined}
                  />
                  <Fact
                    label={t('Materials issued')}
                    text={`${o.materialIssuedPercent}%`}
                    tone={o.materialIssuedPercent < 100 ? 'warn' : undefined}
                  />
                </div>
              )}

              <div className='mt-auto flex items-center justify-between gap-2 border-t pt-3 text-xs'>
                <span
                  className={cn(
                    'text-muted-foreground',
                    o.isOverdue && 'font-medium text-rose-600 dark:text-rose-400'
                  )}
                >
                  {o.isOverdue && (
                    <AlertTriangle className='mr-1 inline h-3 w-3' />
                  )}
                  {t('Due')} {fmtDate(o.plannedCompletionDate)}
                </span>
                {done ? (
                  <span className='inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400'>
                    <CheckCircle2 className='h-3.5 w-3.5' />
                    {t('All made')}
                  </span>
                ) : (
                  canReceive && (
                    <span className='text-primary inline-flex items-center gap-1 font-medium'>
                      <PackageCheck className='h-3.5 w-3.5' />
                      {t('Receive')} {fmtQty(o.remainingQuantity)} {unit}
                    </span>
                  )
                )}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function Fact({
  label,
  value,
  text,
  tone,
}: {
  label: string
  value?: number
  text?: string
  tone?: 'info' | 'warn'
}) {
  return (
    <div className='bg-muted/40 rounded-md px-2 py-1.5'>
      <div
        className={cn(
          'text-sm font-semibold tabular-nums',
          tone === 'info' && 'text-sky-600 dark:text-sky-400',
          tone === 'warn' && 'text-amber-600 dark:text-amber-400'
        )}
      >
        {text ?? fmtQty(value || 0)}
      </div>
      <div className='text-muted-foreground truncate text-[11px]'>{label}</div>
    </div>
  )
}
