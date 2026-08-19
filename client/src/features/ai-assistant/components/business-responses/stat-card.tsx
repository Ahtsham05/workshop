import type { ReactNode } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { formatPercent } from '../../lib/format'

export interface BusinessStatItem {
  label: string
  value: string
}

export interface BusinessStatCardProps {
  icon?: ReactNode
  title: string
  value: string
  changePercent?: number | null
  changeLabel?: string
  stats?: BusinessStatItem[]
  chart?: ReactNode
}

/** The "headline number + delta + sub-stats" card — profit summary, cash & bank, purchase/expense totals. */
export function BusinessStatCard({ icon, title, value, changePercent, changeLabel, stats, chart }: BusinessStatCardProps) {
  const hasChange = changePercent !== undefined && changePercent !== null
  const isPositive = hasChange && changePercent! >= 0

  return (
    <div className='w-full max-w-sm rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md'>
      <div className='flex items-start justify-between gap-2'>
        <div>
          <p className='flex items-center gap-1.5 text-xs font-medium text-muted-foreground'>
            {icon}
            {title}
          </p>
          <p className='mt-1 text-2xl font-bold tabular-nums tracking-tight'>{value}</p>
        </div>
        {hasChange && (
          <Badge
            variant='secondary'
            className={cn(
              'gap-1 text-xs tabular-nums',
              isPositive
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
            )}
          >
            {isPositive ? <TrendingUp className='h-3 w-3' /> : <TrendingDown className='h-3 w-3' />}
            {formatPercent(changePercent)}
          </Badge>
        )}
      </div>
      {hasChange && changeLabel && <p className='mt-0.5 text-[11px] text-muted-foreground'>{changeLabel}</p>}

      {stats && stats.length > 0 && (
        <div className='mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3'>
          {stats.map((s) => (
            <div key={s.label} className='flex items-center justify-between gap-2 text-sm'>
              <span className='text-muted-foreground'>{s.label}</span>
              <span className='font-medium tabular-nums'>{s.value}</span>
            </div>
          ))}
        </div>
      )}

      {chart && <div className='mt-3 border-t pt-3'>{chart}</div>}
    </div>
  )
}
