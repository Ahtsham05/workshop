import { cn } from '@/lib/utils'
import { TONE_BAR_CLASS, TONE_TEXT_CLASS, type getRowStat } from '../utils/insight-display'

export type Tone = ReturnType<typeof getRowStat>['tone']

const toneBar = (tone?: Tone) => (tone ? TONE_BAR_CLASS[tone] : undefined) || 'bg-primary/70'
const toneText = (tone?: Tone) => (tone ? TONE_TEXT_CLASS[tone] : undefined) || 'text-foreground'

/** Big colored number — the "answer" a card leads with, before any explanatory sentence. */
export function HeroStat({
  value,
  unit,
  tone,
  className,
}: {
  value: string
  unit?: string
  tone?: Tone
  className?: string
}) {
  return (
    <div className={cn('flex items-baseline gap-1.5', className)}>
      <span className={cn('text-2xl font-bold tabular-nums tracking-tight', toneText(tone))}>{value}</span>
      {unit && <span className='text-xs font-medium text-muted-foreground'>{unit}</span>}
    </div>
  )
}

/** Single-value gauge (e.g. stock vs reorder point, days remaining vs risk window). */
export function LevelBar({
  value,
  max,
  tone,
  caption,
}: {
  value: number
  max: number
  tone: Tone
  caption?: string
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div>
      <div className='h-2 w-full overflow-hidden rounded-full bg-muted'>
        <div className={cn('h-full rounded-full transition-all', toneBar(tone))} style={{ width: `${pct}%` }} />
      </div>
      {caption && <p className='mt-1.5 text-[11px] text-muted-foreground'>{caption}</p>}
    </div>
  )
}

export interface RankRow {
  key: string
  label: string
  value: number
  display: string
  barClassName?: string
  toneText?: string
}

/** Ranked horizontal bars, scaled to the largest value in the set — for "which of these matters most". */
export function RankBarList({ rows, max: maxOverride }: { rows: RankRow[]; max?: number }) {
  const max = maxOverride ?? Math.max(1, ...rows.map((r) => Math.abs(r.value)))
  return (
    <div className='space-y-1.5'>
      {rows.map((row) => {
        const pct = max > 0 ? Math.max(2, Math.min(100, (Math.abs(row.value) / max) * 100)) : 2
        return (
          <div key={row.key} className='grid grid-cols-[minmax(0,1fr)_92px_auto] items-center gap-2.5'>
            <span className='min-w-0 truncate text-xs font-medium'>{row.label}</span>
            <span className='h-1.5 overflow-hidden rounded-full bg-muted'>
              <span
                className={cn('block h-full rounded-full', row.barClassName || 'bg-primary/70')}
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className={cn('text-xs font-semibold tabular-nums', row.toneText)}>{row.display}</span>
          </div>
        )
      })}
    </div>
  )
}

export interface DivergingRow {
  key: string
  label: string
  value: number // signed
  display: string
}

/** Zero-anchored bars for mixed up/down movement (growth vs decline) in one glance. */
export function DivergingBarList({ rows }: { rows: DivergingRow[] }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)))
  return (
    <div className='space-y-1.5'>
      {rows.map((row) => {
        const pct = Math.max(2, Math.min(100, (Math.abs(row.value) / max) * 100))
        const positive = row.value >= 0
        return (
          <div key={row.key} className='grid grid-cols-[64px_1fr_1fr_48px] items-center gap-1.5 text-[11px]'>
            <span className='truncate font-medium'>{row.label}</span>
            <span className='flex h-1.5 justify-end overflow-hidden rounded-l-full bg-muted'>
              {!positive && <span className='block h-full rounded-l-full bg-red-500' style={{ width: `${pct}%` }} />}
            </span>
            <span className='flex h-1.5 overflow-hidden rounded-r-full bg-muted'>
              {positive && <span className='block h-full rounded-r-full bg-emerald-500' style={{ width: `${pct}%` }} />}
            </span>
            <span className={cn('text-right font-semibold tabular-nums', positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
              {row.display}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Before/after pair of vertical bars — the clearest way to show "this changed". */
export function TwoBarCompare({
  leftLabel,
  leftValue,
  leftDisplay,
  rightLabel,
  rightValue,
  rightDisplay,
  rightTone,
}: {
  leftLabel: string
  leftValue: number
  leftDisplay: string
  rightLabel: string
  rightValue: number
  rightDisplay: string
  rightTone: Tone
}) {
  const max = Math.max(1, Math.abs(leftValue), Math.abs(rightValue))
  const leftPct = Math.max(4, Math.min(100, (Math.abs(leftValue) / max) * 100))
  const rightPct = Math.max(4, Math.min(100, (Math.abs(rightValue) / max) * 100))
  return (
    <div className='flex h-16 items-end gap-3 pt-1'>
      <div className='flex h-full flex-1 flex-col items-center justify-end gap-1.5'>
        <div className='w-full rounded-t-md rounded-b-sm bg-muted-foreground/25' style={{ height: `${leftPct}%` }} />
        <span className='text-[10.5px] font-medium tabular-nums text-muted-foreground'>{leftDisplay}</span>
        <span className='text-[10px] text-muted-foreground'>{leftLabel}</span>
      </div>
      <div className='flex h-full flex-1 flex-col items-center justify-end gap-1.5'>
        <div className={cn('w-full rounded-t-md rounded-b-sm', toneBar(rightTone))} style={{ height: `${rightPct}%` }} />
        <span className={cn('text-[10.5px] font-semibold tabular-nums', toneText(rightTone))}>{rightDisplay}</span>
        <span className='text-[10px] text-muted-foreground'>{rightLabel}</span>
      </div>
    </div>
  )
}

/** Single-proportion donut (share of a whole) — e.g. "62% of revenue from top 3 customers". */
export function MiniDonut({ percent, tone, centerLabel }: { percent: number; tone: Tone; centerLabel: string }) {
  const pct = Math.max(0, Math.min(100, percent))
  const color = tone === 'high' ? '#ef4444' : tone === 'medium' ? '#f59e0b' : tone === 'good' ? '#10b981' : '#3b82f6'
  return (
    <div
      className='flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-full'
      style={{ background: `conic-gradient(${color} ${pct}%, var(--muted) ${pct}% 100%)` }}
    >
      <div className='flex h-[48px] w-[48px] items-center justify-center rounded-full bg-card'>
        <span className='text-sm font-bold tabular-nums'>{Math.round(pct)}%</span>
      </div>
      <span className='sr-only'>{centerLabel}</span>
    </div>
  )
}
