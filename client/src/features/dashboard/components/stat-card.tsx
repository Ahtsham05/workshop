import { Link } from '@tanstack/react-router'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
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
  interactive = false,
}: Omit<StatCardProps, 'isLoading' | 'link' | 'onClick'> & { interactive?: boolean }) {
  const color = toneColor(tone)
  const isPositive = trend === 'up' || (change !== undefined && change >= 0)
  const displayValue = formatValue(value, valuePrefix, valueSuffix)
  const barWidth =
    change !== undefined ? Math.min(Math.abs(change), 100) : null

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col rounded-xl border bg-card p-4 text-left shadow-sm transition-all',
        interactive && 'group cursor-pointer hover:border-primary/50 hover:shadow-md',
      )}
    >
      <div className='mb-3 flex items-center justify-between gap-2'>
        <span
          className='inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white [&_svg]:h-4 [&_svg]:w-4'
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

      <p className='mb-0.5 line-clamp-2 text-sm font-semibold leading-tight'>{title}</p>
      <p className='text-xl font-bold tabular-nums' style={{ color }}>
        {displayValue}
      </p>

      {description && (
        <p className='mt-2 line-clamp-2 text-xs text-muted-foreground'>{description}</p>
      )}

      {barWidth !== null && (
        <div className='mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted'>
          <div
            className='h-full rounded-full transition-all'
            style={{ width: `${barWidth}%`, backgroundColor: color }}
          />
        </div>
      )}

      {interactive && (
        <p className='mt-1.5 text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100'>
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
}: StatCardProps) {
  const interactive = Boolean(link || onClick)

  if (isLoading) {
    return (
      <div className='h-full rounded-xl border bg-card p-4 shadow-sm'>
        <div className='mb-3 flex items-center justify-between'>
          <Skeleton className='h-9 w-9 rounded-lg' />
          <Skeleton className='h-5 w-14 rounded-full' />
        </div>
        <Skeleton className='mb-2 h-4 w-28' />
        <Skeleton className='mb-3 h-7 w-24' />
        <Skeleton className='h-3 w-full' />
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
