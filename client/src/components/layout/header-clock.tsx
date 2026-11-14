import { useEffect, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { CalendarClock, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { usePermissions } from '@/context/permission-context'
import { useNow } from '@/hooks/use-now'
import {
  businessDateTimeFormat,
  formatUtcOffset,
  getBusinessClockParts,
  getDeviceTimeZone,
  getTimeZoneNames,
  setBusinessTimeZone,
  useBusinessTimeZone,
} from '@/lib/business-timezone'
import { formatCalendarParts } from '@/lib/date-format'
import { describeZoneDifference, sameClock, timeZoneDisplayName, timeZoneShortName } from '@/lib/time-zones'
import { useGetMyOrganizationQuery, useUpdateOrganizationSettingsMutation } from '@/stores/organization.api'

/** "9:43 PM · Sat, 11/14/2026" for a zone, in the app's date format. */
function zoneTimeLine(zone: string, now: Date) {
  const p = Object.fromEntries(
    businessDateTimeFormat(
      'en-US',
      { weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true },
      zone
    )
      .formatToParts(now)
      .map((part) => [part.type, part.value])
  )
  return {
    time: `${p.hour}:${p.minute}:${p.second} ${(p.dayPeriod ?? '').toUpperCase()}`,
    date: `${p.weekday}, ${formatCalendarParts(Number(p.year), Number(p.month), Number(p.day))}`,
  }
}

/**
 * First visit on a device whose zone differs from a business that never chose one (e.g. a US
 * store still on the Pakistan default): offer the device's zone once, to people who may change it.
 */
function useTimeZoneSuggestion(businessZone: string) {
  const { hasAnyPermission } = usePermissions()
  const canEdit = hasAnyPermission('manageBusinessProfile', 'manageLocalizationSettings')
  const { data: org } = useGetMyOrganizationQuery(undefined, { skip: !canEdit })
  const [updateSettings] = useUpdateOrganizationSettingsMutation()
  const shown = useRef(false)

  const deviceZone = getDeviceTimeZone()

  useEffect(() => {
    if (shown.current || !org?.id || org.timeZone || !canEdit) return
    if (sameClock(businessZone, deviceZone)) return
    const key = `tz_suggestion_dismissed_${org.id}_${deviceZone}`
    try {
      if (localStorage.getItem(key)) return
    } catch {
      return
    }
    shown.current = true
    const dismiss = () => {
      try {
        localStorage.setItem(key, '1')
      } catch {
        // storage blocked — it simply asks again next session
      }
    }
    toast(`Use ${timeZoneShortName(deviceZone)} for your business?`, {
      id: 'business-time-zone-suggestion',
      duration: 30000,
      description: `Dates and the clock now follow ${timeZoneShortName(businessZone)} time (${describeZoneDifference(businessZone, deviceZone)} of this device). Change it any time in Settings → Localization.`,
      action: {
        label: `Use ${getTimeZoneNames(deviceZone).abbr}`,
        onClick: async () => {
          try {
            await updateSettings({ orgId: org.id, body: { timeZone: deviceZone } }).unwrap()
            setBusinessTimeZone(deviceZone)
            toast.success(`Time zone set to ${timeZoneShortName(deviceZone)} — reloading so every date uses it`)
            window.setTimeout(() => window.location.reload(), 900)
          } catch {
            toast.error('Could not change the time zone — try Settings → Localization')
          }
        },
      },
      cancel: { label: 'Not now', onClick: dismiss },
      onDismiss: dismiss,
    })
  }, [org?.id, org?.timeZone, canEdit, businessZone, deviceZone, updateSettings])
}

/**
 * Live date + time in the business time zone (Settings → Localization), shown in the top header
 * next to the branch chip, with its abbreviation (EST/EDT, CST/CDT, PST/PDT, PKT…). It reads this
 * device's clock and ticks on its exact second boundary, so it never drifts from the device by a
 * second; the zone only decides which wall-clock it shows. Click for details / change.
 *
 * Appears once the header's content area is 1050px wide (needs the `@container/header` set in
 * AuthenticatedHeader) — measured: any narrower and it squeezes the branch name.
 * It also lands in every screenshot / recording taken from the header.
 */
export function HeaderClock() {
  const now = useNow()
  const businessZone = useBusinessTimeZone()
  const { weekday, date, time, zone } = getBusinessClockParts(now)
  useTimeZoneSuggestion(businessZone)

  const { hasAnyPermission } = usePermissions()
  const canEdit = hasAnyPermission('manageBusinessProfile', 'manageLocalizationSettings', 'viewLocalizationSettings')
  const deviceZone = getDeviceTimeZone()
  const matchesDevice = sameClock(businessZone, deviceZone)
  const names = getTimeZoneNames(businessZone, now)
  const device = zoneTimeLine(deviceZone, now)

  return (
    <Popover>
      <PopoverTrigger asChild>
        {/* data-no-translate: the DOM translator would otherwise re-translate "Mon"/"Sept"/"PM" every tick. */}
        <button
          type='button'
          data-no-translate
          role='timer'
          aria-label={`Business time ${time}, ${names.long}`}
          className='hidden h-9 shrink-0 cursor-pointer items-center gap-2 rounded-md border bg-muted/40 px-2.5 text-left select-none hover:bg-muted @min-[1050px]/header:flex'
        >
          <CalendarClock className='h-4 w-4 shrink-0 text-muted-foreground' />
          {/* Fixed min-width: with tabular digits the only width change left is 9→10 o'clock, which would nudge the header. */}
          <div className='flex min-w-[5.5rem] flex-col leading-none tabular-nums'>
            <span className='text-[13px] font-semibold'>
              {time}
              <span className='ml-1 text-[10px] font-medium text-muted-foreground'>{zone}</span>
            </span>
            <span className='mt-1 text-[10px] text-muted-foreground'>
              {weekday}, {date}
            </span>
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent side='bottom' align='end' className='w-80 space-y-3' data-no-translate>
        <div>
          <div className='text-xs font-medium text-muted-foreground'>Business time</div>
          <div className='text-xl font-semibold tabular-nums'>{time}</div>
          <div className='text-sm text-muted-foreground tabular-nums'>
            {weekday}, {date}
          </div>
          <div className='mt-1 text-xs text-muted-foreground'>
            {timeZoneDisplayName(businessZone)} · {names.abbr} · {formatUtcOffset(businessZone, now)}
          </div>
        </div>
        {matchesDevice ? (
          <p className='text-xs text-emerald-600 dark:text-emerald-400'>
            ✓ Same as this device’s clock, to the second. Daylight saving is applied automatically.
          </p>
        ) : (
          <div className='rounded-md border bg-muted/40 p-2 text-xs'>
            <div className='font-medium'>This device: {timeZoneShortName(deviceZone)}</div>
            <div className='tabular-nums text-muted-foreground'>
              {device.time} · {device.date} ({getTimeZoneNames(deviceZone, now).abbr})
            </div>
            <div className='mt-1 text-amber-600 dark:text-amber-400'>
              Business clock is {describeZoneDifference(businessZone, deviceZone, now)} of this device.
            </div>
          </div>
        )}
        <p className='text-[11px] leading-snug text-muted-foreground'>
          Invoices, reports, the cash book and every “today” follow this time zone, so a day starts at midnight where your
          business is.
        </p>
        {canEdit && (
          <Button asChild variant='outline' size='sm' className='w-full'>
            <Link to='/settings/localization'>
              <Settings2 className='mr-2 h-4 w-4' /> Change time zone
            </Link>
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
