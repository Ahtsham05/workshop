import { Link } from '@tanstack/react-router'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import {
  useGetTargetAlertsQuery,
  type ProductionTarget,
  type TargetStatus,
} from '@/stores/manufacturing.api'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Badge } from '@/components/ui/badge'
import { TARGET_STATUS_META, fmtQty } from '../lib/constants'
import { lineVerdict, progressTone } from '../lib/targets'
import { ProgressBar } from './badges'

/*
 * Pieces shared by the Targets page, its detail sheet and the alert strip on the
 * Manufacturing overview.
 */

export function TargetStatusPill({
  status,
  className,
}: {
  status: TargetStatus
  className?: string
}) {
  const { t } = useLanguage()
  const meta = TARGET_STATUS_META[status]
  return (
    <Badge variant='outline' className={cn('font-medium whitespace-nowrap', meta.className, className)}>
      {t(meta.label)}
    </Badge>
  )
}

const num = (n: number | null | undefined, blank = false) =>
  n === null || n === undefined || (blank && Math.abs(n) < 1e-9) ? '—' : fmtQty(n)

/** A target's product lines: target, made, progress, remaining, stock, orders, to plan. */
export function TargetLinesTable({ target }: { target: ProductionTarget }) {
  const { t } = useLanguage()
  const isStock = target.measure === 'stock'
  return (
    <>
      <div className='overflow-x-auto max-md:hidden'>
        <table className='w-full text-sm'>
          <thead>
            <tr className='text-muted-foreground border-b text-xs'>
              <th className='px-5 py-2 text-left font-medium'>{t('Product')}</th>
              <th className='px-3 py-2 text-right font-medium'>{t('Target')}</th>
              <th className='px-3 py-2 text-right font-medium'>{t('Made')}</th>
              <th className='w-40 px-3 py-2 text-left font-medium'>{t('Progress')}</th>
              <th className='px-3 py-2 text-right font-medium'>{t('Remaining')}</th>
              <th className='px-3 py-2 text-right font-medium'>{t('In stock')}</th>
              <th className='px-3 py-2 text-right font-medium'>{t('In orders')}</th>
              <th className='px-3 py-2 text-right font-medium'>{t('To plan')}</th>
              <th className='px-5 py-2 text-left font-medium'>{t('Status')}</th>
            </tr>
          </thead>
          <tbody>
            {target.lines.map((l) => (
              <tr key={l.id} className='border-b last:border-0'>
                <td className='max-w-64 px-5 py-2.5'>
                  <div className='truncate font-medium'>{l.productName}</div>
                  <div className='text-muted-foreground truncate text-xs'>
                    {[l.sku, l.unit].filter(Boolean).join(' · ')}
                  </div>
                </td>
                <td className='px-3 py-2.5 text-right font-semibold tabular-nums'>{fmtQty(l.target)}</td>
                <td className={cn('px-3 py-2.5 text-right tabular-nums', !isStock && 'font-medium')}>
                  {fmtQty(l.made)}
                </td>
                <td className='px-3 py-2.5'>
                  <div className='flex items-center gap-2'>
                    <ProgressBar value={l.percent} tone={progressTone(l.status)} label={`${l.productName} ${t('progress')}`} />
                    <span className='w-12 shrink-0 text-right text-xs tabular-nums'>{l.percent}%</span>
                  </div>
                </td>
                <td className='px-3 py-2.5 text-right font-semibold tabular-nums'>{num(l.remaining)}</td>
                <td className={cn('px-3 py-2.5 text-right tabular-nums', isStock && 'font-medium')}>
                  {fmtQty(l.stock)}
                </td>
                <td className='px-3 py-2.5 text-right tabular-nums'>
                  {num(l.inOrders, true)}
                  {l.openOrders > 0 && (
                    <div className='text-muted-foreground text-[11px]'>
                      {l.openOrders} {t(l.openOrders === 1 ? 'order' : 'orders')}
                    </div>
                  )}
                </td>
                <td
                  className={cn(
                    'px-3 py-2.5 text-right tabular-nums',
                    l.toPlan > 0 && l.status !== 'achieved' && 'font-semibold text-rose-600 dark:text-rose-400'
                  )}
                >
                  {num(l.toPlan, true)}
                </td>
                <td className='px-5 py-2.5'>
                  <TargetStatusPill status={l.status} />
                  <div className='text-muted-foreground mt-0.5 text-[11px] whitespace-nowrap'>{lineVerdict(l, t)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className='divide-y md:hidden'>
        {target.lines.map((l) => (
          <li key={l.id} className='space-y-2 px-4 py-3'>
            <div className='flex items-start justify-between gap-3'>
              <div className='min-w-0'>
                <div className='truncate font-medium'>{l.productName}</div>
                <div className='text-muted-foreground text-xs'>{lineVerdict(l, t)}</div>
              </div>
              <TargetStatusPill status={l.status} />
            </div>
            <div className='flex items-center gap-2'>
              <ProgressBar value={l.percent} tone={progressTone(l.status)} />
              <span className='shrink-0 text-xs tabular-nums'>{l.percent}%</span>
            </div>
            <dl className='grid grid-cols-3 gap-2 text-xs'>
              {(
                [
                  [t('Target'), l.target],
                  [isStock ? t('In stock') : t('Made'), l.achieved],
                  [t('Remaining'), l.remaining],
                  [isStock ? t('Made') : t('In stock'), isStock ? l.made : l.stock],
                  [t('In orders'), l.inOrders],
                  [t('To plan'), l.toPlan],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className='min-w-0'>
                  <dt className='text-muted-foreground'>{label}</dt>
                  <dd className='font-medium tabular-nums'>
                    {fmtQty(value)} <span className='text-muted-foreground font-normal'>{l.unit}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * Products behind their target (running and under pace, or missed in the last week).
 * Renders nothing while there are none. `limit` caps the rows shown.
 */
export function TargetAlertsPanel({
  limit = 5,
  className,
}: {
  limit?: number
  className?: string
}) {
  const { t } = useLanguage()
  const { data } = useGetTargetAlertsQuery(undefined, { refetchOnMountOrArgChange: 60 })
  if (!data?.count) return null
  const missedOnly = data.atRisk === 0
  return (
    <section
      aria-label={t('Target alerts')}
      className={cn(
        'rounded-xl border',
        missedOnly
          ? 'border-rose-500/30 bg-rose-500/[0.04]'
          : 'border-amber-500/40 bg-amber-500/[0.06]',
        className
      )}
    >
      <div className='flex flex-wrap items-center justify-between gap-2 px-4 pt-3 pb-2'>
        <div className='flex items-center gap-2'>
          <AlertTriangle
            className={cn('h-4 w-4', missedOnly ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400')}
            aria-hidden
          />
          <h3 className='text-sm font-semibold'>
            {data.count === 1
              ? t('1 product is behind its production target')
              : t('{{n}} products are behind their production targets').replace('{{n}}', String(data.count))}
          </h3>
          <span className='text-muted-foreground text-xs'>
            {[
              data.atRisk ? `${data.atRisk} ${t('at risk')}` : '',
              data.missed ? `${data.missed} ${t('missed')}` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        <Link
          to={'/manufacturing/targets' as never}
          search={{ status: data.atRisk ? 'at_risk' : 'missed' } as never}
          className='text-muted-foreground hover:text-foreground text-xs font-medium hover:underline'
        >
          {t('View targets')}
        </Link>
      </div>
      <ul className='divide-y border-t'>
        {data.items.slice(0, limit).map((a) => (
          <li key={`${a.targetId}:${a.id}`}>
            <Link
              to={'/manufacturing/targets' as never}
              search={{ targetId: a.targetId } as never}
              className='hover:bg-background/60 flex items-center gap-3 px-4 py-2.5 transition-colors'
            >
              <div className='min-w-0 flex-1'>
                <div className='flex flex-wrap items-center gap-x-2 gap-y-0.5'>
                  <span className='truncate text-sm font-medium'>{a.productName}</span>
                  <span className='text-muted-foreground truncate text-xs'>
                    {a.targetNumber} · {a.title}
                  </span>
                </div>
                <div className='text-muted-foreground text-xs'>
                  <span className='text-foreground font-medium tabular-nums'>
                    {fmtQty(a.achieved)} / {fmtQty(a.target)} {a.unit}
                  </span>{' '}
                  ({a.percent}%) · {lineVerdict(a, t)}
                  {a.status === 'at_risk' && a.requiredPerDay !== null && (
                    <>
                      {' · '}
                      {t('needs')} {fmtQty(a.requiredPerDay)} {a.unit}/{t('day')} · {a.daysLeft}{' '}
                      {t(a.daysLeft === 1 ? 'day left' : 'days left')}
                    </>
                  )}
                </div>
              </div>
              <TargetStatusPill status={a.status} />
              <ChevronRight className='text-muted-foreground h-4 w-4 shrink-0' aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      {data.count > limit && (
        <div className='text-muted-foreground border-t px-4 py-2 text-xs'>
          + {data.count - limit} {t('more')}
        </div>
      )}
    </section>
  )
}
