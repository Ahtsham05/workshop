import { useState, type ReactNode } from 'react'
import { BarChart3, Table2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { CHART_VARS } from '../lib/chart-tokens'

interface ChartCardProps {
  title: string
  description?: ReactNode
  actions?: ReactNode
  legend?: ReactNode
  loading?: boolean
  refreshing?: boolean
  empty?: boolean
  emptyText?: string
  height?: number
  chart: ReactNode
  table: ReactNode
  className?: string
}

/** A chart with a one-click table twin, and a held (dimmed) frame while refetching. */
export function ChartCard({
  title,
  description,
  actions,
  legend,
  loading,
  refreshing,
  empty,
  emptyText,
  height = 260,
  chart,
  table,
  className,
}: ChartCardProps) {
  const { t } = useLanguage()
  const [view, setView] = useState<'chart' | 'table'>('chart')

  return (
    <Card className={cn('gap-0', className)}>
      <CardHeader className='flex flex-row flex-wrap items-start justify-between gap-2 pb-3'>
        <div className='min-w-0'>
          <CardTitle className='text-base'>{title}</CardTitle>
          {description ? <CardDescription className='mt-0.5 text-xs'>{description}</CardDescription> : null}
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          {actions}
          <div className='flex rounded-md border p-0.5'>
            <Button
              type='button'
              size='icon'
              variant={view === 'chart' ? 'secondary' : 'ghost'}
              className='h-7 w-7'
              aria-label={t('Show chart')}
              aria-pressed={view === 'chart'}
              onClick={() => setView('chart')}
            >
              <BarChart3 className='h-3.5 w-3.5' />
            </Button>
            <Button
              type='button'
              size='icon'
              variant={view === 'table' ? 'secondary' : 'ghost'}
              className='h-7 w-7'
              aria-label={t('Show table')}
              aria-pressed={view === 'table'}
              onClick={() => setView('table')}
            >
              <Table2 className='h-3.5 w-3.5' />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className={cn(CHART_VARS, 'transition-opacity', refreshing && 'opacity-60')} aria-busy={refreshing}>
        {loading ? (
          <Skeleton className='w-full' style={{ height }} />
        ) : empty ? (
          <div className='flex items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground' style={{ height }}>
            {emptyText || t('No data for this period')}
          </div>
        ) : view === 'chart' ? (
          <>
            {legend ? <div className='mb-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground'>{legend}</div> : null}
            <div style={{ height }}>{chart}</div>
          </>
        ) : (
          <div className='overflow-auto' style={{ maxHeight: height + 24 }}>
            {table}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Legend key: a swatch shaped like the mark it names (bar = square, line = short stroke). */
export function LegendKey({ color, label, shape = 'bar' }: { color: string; label: string; shape?: 'bar' | 'line' }) {
  return (
    <span className='inline-flex items-center gap-1.5'>
      {shape === 'bar' ? (
        <span className='h-2.5 w-2.5 rounded-[3px]' style={{ backgroundColor: color }} aria-hidden />
      ) : (
        <span className='h-0.5 w-3.5 rounded-full' style={{ backgroundColor: color }} aria-hidden />
      )}
      <span>{label}</span>
    </span>
  )
}

interface TooltipRow {
  label: string
  value: string
  color?: string
  shape?: 'bar' | 'line'
}

/** Values lead, series names follow; keyed with a short stroke of the series color. */
export function ChartTooltipBox({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className='min-w-[150px] rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md'>
      <p className='mb-1.5 text-xs text-muted-foreground'>{title}</p>
      <div className='space-y-1'>
        {rows.map((row) => (
          <div key={row.label} className='flex items-center gap-2'>
            {row.color ? <span className='h-0.5 w-3 shrink-0 rounded-full' style={{ backgroundColor: row.color }} aria-hidden /> : null}
            <span className='text-sm font-semibold tabular-nums'>{row.value}</span>
            <span className='text-xs text-muted-foreground'>{row.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
