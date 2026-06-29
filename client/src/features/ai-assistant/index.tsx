import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { format, isToday, isYesterday, isSameDay, isValid } from 'date-fns'
import { Bot, RefreshCw, PanelLeft, SquarePen } from 'lucide-react'
import { Fragment } from 'react/jsx-runtime'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  useListConversationsQuery,
  useCreateConversationMutation,
  useDeleteConversationMutation,
  useGetMessagesQuery,
  useSendMessageMutation,
  type AiMessage,
} from '@/stores/aiAssistant.api'
import { ConversationList } from './components/conversation-list'
import { MessageBubble } from './components/message-bubble'
import { ChatInput } from './components/chat-input'

const SUGGESTIONS = [
  'How much profit did I make this month?',
  'Show unpaid customers',
  "Which products haven't sold in 30 days?",
  'Who are my top customers this month?',
]

function dateSeparatorLabel(date: Date) {
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'MMMM d, yyyy')
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className='flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive'>
      <span>{message}</span>
      <Button size='sm' variant='outline' onClick={onRetry} className='h-7 shrink-0 gap-1.5'>
        <RefreshCw className='h-3 w-3' />
        Retry
      </Button>
    </div>
  )
}

export default function AiAssistantPage() {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [showSidebar, setShowSidebar] = useState(false)
  const [pendingMessage, setPendingMessage] = useState<{ conversationId: string; content: string } | null>(null)
  const scrollAnchorRef = useRef<HTMLDivElement>(null)

  const {
    data: conversations = [],
    isLoading: isLoadingConversations,
    isError: isConversationsError,
    refetch: refetchConversations,
  } = useListConversationsQuery()
  const {
    data: messages = [],
    isFetching: isLoadingMessages,
    isError: isMessagesError,
    refetch: refetchMessages,
  } = useGetMessagesQuery(activeId ?? '', { skip: !activeId })
  const [createConversation, { isLoading: isCreating }] = useCreateConversationMutation()
  const [deleteConversation] = useDeleteConversationMutation()
  const [sendMessage, { isLoading: isSending }] = useSendMessageMutation()

  // Once the real message list catches up with what we optimistically showed, drop the placeholder.
  useEffect(() => {
    if (pendingMessage && messages.some((m) => m.role === 'user' && m.content === pendingMessage.content)) {
      setPendingMessage(null)
    }
  }, [messages, pendingMessage])

  const displayMessages = useMemo<AiMessage[]>(() => {
    if (pendingMessage && pendingMessage.conversationId === activeId) {
      return [
        ...messages,
        {
          id: 'pending',
          conversationId: pendingMessage.conversationId,
          role: 'user',
          content: pendingMessage.content,
          createdAt: new Date().toISOString(),
        },
      ]
    }
    return messages
  }, [messages, pendingMessage, activeId])

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [displayMessages, isSending])

  // On mobile the sidebar is a full-screen drawer, so picking something should return you to the
  // chat. On larger screens it sits alongside the chat permanently until the user closes it.
  const closeSidebarOnMobile = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches) {
      setShowSidebar(false)
    }
  }

  const handleNewChat = () => {
    setActiveId(null)
    closeSidebarOnMobile()
  }

  const handleSelectConversation = (id: string) => {
    setActiveId(id)
    closeSidebarOnMobile()
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteConversation(id).unwrap()
      if (activeId === id) setActiveId(null)
    } catch {
      toast.error('Failed to delete conversation')
    }
  }

  const submitText = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isSending || isCreating) return

    setDraft('')
    try {
      let conversationId = activeId
      if (!conversationId) {
        const conversation = await createConversation().unwrap()
        conversationId = conversation.id
        setActiveId(conversationId)
        closeSidebarOnMobile()
      }
      setPendingMessage({ conversationId, content: trimmed })
      await sendMessage({ conversationId, text: trimmed }).unwrap()
    } catch {
      toast.error('Failed to send message. Please try again.')
      setDraft(trimmed)
      setPendingMessage(null)
    }
  }

  return (
    // The shared `Main` layout wrapper adds its own px-4 py-6 — cancel that out below sm so this
    // page is truly edge-to-edge on mobile; tablet/desktop keep the normal page gutters.
    <div className='-mx-4 -my-6 h-[calc(100%+3rem)] w-[calc(100%+2rem)] sm:m-0 sm:h-full sm:w-full'>
      <div className='relative flex h-full gap-0 p-0 sm:gap-4 sm:p-4 md:p-6'>
        <div
          className={cn(
            'absolute inset-0 z-40 bg-background transition-transform duration-300 ease-in-out',
            'sm:static sm:z-auto sm:translate-x-0 sm:shrink-0 sm:overflow-hidden sm:rounded-md sm:border sm:bg-transparent sm:shadow-xs sm:transition-[width,opacity] sm:duration-300 sm:ease-in-out sm:pointer-events-auto',
            showSidebar
              ? 'translate-x-0 pointer-events-auto sm:w-56 sm:opacity-100 lg:w-72 2xl:w-80'
              : '-translate-x-full pointer-events-none sm:w-0 sm:border-transparent sm:opacity-0'
          )}
        >
          <ConversationList
            conversations={conversations}
            isLoading={isLoadingConversations}
            activeId={activeId}
            onSelect={handleSelectConversation}
            onNewChat={handleNewChat}
            onDelete={handleDelete}
            onClose={() => setShowSidebar(false)}
          />
        </div>

        <div className='flex flex-1 flex-col overflow-hidden sm:rounded-md sm:border sm:shadow-xs'>
          <div className='flex flex-none items-center gap-3 border-b bg-background px-4 py-3'>
            <Button
              size='icon'
              variant='ghost'
              onClick={() => setShowSidebar((v) => !v)}
              className='h-8 w-8 shrink-0'
              title={showSidebar ? 'Hide conversations' : 'Show conversations'}
            >
              <PanelLeft className='h-4 w-4' />
            </Button>
            <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10'>
              <Bot className='h-5 w-5 text-primary' />
            </div>
            <div className='flex-1'>
              <p className='text-sm font-semibold leading-none'>AI Assistant</p>
              <p className='text-xs text-muted-foreground'>Answers from your live business data</p>
            </div>
            <Button size='icon' variant='ghost' onClick={handleNewChat} className='h-8 w-8 shrink-0' title='New chat'>
              <SquarePen className='h-4 w-4' />
            </Button>
          </div>

          <ScrollArea className='flex-1 bg-muted/30 px-4 py-4'>
            {isConversationsError && (
              <div className='mb-3'>
                <ErrorBanner message="Couldn't load your conversations." onRetry={refetchConversations} />
              </div>
            )}

            {!activeId && (
              <div className='flex h-full flex-col items-center justify-center gap-4 py-12 text-center'>
                <div className='flex h-14 w-14 items-center justify-center rounded-full bg-primary/10'>
                  <Bot className='h-7 w-7 text-primary' />
                </div>
                <div>
                  <p className='text-lg font-semibold'>Ask anything about your business</p>
                  <p className='text-sm text-muted-foreground'>
                    Type, or hold the mic, in any language — I'll answer using your live data.
                  </p>
                </div>
                <div className='grid w-full max-w-md gap-2 sm:grid-cols-2'>
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type='button'
                      onClick={() => submitText(s)}
                      className='rounded-lg border bg-background px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted'
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeId && (
              <div className='flex flex-col gap-3'>
                {isMessagesError && (
                  <ErrorBanner message="Couldn't load this conversation." onRetry={refetchMessages} />
                )}

                {isLoadingMessages && messages.length === 0 && (
                  <div className='space-y-3'>
                    {[0, 1].map((i) => (
                      <div key={i} className='h-12 w-2/3 animate-pulse rounded-2xl bg-muted' />
                    ))}
                  </div>
                )}

                {displayMessages.map((m, i) => {
                  const current = new Date(m.createdAt)
                  const previous = i > 0 ? new Date(displayMessages[i - 1].createdAt) : null
                  const showSeparator = isValid(current) && (!previous || !isValid(previous) || !isSameDay(current, previous))
                  return (
                    <Fragment key={m.id}>
                      {showSeparator && (
                        <div className='my-1 flex justify-center'>
                          <span className='rounded-full bg-background px-3 py-1 text-xs text-muted-foreground shadow-sm'>
                            {dateSeparatorLabel(current)}
                          </span>
                        </div>
                      )}
                      <MessageBubble message={m} />
                    </Fragment>
                  )
                })}

                {isSending && (
                  <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                    <Bot className='h-4 w-4 animate-pulse' />
                    Thinking…
                  </div>
                )}
                <div ref={scrollAnchorRef} />
              </div>
            )}
          </ScrollArea>

          <ChatInput value={draft} onChange={setDraft} onSubmit={submitText} disabled={isSending || isCreating} />
        </div>
      </div>
    </div>
  )
}
