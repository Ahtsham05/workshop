import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  STAT_CARD_TONE_STYLES,
  type StatCardTone,
} from '@/lib/stat-card-tones'

export type { StatCardTone }

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
  /** Soft gradient + accent — defaults to slate */
  tone?: StatCardTone
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
}: StatCardProps) {
  const isPositive = trend === 'up' || (change !== undefined && change >= 0)
  const styles = STAT_CARD_TONE_STYLES[tone]

  if (isLoading) {
    return (
      <Card
        className={cn(
          'hover:shadow-md transition-shadow duration-200',
          styles.card
        )}
      >
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

  return (
    <Card
      className={cn(
        'hover:shadow-md transition-shadow duration-200',
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
                className={`flex items-center gap-1 ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
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
