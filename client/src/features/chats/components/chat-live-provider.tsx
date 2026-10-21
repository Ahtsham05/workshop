import { useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from '@tanstack/react-router'
import { io, type Socket } from 'socket.io-client'
import { toast } from 'sonner'
import { store, type AppDispatch, type RootState } from '@/stores/store'
import { chatApi, useGetChatConversationsQuery, type ChatMessage, type ChatMessageStatus } from '@/stores/chat.api'
import { deriveSchoolRole } from '@/lib/school-permissions'
import {
  chatSocketOrigin,
  getChatLive,
  noteReceiptStatus,
  playChatChime,
  registerTypingEmitter,
  setChatLive,
  setOnline,
  setTyping,
  sweepTyping,
  useChatLive,
  type TypingActivity,
} from '../lib/chat-live'
import {
  applyListStatus,
  applyMemberReceipt,
  bumpConversation,
  clearUnread,
  previewOf,
  replaceMessage,
  upsertMessage,
} from '../lib/chat-cache'
import { clearOutbox } from '../lib/chat-outbox'
import { usePermissions } from '@/context/permission-context'

/** Polling cadence while the socket can't connect (e.g. an API host without websockets). */
const FALLBACK_POLL_MS = 15_000

/**
 * Owns the one chat socket for the session and turns its pushes into cache updates, so
 * the header badge, the conversation list and an open thread all stay live without any of
 * them polling. Mounted once around the app shell (like Notes).
 *
 * If the socket never connects, the conversation list falls back to polling and the open
 * thread refreshes on its own (see ChatThread) — chat keeps working, just less instantly.
 */
export function ChatLiveProvider() {
  const dispatch = useDispatch<AppDispatch>()
  const navigate = useNavigate()
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const userId: string | undefined = user?.id
  // No socket, list or polling for a role without Team Chat (the server refuses it too).
  const canUseChat = usePermissions().hasExplicitPermission('useTeamChat')
  const enabled = !!userId && !!user?.organizationId && !deriveSchoolRole(user) && canUseChat
  // Re-renders on connection changes so the polling fallback switches on and off.
  const live = useChatLive()

  // Keeps the list subscribed for the whole session — the header badge reads it.
  useGetChatConversationsQuery(undefined, {
    skip: !enabled,
    pollingInterval: enabled && !live.connected && live.settled ? FALLBACK_POLL_MS : 0,
  })

  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  useEffect(() => {
    if (!enabled || !userId) return
    let socket: Socket | null = io(chatSocketOrigin(), {
      path: '/socket/chat',
      // Read at every (re)connect, so a refreshed access token is picked up.
      auth: (cb) => cb({ token: localStorage.getItem('accessToken') || '' }),
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 15_000,
    })
    let failures = 0

    // (Re)connected: anything sent while we were away arrived without a push, so re-pull the
    // list and every thread on screen.
    const refreshEverything = () => {
      dispatch(chatApi.util.invalidateTags(['ChatConversations', 'ChatDetail', 'ChatMessages']))
    }

    let everConnected = false
    socket.on('connect', () => {
      failures = 0
      setChatLive({ connected: true, settled: true })
      // The first connect follows the initial fetch; only a REconnect has a gap to fill.
      if (everConnected) refreshEverything()
      everConnected = true
    })
    socket.on('disconnect', () => setChatLive({ connected: false }))
    socket.on('connect_error', () => {
      failures += 1
      if (failures >= 2) setChatLive({ connected: false, settled: true })
    })

    socket.on('chat:ready', (payload: { online: string[] }) => {
      setChatLive({ online: new Set(payload.online || []) })
    })
    socket.on('chat:presence', (payload: { userId: string; online: boolean; lastSeenAt?: string | null }) => {
      if (payload?.userId) setOnline(payload.userId, payload.online, payload.lastSeenAt)
    })

    socket.on('chat:message', (payload: { conversationId: string; message: ChatMessage }) => {
      const { conversationId, message } = payload
      if (!conversationId || !message) return
      const mine = message.senderId === userId
      const live = getChatLive()
      const looking = live.activeConversationId === conversationId && document.visibilityState === 'visible'
      upsertMessage(dispatch, conversationId, message)
      const countUnread = !mine && !looking && message.kind !== 'system'
      const known = bumpConversation(dispatch, conversationId, message, { countUnread, status: mine ? 'sent' : null })
      if (!known) dispatch(chatApi.util.invalidateTags(['ChatConversations']))
      if (mine || message.kind === 'system') return
      if (looking) {
        // Reading covers delivery too (one request, blue ticks for the sender).
        dispatch(chatApi.endpoints.markChatRead.initiate(conversationId))
        return
      }
      // It reached this device — the sender's grey double tick, whatever page we're on.
      socket?.emit('chat:delivered', { conversationId, at: message.createdAt })
      const conversations = chatApi.endpoints.getChatConversations.select()(storeState())?.data
      const conversation = conversations?.find((c) => c.id === conversationId)
      if (conversation?.muted) return
      notify(conversation?.type === 'direct' ? message.senderName : `${message.senderName} · ${conversation?.name ?? 'Team chat'}`, message, () =>
        navigateRef.current({ to: '/chats', search: { c: conversationId } as never })
      )
    })

    socket.on('chat:message-updated', (payload: { conversationId: string; message: ChatMessage }) => {
      if (payload?.conversationId && payload.message) replaceMessage(dispatch, payload.conversationId, payload.message)
    })

    // Someone received/read further: ticks in the open thread (per member) and in the list
    // (the newest message's status, worked out by the server).
    socket.on(
      'chat:receipt',
      (payload: {
        conversationId: string
        userId: string
        lastReadAt: string | null
        lastDeliveredAt: string | null
        lastMessageAt?: string
        lastMessageStatus?: ChatMessageStatus | null
      }) => {
        if (!payload?.conversationId || !payload.userId) return
        applyMemberReceipt(dispatch, payload.conversationId, payload)
        if (payload.lastMessageAt && payload.lastMessageStatus) {
          noteReceiptStatus(payload.conversationId, payload.lastMessageAt, payload.lastMessageStatus)
          applyListStatus(dispatch, payload.conversationId, payload.lastMessageAt, payload.lastMessageStatus)
        }
      }
    )
    socket.on('chat:read-self', (payload: { conversationId: string; lastReadAt: string }) => {
      clearUnread(dispatch, payload.conversationId, payload.lastReadAt)
    })

    socket.on('chat:typing', (payload: { conversationId: string; userId: string; name: string; stopped?: boolean; activity?: TypingActivity }) => {
      if (!payload?.conversationId || payload.userId === userId) return
      setTyping(
        payload.conversationId,
        { userId: payload.userId, name: payload.name, activity: payload.activity === 'recording' ? 'recording' : 'typing' },
        !!payload.stopped
      )
    })

    socket.on('chat:conversations-changed', (payload: { conversationId?: string }) => {
      dispatch(chatApi.util.invalidateTags(['ChatConversations']))
      if (payload?.conversationId) dispatch(chatApi.util.invalidateTags([{ type: 'ChatDetail', id: payload.conversationId }]))
    })

    registerTypingEmitter((conversationId, stopped, activity) => {
      if (socket?.connected) socket.emit('chat:typing', { conversationId, stopped, activity })
    })

    const sweeper = window.setInterval(sweepTyping, 1500)

    // Coming back to the tab: the open thread is now actually being read.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const active = getChatLive().activeConversationId
      if (active) dispatch(chatApi.endpoints.markChatRead.initiate(active))
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      registerTypingEmitter(null)
      window.clearInterval(sweeper)
      document.removeEventListener('visibilitychange', onVisible)
      socket?.removeAllListeners()
      socket?.disconnect()
      socket = null
      setChatLive({ connected: false, settled: false, online: new Set(), typing: {} })
      clearOutbox()
    }
    // A branch switch reconnects so the socket's branch rooms match the new memberships.
  }, [dispatch, enabled, userId, activeBranchId])

  return null
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

// Socket callbacks need the latest store state; reading it from the store module avoids
// re-creating the socket on every render.
const storeState = () => store.getState()

function notify(title: string, message: ChatMessage, open: () => void) {
  const body = previewOf(message) || 'New message'
  playChatChime()
  if (document.visibilityState === 'hidden' && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      const n = new Notification(title, { body, tag: `chat-${message.conversationId}`, icon: '/images/favicon.png' })
      n.onclick = () => {
        window.focus()
        open()
        n.close()
      }
    } catch {
      /* some browsers only allow notifications from a service worker */
    }
  }
  toast(title, {
    description: body.length > 120 ? `${body.slice(0, 117)}…` : body,
    action: { label: 'Open', onClick: open },
    id: `chat-${message.conversationId}`,
  })
}
