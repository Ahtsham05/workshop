import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { GrowthIndicator } from './analytics-badges'

type Tone = 'default' | 'success' | 'warning' | 'danger' | 'info'

const TONE_CLASS: Record<Tone, string> = {
  default: 'text-primary bg-primary/10',
  success: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
  warning: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
  danger: 'text-rose-600 dark:text-rose-400 bg-rose-500/10',
  info: 'text-sky-600 dark:text-sky-400 bg-sky-500/10',
}

interface KpiTileProps {
  label: string
  value: string
  icon: LucideIcon
  tone?: Tone
  /** % change vs the previous period (null = no base to compare). */
  growth?: number | null
  isNew?: boolean
  invertGrowth?: boolean
  hint?: ReactNode
  loading?: boolean
  onClick?: () => void
}

/** Headline number — same card language as the Invoice/Purchase list stat cards. */
export function KpiTile({ label, value, icon: Icon, tone = 'default', growth, isNew, invertGrowth, hint, loading, onClick }: KpiTileProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className='flex items-center gap-3 p-4'>
          <Skeleton className='h-10 w-10 rounded-lg' />
          <div className='flex-1 space-y-2'>
            <Skeleton className='h-3 w-20' />
            <Skeleton className='h-6 w-28' />
            <Skeleton className='h-3 w-24' />
          </div>
        </CardContent>
      </Card>
    )
  }

  const body = (
    <CardContent className='flex items-start gap-3 p-4'>
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', TONE_CLASS[tone])}>
        <Icon className='h-5 w-5' aria-hidden />
      </div>
      <div className='min-w-0 flex-1'>
        <div className='flex items-center justify-between gap-2'>
          <p className='truncate text-xs text-muted-foreground'>{label}</p>
          {growth !== undefined || isNew ? <GrowthIndicator value={growth ?? null} isNew={isNew} invert={invertGrowth} /> : null}
        </div>
        <p className='truncate text-xl font-semibold'>{value}</p>
        {hint ? <div className='truncate text-[11px] text-muted-foreground'>{hint}</div> : null}
      </div>
    </CardContent>
  )

  if (onClick) {
    return (
      <Card
        role='button'
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onClick()
          }
        }}
        className='cursor-pointer transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      >
        {body}
      </Card>
    )
  }
  return <Card>{body}</Card>
}
