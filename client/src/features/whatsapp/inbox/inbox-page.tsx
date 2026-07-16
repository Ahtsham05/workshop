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
} from 'lucide-react'
import { Input } from '@/components/ui/input'
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

function MessageStatusIndicator({ status, errorMessage }: Pick<WhatsAppMessage, 'status' | 'errorMessage'>) {
  const icon = {
    queued: <Clock className='h-3 w-3 text-muted-foreground' />,
    sent: <Check className='h-3 w-3 text-muted-foreground' />,
    delivered: <CheckCheck className='h-3 w-3 text-muted-foreground' />,
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
        className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#00A884] text-white'
      >
        {playing ? <Pause className='h-4 w-4' /> : <Play className='h-4 w-4 ml-0.5' />}
      </button>
      <div className='flex-1 min-w-0'>
        <div
          className='h-1 rounded-full bg-muted-foreground/25 cursor-pointer relative'
          onClick={seek}
        >
          <div className='h-1 rounded-full bg-[#00A884] absolute inset-y-0 left-0' style={{ width: `${progress * 100}%` }} />
          <div
            className='h-2.5 w-2.5 rounded-full bg-[#00A884] absolute top-1/2 -translate-y-1/2 -translate-x-1/2'
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

  if (type === 'image' || type === 'sticker') {
    return (
      <div className='space-y-1'>
        {content.mediaUrl ? (
          <a href={content.mediaUrl} target='_blank' rel='noreferrer'>
            <img
              src={content.mediaUrl}
              alt={content.caption || 'Photo'}
              className={cn('rounded-md object-cover', type === 'sticker' ? 'h-28 w-28' : 'max-h-64 max-w-full')}
            />
          </a>
        ) : (
          <p className='text-xs italic text-muted-foreground'>📷 Photo (unavailable)</p>
        )}
        {content.caption && <p className='text-sm'>{content.caption}</p>}
      </div>
    )
  }

  if (type === 'video') {
    return (
      <div className='space-y-1'>
        {content.mediaUrl ? (
          <video controls src={content.mediaUrl} className='max-h-64 max-w-full rounded-md' />
        ) : (
          <p className='text-xs italic text-muted-foreground'>📹 Video (unavailable)</p>
        )}
        {content.caption && <p className='text-sm'>{content.caption}</p>}
      </div>
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
            'flex items-center gap-2 rounded-md border bg-background/60 px-2.5 py-2',
            !content.mediaUrl && 'pointer-events-none opacity-60',
          )}
        >
          <FileText className='h-6 w-6 shrink-0 text-muted-foreground' />
          <span className='min-w-0 flex-1'>
            <span className='block truncate text-sm font-medium'>{content.filename || 'Document'}</span>
          </span>
          {content.mediaUrl && <Download className='h-4 w-4 shrink-0 text-muted-foreground' />}
        </a>
        {content.caption && <p className='text-sm'>{content.caption}</p>}
      </div>
    )
  }

  return <p className='whitespace-pre-wrap break-words'>{content.text || content.caption || `[${type}]`}</p>
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
        'flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5',
        active && 'bg-black/[0.04] dark:bg-white/[0.06]',
      )}
      onClick={onClick}
    >
      <ContactAvatar label={label} photoUrl={conv.avatarUrl} />
      <div className='min-w-0 flex-1 border-b pb-3 -mb-3'>
        <div className='flex items-baseline justify-between gap-2'>
          <span className={cn('truncate', conv.unreadCount > 0 ? 'font-semibold' : 'font-medium')}>{label}</span>
          <span
            className={cn(
              'shrink-0 text-xs',
              conv.unreadCount > 0 ? 'text-[#00A884] font-medium' : 'text-muted-foreground',
            )}
          >
            {formatConversationTimestamp(conv.lastMessageAt)}
          </span>
        </div>
        <div className='flex items-center justify-between gap-2 mt-0.5'>
          <p className='truncate text-sm text-muted-foreground'>{conv.lastMessagePreview || 'No messages yet'}</p>
          {conv.unreadCount > 0 && (
            <span className='flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#00A884] px-1.5 text-[11px] font-semibold text-white'>
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

  const { data: connection } = useGetCloudConnectionQuery()
  const { data: conversations, refetch: refetchConversations } = useGetConversationsQuery({
    search: search || undefined,
    unreadOnly,
    limit: 50,
  })
  const { data: messages, refetch: refetchMessages } = useGetConversationMessagesQuery(
    { id: selectedId!, limit: 100 },
    { skip: !selectedId },
  )
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
    const all = messages?.results ?? []
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
      await sendMessage({
        phone: selected.contactPhone,
        text: draft.trim(),
        conversationId: selected.id,
      }).unwrap()
      setDraft('')
      refetchMessages()
      refetchConversations()
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to send message')
    }
  }

  const handleSendMedia = async () => {
    if (!selected || !pendingFile) return
    try {
      await sendMedia({
        phone: selected.contactPhone,
        conversationId: selected.id,
        caption: caption.trim() || undefined,
        file: pendingFile,
      }).unwrap()
      setPendingFile(null)
      setCaption('')
      refetchMessages()
      refetchConversations()
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

  if (!connection?.connected) {
    return (
      <div className='p-6 max-w-lg mx-auto text-center space-y-4'>
        <MessageCircle className='h-12 w-12 mx-auto text-muted-foreground' />
        <h1 className='text-xl font-semibold'>WhatsApp Inbox</h1>
        <p className='text-muted-foreground'>
          Connect WhatsApp Business in Settings → WhatsApp to use the shared inbox.
        </p>
      </div>
    )
  }

  return (
    <div className='flex h-[calc(100vh-4rem)] -mx-4 -my-6 overflow-hidden bg-background'>
      <aside className='w-full max-w-sm border-r flex flex-col'>
        <div className='p-3 border-b space-y-2'>
          <h1 className='font-semibold flex items-center gap-2'>
            <MessageCircle className='h-5 w-5 text-[#25D366]' />
            Inbox
          </h1>
          <div className='relative'>
            <Search className='absolute left-3 top-2.5 h-4 w-4 text-muted-foreground' />
            <Input
              className='pl-9 rounded-full bg-muted/60 border-transparent'
              placeholder='Search conversations…'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            variant={unreadOnly ? 'default' : 'outline'}
            size='sm'
            className={cn('rounded-full', unreadOnly && 'bg-[#00A884] hover:bg-[#00A884]/90')}
            onClick={() => setUnreadOnly((v) => !v)}
          >
            Unread
          </Button>
        </div>
        <ScrollArea className='flex-1 [&_[data-slot=scroll-area-scrollbar]]:hidden'>
          {conversations?.results.map((conv) => (
            <ConversationRow
              key={conv.id}
              conv={conv}
              active={selectedId === conv.id}
              onClick={() => setSelectedId(conv.id)}
            />
          ))}
        </ScrollArea>
      </aside>

      <main className='flex-1 flex flex-col min-w-0'>
        {selected ? (
          <>
            <div className='flex items-center gap-3 p-2.5 border-b bg-background'>
              <ContactAvatar label={selected.contactName || selected.contactPhone} photoUrl={selected.avatarUrl} size='lg' />
              <div className='min-w-0 flex-1'>
                <p className='font-medium truncate'>{selected.contactName || selected.contactPhone}</p>
                <p className='text-xs text-muted-foreground'>+{selected.contactPhone}</p>
              </div>
              <div className='flex items-center gap-1'>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='rounded-full text-muted-foreground opacity-50 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground'
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
                      className='rounded-full text-muted-foreground opacity-50 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground'
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
                  className={cn('rounded-full text-muted-foreground', threadSearchOpen && 'bg-muted text-foreground')}
                  onClick={() => setThreadSearchOpen((v) => !v)}
                >
                  <Search className='h-5 w-5' />
                </Button>
              </div>
            </div>
            {threadSearchOpen && (
              <div className='p-2 border-b bg-background'>
                <div className='relative'>
                  <Search className='absolute left-3 top-2.5 h-4 w-4 text-muted-foreground' />
                  <Input
                    autoFocus
                    className='pl-9 rounded-full bg-muted/60 border-transparent'
                    placeholder='Search in this chat…'
                    value={threadSearch}
                    onChange={(e) => setThreadSearch(e.target.value)}
                  />
                </div>
              </div>
            )}
            <ScrollArea
              className='flex-1 p-4 text-[#111b21]/[0.06] dark:text-white/[0.05] bg-[#EFEAE2] dark:bg-[#0B141A] [&_[data-slot=scroll-area-scrollbar]]:hidden'
              style={WALLPAPER_STYLE}
            >
              <div className='space-y-1 relative'>
                {messageGroups.map((group) => (
                  <div key={group.dayLabel}>
                    <div className='flex justify-center py-2'>
                      <span className='rounded-md bg-white/90 dark:bg-[#182229] px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm'>
                        {group.dayLabel}
                      </span>
                    </div>
                    <div className='space-y-1'>
                      {group.items.map(({ message: msg, isGroupStart }) => (
                        <div
                          key={msg.id}
                          className={cn(
                            'max-w-[80%] md:max-w-[65%] rounded-lg px-3 py-2 text-sm shadow-sm text-[#111b21] dark:text-[#e9edef]',
                            isGroupStart ? 'mt-2' : 'mt-0.5',
                            msg.direction === 'outbound'
                              ? cn('ml-auto bg-[#D9FDD3] dark:bg-[#005C4B]', isGroupStart && 'rounded-tr-none')
                              : cn('bg-white dark:bg-[#202C33]', isGroupStart && 'rounded-tl-none'),
                          )}
                        >
                          <MessageBubbleContent msg={msg} />
                          <p className='flex items-center justify-end gap-1 text-[10px] text-muted-foreground mt-1'>
                            {formatMessageTime(msg.createdAt)}
                            {msg.direction === 'outbound' && (
                              <MessageStatusIndicator status={msg.status} errorMessage={msg.errorMessage} />
                            )}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
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
              <div className='p-3 border-t space-y-2'>
                <div className='flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-2'>
                  {pendingFilePreviewUrl ? (
                    <img src={pendingFilePreviewUrl} alt='' className='h-10 w-10 rounded object-cover' />
                  ) : pendingFile.type.startsWith('audio/') ? (
                    <Mic className='h-5 w-5 shrink-0 text-muted-foreground' />
                  ) : (
                    <FileText className='h-5 w-5 shrink-0 text-muted-foreground' />
                  )}
                  <span className='min-w-0 flex-1'>
                    <span className='block truncate text-sm font-medium'>{pendingFile.name}</span>
                    <span className='block text-xs text-muted-foreground'>{formatBytes(pendingFile.size)}</span>
                  </span>
                  <Button variant='ghost' size='icon' className='h-7 w-7' onClick={() => setPendingFile(null)}>
                    <X className='h-4 w-4' />
                  </Button>
                </div>
                <div className='flex gap-2'>
                  <Input
                    className='rounded-full bg-muted/60 border-transparent'
                    placeholder='Add a caption…'
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMedia()}
                  />
                  <Button
                    size='icon'
                    className='rounded-full bg-[#00A884] hover:bg-[#00A884]/90 shrink-0'
                    onClick={handleSendMedia}
                    disabled={sendingMedia}
                  >
                    <Send className='h-4 w-4' />
                  </Button>
                </div>
              </div>
            ) : isRecording ? (
              <div className='p-3 border-t flex items-center gap-3'>
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
                  className='rounded-full bg-[#00A884] hover:bg-[#00A884]/90'
                  onClick={() => stopRecording()}
                >
                  <Square className='h-4 w-4' />
                </Button>
              </div>
            ) : (
              <div className='p-3 border-t flex gap-2 items-center'>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant='ghost' size='icon' type='button' className='rounded-full shrink-0'>
                      <Paperclip className='h-5 w-5 text-muted-foreground' />
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
                <Input
                  className='rounded-full bg-muted/60 border-transparent'
                  placeholder='Type a message…'
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                />
                {draft.trim() ? (
                  <Button
                    size='icon'
                    className='rounded-full bg-[#00A884] hover:bg-[#00A884]/90 shrink-0'
                    onClick={handleSend}
                    disabled={sending}
                  >
                    <Send className='h-4 w-4' />
                  </Button>
                ) : (
                  <Button
                    size='icon'
                    className='rounded-full bg-[#00A884] hover:bg-[#00A884]/90 shrink-0'
                    onClick={startRecording}
                  >
                    <Mic className='h-4 w-4' />
                  </Button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className='flex-1 flex items-center justify-center text-muted-foreground bg-[#EFEAE2]/40 dark:bg-[#0B141A]/40'>
            Select a conversation
          </div>
        )}
      </main>
    </div>
  )
}
