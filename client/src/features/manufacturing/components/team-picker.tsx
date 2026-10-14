import { useState } from 'react'
import { Check, ChevronsUpDown, Users, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Badge } from '@/components/ui/badge'
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

/** Multi-select of organization users for an order's production team. */
export function TeamPicker({
  users,
  value,
  onChange,
  excludeId,
}: {
  users: { id: string; name: string; email?: string }[]
  value: string[]
  onChange: (ids: string[]) => void
  /** The operator — already leading the order, so not offered again. */
  excludeId?: string | null
}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const byId = new Map(users.map((u) => [u.id, u]))
  const toggle = (id: string) =>
    onChange(
      value.includes(id) ? value.filter((x) => x !== id) : [...value, id]
    )

  return (
    <div className='space-y-2'>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type='button'
            variant='outline'
            role='combobox'
            aria-expanded={open}
            className='w-full justify-between font-normal'
          >
            <span className='text-muted-foreground flex items-center gap-2 truncate'>
              <Users className='h-4 w-4 shrink-0' />
              {value.length
                ? t('{{n}} selected').replace('{{n}}', String(value.length))
                : t('Add people')}
            </span>
            <ChevronsUpDown className='h-4 w-4 shrink-0 opacity-50' />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className='w-[--radix-popover-trigger-width] min-w-64 p-0'
          align='start'
        >
          <Command>
            <CommandInput placeholder={t('Search people…')} />
            <CommandList>
              <CommandEmpty>{t('No one found')}</CommandEmpty>
              <CommandGroup>
                {users
                  .filter((u) => u.id !== excludeId)
                  .map((u) => (
                    <CommandItem
                      key={u.id}
                      value={`${u.name} ${u.email || ''}`}
                      onSelect={() => toggle(u.id)}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          value.includes(u.id) ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <span className='truncate'>{u.name}</span>
                    </CommandItem>
                  ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value.length > 0 && (
        <div className='flex flex-wrap gap-1.5'>
          {value.map((memberId) => (
            <Badge
              key={memberId}
              variant='secondary'
              className='gap-1 pr-1 font-normal'
            >
              {byId.get(memberId)?.name || t('Unknown user')}
              <button
                type='button'
                className='hover:bg-muted-foreground/20 rounded-full p-0.5'
                aria-label={t('Remove {{n}}').replace(
                  '{{n}}',
                  byId.get(memberId)?.name || ''
                )}
                onClick={() => toggle(memberId)}
              >
                <X className='h-3 w-3' />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
