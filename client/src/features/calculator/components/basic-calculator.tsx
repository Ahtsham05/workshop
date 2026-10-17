import { useCallback, useEffect, useRef, useState } from 'react'
import { Delete, History, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { evaluateExpression, ExpressionError, isExpression, roundFloat, tryEvaluate } from '../lib/expression'
import { useCalculatorState } from '../lib/calculator-store'
import { formatNumber, usePersistentState } from '../lib/tool-helpers'

interface TapeEntry {
  expr: string
  result: number
}

const OPERATORS = new Set(['+', '-', '×', '÷', '^'])
const MAX_TAPE = 50

/** Turns a number into calculator display text without float noise or forced decimals. */
const toDisplay = (value: number) => String(roundFloat(value))

/** Shows the expression with friendly operators; the parser accepts both spellings. */
const prettify = (expr: string) => expr.replace(/\*/g, '×').replace(/\//g, '÷')

type Key =
  | { label: string; kind: 'digit' | 'op' | 'pct' | 'dot' | 'equals' | 'clear' | 'back' | 'sign' | 'mem'; value?: string; title?: string }

const KEYS: Key[] = [
  { label: 'MC', kind: 'mem', value: 'mc', title: 'Memory clear' },
  { label: 'MR', kind: 'mem', value: 'mr', title: 'Memory recall' },
  { label: 'M+', kind: 'mem', value: 'm+', title: 'Add to memory' },
  { label: 'M−', kind: 'mem', value: 'm-', title: 'Subtract from memory' },
  { label: 'C', kind: 'clear', title: 'Clear (Delete)' },
  { label: '⌫', kind: 'back', title: 'Backspace' },
  { label: '%', kind: 'pct', title: '200 + 10% = 220' },
  { label: '÷', kind: 'op', value: '÷' },
  { label: '7', kind: 'digit' },
  { label: '8', kind: 'digit' },
  { label: '9', kind: 'digit' },
  { label: '×', kind: 'op', value: '×' },
  { label: '4', kind: 'digit' },
  { label: '5', kind: 'digit' },
  { label: '6', kind: 'digit' },
  { label: '−', kind: 'op', value: '-' },
  { label: '1', kind: 'digit' },
  { label: '2', kind: 'digit' },
  { label: '3', kind: 'digit' },
  { label: '+', kind: 'op', value: '+' },
  { label: '±', kind: 'sign', title: 'Change sign' },
  { label: '0', kind: 'digit' },
  { label: '.', kind: 'dot' },
  { label: '=', kind: 'equals', title: 'Equals (Enter)' },
]

/**
 * The everyday keypad calculator. The display is a real text field, so typing, pasting,
 * the caret and the keyboard all work natively; the on-screen keys insert at the caret and
 * never steal focus from it. Every "=" lands on a tape (with a grand total — the GT key of a
 * shop calculator) that survives closing the window.
 */
export function BasicCalculator() {
  const { injected, openSeq } = useCalculatorState()
  const [expr, setExpr] = useState('')
  const [justEvaluated, setJustEvaluated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [store, setStore] = usePersistentState<{ tape: TapeEntry[]; memory: number | null }>('basic', { tape: [], memory: null })
  const [showTape, setShowTape] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const focusInput = useCallback(() => {
    // After React has committed the new value, so the caret can go to its end.
    requestAnimationFrame(() => {
      const input = inputRef.current
      if (!input) return
      input.focus({ preventScroll: true })
    })
  }, [])

  // Re-focus the display whenever the window is (re)opened.
  useEffect(() => {
    focusInput()
  }, [openSeq, focusInput])

  // "Use in calculator" from a business tool.
  useEffect(() => {
    if (!injected) return
    setExpr(toDisplay(injected.value))
    setJustEvaluated(true)
    setError(null)
    setShowTape(false)
    focusInput()
  }, [injected, focusInput])

  const preview = isExpression(expr) ? tryEvaluate(expr) : null

  /** Inserts text at the caret (or replaces the selection), like typing it would. */
  const insert = useCallback(
    (text: string, { startFresh = false }: { startFresh?: boolean } = {}) => {
      const input = inputRef.current
      setError(null)
      setExpr((current) => {
        const base = startFresh ? '' : current
        const start = startFresh ? 0 : (input?.selectionStart ?? base.length)
        const end = startFresh ? 0 : (input?.selectionEnd ?? base.length)
        const next = base.slice(0, start) + text + base.slice(end)
        requestAnimationFrame(() => {
          const caret = start + text.length
          inputRef.current?.setSelectionRange(caret, caret)
        })
        return next
      })
      setJustEvaluated(false)
      focusInput()
    },
    [focusInput]
  )

  const evaluate = useCallback(() => {
    if (!expr.trim()) return
    try {
      const result = evaluateExpression(expr)
      if (isExpression(expr)) {
        setStore((current) => ({ ...current, tape: [{ expr: prettify(expr), result }, ...current.tape].slice(0, MAX_TAPE) }))
      }
      setExpr(toDisplay(result))
      setJustEvaluated(true)
      setError(null)
    } catch (err) {
      setError(err instanceof ExpressionError ? err.message : 'Invalid')
    }
    focusInput()
  }, [expr, focusInput, setStore])

  const clear = useCallback(() => {
    setExpr('')
    setError(null)
    setJustEvaluated(false)
    focusInput()
  }, [focusInput])

  const toggleSign = useCallback(() => {
    // Flips the sign of the last number in the expression.
    setExpr((current) => {
      const match = current.match(/(^|[^\d.)])(-?)(\d*\.?\d+%?)$/)
      if (!match) return current
      const [whole, lead, minus, digits] = match
      const head = current.slice(0, current.length - whole.length)
      return `${head}${lead}${minus ? '' : '-'}${digits}`
    })
    setJustEvaluated(false)
    focusInput()
  }, [focusInput])

  const currentValue = () => tryEvaluate(expr) ?? 0

  const memory = (action: string) => {
    const mem = store.memory
    if (action === 'mc') setStore((s) => ({ ...s, memory: null }))
    else if (action === 'mr') {
      if (mem != null) insert(toDisplay(mem), { startFresh: justEvaluated || !expr })
    } else if (action === 'm+') setStore((s) => ({ ...s, memory: roundFloat((s.memory ?? 0) + currentValue()) }))
    else if (action === 'm-') setStore((s) => ({ ...s, memory: roundFloat((s.memory ?? 0) - currentValue()) }))
    focusInput()
  }

  const press = (key: Key) => {
    switch (key.kind) {
      case 'digit':
        insert(key.label, { startFresh: justEvaluated })
        break
      case 'dot':
        insert('.', { startFresh: justEvaluated })
        break
      case 'op':
        insert(key.value ?? key.label)
        break
      case 'pct':
        insert('%')
        break
      case 'equals':
        evaluate()
        break
      case 'clear':
        clear()
        break
      case 'back': {
        const input = inputRef.current
        const start = input?.selectionStart ?? expr.length
        const end = input?.selectionEnd ?? expr.length
        if (start !== end) insert('')
        else if (start > 0) {
          setExpr(expr.slice(0, start - 1) + expr.slice(end))
          requestAnimationFrame(() => inputRef.current?.setSelectionRange(start - 1, start - 1))
          setJustEvaluated(false)
          focusInput()
        }
        break
      }
      case 'sign':
        toggleSign()
        break
      case 'mem':
        memory(key.value!)
        break
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === '=') {
      event.preventDefault()
      evaluate()
    } else if (event.key === 'Delete' && (event.ctrlKey || !expr || justEvaluated)) {
      event.preventDefault()
      clear()
    } else if (event.key === 'Escape' && expr) {
      // First Escape clears; a second one (empty display) falls through and closes the window.
      event.preventDefault()
      event.stopPropagation()
      clear()
    } else if (justEvaluated && /^[\d.]$/.test(event.key) && !event.ctrlKey && !event.metaKey) {
      // Typing a digit right after "=" starts a new sum instead of appending to the answer.
      event.preventDefault()
      insert(event.key, { startFresh: true })
    }
  }

  const grandTotal = store.tape.reduce((sum, entry) => sum + entry.result, 0)

  return (
    <div className='flex h-full min-h-0 flex-col gap-2'>
      {/* Display */}
      <div className='rounded-xl border bg-muted/40 px-3 py-2'>
        <div className='flex h-4 items-center justify-between gap-2 text-[10px] text-muted-foreground'>
          <span className='font-semibold'>{store.memory != null && `M = ${formatNumber(store.memory, { decimals: 6, trim: true })}`}</span>
          <button
            type='button'
            onClick={() => setShowTape((v) => !v)}
            className={cn('flex items-center gap-1 rounded px-1 hover:text-foreground', showTape && 'text-primary')}
            aria-pressed={showTape}
          >
            <History className='size-3' />
            Tape{store.tape.length ? ` (${store.tape.length})` : ''}
          </button>
        </div>
        <input
          ref={inputRef}
          value={expr}
          onChange={(event) => {
            setExpr(event.target.value)
            setJustEvaluated(false)
            setError(null)
          }}
          onKeyDown={handleKeyDown}
          inputMode='decimal'
          spellCheck={false}
          autoComplete='off'
          aria-label='Calculation'
          placeholder='0'
          className='w-full bg-transparent text-end text-3xl font-semibold tabular-nums tracking-tight outline-none placeholder:text-muted-foreground/60'
        />
        <p className={cn('h-4 truncate text-end text-xs tabular-nums', error ? 'text-destructive' : 'text-muted-foreground')}>
          {error ?? (preview != null ? `= ${formatNumber(preview, { decimals: 8, trim: true })}` : '')}
        </p>
      </div>

      {showTape ? (
        <div className='flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border'>
          <div className='min-h-0 flex-1 overflow-y-auto'>
            {store.tape.length === 0 ? (
              <p className='p-6 text-center text-xs text-muted-foreground'>Every calculation you finish with = is listed here.</p>
            ) : (
              <ul className='divide-y'>
                {store.tape.map((entry, index) => (
                  <li key={`${index}-${entry.expr}`}>
                    <button
                      type='button'
                      onClick={() => {
                        setExpr(toDisplay(entry.result))
                        setJustEvaluated(true)
                        setShowTape(false)
                        focusInput()
                      }}
                      className='block w-full px-3 py-1.5 text-end hover:bg-accent'
                      title='Use this result'
                    >
                      <span className='block truncate text-[11px] text-muted-foreground'>{entry.expr} =</span>
                      <span className='block text-sm font-semibold tabular-nums'>{formatNumber(entry.result, { decimals: 8, trim: true })}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {store.tape.length > 0 && (
            <div className='flex items-center justify-between gap-2 border-t bg-muted/40 px-3 py-1.5'>
              <button
                type='button'
                onClick={() => setStore((s) => ({ ...s, tape: [] }))}
                className='flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive'
              >
                <Trash2 className='size-3' /> Clear tape
              </button>
              <button
                type='button'
                onClick={() => {
                  setExpr(toDisplay(grandTotal))
                  setJustEvaluated(true)
                  setShowTape(false)
                  focusInput()
                }}
                className='text-end text-xs hover:text-primary'
                title='Use the grand total'
              >
                <span className='text-muted-foreground'>Grand total </span>
                <span className='font-bold tabular-nums'>{formatNumber(grandTotal, { decimals: 4, trim: true })}</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className='grid min-h-0 flex-1 grid-cols-4 gap-1.5' style={{ gridAutoRows: 'minmax(0, 1fr)' }}>
          {KEYS.map((key) => (
            <button
              key={key.label}
              type='button'
              title={key.title}
              // Keeps the caret (and focus) in the display while clicking keys.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => press(key)}
              className={cn(
                'flex min-h-9 items-center justify-center rounded-lg text-base font-medium transition-colors active:scale-[0.97]',
                key.kind === 'digit' || key.kind === 'dot' || key.kind === 'sign'
                  ? 'bg-card border hover:bg-accent'
                  : key.kind === 'equals'
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : key.kind === 'mem'
                      ? 'text-xs text-muted-foreground hover:bg-accent hover:text-foreground'
                      : key.kind === 'clear'
                        ? 'bg-muted text-destructive hover:bg-destructive/10'
                        : 'bg-muted hover:bg-accent',
                OPERATORS.has(key.value ?? key.label) && 'text-lg text-primary'
              )}
            >
              {key.kind === 'back' ? <Delete className='size-4' /> : key.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
