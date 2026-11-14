import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown, Globe2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { businessDateTimeFormat, formatUtcOffset, getTimeZoneNames } from '@/lib/business-timezone'
import { getAllTimeZoneOptions, timeZoneDisplayName, type TimeZoneOption } from '@/lib/time-zones'

type TimeZonePickerProps = {
  /** IANA zone, or '' for "Automatic". */
  value: string
  onValueChange: (zone: string) => void
  /** Label for the '' option, e.g. "Automatic — Pakistan (from country)". Omit to hide it. */
  autoLabel?: string
  /** Zone the '' option resolves to — shown under the label so "Automatic" is never a mystery. */
  autoZone?: string
  disabled?: boolean
  className?: string
  id?: string
}

const GROUPS: Array<{ region: TimeZoneOption['region']; heading: string }> = [
  { region: 'us', heading: 'United States' },
  { region: 'common', heading: 'Common' },
  { region: 'all', heading: 'All time zones' },
]

/** Live row meta: abbreviation (EST/EDT…), UTC offset and the local time there right now. */
function zoneMeta(zone: string, now: Date) {
  const { abbr } = getTimeZoneNames(zone, now)
  const time = businessDateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }, zone).format(now)
  return { abbr, offset: formatUtcOffset(zone, now), time }
}

/**
 * Searchable time-zone chooser: US zones first by their everyday names (Eastern, Central,
 * Mountain, Arizona, Pacific, Alaska, Hawaii), then common zones, then every IANA zone.
 * Each row shows the current abbreviation (EST vs EDT changes with daylight saving), the UTC
 * offset and the time there now, so the right one is obvious at a glance.
 */
export function TimeZonePicker({ value, onValueChange, autoLabel, autoZone, disabled, className, id }: TimeZonePickerProps) {
  const [open, setOpen] = useState(false)
  // Snapshot taken when the list opens — rows don't need to tick.
  const [now, setNow] = useState(() => new Date())
  const options = useMemo(() => getAllTimeZoneOptions(), [])

  const triggerLabel = value ? timeZoneDisplayName(value) : autoLabel || 'Automatic'
  const metaZone = value || autoZone
  const triggerMeta = metaZone ? zoneMeta(metaZone, now) : null

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setNow(new Date())
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type='button'
          variant='outline'
          role='combobox'
          aria-expanded={open}
          disabled={disabled}
          className={cn('h-auto min-h-9 w-full justify-between gap-2 py-1.5 text-left font-normal', className)}
        >
          <span className='flex min-w-0 items-center gap-2'>
            <Globe2 className='h-4 w-4 shrink-0 text-muted-foreground' />
            <span className='min-w-0'>
              <span className='block truncate'>{triggerLabel}</span>
              {triggerMeta && (
                <span className='block text-xs text-muted-foreground tabular-nums'>
                  {triggerMeta.abbr} · {triggerMeta.offset} · now {triggerMeta.time}
                </span>
              )}
            </span>
          </span>
          <ChevronsUpDown className='h-4 w-4 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-[min(28rem,calc(100vw-2rem))] p-0' align='start'>
        <Command
          filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0)}
        >
          <CommandInput placeholder='Search city, zone or abbreviation (e.g. Chicago, EST)…' />
          <CommandList className='max-h-[min(22rem,60vh)]'>
            <CommandEmpty>No time zone found.</CommandEmpty>
            {autoLabel && (
              <CommandGroup>
                <CommandItem
                  value={`automatic ${autoLabel}`}
                  onSelect={() => {
                    onValueChange('')
                    setOpen(false)
                  }}
                >
                  <Check className={cn('h-4 w-4', value === '' ? 'opacity-100' : 'opacity-0')} />
                  <span className='truncate'>{autoLabel}</span>
                </CommandItem>
              </CommandGroup>
            )}
            {GROUPS.map((group) => (
              <CommandGroup key={group.region} heading={group.heading}>
                {options
                  .filter((o) => o.region === group.region)
                  .map((o) => {
                    const meta = zoneMeta(o.zone, now)
                    return (
                      <CommandItem
                        key={o.zone}
                        value={`${o.name} ${o.zone} ${meta.abbr} ${meta.offset}`}
                        onSelect={() => {
                          onValueChange(o.zone)
                          setOpen(false)
                        }}
                        className='items-start'
                      >
                        <Check className={cn('mt-0.5 h-4 w-4 shrink-0', value === o.zone ? 'opacity-100' : 'opacity-0')} />
                        <span className='min-w-0 flex-1'>
                          <span className='block truncate'>{o.name}</span>
                          <span className='block text-xs text-muted-foreground tabular-nums'>
                            {meta.abbr} · {meta.offset}
                          </span>
                        </span>
                        <span className='shrink-0 text-xs text-muted-foreground tabular-nums'>{meta.time}</span>
                      </CommandItem>
                    )
                  })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
