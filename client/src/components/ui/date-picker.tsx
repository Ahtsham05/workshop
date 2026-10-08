import * as React from 'react'
import { format } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getBusinessToday, shiftBusinessCalendarDate, toBusinessCalendarDate } from '@/lib/business-timezone'
import {
  formatAppDate,
  getAppDatePlaceholder,
  maskAppDateInput,
  parseAppDateInput,
  useAppDateFormat,
} from '@/lib/date-format'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const CALENDAR_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

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

/**
 * The app's date field, used in place of the browser's `<input type="date">` (whose display
 * format follows the OS, not the business). You can type the date like the native input —
 * in the format chosen under Settings → Localization, separators fill in as you type — or
 * pick it from the calendar button. Values are plain `YYYY-MM-DD` strings like the native
 * input, so it drops into the same state.
 *
 * Keyboard: type digits; ArrowUp/ArrowDown step a day; Alt+ArrowDown or F4 opens the
 * calendar. A complete, valid date is committed as soon as it's typed (like the native
 * input's change event); anything incomplete reverts on blur. Enter commits pending text
 * before the caller's onKeyDown runs (e.g. to advance to the next field).
 */
export const DatePicker = React.forwardRef<HTMLInputElement, DatePickerProps>(function DatePicker(
  { value, onChange, min, max, placeholder, clearable = false, className, onKeyDown, onBlur, disabled, ...inputProps },
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
  const display = React.useCallback((iso: string) => (iso ? formatAppDate(iso, '') : ''), [])
  const [text, setText] = React.useState(() => display(day))
  // Follow outside changes (and a changed app format) without clobbering text that already
  // means the same day — e.g. the value that typing just committed.
  React.useEffect(() => {
    setText((prev) => (parseAppDateInput(prev) === day && prev ? prev : display(day)))
  }, [day, dateFormat, display])

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

  const parsed = parseAppDateInput(text)
  const complete = text.replace(/\D/g, '').length >= 8
  const invalid = complete && (!parsed || !inRange(parsed))

  const handleTextChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value
    const next = maskAppDateInput(raw, raw.length > text.length)
    setText(next)
    if (next === '') {
      if (clearable) commit('')
      return
    }
    const iso = parseAppDateInput(next)
    if (iso) commit(iso)
  }

  const revertIfIncomplete = () => {
    if (text === '' && clearable) return
    if (!parsed || !inRange(parsed)) setText(display(day))
  }

  const today = getBusinessToday()
  const todayDate = calendarDateToLocal(today) ?? new Date()
  // Month/year dropdowns in the caption so far-off days (expiry dates, old bills) don't take
  // dozens of arrow clicks. The year list spans ±20 years unless min/max narrow it.
  const startMonth = minDate ?? new Date(todayDate.getFullYear() - 20, 0)
  const endMonth = maxDate ?? new Date(todayDate.getFullYear() + 20, 11)
  const disabledDays = [...(minDate ? [{ before: minDate }] : []), ...(maxDate ? [{ after: maxDate }] : [])]

  const pick = (iso: string) => {
    if (commit(iso)) setText(display(iso))
    setOpen(false)
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
            onChange={handleTextChange}
            onBlur={(e) => {
              revertIfIncomplete()
              onBlur?.(e)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && parsed && parsed !== day) commit(parsed)
              onKeyDown?.(e)
              if (e.defaultPrevented) return
              if ((e.altKey && e.key === 'ArrowDown') || e.key === 'F4') {
                e.preventDefault()
                setOpen(true)
              } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault()
                const next = shiftBusinessCalendarDate(parsed || day || today, e.key === 'ArrowUp' ? 1 : -1)
                if (commit(next)) setText(display(next))
              } else if (e.key === 'Escape' && text !== display(day)) {
                setText(display(day))
              }
            }}
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
                setText('')
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
