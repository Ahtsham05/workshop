import { useMemo, useState } from 'react'
import { Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

const pad = (n: number) => String(n).padStart(2, '0')

const formatLabel = (hour: number, minute: number) => {
  const period = hour < 12 ? 'AM' : 'PM'
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:${pad(minute)} ${period}`
}

const TIME_OPTIONS = (() => {
  const options: { value: string; label: string }[] = []
  for (let hour = 0; hour < 24; hour++) {
    for (const minute of [0, 15, 30, 45]) {
      options.push({ value: `${pad(hour)}:${pad(minute)}`, label: formatLabel(hour, minute) })
    }
  }
  return options
})()

const labelFor = (value: string) => {
  const [h, m] = value.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return formatLabel(h, m)
}

interface TimePickerProps {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
}

export function TimePicker({ value, onChange, className, placeholder = 'Select time' }: TimePickerProps) {
  const [open, setOpen] = useState(false)
  const currentLabel = useMemo(() => labelFor(value), [value])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className={cn('justify-start gap-2 font-normal', className)}
        >
          <Clock className="h-4 w-4 text-muted-foreground" />
          {currentLabel || <span className="text-muted-foreground">{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-40 p-0" align="start">
        <Command>
          <CommandInput placeholder="Type a time..." />
          <CommandList>
            <CommandEmpty>No match</CommandEmpty>
            <CommandGroup>
              {TIME_OPTIONS.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                  className={cn(option.value === value && 'bg-accent text-accent-foreground')}
                >
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
