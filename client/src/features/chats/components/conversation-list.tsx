import { useMemo, useState } from 'react'
import { BellOff, Building2, Globe2, MessageSquarePlus, Pin, Search, Users, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { UserAvatar } from '@/components/user-avatar'
import { Button } from '@/components/ui/button'
import { useSearchChatQuery, type ChatConversation } from '@/stores/chat.api'
import { useChatLive } from '../lib/chat-live'
import { conversationSubtitle, formatChatStamp } from '../lib/chat-format'
import { MessageTicks } from './message-bubble'
import { PreviewText } from './preview-text'

type Filter = 'all' | 'unread' | 'channels' | 'people'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'channels', label: 'Branches' },
  { key: 'people', label: 'People & groups' },
]

export function ConversationIcon({ conversation, className }: { conversation: ChatConversation; className?: string }) {
  const live = useChatLive()
  if (conversation.type === 'direct') {
    const online = conversation.directUser ? live.online.has(conversation.directUser.id) : false
    return (
      <span className={cn('relative shrink-0', className)}>
        <UserAvatar name={conversation.name} photoUrl={conversation.directUser?.photoUrl} className='size-10' />
        {online && <span className='absolute bottom-0 end-0 size-3 rounded-full border-2 border-card bg-emerald-500' aria-label='Online' />}
      </span>
    )
  }
  const Icon = conversation.type === 'organization' ? Globe2 : conversation.type === 'branch' ? Building2 : Users
  return (
    <span
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-full',
        conversation.type === 'organization'
          ? 'bg-primary text-primary-foreground'
          : conversation.type === 'branch'
            ? 'bg-primary/15 text-primary'
            : 'bg-muted text-foreground',
        className
      )}
    >
      <Icon className='size-5' />
    </span>
  )
}

interface ConversationListProps {
  conversations: ChatConversation[]
  activeId: string | null
  meId: string | undefined
  activeBranchId: string | null
  loading: boolean
  onSelect: (id: string, messageId?: string) => void
  onNewChat: () => void
}

export function ConversationList({ conversations, activeId, meId, activeBranchId, loading, onSelect, onNewChat }: ConversationListProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const live = useChatLive()
  const term = query.trim()
  const { data: hits, isFetching: searching } = useSearchChatQuery(term, { skip: term.length < 2 })

  const shown = useMemo(() => {
    const lower = term.toLowerCase()
    return conversations.filter((c) => {
      if (filter === 'unread' && c.unread === 0) return false
      if (filter === 'channels' && c.type !== 'branch' && c.type !== 'organization') return false
      if (filter === 'people' && c.type !== 'direct' && c.type !== 'group') return false
      return !lower || c.name.toLowerCase().includes(lower)
    })
  }, [conversations, filter, term])

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <div className='space-y-2 border-b p-3'>
        <div className='flex items-center justify-between gap-2'>
          <h1 className='text-lg font-semibold'>Team chat</h1>
          <Button size='sm' onClick={onNewChat} className='gap-1.5'>
            <MessageSquarePlus className='size-4' /> New
          </Button>
        </div>
        <div className='relative'>
          <Search className='pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search chats and messages'
            aria-label='Search chats and messages'
            className='h-9 w-full rounded-md border border-input bg-transparent ps-8 pe-8 text-sm outline-none focus-visible:border-input-ring focus-visible:ring-[3px] focus-visible:ring-input-ring/50 dark:bg-input/30'
          />
          {query && (
            <button type='button' onClick={() => setQuery('')} className='absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground' aria-label='Clear search'>
              <X className='size-4' />
            </button>
          )}
        </div>
        <div className='flex gap-1 overflow-x-auto [scrollbar-width:none]'>
          {FILTERS.map((f) => {
            const count = f.key === 'unread' ? conversations.filter((c) => c.unread > 0).length : 0
            return (
              <button
                key={f.key}
                type='button'
                onClick={() => setFilter(f.key)}
                className={cn(
                  'shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                  filter === f.key ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                {f.label}
                {count > 0 && <span className='ms-1 tabular-nums'>{count}</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div className='min-h-0 flex-1 overflow-y-auto'>
        {loading && !conversations.length ? (
          <div className='space-y-2 p-3'>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className='flex items-center gap-3'>
                <div className='size-10 animate-pulse rounded-full bg-muted' />
                <div className='flex-1 space-y-1.5'>
                  <div className='h-3 w-1/2 animate-pulse rounded bg-muted' />
                  <div className='h-3 w-3/4 animate-pulse rounded bg-muted' />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {shown.length === 0 && (
              <p className='p-6 text-center text-sm text-muted-foreground'>
                {filter === 'unread' ? 'You are all caught up.' : term ? 'No chats with that name.' : 'No conversations yet.'}
              </p>
            )}
            <ul>
              {shown.map((c) => {
                const typingHere = (live.typing[c.id] || []).length > 0
                const fromMe = c.lastMessage?.senderId === meId
                // WhatsApp: my own message shows its ticks instead of "You:"; in a group or
                // channel someone else's is prefixed with their first name.
                const ticks = fromMe && c.lastMessage?.kind !== 'system' ? c.lastMessage?.status : null
                const sender =
                  c.lastMessage && c.lastMessage.kind !== 'system' && !fromMe && c.type !== 'direct' ? `${c.lastMessage.senderName.split(' ')[0]}: ` : ''
                const preview = c.lastMessage ? c.lastMessage.text : conversationSubtitle(c)
                return (
                  <li key={c.id}>
                    <button
                      type='button'
                      onClick={() => onSelect(c.id)}
                      className={cn(
                        'flex w-full items-center gap-3 px-3 py-2.5 text-start transition-colors hover:bg-accent',
                        activeId === c.id && 'bg-accent'
                      )}
                    >
                      <ConversationIcon conversation={c} />
                      <span className='min-w-0 flex-1'>
                        <span className='flex items-center gap-1.5'>
                          <span className={cn('truncate text-sm', c.unread > 0 ? 'font-semibold' : 'font-medium')}>{c.name}</span>
                          {c.type === 'branch' && c.branchId === activeBranchId && (
                            <span className='shrink-0 rounded bg-primary/10 px-1 text-[10px] font-medium text-primary'>Your branch</span>
                          )}
                          {c.pinned && <Pin className='size-3 shrink-0 text-muted-foreground' />}
                          {c.muted && <BellOff className='size-3 shrink-0 text-muted-foreground' />}
                          <span className='ms-auto shrink-0 text-[11px] text-muted-foreground'>
                            {c.lastMessageAt ? formatChatStamp(c.lastMessageAt) : ''}
                          </span>
                        </span>
                        <span className='flex items-center gap-2'>
                          <span className={cn('flex min-w-0 items-center gap-1 text-xs', typingHere ? 'text-primary' : 'text-muted-foreground', c.unread > 0 && !typingHere && 'text-foreground')}>
                            {!typingHere && ticks && <MessageTicks status={ticks} tone='list' />}
                            {typingHere ? (
                              <span className='truncate'>typing…</span>
                            ) : (
                              <>
                                {(sender || ticks === 'failed') && (
                                  <span className={cn('shrink-0', ticks === 'failed' && 'text-destructive')}>{ticks === 'failed' ? 'Not sent:' : sender}</span>
                                )}
                                <PreviewText text={preview} />
                              </>
                            )}
                          </span>
                          {c.unread > 0 && (
                            <span
                              className={cn(
                                'ms-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums',
                                c.muted ? 'bg-muted-foreground/30 text-foreground' : 'bg-primary text-primary-foreground'
                              )}
                            >
                              {c.unread > 99 ? '99+' : c.unread}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>

            {term.length >= 2 && (
              <div className='border-t'>
                <p className='px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'>
                  Messages {searching && '…'}
                </p>
                {!searching && !hits?.length && <p className='px-3 pb-3 text-xs text-muted-foreground'>No messages match “{term}”.</p>}
                <ul>
                  {hits?.map((hit) => (
                    <li key={hit.id}>
                      <button type='button' onClick={() => onSelect(hit.conversationId, hit.id)} className='block w-full px-3 py-2 text-start hover:bg-accent'>
                        <span className='flex items-center gap-2 text-xs'>
                          <span className='truncate font-medium'>{hit.senderName}</span>
                          <span className='truncate text-muted-foreground'>in {hit.conversationName}</span>
                          <span className='ms-auto shrink-0 text-[11px] text-muted-foreground'>{formatChatStamp(hit.createdAt)}</span>
                        </span>
                        <span className='line-clamp-2 text-xs text-muted-foreground'>{hit.text}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
      {!live.connected && live.settled && (
        <p className='border-t bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'>
          Live updates unavailable — refreshing every few seconds.
        </p>
      )}
    </div>
  )
}
