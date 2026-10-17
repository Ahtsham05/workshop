import { useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { UserAvatar } from '@/components/user-avatar'
import type { ChatPerson } from '@/stores/chat.api'
import { useChatLive } from '../lib/chat-live'

interface PeoplePickerProps {
  people: ChatPerson[]
  /** Multi-select when given; single click-to-pick otherwise. */
  selected?: Set<string>
  onToggle: (person: ChatPerson) => void
  exclude?: Set<string>
  loading?: boolean
}

/** Staff grouped by branch (admins under "All branches"), searchable by name or branch. */
export function PeoplePicker({ people, selected, onToggle, exclude, loading }: PeoplePickerProps) {
  const [query, setQuery] = useState('')
  const live = useChatLive()

  const groups = useMemo(() => {
    const term = query.trim().toLowerCase()
    const visible = people.filter(
      (p) =>
        !p.isMe &&
        !exclude?.has(p.id) &&
        (!term || p.name.toLowerCase().includes(term) || p.email.toLowerCase().includes(term) || p.branches.some((b) => b.name.toLowerCase().includes(term)))
    )
    const map = new Map<string, ChatPerson[]>()
    visible.forEach((person) => {
      const keys = person.allBranches ? ['All branches (admins)'] : person.branches.length ? person.branches.map((b) => b.name) : ['No branch yet']
      keys.forEach((key) => map.set(key, [...(map.get(key) || []), person]))
    })
    return [...map.entries()].sort((a, b) => {
      if (a[0].startsWith('All branches')) return -1
      if (b[0].startsWith('All branches')) return 1
      return a[0].localeCompare(b[0])
    })
  }, [people, query, exclude])

  return (
    <div className='flex min-h-0 flex-col'>
      <div className='relative mb-2'>
        <Search className='pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Search people or branches'
          className='h-9 w-full rounded-md border border-input bg-transparent ps-8 pe-2 text-sm outline-none focus-visible:border-input-ring focus-visible:ring-[3px] focus-visible:ring-input-ring/50 dark:bg-input/30'
        />
      </div>
      <div className='max-h-[50vh] min-h-0 overflow-y-auto rounded-md border'>
        {loading && <p className='p-4 text-center text-sm text-muted-foreground'>Loading people…</p>}
        {!loading && groups.length === 0 && <p className='p-4 text-center text-sm text-muted-foreground'>Nobody matches.</p>}
        {groups.map(([branch, members]) => (
          <div key={branch}>
            <p className='sticky top-0 z-10 bg-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'>{branch}</p>
            <ul>
              {members.map((person) => {
                const isSelected = selected?.has(person.id)
                const online = live.online.has(person.id)
                return (
                  <li key={`${branch}-${person.id}`}>
                    <button
                      type='button'
                      onClick={() => onToggle(person)}
                      className={cn('flex w-full items-center gap-3 px-3 py-2 text-start hover:bg-accent', isSelected && 'bg-primary/5')}
                    >
                      <span className='relative shrink-0'>
                        <UserAvatar name={person.name} email={person.email} photoUrl={person.photoUrl} className='size-8' />
                        {online && <span className='absolute bottom-0 end-0 size-2.5 rounded-full border-2 border-card bg-emerald-500' />}
                      </span>
                      <span className='min-w-0 flex-1'>
                        <span className='block truncate text-sm font-medium'>{person.name}</span>
                        <span className='block truncate text-xs text-muted-foreground'>
                          {online ? 'Online' : person.allBranches ? 'Admin · every branch' : person.branches.map((b) => b.name).join(', ') || person.email}
                        </span>
                      </span>
                      {selected && (
                        <span
                          className={cn(
                            'flex size-5 shrink-0 items-center justify-center rounded border',
                            isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-input'
                          )}
                        >
                          {isSelected && <Check className='size-3.5' />}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
