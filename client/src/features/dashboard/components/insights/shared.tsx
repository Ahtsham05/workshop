import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, AlertCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import type { TrendRange } from '@/stores/dashboard.api'
import { TREND_RANGE_OPTIONS, isTrendRange } from './insight-utils'

/**
 * Building blocks shared by the dashboard insight widgets (Profit & Loss, Sales, Expenses,
 * Due invoices, Bills to pay, Receivable/Payable aging, Track money). Colours come from the
 * `.dash-viz` tokens in index.css so light and dark each get their own validated steps.
 */

export type InsightLink = { to: string; search?: Record<string, unknown> }

/* ── Range picker (per widget, remembered in this browser — useStoredRange) ─── */

export function RangeSelect({ value, onChange }: { value: TrendRange; onChange: (value: TrendRange) => void }) {
  const { t } = useLanguage()
  return (
    <Select value={value} onValueChange={(v) => isTrendRange(v) && onChange(v)}>
      <SelectTrigger size='sm' className='h-8 w-auto gap-1.5 px-2.5 text-xs shadow-none' aria-label={t('Period')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align='end'>
        {TREND_RANGE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value} className='text-xs'>
            {t(option.label)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/* ── Card shell ─────────────────────────────────────────────────────────────── */

type InsightCardProps = {
  title: string
  link?: InsightLink
  /** Right side of the header (range picker, "as of today"…). */
  action?: ReactNode
  /** Small grey line under the title (period covered). */
  subtitle?: ReactNode
  showSkeleton?: boolean
  isRefreshing?: boolean
  isError?: boolean
  skeletonHeight?: number
  className?: string
  children: ReactNode
}

export function InsightCard({
  title,
  link,
  action,
  subtitle,
  showSkeleton,
  isRefreshing,
  isError,
  skeletonHeight = 220,
  className,
  children,
}: InsightCardProps) {
  const { t } = useLanguage()
  return (
    <Card
      aria-busy={isRefreshing || showSkeleton}
      className={cn('dash-viz flex min-w-0 flex-col gap-0 p-4 transition-opacity sm:p-5', isRefreshing && 'opacity-60', className)}
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <div className='flex items-center gap-1.5'>
            <h3 className='truncate text-[15px] font-semibold leading-tight'>{title}</h3>
            {link && (
              <Link
                to={link.to}
                search={link.search as never}
                className='inline-flex size-5 shrink-0 items-center justify-center rounded border text-muted-foreground transition-colors hover:border-primary hover:text-primary'
                aria-label={`${t('Open report')}: ${title}`}
                title={t('Open report')}
              >
                <ArrowUpRight className='size-3' />
              </Link>
            )}
          </div>
          {subtitle && <p className='mt-1 text-[11px] text-muted-foreground'>{subtitle}</p>}
        </div>
        {action && <div className='shrink-0'>{action}</div>}
      </div>
      <div className='mt-4 flex min-h-0 flex-1 flex-col'>
        {showSkeleton ? (
          <div className='space-y-3'>
            <Skeleton className='h-7 w-40' />
            <Skeleton className='w-full' style={{ height: skeletonHeight }} />
          </div>
        ) : isError ? (
          <div className='flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground'>
            <AlertCircle className='size-5' />
            {t("Couldn't load this right now. Press Refresh to try again.")}
          </div>
        ) : (
          children
        )}
      </div>
    </Card>
  )
}

/* ── Headline figure + legend + tooltip ─────────────────────────────────────── */

export function Headline({ value, label, sub }: { value: string; label?: string; sub?: ReactNode }) {
  return (
    <div className='min-w-0'>
      <div className='flex flex-wrap items-baseline gap-x-2'>
        <span className='text-2xl font-semibold tracking-tight tabular-nums'>{value}</span>
        {label && <span className='text-xs font-medium text-muted-foreground'>{label}</span>}
      </div>
      {sub && <p className='mt-0.5 text-xs text-muted-foreground'>{sub}</p>}
    </div>
  )
}

export type LegendEntry = { label: string; color: string; muted?: boolean }

export function ChartLegend({ items, className }: { items: LegendEntry[]; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground', className)}>
      {items.map((item) => (
        <span key={item.label} className='inline-flex items-center gap-1.5'>
          <span className={cn('size-2.5 rounded-[3px]', item.muted && 'opacity-40')} style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  )
}

export type TooltipRow = { label: string; value: string; color?: string; strong?: boolean; muted?: boolean }

export function ChartTooltipCard({ title, note, rows }: { title: string; note?: string; rows: TooltipRow[] }) {
  return (
    <div className='min-w-44 rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md'>
      <div className='mb-1.5 flex items-center justify-between gap-3'>
        <span className='text-xs font-semibold'>{title}</span>
        {note && <span className='rounded bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground'>{note}</span>}
      </div>
      <div className='space-y-1'>
        {rows.map((row) => (
          <div
            key={row.label}
            className={cn(
              'flex items-center justify-between gap-4 text-xs',
              row.strong && 'border-t pt-1 font-semibold',
              row.muted && 'text-muted-foreground'
            )}
          >
            <span className='inline-flex items-center gap-1.5'>
              {row.color && <span className='size-2 rounded-full' style={{ background: row.color }} />}
              {row.label}
            </span>
            <span className='tabular-nums'>{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function EmptyChart({ message, height }: { message: string; height: number }) {
  return (
    <div
      className='flex items-center justify-center rounded-lg border border-dashed text-center text-sm text-muted-foreground'
      style={{ height }}
    >
      {message}
    </div>
  )
}
