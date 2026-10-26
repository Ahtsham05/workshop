import * as React from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ContactPhotoCell, type ContactPicture } from '@/components/contact-photo-cell'
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
  /** Optional avatar (customer/supplier photo, initials fallback) shown before the label */
  picture?: ContactPicture
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
  /** Called right after a value is picked (click or keyboard) — e.g. to auto-advance an
   * Enter-key field chain to the next field once a selection completes. */
  onSelected?: () => void
  /** Override the dropdown's width/sizing — by default it matches the trigger's width,
   * which is too narrow for picture+name+phone rows (e.g. a supplier picker). */
  popoverClassName?: string
  /** Control the dropdown from outside — e.g. open it when an Enter-key chain arrives here,
   * so the search box is ready without a second keypress. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Picking the current value again clears it (the default). Pass false for a required
   * choice: the current value is then highlighted on open, and Enter keeps it. */
  deselectable?: boolean
  /** false: closing the list leaves focus where onSelected put it (e.g. the next field)
   * instead of returning it to this trigger. */
  returnFocus?: boolean
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
  onSelected,
  popoverClassName,
  open: openProp,
  onOpenChange,
  deselectable = true,
  returnFocus = true,
}: SearchableSelectProps) {
  const [openState, setOpenState] = React.useState(false)
  const open = openProp ?? openState
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOpenState(next)
    onOpenChange?.(next)
  }

  const selected = options.find((o) => o.value === value)
  const itemValue = (o: SearchableSelectOption) => `${o.label} ${o.sublabel ?? ''}`.trim()

  // Enter is never intercepted for chain-advancement here — a closed combobox should open
  // on Enter (native button behavior), and an open one lets `Command` handle Enter to select
  // the highlighted item. Advancing to the next chained field instead happens via
  // `onSelected`, fired once a value is actually picked (see below).
  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter') return
    onKeyDown?.(e)
  }

  const handleTriggerKeyDownCapture = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter') return
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
            {selected && 'picture' in selected && (
              <ContactPhotoCell picture={selected.picture} name={selected.label} className='h-5 w-5' />
            )}
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
        className={cn('w-[var(--radix-popover-trigger-width)] p-0', popoverClassName)}
        align='start'
        sideOffset={4}
        collisionPadding={8}
        avoidCollisions
        onCloseAutoFocus={returnFocus ? undefined : (e) => e.preventDefault()}
      >
        <Command defaultValue={!deselectable && selected ? itemValue(selected) : undefined}>
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
                    onSelected?.()
                  }}
                  className='text-muted-foreground'
                >
                  <Check className={cn('mr-2 h-4 w-4', value === '' ? 'opacity-100' : 'opacity-0')} />
                  {clearLabel}
                </CommandItem>
              )}
              {options.map((option) => {
                const hasPicture = 'picture' in option
                return (
                  <CommandItem
                    key={option.value}
                    value={itemValue(option)}
                    onSelect={() => {
                      onValueChange(deselectable && option.value === value ? '' : option.value)
                      setOpen(false)
                      onSelected?.()
                    }}
                    className={cn(hasPicture && 'items-center py-2')}
                  >
                    <Check className={cn('mr-2 h-4 w-4 shrink-0', value === option.value ? 'opacity-100' : 'opacity-0')} />
                    {hasPicture && (
                      <ContactPhotoCell picture={option.picture} name={option.label} className='mr-3 h-8 w-8 shrink-0' />
                    )}
                    {hasPicture ? (
                      <div className='min-w-0 flex-1'>
                        <div className='truncate font-medium'>{option.label}</div>
                        {option.sublabel && <div className='truncate text-xs text-muted-foreground'>{option.sublabel}</div>}
                      </div>
                    ) : (
                      <>
                        {/* The name keeps at least half the row — a long sublabel used to squeeze it out entirely. */}
                        <span className='min-w-0 flex-1 truncate'>{option.label}</span>
                        {option.sublabel && (
                          <span className='ml-2 max-w-[50%] shrink-0 truncate text-xs text-muted-foreground'>{option.sublabel}</span>
                        )}
                      </>
                    )}
                    {option.badge && (
                      <Badge variant='outline' className='ml-2 shrink-0 px-1.5 py-0 text-[10px] font-normal'>
                        {option.badge}
                      </Badge>
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
