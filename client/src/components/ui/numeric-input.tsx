import * as React from 'react'
import { Input } from '@/components/ui/input'

/**
 * A number box people can actually edit.
 *
 * The bug this replaces: inputs written as
 *   value={item.quantity}
 *   onChange={(e) => update(parseInt(e.target.value) || 1)}
 * re-derive the text from the stored *number* on every keystroke. Backspacing the
 * last digit parses to NaN → falls back to 1 (or 0) → the box instantly shows "1"
 * again, so the field can never be cleared to type a new value. The same loop eats
 * a trailing "." ("12." → 12, so 12.5 can't be typed) and blanks a leading "0"
 * (0 → '' so 0.5 can't be typed).
 *
 * This component keeps the exact text the user is typing while the box has focus,
 * commits every *valid* number live (so line totals keep updating as you type), and
 * only settles the field on blur:
 *   - blank        → `emptyValue` (e.g. 0 for a price/discount); when `emptyValue`
 *                     is null (quantity) it goes back to the last good value instead
 *   - out of range → clamped to `min` / `max`
 * When the value changes from outside (a +/− button, scan, "switch all discounts")
 * the box follows it.
 */
export interface NumericInputProps
  extends Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type' | 'min' | 'max' | 'defaultValue'> {
  value: number | null | undefined
  onValueChange: (value: number) => void
  /** Allow a decimal point. Default true. Quantities that must be whole set this false. */
  decimals?: boolean
  /** Allow a leading minus sign. Default false. */
  allowNegative?: boolean
  /** Smallest value committed. Typed values below it are held as text and clamped on blur. */
  min?: number
  /** Largest value committed. Typed values above it are held as text and clamped on blur. */
  max?: number
  /**
   * What a blank box means. A number (default 0) is committed as soon as the box is
   * emptied. `null` means "blank is only a typing state" — on blur the box returns to
   * the last committed value (use for quantity, where 0 would delete the line).
   */
  emptyValue?: number | null
  /** Show an empty box (placeholder) instead of "0" when the value is 0. Default false. */
  blankWhenZero?: boolean
  /** Select the whole value on focus so typing replaces it. Default true. */
  selectOnFocus?: boolean
}

function formatNumber(value: number | null | undefined, blankWhenZero: boolean): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return ''
  if (blankWhenZero && value === 0) return ''
  // Trim float noise (0.1 + 0.2 → 0.30000000000000004) without hiding real precision.
  return String(Number(value.toFixed(10)))
}

export const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  (
    {
      value,
      onValueChange,
      decimals = true,
      allowNegative = false,
      min,
      max,
      emptyValue = 0,
      blankWhenZero = false,
      selectOnFocus = true,
      onFocus,
      onBlur,
      inputMode,
      ...props
    },
    ref,
  ) => {
    // null = not editing → the box shows the formatted `value`.
    const [draft, setDraft] = React.useState<string | null>(null)
    // The value this box last committed (or last saw). A `value` prop that differs from
    // it came from outside (a +/− button, a scan…) and replaces whatever is being typed.
    const lastValueRef = React.useRef(value)
    const onValueChangeRef = React.useRef(onValueChange)
    onValueChangeRef.current = onValueChange

    React.useEffect(() => {
      if (!Object.is(value, lastValueRef.current)) {
        lastValueRef.current = value
        setDraft(null)
      }
    }, [value])

    const pattern = React.useMemo(() => {
      const sign = allowNegative ? '-?' : ''
      return decimals ? new RegExp(`^${sign}\\d*\\.?\\d*$`) : new RegExp(`^${sign}\\d*$`)
    }, [decimals, allowNegative])

    const inRange = (n: number) => (min === undefined || n >= min) && (max === undefined || n <= max)

    const commit = (n: number) => {
      if (Object.is(n, lastValueRef.current)) return
      lastValueRef.current = n
      onValueChangeRef.current(n)
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      // Accept a comma typed as the decimal separator; ignore anything else that
      // isn't part of a number (the keystroke simply doesn't land).
      const raw = decimals ? e.target.value.replace(',', '.') : e.target.value
      if (raw !== '' && !pattern.test(raw)) return
      setDraft(raw)

      if (raw === '' || raw === '-' || raw === '.' || raw === '-.') {
        if (raw === '' && emptyValue !== null) commit(emptyValue)
        return
      }
      const n = Number(raw)
      if (Number.isFinite(n) && inRange(n)) commit(n)
    }

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      if (draft !== null) {
        const n = Number(draft)
        const isBlank = draft === '' || draft === '-' || draft === '.' || draft === '-.'
        if (isBlank) {
          if (emptyValue !== null) commit(emptyValue)
        } else if (Number.isFinite(n)) {
          let settled = n
          if (min !== undefined && settled < min) settled = min
          if (max !== undefined && settled > max) settled = max
          commit(settled)
        }
        setDraft(null)
      }
      onBlur?.(e)
    }

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      if (selectOnFocus) e.target.select()
      onFocus?.(e)
    }

    return (
      <Input
        ref={ref}
        type='text'
        inputMode={inputMode ?? (decimals ? 'decimal' : 'numeric')}
        autoComplete='off'
        showVoiceInput={false}
        value={draft ?? formatNumber(value, blankWhenZero)}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...props}
      />
    )
  },
)
NumericInput.displayName = 'NumericInput'
