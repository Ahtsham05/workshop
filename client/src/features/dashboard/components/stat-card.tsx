import { Link } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  STAT_CARD_TONE_STYLES,
  type StatCardTone,
} from '@/lib/stat-card-tones'

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
  /** Dark gradient + accent — defaults to slate */
  tone?: StatCardTone
  /** Navigate to a related page or report */
  link?: StatCardLink
  onClick?: () => void
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
  const isPositive = trend === 'up' || (change !== undefined && change >= 0)
  const styles = STAT_CARD_TONE_STYLES[tone]

  return (
    <Card
      className={cn(
        'transition-all duration-200',
        interactive ? 'hover:shadow-lg hover:-translate-y-0.5' : 'hover:shadow-md',
        styles.card
      )}
    >
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
        <CardTitle className='text-sm font-medium'>{title}</CardTitle>
        <div className={cn('shrink-0', styles.iconWrap)}>{icon}</div>
      </CardHeader>
      <CardContent>
        <div className='text-2xl font-bold tracking-tight'>
          {valuePrefix}
          {typeof value === 'number' ? value.toLocaleString() : value}
          {valueSuffix}
        </div>
        {(change !== undefined || description) && (
          <div className='mt-1 flex items-center gap-2 text-xs text-muted-foreground'>
            {change !== undefined && (
              <div
                className={`flex items-center gap-1 ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}
              >
                {isPositive ? (
                  <TrendingUp className='h-3 w-3' />
                ) : (
                  <TrendingDown className='h-3 w-3' />
                )}
                <span className='font-medium'>
                  {Math.abs(change).toFixed(1)}%
                </span>
              </div>
            )}
            {description && <span>{description}</span>}
          </div>
        )}
      </CardContent>
    </Card>
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
  const styles = STAT_CARD_TONE_STYLES[tone]
  const interactive = Boolean(link || onClick)

  if (isLoading) {
    return (
      <Card className={cn('hover:shadow-md transition-shadow duration-200', styles.card)}>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-sm font-medium'>
            <Skeleton className={cn('h-4 w-24', styles.skeleton)} />
          </CardTitle>
          <Skeleton className={cn('h-9 w-9 rounded-xl', styles.skeleton)} />
        </CardHeader>
        <CardContent>
          <Skeleton className={cn('mb-2 h-8 w-32', styles.skeleton)} />
          <Skeleton className={cn('h-3 w-40', styles.skeleton)} />
        </CardContent>
      </Card>
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
        className='block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
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
        className='cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
      >
        {content}
      </div>
    )
  }

  return content
}
