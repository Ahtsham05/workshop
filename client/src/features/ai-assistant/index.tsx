import { useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch } from 'react-redux'
import { toast } from 'sonner'
import { format, isToday, isYesterday, isSameDay, isValid } from 'date-fns'
import { Bot, RefreshCw, PanelLeft, SquarePen, ArrowDown } from 'lucide-react'
import { Fragment } from 'react/jsx-runtime'
import { cn } from '@/lib/utils'
import type { AppDispatch } from '@/stores/store'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  aiAssistantApi,
  useListConversationsQuery,
  useCreateConversationMutation,
  useDeleteConversationMutation,
  useGetMessagesQuery,
  useSendMessageMutation,
  type AiMessage,
} from '@/stores/aiAssistant.api'
import { ConversationList } from './components/conversation-list'
import { MessageBubble } from './components/message-bubble'
import { StreamingMessage } from './components/streaming-message'
import { ChatInput } from './components/chat-input'
import { QuickActions } from './components/quick-actions'
import { WelcomeState } from './components/welcome-state'
import { AssistantStatusCard } from './components/assistant-status-card'
import { RecentConversationsCard } from './components/recent-conversations-card'
import { BusinessOverviewPanel } from './components/business-overview-panel'
import { VoiceModeOverlay } from './components/voice-mode/voice-mode-overlay'
import { useSpeechSynthesis } from './hooks/use-speech-synthesis'
import { useVoiceMode, type VoiceReply } from './hooks/use-voice-mode'
import { useVoiceLanguage } from './hooks/use-voice-language'
import { useViewportHeight } from './hooks/use-viewport-height'
import { VOICE_ERROR_MESSAGES } from './lib/voice-errors'
import { detectVoiceLanguage } from './lib/detect-language'
import { VOICE_LANGUAGES } from './lib/voice-languages'
import { streamAssistantMessage } from './lib/stream-message'

/** One in-progress assistant reply — see streamAndTrack. */
interface StreamState {
  conversationId: string
  text: string
  status: string | null
  interrupted: boolean
  startedAt: number
}

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
  const dispatch = useDispatch<AppDispatch>()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  // Open by default only on desktop (lg+), where the drawer sits alongside the chat — closed on
  // mobile AND tablet, where it's a full-screen overlay that would otherwise hide the chat on
  // first load.
  const [showSidebar, setShowSidebar] = useState(() => {
    if (typeof window === 'undefined') return true
    return !window.matchMedia('(max-width: 1023px)').matches
  })
  const [pendingMessage, setPendingMessage] = useState<{ conversationId: string; content: string } | null>(null)
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null)
  // The one in-progress streamed reply for the active conversation — cleared once the officially
  // persisted assistant message (same content) shows up in `messages` (see reconciliation effect
  // below), so this never has to guess exactly when the backend refetch lands.
  const [streamState, setStreamState] = useState<StreamState | null>(null)
  const streamAbortRef = useRef<AbortController | null>(null)
  const scrollAnchorRef = useRef<HTMLDivElement>(null)
  const scrollRootRef = useRef<HTMLDivElement>(null)
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true)
  const [hasNewBelow, setHasNewBelow] = useState(false)
  // The shared page shell only sets `min-height` up to <body>, so a plain `h-full` here can
  // resolve against an indeterminate ancestor height and silently fail to bound this page to
  // the viewport — letting rich chat content (or the right rail) grow the whole page instead
  // of scrolling internally, which pushes the composer out of view. Measuring the real
  // available height directly sidesteps that ambiguity entirely.
  const { ref: pageRef, height: pageHeight } = useViewportHeight<HTMLDivElement>()

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
  const [sendMessage] = useSendMessageMutation()
  // True only while a streamed text reply is actively being generated for the active
  // conversation — used to drive the composer's Stop button and disabled state.
  const isGenerating = streamState !== null && !streamState.interrupted && streamState.conversationId === activeId

  const { selection: voiceLanguageSelection, option: voiceLanguage, isAuto: isVoiceLanguageAuto, setCode: setVoiceLanguageCode } =
    useVoiceLanguage()
  const synthesis = useSpeechSynthesis(voiceLanguage.bcp47)

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

  // Clears the streaming placeholder once the officially persisted assistant message (created
  // no earlier than when this stream started) shows up in the refetched list — handles both the
  // normal `done` path and the Stop-button/abort path with the same logic, since in both cases
  // we just need to wait for the backend's invalidateTags-triggered refetch to catch up.
  useEffect(() => {
    if (!streamState || streamState.conversationId !== activeId) return
    const hasPersistedReply = messages.some(
      (m) => m.role === 'assistant' && new Date(m.createdAt).getTime() >= streamState.startedAt
    )
    if (hasPersistedReply) setStreamState(null)
  }, [messages, streamState, activeId])

  // Auto-follows new content while the user is scrolled to (or near) the bottom, matching a
  // normal chat app — but stops forcing the scroll the moment they scroll up to read earlier
  // messages, surfacing a "New response" button instead so their reading position isn't yanked.
  useEffect(() => {
    const viewport = scrollRootRef.current?.querySelector<HTMLDivElement>('[data-slot="scroll-area-viewport"]')
    if (!viewport) return undefined
    const handleScroll = () => {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
      const pinned = distanceFromBottom < 96
      setIsPinnedToBottom(pinned)
      if (pinned) setHasNewBelow(false)
    }
    viewport.addEventListener('scroll', handleScroll, { passive: true })
    return () => viewport.removeEventListener('scroll', handleScroll)
  }, [activeId])

  useEffect(() => {
    setIsPinnedToBottom(true)
    setHasNewBelow(false)
  }, [activeId])

  useEffect(() => {
    if (isPinnedToBottom) {
      scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth' })
    } else if (activeId) {
      setHasNewBelow(true)
    }
  }, [displayMessages, streamState?.text, streamState?.status, isPinnedToBottom, activeId])

  const scrollToLatest = () => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth' })
    setIsPinnedToBottom(true)
    setHasNewBelow(false)
  }

  // On mobile and tablet the sidebar is a full-screen drawer, so picking something should return
  // you to the chat. On desktop (lg+) it sits alongside the chat permanently until the user closes it.
  const closeSidebarOnMobile = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
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

  /** Refetches the persisted messages/conversation list — same tags the old buffered mutation
   * invalidated, so title-derivation and the message list pick up what the stream just wrote. */
  const refreshAfterSend = (conversationId: string) => {
    dispatch(
      aiAssistantApi.util.invalidateTags([{ type: 'AiMessage', id: conversationId }, 'AiConversation'])
    )
  }

  /** Voice mode's send path — buffered (non-streaming), since it needs the full reply text
   * before speaking it. Same backend conversation engine as the streamed text path either way. */
  const sendAndTrack = async (conversationId: string, text: string): Promise<AiMessage | null> => {
    try {
      return await sendMessage({ conversationId, text }).unwrap()
    } catch {
      return null
    }
  }

  const resolveConversationId = async (): Promise<string> => {
    if (activeId) return activeId
    const conversation = await createConversation().unwrap()
    setActiveId(conversation.id)
    closeSidebarOnMobile()
    return conversation.id
  }

  /** Text chat's send path — streams the reply live into `streamState` (see StreamingMessage). */
  const streamAndTrack = async (conversationId: string, text: string) => {
    const controller = new AbortController()
    streamAbortRef.current = controller
    setStreamState({ conversationId, text: '', status: 'Thinking…', interrupted: false, startedAt: Date.now() })

    const result = await streamAssistantMessage({
      conversationId,
      text,
      signal: controller.signal,
      onEvent: (event) => {
        setStreamState((s) => {
          if (!s) return s
          return event.type === 'delta'
            ? { ...s, text: s.text + event.text, status: null }
            : { ...s, status: event.text }
        })
      },
    })

    streamAbortRef.current = null

    if (result.aborted) {
      setStreamState((s) => (s ? { ...s, interrupted: true, status: null } : s))
      // The backend only finishes persisting the partial reply a moment after the client
      // disconnects (see aiAssistant.controller.js#sendMessageStream's abort handling) — a
      // short delay here gives that write time to land before we ask the cache to refetch.
      setTimeout(() => refreshAfterSend(conversationId), 700)
      return
    }

    if (result.error) {
      setStreamState(null)
      throw new Error(result.error)
    }

    refreshAfterSend(conversationId)
  }

  const submitText = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isGenerating || isCreating) return

    setDraft('')
    try {
      const conversationId = await resolveConversationId()
      setPendingMessage({ conversationId, content: trimmed })
      await streamAndTrack(conversationId, trimmed)
    } catch {
      toast.error('Failed to send message. Please try again.')
      setDraft(trimmed)
      setPendingMessage(null)
    }
  }

  /** Same send path, but returns the reply so voice mode can show/speak it. */
  const submitForVoice = async (text: string): Promise<VoiceReply | null> => {
    const trimmed = text.trim()
    if (!trimmed) return null
    try {
      const conversationId = await resolveConversationId()
      setPendingMessage({ conversationId, content: trimmed })
      const result = await sendAndTrack(conversationId, trimmed)
      if (!result) throw new Error('send failed')
      return { text: result.content, toolCalls: result.toolCalls }
    } catch {
      toast.error('Failed to send message. Please try again.')
      setPendingMessage(null)
      return null
    }
  }

  const voiceMode = useVoiceMode({
    language: isVoiceLanguageAuto ? undefined : voiceLanguage.bcp47,
    autoDetectLanguage: isVoiceLanguageAuto,
    synthesis,
    onSubmit: submitForVoice,
  })

  useEffect(() => {
    if (voiceMode.error) toast.error(VOICE_ERROR_MESSAGES[voiceMode.error])
  }, [voiceMode.error])

  const stopGenerating = () => {
    streamAbortRef.current?.abort()
    toast('Stopped.')
  }

  const handleToggleSpeak = (message: AiMessage) => {
    if (speakingMessageId === message.id) {
      synthesis.cancel()
      setSpeakingMessageId(null)
      return
    }
    setSpeakingMessageId(message.id)
    const spokenLang = isVoiceLanguageAuto
      ? VOICE_LANGUAGES.find((l) => l.code === detectVoiceLanguage(message.content))?.bcp47
      : undefined
    synthesis.speak(message.content, () => setSpeakingMessageId((id) => (id === message.id ? null : id)), spokenLang)
  }

  return (
    // The shared `Main` layout wrapper adds its own px-4 py-6 — cancel that out below sm so this
    // page is truly edge-to-edge on mobile; tablet/desktop keep the normal page gutters.
    //
    // Height is measured (via useViewportHeight), not `h-full`/percentage classes: `Main` only
    // constrains itself through flex-basis, not a hard height, so a plain `h-full` chain here
    // can resolve against an indeterminate ancestor and silently fail to bound the page. The
    // chat column below has its own `overflow-hidden` + bounded ScrollArea, which is what
    // actually keeps the composer pinned — this outer div intentionally stays overflow-visible
    // so the right rail is never clipped if its content happens to run taller than the chat.
    <div
      ref={pageRef}
      style={pageHeight ? { height: pageHeight } : undefined}
      className='-mx-4 -my-6 w-[calc(100%+2rem)] sm:m-0 sm:w-full'
    >
      <div className='relative flex h-full min-h-0 gap-0 p-0 lg:gap-4 lg:p-6'>
        <div
          className={cn(
            'absolute inset-0 z-40 bg-background transition-transform duration-300 ease-in-out',
            'lg:static lg:z-auto lg:translate-x-0 lg:shrink-0 lg:overflow-hidden lg:rounded-md lg:border lg:bg-transparent lg:shadow-xs lg:transition-[width,opacity] lg:duration-300 lg:ease-in-out lg:pointer-events-auto',
            showSidebar
              ? 'translate-x-0 pointer-events-auto lg:w-72 lg:opacity-100 2xl:w-80'
              : '-translate-x-full pointer-events-none lg:w-0 lg:border-transparent lg:opacity-0'
          )}
        >
          <div className='flex h-full min-h-0 flex-col'>
            <div className='flex-none border-b py-1'>
              <QuickActions onSelect={submitText} />
            </div>
            <div className='min-h-0 flex-1'>
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
          </div>
        </div>

        <div className='relative flex min-h-0 flex-1 flex-col overflow-hidden sm:rounded-md sm:border sm:shadow-xs'>
          <div className='sticky top-0 z-20 flex flex-none items-center gap-3 border-b bg-background px-4 py-3'>
            <Button
              size='icon'
              variant='ghost'
              onClick={() => setShowSidebar((v) => !v)}
              className='h-8 w-8 shrink-0'
              title={showSidebar ? 'Hide quick actions & history' : 'Show quick actions & history'}
            >
              <PanelLeft className='h-4 w-4' />
            </Button>
            <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10'>
              <Bot className='h-5 w-5 text-primary' />
            </div>
            <div className='flex-1'>
              <p className='text-sm font-semibold leading-none'>AI Assistant</p>
              <p className='text-xs text-muted-foreground'>Your intelligent business companion</p>
            </div>
            <Button size='icon' variant='ghost' onClick={handleNewChat} className='h-8 w-8 shrink-0' title='New chat'>
              <SquarePen className='h-4 w-4' />
            </Button>
          </div>

          <div ref={scrollRootRef} className='min-h-0 flex-1'>
            <ScrollArea className='h-full bg-muted/30 px-4 py-4'>
              {isConversationsError && (
                <div className='mb-3'>
                  <ErrorBanner message="Couldn't load your conversations." onRetry={refetchConversations} />
                </div>
              )}

              {!activeId && <WelcomeState onSelect={submitText} />}

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
                        <MessageBubble
                          message={m}
                          onFollowUp={submitText}
                          isSpeaking={speakingMessageId === m.id}
                          onToggleSpeak={synthesis.isSupported && m.id !== 'pending' ? () => handleToggleSpeak(m) : undefined}
                        />
                      </Fragment>
                    )
                  })}

                  {streamState && streamState.conversationId === activeId && (
                    <StreamingMessage text={streamState.text} status={streamState.status} interrupted={streamState.interrupted} />
                  )}
                  <div ref={scrollAnchorRef} />
                </div>
              )}
            </ScrollArea>
          </div>

          {hasNewBelow && (
            <button
              type='button'
              onClick={scrollToLatest}
              className='absolute bottom-20 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-medium shadow-md transition-colors hover:bg-muted motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1'
            >
              <ArrowDown className='h-3 w-3' />
              New response
            </button>
          )}

          <ChatInput
            value={draft}
            onChange={setDraft}
            onSubmit={submitText}
            onOpenVoiceMode={voiceMode.open}
            isMicSupported={voiceMode.isMicSupported}
            disabled={isGenerating || isCreating}
            isSending={isGenerating}
            onStop={stopGenerating}
          />

          <VoiceModeOverlay
            voiceMode={voiceMode}
            voiceLanguage={voiceLanguage}
            voiceLanguageSelection={voiceLanguageSelection}
            onVoiceLanguageChange={setVoiceLanguageCode}
          />
        </div>

        <div className='hidden shrink-0 flex-col gap-4 xl:flex xl:w-72 2xl:w-80'>
          <AssistantStatusCard />
          <RecentConversationsCard
            conversations={conversations}
            onSelect={handleSelectConversation}
            onViewAll={() => setShowSidebar(true)}
          />
          <BusinessOverviewPanel />
        </div>
      </div>
    </div>
  )
}
