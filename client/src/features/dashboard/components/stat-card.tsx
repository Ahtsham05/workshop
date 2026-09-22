import { Link } from '@tanstack/react-router'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { fitValueSize } from '@/lib/fit-value-size'
import { toneColor, type StatCardTone } from '@/lib/stat-card-tones'

export type { StatCardTone }

export type StatCardLink = {
  to: string
  search?: Record<string, unknown>
}

interface StatCardProps {
  title: string
  value: string | number
  change?: number
  icon: React.ReactNode
  trend?: 'up' | 'down'
  description?: string
  isLoading?: boolean
  valuePrefix?: string
  valueSuffix?: string
  tone?: StatCardTone
  link?: StatCardLink
  onClick?: () => void
  /**
   * Phone layout (below 640px): the icon sits beside the title and the card is tighter and
   * shorter. Opt-in, so cards on other pages stay exactly as they were; from 640px up the
   * markup and spacing are the same either way.
   */
  inlineHeaderOnMobile?: boolean
}

/**
 * Classes for the phone layout. Every one is `max-sm:`, so nothing applies from 640px up.
 * The card turns into a 2-column grid: the header wrapper is `contents`, which lets the icon
 * (column 1) and the change badge join it, and the title takes column 2 of the first row.
 * Row gaps are margins rather than `gap-y`, so an empty row (no badge / no description) adds no space.
 */
const PHONE = {
  // Below 360px the title column is only ~70px, too narrow for a word like "Outstanding": the chip and the
  // gap shrink a little, the title drops to text-xs, and break-words wraps anything still too long
  // instead of clipping it.
  card: 'max-sm:@container max-sm:grid max-sm:grid-cols-[2rem_minmax(0,1fr)] max-sm:grid-rows-[minmax(2.25rem,auto)] max-sm:content-start max-sm:gap-x-2.5 max-sm:p-3 max-[359px]:grid-cols-[1.75rem_minmax(0,1fr)] max-[359px]:gap-x-2',
  header: 'max-sm:contents',
  icon: 'max-sm:col-start-1 max-sm:row-start-1 max-sm:h-8 max-sm:w-8 max-sm:self-center max-[359px]:h-7 max-[359px]:w-7',
  title:
    'max-sm:col-start-2 max-sm:row-start-1 max-sm:mb-0 max-sm:min-w-0 max-sm:self-center max-sm:text-[13px] max-sm:leading-snug max-sm:break-words max-[359px]:text-xs',
  value:
    'max-sm:col-span-2 max-sm:row-start-2 max-sm:mt-2.5 max-sm:whitespace-nowrap max-sm:leading-7 max-sm:[font-size:var(--stat-fit)]',
  badge: 'max-sm:col-span-2 max-sm:row-start-3 max-sm:mt-2 max-sm:justify-self-start',
  description:
    'max-sm:col-span-2 max-sm:row-start-4 max-sm:mt-1.5 max-sm:line-clamp-3 max-sm:text-[11px] max-sm:leading-snug',
  bar: 'max-sm:col-span-2 max-sm:row-start-5 max-sm:mt-2.5',
  // "View details" only appears on hover, which touch screens don't have — it was just empty space.
  hint: 'max-sm:hidden',
  // w-4/5: the normal w-28 is wider than the narrow title column and would poke out of the card.
  skeletonTitle: 'max-sm:col-start-2 max-sm:row-start-1 max-sm:mb-0 max-sm:w-4/5 max-sm:self-center',
  skeletonValue: 'max-sm:col-span-2 max-sm:row-start-2 max-sm:mt-2.5 max-sm:mb-0',
  skeletonDescription: 'max-sm:col-span-2 max-sm:row-start-3 max-sm:mt-1.5',
}

function formatValue(
  value: string | number,
  valuePrefix: string,
  valueSuffix: string,
): string {
  const core =
    typeof value === 'number' ? value.toLocaleString() : value
  return `${valuePrefix}${core}${valueSuffix}`
}

function StatCardContent({
  title,
  value,
  change,
  icon,
  trend,
  description,
  valuePrefix = '',
  valueSuffix = '',
  tone = 'slate',
  inlineHeaderOnMobile = false,
  interactive = false,
}: Omit<StatCardProps, 'isLoading' | 'link' | 'onClick'> & { interactive?: boolean }) {
  const color = toneColor(tone)
  const isPositive = trend === 'up' || (change !== undefined && change >= 0)
  const displayValue = formatValue(value, valuePrefix, valueSuffix)
  const barWidth =
    change !== undefined ? Math.min(Math.abs(change), 100) : null
  // Phone-only classes; a no-op unless the card opted in.
  const phone = (classes: string) => (inlineHeaderOnMobile ? classes : undefined)
  const valueStyle = {
    color,
    ...(inlineHeaderOnMobile ? { '--stat-fit': fitValueSize(displayValue) } : {}),
  } as React.CSSProperties

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col rounded-xl border bg-card p-4 text-left shadow-sm transition-all',
        phone(PHONE.card),
        interactive && 'group cursor-pointer hover:border-primary/50 hover:shadow-md',
      )}
    >
      <div className={cn('mb-3 flex items-center justify-between gap-2', phone(PHONE.header))}>
        <span
          className={cn(
            'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white [&_svg]:h-4 [&_svg]:w-4',
            phone(PHONE.icon),
          )}
          style={{ backgroundColor: color }}
        >
          {icon}
        </span>
        {change !== undefined && (
          <Badge
            variant='secondary'
            className={cn(
              'gap-1 text-xs tabular-nums',
              isPositive
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
              phone(PHONE.badge),
            )}
          >
            {isPositive ? (
              <TrendingUp className='h-3 w-3' />
            ) : (
              <TrendingDown className='h-3 w-3' />
            )}
            {Math.abs(change).toFixed(1)}%
          </Badge>
        )}
      </div>

      <p className={cn('mb-0.5 line-clamp-2 text-sm font-semibold leading-tight', phone(PHONE.title))}>{title}</p>
      <p className={cn('text-xl font-bold tabular-nums', phone(PHONE.value))} style={valueStyle}>
        {displayValue}
      </p>

      {description && (
        <p className={cn('mt-2 line-clamp-2 text-xs text-muted-foreground', phone(PHONE.description))}>
          {description}
        </p>
      )}

      {barWidth !== null && (
        <div className={cn('mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted', phone(PHONE.bar))}>
          <div
            className='h-full rounded-full transition-all'
            style={{ width: `${barWidth}%`, backgroundColor: color }}
          />
        </div>
      )}

      {interactive && (
        <p
          className={cn(
            'mt-1.5 text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100',
            phone(PHONE.hint),
          )}
        >
          View details →
        </p>
      )}
    </div>
  )
}

export function StatCard({
  title,
  value,
  change,
  icon,
  trend,
  description,
  isLoading,
  valuePrefix = '',
  valueSuffix = '',
  tone = 'slate',
  link,
  onClick,
  inlineHeaderOnMobile = false,
}: StatCardProps) {
  const interactive = Boolean(link || onClick)
  const phone = (classes: string) => (inlineHeaderOnMobile ? classes : undefined)

  if (isLoading) {
    return (
      <div className={cn('h-full rounded-xl border bg-card p-4 shadow-sm', phone(PHONE.card))}>
        <div className={cn('mb-3 flex items-center justify-between', phone(PHONE.header))}>
          <Skeleton className={cn('h-9 w-9 rounded-lg', phone(PHONE.icon))} />
          <Skeleton className={cn('h-5 w-14 rounded-full', phone('max-sm:hidden'))} />
        </div>
        <Skeleton className={cn('mb-2 h-4 w-28', phone(PHONE.skeletonTitle))} />
        <Skeleton className={cn('mb-3 h-7 w-24', phone(PHONE.skeletonValue))} />
        <Skeleton className={cn('h-3 w-full', phone(PHONE.skeletonDescription))} />
      </div>
    )
  }

  const content = (
    <StatCardContent
      title={title}
      value={value}
      change={change}
      icon={icon}
      trend={trend}
      description={description}
      valuePrefix={valuePrefix}
      valueSuffix={valueSuffix}
      tone={tone}
      inlineHeaderOnMobile={inlineHeaderOnMobile}
      interactive={interactive}
    />
  )

  if (link) {
    return (
      <Link
        to={link.to}
        search={link.search}
        className='block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
      >
        {content}
      </Link>
    )
  }

  if (onClick) {
    return (
      <div
        role='button'
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onClick()
          }
        }}
        className='h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
      >
        {content}
      </div>
    )
  }

  return content
}
