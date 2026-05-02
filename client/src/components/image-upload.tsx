'use client'

import React, { useCallback, useState, useRef, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/context/language-context'
import { Upload, X, ImageIcon, Loader2, Camera, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import CameraCapture from './camera-capture'
import { toast } from 'sonner'

interface ImageUploadProps {
  onImageUpload: (imageData: { url: string; publicId: string }) => void
  onImageRemove: () => void
  currentImageUrl?: string
  disabled?: boolean
  className?: string
  /** Larger drop zone and preview */
  layout?: 'default' | 'comfortable'
  /**
   * When the user types a name, we debounce and fetch a matching stock photo (Pexels → Cloudinary).
   * Only runs while there is no image yet — remove the image to fetch again for a new name.
   */
  autoSearchFromText?: string
  /**
   * Prefer this for “Find from name”: reads the latest value from the form (e.g. product name),
   * so the search never uses a stale watch value or the wrong field.
   */
  getSearchQuery?: () => string
  searchContext?: 'product' | 'category'
}

const AUTO_SEARCH_MIN_LEN = 3
const AUTO_SEARCH_DEBOUNCE_MS = 1100

export default function ImageUpload({
  onImageUpload,
  onImageRemove,
  currentImageUrl,
  disabled = false,
  className,
  layout = 'default',
  autoSearchFromText,
  getSearchQuery,
  searchContext = 'product',
}: ImageUploadProps) {
  const { t } = useLanguage()
  const [uploading, setUploading] = useState(false)
  const [stockSearchBusy, setStockSearchBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageKey, setImageKey] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fetchGeneration = useRef(0)
  const getSearchQueryRef = useRef(getSearchQuery)
  getSearchQueryRef.current = getSearchQuery

  const isComfortable = layout === 'comfortable'

  /** Prefer live form value via `getSearchQuery` so “Find from name” always uses the current title field. */
  const effectiveSearchText = useCallback(() => {
    const fn = getSearchQueryRef.current
    if (fn) {
      try {
        const fromForm = String(fn() ?? '').trim()
        if (fromForm) return fromForm
      } catch {
        /* ignore */
      }
    }
    return (autoSearchFromText ?? '').trim()
  }, [autoSearchFromText])

  const showStockPanel = Boolean(getSearchQuery) || autoSearchFromText !== undefined

  useEffect(() => {
    if (currentImageUrl) {
      setError(null)
      setImageKey((prev) => prev + 1)
    } else {
      setError(null)
      setImageKey(0)
    }
  }, [currentImageUrl])

  const resolveFetchUrl = useCallback(() => {
    const base = import.meta.env.VITE_BACKEND_URL
    const path =
      searchContext === 'category' ? 'categories/fetch-image-from-search' : 'products/fetch-image-from-search'
    return `${base}/${path}`
  }, [searchContext])

  const uploadSearchResultToForm = useCallback(
    (
      result: { url: string; publicId: string; photographer?: string },
      notify: boolean,
    ) => {
      onImageUpload({ url: result.url, publicId: result.publicId })
      if (!notify) return
      if (result.photographer) {
        toast.success(`Stock photo applied (${result.photographer} · Pexels)`)
      } else {
        toast.success('Stock photo applied')
      }
    },
    [onImageUpload],
  )

  const fetchStockPhoto = useCallback(
    async (mode: 'auto' | 'manual') => {
      const query = effectiveSearchText()
      if (query.length < 2) {
        if (mode === 'manual') {
          toast.error('Enter the product or category name above (at least 2 characters), then try again.')
        }
        return
      }

      if (/^\d{10,}$/.test(query)) {
        toast.warning(
          'That looks like a number or barcode. Enter the product title in the name field for a better photo match.',
        )
      }

      const gen = ++fetchGeneration.current
      setUploading(true)
      setStockSearchBusy(true)
      setError(null)

      try {
        const res = await fetch(resolveFetchUrl(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          },
          body: JSON.stringify({ query }),
        })

        const data = (await res.json().catch(() => ({}))) as {
          message?: string
          url?: string
          publicId?: string
          photographer?: string
        }

        if (gen !== fetchGeneration.current) return

        if (!res.ok) {
          throw new Error(data.message || 'Could not find an image')
        }
        if (!data.url || !data.publicId) {
          throw new Error('Invalid response from server')
        }

        uploadSearchResultToForm(
          {
            url: data.url,
            publicId: data.publicId,
            photographer: data.photographer,
          },
          mode === 'manual',
        )
      } catch (e) {
        if (gen !== fetchGeneration.current) return
        const msg = e instanceof Error ? e.message : 'Image search failed'
        setError(msg)
        toast.error(msg)
      } finally {
        if (gen === fetchGeneration.current) {
          setUploading(false)
          setStockSearchBusy(false)
        }
      }
    },
    [effectiveSearchText, uploadSearchResultToForm, resolveFetchUrl],
  )

  useEffect(() => {
    if (!showStockPanel || disabled) return
    if (currentImageUrl) return
    const q = effectiveSearchText()
    if (q.length < AUTO_SEARCH_MIN_LEN) return

    const id = window.setTimeout(() => {
      void fetchStockPhoto('auto')
    }, AUTO_SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(id)
  }, [
    autoSearchFromText,
    showStockPanel,
    currentImageUrl,
    disabled,
    fetchStockPhoto,
    effectiveSearchText,
  ])

  const uploadImage = async (file: File) => {
    setUploading(true)
    setStockSearchBusy(false)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('image', file)

      const uploadSlug =
        searchContext === 'category' ? 'categories/upload-image' : 'products/upload-image'

      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/${uploadSlug}`, {
        method: 'POST',
        body: formData,
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
      })

      if (!response.ok) {
        throw new Error('Upload failed')
      }

      const result = await response.json()

      if (result && result.url) {
        onImageUpload(result)
      } else {
        throw new Error('Invalid response format')
      }
    } catch {
      setError(t('image_upload_failed') || 'Image upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleFileSelect = () => {
    fileInputRef.current?.click()
  }

  const handleCameraCapture = async (file: File) => {
    await uploadImage(file)
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      await uploadImage(file)
    }
    if (event.target) {
      event.target.value = ''
    }
  }

  const handleImageLoad = () => {
    setError(null)
  }

  const handleImageError = () => {
    setError(t('image_load_failed') || 'Failed to load image')
  }

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0]
      if (file) {
        await uploadImage(file)
      }
    },
    [onImageUpload],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp'],
    },
    maxFiles: 1,
    maxSize: 5 * 1024 * 1024,
    disabled: disabled || uploading,
  })

  const handleRemoveImage = () => {
    setError(null)
    onImageRemove()
  }

  const previewHeight = isComfortable ? 280 : 192

  if (currentImageUrl) {
    return (
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl border border-border/80 bg-card shadow-md ring-1 ring-black/[0.04] dark:ring-white/[0.06]',
          className,
        )}
      >
        <div className='p-2 sm:p-3'>
          <div className='group relative overflow-hidden rounded-xl'>
            <img
              key={imageKey}
              src={currentImageUrl}
              alt={t('product_image') || 'Product image'}
              onLoad={handleImageLoad}
              onError={handleImageError}
              className='block w-full rounded-xl border border-border/60 bg-muted object-cover'
              style={{
                height: previewHeight,
                minHeight: previewHeight,
              }}
            />

            {error ? (
              <div className='absolute inset-0 flex items-center justify-center rounded-xl bg-destructive/10'>
                <p className='px-4 text-center text-sm text-destructive'>
                  {error}
                  <br />
                  <button
                    type='button'
                    onClick={() => {
                      setError(null)
                      setImageKey((prev) => prev + 1)
                    }}
                    className='mt-1 text-primary underline'
                  >
                    Retry
                  </button>
                </p>
              </div>
            ) : null}

            <div className='absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 transition-colors group-hover:bg-black/30'>
              <Button
                type='button'
                variant='destructive'
                size='sm'
                className='opacity-0 shadow-lg transition-opacity group-hover:opacity-100'
                onClick={handleRemoveImage}
                disabled={disabled}
              >
                <X className='mr-2 h-4 w-4' />
                {t('remove_image') || 'Remove'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const searchLen = effectiveSearchText().length
  const canHintSearch =
    showStockPanel && searchLen > 0 && searchLen < AUTO_SEARCH_MIN_LEN

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-b from-card to-muted/20 shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]',
        className,
      )}
    >
      <div className={cn('p-4 sm:p-5', isComfortable && 'sm:p-6')}>
        <input
          ref={fileInputRef}
          type='file'
          accept='image/*'
          onChange={handleFileChange}
          className='hidden'
        />

        <div className='space-y-5'>
          {showStockPanel ? (
            <div className='flex flex-col gap-4 sm:flex-row sm:items-stretch sm:justify-between sm:gap-6'>
              <div className='flex min-w-0 flex-1 gap-3 sm:gap-4'>
                <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-inner'>
                  <Sparkles className='h-5 w-5' aria-hidden />
                </div>
                <div className='min-w-0 flex-1 space-y-1.5'>
                  <p className='text-sm font-semibold leading-tight text-foreground'>
                    Suggested image from name
                  </p>
                  <p className='text-xs leading-relaxed text-muted-foreground'>
                    Uses the{' '}
                    <span className='font-medium text-foreground/90'>
                      {searchContext === 'category' ? 'category name' : 'product name'}
                    </span>{' '}
                    field above (not the barcode). We search a stock library, save the match to your library,
                    and show it below. Replace it with your own photo whenever you like.
                  </p>
                  {canHintSearch ? (
                    <p className='text-xs font-medium text-amber-600 dark:text-amber-500'>
                      Type {AUTO_SEARCH_MIN_LEN - searchLen} more character
                      {AUTO_SEARCH_MIN_LEN - searchLen === 1 ? '' : 's'} in the name for auto-suggest, or
                      press the button once the name is ready.
                    </p>
                  ) : null}
                </div>
              </div>
              <div className='flex shrink-0 flex-col justify-center sm:max-w-[12rem]'>
                <Button
                  type='button'
                  size='default'
                  variant='default'
                  className='h-11 w-full gap-2 shadow-sm sm:w-auto sm:min-w-[11rem]'
                  disabled={disabled || uploading || searchLen < 2}
                  onClick={() => void fetchStockPhoto('manual')}
                >
                  {uploading && stockSearchBusy ? (
                    <Loader2 className='h-4 w-4 shrink-0 animate-spin' />
                  ) : (
                    <Sparkles className='h-4 w-4 shrink-0' />
                  )}
                  Find from name
                </Button>
              </div>
            </div>
          ) : null}

          {showStockPanel ? (
            <div className='relative'>
              <div className='absolute inset-x-0 top-1/2 border-t border-border/60' aria-hidden />
              <span className='relative mx-auto block w-fit bg-gradient-to-b from-card to-muted/20 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground'>
                Or upload
              </span>
            </div>
          ) : null}

          <div
            {...getRootProps()}
            className={cn(
              'cursor-pointer rounded-xl border-2 border-dashed text-center transition-all duration-200',
              isComfortable ? 'min-h-[12rem] p-6 sm:min-h-[14rem] sm:p-8' : 'min-h-[10rem] p-4 sm:min-h-[11rem] sm:p-6',
              isDragActive ? 'border-primary bg-primary/[0.07] shadow-inner' : 'border-muted-foreground/30 bg-muted/20',
              disabled || uploading ? 'cursor-not-allowed opacity-50' : 'hover:border-primary/60 hover:bg-primary/[0.04]',
            )}
          >
            <input {...getInputProps()} />

            {uploading ? (
              <div className='flex flex-col items-center gap-3'>
                <Loader2 className={cn('animate-spin text-primary', isComfortable ? 'h-10 w-10' : 'h-8 w-8')} />
                <p className='text-sm font-medium text-muted-foreground'>
                  {stockSearchBusy
                    ? 'Searching for a matching photo…'
                    : t('uploading_image') || 'Uploading image…'}
                </p>
              </div>
            ) : (
              <div className='flex flex-col items-center gap-3'>
                {isDragActive ? (
                  <Upload className={cn('text-primary', isComfortable ? 'h-12 w-12' : 'h-8 w-8')} />
                ) : (
                  <ImageIcon className={cn('text-muted-foreground', isComfortable ? 'h-12 w-12' : 'h-8 w-8')} />
                )}

                <div className='text-center'>
                  <p className={cn('font-medium', isComfortable ? 'text-sm sm:text-base' : 'text-xs sm:text-sm')}>
                    {isDragActive
                      ? t('drop_image_here') || 'Drop image here'
                      : t('drag_drop_image') || 'Drag & drop an image here'}
                  </p>
                  <p className='mt-2 text-xs text-muted-foreground'>
                    {t('or_use_options_below') || 'or use the options below'} — PNG, JPG, WebP, GIF up to 5MB
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
            <Button
              type='button'
              variant='outline'
              size={isComfortable ? 'default' : 'sm'}
              onClick={(e) => {
                e.stopPropagation()
                handleFileSelect()
              }}
              disabled={disabled || uploading}
              className='h-11 w-full border-border/80 bg-background/80'
            >
              <Upload className='mr-2 h-4 w-4' />
              {t('select_file') || 'Select file'}
            </Button>
            <CameraCapture
              onCapture={handleCameraCapture}
              disabled={disabled || uploading}
              trigger={
                <Button
                  type='button'
                  variant='outline'
                  size={isComfortable ? 'default' : 'sm'}
                  disabled={disabled || uploading}
                  className='h-11 w-full border-border/80 bg-background/80'
                >
                  <Camera className='mr-2 h-4 w-4' />
                  {t('take_photo') || 'Take photo'}
                </Button>
              }
            />
          </div>
        </div>

        {error ? (
          <p className='mt-4 text-center text-sm font-medium text-destructive'>{error}</p>
        ) : null}
      </div>
    </div>
  )
}
