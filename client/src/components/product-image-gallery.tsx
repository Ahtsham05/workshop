'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe,
  ImageIcon,
  Loader2,
  Maximize2,
  Plus,
  Star,
  Trash2,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import type { ImageSearchContext, StoredImage } from '@/stores/imageSearch.api'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import CameraCapture from './camera-capture'
import WebImageSearchDialog from './web-image-search-dialog'

export type GalleryImage = StoredImage

interface Props {
  /** Ordered gallery. The first entry is the primary photo shown everywhere else. */
  value: GalleryImage[]
  onChange: (images: GalleryImage[]) => void
  /** Hard cap — must match MAX_PRODUCT_IMAGES on the server (8). */
  max?: number
  disabled?: boolean
  /** Read at click time so the search uses whatever the form says right now. */
  getSearchQuery?: () => string
  getBarcode?: () => string
  /** Upload path under VITE_BACKEND_URL. */
  uploadSlug?: string
  context?: ImageSearchContext
  className?: string
  /** Label shown above the tiles; pass '' to hide the header row. */
  label?: string
}

const ACCEPTED = 'image/png,image/jpeg,image/webp,image/gif'
const MAX_FILE_BYTES = 5 * 1024 * 1024

const sameImage = (a: GalleryImage, b: GalleryImage) =>
  (a.publicId && b.publicId && a.publicId === b.publicId) || a.url === b.url

/**
 * Professional multi-image manager for a product (and any other record with photos).
 *
 * The first tile is the primary image — it is what the product list, POS grid, invoice
 * print and every report already render, so the gallery makes that relationship
 * explicit (a "Primary" badge, a one-click star on every other tile) instead of hiding
 * an ordering rule the user can't see.
 *
 * Three ways in, all of them ending in a Cloudinary-hosted URL: find from the web,
 * upload files (multi-select and drag-drop), or take a photo.
 */
export default function ProductImageGallery({
  value,
  onChange,
  max = 8,
  disabled = false,
  getSearchQuery,
  getBarcode,
  uploadSlug = 'products/upload-image',
  context = 'product',
  className,
  label = 'Photos',
}: Props) {
  const images = useMemo(() => (Array.isArray(value) ? value.filter((i) => i?.url) : []), [value])
  const [uploading, setUploading] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const remaining = Math.max(0, max - images.length)
  const full = remaining === 0
  const busy = disabled || uploading > 0

  const commit = useCallback(
    (next: GalleryImage[]) => {
      // Dedupe defensively: the same photo can arrive twice (uploaded once, then picked
      // again from the web picker), and two identical tiles are never what was meant.
      const deduped = next.filter((img, i) => next.findIndex((other) => sameImage(img, other)) === i)
      onChange(deduped.slice(0, max))
    },
    [max, onChange],
  )

  const addImages = useCallback(
    (incoming: GalleryImage[]) => {
      if (!incoming.length) return
      const room = Math.max(0, max - images.length)
      if (incoming.length > room) {
        toast.warning(`Only ${room} more image${room === 1 ? '' : 's'} could be added (limit is ${max}).`)
      }
      commit([...images, ...incoming.slice(0, room)])
    },
    [commit, images, max],
  )

  const uploadFiles = useCallback(
    async (files: File[]) => {
      const room = Math.max(0, max - images.length)
      if (room === 0) {
        toast.error(`This product already has ${max} photos.`)
        return
      }
      const picked = files.filter((file) => {
        if (!file.type.startsWith('image/')) {
          toast.error(`${file.name} is not an image.`)
          return false
        }
        if (file.size > MAX_FILE_BYTES) {
          toast.error(`${file.name} is larger than 5MB.`)
          return false
        }
        return true
      })
      if (!picked.length) return

      const batch = picked.slice(0, room)
      if (picked.length > room) {
        toast.warning(`Only ${room} of ${picked.length} files were uploaded (limit is ${max}).`)
      }

      setUploading(batch.length)
      const uploaded: GalleryImage[] = []
      for (const file of batch) {
        try {
          const formData = new FormData()
          formData.append('image', file)
          const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/${uploadSlug}`, {
            method: 'POST',
            body: formData,
            headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
          })
          const data = await response.json().catch(() => ({}))
          if (!response.ok || !data?.url) {
            throw new Error(typeof data?.message === 'string' ? data.message : 'Upload failed')
          }
          uploaded.push({ url: data.url, publicId: data.publicId, source: 'upload' })
        } catch (e) {
          toast.error(`${file.name}: ${e instanceof Error ? e.message : 'Upload failed'}`)
        } finally {
          setUploading((n) => Math.max(0, n - 1))
        }
      }
      if (uploaded.length) {
        // Read from the ref-free `images` captured above plus what just landed — the
        // loop is sequential, so nothing else has changed the gallery meanwhile.
        commit([...images, ...uploaded])
      }
    },
    [commit, images, max, uploadSlug],
  )

  const removeAt = (index: number) => commit(images.filter((_, i) => i !== index))

  const makePrimary = (index: number) => {
    if (index === 0) return
    const next = [...images]
    const [picked] = next.splice(index, 1)
    commit([picked, ...next])
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= images.length || from === to) return
    const next = [...images]
    const [picked] = next.splice(from, 1)
    next.splice(to, 0, picked)
    commit(next)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (busy) return
    const files = Array.from(e.dataTransfer.files || [])
    if (files.length) void uploadFiles(files)
  }

  // Lightbox keyboard navigation — arrows move, Escape is handled by the Dialog itself.
  useEffect(() => {
    if (lightbox === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setLightbox((i) => (i === null ? i : (i + 1) % images.length))
      if (e.key === 'ArrowLeft') setLightbox((i) => (i === null ? i : (i - 1 + images.length) % images.length))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, images.length])

  return (
    <div className={cn('space-y-3', className)}>
      {label ? (
        <div className='flex items-center justify-between gap-2'>
          <div className='flex items-center gap-2'>
            <span className='text-sm font-medium'>{label}</span>
            {images.length > 0 ? (
              <Badge variant='secondary' className='px-1.5 py-0 text-[10px] tabular-nums'>
                {images.length}/{max}
              </Badge>
            ) : null}
          </div>
          {images.length > 1 ? (
            <span className='text-[11px] text-muted-foreground'>Drag to reorder · ★ sets the main photo</span>
          ) : null}
        </div>
      ) : null}

      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!busy) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          '@container rounded-2xl border border-border/80 bg-gradient-to-b from-card to-muted/20 p-3 shadow-sm ring-1 ring-black/[0.04] transition-colors dark:ring-white/[0.06]',
          dragOver && 'border-primary bg-primary/[0.05] ring-primary/30',
        )}
      >
        <input
          ref={fileInputRef}
          type='file'
          accept={ACCEPTED}
          multiple
          className='hidden'
          onChange={(e) => {
            const files = Array.from(e.target.files || [])
            if (files.length) void uploadFiles(files)
            if (e.target) e.target.value = ''
          }}
        />

        {images.length === 0 && uploading === 0 ? (
          /* Empty state — the three ways in, spelled out rather than hidden in a menu */
          <div className='flex flex-col items-center gap-4 px-3 py-6 text-center sm:py-8'>
            <span className='flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground'>
              <ImageIcon className='h-7 w-7' />
            </span>
            <div>
              <p className='text-sm font-medium'>Add photos of this product</p>
              <p className='mt-1 text-xs text-muted-foreground'>
                Search the web by name or barcode, upload from this device, or take a photo.
                <br className='hidden sm:block' /> Drag & drop works too — PNG, JPG, WebP, GIF up to 5MB.
              </p>
            </div>
            <div className='w-full max-w-sm space-y-2 @[26rem]:flex @[26rem]:max-w-lg @[26rem]:gap-2 @[26rem]:space-y-0'>
              <Button type='button' disabled={busy} onClick={() => setSearchOpen(true)} className='h-10 w-full @[26rem]:flex-1'>
                <Globe className='mr-2 h-4 w-4' />
                Find from web
              </Button>
              <div className='grid grid-cols-2 gap-2 @[26rem]:flex @[26rem]:flex-1'>
                <Button
                  type='button'
                  variant='outline'
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                  className='h-10 w-full @[26rem]:flex-1'
                >
                  <Upload className='mr-2 h-4 w-4' />
                  Upload
                </Button>
                <CameraCapture
                  onCapture={(file) => void uploadFiles([file])}
                  disabled={busy}
                  trigger={
                    <Button type='button' variant='outline' disabled={busy} className='h-10 w-full @[26rem]:flex-1'>
                      <Camera className='mr-2 h-4 w-4' />
                      Camera
                    </Button>
                  }
                />
              </div>
            </div>
          </div>
        ) : (
          <div className='space-y-3'>
            <div className='grid grid-cols-2 gap-2 @[17rem]:grid-cols-3 @[30rem]:grid-cols-4 @[44rem]:grid-cols-5 @[30rem]:gap-2.5'>
              {images.map((image, index) => (
                <div
                  key={image.publicId || image.url}
                  draggable={!busy}
                  onDragStart={() => setDragIndex(index)}
                  onDragEnter={() => setOverIndex(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDragEnd={() => {
                    setDragIndex(null)
                    setOverIndex(null)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (dragIndex !== null) move(dragIndex, index)
                    setDragIndex(null)
                    setOverIndex(null)
                  }}
                  className={cn(
                    'group relative aspect-square overflow-hidden rounded-xl border bg-white transition-all dark:bg-zinc-900',
                    index === 0 ? 'border-primary/60 ring-2 ring-primary/30' : 'border-border/70',
                    dragIndex === index && 'opacity-40',
                    overIndex === index && dragIndex !== null && dragIndex !== index && 'ring-2 ring-primary',
                    !busy && 'cursor-grab active:cursor-grabbing',
                  )}
                >
                  <img
                    src={image.url}
                    alt={index === 0 ? 'Main product photo' : `Product photo ${index + 1}`}
                    loading='lazy'
                    className='h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]'
                  />

                  {index === 0 ? (
                    <Badge className='pointer-events-none absolute top-1.5 left-1.5 z-10 border-0 bg-primary px-1.5 py-0 text-[9px] font-semibold text-primary-foreground shadow-sm'>
                      MAIN
                    </Badge>
                  ) : null}

                  {/* Full view sits in its own corner on EVERY tile, same place as in the
                      web picker, so "look closer" is always one predictable tap. */}
                  <button
                    type='button'
                    title='View full size'
                    aria-label='View full size'
                    onClick={() => setLightbox(index)}
                    className='absolute top-1.5 right-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-white shadow-sm backdrop-blur-sm transition-all hover:bg-black/70 md:opacity-0 md:group-hover:opacity-100'
                  >
                    <Maximize2 className='h-3 w-3' />
                  </button>

                  {/* Star / remove. Always visible on touch (no hover there), fading in on
                      hover for pointer devices. */}
                  <div className='absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-1.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-1.5 pb-1.5 pt-5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100'>
                    {index !== 0 ? (
                      <button
                        type='button'
                        title='Make this the main photo'
                        aria-label='Make this the main photo'
                        disabled={busy}
                        onClick={() => makePrimary(index)}
                        className='flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-amber-500 disabled:opacity-50'
                      >
                        <Star className='h-3.5 w-3.5' />
                      </button>
                    ) : null}
                    <button
                      type='button'
                      title='Remove'
                      aria-label='Remove this photo'
                      disabled={busy}
                      onClick={() => removeAt(index)}
                      className='flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-destructive disabled:opacity-50'
                    >
                      <Trash2 className='h-3.5 w-3.5' />
                    </button>
                  </div>
                </div>
              ))}

              {/* In-flight uploads keep their own tiles so the grid never jumps */}
              {Array.from({ length: uploading }).map((_, i) => (
                <div
                  key={`uploading-${i}`}
                  className='flex aspect-square items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/30'
                >
                  <Loader2 className='h-5 w-5 animate-spin text-muted-foreground' />
                </div>
              ))}

              {!full && uploading === 0 ? (
                <button
                  type='button'
                  disabled={busy}
                  onClick={() => setSearchOpen(true)}
                  className='flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 text-muted-foreground transition-colors hover:border-primary/60 hover:bg-primary/[0.04] hover:text-primary disabled:opacity-50'
                >
                  <Plus className='h-5 w-5' />
                  <span className='px-1 text-[10px] font-medium leading-tight'>Add photo</span>
                </button>
              ) : null}
            </div>

            <div className='space-y-2 border-t border-border/50 pt-2.5'>
              <div className='grid grid-cols-3 gap-1.5'>
                <Button type='button' size='sm' variant='outline' disabled={busy || full} onClick={() => setSearchOpen(true)} className='h-8 px-1 text-xs @[26rem]:text-sm'>
                  <Globe className='mr-1 h-3.5 w-3.5 shrink-0' />
                  <span className='truncate'>Web</span>
                </Button>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  disabled={busy || full}
                  onClick={() => fileInputRef.current?.click()}
                  className='h-8 px-1 text-xs @[26rem]:text-sm'
                >
                  <Upload className='mr-1 h-3.5 w-3.5 shrink-0' />
                  <span className='truncate'>Upload</span>
                </Button>
                <CameraCapture
                  onCapture={(file) => void uploadFiles([file])}
                  disabled={busy || full}
                  trigger={
                    <Button type='button' size='sm' variant='outline' disabled={busy || full} className='h-8 px-1 text-xs @[26rem]:text-sm'>
                      <Camera className='mr-1 h-3.5 w-3.5 shrink-0' />
                      <span className='truncate'>Camera</span>
                    </Button>
                  }
                />
              </div>
              <p className='text-center text-[11px] text-muted-foreground'>
                {full ? `Photo limit reached (${max})` : `${remaining} more can be added · first photo is the main one`}
              </p>
            </div>
          </div>
        )}
      </div>

      <WebImageSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        context={context}
        defaultQuery={getSearchQuery?.() ?? ''}
        defaultBarcode={getBarcode?.() ?? ''}
        maxSelectable={Math.max(1, remaining)}
        onSelect={addImages}
      />

      {/* Full-size viewer */}
      <Dialog open={lightbox !== null} onOpenChange={(open) => !open && setLightbox(null)}>
        <DialogContent className='max-w-3xl gap-0 overflow-hidden p-0'>
          <DialogTitle className='sr-only'>Product photo</DialogTitle>
          {lightbox !== null && images[lightbox] ? (
            <div className='relative'>
              <div className='flex max-h-[70dvh] items-center justify-center bg-zinc-950 p-4'>
                <img
                  src={images[lightbox].url}
                  alt={`Product photo ${lightbox + 1}`}
                  className='max-h-[62dvh] w-auto max-w-full object-contain'
                />
              </div>
              {images.length > 1 ? (
                <>
                  <button
                    type='button'
                    aria-label='Previous photo'
                    onClick={() => setLightbox((i) => (i === null ? i : (i - 1 + images.length) % images.length))}
                    className='absolute top-1/2 left-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70'
                  >
                    <ChevronLeft className='h-5 w-5' />
                  </button>
                  <button
                    type='button'
                    aria-label='Next photo'
                    onClick={() => setLightbox((i) => (i === null ? i : (i + 1) % images.length))}
                    className='absolute top-1/2 right-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70'
                  >
                    <ChevronRight className='h-5 w-5' />
                  </button>
                </>
              ) : null}
              <div className='flex flex-wrap items-center justify-between gap-2 bg-background px-4 py-3 text-xs text-muted-foreground'>
                <span>
                  Photo {lightbox + 1} of {images.length}
                  {lightbox === 0 ? ' · main photo' : ''}
                </span>
                <div className='flex items-center gap-3'>
                  {images[lightbox].sourceUrl ? (
                    <a
                      href={images[lightbox].sourceUrl}
                      target='_blank'
                      rel='noreferrer noopener'
                      className='inline-flex items-center gap-1 hover:text-foreground hover:underline'
                    >
                      <ExternalLink className='h-3 w-3' />
                      Source
                    </a>
                  ) : null}
                  {lightbox !== 0 ? (
                    <button
                      type='button'
                      onClick={() => {
                        makePrimary(lightbox)
                        setLightbox(0)
                      }}
                      className='inline-flex items-center gap-1 hover:text-foreground hover:underline'
                    >
                      <Star className='h-3 w-3' />
                      Make main
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
