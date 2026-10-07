import type { ProductionMaterial } from '@/stores/manufacturing.api'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Badge } from '@/components/ui/badge'
import { fmtQty } from '../lib/constants'
import {
  issueState,
  lineIssuedNet,
  lineRemaining,
  lineWip,
  n,
  type IssueState,
} from '../lib/material-math'

const STATE_META: Record<IssueState, { label: string; className: string }> = {
  none: { label: 'Not issued', className: 'text-muted-foreground' },
  partial: {
    label: 'Partially issued',
    className:
      'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  full: {
    label: 'Fully issued',
    className:
      'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  over: {
    label: 'Over-issued',
    className:
      'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  },
}

export function IssueStatusBadge({
  material,
}: {
  material: ProductionMaterial
}) {
  const { t } = useLanguage()
  const meta = STATE_META[issueState(material)]
  return (
    <Badge
      variant='outline'
      className={cn('h-5 px-1.5 text-[10px] font-medium', meta.className)}
    >
      {t(meta.label)}
    </Badge>
  )
}

/**
 * One bar for a material line's whole journey against its requirement:
 * consumed (built into output) · in WIP · scrapped · still to issue.
 */
export function MaterialProgress({
  material,
}: {
  material: ProductionMaterial
}) {
  const { t } = useLanguage()
  const base = Math.max(
    material.requiredQuantity,
    lineIssuedNet(material),
    1e-9
  )
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / base) * 100))}%`
  const consumed = n(material.consumedQuantity)
  const inWip = lineWip(material)
  const scrapped = n(material.scrappedQuantity)
  const remaining = lineRemaining(material)
  return (
    <div className='space-y-1'>
      <div
        className='bg-muted flex h-2 w-full overflow-hidden rounded-full'
        role='img'
        aria-label={t('Material progress')}
      >
        <div
          className='h-full bg-emerald-500'
          style={{ width: pct(consumed) }}
          title={`${t('Consumed')} ${fmtQty(consumed)}`}
        />
        <div
          className='h-full bg-amber-400'
          style={{ width: pct(inWip) }}
          title={`${t('In WIP')} ${fmtQty(inWip)}`}
        />
        <div
          className='h-full bg-rose-400'
          style={{ width: pct(scrapped) }}
          title={`${t('Scrapped')} ${fmtQty(scrapped)}`}
        />
      </div>
      <div className='text-muted-foreground text-[11px] tabular-nums'>
        <span className='text-foreground font-medium'>
          {fmtQty(lineIssuedNet(material))}
        </span>{' '}
        {t('of')} {fmtQty(material.requiredQuantity)} {t('issued')} ·{' '}
        <span
          className={cn(
            remaining > 1e-6
              ? 'font-medium text-amber-600 dark:text-amber-400'
              : ''
          )}
        >
          {fmtQty(remaining)} {t('remaining')}
        </span>
      </div>
    </div>
  )
}

export function ProgressLegend() {
  const { t } = useLanguage()
  return (
    <div className='text-muted-foreground flex flex-wrap items-center gap-3 text-[11px]'>
      {[
        ['bg-emerald-500', t('Consumed')],
        ['bg-amber-400', t('In WIP')],
        ['bg-rose-400', t('Scrapped')],
        ['bg-muted border', t('To issue')],
      ].map(([color, label]) => (
        <span key={label} className='flex items-center gap-1'>
          <span className={cn('h-2 w-2 rounded-full', color)} />
          {label}
        </span>
      ))}
    </div>
  )
}
