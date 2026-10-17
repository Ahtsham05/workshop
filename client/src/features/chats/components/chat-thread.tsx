import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useDispatch } from 'react-redux'
import { ArrowDown, ArrowLeft, Bell, BellOff, Info, Loader2, Pin, PinOff } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { AppDispatch } from '@/stores/store'
import {
  useDeleteChatMessageMutation,
  useGetChatConversationQuery,
  useGetChatMessagesQuery,
  useLazyGetOlderChatMessagesQuery,
  useMarkChatReadMutation,
  useReactToChatMessageMutation,
  useSetChatPreferencesMutation,
  type ChatConversation,
  type ChatMember,
  type ChatMessage,
  type ChatMessageStatus,
} from '@/stores/chat.api'
import { laterStatus, receiptStatusFor, setActiveConversation, useChatLive } from '../lib/chat-live'
import { useOutbox } from '../lib/chat-outbox'
import { clearUnread, replaceMessage } from '../lib/chat-cache'
import { chatDayKey, chatDayLabel, presenceLabel } from '../lib/chat-format'
import { useChatSender } from '../hooks/use-chat-sender'
import { ConversationIcon } from './conversation-list'
import { conversationSubtitle } from '../lib/chat-format'
import { MessageBubble } from './message-bubble'
import { MessageInfoDialog } from './message-info-dialog'
import { MediaViewer, type MediaItem } from './media-viewer'
import { isVisual } from '../lib/chat-media'
import { ChatComposer } from './chat-composer'

const GROUP_GAP_MS = 5 * 60 * 1000
const THREAD_POLL_MS = 5000

interface ChatThreadProps {
  conversation: ChatConversation
  meId: string | undefined
  isOrgAdmin: boolean
  focusMessageId?: string
  onBack?: () => void
  onOpenInfo: () => void
}

export function ChatThread({ conversation, meId, isOrgAdmin, focusMessageId, onBack, onOpenInfo }: ChatThreadProps) {
  const dispatch = useDispatch<AppDispatch>()
  const live = useChatLive()
  const fallback = !live.connected && live.settled
  const { data: page, isLoading, isError, refetch } = useGetChatMessagesQuery(conversation.id, {
    pollingInterval: fallback ? THREAD_POLL_MS : 0,
  })
  const { data: detail } = useGetChatConversationQuery(conversation.id)
  const [loadOlder, { isFetching: loadingOlder }] = useLazyGetOlderChatMessagesQuery()
  const [markRead] = useMarkChatReadMutation()
  const [react] = useReactToChatMessageMutation()
  const [deleteMessage] = useDeleteChatMessageMutation()
  const [setPrefs] = useSetChatPreferencesMutation()
  const { retry, discard } = useChatSender()
  const outbox = useOutbox(conversation.id)

  const [older, setOlder] = useState<ChatMessage[]>([])
  const [hasMoreOlder, setHasMoreOlder] = useState(false)
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [editing, setEditing] = useState<ChatMessage | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ChatMessage | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null)
  // WhatsApp-style "follow the conversation": stays on until the person scrolls UP, so a
  // smooth scroll still in flight, a photo finishing loading or the composer growing never
  // knocks the view off the latest message.
  const pinnedRef = useRef(true)
  const lastScrollTopRef = useRef(0)
  // Where "new messages" started when this thread was opened (frozen for the visit).
  const unreadFromRef = useRef<string | null>(conversation.unread > 0 ? conversation.lastReadAt ?? '1970-01-01' : null)

  // Reset per conversation.
  useEffect(() => {
    setOlder([])
    setReplyTo(null)
    setEditing(null)
    setHighlightId(null)
    unreadFromRef.current = conversation.unread > 0 ? conversation.lastReadAt ?? '1970-01-01' : null
    setActiveConversation(conversation.id)
    return () => setActiveConversation(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id])

  useEffect(() => {
    if (page && older.length === 0) setHasMoreOlder(page.hasMore)
  }, [page, older.length])

  const messages = useMemo(() => {
    const byId = new Map<string, ChatMessage>()
    older.forEach((m) => byId.set(m.id, m))
    page?.messages.forEach((m) => byId.set(m.id, m))
    const saved = [...byId.values()]
    const savedClientIds = new Set(saved.map((m) => m.clientId).filter(Boolean))
    const pending = outbox.filter((m) => !savedClientIds.has(m.clientId))
    return [...saved, ...pending].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }, [older, page, outbox])

  // Mark read whenever something new from someone else is on screen.
  const lastOtherAt = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i]
      if (m.senderId !== meId && !m.pending) return m.createdAt
    }
    return null
  }, [messages, meId])
  useEffect(() => {
    if (!lastOtherAt || document.visibilityState !== 'visible') return
    if (conversation.lastReadAt && new Date(conversation.lastReadAt) >= new Date(lastOtherAt) && conversation.unread === 0) return
    clearUnread(dispatch, conversation.id)
    const timer = window.setTimeout(() => void markRead(conversation.id), 400)
    return () => window.clearTimeout(timer)
  }, [lastOtherAt, conversation.id, conversation.lastReadAt, conversation.unread, dispatch, markRead])

  /* ── Scrolling ────────────────────────────────────────────────────────── */

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  // First paint of a thread: land on the first unread message, or the bottom.
  const initialisedFor = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (!page || initialisedFor.current === conversation.id) return
    initialisedFor.current = conversation.id
    const firstUnread = unreadFromRef.current
      ? messages.find((m) => m.senderId !== meId && new Date(m.createdAt) > new Date(unreadFromRef.current!))
      : null
    const el = scrollRef.current
    if (firstUnread && !focusMessageId) {
      document.getElementById('chat-unread-divider')?.scrollIntoView({ block: 'center' })
      pinnedRef.current = !!el && el.scrollHeight - el.scrollTop - el.clientHeight < 80
    } else {
      pinnedRef.current = true
      scrollToBottom()
    }
    if (el) lastScrollTopRef.current = el.scrollTop
    setAtBottom(pinnedRef.current)
  }, [page, conversation.id, messages, meId, focusMessageId, scrollToBottom])

  // New message at the bottom: follow it if the person was following along (or sent it).
  const lastId = messages[messages.length - 1]?.id
  const lastMine = messages[messages.length - 1]?.senderId === meId
  useLayoutEffect(() => {
    if (initialisedFor.current !== conversation.id) return
    if (pinnedRef.current || lastMine) {
      pinnedRef.current = true
      setAtBottom(true)
      scrollToBottom(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId])

  // Anything that changes height after the fact — photos and product cards loading, the
  // typing indicator, the composer growing or a reply preview opening — keeps a pinned view
  // on the latest message.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      if (!pinnedRef.current) return
      el.scrollTop = el.scrollHeight
      lastScrollTopRef.current = el.scrollTop
    })
    observer.observe(el)
    if (contentEl) observer.observe(contentEl)
    return () => observer.disconnect()
  }, [contentEl])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    // Only the person scrolling up unpins; programmatic scrolls only ever go down.
    if (nearBottom) pinnedRef.current = true
    else if (el.scrollTop < lastScrollTopRef.current - 1) pinnedRef.current = false
    lastScrollTopRef.current = el.scrollTop
    setAtBottom(pinnedRef.current)
    if (el.scrollTop < 120 && hasMoreOlder && !loadingOlder) void fetchOlder()
  }

  const fetchOlder = useCallback(async () => {
    const oldest = messages.find((m) => !m.pending)
    if (!oldest) return null
    const el = scrollRef.current
    const before = el?.scrollHeight ?? 0
    const result = await loadOlder({ id: conversation.id, before: oldest.createdAt }).unwrap().catch(() => null)
    if (!result) return null
    setOlder((current) => [...result.messages, ...current])
    setHasMoreOlder(result.hasMore)
    // Keep the message the person was looking at in the same place on screen.
    requestAnimationFrame(() => {
      if (el) el.scrollTop += el.scrollHeight - before
    })
    return result
  }, [messages, loadOlder, conversation.id])

  const jumpTo = useCallback(
    async (messageId: string) => {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const node = document.getElementById(`chat-msg-${messageId}`)
        if (node) {
          node.scrollIntoView({ block: 'center', behavior: 'smooth' })
          setHighlightId(messageId)
          window.setTimeout(() => setHighlightId((id) => (id === messageId ? null : id)), 2200)
          return
        }
        const result = await fetchOlder()
        if (!result || (!result.hasMore && !result.messages.length)) break
        await new Promise((r) => requestAnimationFrame(r))
      }
      toast.info('That message is too far back to show here.')
    },
    [fetchOlder]
  )

  useEffect(() => {
    if (focusMessageId && page) void jumpTo(focusMessageId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMessageId, conversation.id, !!page])

  /* ── Ticks ────────────────────────────────────────────────────────────── */

  const others = useMemo(() => (detail?.members ?? []).filter((m) => m.id !== meId), [detail, meId])
  // Same rule as the server (chat.service.js#statusFrom): every other member must have
  // received it for ✓✓ and read it for blue — in a group or channel as well as 1:1.
  const statusFor = useCallback(
    (message: ChatMessage): ChatMessageStatus => {
      const at = new Date(message.createdAt).getTime()
      let status: ChatMessageStatus = 'sent'
      if (others.length) {
        const reached = (value: string | null) => !!value && new Date(value).getTime() >= at
        if (others.every((m) => reached(m.lastDeliveredAt))) status = others.every((m) => reached(m.lastReadAt)) ? 'read' : 'delivered'
      }
      // A receipt that landed before the member list caught up still counts.
      return laterStatus(status, receiptStatusFor(conversation.id, message.createdAt)) ?? status
    },
    [others, conversation.id]
  )
  const [infoFor, setInfoFor] = useState<ChatMessage | null>(null)

  /* ── Media viewer: every photo/video in the thread, oldest first ───────── */

  const mediaItems = useMemo<MediaItem[]>(
    () =>
      messages.flatMap((m) =>
        m.deletedAt
          ? []
          : m.attachments
              .map((attachment, index) => ({ attachment, index }))
              .filter(({ attachment }) => isVisual(attachment) && (attachment.url || attachment.localUrl))
              .map(({ attachment, index }) => ({
                key: `${m.clientId && m.pending ? m.clientId : m.id}:${index}`,
                attachment,
                senderName: m.senderId === meId ? 'You' : m.senderName,
                createdAt: m.createdAt,
                caption: m.text,
              }))
      ),
    [messages, meId]
  )
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const openMedia = useCallback(
    (message: ChatMessage, attachmentIndex: number) => {
      const key = `${message.clientId && message.pending ? message.clientId : message.id}:${attachmentIndex}`
      const index = mediaItems.findIndex((item) => item.key === key)
      if (index >= 0) setViewerIndex(index)
    },
    [mediaItems]
  )

  /* ── Actions ──────────────────────────────────────────────────────────── */

  const onReact = useCallback(
    (message: ChatMessage, emoji: string) => {
      react({ id: message.id, emoji })
        .unwrap()
        .then((updated) => replaceMessage(dispatch, conversation.id, updated))
        .catch(() => toast.error('Could not add the reaction'))
    },
    [react, dispatch, conversation.id]
  )
  const onRetry = useCallback((m: ChatMessage) => void retry(m.clientId), [retry])
  const onDiscard = useCallback((m: ChatMessage) => discard(m.clientId), [discard])
  const onEdit = useCallback((m: ChatMessage) => {
    setReplyTo(null)
    setEditing(m)
  }, [])
  const onReply = useCallback((m: ChatMessage) => {
    setEditing(null)
    setReplyTo(m)
  }, [])

  const typing = (live.typing[conversation.id] || []).filter((p) => p.userId !== meId)
  const onlineCount = (detail?.members ?? []).filter((m) => live.online.has(m.id)).length
  const directId = conversation.directUser?.id
  const directOnline = directId ? live.online.has(directId) : false
  // Freshest "last seen": the live presence push, then the member list, then the chat list.
  const directLastSeen = directId
    ? [live.lastSeen[directId], detail?.members.find((m: ChatMember) => m.id === directId)?.lastSeenAt, conversation.directUser?.lastSeenAt]
        .filter((v): v is string => !!v)
        .sort()
        .pop()
    : undefined
  const subtitle =
    conversation.type === 'direct'
      ? presenceLabel(directOnline, directLastSeen)
      : detail
        ? `${detail.members.length} member${detail.members.length === 1 ? '' : 's'}${onlineCount ? ` · ${onlineCount} online` : ''}`
        : conversationSubtitle(conversation)

  const showSender = conversation.type !== 'direct'
  let unreadDividerShown = false

  return (
    <div className='flex h-full min-h-0 flex-col'>
      {/* Header */}
      <div className='flex items-center gap-2 border-b bg-card px-2 py-2 sm:px-3'>
        {onBack && (
          <Button size='icon' variant='ghost' className='size-8 shrink-0' onClick={onBack} aria-label='Back to conversations'>
            <ArrowLeft className='size-5' />
          </Button>
        )}
        <button type='button' onClick={onOpenInfo} className='flex min-w-0 flex-1 items-center gap-2.5 text-start'>
          <ConversationIcon conversation={conversation} className='size-9' />
          <span className='min-w-0'>
            <span className='block truncate text-sm font-semibold'>{conversation.name}</span>
            <span className={cn('block truncate text-xs', directOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
              {typing.length ? <span className='text-primary'>{typing.map((p) => p.name.split(' ')[0]).join(', ')} typing…</span> : subtitle}
            </span>
          </span>
        </button>
        <Button
          size='icon'
          variant='ghost'
          className='size-8 shrink-0'
          onClick={() => setPrefs({ id: conversation.id, pinned: !conversation.pinned })}
          title={conversation.pinned ? 'Unpin' : 'Pin to top'}
          aria-label={conversation.pinned ? 'Unpin conversation' : 'Pin conversation'}
        >
          {conversation.pinned ? <PinOff className='size-4' /> : <Pin className='size-4' />}
        </Button>
        <Button
          size='icon'
          variant='ghost'
          className='size-8 shrink-0'
          onClick={() => setPrefs({ id: conversation.id, muted: !conversation.muted })}
          title={conversation.muted ? 'Unmute notifications' : 'Mute notifications'}
          aria-label={conversation.muted ? 'Unmute' : 'Mute'}
        >
          {conversation.muted ? <BellOff className='size-4' /> : <Bell className='size-4' />}
        </Button>
        <Button size='icon' variant='ghost' className='size-8 shrink-0' onClick={onOpenInfo} title='Members & details' aria-label='Conversation details'>
          <Info className='size-4' />
        </Button>
      </div>

      {/* Messages */}
      <div className='relative min-h-0 flex-1'>
        <div ref={scrollRef} onScroll={onScroll} className='h-full overflow-y-auto overscroll-contain bg-muted/20 pb-3'>
          {isLoading ? (
            <div className='flex h-full items-center justify-center'>
              <Loader2 className='size-6 animate-spin text-muted-foreground' />
            </div>
          ) : isError ? (
            <div className='flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground'>
              Could not load messages.
              <Button size='sm' variant='outline' onClick={() => refetch()}>
                Try again
              </Button>
            </div>
          ) : messages.length === 0 && !hasMoreOlder ? (
            <div className='flex h-full flex-col items-center justify-center gap-3 p-6 text-center'>
              <ConversationIcon conversation={conversation} className='size-14' />
              <div>
                <p className='font-semibold'>{conversation.name}</p>
                <p className='mt-1 max-w-sm text-sm text-muted-foreground'>
                  {conversation.type === 'organization'
                    ? 'Announcements and questions for every branch. Share a product to ask who has it in stock.'
                    : conversation.type === 'branch'
                      ? 'Everyone who works in this branch is here.'
                      : 'Say hello — messages arrive instantly.'}
                </p>
              </div>
            </div>
          ) : (
            <div ref={setContentEl}>
              {hasMoreOlder ? (
                <div className='flex justify-center py-3'>
                  <Button size='sm' variant='ghost' onClick={() => void fetchOlder()} disabled={loadingOlder}>
                    {loadingOlder ? <Loader2 className='size-4 animate-spin' /> : 'Load earlier messages'}
                  </Button>
                </div>
              ) : (
                messages.length > 0 && <p className='py-4 text-center text-[11px] text-muted-foreground'>Start of the conversation</p>
              )}
              {messages.map((message, index) => {
                const prev = messages[index - 1]
                const newDay = !prev || chatDayKey(prev.createdAt) !== chatDayKey(message.createdAt)
                // A run = consecutive messages from one person (WhatsApp shows their name and
                // avatar once per run); a pause inside a run only adds a little space.
                const runStart = newDay || !prev || prev.kind === 'system' || prev.senderId !== message.senderId
                const groupStart = runStart || new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() > GROUP_GAP_MS
                const showDivider =
                  !unreadDividerShown &&
                  !!unreadFromRef.current &&
                  message.senderId !== meId &&
                  !message.pending &&
                  new Date(message.createdAt) > new Date(unreadFromRef.current)
                if (showDivider) unreadDividerShown = true
                return (
                  <Fragment key={message.clientId && message.pending ? message.clientId : message.id}>
                    {newDay && (
                      <div className='sticky top-1 z-10 my-3 flex justify-center'>
                        <span className='rounded-full border bg-card px-3 py-0.5 text-[11px] font-medium text-muted-foreground shadow-xs'>
                          {chatDayLabel(message.createdAt)}
                        </span>
                      </div>
                    )}
                    {showDivider && (
                      <div id='chat-unread-divider' className='my-3 flex items-center gap-2 px-4'>
                        <span className='h-px flex-1 bg-primary/40' />
                        <span className='text-[11px] font-semibold text-primary'>New messages</span>
                        <span className='h-px flex-1 bg-primary/40' />
                      </div>
                    )}
                    <MessageBubble
                      message={message}
                      mine={message.senderId === meId}
                      meId={meId}
                      groupStart={groupStart || showDivider}
                      runStart={runStart || showDivider}
                      showSender={showSender}
                      status={message.senderId === meId && !message.pending && !message.failed ? statusFor(message) : null}
                      onInfo={setInfoFor}
                      onOpenMedia={openMedia}
                      canModerate={isOrgAdmin}
                      highlighted={highlightId === message.id}
                      onReply={onReply}
                      onEdit={onEdit}
                      onDelete={setConfirmDelete}
                      onReact={onReact}
                      onRetry={onRetry}
                      onDiscard={onDiscard}
                      onJumpTo={jumpTo}
                    />
                  </Fragment>
                )
              })}
              {typing.length > 0 && (
                <div className='mt-2 flex items-center gap-2 px-4 text-xs text-muted-foreground'>
                  <span className='flex gap-0.5'>
                    <span className='size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]' />
                    <span className='size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]' />
                    <span className='size-1.5 animate-bounce rounded-full bg-muted-foreground' />
                  </span>
                  {typing.map((p) => p.name.split(' ')[0]).join(', ')} {typing.length > 1 ? 'are' : 'is'} typing
                </div>
              )}
            </div>
          )}
        </div>
        {!atBottom && (
          <Button
            size='icon'
            variant='secondary'
            className='absolute bottom-3 end-4 size-9 rounded-full shadow-md'
            onClick={() => {
              pinnedRef.current = true
              setAtBottom(true)
              scrollToBottom(true)
            }}
            aria-label='Jump to latest'
          >
            <ArrowDown className='size-4' />
          </Button>
        )}
      </div>

      <ChatComposer
        conversationId={conversation.id}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        editing={editing}
        onCancelEdit={() => setEditing(null)}
      />

      <MediaViewer items={mediaItems} index={viewerIndex} onIndexChange={setViewerIndex} />

      <MessageInfoDialog
        message={infoFor}
        members={others}
        status={infoFor ? statusFor(infoFor) : null}
        onOpenChange={(open) => !open && setInfoFor(null)}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription>It disappears for everyone in the conversation. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className='bg-destructive text-white hover:bg-destructive/90'
              onClick={() => {
                const target = confirmDelete
                setConfirmDelete(null)
                if (!target) return
                deleteMessage(target.id)
                  .unwrap()
                  .then((updated) => replaceMessage(dispatch, conversation.id, updated))
                  .catch(() => toast.error('Could not delete the message'))
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
