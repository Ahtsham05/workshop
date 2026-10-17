import { useEffect, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { FileText, Headphones, Plus, SendHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatFileSize } from '../lib/chat-format'
import { fileExtension, mediaKind } from '../lib/chat-media'

interface MediaSendDialogProps {
  files: File[]
  /** "Photos & videos" / "Audio" / "Document" — what the + tile picks more of. */
  accept: string
  /** More files picked with "+" (checked for size/count by the composer). */
  onAdd: (files: File[]) => void
  onRemove: (index: number) => void
  onSend: (files: File[], caption: string) => void
  onClose: () => void
}

/**
 * WhatsApp's preview before sending: the picked file large, a strip of everything picked
 * (✕ to drop one, + to add more), a caption, and send. Sending closes it at once — the
 * bubbles appear in the chat and upload from there.
 */
export function MediaSendDialog({
  files,
  accept,
  onAdd,
  onRemove,
  onSend,
  onClose,
}: MediaSendDialogProps) {
  const [active, setActive] = useState(0)
  const [caption, setCaption] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const captionRef = useRef<HTMLInputElement>(null)
  // Created and released by the same effect: a URL made in render/useMemo but revoked in an
  // effect cleanup is dead after React's dev double-mount (StrictMode), leaving broken images.
  const [urls, setUrls] = useState<string[]>([])
  useEffect(() => {
    const next = files.map((f) => URL.createObjectURL(f))
    setUrls(next)
    return () => next.forEach((u) => URL.revokeObjectURL(u))
  }, [files])
  useEffect(() => {
    if (active >= files.length) setActive(Math.max(0, files.length - 1))
  }, [files.length, active])

  const file = files[active]
  if (!file) return null
  const kind = mediaKind(file.type)
  const send = () => onSend(files, caption.trim())

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogOverlay className='z-[120] bg-black/60' />
        <DialogPrimitive.Content
          className='bg-card text-foreground data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 fixed inset-0 z-[120] m-auto flex h-[min(720px,100dvh)] w-[min(880px,100vw)] flex-col overflow-hidden shadow-2xl outline-none sm:inset-6 sm:rounded-xl'
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            captionRef.current?.focus()
          }}
          data-media-send
        >
          <div className='flex items-center gap-2 border-b px-3 py-2'>
            <button
              type='button'
              onClick={onClose}
              className='hover:bg-accent flex size-9 items-center justify-center rounded-full'
              aria-label='Cancel'
            >
              <X className='size-5' />
            </button>
            <div className='min-w-0 flex-1'>
              <DialogTitle className='truncate text-sm font-semibold'>
                {file.name || 'Untitled'}
              </DialogTitle>
              <DialogDescription className='text-muted-foreground text-xs'>
                {fileExtension(file.name, file.type)} ·{' '}
                {formatFileSize(file.size)}
                {files.length > 1 ? ` · ${active + 1} of ${files.length}` : ''}
              </DialogDescription>
            </div>
          </div>

          <div className='bg-muted/40 flex min-h-0 flex-1 items-center justify-center p-4'>
            {!urls[active] ? null : kind === 'image' ? (
              <img
                src={urls[active]}
                alt={file.name}
                className='max-h-full max-w-full rounded-md object-contain shadow-sm'
              />
            ) : kind === 'video' ? (
              <video
                key={urls[active]}
                src={urls[active]}
                controls
                playsInline
                className='max-h-full max-w-full rounded-md bg-black'
              />
            ) : (
              <div className='flex flex-col items-center gap-3 text-center'>
                <span className='bg-primary/10 text-primary flex size-24 items-center justify-center rounded-2xl'>
                  {kind === 'audio' ? (
                    <Headphones className='size-12' />
                  ) : (
                    <FileText className='size-12' />
                  )}
                </span>
                <p className='max-w-sm truncate text-sm font-medium'>
                  {file.name}
                </p>
                <p className='text-muted-foreground text-xs'>
                  {fileExtension(file.name, file.type)} ·{' '}
                  {formatFileSize(file.size)}
                </p>
                {kind === 'audio' && (
                  <audio
                    key={urls[active]}
                    src={urls[active]}
                    controls
                    className='mt-1 w-72 max-w-full'
                  />
                )}
              </div>
            )}
          </div>

          <div className='space-y-3 border-t p-3'>
            <input
              ref={captionRef}
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, 1000))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder='Add a caption…'
              aria-label='Caption'
              className='border-input focus-visible:border-input-ring focus-visible:ring-input-ring/50 dark:bg-input/30 h-10 w-full rounded-full border bg-transparent px-4 text-sm outline-none focus-visible:ring-[3px]'
            />
            <div className='flex items-center gap-2'>
              <div className='flex min-w-0 flex-1 gap-2 overflow-x-auto py-1 [scrollbar-width:thin]'>
                {files.map((f, i) => {
                  const k = mediaKind(f.type)
                  return (
                    <div
                      key={`${i}-${f.name}-${f.size}`}
                      className='group/thumb relative shrink-0'
                    >
                      <button
                        type='button'
                        onClick={() => setActive(i)}
                        className={cn(
                          'bg-muted flex size-14 items-center justify-center overflow-hidden rounded-lg border-2',
                          i === active ? 'border-primary' : 'border-transparent'
                        )}
                        aria-label={`Show ${f.name}`}
                        aria-current={i === active}
                      >
                        {k === 'image' ? (
                          <img
                            src={urls[i]}
                            alt=''
                            className='size-full object-cover'
                          />
                        ) : k === 'video' ? (
                          <video
                            src={`${urls[i]}#t=0.1`}
                            muted
                            preload='metadata'
                            className='size-full object-cover'
                          />
                        ) : k === 'audio' ? (
                          <Headphones className='text-muted-foreground size-6' />
                        ) : (
                          <FileText className='text-muted-foreground size-6' />
                        )}
                      </button>
                      <button
                        type='button'
                        onClick={() => onRemove(i)}
                        className='bg-card text-muted-foreground hover:text-foreground absolute -end-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border shadow-sm'
                        aria-label={`Remove ${f.name}`}
                      >
                        <X className='size-3' />
                      </button>
                    </div>
                  )
                })}
                <button
                  type='button'
                  onClick={() => inputRef.current?.click()}
                  className='text-muted-foreground hover:bg-accent hover:text-foreground flex size-14 shrink-0 items-center justify-center rounded-lg border-2 border-dashed'
                  aria-label='Add more files'
                  title='Add more'
                >
                  <Plus className='size-6' />
                </button>
                <input
                  ref={inputRef}
                  type='file'
                  multiple
                  hidden
                  accept={accept}
                  onChange={(e) => {
                    if (e.target.files?.length)
                      onAdd(Array.from(e.target.files))
                    e.target.value = ''
                  }}
                />
              </div>
              <button
                type='button'
                onClick={send}
                className='bg-primary text-primary-foreground hover:bg-primary/90 relative flex size-12 shrink-0 items-center justify-center rounded-full shadow-md'
                aria-label={`Send ${files.length} file${files.length === 1 ? '' : 's'}`}
              >
                <SendHorizontal className='size-5' />
                {files.length > 1 && (
                  <span className='border-card bg-foreground text-background absolute -end-1 -top-1 flex size-5 items-center justify-center rounded-full border-2 text-[10px] font-bold'>
                    {files.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}
