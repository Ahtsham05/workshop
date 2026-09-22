import { useState } from 'react'
import { DayPicker, type DateRange } from 'react-day-picker'
import { format } from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useIsPhone } from '@/hooks/use-mobile'
import { getBusinessToday } from '@/lib/business-timezone'
import { cn } from '@/lib/utils'

/** Business calendar keys ("YYYY-MM-DD") ↔ local calendar dates, with no timezone shifting. */
const keyToDate = (key: string) => {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}
const dateToKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const monthBefore = (date: Date) => new Date(date.getFullYear(), date.getMonth() - 1, 1)

interface Props {
  startDate?: string
  endDate?: string
  onChange: (range: { startDate?: string; endDate?: string }) => void
  className?: string
}

/** Compact date-range trigger button + a two-month range calendar — no presets, just pick a
 *  range and Apply. Nothing in this app is dated in the future, so anything after today is
 *  disabled. Shared by any list filter bar that needs a "from — to" date range. */
export function DateRangeFilter({ startDate, endDate, onChange, className }: Props) {
  const isPhone = useIsPhone()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange | undefined>()
  const [month, setMonth] = useState<Date>(() => new Date())
  const today = keyToDate(getBusinessToday())

  const handleOpenChange = (next: boolean) => {
    if (next) {
      const from = startDate ? keyToDate(startDate) : undefined
      const to = endDate ? keyToDate(endDate) : today
      setDraft({ from, to: endDate ? to : undefined })
      // Two months side by side: end the view on the range's last month so both ends are
      // visible when they can be — `endMonth` below won't let a later month render anyway.
      setMonth(isPhone || (from && from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth()) ? to : monthBefore(to))
    }
    setOpen(next)
  }

  const label =
    startDate && endDate
      ? startDate === endDate
        ? format(keyToDate(startDate), 'MMM d, yyyy')
        : `${format(keyToDate(startDate), 'MMM d, yyyy')} – ${format(keyToDate(endDate), 'MMM d, yyyy')}`
      : 'All dates'

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant='outline' className={cn('h-9 max-w-full justify-start gap-2 px-3 font-normal', className)}>
          <CalendarDays className='h-4 w-4 shrink-0 text-muted-foreground' />
          <span className={cn('truncate', !startDate && 'text-muted-foreground')}>{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-auto max-w-[calc(100vw-1.5rem)] p-0'>
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
        <div className='flex items-center justify-between gap-2 border-t px-3 py-2.5'>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => {
              onChange({ startDate: undefined, endDate: undefined })
              setOpen(false)
            }}
          >
            Clear
          </Button>
          <Button
            size='sm'
            disabled={!draft?.from || !draft?.to}
            onClick={() => {
              if (!draft?.from || !draft?.to) return
              onChange({ startDate: dateToKey(draft.from), endDate: dateToKey(draft.to) })
              setOpen(false)
            }}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
