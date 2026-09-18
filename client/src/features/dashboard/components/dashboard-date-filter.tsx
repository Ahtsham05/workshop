import { format } from 'date-fns'
import { CalendarDays, RefreshCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useLanguage } from '@/context/language-context'
import {
  buildDashboardDateRange,
  formatDashboardRangeSubtitle,
  type DashboardDatePreset,
  type DashboardDateRange,
} from '@/lib/dashboard-date-range'
import { cn } from '@/lib/utils'

/** "YYYY-MM-DD" business calendar key -> local Date, with no timezone shifting. */
const parseDateKey = (key: string) => {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}
const formatDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

type Props = {
  value: DashboardDateRange
  onChange: (range: DashboardDateRange) => void
  onRefresh?: () => void
  isRefreshing?: boolean
  className?: string
}

const PRESETS: { id: DashboardDatePreset; labelKey: string }[] = [
  { id: 'today', labelKey: 'Today' },
  { id: 'week', labelKey: 'This Week' },
  { id: 'month', labelKey: 'This Month' },
  { id: 'custom', labelKey: 'Custom' },
]

export function DashboardDateFilter({
  value,
  onChange,
  onRefresh,
  isRefreshing = false,
  className,
}: Props) {
  const { t } = useLanguage()

  const setPreset = (preset: DashboardDatePreset) => {
    if (preset === 'custom') {
      onChange(buildDashboardDateRange('custom', value))
      return
    }
    onChange(buildDashboardDateRange(preset))
  }

  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-2', className)}>
      <div className='inline-flex h-9 shrink-0 items-center rounded-lg border bg-muted/60 p-1'>
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type='button'
            onClick={() => setPreset(preset.id)}
            className={cn(
              'inline-flex h-7 items-center rounded-md px-3 text-sm font-medium transition-colors',
              value.period === preset.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t(preset.labelKey)}
          </button>
        ))}
      </div>

      {value.period === 'custom' ? (
        <div className='flex h-9 items-center gap-1.5'>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant='outline' size='sm' className='h-9 justify-start gap-2 px-3 font-normal'>
                <CalendarDays className='h-4 w-4 shrink-0 text-muted-foreground' aria-hidden />
                {format(parseDateKey(value.startDate), 'PPP')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className='w-auto p-0' align='start'>
              <Calendar
                mode='single'
                selected={parseDateKey(value.startDate)}
                onSelect={(date) => {
                  if (!date) return
                  onChange({ period: 'custom', startDate: formatDateKey(date), endDate: value.endDate })
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <span className='text-xs text-muted-foreground'>{t('To')}</span>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant='outline' size='sm' className='h-9 justify-start gap-2 px-3 font-normal'>
                <CalendarDays className='h-4 w-4 shrink-0 text-muted-foreground' aria-hidden />
                {format(parseDateKey(value.endDate), 'PPP')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className='w-auto p-0' align='start'>
              <Calendar
                mode='single'
                selected={parseDateKey(value.endDate)}
                onSelect={(date) => {
                  if (!date) return
                  onChange({ period: 'custom', startDate: value.startDate, endDate: formatDateKey(date) })
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      ) : (
        <div className='hidden h-9 items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-3 text-sm text-muted-foreground sm:flex'>
          <CalendarDays className='h-4 w-4 shrink-0' aria-hidden />
          <span className='whitespace-nowrap font-medium text-foreground'>
            {formatDashboardRangeSubtitle(value)}
          </span>
        </div>
      )}

      {onRefresh ? (
        <Button
          type='button'
          onClick={onRefresh}
          disabled={isRefreshing}
          variant='outline'
          size='sm'
          className='h-9 shrink-0 gap-2 shadow-sm'
        >
          <RefreshCcw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} aria-hidden />
          {t('Refresh')}
        </Button>
      ) : null}
    </div>
  )
}
