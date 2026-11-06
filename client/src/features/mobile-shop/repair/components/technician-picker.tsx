import { useState } from 'react'
import {
  Check,
  ChevronsUpDown,
  History,
  Plus,
  UserRound,
  UserX,
} from 'lucide-react'
import { useGetRepairTechniciansQuery } from '@/stores/mobile-shop.api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export interface TechnicianValue {
  id: string | null
  name: string
}

/**
 * Searchable technician picker: the branch's staff, then names used on earlier jobs, or
 * type a new name. Replaces a plain select that listed every user and every typed name.
 */
export function TechnicianPicker({
  value,
  onChange,
  disabled,
  id,
  placeholder = 'Assign later',
}: {
  value: TechnicianValue
  onChange: (next: TechnicianValue) => void
  disabled?: boolean
  id?: string
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const { data: technicians = [] } = useGetRepairTechniciansQuery()
  const staff = technicians.filter((t) => t.source !== 'typed' && t.id)
  const earlier = technicians.filter((t) => t.source === 'typed' || !t.id)
  const text = search.trim()
  const exact = technicians.some(
    (t) => t.name.toLowerCase() === text.toLowerCase()
  )

  const pick = (next: TechnicianValue) => {
    onChange(next)
    setOpen(false)
    setSearch('')
  }
  const selected = (t: TechnicianValue) =>
    t.id
      ? value.id === t.id
      : !value.id && value.name.toLowerCase() === t.name.toLowerCase()

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
          className='w-full justify-between px-3 font-normal'
        >
          <span
            className={cn(
              'flex min-w-0 items-center gap-2',
              !value.name && 'text-muted-foreground'
            )}
          >
            <UserRound className='h-4 w-4 shrink-0 opacity-60' aria-hidden />
            <span className='truncate'>{value.name || placeholder}</span>
          </span>
          <ChevronsUpDown className='h-4 w-4 shrink-0 opacity-50' aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className='w-[var(--radix-popover-trigger-width)] min-w-64 p-0'
        align='start'
      >
        <Command>
          <CommandInput
            placeholder='Search or type a name…'
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className='max-h-72'>
            <CommandEmpty>No match.</CommandEmpty>
            {text && !exact && (
              <CommandGroup>
                <CommandItem
                  value={`__new ${text}`}
                  onSelect={() => pick({ id: null, name: text })}
                >
                  <Plus className='mr-2 h-4 w-4' /> Use “{text}”
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              <CommandItem
                value='__none assign later unassigned'
                onSelect={() => pick({ id: null, name: '' })}
              >
                <UserX className='mr-2 h-4 w-4' /> {placeholder}
                {!value.name && <Check className='ml-auto h-4 w-4' />}
              </CommandItem>
            </CommandGroup>
            {staff.length > 0 && (
              <CommandGroup heading='Staff'>
                {staff.map((t) => (
                  <CommandItem
                    key={t.id!}
                    value={`${t.name} ${t.id}`}
                    onSelect={() => pick({ id: t.id, name: t.name })}
                  >
                    <UserRound className='mr-2 h-4 w-4' /> {t.name}
                    {selected(t) && <Check className='ml-auto h-4 w-4' />}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {earlier.length > 0 && (
              <CommandGroup heading='Used on earlier jobs'>
                {earlier.map((t) => (
                  <CommandItem
                    key={`typed-${t.name}`}
                    value={`typed ${t.name}`}
                    onSelect={() => pick({ id: null, name: t.name })}
                  >
                    <History className='mr-2 h-4 w-4' /> {t.name}
                    {t.jobs ? (
                      <span className='text-muted-foreground ml-1.5 text-xs'>
                        · {t.jobs} job{t.jobs === 1 ? '' : 's'}
                      </span>
                    ) : null}
                    {selected(t) && <Check className='ml-auto h-4 w-4' />}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
