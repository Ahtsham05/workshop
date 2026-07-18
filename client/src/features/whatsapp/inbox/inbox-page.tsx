import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import {
  Search,
  Send,
  MessageCircle,
  Clock,
  Check,
  CheckCheck,
  AlertCircle,
  Paperclip,
  Image as ImageIcon,
  FileText,
  Mic,
  Square,
  X,
  Download,
  Play,
  Pause,
  Video,
  Phone,
  Loader2,
  ArrowLeft,
  RotateCw,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
  useGetCloudConnectionQuery,
  useGetConversationMessagesQuery,
  useGetConversationsQuery,
  useMarkConversationReadMutation,
  useResendInboxMessageMutation,
  useSendInboxMediaMutation,
  useSendInboxMessageMutation,
  type WhatsAppConversation,
  type WhatsAppMessage,
} from '@/stores/whatsappCloud.api'

// WhatsApp's own default-avatar palette, picked deterministically per contact so the
// same phone/name always renders the same color across renders and sessions.
const AVATAR_COLORS = [
  '#EF6C6C', '#F0932B', '#F0C419', '#6AB04C', '#22A6B3',
  '#4A69BD', '#7E57C2', '#C0567D', '#009688', '#546E7A',
]

function hashString(input: string) {
  let hash = 0
  for (let i = 0; i < input.length; i++) hash = (hash << 5) - hash + input.charCodeAt(i)
  return Math.abs(hash)
}

function getInitials(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '#'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

function ContactAvatar({ label, photoUrl, size = 'md' }: { label: string; photoUrl?: string; size?: 'md' | 'lg' }) {
  const [imageFailed, setImageFailed] = useState(false)
  const sizeClass = size === 'lg' ? 'h-12 w-12 text-base' : 'h-10 w-10 text-sm'

  if (photoUrl && !imageFailed) {
    return (
      <img
        src={photoUrl}
        alt={label}
        onError={() => setImageFailed(true)}
        className={cn('shrink-0 rounded-full object-cover', sizeClass)}
      />
    )
  }

  const color = AVATAR_COLORS[hashString(label) % AVATAR_COLORS.length]
  return (
    <div
      className={cn('flex shrink-0 items-center justify-center rounded-full font-medium text-white', sizeClass)}
      style={{ backgroundColor: color }}
    >
      {getInitials(label)}
    </div>
  )
}

function formatConversationTimestamp(iso?: string) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'

  const withinWeek = now.getTime() - date.getTime() < 6 * 24 * 60 * 60 * 1000
  if (withinWeek) return date.toLocaleDateString([], { weekday: 'short' })

  return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function formatMessageTime(iso?: string) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatDayDivider(iso: string) {
  const date = new Date(iso)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return 'Today'

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'

  const withinWeek = now.getTime() - date.getTime() < 6 * 24 * 60 * 60 * 1000
  if (withinWeek) return date.toLocaleDateString([], { weekday: 'long' })

  return date.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })
}

// Groups a chronological message list into day buckets, and flags whether each message
// is the first in a run of consecutive same-direction messages (for tighter spacing/no
// redundant metadata between them, like WhatsApp does).
function groupMessagesForDisplay(messages: WhatsAppMessage[]) {
  const groups: { dayLabel: string; items: { message: WhatsAppMessage; isGroupStart: boolean }[] }[] = []
  let lastDay = ''
  let lastDirection: WhatsAppMessage['direction'] | null = null

  for (const message of messages) {
    const day = new Date(message.createdAt).toDateString()
    if (day !== lastDay) {
      groups.push({ dayLabel: formatDayDivider(message.createdAt), items: [] })
      lastDay = day
      lastDirection = null
    }
    groups[groups.length - 1].items.push({ message, isGroupStart: message.direction !== lastDirection })
    lastDirection = message.direction
  }
  return groups
}

function MessageStatusIndicator({
  status,
  errorMessage,
  variant = 'default',
}: Pick<WhatsAppMessage, 'status' | 'errorMessage'> & { variant?: 'default' | 'overlay' }) {
  const base = variant === 'overlay' ? 'text-white/90' : 'text-wa-muted'
  const icon = {
    queued: <Clock className={cn('h-3 w-3', base)} />,
    sent: <Check className={cn('h-3 w-3', base)} />,
    delivered: <CheckCheck className={cn('h-3 w-3', base)} />,
    read: <CheckCheck className='h-3 w-3 text-[#53BDEB]' />,
    failed: <AlertCircle className='h-3 w-3 text-destructive' />,
  }[status]

  const label = {
    queued: 'Queued — waiting for WhatsApp to accept',
    sent: 'Sent to WhatsApp',
    delivered: 'Delivered',
    read: 'Read',
    failed: errorMessage || 'Failed to deliver',
  }[status]

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className='inline-flex'>{icon}</span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function formatBytes(bytes?: number) {
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function truncateWords(text: string, wordLimit = 5) {
  const words = text.trim().split(/\s+/)
  if (words.length <= wordLimit) return text.trim()
  return `${words.slice(0, wordLimit).join(' ')}…`
}

// WhatsApp's own text markup: *bold*, _italic_, ~strikethrough~, ```monospace```.
// Markers don't cross line breaks, matching WhatsApp's own parsing rule.
const WA_FORMAT_REGEX = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|```[^`\n]+```)/g

function renderFormattedText(text: string) {
  return text.split(WA_FORMAT_REGEX).map((part, i) => {
    if (!part) return null
    if (part.startsWith('```') && part.endsWith('```') && part.length >= 6) {
      return (
        <code key={i} className='rounded bg-black/10 px-1 py-0.5 font-mono text-[0.9em] dark:bg-white/10'>
          {part.slice(3, -3)}
        </code>
      )
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return <strong key={i}>{part.slice(1, -1)}</strong>
    }
    if (part.startsWith('_') && part.endsWith('_') && part.length >= 2) {
      return <em key={i}>{part.slice(1, -1)}</em>
    }
    if (part.startsWith('~') && part.endsWith('~') && part.length >= 2) {
      return <s key={i}>{part.slice(1, -1)}</s>
    }
    return part
  })
}

// Waveform-style pill player standing in for WhatsApp's voice-note UI — native <audio controls>
// looks nothing like it, so this wraps a hidden <audio> element with a custom play/progress bar.
function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  const progress = duration > 0 ? currentTime / duration : 0

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) audio.pause()
    else audio.play()
  }

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    if (!audio || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * duration
  }

  return (
    <div className='flex items-center gap-2 w-[220px]'>
      <audio
        ref={audioRef}
        src={src}
        preload='metadata'
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        className='hidden'
      />
      <button
        type='button'
        onClick={togglePlay}
        className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-wa-accent text-white'
      >
        {playing ? <Pause className='h-4 w-4' /> : <Play className='h-4 w-4 ml-0.5' />}
      </button>
      <div className='flex-1 min-w-0'>
        <div
          className='h-1 rounded-full bg-muted-foreground/25 cursor-pointer relative'
          onClick={seek}
        >
          <div className='h-1 rounded-full bg-wa-accent absolute inset-y-0 left-0' style={{ width: `${progress * 100}%` }} />
          <div
            className='h-2.5 w-2.5 rounded-full bg-wa-accent absolute top-1/2 -translate-y-1/2 -translate-x-1/2'
            style={{ left: `${progress * 100}%` }}
          />
        </div>
        <span className='text-[10px] text-muted-foreground'>
          {formatDuration(playing || currentTime > 0 ? currentTime : duration)}
        </span>
      </div>
    </div>
  )
}

function MessageBubbleContent({ msg }: { msg: WhatsAppMessage }) {
  const { content, type } = msg

  if (type === 'sticker') {
    return content.mediaUrl ? (
      <img src={content.mediaUrl} alt='Sticker' className='h-32 w-32 object-contain' />
    ) : (
      <p className='text-xs italic text-muted-foreground'>Sticker (unavailable)</p>
    )
  }

  if (type === 'image') {
    return (
      <>
        {content.mediaUrl ? (
          <a href={content.mediaUrl} target='_blank' rel='noreferrer' className='block'>
            <img
              src={content.mediaUrl}
              alt={content.caption || 'Photo'}
              className='block max-h-72 w-full min-w-48 rounded-[6px] object-cover'
            />
          </a>
        ) : (
          <p className='px-1.5 py-1 text-xs italic text-muted-foreground'>📷 Photo (unavailable)</p>
        )}
        {content.caption && (
          <p className='px-1.5 pt-1.5 pb-0.5 text-sm whitespace-pre-wrap break-words'>
            {renderFormattedText(content.caption)}
          </p>
        )}
      </>
    )
  }

  if (type === 'video') {
    return (
      <>
        {content.mediaUrl ? (
          <video controls src={content.mediaUrl} className='block max-h-72 w-full min-w-48 rounded-[6px]' />
        ) : (
          <p className='px-1.5 py-1 text-xs italic text-muted-foreground'>📹 Video (unavailable)</p>
        )}
        {content.caption && (
          <p className='px-1.5 pt-1.5 pb-0.5 text-sm whitespace-pre-wrap break-words'>
            {renderFormattedText(content.caption)}
          </p>
        )}
      </>
    )
  }

  if (type === 'audio') {
    return content.mediaUrl ? (
      <AudioPlayer src={content.mediaUrl} />
    ) : (
      <p className='flex items-center gap-1.5 text-xs italic text-muted-foreground'>
        <Play className='h-3 w-3' /> Voice message (unavailable)
      </p>
    )
  }

  if (type === 'document') {
    return (
      <div className='space-y-1'>
        <a
          href={content.mediaUrl || '#'}
          target='_blank'
          rel='noreferrer'
          className={cn(
            'flex items-center gap-2.5 rounded-md border bg-background/60 px-2.5 py-2',
            !content.mediaUrl && 'pointer-events-none opacity-60',
          )}
        >
          <span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-wa-accent/15 text-wa-accent'>
            <FileText className='h-5 w-5' />
          </span>
          <span className='min-w-0 flex-1'>
            <span className='block truncate text-sm font-medium'>{content.filename || 'Document'}</span>
          </span>
          {content.mediaUrl && <Download className='h-4 w-4 shrink-0 text-wa-muted' />}
        </a>
        {content.caption && (
          <p className='text-sm whitespace-pre-wrap break-words'>{renderFormattedText(content.caption)}</p>
        )}
      </div>
    )
  }

  const plainText = content.text || content.caption || `[${type}]`
  return <p className='whitespace-pre-wrap break-words'>{renderFormattedText(plainText)}</p>
}

// One-tap resend for a failed outbound message — re-sends in place (same bubble,
// new status) rather than requiring the user to retype/reattach anything.
function RetryButton({ messageId, overlay }: { messageId: string; overlay?: boolean }) {
  const [resend, { isLoading }] = useResendInboxMessageMutation()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type='button'
          disabled={isLoading}
          onClick={async () => {
            try {
              const result = await resend(messageId).unwrap()
              if (result.blockedByWindow) {
                toast.error(result.message?.errorMessage || 'Still outside the 24-hour reply window.')
              }
            } catch (error: any) {
              toast.error(error?.data?.message || 'Failed to resend message')
            }
          }}
          className={cn(
            'inline-flex items-center rounded-full disabled:opacity-60',
            overlay ? 'text-white' : 'text-destructive',
          )}
        >
          <RotateCw className={cn('h-3 w-3', isLoading && 'animate-spin')} />
        </button>
      </TooltipTrigger>
      <TooltipContent>Tap to resend</TooltipContent>
    </Tooltip>
  )
}

// Wraps MessageBubbleContent with the actual chat-bubble chrome. Photos render edge-to-edge
// with a WhatsApp-style overlay timestamp pill; stickers get no bubble/background at all;
// everything else keeps the padded bubble with an inline trailing timestamp.
function MessageBubble({ msg, isGroupStart }: { msg: WhatsAppMessage; isGroupStart: boolean }) {
  const isOut = msg.direction === 'outbound'
  const time = formatMessageTime(msg.createdAt)
  const marginTop = isGroupStart ? 'mt-2' : 'mt-0.5'

  if (msg.type === 'sticker') {
    return (
      <div className={cn('relative w-32', marginTop, isOut && 'ml-auto')}>
        <MessageBubbleContent msg={msg} />
        <p className={cn('flex items-center gap-1 text-[10px] text-wa-muted', isOut ? 'justify-end' : 'justify-start')}>
          {time}
          {isOut && <MessageStatusIndicator status={msg.status} errorMessage={msg.errorMessage} />}
          {isOut && msg.status === 'failed' && <RetryButton messageId={msg.id} />}
        </p>
      </div>
    )
  }

  const isMedia = (msg.type === 'image' || msg.type === 'video') && !!msg.content.mediaUrl
  const overlayFooter = msg.type === 'image' && isMedia && !msg.content.caption

  return (
    <div
      className={cn(
        'relative w-fit max-w-[80%] md:max-w-[65%] rounded-lg text-sm shadow-sm text-[#111b21] dark:text-[#e9edef]',
        isMedia ? 'p-[3px]' : 'px-3 py-2',
        marginTop,
        isOut
          ? cn('ml-auto bg-wa-bubble-out', isGroupStart && 'rounded-tr-none chat-tail-out')
          : cn('bg-wa-bubble-in', isGroupStart && 'rounded-tl-none chat-tail-in'),
      )}
    >
      <MessageBubbleContent msg={msg} />
      {overlayFooter ? (
        <span className='absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-black/45 px-1.5 py-0.5 text-[11px] text-white'>
          {time}
          {isOut && <MessageStatusIndicator status={msg.status} errorMessage={msg.errorMessage} variant='overlay' />}
          {isOut && msg.status === 'failed' && <RetryButton messageId={msg.id} overlay />}
        </span>
      ) : (
        <p className={cn('flex items-center justify-end gap-1 text-[10px] text-wa-muted', isMedia ? 'px-1.5 pb-0.5 pt-1' : 'mt-1')}>
          {time}
          {isOut && <MessageStatusIndicator status={msg.status} errorMessage={msg.errorMessage} />}
          {isOut && msg.status === 'failed' && <RetryButton messageId={msg.id} />}
        </p>
      )}
    </div>
  )
}

function ConversationRow({
  conv,
  active,
  onClick,
}: {
  conv: WhatsAppConversation
  active: boolean
  onClick: () => void
}) {
  const label = conv.contactName || conv.contactPhone
  return (
    <button
      type='button'
      className={cn(
        'flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-wa-hover',
        active && 'bg-wa-active',
      )}
      onClick={onClick}
    >
      <ContactAvatar label={label} photoUrl={conv.avatarUrl} size='lg' />
      <div className='min-w-0 flex-1 border-b pb-3 -mb-3'>
        <div className='flex items-baseline justify-between gap-2'>
          <span className={cn('min-w-0 truncate', conv.unreadCount > 0 ? 'font-semibold' : 'font-medium')}>
            {label}
          </span>
          <span
            className={cn(
              'shrink-0 text-xs',
              conv.unreadCount > 0 ? 'text-wa-accent font-medium' : 'text-wa-muted',
            )}
          >
            {formatConversationTimestamp(conv.lastMessageAt)}
          </span>
        </div>
        <div className='flex items-center justify-between gap-2 mt-0.5'>
          <p className='flex min-w-0 flex-1 items-center gap-1 text-sm text-wa-muted'>
            {conv.lastMessageDirection === 'outbound' && (
              <CheckCheck className='h-3.5 w-3.5 shrink-0' />
            )}
            <span className='min-w-0 flex-1 truncate'>
              {conv.lastMessagePreview ? truncateWords(conv.lastMessagePreview) : 'No messages yet'}
            </span>
          </p>
          {conv.unreadCount > 0 && (
            <span className='flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-wa-accent px-1.5 text-[11px] font-semibold text-white'>
              {conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

const AUDIO_MIME_CANDIDATES = ['audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm']

function pickRecorderMimeType() {
  if (typeof MediaRecorder === 'undefined') return undefined
  return AUDIO_MIME_CANDIDATES.find((mime) => MediaRecorder.isTypeSupported(mime))
}

// Subtle repeating dot texture standing in for WhatsApp's chat wallpaper — CSS-only so the
// inbox never depends on an external image asset.
const WALLPAPER_STYLE = {
  backgroundImage: 'radial-gradient(currentColor 0.5px, transparent 0.5px)',
  backgroundSize: '16px 16px',
}

export default function WhatsAppInboxPage() {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)

  const imageInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const draftInputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-grow the composer like WhatsApp's: expands with content up to ~5 lines, then scrolls.
  useEffect(() => {
    const el = draftInputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [draft])

  const { data: connection, isLoading: connectionLoading } = useGetCloudConnectionQuery()
  const {
    data: conversations,
    isLoading: conversationsLoading,
    refetch: refetchConversations,
  } = useGetConversationsQuery({
    search: search || undefined,
    unreadOnly,
    limit: 50,
  })
  const {
    data: messages,
    isLoading: messagesLoading,
    refetch: refetchMessages,
  } = useGetConversationMessagesQuery({ id: selectedId!, limit: 100 }, { skip: !selectedId })
  const [markRead] = useMarkConversationReadMutation()
  const [sendMessage, { isLoading: sending }] = useSendInboxMessageMutation()
  const [sendMedia, { isLoading: sendingMedia }] = useSendInboxMediaMutation()

  const selected = useMemo(
    () => conversations?.results.find((c) => c.id === selectedId),
    [conversations, selectedId],
  )

  const [threadSearchOpen, setThreadSearchOpen] = useState(false)
  const [threadSearch, setThreadSearch] = useState('')

  const visibleMessages = useMemo(() => {
    // Defensive de-dupe by id: guards against any already-duplicated historical rows
    // (e.g. from redelivered webhooks before that was fixed server-side).
    const seen = new Set<string>()
    const all = (messages?.results ?? []).filter((m) => {
      if (seen.has(m.id)) return false
      seen.add(m.id)
      return true
    })
    if (!threadSearch.trim()) return all
    const needle = threadSearch.trim().toLowerCase()
    return all.filter((m) => (m.content.text || m.content.caption || '').toLowerCase().includes(needle))
  }, [messages, threadSearch])

  const messageGroups = useMemo(() => groupMessagesForDisplay(visibleMessages), [visibleMessages])

  useEffect(() => {
    setThreadSearchOpen(false)
    setThreadSearch('')
  }, [selectedId])

  const pendingFilePreviewUrl = useMemo(
    () => (pendingFile?.type.startsWith('image/') ? URL.createObjectURL(pendingFile) : undefined),
    [pendingFile],
  )
  useEffect(() => {
    return () => {
      if (pendingFilePreviewUrl) URL.revokeObjectURL(pendingFilePreviewUrl)
    }
  }, [pendingFilePreviewUrl])

  useEffect(() => {
    if (selectedId) {
      markRead(selectedId)
    }
  }, [selectedId, markRead])

  useEffect(() => {
    setPendingFile(null)
    setCaption('')
  }, [selectedId])

  useEffect(() => {
    const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/v1'
    const token = localStorage.getItem('accessToken')
    const branchId = localStorage.getItem('activeBranchId')
    const url = new URL(`${baseUrl}/whatsapp-cloud/events/stream`)
    if (token) url.searchParams.set('token', token)
    if (branchId) url.searchParams.set('branchId', branchId)

    const es = new EventSource(url.toString())
    es.onmessage = () => {
      refetchConversations()
      if (selectedId) refetchMessages()
    }
    return () => es.close()
  }, [refetchConversations, refetchMessages, selectedId])

  const handleSend = async () => {
    if (!selected || !draft.trim()) return
    try {
      const result = await sendMessage({
        phone: selected.contactPhone,
        text: draft.trim(),
        conversationId: selected.id,
      }).unwrap()
      setDraft('')
      refetchMessages()
      refetchConversations()
      if (result.blockedByWindow) {
        toast.error(result.message?.errorMessage || "Outside the 24-hour reply window — saved, tap to resend once they message you.")
      }
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to send message')
    }
  }

  const handleSendMedia = async () => {
    if (!selected || !pendingFile) return
    try {
      const result = await sendMedia({
        phone: selected.contactPhone,
        conversationId: selected.id,
        caption: caption.trim() || undefined,
        file: pendingFile,
      }).unwrap()
      setPendingFile(null)
      setCaption('')
      refetchMessages()
      refetchConversations()
      if (result.blockedByWindow) {
        toast.error(result.message?.errorMessage || "Outside the 24-hour reply window — saved, tap to resend once they message you.")
      }
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to send file')
    }
  }

  const stopRecording = (discard = false) => {
    const recorder = mediaRecorderRef.current
    if (recorder) {
      if (discard) recorder.onstop = null
      recorder.stop()
      recorder.stream.getTracks().forEach((t) => t.stop())
    }
    if (recordTimerRef.current) clearInterval(recordTimerRef.current)
    setIsRecording(false)
  }

  const startRecording = async () => {
    const mimeType = pickRecorderMimeType()
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    audioChunksRef.current = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      const blob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' })
      const ext = mimeType?.includes('mp4') ? 'm4a' : mimeType?.includes('ogg') ? 'ogg' : 'webm'
      setPendingFile(new File([blob], `voice-message.${ext}`, { type: blob.type }))
    }
    mediaRecorderRef.current = recorder
    recorder.start()
    setIsRecording(true)
    setRecordSeconds(0)
    recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000)
  }

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current)
      mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop())
    }
  }, [])

  if (connectionLoading) {
    return (
      <div className='flex h-[calc(100vh-4rem)] items-center justify-center'>
        <Loader2 className='h-6 w-6 animate-spin text-wa-accent' />
      </div>
    )
  }

  if (!connection?.connected) {
    return (
      <div className='p-6 max-w-lg mx-auto text-center space-y-4'>
        <div className='mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-wa-panel'>
          <MessageCircle className='h-8 w-8 text-wa-accent' />
        </div>
        <h1 className='text-xl font-semibold'>WhatsApp Inbox</h1>
        <p className='text-muted-foreground'>
          Connect WhatsApp Business in Settings → WhatsApp to use the shared inbox.
        </p>
      </div>
    )
  }

  return (
    <div className='flex h-[calc(100vh-4rem)] -mx-4 -my-6 overflow-hidden bg-background'>
      <aside
        className={cn(
          'min-w-0 w-full max-w-sm lg:max-w-md xl:max-w-lg overflow-x-hidden border-r flex-col',
          selected ? 'hidden md:flex' : 'flex',
        )}
      >
        <div className='p-3 pb-2 border-b space-y-3 bg-wa-panel'>
          <div className='flex items-center justify-between gap-2 px-1'>
            <div className='min-w-0'>
              <h1 className='text-[19px] font-semibold leading-tight'>Chats</h1>
              {connection?.verifiedName && (
                <p className='truncate text-xs text-wa-muted'>Connected as {connection.verifiedName}</p>
              )}
            </div>
            <MessageCircle className='h-5 w-5 shrink-0 text-wa-accent' />
          </div>
          <div className='relative'>
            <Search className='absolute left-3 top-2.5 h-4 w-4 text-wa-muted' />
            <Input
              className='pl-9 rounded-lg bg-background border-transparent'
              placeholder='Search or start a new chat'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className='flex gap-2'>
            <button
              type='button'
              className={cn(
                'rounded-full px-3 py-1 text-sm font-medium transition-colors',
                !unreadOnly ? 'bg-wa-accent/15 text-wa-accent' : 'bg-background text-wa-muted hover:bg-wa-hover',
              )}
              onClick={() => setUnreadOnly(false)}
            >
              All
            </button>
            <button
              type='button'
              className={cn(
                'rounded-full px-3 py-1 text-sm font-medium transition-colors',
                unreadOnly ? 'bg-wa-accent/15 text-wa-accent' : 'bg-background text-wa-muted hover:bg-wa-hover',
              )}
              onClick={() => setUnreadOnly(true)}
            >
              Unread
            </button>
          </div>
        </div>
        <ScrollArea className='flex-1 [&_[data-slot=scroll-area-scrollbar]]:hidden'>
          {conversationsLoading ? (
            <div className='flex flex-col items-center justify-center gap-2 py-16 text-wa-muted'>
              <Loader2 className='h-5 w-5 animate-spin' />
              <span className='text-sm'>Loading chats…</span>
            </div>
          ) : conversations?.results.length ? (
            conversations.results.map((conv) => (
              <ConversationRow
                key={conv.id}
                conv={conv}
                active={selectedId === conv.id}
                onClick={() => setSelectedId(conv.id)}
              />
            ))
          ) : (
            <div className='py-16 text-center text-sm text-wa-muted'>
              {search ? 'No chats match your search' : 'No conversations yet'}
            </div>
          )}
        </ScrollArea>
      </aside>

      <main className={cn('flex-1 flex-col min-w-0', selected ? 'flex' : 'hidden md:flex')}>
        {selected ? (
          <>
            <div className='flex items-center gap-3 p-2.5 border-b bg-wa-panel'>
              <Button
                variant='ghost'
                size='icon'
                className='rounded-full text-wa-muted shrink-0 md:hidden'
                onClick={() => setSelectedId(null)}
              >
                <ArrowLeft className='h-5 w-5' />
              </Button>
              <ContactAvatar label={selected.contactName || selected.contactPhone} photoUrl={selected.avatarUrl} />
              <div className='min-w-0 flex-1'>
                <p className='font-medium truncate'>{selected.contactName || selected.contactPhone}</p>
                <p className='text-xs text-wa-muted'>+{selected.contactPhone}</p>
              </div>
              <div className='flex items-center gap-1'>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='rounded-full text-wa-muted opacity-50 cursor-not-allowed hover:bg-transparent hover:text-wa-muted'
                      onClick={(e) => e.preventDefault()}
                    >
                      <Video className='h-5 w-5' />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Calling isn't available through the WhatsApp Business API</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='rounded-full text-wa-muted opacity-50 cursor-not-allowed hover:bg-transparent hover:text-wa-muted'
                      onClick={(e) => e.preventDefault()}
                    >
                      <Phone className='h-5 w-5' />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Calling isn't available through the WhatsApp Business API</TooltipContent>
                </Tooltip>
                <Button
                  variant='ghost'
                  size='icon'
                  className={cn('rounded-full text-wa-muted', threadSearchOpen && 'bg-wa-hover text-foreground')}
                  onClick={() => setThreadSearchOpen((v) => !v)}
                >
                  <Search className='h-5 w-5' />
                </Button>
              </div>
            </div>
            {threadSearchOpen && (
              <div className='p-2 border-b bg-wa-panel'>
                <div className='relative'>
                  <Search className='absolute left-3 top-2.5 h-4 w-4 text-wa-muted' />
                  <Input
                    autoFocus
                    className='pl-9 rounded-lg bg-background border-transparent'
                    placeholder='Search in this chat…'
                    value={threadSearch}
                    onChange={(e) => setThreadSearch(e.target.value)}
                  />
                </div>
              </div>
            )}
            <ScrollArea
              className='flex-1 p-4 text-[#111b21]/[0.06] dark:text-white/[0.05] bg-wa-wallpaper [&_[data-slot=scroll-area-scrollbar]]:hidden'
              style={WALLPAPER_STYLE}
            >
              {messagesLoading ? (
                <div className='flex h-full items-center justify-center'>
                  <Loader2 className='h-5 w-5 animate-spin text-wa-muted' />
                </div>
              ) : messageGroups.length === 0 ? (
                <div className='flex h-full items-center justify-center text-sm text-wa-muted'>
                  {threadSearch ? 'No messages match your search' : 'No messages yet'}
                </div>
              ) : (
                <div className='space-y-1 relative'>
                  {messageGroups.map((group) => (
                    <div key={group.dayLabel}>
                      <div className='flex justify-center py-2'>
                        <span className='rounded-md bg-wa-panel/90 px-3 py-1 text-xs font-medium text-wa-muted shadow-sm'>
                          {group.dayLabel}
                        </span>
                      </div>
                      <div className='space-y-1'>
                        {group.items.map(({ message: msg, isGroupStart }) => (
                          <MessageBubble key={msg.id} msg={msg} isGroupStart={isGroupStart} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            <input
              ref={imageInputRef}
              type='file'
              accept='image/*,video/*'
              className='hidden'
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) setPendingFile(file)
                e.target.value = ''
              }}
            />
            <input
              ref={docInputRef}
              type='file'
              accept='.pdf,.doc,.docx,.xls,.xlsx,.txt,application/pdf'
              className='hidden'
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) setPendingFile(file)
                e.target.value = ''
              }}
            />

            {pendingFile ? (
              <div className='p-3 border-t bg-wa-panel space-y-2'>
                <div className='flex items-center gap-2 rounded-md border bg-background px-2.5 py-2'>
                  {pendingFilePreviewUrl ? (
                    <img src={pendingFilePreviewUrl} alt='' className='h-10 w-10 rounded object-cover' />
                  ) : pendingFile.type.startsWith('audio/') ? (
                    <Mic className='h-5 w-5 shrink-0 text-wa-muted' />
                  ) : (
                    <FileText className='h-5 w-5 shrink-0 text-wa-muted' />
                  )}
                  <span className='min-w-0 flex-1'>
                    <span className='block truncate text-sm font-medium'>{pendingFile.name}</span>
                    <span className='block text-xs text-wa-muted'>{formatBytes(pendingFile.size)}</span>
                  </span>
                  <Button variant='ghost' size='icon' className='h-7 w-7' onClick={() => setPendingFile(null)}>
                    <X className='h-4 w-4' />
                  </Button>
                </div>
                <div className='flex gap-2'>
                  <Input
                    className='flex-1 rounded-full bg-background border-transparent'
                    placeholder='Add a caption…'
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMedia()}
                  />
                  <Button
                    size='icon'
                    className='rounded-full bg-wa-accent hover:bg-wa-accent/90 shrink-0'
                    onClick={handleSendMedia}
                    disabled={sendingMedia}
                  >
                    <Send className='h-4 w-4' />
                  </Button>
                </div>
              </div>
            ) : isRecording ? (
              <div className='p-3 border-t bg-wa-panel flex items-center gap-3'>
                <span className='flex items-center gap-2 text-sm text-destructive'>
                  <span className='h-2 w-2 rounded-full bg-destructive animate-pulse' />
                  Recording {String(Math.floor(recordSeconds / 60)).padStart(2, '0')}:
                  {String(recordSeconds % 60).padStart(2, '0')}
                </span>
                <div className='flex-1' />
                <Button variant='ghost' size='icon' className='rounded-full' onClick={() => stopRecording(true)}>
                  <X className='h-4 w-4' />
                </Button>
                <Button
                  size='icon'
                  className='rounded-full bg-wa-accent hover:bg-wa-accent/90'
                  onClick={() => stopRecording()}
                >
                  <Square className='h-4 w-4' />
                </Button>
              </div>
            ) : (
              <div className='p-3 border-t bg-wa-panel flex gap-2 items-end'>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant='ghost' size='icon' type='button' className='rounded-full shrink-0'>
                      <Paperclip className='h-5 w-5 text-wa-muted' />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='start'>
                    <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
                      <ImageIcon className='h-4 w-4' /> Photo or video
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => docInputRef.current?.click()}>
                      <FileText className='h-4 w-4' /> Document
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Textarea
                  ref={draftInputRef}
                  showVoiceInput={false}
                  rows={1}
                  className='flex-1 min-h-0 max-h-[120px] resize-none overflow-y-auto rounded-3xl border-transparent bg-background px-4 py-2 text-sm leading-relaxed shadow-none'
                  placeholder='Type a message…'
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                />
                {draft.trim() ? (
                  <Button
                    size='icon'
                    className='rounded-full bg-wa-accent hover:bg-wa-accent/90 shrink-0'
                    onClick={handleSend}
                    disabled={sending}
                  >
                    <Send className='h-4 w-4' />
                  </Button>
                ) : (
                  <Button
                    size='icon'
                    className='rounded-full bg-wa-accent hover:bg-wa-accent/90 shrink-0'
                    onClick={startRecording}
                  >
                    <Mic className='h-4 w-4' />
                  </Button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className='flex-1 flex flex-col items-center justify-center gap-5 border-t-4 border-wa-accent bg-background'>
            <div className='flex h-24 w-24 items-center justify-center rounded-full bg-wa-panel'>
              <MessageCircle className='h-11 w-11 text-wa-muted' />
            </div>
            <div className='text-center max-w-sm space-y-1.5'>
              <h2 className='text-2xl font-light'>WhatsApp Inbox</h2>
              <p className='text-sm text-wa-muted'>
                Send and receive WhatsApp messages from one shared inbox. Select a conversation on the left to get
                started.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
