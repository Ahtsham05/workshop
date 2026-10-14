import { useLayoutEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { useEngine } from '../engine-context'
import { parseNumber } from '../search'
import { CELL_CLASS, type CellProps } from './cell-props'
import { useCell } from './use-cell'

const round = (n: number, decimals?: number) =>
  decimals === undefined ? n : Math.round(n * 10 ** decimals) / 10 ** decimals

const show = (v: unknown, decimals?: number) =>
  v === null || v === undefined || v === '' || Number.isNaN(v)
    ? ''
    : decimals === undefined
      ? String(v)
      : String(round(Number(v), decimals))

/**
 * Quantity / rate / any number. While focused it keeps exactly what's typed ("12.", "0,5")
 * and writes the parsed number to the row on every keystroke, so totals stay live.
 */
export function NumberCell({ row, column, error, label, disabled }: CellProps) {
  const { store, t } = useEngine()
  const cell = useCell(row.id, column.key)
  const [draft, setDraft] = useState<string | null>(null)
  const value = row[column.key] as number | null | undefined
  const inputRef = useRef<HTMLInputElement | null>(null)
  const selectAll = useRef(false)

  // Focus copies the value into the draft; once that renders, select it so typing
  // replaces a pre-filled number (e.g. the quantity a product pick just filled in).
  useLayoutEffect(() => {
    if (!selectAll.current) return
    selectAll.current = false
    const el = inputRef.current
    if (el && document.activeElement === el) el.select()
  })

  /** −/+ : by 1, never below the column's minimum (1 by default). */
  const step = (by: 1 | -1) => {
    const current = Number(store.getState().rows[row.id]?.[column.key]) || 0
    const floor = column.min ?? 1
    const next = round(current + by, column.decimals)
    if (by < 0 && next < floor) return
    store.updateRow(row.id, { [column.key]: Math.max(next, floor) })
    setDraft((d) => (d === null ? null : show(Math.max(next, floor))))
  }

  const input = (
    <Input
      ref={(el) => {
        inputRef.current = el
        ;(cell.ref as (el: HTMLElement | null) => void)(el)
      }}
      type='text'
      inputMode='decimal'
      autoComplete='off'
      showVoiceInput={false}
      aria-label={label}
      aria-invalid={!!error || undefined}
      title={error}
      disabled={disabled}
      placeholder={column.placeholder}
      className={cn(
        CELL_CLASS,
        'tabular-nums',
        column.stepper
          ? 'h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-1 text-center font-semibold shadow-none focus-visible:ring-0 dark:bg-transparent'
          : 'text-right'
      )}
      value={draft ?? show(value, column.decimals)}
      onFocus={(e) => {
        cell.onFocus()
        // From the store, not props: focus can arrive (Enter after a product pick) before
        // this row has re-rendered with the values the pick just filled in.
        const fresh = store.getState().rows[row.id]?.[column.key]
        selectAll.current = true
        setDraft(show(fresh ?? value))
        e.currentTarget.select()
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d.,-]/g, '')
        setDraft(raw)
        store.updateRow(row.id, { [column.key]: parseNumber(raw) })
      }}
      onBlur={() => {
        if (
          value !== null &&
          value !== undefined &&
          column.decimals !== undefined
        ) {
          const r = round(Number(value), column.decimals)
          if (r !== value) store.updateRow(row.id, { [column.key]: r })
        }
        setDraft(null)
      }}
      onKeyDown={cell.onKeyDown}
    />
  )
  if (!column.stepper) return input
  // Like the invoice: nothing to count until the row has a product.
  if (!row.product)
    return (
      <div className='text-muted-foreground flex h-9 items-center px-2 text-sm'>
        —
      </div>
    )

  const stepButton = (by: 1 | -1) => (
    <button
      type='button'
      tabIndex={-1}
      disabled={disabled}
      aria-label={`${t(by > 0 ? 'Increase' : 'Decrease')} ${label}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => step(by)}
      className={cn(
        'text-muted-foreground hover:bg-muted hover:text-foreground flex h-full w-7 shrink-0 items-center justify-center transition-colors disabled:pointer-events-none',
        by > 0 ? 'border-l' : 'border-r'
      )}
    >
      {by > 0 ? (
        <Plus className='h-3.5 w-3.5' />
      ) : (
        <Minus className='h-3.5 w-3.5' />
      )}
    </button>
  )
  return (
    <div className='flex min-w-0 items-center gap-1.5'>
      <div
        className={cn(
          'border-input bg-background dark:bg-input/30 focus-within:border-input-ring focus-within:ring-input-ring/50 flex h-9 min-w-0 flex-1 items-center overflow-hidden rounded-md border focus-within:ring-2',
          error && 'border-destructive',
          disabled && 'opacity-50'
        )}
      >
        {stepButton(-1)}
        {input}
        {stepButton(1)}
      </div>
      <span className='text-muted-foreground w-8 shrink-0 truncate text-xs'>
        {row.unit || ''}
      </span>
    </div>
  )
}
