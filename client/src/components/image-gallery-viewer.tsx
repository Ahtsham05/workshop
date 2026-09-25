'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, Images, Package } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

export interface ViewerImage {
  url: string
  sourceUrl?: string
}

interface Props {
  images: ViewerImage[]
  /** Falls back to this single image for records saved before galleries existed. */
  fallbackUrl?: string | null
  name: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const DIMS = {
  sm: 'h-8 w-8 rounded-md',
  md: 'h-10 w-10 rounded-lg',
  lg: 'h-20 w-20 rounded-xl',
}

/**
 * Read-only counterpart to ProductImageGallery: shows the main photo, says how many
 * others there are, and opens a full-size viewer on click. Used anywhere a record's
 * photo is displayed rather than edited (the product detail header, list rows).
 */
export function ImageGalleryViewer({ images, fallbackUrl, name, size = 'lg', className }: Props) {
  const gallery = (images || []).filter((i) => i?.url)
  const all = gallery.length > 0 ? gallery : fallbackUrl ? [{ url: fallbackUrl }] : []
  const [index, setIndex] = useState<number | null>(null)

  useEffect(() => {
    if (index === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndex((i) => (i === null ? i : (i + 1) % all.length))
      if (e.key === 'ArrowLeft') setIndex((i) => (i === null ? i : (i - 1 + all.length) % all.length))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, all.length])

  if (all.length === 0) {
    return (
      <div className={cn(DIMS[size], 'flex shrink-0 items-center justify-center border bg-muted', className)}>
        <Package className={cn('text-muted-foreground', size === 'lg' ? 'h-8 w-8' : 'h-4 w-4')} aria-hidden />
      </div>
    )
  }

  return (
    <>
      <button
        type='button'
        onClick={() => setIndex(0)}
        aria-label={all.length > 1 ? `View ${all.length} photos of ${name}` : `View photo of ${name}`}
        className={cn(
          DIMS[size],
          'group relative shrink-0 overflow-hidden border bg-white transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:bg-zinc-900',
          className,
        )}
      >
        <img src={all[0].url} alt={name} loading='lazy' className='h-full w-full object-cover' />
        {all.length > 1 ? (
          <span className='absolute right-0.5 bottom-0.5 inline-flex items-center gap-0.5 rounded bg-black/65 px-1 text-[9px] font-semibold text-white backdrop-blur-sm'>
            <Images className='h-2.5 w-2.5' />
            {all.length}
          </span>
        ) : null}
      </button>

      <Dialog open={index !== null} onOpenChange={(open) => !open && setIndex(null)}>
        <DialogContent className='max-w-3xl gap-0 overflow-hidden p-0'>
          <DialogTitle className='sr-only'>{name}</DialogTitle>
          {index !== null && all[index] ? (
            <div className='relative'>
              <div className='flex max-h-[70dvh] items-center justify-center bg-zinc-950 p-4'>
                <img src={all[index].url} alt={name} className='max-h-[62dvh] w-auto max-w-full object-contain' />
              </div>
              {all.length > 1 ? (
                <>
                  <button
                    type='button'
                    aria-label='Previous photo'
                    onClick={() => setIndex((i) => (i === null ? i : (i - 1 + all.length) % all.length))}
                    className='absolute top-1/2 left-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70'
                  >
                    <ChevronLeft className='h-5 w-5' />
                  </button>
                  <button
                    type='button'
                    aria-label='Next photo'
                    onClick={() => setIndex((i) => (i === null ? i : (i + 1) % all.length))}
                    className='absolute top-1/2 right-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70'
                  >
                    <ChevronRight className='h-5 w-5' />
                  </button>
                </>
              ) : null}

              {all.length > 1 ? (
                <div className='flex gap-2 overflow-x-auto bg-background px-4 pt-3'>
                  {all.map((image, i) => (
                    <button
                      key={image.url}
                      type='button'
                      onClick={() => setIndex(i)}
                      className={cn(
                        'h-12 w-12 shrink-0 overflow-hidden rounded-md border bg-white dark:bg-zinc-900',
                        i === index ? 'border-primary ring-2 ring-primary/40' : 'border-border/70 opacity-70 hover:opacity-100',
                      )}
                    >
                      <img src={image.url} alt='' className='h-full w-full object-cover' />
                    </button>
                  ))}
                </div>
              ) : null}

              <div className='flex items-center justify-between gap-2 bg-background px-4 py-3 text-xs text-muted-foreground'>
                <span className='truncate'>
                  {name}
                  {all.length > 1 ? ` · ${index + 1} of ${all.length}` : ''}
                </span>
                {all[index].sourceUrl ? (
                  <a
                    href={all[index].sourceUrl}
                    target='_blank'
                    rel='noreferrer noopener'
                    className='inline-flex shrink-0 items-center gap-1 hover:text-foreground hover:underline'
                  >
                    <ExternalLink className='h-3 w-3' />
                    Source
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
