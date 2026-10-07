import { useState } from 'react'
import { BarChart3, Table2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Card } from '@/components/ui/card'
import './viz.css'

/*
 * Chart building blocks for the Manufacturing dashboard. Rules (applied everywhere):
 * thin marks, hairline solid grid, text in text colours (never the series colour),
 * a legend whenever there are two or more series, a value-first tooltip, and a table
 * view for every chart so no value is reachable only by hovering.
 */

export interface LegendItem {
  label: string
  color: string
  kind?: 'bar' | 'line'
}

function Key({
  color,
  kind = 'bar',
}: {
  color: string
  kind?: 'bar' | 'line'
}) {
  return kind === 'line' ? (
    <span
      className='inline-block h-0.5 w-3 rounded-full'
      style={{ background: color }}
      aria-hidden
    />
  ) : (
    <span
      className='inline-block h-2.5 w-2.5 rounded-[3px]'
      style={{ background: color }}
      aria-hidden
    />
  )
}

export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className='text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs'>
      {items.map((item) => (
        <li key={item.label} className='flex items-center gap-1.5'>
          <Key color={item.color} kind={item.kind} />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

/** Tooltip body: the value leads, the series name follows, keyed by a short stroke. */
export function TooltipCard({
  title,
  rows,
  footer,
}: {
  title: React.ReactNode
  rows: { label: string; value: React.ReactNode; color?: string }[]
  footer?: React.ReactNode
}) {
  return (
    <div className='bg-popover text-popover-foreground min-w-36 rounded-md border px-3 py-2 text-xs shadow-sm'>
      <div className='text-muted-foreground mb-1'>{title}</div>
      <ul className='space-y-0.5'>
        {rows.map((r) => (
          <li key={r.label} className='flex items-center gap-2'>
            {r.color && <Key color={r.color} kind='line' />}
            <span className='text-foreground font-semibold tabular-nums'>
              {r.value}
            </span>
            <span className='text-muted-foreground'>{r.label}</span>
          </li>
        ))}
      </ul>
      {footer && (
        <div className='text-muted-foreground mt-1 border-t pt-1'>{footer}</div>
      )}
    </div>
  )
}

/**
 * A chart card: title, one-line takeaway, legend, and a Chart / Table switch so every
 * value is also readable without hovering (and by screen readers).
 */
export function ChartPanel({
  title,
  description,
  legend,
  table,
  empty,
  emptyText,
  height = 240,
  fetching,
  fill,
  className,
  children,
}: {
  title: string
  description?: React.ReactNode
  legend?: LegendItem[]
  table: React.ReactNode
  empty?: boolean
  emptyText?: string
  /** Plot height in px, x-axis band included. */
  height?: number
  fetching?: boolean
  /** Stretch to the grid row (the plot grows; `height` becomes its minimum). */
  fill?: boolean
  className?: string
  children: React.ReactNode
}) {
  const { t } = useLanguage()
  const [view, setView] = useState<'chart' | 'table'>('chart')
  return (
    <Card
      className={cn('mfg-viz min-w-0 gap-0 py-0', fill && 'h-full', className)}
    >
      <div className='flex items-start justify-between gap-3 px-5 pt-4 max-sm:px-4'>
        <div className='min-w-0'>
          <h3 className='text-sm font-semibold'>{title}</h3>
          {description && (
            <p className='text-muted-foreground mt-0.5 text-xs'>
              {description}
            </p>
          )}
        </div>
        <div
          className='bg-muted inline-flex shrink-0 rounded-md p-0.5'
          role='group'
          aria-label={t('{{title}} view').replace('{{title}}', title)}
        >
          {(
            [
              ['chart', BarChart3, t('Chart')],
              ['table', Table2, t('Table')],
            ] as const
          ).map(([key, Icon, label]) => (
            <button
              key={key}
              type='button'
              aria-pressed={view === key}
              aria-label={label}
              title={label}
              onClick={() => setView(key)}
              className={cn(
                'focus-visible:ring-ring flex h-7 w-7 items-center justify-center rounded outline-none focus-visible:ring-2',
                view === key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className='h-3.5 w-3.5' />
            </button>
          ))}
        </div>
      </div>
      {legend && legend.length > 1 && view === 'chart' && !empty && (
        <div className='px-5 pt-3 max-sm:px-4'>
          <ChartLegend items={legend} />
        </div>
      )}
      <div
        className={cn(
          'px-2 pt-3 pb-3 transition-opacity',
          fill && 'flex flex-1 flex-col',
          fetching && 'opacity-60'
        )}
      >
        {empty ? (
          <div
            className='text-muted-foreground flex items-center justify-center px-6 text-center text-sm'
            style={{ height }}
          >
            {emptyText || t('No data for this period.')}
          </div>
        ) : view === 'chart' ? (
          <div
            style={fill ? { minHeight: height } : { height }}
            className={cn('w-full', fill && 'flex-1')}
          >
            {children}
          </div>
        ) : (
          <div className='max-h-80 overflow-auto px-3'>{table}</div>
        )}
      </div>
    </Card>
  )
}

/** The table-view twin of a chart. First column is the label; the rest right-aligned. */
export function MiniTable({
  head,
  rows,
}: {
  head: string[]
  rows: React.ReactNode[][]
}) {
  return (
    <table className='w-full text-sm'>
      <thead className='bg-card sticky top-0'>
        <tr className='text-muted-foreground border-b text-xs'>
          {head.map((h, i) => (
            <th
              key={h}
              scope='col'
              className={cn(
                'py-2 font-medium',
                i === 0 ? 'text-left' : 'text-right'
              )}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} className='border-b last:border-0'>
            {r.map((cell, ci) => (
              <td
                key={ci}
                className={cn(
                  'py-1.5',
                  ci === 0 ? 'pr-3 text-left' : 'pl-3 text-right tabular-nums'
                )}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
