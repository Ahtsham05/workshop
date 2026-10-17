import { useEffect, useRef } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ChevronLeft, ChevronRight, Download, Play, X } from 'lucide-react'
import type { ChatAttachment } from '@/stores/chat.api'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '@/components/ui/dialog'
import { UserAvatar } from '@/components/user-avatar'
import { formatChatStamp } from '../lib/chat-format'
import {
  downloadUrl,
  imageFullUrl,
  imageThumbUrl,
  localPreviewFor,
  mediaKind,
  videoPosterUrl,
} from '../lib/chat-media'

export interface MediaItem {
  key: string
  attachment: ChatAttachment
  senderName: string
  createdAt: string
  caption: string
}

interface MediaViewerProps {
  items: MediaItem[]
  index: number | null
  onIndexChange: (index: number | null) => void
}

/**
 * Full-screen photo/video viewer (WhatsApp's): who sent it and when, download, close,
 * ←/→ through every photo and video in the conversation, and a thumbnail strip.
 */
export function MediaViewer({ items, index, onIndexChange }: MediaViewerProps) {
  const open = index != null && !!items[index]
  const item = open ? items[index!] : null
  const stripRef = useRef<HTMLDivElement>(null)

  const go = (delta: number) => {
    if (index == null) return
    const next = index + delta
    if (next >= 0 && next < items.length) onIndexChange(next)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    stripRef.current
      ?.querySelector('[aria-current="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [index])

  if (!item) return null
  const a = item.attachment
  const kind = mediaKind(a.mimeType)
  const local = a.localUrl || localPreviewFor(a.url)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onIndexChange(null)}>
      <DialogPortal>
        {/* Above the app's bottom banners (z-[100]): a viewer is the whole screen. */}
        <DialogOverlay className='z-[120] bg-black/95' />
        <DialogPrimitive.Content
          className='data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-[120] flex flex-col text-white outline-none'
          data-media-viewer
        >
          <div className='flex items-center gap-3 px-3 py-2 sm:px-4'>
            <UserAvatar name={item.senderName} className='size-9' />
            <div className='min-w-0 flex-1'>
              <DialogTitle className='truncate text-sm font-semibold text-white'>
                {item.senderName}
              </DialogTitle>
              <DialogDescription className='text-xs text-white/70'>
                {formatChatStamp(item.createdAt)} · {index! + 1} of{' '}
                {items.length}
              </DialogDescription>
            </div>
            {a.url && (
              <a
                href={downloadUrl(a)}
                target='_blank'
                rel='noreferrer'
                download={a.name || true}
                className='flex size-10 items-center justify-center rounded-full hover:bg-white/10'
                aria-label='Download'
                title='Download'
              >
                <Download className='size-5' />
              </a>
            )}
            <button
              type='button'
              onClick={() => onIndexChange(null)}
              className='flex size-10 items-center justify-center rounded-full hover:bg-white/10'
              aria-label='Close'
            >
              <X className='size-6' />
            </button>
          </div>

          <div className='relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-16'>
            {kind === 'video' ? (
              <video
                key={item.key}
                src={local || a.url}
                poster={
                  local ? undefined : videoPosterUrl(a.url, 1280) || undefined
                }
                controls
                autoPlay
                playsInline
                className='max-h-full max-w-full rounded-md'
              />
            ) : (
              <img
                key={item.key}
                src={local || imageFullUrl(a.url)}
                alt={a.name || 'Photo'}
                className='max-h-full max-w-full rounded-md object-contain'
                draggable={false}
              />
            )}
            {index! > 0 && (
              <button
                type='button'
                onClick={() => go(-1)}
                className='absolute start-2 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 sm:start-4'
                aria-label='Previous'
              >
                <ChevronLeft className='size-6' />
              </button>
            )}
            {index! < items.length - 1 && (
              <button
                type='button'
                onClick={() => go(1)}
                className='absolute end-2 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 sm:end-4'
                aria-label='Next'
              >
                <ChevronRight className='size-6' />
              </button>
            )}
          </div>

          {item.caption && (
            <p className='mx-auto max-w-2xl px-4 pt-2 text-center text-sm [overflow-wrap:anywhere] text-white/90'>
              {item.caption}
            </p>
          )}

          {items.length > 1 && (
            <div
              ref={stripRef}
              className='flex justify-start gap-1.5 overflow-x-auto px-3 py-3 [scrollbar-width:none] sm:justify-center'
            >
              {items.map((m, i) => {
                const thumbLocal =
                  m.attachment.localUrl || localPreviewFor(m.attachment.url)
                const isVideo = mediaKind(m.attachment.mimeType) === 'video'
                const thumb =
                  thumbLocal && !isVideo
                    ? thumbLocal
                    : isVideo
                      ? videoPosterUrl(m.attachment.url, 160)
                      : imageThumbUrl(m.attachment.url, 160)
                return (
                  <button
                    key={m.key}
                    type='button'
                    onClick={() => onIndexChange(i)}
                    aria-current={i === index}
                    aria-label={`Show ${i + 1}`}
                    className={cn(
                      'relative size-12 shrink-0 overflow-hidden rounded-md opacity-60 ring-2 ring-transparent transition',
                      i === index && 'opacity-100 ring-white'
                    )}
                  >
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=''
                        className='size-full object-cover'
                      />
                    ) : (
                      <span className='block size-full bg-white/10' />
                    )}
                    {isVideo && (
                      <Play className='absolute inset-0 m-auto size-4 fill-white text-white' />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}
