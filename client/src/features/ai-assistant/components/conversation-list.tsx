import { useMemo, useState } from 'react'
import { formatDistanceToNow, isValid } from 'date-fns'
import { Plus, Trash2, ArrowLeft, MessageSquareText, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { AiConversation } from '@/stores/aiAssistant.api'
import { groupConversationsByDate } from '../lib/group-conversations'

function safeRelativeTime(value: string) {
  const date = new Date(value)
  return isValid(date) ? formatDistanceToNow(date, { addSuffix: true }) : ''
}

export function ConversationList({
  conversations,
  isLoading,
  activeId,
  onSelect,
  onNewChat,
  onDelete,
  onClose,
}: {
  conversations: AiConversation[]
  isLoading: boolean
  activeId: string | null
  onSelect: (id: string) => void
  onNewChat: () => void
  onDelete: (id: string) => void
  onClose?: () => void
}) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? conversations.filter((c) => c.title.toLowerCase().includes(q)) : conversations
  }, [conversations, search])

  const groups = useMemo(() => groupConversationsByDate(filtered), [filtered])

  return (
    <div className='flex h-full w-full flex-col gap-1 bg-background'>
      <div className='flex flex-none items-center justify-between gap-2 border-b bg-background px-3 py-3'>
        <div className='flex items-center gap-1.5'>
          {onClose && (
            <Button
              size='icon'
              variant='ghost'
              onClick={onClose}
              className='h-7 w-7 shrink-0 rounded-lg sm:hidden'
              title='Back to chat'
            >
              <ArrowLeft className='h-4 w-4' />
            </Button>
          )}
          <h2 className='text-sm font-semibold'>Conversations</h2>
        </div>
        <Button
          size='icon'
          variant='ghost'
          onClick={onNewChat}
          className='h-7 w-7 shrink-0 rounded-lg hover:bg-primary/10 hover:text-primary'
          title='New chat'
        >
          <Plus className='h-4 w-4' />
        </Button>
      </div>

      {conversations.length > 3 && (
        <div className='flex-none px-3 pt-2'>
          <div className='relative'>
            <Search className='pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground' />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Search conversations'
              className='h-8 pl-8 text-xs'
            />
          </div>
        </div>
      )}

      <ScrollArea className='flex-1 px-2 py-2'>
        {isLoading && (
          <div className='space-y-2 px-1 pt-1'>
            {[0, 1, 2].map((i) => (
              <div key={i} className='h-14 animate-pulse rounded-xl bg-muted' />
            ))}
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className='flex flex-col items-center gap-2 px-4 py-10 text-center'>
            <MessageSquareText className='h-8 w-8 text-muted-foreground/40' />
            <p className='text-sm text-muted-foreground'>
              {search ? 'No conversations match your search.' : 'No conversations yet. Start one to ask about your business.'}
            </p>
          </div>
        )}

        <div className='space-y-3'>
          {groups.map((group) => (
            <div key={group.label}>
              <p className='px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70'>
                {group.label}
              </p>
              <div className='space-y-1'>
                {group.items.map((conv) => {
                  const isActive = activeId === conv.id
                  return (
                    <button
                      key={conv.id}
                      type='button'
                      onClick={() => onSelect(conv.id)}
                      className={cn(
                        'group relative flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm transition-colors',
                        isActive ? 'bg-primary/10' : 'hover:bg-background'
                      )}
                    >
                      {isActive && <span className='absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary' />}
                      <span
                        className={cn(
                          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                          isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                        )}
                      >
                        <MessageSquareText className='h-3.5 w-3.5' />
                      </span>
                      <div className='min-w-0 flex-1'>
                        <p className={cn('truncate font-medium', isActive && 'text-primary')}>{conv.title}</p>
                        <p className='text-muted-foreground text-xs'>{safeRelativeTime(conv.lastMessageAt)}</p>
                      </div>
                      <span
                        role='button'
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation()
                          onDelete(conv.id)
                        }}
                        className='mt-0.5 shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100'
                      >
                        <Trash2 className='h-3.5 w-3.5' />
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
