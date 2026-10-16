import * as React from 'react'
import { format } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getBusinessToday, toBusinessCalendarDate } from '@/lib/business-timezone'
import {
  getAppDatePlaceholder,
  maskAppDateInput,
  parseAppDateInput,
  useAppDateFormat,
} from '@/lib/date-format'
import {
  type DateFieldState,
  EMPTY_SEGMENTS,
  backspace,
  clearSegments,
  deleteSegment,
  focusSegment,
  initialFieldState,
  isAllEmpty,
  isAllFilled,
  renderSegments,
  segmentAt,
  segmentRange,
  segmentsFromIso,
  segmentsFromPaste,
  segmentsInSelection,
  segmentsToIso,
  settle,
  stepSegment,
  typeDigit,
  typeSeparator,
} from '@/lib/date-field-segments'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const CALENDAR_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const SEPARATOR_RE = /^[/\-.\s,]$/

/** `YYYY-MM-DD` (or any parseable date/ISO string, read as a Pakistan calendar day) → `YYYY-MM-DD`. */
function normalizeCalendarDate(value?: string | null): string {
  if (!value) return ''
  if (CALENDAR_DATE_RE.test(value)) return value
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : toBusinessCalendarDate(d)
}

/** `YYYY-MM-DD` → local-midnight Date for the calendar grid (no timezone shifting). */
function calendarDateToLocal(value: string): Date | undefined {
  const match = CALENDAR_DATE_RE.exec(value)
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : undefined
}

export type DatePickerProps = Omit<
  React.ComponentProps<'input'>,
  'value' | 'defaultValue' | 'onChange' | 'type' | 'min' | 'max' | 'ref'
> & {
  /** Selected day as `YYYY-MM-DD`; empty for none. */
  value?: string | null
  /** Receives `YYYY-MM-DD`, or `''` when cleared. */
  onChange: (value: string) => void
  /** Earliest / latest selectable day, `YYYY-MM-DD`. */
  min?: string
  max?: string
  /** Allow emptying the field (Clear button, deleting the text). */
  clearable?: boolean
}

type EditAction = { type: 'insert'; data: string } | { type: 'backspace' } | { type: 'delete' } | { type: 'clear' }

/**
 * The app's date field, used in place of the browser's `<input type="date">` (whose display
 * format follows the OS, not the business). It types like the native input — in the format
 * chosen under Settings → Localization — or the date can be picked from the calendar button.
 * Values are plain `YYYY-MM-DD` strings like the native input, so it drops into the same state.
 *
 * Editing is per segment (see `date-field-segments.ts`): clicking the day selects the day,
 * typing `12` replaces just the day and moves on to the month; Backspace trims the selected
 * segment without shifting the rest of the date. The day/month/year never re-flow into each
 * other, which is what made the old free-text mask jump around.
 *
 * Keyboard: digits fill the selected segment; ArrowLeft/ArrowRight (or typing `/`) move
 * between segments; ArrowUp/ArrowDown step the selected segment (the day steps across month
 * ends); Alt+ArrowDown or F4 opens the calendar; Escape undoes unfinished typing. The value is
 * committed as soon as every segment is finished and makes a valid day; anything incomplete
 * reverts on blur. Enter finishes a half-typed segment before the caller's onKeyDown runs (e.g. to
 * advance to the next field).
 */
export const DatePicker = React.forwardRef<HTMLInputElement, DatePickerProps>(function DatePicker(
  {
    value,
    onChange,
    min,
    max,
    placeholder,
    clearable = false,
    className,
    onKeyDown,
    onBlur,
    onFocus,
    onClick,
    onMouseDown,
    onPaste,
    disabled,
    ...inputProps
  },
  ref,
) {
  const dateFormat = useAppDateFormat()
  const [open, setOpen] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const setRefs = React.useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    },
    [ref],
  )

  const day = normalizeCalendarDate(value)
  const [field, setField] = React.useState<DateFieldState>(() => initialFieldState(day))
  // Latest state for back-to-back key events that land before React re-renders.
  const fieldRef = React.useRef(field)
  fieldRef.current = field
  // Bumped whenever the selected segment should be (re)highlighted after a render.
  const [selectTick, setSelectTick] = React.useState(0)
  const pointerDownRef = React.useRef(false)

  // Follow outside changes without clobbering typing that already shows the same day — e.g.
  // the value this field just committed.
  React.useEffect(() => {
    setField((prev) =>
      segmentsToIso(prev.segments) === day && day ? prev : { ...initialFieldState(day), active: prev.active },
    )
  }, [day])

  const text = renderSegments(field.segments, dateFormat)

  const selected = day ? calendarDateToLocal(day) : undefined
  const minDate = min ? calendarDateToLocal(normalizeCalendarDate(min)) : undefined
  const maxDate = max ? calendarDateToLocal(normalizeCalendarDate(max)) : undefined
  const minDay = minDate ? format(minDate, 'yyyy-MM-dd') : undefined
  const maxDay = maxDate ? format(maxDate, 'yyyy-MM-dd') : undefined
  const inRange = (next: string) => (!minDay || next >= minDay) && (!maxDay || next <= maxDay)

  const commit = (next: string) => {
    if (next && !inRange(next)) return false
    if (!next && !clearable) return false
    if (next !== day) onChange(next)
    return true
  }

  const shownIso = segmentsToIso(field.segments)
  const invalid = isAllFilled(field.segments) && !field.pending && (!shownIso || !inRange(shownIso))
  const editable = !disabled && !inputProps.readOnly

  /**
   * Show `next`, highlight its active segment, and commit it once it's a complete valid day.
   * Not while a segment is half-typed: Backspace on `16` shows `01` on the way to `12`, and
   * leaving the field there should restore the 16th, not save the 1st.
   */
  const apply = (next: DateFieldState) => {
    fieldRef.current = next
    setField(next)
    setSelectTick((tick) => tick + 1)
    if (next.pending) return
    const iso = segmentsToIso(next.segments)
    if (iso) {
      if (inRange(iso)) commit(iso)
    } else if (isAllEmpty(next.segments) && clearable) commit('')
  }

  React.useLayoutEffect(() => {
    const input = inputRef.current
    if (!input || document.activeElement !== input || !input.value) return
    const [start, end] = segmentRange(fieldRef.current.active, dateFormat)
    input.setSelectionRange(start, end)
  }, [selectTick, dateFormat])

  /** One edit at the current selection: the segment(s) under it are what gets edited. */
  const edit = (action: EditAction) => {
    const input = inputRef.current
    let state = fieldRef.current
    let consumed = false
    if (input && input.value) {
      const start = input.selectionStart ?? 0
      const end = input.selectionEnd ?? start
      const touched = end > start ? segmentsInSelection(start, end, dateFormat) : [segmentAt(start, dateFormat)]
      if (touched.length > 1) {
        // A selection across segments (e.g. Ctrl+A) is replaced as a whole.
        state = clearSegments(state, touched, dateFormat)
        consumed = action.type !== 'insert'
      } else if (touched[0] !== state.active) {
        state = focusSegment(state, touched[0])
      }
    }
    if (!consumed) {
      if (action.type === 'insert') {
        const pasted = action.data.length >= 6 ? segmentsFromPaste(action.data, parseAppDateInput, maskAppDateInput) : null
        if (pasted) state = { segments: pasted, active: state.active, pending: false }
        else
          for (const char of action.data) {
            if (/\d/.test(char)) state = typeDigit(state, char, dateFormat)
            else if (SEPARATOR_RE.test(char)) state = typeSeparator(state, dateFormat)
          }
      } else if (action.type === 'backspace') state = backspace(state, dateFormat)
      else if (action.type === 'delete') state = deleteSegment(state, dateFormat)
      else state = clearSegments(state, [state.active], dateFormat)
    }
    apply(state)
  }

  // Typing on phones reports `Unidentified` keys, so text edits are taken from `beforeinput`
  // (cancelled — the field never holds text this component didn't render). Desktop keys are
  // handled in onKeyDown below, which cancels them before `beforeinput` fires.
  const beforeInputRef = React.useRef<(event: InputEvent) => void>(() => {})
  beforeInputRef.current = (event: InputEvent) => {
    if (!event.cancelable || !editable) return
    const type = event.inputType
    if (type === 'historyUndo' || type === 'historyRedo') return event.preventDefault()
    if (type === 'insertFromPaste') return // onPaste handles it
    event.preventDefault()
    if (type.startsWith('insert')) {
      const data = event.data ?? event.dataTransfer?.getData('text/plain') ?? ''
      if (data) edit({ type: 'insert', data })
    } else if (type === 'deleteContentBackward') edit({ type: 'backspace' })
    else if (type === 'deleteContentForward') edit({ type: 'delete' })
    else if (type.startsWith('delete')) edit({ type: 'clear' }) // word/line deletes, cut
  }
  React.useEffect(() => {
    const input = inputRef.current
    if (!input) return
    const listener = (event: Event) => beforeInputRef.current(event as InputEvent)
    input.addEventListener('beforeinput', listener)
    return () => input.removeEventListener('beforeinput', listener)
  }, [])

  // Only reached when an edit slipped past `beforeinput` (non-cancellable IME composition):
  // read the segments back from their fixed positions instead of re-flowing the digits.
  const handleFallbackChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value
    const digits = raw.replace(/\D/g, '')
    if (!digits) return apply(clearSegments(fieldRef.current, [0, 1, 2], dateFormat))
    const masked = segmentsFromPaste(raw, parseAppDateInput, maskAppDateInput)
    if (masked) return apply({ segments: masked, active: fieldRef.current.active, pending: false })
    // Unusable text: redraw what was there.
    setField({ ...fieldRef.current })
    setSelectTick((tick) => tick + 1)
  }

  const selectSegmentAtCaret = () => {
    const input = inputRef.current
    if (!input || !input.value) return
    const start = input.selectionStart ?? 0
    const end = input.selectionEnd ?? start
    const touched = end > start ? segmentsInSelection(start, end, dateFormat) : [segmentAt(start, dateFormat)]
    if (touched.length > 1) return // a deliberate multi-segment selection (to copy / replace)
    const state = fieldRef.current
    const next = touched[0] === state.active && state.pending ? state : focusSegment(state, touched[0])
    fieldRef.current = next
    setField(next)
    setSelectTick((tick) => tick + 1)
  }

  const finishEditing = () => {
    const state = settle(fieldRef.current)
    const iso = segmentsToIso(state.segments)
    let next: DateFieldState
    if (iso && inRange(iso)) {
      commit(iso)
      next = { ...state, active: 0 }
    } else if (isAllEmpty(state.segments) && clearable) {
      commit('')
      next = { ...state, active: 0 }
    } else next = initialFieldState(day) // incomplete / impossible → back to the saved day
    fieldRef.current = next
    setField(next)
  }

  const today = getBusinessToday()
  const todayDate = calendarDateToLocal(today) ?? new Date()
  // Month/year dropdowns in the caption so far-off days (expiry dates, old bills) don't take
  // dozens of arrow clicks. The year list spans ±20 years unless min/max narrow it.
  const startMonth = minDate ?? new Date(todayDate.getFullYear() - 20, 0)
  const endMonth = maxDate ?? new Date(todayDate.getFullYear() + 20, 11)
  const disabledDays = [...(minDate ? [{ before: minDate }] : []), ...(maxDate ? [{ after: maxDate }] : [])]

  const pick = (iso: string) => {
    if (commit(iso)) {
      const next = { segments: segmentsFromIso(iso), active: 0, pending: false }
      fieldRef.current = next
      setField(next)
    }
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const state = fieldRef.current
      if (state.pending) apply(settle(state))
    }
    onKeyDown?.(e)
    if (e.defaultPrevented) return
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey
    const state = fieldRef.current
    if ((e.altKey && e.key === 'ArrowDown') || e.key === 'F4') {
      e.preventDefault()
      setOpen(true)
    } else if (plain && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      if (!editable) return
      const delta = e.key === 'ArrowUp' ? 1 : -1
      apply(
        isAllEmpty(state.segments)
          ? { ...initialFieldState(today), active: state.active }
          : stepSegment(state, delta, today, dateFormat),
      )
    } else if (plain && !e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && text) {
      e.preventDefault()
      const target = state.active + (e.key === 'ArrowLeft' ? -1 : 1)
      if (target >= 0 && target <= 2) apply(focusSegment(state, target))
      else setSelectTick((tick) => tick + 1) // keep the edge segment highlighted
    } else if (plain && !e.shiftKey && (e.key === 'Home' || e.key === 'End') && text) {
      e.preventDefault()
      apply(focusSegment(state, e.key === 'Home' ? 0 : 2))
    } else if (e.key === 'Escape' && segmentsToIso(state.segments) !== (day || null)) {
      apply(initialFieldState(day))
    } else if (plain && editable && (/^\d$/.test(e.key) || SEPARATOR_RE.test(e.key))) {
      e.preventDefault()
      edit({ type: 'insert', data: e.key })
    } else if (plain && editable && (e.key === 'Backspace' || e.key === 'Delete')) {
      e.preventDefault()
      edit({ type: e.key === 'Backspace' ? 'backspace' : 'delete' })
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          data-slot='date-picker'
          className={cn(
            'dark:bg-input/30 border-input flex h-9 w-full min-w-0 items-center rounded-md border bg-transparent shadow-xs transition-[color,box-shadow]',
            'focus-within:border-input-ring focus-within:ring-input-ring/50 focus-within:ring-[3px]',
            invalid && 'border-destructive ring-destructive/20',
            disabled && 'pointer-events-none cursor-not-allowed opacity-50',
            className,
          )}
        >
          <input
            ref={setRefs}
            type='text'
            inputMode='numeric'
            autoComplete='off'
            spellCheck={false}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            placeholder={placeholder ?? getAppDatePlaceholder(dateFormat)}
            className='placeholder:text-muted-foreground h-full w-full min-w-0 bg-transparent py-1 pl-3 text-base tabular-nums outline-none md:text-sm'
            value={text}
            onChange={handleFallbackChange}
            onMouseDown={(e) => {
              pointerDownRef.current = true
              onMouseDown?.(e)
            }}
            onClick={(e) => {
              // After the browser has placed the caret: select the segment that was clicked.
              pointerDownRef.current = false
              selectSegmentAtCaret()
              onClick?.(e)
            }}
            onFocus={(e) => {
              // Tabbing / Enter-advancing in starts on the first segment; a click picks its own.
              if (!pointerDownRef.current) {
                const next = focusSegment(fieldRef.current, 0)
                fieldRef.current = next
                setField(next)
                setSelectTick((tick) => tick + 1)
              }
              onFocus?.(e)
            }}
            onBlur={(e) => {
              pointerDownRef.current = false
              finishEditing()
              onBlur?.(e)
            }}
            onPaste={(e) => {
              onPaste?.(e)
              if (e.defaultPrevented) return
              e.preventDefault()
              if (!editable) return
              const pasted = segmentsFromPaste(e.clipboardData.getData('text'), parseAppDateInput, maskAppDateInput)
              if (pasted) apply({ segments: pasted, active: 2, pending: false })
            }}
            onKeyDown={handleKeyDown}
            {...inputProps}
          />
          <PopoverTrigger asChild>
            <button
              type='button'
              tabIndex={-1}
              disabled={disabled || inputProps.readOnly}
              aria-label='Open calendar'
              className='text-muted-foreground hover:bg-accent hover:text-foreground mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded'
            >
              <CalendarIcon className='h-4 w-4' aria-hidden />
            </button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent
        className='w-auto p-0'
        align='start'
        onCloseAutoFocus={(e) => {
          // Back to the text field (not the icon button) so typing / Enter-to-advance continue.
          e.preventDefault()
          inputRef.current?.focus()
        }}
      >
        <Calendar
          mode='single'
          selected={selected}
          defaultMonth={selected ?? todayDate}
          today={todayDate}
          captionLayout='dropdown'
          startMonth={startMonth}
          endMonth={endMonth}
          classNames={{
            month_caption: 'flex h-7 items-center justify-center px-8',
            dropdowns: 'flex items-center gap-1.5',
            dropdown_root:
              'relative inline-flex items-center rounded-md border border-input bg-background px-2 py-0.5 hover:bg-accent has-[select:focus-visible]:ring-2 has-[select:focus-visible]:ring-ring',
            dropdown: 'absolute inset-0 w-full cursor-pointer opacity-0',
            caption_label: 'inline-flex items-center gap-1 text-sm font-medium',
            chevron: 'size-3.5 fill-current opacity-60',
          }}
          disabled={disabledDays.length ? disabledDays : undefined}
          onSelect={(d) => {
            if (!d) return setOpen(false) // re-clicking the selected day: keep it, just close
            pick(format(d, 'yyyy-MM-dd'))
          }}
          autoFocus
        />
        <div className='flex items-center justify-between gap-2 border-t px-3 py-2'>
          {clearable ? (
            <Button
              type='button'
              variant='ghost'
              size='sm'
              className='h-7 px-2 text-xs'
              disabled={!day}
              onClick={() => {
                commit('')
                fieldRef.current = { segments: { ...EMPTY_SEGMENTS }, active: 0, pending: false }
                setField(fieldRef.current)
                setOpen(false)
              }}
            >
              Clear
            </Button>
          ) : (
            <span />
          )}
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='h-7 px-2 text-xs'
            disabled={!inRange(today)}
            onClick={() => pick(today)}
          >
            Today
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
})

type NativeDateInputProps = Omit<React.ComponentProps<'input'>, 'type' | 'ref'>

/**
 * `<Input type="date">` routes here, so every existing native date field in the app gets the
 * app date field (typed in the Settings → Localization format) without touching call sites.
 * It keeps the native contract those call sites rely on:
 *
 * - `onChange` / `onBlur` receive an event whose `target` is a real (hidden) input holding the
 *   value as `YYYY-MM-DD`, with the caller's `name` — so `e.target.value`, react-hook-form's
 *   `field.onChange(e)` and `register()` all keep working.
 * - Uncontrolled use (`{...register('date')}`, no `value` prop): the forwarded ref is that
 *   hidden input. Its `value` setter is wrapped so `setValue()` / `reset()` (which write
 *   `ref.value` directly, without events) still update what's displayed, and `focus()` is
 *   redirected to the visible field (react-hook-form focuses the first invalid field).
 */
export const NativeDateInput = React.forwardRef<HTMLInputElement, NativeDateInputProps>(function NativeDateInput(
  { value, defaultValue, onChange, onBlur, name, min, max, readOnly, ...rest },
  ref,
) {
  const controlled = value !== undefined
  const hiddenRef = React.useRef<HTMLInputElement | null>(null)
  const visibleRef = React.useRef<HTMLInputElement | null>(null)
  const [uncontrolledValue, setUncontrolledValue] = React.useState(String(defaultValue ?? ''))

  const assignRef = React.useCallback(
    (node: HTMLInputElement | null) => {
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    },
    [ref],
  )

  const setHiddenRef = React.useCallback(
    (node: HTMLInputElement | null) => {
      hiddenRef.current = node
      if (controlled) return
      if (node && !(node as HTMLInputElement & { __appDate?: boolean }).__appDate) {
        const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!
        // Seeded here, not via a React `defaultValue` prop: for type=hidden, `.value` IS the
        // value attribute, which React re-applies from defaultValue on every render — that
        // would wipe whatever react-hook-form wrote into the field.
        if (defaultValue !== undefined && defaultValue !== null) native.set!.call(node, String(defaultValue))
        Object.defineProperty(node, 'value', {
          configurable: true,
          get() {
            return native.get!.call(this)
          },
          set(next: unknown) {
            native.set!.call(this, next ?? '')
            setUncontrolledValue(String(next ?? ''))
          },
        })
        node.focus = () => visibleRef.current?.focus()
        ;(node as HTMLInputElement & { __appDate?: boolean }).__appDate = true
      }
      assignRef(node)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaultValue only seeds the first mount
    [controlled, assignRef],
  )

  const setVisibleRef = React.useCallback(
    (node: HTMLInputElement | null) => {
      visibleRef.current = node
      if (controlled) assignRef(node)
    },
    [controlled, assignRef],
  )

  const eventFor = (type: string, original?: React.SyntheticEvent) => {
    const target = hiddenRef.current!
    return {
      ...(original ?? {}),
      type,
      target,
      currentTarget: target,
      preventDefault: () => original?.preventDefault(),
      stopPropagation: () => original?.stopPropagation(),
      isDefaultPrevented: () => original?.isDefaultPrevented() ?? false,
      isPropagationStopped: () => original?.isPropagationStopped() ?? false,
      persist: () => {},
    } as unknown as React.ChangeEvent<HTMLInputElement>
  }

  const current = controlled ? String(value ?? '') : uncontrolledValue

  return (
    <>
      <input ref={setHiddenRef} type='hidden' name={name} />
      <DatePicker
        ref={setVisibleRef}
        value={current}
        min={min === undefined ? undefined : String(min)}
        max={max === undefined ? undefined : String(max)}
        readOnly={readOnly}
        clearable
        onChange={(next) => {
          const hidden = hiddenRef.current
          if (!hidden) return
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(hidden, next)
          if (!controlled) setUncontrolledValue(next)
          onChange?.(eventFor('change'))
        }}
        onBlur={onBlur ? (e) => onBlur(eventFor('blur', e) as unknown as React.FocusEvent<HTMLInputElement>) : undefined}
        {...rest}
      />
    </>
  )
})
