import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, Headphones, Image as ImageIcon, Loader2, Package, Paperclip, Pencil, Reply, Search, SendHorizontal, Smile, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useSearchProductsQuery } from '@/stores/product.api'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useEditChatMessageMutation, type ChatMessage } from '@/stores/chat.api'
import { emitTyping } from '../lib/chat-live'
import { previewOf } from '../lib/chat-cache'
import { isVisual, MAX_BYTES, MAX_FILES, mediaKind } from '../lib/chat-media'
import { useChatSender } from '../hooks/use-chat-sender'
import { MAX_VOICE_SECONDS, useVoiceRecorder } from '../hooks/use-voice-recorder'
import { MediaSendDialog } from './media-send-dialog'
import { PreviewText } from './preview-text'
import { HoldRecorder, LockedRecorder, MicButton } from './voice-recorder'

const EMOJIS = ['😀', '😂', '😊', '😍', '🤔', '😅', '😢', '😡', '👍', '👎', '🙏', '👏', '🙌', '💪', '✅', '❌', '⚠️', '❓', '🔥', '🎉', '📦', '🚚', '💰', '📞']
const TYPING_EVERY_MS = 2500

/** The 📎 menu, like WhatsApp's: what each choice lets the file picker show. */
const PICKERS = [
  { key: 'media', label: 'Photos & videos', accept: 'image/*,video/*', icon: ImageIcon, tint: 'text-sky-600' },
  { key: 'audio', label: 'Audio', accept: 'audio/*', icon: Headphones, tint: 'text-orange-600' },
  {
    key: 'document',
    label: 'Document',
    accept: '.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.zip,.rar,.odt,.ods,application/pdf',
    icon: FileText,
    tint: 'text-violet-600',
  },
] as const
const ANY_FILE = 'image/*,video/*,audio/*,' + PICKERS[2].accept

interface ChatComposerProps {
  conversationId: string
  replyTo: ChatMessage | null
  onCancelReply: () => void
  editing: ChatMessage | null
  onCancelEdit: () => void
  disabled?: boolean
}

const draftKey = (id: string) => `chat-draft:${id}`
const readDraft = (id: string) => {
  try {
    return localStorage.getItem(draftKey(id)) ?? ''
  } catch {
    return ''
  }
}
const writeDraft = (id: string, text: string) => {
  try {
    if (text) localStorage.setItem(draftKey(id), text)
    else localStorage.removeItem(draftKey(id))
  } catch {
    /* ignore */
  }
}

function ProductPicker({ onPick }: { onPick: (product: { productId: string; name: string }) => void }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const { data, isFetching } = useSearchProductsQuery({ search: search.trim(), limit: 12 }, { skip: !open })
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type='button' size='icon' variant='ghost' className='size-9 shrink-0 rounded-full' title='Share a product' aria-label='Share a product'>
          <Package className='size-5' />
        </Button>
      </PopoverTrigger>
      <PopoverContent side='top' align='start' className='w-80 p-0'>
        <div className='border-b p-2'>
          <div className='relative'>
            <Search className='pointer-events-none absolute start-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Find a product to share'
              className='h-8 w-full rounded-md border border-input bg-transparent ps-8 pe-2 text-sm outline-none focus-visible:border-input-ring dark:bg-input/30'
            />
          </div>
          <p className='mt-1.5 text-[11px] text-muted-foreground'>Others see its price, your stock, and can check every branch's stock.</p>
        </div>
        <ul className='max-h-64 overflow-y-auto py-1'>
          {isFetching && !data && <li className='px-3 py-2 text-xs text-muted-foreground'>Searching…</li>}
          {data?.results.length === 0 && <li className='px-3 py-2 text-xs text-muted-foreground'>No products found.</li>}
          {data?.results.map((product) => {
            const id = product.id || product._id
            if (!id) return null
            return (
              <li key={id}>
                <button
                  type='button'
                  onClick={() => {
                    onPick({ productId: id, name: product.name })
                    setOpen(false)
                    setSearch('')
                  }}
                  className='flex w-full items-center gap-2 px-3 py-1.5 text-start text-sm hover:bg-accent'
                >
                  <Package className='size-4 shrink-0 text-muted-foreground' />
                  <span className='truncate'>{product.name}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

export function ChatComposer({ conversationId, replyTo, onCancelReply, editing, onCancelEdit, disabled }: ChatComposerProps) {
  const [text, setText] = useState(() => readDraft(conversationId))
  // Files picked / pasted / dropped, waiting in the send preview.
  const [picked, setPicked] = useState<{ files: File[]; accept: string } | null>(null)
  const [product, setProduct] = useState<{ productId: string; name: string } | null>(null)
  const [dragging, setDragging] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastTypingRef = useRef(0)
  const { sendMessage } = useChatSender()
  const [editMessage, { isLoading: savingEdit }] = useEditChatMessageMutation()

  /* ── Voice messages ─────────────────────────────────────────────────────── */
  // none → hold (mic held down) → sent on release, or → locked (hands-free bar).
  const [voiceMode, setVoiceMode] = useState<'none' | 'hold' | 'locked'>('none')
  const [slide, setSlide] = useState({ x: 0, y: 0 })
  const voice = useVoiceRecorder({
    onLimit: () => toast.info(`Voice messages can be up to ${MAX_VOICE_SECONDS / 60} minutes — send it or delete it`),
  })
  const voiceModeRef = useRef(voiceMode)
  voiceModeRef.current = voiceMode
  const replyRef = useRef(replyTo)
  replyRef.current = replyTo

  const pressMic = () => {
    if (voice.state !== 'idle') return
    setVoiceMode('hold')
    voice.start().catch((err: Error) => {
      setVoiceMode('none')
      toast.error(err.message || 'Could not start the microphone')
    })
  }

  const discardVoice = () => {
    voice.cancel()
    setVoiceMode('none')
    requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }))
  }

  const sendVoice = async (fromHold = false) => {
    const note = await voice.stop()
    setVoiceMode('none')
    requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }))
    if (!note) {
      toast.info(fromHold ? 'Hold to record, release to send' : 'Voice message too short')
      return
    }
    const reply = replyRef.current
    void sendMessage({
      conversationId,
      voice: note,
      replyTo: reply ? { messageId: reply.id, text: previewOf(reply) || 'Attachment', senderName: reply.senderName } : undefined,
    })
    onCancelReply()
  }

  const releaseMic = (kind: 'tap' | 'send') => {
    if (voiceModeRef.current !== 'hold') return
    // Still at the permission prompt, or a quick tap: keep recording hands-free.
    if (kind === 'tap' || voice.current() === 'starting') setVoiceMode('locked')
    else void sendVoice(true)
  }

  // The floating assistant launcher (and its own mic) steps aside while a note is recorded.
  useEffect(() => {
    if (voiceMode === 'none') return
    document.documentElement.setAttribute('data-voice-recording', '')
    return () => document.documentElement.removeAttribute('data-voice-recording')
  }, [voiceMode])

  // Others see "recording audio…" while the mic is live.
  useEffect(() => {
    if (voice.state !== 'recording') return
    emitTyping(conversationId, false, 'recording')
    const timer = window.setInterval(() => emitTyping(conversationId, false, 'recording'), TYPING_EVERY_MS)
    return () => {
      window.clearInterval(timer)
      emitTyping(conversationId, true, 'recording')
    }
  }, [voice.state, conversationId])

  // Switching conversation: load that thread's draft, drop half-picked attachments.
  useEffect(() => {
    setText(readDraft(conversationId))
    setPicked(null)
    setProduct(null)
    if (voiceModeRef.current !== 'none') {
      voice.cancel()
      setVoiceMode('none')
      toast.info('Voice message discarded')
    }
    lastTypingRef.current = 0
    requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  // Editing: the box takes the message's text; leaving edit mode restores the draft.
  useEffect(() => {
    if (editing) setText(editing.text)
    else setText(readDraft(conversationId))
    requestAnimationFrame(() => textareaRef.current?.focus())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id])

  useEffect(() => {
    if (replyTo) textareaRef.current?.focus()
  }, [replyTo])

  // Grow with the text, up to about six lines.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])

  /** Checks size/count, then opens the WhatsApp-style preview (or adds to the open one). */
  const addFiles = useCallback((list: FileList | File[], accept: string = ANY_FILE) => {
    const accepted = Array.from(list).filter((file) => {
      const limit = MAX_BYTES[mediaKind(file.type)]
      if (file.size > limit) {
        toast.error(`${file.name || 'That file'} is larger than ${Math.round(limit / 1024 / 1024)} MB`)
        return false
      }
      if (!file.size) {
        toast.error(`${file.name || 'That file'} is empty`)
        return false
      }
      return true
    })
    if (!accepted.length) return
    setPicked((current) => {
      const all = [...(current?.files ?? []), ...accepted]
      if (all.length > MAX_FILES) toast.info(`Up to ${MAX_FILES} files at a time — the first ${MAX_FILES} are kept`)
      return { files: all.slice(0, MAX_FILES), accept: current?.accept ?? accept }
    })
  }, [])

  /**
   * Photos and videos go together as one album message with the caption; each audio clip
   * or document is its own message (WhatsApp does the same). The bubbles appear at once and
   * upload from the chat.
   */
  const sendPicked = (files: File[], caption: string) => {
    const visual = files.filter((f) => isVisual({ mimeType: f.type }))
    const others = files.filter((f) => !isVisual({ mimeType: f.type }))
    const reply = replyTo ? { messageId: replyTo.id, text: previewOf(replyTo) || 'Attachment', senderName: replyTo.senderName } : undefined
    if (visual.length) void sendMessage({ conversationId, files: visual, text: caption, replyTo: reply })
    others.forEach((file, i) =>
      void sendMessage({ conversationId, files: [file], text: !visual.length && i === 0 ? caption : '', replyTo: !visual.length && i === 0 ? reply : undefined })
    )
    setPicked(null)
    onCancelReply()
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const canSend = !disabled && (text.trim().length > 0 || !!product)
  // WhatsApp: an empty box shows the mic; typing turns it into Send.
  const showMic = !editing && !canSend && !disabled
  const recording = voiceMode !== 'none'

  const submit = async () => {
    if (editing) {
      if (!text.trim() || text === editing.text) {
        onCancelEdit()
        return
      }
      try {
        await editMessage({ id: editing.id, text: text.trim() }).unwrap()
        onCancelEdit()
      } catch (err) {
        toast.error((err as { data?: { message?: string } })?.data?.message || 'Could not save the edit')
      }
      return
    }
    if (!canSend) return
    void sendMessage({
      conversationId,
      text: text.trim(),
      product: product ?? undefined,
      replyTo: replyTo ? { messageId: replyTo.id, text: previewOf(replyTo) || 'Attachment', senderName: replyTo.senderName } : undefined,
    })
    setText('')
    writeDraft(conversationId, '')
    setProduct(null)
    onCancelReply()
    emitTyping(conversationId, true)
    lastTypingRef.current = 0
  }

  const onChange = (value: string) => {
    setText(value)
    if (!editing) writeDraft(conversationId, value)
    const now = Date.now()
    if (value && now - lastTypingRef.current > TYPING_EVERY_MS) {
      lastTypingRef.current = now
      emitTyping(conversationId)
    }
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void submit()
    } else if (event.key === 'Escape') {
      if (editing) onCancelEdit()
      else if (replyTo) onCancelReply()
    }
  }

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    onChange(text.slice(0, start) + emoji + text.slice(end))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + emoji.length, start + emoji.length)
    })
  }

  return (
    <div
      className={cn('border-t bg-card px-2 py-2 sm:px-3', dragging && 'ring-2 ring-inset ring-primary')}
      onDragOver={(e) => {
        if (editing || !e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (editing) return
        e.preventDefault()
        setDragging(false)
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
      }}
    >
      {(replyTo || editing) && (
        <div className='mb-2 flex items-center gap-2 rounded-lg border-s-4 border-primary bg-muted/60 px-3 py-1.5'>
          {editing ? <Pencil className='size-4 shrink-0 text-primary' /> : <Reply className='size-4 shrink-0 text-primary' />}
          <div className='min-w-0 flex-1 text-xs'>
            <p className='font-semibold'>{editing ? 'Editing message' : `Replying to ${replyTo!.senderName}`}</p>
            <PreviewText text={previewOf((editing ?? replyTo)!) || 'Attachment'} className='text-muted-foreground' />
          </div>
          <button type='button' onClick={editing ? onCancelEdit : onCancelReply} className='rounded p-0.5 text-muted-foreground hover:text-foreground' aria-label='Cancel'>
            <X className='size-4' />
          </button>
        </div>
      )}

      {product && !editing && (
        <div className='mb-2 flex flex-wrap gap-2'>
          <span className='flex items-center gap-1.5 rounded-lg border bg-muted/60 py-1 ps-2 pe-1 text-xs'>
            <Package className='size-4 text-primary' />
            <span className='max-w-48 truncate font-medium'>{product.name}</span>
            <button type='button' onClick={() => setProduct(null)} className='rounded p-0.5 hover:bg-accent' aria-label='Remove product'>
              <X className='size-3.5' />
            </button>
          </span>
        </div>
      )}

      <div className='flex items-end gap-1'>
        {voiceMode === 'locked' ? (
          <LockedRecorder
            state={voice.state}
            elapsed={voice.elapsed}
            levels={voice.levels}
            snapshot={voice.snapshot}
            onPause={voice.pause}
            onResume={voice.resume}
            onDiscard={discardVoice}
            onSend={() => void sendVoice()}
          />
        ) : voiceMode === 'hold' ? (
          <HoldRecorder state={voice.state} elapsed={voice.elapsed} slide={slide.x} />
        ) : (
          <>
            {!editing && (
              <>
                <input
                  ref={fileInputRef}
                  type='file'
                  multiple
                  hidden
                  onChange={(e) => {
                    if (e.target.files?.length) addFiles(e.target.files, e.target.accept)
                    e.target.value = ''
                  }}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type='button'
                      size='icon'
                      variant='ghost'
                      className='size-9 shrink-0 rounded-full'
                      title='Attach photos, videos, audio or a document (you can also paste or drop them)'
                      aria-label='Attach file'
                    >
                      <Paperclip className='size-5' />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side='top' align='start' className='min-w-48'>
                    {PICKERS.map(({ key, label, accept, icon: Icon, tint }) => (
                      <DropdownMenuItem
                        key={key}
                        onSelect={() => {
                          const input = fileInputRef.current
                          if (!input) return
                          input.accept = accept
                          // After the menu has closed, or some browsers drop the picker.
                          window.setTimeout(() => input.click(), 0)
                        }}
                      >
                        <Icon className={cn('mr-2 size-4', tint)} /> {label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <ProductPicker onPick={setProduct} />
              </>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <Button type='button' size='icon' variant='ghost' className='size-9 shrink-0 rounded-full' aria-label='Emoji'>
                  <Smile className='size-5' />
                </Button>
              </PopoverTrigger>
              <PopoverContent side='top' align='start' className='grid w-64 grid-cols-8 gap-0.5 p-2'>
                {EMOJIS.map((emoji) => (
                  <button key={emoji} type='button' onClick={() => insertEmoji(emoji)} className='rounded p-1 text-lg leading-none hover:bg-accent'>
                    {emoji}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            <textarea
              ref={textareaRef}
              value={text}
              rows={1}
              disabled={disabled}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={() => text && emitTyping(conversationId, true)}
              onPaste={(e) => {
                if (editing) return
                const pasted = Array.from(e.clipboardData.files || [])
                if (pasted.length) {
                  e.preventDefault()
                  addFiles(pasted)
                }
              }}
              placeholder={editing ? 'Edit your message' : 'Type a message'}
              aria-label='Message'
              className='max-h-40 min-h-9 flex-1 resize-none rounded-2xl border border-input bg-transparent px-3.5 py-2 text-sm leading-5 outline-none focus-visible:border-input-ring focus-visible:ring-[3px] focus-visible:ring-input-ring/50 dark:bg-input/30'
            />
          </>
        )}
        {voiceMode === 'locked' ? null : showMic || voiceMode === 'hold' ? (
          <MicButton
            holding={voiceMode === 'hold'}
            disabled={disabled}
            onPress={pressMic}
            onRelease={releaseMic}
            onSlide={setSlide}
            onCancel={discardVoice}
            onLock={() => setVoiceMode('locked')}
          />
        ) : (
          <Button
            type='button'
            size='icon'
            className='size-9 shrink-0 rounded-full'
            disabled={editing ? savingEdit || !text.trim() : !canSend}
            onClick={() => void submit()}
            title='Send (Enter)'
            aria-label='Send'
          >
            {savingEdit ? <Loader2 className='size-4 animate-spin' /> : <SendHorizontal className='size-4' />}
          </Button>
        )}
      </div>
      <p className='mt-1 hidden px-2 text-[10px] text-muted-foreground sm:block'>
        {recording
          ? 'Recording · pause to listen back, delete to start over, or send'
          : 'Enter to send · Shift+Enter for a new line · tap the mic for a voice message (or hold it, release to send) · paste or drop files'}
      </p>

      {picked && (
        <MediaSendDialog
          files={picked.files}
          accept={picked.accept}
          onAdd={(files) => addFiles(files, picked.accept)}
          onRemove={(index) => {
            const files = picked.files.filter((_, i) => i !== index)
            setPicked(files.length ? { ...picked, files } : null)
          }}
          onSend={sendPicked}
          onClose={() => setPicked(null)}
        />
      )}
    </div>
  )
}
