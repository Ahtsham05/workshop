import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, Loader2, Package, Paperclip, Pencil, Reply, Search, SendHorizontal, Smile, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useSearchProductsQuery } from '@/stores/product.api'
import { useEditChatMessageMutation, useUploadChatAttachmentMutation, type ChatAttachment, type ChatMessage } from '@/stores/chat.api'
import { emitTyping } from '../lib/chat-live'
import { useChatSender } from '../hooks/use-chat-sender'

const EMOJIS = ['😀', '😂', '😊', '😍', '🤔', '😅', '😢', '😡', '👍', '👎', '🙏', '👏', '🙌', '💪', '✅', '❌', '⚠️', '❓', '🔥', '🎉', '📦', '🚚', '💰', '📞']
const MAX_FILE_BYTES = 10 * 1024 * 1024
const TYPING_EVERY_MS = 2500

interface PendingFile {
  key: string
  name: string
  previewUrl?: string
  status: 'uploading' | 'done' | 'error'
  attachment?: ChatAttachment
}

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
  const [files, setFiles] = useState<PendingFile[]>([])
  const [product, setProduct] = useState<{ productId: string; name: string } | null>(null)
  const [dragging, setDragging] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastTypingRef = useRef(0)
  const { sendMessage } = useChatSender()
  const [upload] = useUploadChatAttachmentMutation()
  const [editMessage, { isLoading: savingEdit }] = useEditChatMessageMutation()

  // Switching conversation: load that thread's draft, drop half-picked attachments.
  useEffect(() => {
    setText(readDraft(conversationId))
    setFiles([])
    setProduct(null)
    lastTypingRef.current = 0
    requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }))
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

  const addFiles = useCallback(
    (list: FileList | File[]) => {
      const accepted = Array.from(list).filter((file) => {
        if (!(file.type.startsWith('image/') || file.type === 'application/pdf')) {
          toast.error(`${file.name}: only images and PDFs can be sent`)
          return false
        }
        if (file.size > MAX_FILE_BYTES) {
          toast.error(`${file.name} is larger than 10 MB`)
          return false
        }
        return true
      })
      accepted.slice(0, 10).forEach((file) => {
        const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`
        const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
        setFiles((current) => [...current, { key, name: file.name || 'image.png', previewUrl, status: 'uploading' }])
        const form = new FormData()
        form.append('file', file, file.name || 'image.png')
        upload(form)
          .unwrap()
          .then((attachment) => setFiles((current) => current.map((f) => (f.key === key ? { ...f, status: 'done', attachment } : f))))
          .catch((err) => {
            setFiles((current) => current.map((f) => (f.key === key ? { ...f, status: 'error' } : f)))
            toast.error(err?.data?.message || `Could not upload ${file.name}`)
          })
      })
    },
    [upload]
  )

  const uploading = files.some((f) => f.status === 'uploading')
  const readyAttachments = files.filter((f) => f.status === 'done' && f.attachment).map((f) => f.attachment!)
  const canSend = !disabled && !uploading && (text.trim().length > 0 || readyAttachments.length > 0 || !!product)

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
    sendMessage({
      conversationId,
      text: text.trim(),
      attachments: readyAttachments.length ? readyAttachments : undefined,
      product: product ?? undefined,
      replyTo: replyTo ? { messageId: replyTo.id, text: replyTo.text || replyTo.product?.name || 'Attachment', senderName: replyTo.senderName } : undefined,
    })
    files.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl))
    setText('')
    writeDraft(conversationId, '')
    setFiles([])
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
            <p className='truncate text-muted-foreground'>{(editing ?? replyTo)!.text || (editing ?? replyTo)!.product?.name || 'Attachment'}</p>
          </div>
          <button type='button' onClick={editing ? onCancelEdit : onCancelReply} className='rounded p-0.5 text-muted-foreground hover:text-foreground' aria-label='Cancel'>
            <X className='size-4' />
          </button>
        </div>
      )}

      {(files.length > 0 || product) && !editing && (
        <div className='mb-2 flex flex-wrap gap-2'>
          {product && (
            <span className='flex items-center gap-1.5 rounded-lg border bg-muted/60 py-1 ps-2 pe-1 text-xs'>
              <Package className='size-4 text-primary' />
              <span className='max-w-48 truncate font-medium'>{product.name}</span>
              <button type='button' onClick={() => setProduct(null)} className='rounded p-0.5 hover:bg-accent' aria-label='Remove product'>
                <X className='size-3.5' />
              </button>
            </span>
          )}
          {files.map((file) => (
            <span key={file.key} className={cn('relative flex items-center gap-1.5 rounded-lg border bg-muted/60 p-1 text-xs', file.status === 'error' && 'border-destructive')}>
              {file.previewUrl ? (
                <img src={file.previewUrl} alt='' className='size-10 rounded object-cover' />
              ) : (
                <FileText className='size-6 text-red-600' />
              )}
              <span className='max-w-28 truncate'>{file.name}</span>
              {file.status === 'uploading' && <Loader2 className='size-3.5 animate-spin text-muted-foreground' />}
              <button
                type='button'
                onClick={() => {
                  if (file.previewUrl) URL.revokeObjectURL(file.previewUrl)
                  setFiles((current) => current.filter((f) => f.key !== file.key))
                }}
                className='rounded p-0.5 hover:bg-accent'
                aria-label={`Remove ${file.name}`}
              >
                <X className='size-3.5' />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className='flex items-end gap-1'>
        {!editing && (
          <>
            <input
              ref={fileInputRef}
              type='file'
              accept='image/*,application/pdf'
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <Button
              type='button'
              size='icon'
              variant='ghost'
              className='size-9 shrink-0 rounded-full'
              onClick={() => fileInputRef.current?.click()}
              title='Attach a photo or PDF (you can also paste or drop one)'
              aria-label='Attach file'
            >
              <Paperclip className='size-5' />
            </Button>
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
        <Button
          type='button'
          size='icon'
          className='size-9 shrink-0 rounded-full'
          disabled={editing ? savingEdit || !text.trim() : !canSend}
          onClick={() => void submit()}
          title={uploading ? 'Waiting for the upload to finish' : 'Send (Enter)'}
          aria-label='Send'
        >
          {savingEdit || uploading ? <Loader2 className='size-4 animate-spin' /> : <SendHorizontal className='size-4' />}
        </Button>
      </div>
      <p className='mt-1 hidden px-2 text-[10px] text-muted-foreground sm:block'>Enter to send · Shift+Enter for a new line · paste a screenshot to attach it</p>
    </div>
  )
}
