import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Calculator, Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { isExpression, tryEvaluate } from '../lib/expression'
import { sendToCalculator } from '../lib/calculator-store'
import { formatNumber } from '../lib/tool-helpers'

/* ── Input field ─────────────────────────────────────────────────────────── */

const inputClass =
  'placeholder:text-muted-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 text-sm tabular-nums shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-input-ring focus-visible:ring-[3px] focus-visible:ring-input-ring/50 aria-invalid:border-destructive'

interface CalcFieldProps {
  label: string
  value: string
  onChange: (raw: string) => void
  /** Shown inside the box on the right: "%", "Rs", "months"… */
  suffix?: string
  prefix?: string
  placeholder?: string
  hint?: ReactNode
  autoFocus?: boolean
  /** Highlighted when this is the value the tool is solving from. */
  active?: boolean
  onFocus?: () => void
  className?: string
}

/**
 * A number box that also takes arithmetic: "4500+350" (cost plus freight), "1200*12",
 * "18%"... The evaluated value is shown under the box while it is an expression, and the
 * box is marked invalid only once the person has stopped typing something unfinished.
 */
export function CalcField({ label, value, onChange, suffix, prefix, placeholder, hint, autoFocus, active, onFocus, className }: CalcFieldProps) {
  const id = useId()
  const parsed = tryEvaluate(value)
  const invalid = value.trim() !== '' && parsed === null
  const showResult = parsed !== null && isExpression(value)

  return (
    <div className={cn('min-w-0 space-y-1', className)}>
      <label htmlFor={id} className={cn('block text-[11px] font-medium text-muted-foreground', active && 'text-primary')}>
        {label}
      </label>
      <div className='relative'>
        {prefix && (
          <span className='pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground'>{prefix}</span>
        )}
        <input
          id={id}
          type='text'
          inputMode='decimal'
          autoComplete='off'
          spellCheck={false}
          autoFocus={autoFocus}
          value={value}
          placeholder={placeholder ?? '0'}
          aria-invalid={invalid || undefined}
          onFocus={(event) => {
            event.currentTarget.select()
            onFocus?.()
          }}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            // Enter turns a typed sum into its result, like pressing = on a calculator.
            if (event.key === 'Enter' && showResult && parsed !== null) {
              event.preventDefault()
              onChange(String(parsed))
            }
          }}
          className={cn(inputClass, prefix && 'ps-9', suffix && 'pe-12', active && 'border-primary/60 bg-primary/5')}
        />
        {suffix && (
          <span className='pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground'>{suffix}</span>
        )}
      </div>
      {showResult ? (
        <p className='text-[11px] tabular-nums text-muted-foreground'>= {formatNumber(parsed, { decimals: 4, trim: true })}</p>
      ) : invalid ? (
        <p className='text-[11px] text-destructive'>Not a number</p>
      ) : hint ? (
        <p className='text-[11px] text-muted-foreground'>{hint}</p>
      ) : null}
    </div>
  )
}

/* ── Quick-pick chips ────────────────────────────────────────────────────── */

export function PresetChips({ values, onPick, suffix = '%', current }: { values: number[]; onPick: (value: number) => void; suffix?: string; current?: number | null }) {
  return (
    <div className='flex flex-wrap gap-1'>
      {values.map((value) => (
        <button
          key={value}
          type='button'
          onClick={() => onPick(value)}
          className={cn(
            'rounded-full border px-2 py-0.5 text-[11px] tabular-nums transition-colors hover:bg-accent',
            current === value && 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
          )}
        >
          {value}
          {suffix}
        </button>
      ))}
    </div>
  )
}

/* ── Segmented choice ────────────────────────────────────────────────────── */

export function Segmented<T extends string>({ value, options, onChange, className }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; className?: string }) {
  return (
    <div role='radiogroup' className={cn('grid gap-1 rounded-lg bg-muted p-1', className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => (
        <button
          key={option.value}
          type='button'
          role='radio'
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'min-w-0 truncate rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors',
            value === option.value ? 'bg-background text-foreground shadow-sm' : 'hover:text-foreground'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/* ── Results ─────────────────────────────────────────────────────────────── */

interface ResultRowProps {
  label: string
  value: number | null | undefined
  /** How to print the value; defaults to a 2-decimal number. */
  format?: (value: number) => string
  emphasis?: boolean
  tone?: 'default' | 'positive' | 'negative'
  note?: ReactNode
}

/** One answer line. Click the number to copy it; the calculator icon sends it to the keypad. */
export function ResultRow({ label, value, format = (v) => formatNumber(v), emphasis, tone = 'default', note }: ResultRowProps) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current)
  }, [])
  const hasValue = value != null && Number.isFinite(value)

  const copy = useCallback(() => {
    if (!hasValue) return
    const text = String(value)
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true)
        if (timer.current) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setCopied(false), 1200)
      },
      () => toast.error('Could not copy to the clipboard')
    )
  }, [hasValue, value])

  return (
    <div className={cn('group flex items-center gap-2 px-3 py-1.5', emphasis && 'bg-primary/5 py-2')}>
      <div className='min-w-0 flex-1'>
        <p className={cn('truncate text-xs text-muted-foreground', emphasis && 'font-medium text-foreground')}>{label}</p>
        {note && <p className='truncate text-[10px] text-muted-foreground'>{note}</p>}
      </div>
      <button
        type='button'
        onClick={copy}
        disabled={!hasValue}
        title={hasValue ? 'Copy' : undefined}
        className={cn(
          'flex min-w-0 items-center gap-1 rounded px-1 text-end tabular-nums transition-colors enabled:hover:bg-accent',
          emphasis ? 'text-base font-bold' : 'text-sm font-semibold',
          tone === 'positive' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'negative' && 'text-red-600 dark:text-red-400'
        )}
      >
        <span className='truncate'>{hasValue ? format(value) : '—'}</span>
        {hasValue &&
          (copied ? (
            <Check className='size-3 shrink-0 text-emerald-600' />
          ) : (
            <Copy className='size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60' />
          ))}
      </button>
      <button
        type='button'
        disabled={!hasValue}
        onClick={() => hasValue && sendToCalculator(value)}
        title='Use in calculator'
        aria-label={`Use ${label} in calculator`}
        className='shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 disabled:hidden'
      >
        <Calculator className='size-3.5' />
      </button>
    </div>
  )
}

export function ResultCard({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-lg border bg-muted/30 divide-y', className)}>
      {title && <p className='bg-muted/50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'>{title}</p>}
      {children}
    </div>
  )
}

export function ToolIntro({ children }: { children: ReactNode }) {
  return <p className='text-[11px] leading-relaxed text-muted-foreground'>{children}</p>
}

export function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button type='button' onClick={onClick} className='text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline'>
      Clear
    </button>
  )
}
