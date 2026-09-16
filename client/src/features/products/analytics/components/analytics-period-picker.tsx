import { useMemo, useState } from 'react'
import { DayPicker, type DateRange } from 'react-day-picker'
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useLanguage } from '@/context/language-context'
import { useIsPhone } from '@/hooks/use-mobile'
import { getBusinessToday } from '@/lib/business-timezone'
import { cn } from '@/lib/utils'
import type { AnalyticsRangeArgs } from '@/stores/productAnalytics.api'
import { ANALYTICS_PRESETS, resolveAnalyticsRange, type AnalyticsPreset } from '../lib/analytics-period'
import { formatRangeLabel } from '../lib/analytics-format'

interface Props {
  preset: AnalyticsPreset
  range: AnalyticsRangeArgs
  onPresetChange: (preset: Exclude<AnalyticsPreset, 'custom'>) => void
  onCustomRange: (range: AnalyticsRangeArgs) => void
  className?: string
}

// Same ceiling the analytics API enforces (ANALYTICS_CONFIG.MAX_PERIOD_DAYS on the server).
const MAX_RANGE_DAYS = 1830
const DAY_MS = 24 * 60 * 60 * 1000

/** Business calendar keys ("YYYY-MM-DD") ↔ local calendar dates, with no timezone shifting. */
const keyToDate = (key: string) => {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}
const dateToKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const monthBefore = (date: Date) => new Date(date.getFullYear(), date.getMonth() - 1, 1)
const inclusiveDays = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1

/**
 * Date range control for analytics: presets as a list (one click applies), plus a range
 * calendar for anything custom — no native browser date inputs, so it looks and behaves the
 * same in every browser, and future dates can't be picked.
 */
export function AnalyticsPeriodPicker({ preset, range, onPresetChange, onCustomRange, className }: Props) {
  const { t } = useLanguage()
  const isPhone = useIsPhone()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange | undefined>()
  const [month, setMonth] = useState<Date>(() => new Date())

  const today = useMemo(() => keyToDate(getBusinessToday()), [])
  const presetLabel = ANALYTICS_PRESETS.find((option) => option.value === preset)?.label ?? 'Custom range'

  const handleOpenChange = (next: boolean) => {
    if (next) {
      const from = keyToDate(range.startDate)
      const to = keyToDate(range.endDate)
      setDraft({ from, to })
      // Two months side by side: end the view on the range's last month so both ends are visible when they can be.
      setMonth(isPhone || (from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth()) ? to : monthBefore(to))
    }
    setOpen(next)
  }

  const applyPreset = (value: Exclude<AnalyticsPreset, 'custom'>) => {
    onPresetChange(value)
    setOpen(false)
  }

  const days = draft?.from && draft?.to ? inclusiveDays(draft.from, draft.to) : null
  const tooLong = days !== null && days > MAX_RANGE_DAYS
  const canApply = Boolean(draft?.from && draft?.to) && !tooLong

  const draftMatchesPreset = (value: Exclude<AnalyticsPreset, 'custom'>) => {
    if (!draft?.from || !draft?.to) return false
    const resolved = resolveAnalyticsRange({ preset: value, custom: null })
    return resolved.startDate === dateToKey(draft.from) && resolved.endDate === dateToKey(draft.to)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          className={cn('h-9 max-w-full justify-start gap-2 px-3 font-normal', className)}
          aria-label={t('Date range')}
        >
          <CalendarDays className='h-4 w-4 shrink-0 text-muted-foreground' />
          <span className='font-medium'>{t(presetLabel)}</span>
          <span className='hidden h-4 w-px bg-border sm:block' aria-hidden />
          <span className='hidden truncate text-muted-foreground sm:inline'>{formatRangeLabel(range.startDate, range.endDate)}</span>
          <ChevronDown className='ml-auto h-4 w-4 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-auto max-w-[calc(100vw-1.5rem)] p-0'>
        <div className='flex flex-col sm:flex-row'>
          <div className='border-b p-2 sm:w-44 sm:border-r sm:border-b-0'>
            <p className='px-2 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>{t('Quick ranges')}</p>
            <div className='grid grid-cols-2 gap-0.5 sm:grid-cols-1'>
              {ANALYTICS_PRESETS.map((option) => {
                const active = draftMatchesPreset(option.value)
                return (
                  <button
                    key={option.value}
                    type='button'
                    onClick={() => applyPreset(option.value)}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active && 'bg-accent font-medium',
                    )}
                  >
                    {t(option.label)}
                    {active ? <Check className='h-4 w-4 shrink-0 text-primary' aria-hidden /> : null}
                  </button>
                )
              })}
            </div>
          </div>

          <div className='p-3'>
            <DayPicker
              mode='range'
              selected={draft}
              onSelect={(next, triggerDate) => {
                // A complete range is already picked: the next click starts a new one instead of
                // stretching the old one, which is what people expect from a range picker.
                if (draft?.from && draft?.to) setDraft({ from: triggerDate, to: undefined })
                else setDraft(next)
              }}
              month={month}
              onMonthChange={setMonth}
              numberOfMonths={isPhone ? 1 : 2}
              weekStartsOn={1}
              showOutsideDays={false}
              disabled={{ after: today }}
              endMonth={today}
              components={{
                Chevron: ({ orientation }) =>
                  orientation === 'left' ? <ChevronLeft className='h-4 w-4' /> : <ChevronRight className='h-4 w-4' />,
              }}
              classNames={{
                root: 'relative',
                months: 'relative flex flex-col gap-4 sm:flex-row sm:gap-6',
                month: 'space-y-3',
                month_caption: 'flex h-8 items-center justify-center',
                caption_label: 'text-sm font-medium',
                nav: 'absolute inset-x-0 top-0 z-10 flex items-center justify-between',
                button_previous: cn(buttonVariants({ variant: 'outline' }), 'h-8 w-8 p-0 disabled:opacity-30'),
                button_next: cn(buttonVariants({ variant: 'outline' }), 'h-8 w-8 p-0 disabled:opacity-30'),
                month_grid: 'border-collapse',
                weekdays: '',
                weekday: 'h-8 w-9 text-[0.72rem] font-normal text-muted-foreground',
                week: '',
                day: 'h-9 w-9 p-0 text-center text-sm',
                day_button:
                  'inline-flex h-9 w-9 items-center justify-center rounded-md font-normal tabular-nums transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none',
                selected: 'bg-primary/10',
                range_start: 'rounded-l-md [&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary',
                range_end: 'rounded-r-md [&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary',
                range_middle: '[&>button]:hover:bg-primary/15',
                today: '[&>button]:font-semibold [&>button]:underline [&>button]:underline-offset-4',
                disabled: 'text-muted-foreground opacity-40',
                hidden: 'invisible',
              }}
            />
          </div>
        </div>

        <div className='flex flex-col gap-2 border-t px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between'>
          <p className={cn('text-sm', tooLong ? 'text-destructive' : 'text-muted-foreground')} aria-live='polite'>
            {!draft?.from
              ? t('Pick a start date')
              : !draft.to
                ? t('Pick an end date')
                : tooLong
                  ? t('Pick a range of {{max}} days or less', { max: MAX_RANGE_DAYS })
                  : `${formatRangeLabel(dateToKey(draft.from), dateToKey(draft.to))} · ${
                      days === 1 ? t('1 day') : t('{{days}} days', { days: days ?? 0 })
                    }`}
          </p>
          <div className='flex justify-end gap-2'>
            <Button variant='ghost' size='sm' onClick={() => setOpen(false)}>
              {t('Cancel')}
            </Button>
            <Button
              size='sm'
              disabled={!canApply}
              onClick={() => {
                if (!draft?.from || !draft?.to) return
                const next = { startDate: dateToKey(draft.from), endDate: dateToKey(draft.to) }
                const matching = ANALYTICS_PRESETS.find((option) => {
                  const resolved = resolveAnalyticsRange({ preset: option.value, custom: null })
                  return resolved.startDate === next.startDate && resolved.endDate === next.endDate
                })
                // A hand-picked range that equals a preset is stored as that preset, so it keeps
                // rolling forward ("Last 30 days" tomorrow) instead of freezing on today's dates.
                if (matching) onPresetChange(matching.value)
                else onCustomRange(next)
                setOpen(false)
              }}
            >
              {t('Apply')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
