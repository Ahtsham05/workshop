import * as React from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export type SearchableSelectOption = {
  value: string
  label: string
  sublabel?: string
  /** Optional small tag rendered next to the label (e.g. "Employee") */
  badge?: string
}

type SearchableSelectProps = {
  options: SearchableSelectOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  clearLabel?: string
  className?: string
  disabled?: boolean
  id?: string
  'data-enter-field'?: string
  onKeyDown?: React.KeyboardEventHandler<HTMLButtonElement>
  onKeyDownCapture?: React.KeyboardEventHandler<HTMLButtonElement>
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyText = 'No results found.',
  clearLabel,
  className,
  disabled,
  id,
  'data-enter-field': dataEnterField,
  onKeyDown,
  onKeyDownCapture,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false)

  const selected = options.find((o) => o.value === value)

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (open && e.key === 'Enter') return
    onKeyDown?.(e)
  }

  const handleTriggerKeyDownCapture = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (open && e.key === 'Enter') return
    onKeyDownCapture?.(e)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type='button'
          variant='outline'
          role='combobox'
          aria-expanded={open}
          disabled={disabled}
          data-enter-field={dataEnterField}
          onKeyDown={handleTriggerKeyDown}
          onKeyDownCapture={handleTriggerKeyDownCapture}
          className={cn('w-full justify-between font-normal', !selected && 'text-muted-foreground', className)}
        >
          <span className='flex min-w-0 flex-1 items-center gap-2'>
            <span className='truncate'>{selected ? selected.label : placeholder}</span>
            {selected?.badge && (
              <Badge variant='outline' className='shrink-0 px-1.5 py-0 text-[10px] font-normal'>
                {selected.badge}
              </Badge>
            )}
          </span>
          <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className='w-[var(--radix-popover-trigger-width)] p-0'
        align='start'
        sideOffset={4}
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {clearLabel && (
                <CommandItem
                  value='__clear__'
                  onSelect={() => {
                    onValueChange('')
                    setOpen(false)
                  }}
                  className='text-muted-foreground'
                >
                  <Check className={cn('mr-2 h-4 w-4', value === '' ? 'opacity-100' : 'opacity-0')} />
                  {clearLabel}
                </CommandItem>
              )}
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.sublabel ?? ''}`}
                  onSelect={() => {
                    onValueChange(option.value === value ? '' : option.value)
                    setOpen(false)
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === option.value ? 'opacity-100' : 'opacity-0')} />
                  <span className='flex-1 truncate'>{option.label}</span>
                  {option.badge && (
                    <Badge variant='outline' className='ml-2 shrink-0 px-1.5 py-0 text-[10px] font-normal'>
                      {option.badge}
                    </Badge>
                  )}
                  {option.sublabel && (
                    <span className='ml-2 text-xs text-muted-foreground truncate'>{option.sublabel}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
