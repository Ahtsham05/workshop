import { forwardRef, useEffect, useRef, useState } from 'react'
import type { ForwardedRef } from 'react'
import { RotateCcw } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'

import { formatNumber } from '../lib/format'

interface NumberCellProps {
  /** The value currently in effect (a rule's proposal, or the user's own override). */
  value: number | undefined
  /** True when the user typed this value — it is then kept when the rule changes. */
  overridden: boolean
  ariaLabel: string
  disabled?: boolean
  /** null clears the override so the rule drives the value again. */
  onCommit: (value: number | null) => void
  className?: string
  /** Enter jumps here instead of just blurring — e.g. cost → selling price, like the invoice form. */
  onEnterNext?: () => void
}

function assignRef<T>(ref: ForwardedRef<T> | undefined, node: T | null) {
  if (!ref) return
  if (typeof ref === 'function') ref(node)
  else ref.current = node
}

/**
 * An inline editable number. Edits are committed on blur/Enter (not per keystroke, which would
 * recompute the whole grid), Escape abandons the edit, and typing the value the rule already
 * proposes is not an override — so a later rule change still moves it.
 */
export const NumberCell = forwardRef<HTMLInputElement, NumberCellProps>(function NumberCell(
  { value, overridden, ariaLabel, disabled, onCommit, className, onEnterNext },
  forwardedRef,
) {
  const { t } = useLanguage()
  const [draft, setDraft] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Never fight the user's typing: only mirror `value` while not editing.
  useEffect(() => {
    if (draft !== null && document.activeElement !== inputRef.current) setDraft(null)
  }, [value, draft])

  // Escape must not commit: `setDraft(null)` hasn't re-rendered yet when blur() fires `commit`, which would still see the typed draft.
  const abandonRef = useRef(false)

  const commit = () => {
    if (abandonRef.current) {
      abandonRef.current = false
      return
    }
    if (draft === null) return
    const text = draft.replace(/,/g, '').trim()
    setDraft(null)
    if (text === '') return onCommit(null)
    const n = Number(text)
    if (!Number.isFinite(n) || n < 0) return
    if (value !== undefined && Math.abs(n - value) < 0.005) return
    onCommit(Math.round(n * 100) / 100)
  }

  return (
    <div className={cn('relative flex items-center', className)}>
      <Input
        ref={(el) => {
          inputRef.current = el
          assignRef(forwardedRef, el)
        }}
        aria-label={ariaLabel}
        inputMode='decimal'
        disabled={disabled}
        showVoiceInput={false}
        value={draft !== null ? draft : value === undefined ? '' : formatNumber(value)}
        placeholder='—'
        onFocus={(e) => {
          setDraft(value === undefined ? '' : String(value))
          requestAnimationFrame(() => e.target.select())
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
            onEnterNext?.()
          }
          if (e.key === 'Escape') {
            abandonRef.current = true
            setDraft(null)
            e.currentTarget.blur()
          }
        }}
        className={cn(
          'h-8 pr-7 text-right text-sm font-semibold tabular-nums',
          overridden && 'border-primary/60 bg-primary/5 ring-1 ring-primary/30',
        )}
      />
      {overridden && (
        <button
          type='button'
          title={t('Use the rule’s value again')}
          aria-label={t('Reset')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onCommit(null)}
          className='absolute right-1.5 text-muted-foreground hover:text-foreground'
        >
          <RotateCcw className='h-3 w-3' />
        </button>
      )}
    </div>
  )
})
