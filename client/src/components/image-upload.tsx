'use client'

import React, { useCallback, useState, useRef, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/context/language-context'
import { Upload, X, ImageIcon, Loader2, Camera, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import CameraCapture from './camera-capture'

interface ImageUploadProps {
  onImageUpload: (imageData: { url: string; publicId: string }) => void
  onImageRemove: () => void
  currentImageUrl?: string
  disabled?: boolean
  className?: string
  /** Larger drop zone and preview */
  layout?: 'default' | 'comfortable'
  /**
   * When set together with getSearchQuery, shows the top banner for products/categories:
   * manual “Find from name” (Pexels via API) plus device upload. No automatic fetch.
   */
  autoSearchFromText?: string
  /** Enables the banner when provided; used with “Find from name” for the search query. */
  getSearchQuery?: () => string
  searchContext?: 'product' | 'category'
  /** When set, uploads to this path under VITE_BACKEND_URL (e.g. customers/upload-image). */
  uploadSlug?: string
  /** Alt text for the preview image */
  previewAlt?: string
}

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
  uploadSlug,
  previewAlt,
}: ImageUploadProps) {
  const { t } = useLanguage()
  const [uploading, setUploading] = useState(false)
  const [stockSearching, setStockSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageKey, setImageKey] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isComfortable = layout === 'comfortable'

  const showLocalPhotoBanner = Boolean(getSearchQuery) || autoSearchFromText !== undefined

  const fetchStockImageFromName = useCallback(async () => {
    const fromGetter = getSearchQuery?.()
    const query = (fromGetter ?? autoSearchFromText ?? '').trim()
    if (query.length < 2) {
      setError(t('stock_search_need_name'))
      return
    }

    setStockSearching(true)
    setError(null)

    try {
      const slug =
        searchContext === 'category'
          ? 'categories/fetch-image-from-search'
          : 'products/fetch-image-from-search'

      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/${slug}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({ query }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        const msg =
          typeof data.message === 'string' && data.message.trim()
            ? data.message
            : t('stock_search_failed')
        throw new Error(msg)
      }

      if (data?.url && data?.publicId) {
        onImageUpload({ url: data.url, publicId: data.publicId })
      } else {
        throw new Error(t('stock_search_failed'))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('stock_search_failed'))
    } finally {
      setStockSearching(false)
    }
  }, [
    autoSearchFromText,
    getSearchQuery,
    onImageUpload,
    searchContext,
    t,
  ])

  useEffect(() => {
    if (currentImageUrl) {
      setError(null)
      setImageKey((prev) => prev + 1)
    } else {
      setError(null)
      setImageKey(0)
    }
  }, [currentImageUrl])

  const uploadImage = useCallback(
    async (file: File) => {
      setUploading(true)
      setError(null)

      try {
        const formData = new FormData()
        formData.append('image', file)

        const slug =
          uploadSlug ??
          (searchContext === 'category' ? 'categories/upload-image' : 'products/upload-image')

        const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/${slug}`, {
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
    },
    [uploadSlug, searchContext, t, onImageUpload],
  )

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
    [uploadImage],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp'],
    },
    maxFiles: 1,
    maxSize: 5 * 1024 * 1024,
    disabled: disabled || uploading || stockSearching,
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
              alt={(previewAlt ?? t('product_image')) || 'Product image'}
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
                    {t('retry') || 'Retry'}
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
          {showLocalPhotoBanner ? (
            <div className='flex flex-wrap items-center gap-3'>
              <Button
                type='button'
                size='default'
                variant='outline'
                className='h-11 gap-2 shadow-sm sm:min-w-[11rem]'
                disabled={disabled || uploading || stockSearching}
                onClick={(e) => {
                  e.stopPropagation()
                  void fetchStockImageFromName()
                }}
              >
                {stockSearching ? (
                  <Loader2 className='h-4 w-4 shrink-0 animate-spin' />
                ) : (
                  <Sparkles className='h-4 w-4 shrink-0' />
                )}
                {t('find_image_from_name')}
              </Button>
            </div>
          ) : null}

          {showLocalPhotoBanner ? (
            <div className='relative'>
              <div className='absolute inset-x-0 top-1/2 border-t border-border/60' aria-hidden />
              <span className='relative mx-auto block w-fit bg-gradient-to-b from-card to-muted/20 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground'>
                {t('or_upload')}
              </span>
            </div>
          ) : null}

          <div
            {...getRootProps()}
            className={cn(
              'cursor-pointer rounded-xl border-2 border-dashed text-center transition-all duration-200',
              isComfortable ? 'min-h-[12rem] p-6 sm:min-h-[14rem] sm:p-8' : 'min-h-[10rem] p-4 sm:min-h-[11rem] sm:p-6',
              isDragActive ? 'border-primary bg-primary/[0.07] shadow-inner' : 'border-muted-foreground/30 bg-muted/20',
              disabled || uploading || stockSearching ? 'cursor-not-allowed opacity-50' : 'hover:border-primary/60 hover:bg-primary/[0.04]',
            )}
          >
            <input {...getInputProps()} />

            {uploading || stockSearching ? (
              <div className='flex flex-col items-center gap-3'>
                <Loader2 className={cn('animate-spin text-primary', isComfortable ? 'h-10 w-10' : 'h-8 w-8')} />
                <p className='text-sm font-medium text-muted-foreground'>
                  {stockSearching
                    ? t('searching_stock_photo')
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
              disabled={disabled || uploading || stockSearching}
              className='h-11 w-full border-border/80 bg-background/80'
            >
              <Upload className='mr-2 h-4 w-4' />
              {t('select_file') || 'Select file'}
            </Button>
            <CameraCapture
              onCapture={handleCameraCapture}
              disabled={disabled || uploading || stockSearching}
              trigger={
                <Button
                  type='button'
                  variant='outline'
                  size={isComfortable ? 'default' : 'sm'}
                  disabled={disabled || uploading || stockSearching}
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
