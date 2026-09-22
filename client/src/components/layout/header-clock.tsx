import { useEffect, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getBusinessClockParts } from '@/lib/business-timezone'

/** Re-renders on each wall-clock second boundary, so the display never skips or repeats a second. */
function useNow() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let timer: number
    const scheduleNext = () => {
      timer = window.setTimeout(() => {
        setNow(new Date())
        scheduleNext()
      }, 1000 - (Date.now() % 1000))
    }
    scheduleNext()
    return () => window.clearTimeout(timer)
  }, [])

  return now
}

/**
 * Live date + time in the business timezone (Pakistan), shown in the top header next to the
 * branch chip. Appears once the header's content area is 1050px wide (needs the `@container/header` set in
 * AuthenticatedHeader) — measured: any narrower and it squeezes the branch name.
 *
 * It also lands in every screenshot / recording taken from the header, which timestamps a bug
 * report without anyone having to type the time.
 */
export function HeaderClock() {
  const { weekday, date, time } = getBusinessClockParts(useNow())

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* data-no-translate: the DOM translator would otherwise re-translate "Mon"/"Sept"/"PM" every tick. */}
        <div
          data-no-translate
          role='timer'
          className='hidden h-9 shrink-0 items-center gap-2 rounded-md border bg-muted/40 px-2.5 select-none @min-[1050px]/header:flex'
        >
          <CalendarClock className='h-4 w-4 shrink-0 text-muted-foreground' />
          {/* Fixed min-width: with tabular digits the only width change left is 9→10 o'clock, which would nudge the header. */}
          <div className='flex min-w-[5.5rem] flex-col leading-none tabular-nums'>
            <span className='text-[13px] font-semibold'>{time}</span>
            <span className='mt-1 text-[10px] text-muted-foreground'>
              {weekday}, {date}
            </span>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side='bottom'>Pakistan time (PKT), read from this device's clock</TooltipContent>
    </Tooltip>
  )
}
