import { useEffect, useMemo, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Building2, Globe2, MessagesSquare, Package, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import type { RootState } from '@/stores/store'
import { useGetChatConversationsQuery } from '@/stores/chat.api'
import { useChatLive } from './lib/chat-live'
import { ConversationList } from './components/conversation-list'
import { ChatThread } from './components/chat-thread'
import { NewChatDialog } from './components/new-chat-dialog'
import { ConversationInfoSheet } from './components/conversation-info-sheet'

const TIPS = [
  { icon: Globe2, title: 'All branches', text: 'One room for announcements and “who has this?” questions.' },
  { icon: Building2, title: 'Branch channels', text: 'Every branch has its own room; staff join automatically.' },
  { icon: Package, title: 'Share a product', text: 'Anyone can check that item’s stock in every branch, right in the chat.' },
  { icon: Users, title: 'People & groups', text: 'Message anyone directly, or make a group for managers or the stock team.' },
]

/**
 * Team chat between branches: the conversation list on the left, the open thread on the
 * right (one pane at a time below 1024px). The open conversation lives in the URL (?c=)
 * so a notification, a search hit or the browser's back button all land in the right place.
 */
export default function Chats() {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { c?: string; m?: string }
  const isMobile = useIsMobile()
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const meId: string | undefined = user?.id
  const isOrgAdmin = user?.systemRole === 'superAdmin' || user?.systemRole === 'system_admin'
  const live = useChatLive()
  const { data: conversations = [], isLoading, isFetching, isError, refetch } = useGetChatConversationsQuery(undefined, {
    pollingInterval: !live.connected && live.settled ? 15_000 : 0,
  })
  const [newOpen, setNewOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)

  const activeId = search.c ?? null
  const active = useMemo(() => conversations.find((c) => c.id === activeId) ?? null, [conversations, activeId])

  const select = (id: string | null, messageId?: string) =>
    navigate({ to: '/chats', search: (id ? { c: id, ...(messageId ? { m: messageId } : {}) } : {}) as never, replace: !!activeId && !isMobile })

  // A brand-new direct message or group is opened before the list refetch that includes it
  // has landed; give it a moment instead of treating it as "not yours".
  const justOpenedRef = useRef<{ id: string; at: number } | null>(null)
  const openNew = (id: string) => {
    justOpenedRef.current = { id, at: Date.now() }
    select(id)
  }

  // A link to a conversation this person can no longer see (left the group, moved branch).
  useEffect(() => {
    if (!activeId || active || isLoading || isFetching || !conversations.length) return
    const fresh = justOpenedRef.current
    if (fresh && fresh.id === activeId && Date.now() - fresh.at < 10_000) {
      void refetch()
      return
    }
    select(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, active, isLoading, isFetching, conversations.length])

  const showList = !isMobile || !active
  const showThread = !isMobile || !!active

  return (
    // Full-bleed like the WhatsApp inbox: cancels <Main>'s padding and fills the height left —
    // minus the bottom notification / install banners, which are fixed over the page and
    // would otherwise sit on top of the message box.
    <div className='-mx-4 -my-6 flex h-[calc(100%+3rem-var(--push-banner-height,0px)-var(--pwa-banner-height,0px))] min-h-[420px] overflow-hidden bg-background'>
      {showList && (
        <aside className={cn('flex min-h-0 flex-col border-e bg-card', isMobile ? 'w-full' : 'w-80 shrink-0 xl:w-96')}>
          {isError ? (
            <div className='flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground'>
              Could not load your conversations.
              <button type='button' onClick={() => refetch()} className='font-medium text-primary underline'>
                Try again
              </button>
            </div>
          ) : (
            <ConversationList
              conversations={conversations}
              activeId={activeId}
              meId={meId}
              activeBranchId={activeBranchId}
              loading={isLoading}
              onSelect={(id, messageId) => select(id, messageId)}
              onNewChat={() => setNewOpen(true)}
            />
          )}
        </aside>
      )}

      {showThread && (
        <section className='flex min-h-0 min-w-0 flex-1 flex-col'>
          {active ? (
            <ChatThread
              key={active.id}
              conversation={active}
              meId={meId}
              isOrgAdmin={isOrgAdmin}
              focusMessageId={search.m}
              onBack={isMobile ? () => select(null) : undefined}
              onOpenInfo={() => setInfoOpen(true)}
            />
          ) : (
            <div className='flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto p-8 text-center'>
              <span className='flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary'>
                <MessagesSquare className='size-8' />
              </span>
              <div>
                <h2 className='text-lg font-semibold'>Talk to every branch from here</h2>
                <p className='mt-1 text-sm text-muted-foreground'>Pick a conversation on the left, or start a new one.</p>
              </div>
              <div className='grid w-full max-w-xl grid-cols-1 gap-3 text-start sm:grid-cols-2'>
                {TIPS.map(({ icon: Icon, title, text }) => (
                  <div key={title} className='flex gap-3 rounded-lg border bg-card p-3'>
                    <Icon className='mt-0.5 size-5 shrink-0 text-primary' />
                    <div>
                      <p className='text-sm font-medium'>{title}</p>
                      <p className='text-xs text-muted-foreground'>{text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <NewChatDialog open={newOpen} onOpenChange={setNewOpen} onOpened={openNew} />
      <ConversationInfoSheet
        conversation={active}
        open={infoOpen && !!active}
        onOpenChange={setInfoOpen}
        meId={meId}
        isOrgAdmin={isOrgAdmin}
        onLeft={() => select(null)}
      />
    </div>
  )
}
