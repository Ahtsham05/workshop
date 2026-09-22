import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { fitValueSize } from '@/lib/fit-value-size'
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
        <CardContent className='flex items-center gap-3 p-4 max-sm:p-3'>
          <Skeleton className='h-10 w-10 rounded-lg max-sm:h-8 max-sm:w-8' />
          {/* min-w-0 + max-w-full: the fixed-width bars must not push past a half-width phone tile */}
          <div className='min-w-0 flex-1 space-y-2'>
            <Skeleton className='h-3 w-20 max-w-full' />
            <Skeleton className='h-6 w-28 max-w-full' />
            <Skeleton className='h-3 w-24 max-w-full' />
          </div>
        </CardContent>
      </Card>
    )
  }

  // Phones (two tiles per row): the tile becomes a 2-column grid — icon beside the label on the first row, then
  // the value, the growth badge and the hint each on their own full-width row. The two wrapper divs are
  // `contents` so the label, badge, value and hint join that grid. All `max-sm:`: from 640px up the tile is
  // laid out exactly as before.
  const body = (
    <CardContent className='flex items-start gap-3 p-4 max-sm:@container max-sm:grid max-sm:grid-cols-[2rem_minmax(0,1fr)] max-sm:grid-rows-[minmax(2.25rem,auto)] max-sm:content-start max-sm:gap-x-2.5 max-sm:gap-y-0 max-sm:p-3'>
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', 'max-sm:col-start-1 max-sm:row-start-1 max-sm:h-8 max-sm:w-8 max-sm:self-center', TONE_CLASS[tone])}>
        <Icon className='h-5 w-5 max-sm:h-4 max-sm:w-4' aria-hidden />
      </div>
      <div className='min-w-0 flex-1 max-sm:contents'>
        <div className='flex items-center justify-between gap-2 max-sm:contents'>
          <p className='truncate text-xs text-muted-foreground max-sm:col-start-2 max-sm:row-start-1 max-sm:line-clamp-2 max-sm:self-center max-sm:whitespace-normal max-sm:break-words max-sm:text-[13px] max-sm:leading-snug max-sm:font-medium max-sm:text-foreground/85'>{label}</p>
          {growth !== undefined || isNew ? (
            <GrowthIndicator
              value={growth ?? null}
              isNew={isNew}
              invert={invertGrowth}
              className='max-sm:col-span-2 max-sm:row-start-3 max-sm:mt-1 max-sm:justify-self-start'
            />
          ) : null}
        </div>
        <p
          className='truncate text-xl font-semibold max-sm:col-span-2 max-sm:row-start-2 max-sm:mt-2 max-sm:whitespace-nowrap max-sm:[font-size:var(--tile-fit)]'
          style={{ '--tile-fit': fitValueSize(value) } as React.CSSProperties}
        >
          {value}
        </p>
        {hint ? <div className='truncate text-[11px] text-muted-foreground max-sm:col-span-2 max-sm:row-start-4 max-sm:mt-0.5 max-sm:line-clamp-2 max-sm:whitespace-normal'>{hint}</div> : null}
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
