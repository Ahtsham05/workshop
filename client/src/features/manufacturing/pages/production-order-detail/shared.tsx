import type { OperationStatus } from '@/stores/manufacturing.api'
import { cn } from '@/lib/utils'
import { fmtQty } from '../../lib/constants'

/*
 * Small components shared by the production-order detail tabs.
 */

export function Qty({
  value,
  unit,
  className,
}: {
  value: number
  unit?: string
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-baseline gap-1', className)}>
      <span className='tabular-nums'>{fmtQty(value)}</span>
      {unit && (
        <span className='text-muted-foreground text-xs font-normal'>
          {unit}
        </span>
      )}
    </span>
  )
}

export function EmptyLine({
  text,
  action,
}: {
  text: string
  action?: React.ReactNode
}) {
  return (
    <div className='text-muted-foreground flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center text-sm'>
      <span>{text}</span>
      {action}
    </div>
  )
}

/**
 * The step marker used on every timeline: ✓ done, ● running, ○ waiting, – skipped.
 * Colour follows state only.
 */
export function StepMarker({
  status,
  size = 'md',
}: {
  status: OperationStatus
  size?: 'sm' | 'md'
}) {
  const box = size === 'sm' ? 'h-4 w-4 text-[9px]' : 'h-6 w-6 text-[11px]'
  if (status === 'completed') {
    return (
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full bg-emerald-600 font-bold text-white',
          box
        )}
        aria-hidden
      >
        ✓
      </span>
    )
  }
  if (status === 'in_progress') {
    return (
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full border-2 border-amber-500 bg-amber-500/15',
          box
        )}
        aria-hidden
      >
        <span
          className={cn(
            'rounded-full bg-amber-500',
            size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2'
          )}
        />
      </span>
    )
  }
  if (status === 'skipped') {
    return (
      <span
        className={cn(
          'text-muted-foreground border-muted-foreground/40 flex shrink-0 items-center justify-center rounded-full border border-dashed',
          box
        )}
        aria-hidden
      >
        –
      </span>
    )
  }
  return (
    <span
      className={cn(
        'border-muted-foreground/40 bg-background flex shrink-0 rounded-full border-2',
        box
      )}
      aria-hidden
    />
  )
}
