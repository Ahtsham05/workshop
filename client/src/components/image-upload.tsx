'use client'

import React, { useCallback, useState, useRef, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/context/language-context'
import { Upload, X, ImageIcon, Loader2, Camera, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ImageSearchContext } from '@/stores/imageSearch.api'
import CameraCapture from './camera-capture'
import WebImageSearchDialog from './web-image-search-dialog'

interface ImageUploadProps {
  onImageUpload: (imageData: { url: string; publicId: string }) => void
  onImageRemove: () => void
  currentImageUrl?: string
  disabled?: boolean
  className?: string
  /** 'comfortable' = larger drop zone and preview. 'compact' = smaller, for tight grids (e.g. a 3-up ID photo row) where the dialog must fit without scrolling. */
  layout?: 'default' | 'comfortable' | 'compact'
  /**
   * When set (or getSearchQuery is), the empty state becomes the same card the product
   * photo gallery uses: Find from web, Upload and Camera. Also the fallback search query.
   */
  autoSearchFromText?: string
  /** Read at click time to prefill the web picker's search. */
  getSearchQuery?: () => string
  searchContext?: 'product' | 'category' | 'subcategory' | 'brand'
  /** Optional code to include in the web search — unlocks the exact-match providers. */
  getBarcode?: () => string
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
  getBarcode,
  uploadSlug,
  previewAlt,
}: ImageUploadProps) {
  const { t } = useLanguage()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageKey, setImageKey] = useState(0)
  const [webSearchOpen, setWebSearchOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isComfortable = layout === 'comfortable'
  const isCompact = layout === 'compact'

  const showLocalPhotoBanner = Boolean(getSearchQuery) || autoSearchFromText !== undefined

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
          (searchContext === 'category'
            ? 'categories/upload-image'
            : searchContext === 'subcategory'
              ? 'sub-categories/upload-image'
              : 'products/upload-image')

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

  const { getRootProps, getInputProps, isDragActive, open: openFilePicker } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp'],
    },
    maxFiles: 1,
    maxSize: 5 * 1024 * 1024,
    disabled: disabled || uploading,
    // The product-style card has its own Upload button; a click anywhere else on it
    // shouldn't pop the file picker.
    noClick: showLocalPhotoBanner,
    noKeyboard: showLocalPhotoBanner,
  })

  const handleRemoveImage = () => {
    setError(null)
    onImageRemove()
  }

  const busy = disabled || uploading
  const emptyTitle =
    searchContext === 'brand'
      ? 'Add a logo for this brand'
      : searchContext === 'category'
        ? 'Add an image for this category'
        : searchContext === 'subcategory'
          ? 'Add an image for this sub-category'
          : 'Add a photo'

  const webSearchDialog = (
    <WebImageSearchDialog
      open={webSearchOpen}
      onOpenChange={setWebSearchOpen}
      context={searchContext as ImageSearchContext}
      defaultQuery={(getSearchQuery?.() ?? autoSearchFromText ?? '').trim()}
      defaultBarcode={getBarcode?.() ?? ''}
      maxSelectable={1}
      onSelect={(images) => {
        const picked = images[0]
        if (picked?.url) onImageUpload({ url: picked.url, publicId: picked.publicId ?? '' })
      }}
    />
  )

  // Compact banner (brand logo): a small thumbnail with the actions beside it, so the
  // dialog around it fits without scrolling. Handles both the empty and the filled state.
  if (showLocalPhotoBanner && isCompact) {
    return (
      <div
        {...getRootProps()}
        className={cn(
          'flex min-w-0 items-center gap-3 rounded-xl border border-border/80 bg-gradient-to-b from-card to-muted/20 p-2.5 shadow-sm ring-1 ring-black/[0.04] transition-colors dark:ring-white/[0.06]',
          isDragActive && 'border-primary bg-primary/[0.05] ring-primary/30',
          className,
        )}
      >
        <input {...getInputProps()} />
        <div className='group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border/70 bg-white dark:bg-zinc-900'>
          {uploading ? (
            <span className='flex h-full w-full items-center justify-center'>
              <Loader2 className='h-5 w-5 animate-spin text-primary' />
            </span>
          ) : currentImageUrl ? (
            <>
              <img
                key={imageKey}
                src={currentImageUrl}
                alt={(previewAlt ?? t('product_image')) || 'Image'}
                onLoad={handleImageLoad}
                onError={handleImageError}
                className='h-full w-full object-contain p-1'
              />
              <button
                type='button'
                title={t('remove_image') || 'Remove'}
                aria-label={t('remove_image') || 'Remove'}
                disabled={disabled}
                onClick={handleRemoveImage}
                className='absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white hover:bg-destructive'
              >
                <X className='h-3 w-3' />
              </button>
            </>
          ) : (
            <span className='flex h-full w-full items-center justify-center bg-muted text-muted-foreground'>
              {isDragActive ? <Upload className='h-6 w-6 text-primary' /> : <ImageIcon className='h-6 w-6' />}
            </span>
          )}
        </div>
        <div className='min-w-0 flex-1 space-y-1.5'>
          <div className='flex flex-wrap gap-1.5'>
            <Button type='button' size='sm' disabled={busy} onClick={() => setWebSearchOpen(true)} className='h-8'>
              <Globe className='mr-1.5 h-3.5 w-3.5' />
              {t('find_image_from_web') || 'Find from web'}
            </Button>
            <Button type='button' size='sm' variant='outline' disabled={busy} onClick={() => openFilePicker()} className='h-8'>
              <Upload className='mr-1.5 h-3.5 w-3.5' />
              Upload
            </Button>
            <CameraCapture
              onCapture={handleCameraCapture}
              disabled={busy}
              trigger={
                <Button type='button' size='sm' variant='outline' disabled={busy} className='h-8'>
                  <Camera className='mr-1.5 h-3.5 w-3.5' />
                  Camera
                </Button>
              }
            />
          </div>
          <p className={cn('text-[11px] leading-snug', error ? 'font-medium text-destructive' : 'text-muted-foreground')}>
            {error ??
              (uploading
                ? t('uploading_image') || 'Uploading image…'
                : isDragActive
                  ? t('drop_image_here') || 'Drop image here'
                  : 'Drag & drop works too — PNG, JPG, WebP, GIF up to 5MB')}
          </p>
        </div>
        {webSearchDialog}
      </div>
    )
  }

  const previewHeight = isComfortable ? 280 : isCompact ? 110 : 192

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

  // Same empty state as the product photo gallery (product-image-gallery.tsx), so every
  // "add an image" box in the catalog looks and behaves alike.
  if (showLocalPhotoBanner) {
    return (
      <div
        {...getRootProps()}
        className={cn(
          '@container rounded-2xl border border-border/80 bg-gradient-to-b from-card to-muted/20 p-3 shadow-sm ring-1 ring-black/[0.04] transition-colors dark:ring-white/[0.06]',
          isDragActive && 'border-primary bg-primary/[0.05] ring-primary/30',
          className,
        )}
      >
        <input {...getInputProps()} />
        <div className='flex flex-col items-center gap-4 px-3 py-6 text-center sm:py-8'>
          <span className='flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground'>
            {uploading ? (
              <Loader2 className='h-7 w-7 animate-spin text-primary' />
            ) : isDragActive ? (
              <Upload className='h-7 w-7 text-primary' />
            ) : (
              <ImageIcon className='h-7 w-7' />
            )}
          </span>
          <div>
            <p className='text-sm font-medium'>
              {uploading
                ? t('uploading_image') || 'Uploading image…'
                : isDragActive
                  ? t('drop_image_here') || 'Drop image here'
                  : emptyTitle}
            </p>
            <p className='mt-1 text-xs text-muted-foreground'>
              Search the web by name, upload from this device, or take a photo.
              <br className='hidden sm:block' /> Drag & drop works too — PNG, JPG, WebP, GIF up to 5MB.
            </p>
          </div>
          <div className='w-full max-w-sm space-y-2 @[26rem]:flex @[26rem]:max-w-lg @[26rem]:gap-2 @[26rem]:space-y-0'>
            <Button type='button' disabled={busy} onClick={() => setWebSearchOpen(true)} className='h-10 w-full @[26rem]:flex-1'>
              <Globe className='mr-2 h-4 w-4' />
              {t('find_image_from_web') || 'Find from web'}
            </Button>
            <div className='grid grid-cols-2 gap-2 @[26rem]:flex @[26rem]:flex-1'>
              <Button
                type='button'
                variant='outline'
                disabled={busy}
                onClick={() => openFilePicker()}
                className='h-10 w-full @[26rem]:flex-1'
              >
                <Upload className='mr-2 h-4 w-4' />
                Upload
              </Button>
              <CameraCapture
                onCapture={handleCameraCapture}
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
          {error ? <p className='text-center text-sm font-medium text-destructive'>{error}</p> : null}
        </div>
        {webSearchDialog}
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
      <div className={cn('p-4 sm:p-5', isComfortable && 'sm:p-6', isCompact && 'p-2.5 sm:p-2.5')}>
        <input
          ref={fileInputRef}
          type='file'
          accept='image/*'
          onChange={handleFileChange}
          className='hidden'
        />

        <div className={isCompact ? 'space-y-2' : 'space-y-5'}>
          <div
            {...getRootProps()}
            className={cn(
              'cursor-pointer rounded-xl border-2 border-dashed text-center transition-all duration-200',
              isComfortable
                ? 'min-h-[12rem] p-6 sm:min-h-[14rem] sm:p-8'
                : isCompact
                  ? 'min-h-[4.5rem] p-2'
                  : 'min-h-[10rem] p-4 sm:min-h-[11rem] sm:p-6',
              isDragActive ? 'border-primary bg-primary/[0.07] shadow-inner' : 'border-muted-foreground/30 bg-muted/20',
              disabled || uploading ? 'cursor-not-allowed opacity-50' : 'hover:border-primary/60 hover:bg-primary/[0.04]',
            )}
          >
            <input {...getInputProps()} />

            {uploading ? (
              <div className={cn('flex flex-col items-center', isCompact ? 'gap-1.5' : 'gap-3')}>
                <Loader2 className={cn('animate-spin text-primary', isComfortable ? 'h-10 w-10' : isCompact ? 'h-5 w-5' : 'h-8 w-8')} />
                <p className={cn('font-medium text-muted-foreground', isCompact ? 'text-xs' : 'text-sm')}>
                  {t('uploading_image') || 'Uploading image…'}
                </p>
              </div>
            ) : (
              <div className={cn('flex flex-col items-center', isCompact ? 'gap-1' : 'gap-3')}>
                {isDragActive ? (
                  <Upload className={cn('text-primary', isComfortable ? 'h-12 w-12' : isCompact ? 'h-5 w-5' : 'h-8 w-8')} />
                ) : (
                  <ImageIcon className={cn('text-muted-foreground', isComfortable ? 'h-12 w-12' : isCompact ? 'h-5 w-5' : 'h-8 w-8')} />
                )}

                <div className='text-center'>
                  <p className={cn('font-medium', isComfortable ? 'text-sm sm:text-base' : isCompact ? 'text-xs' : 'text-xs sm:text-sm')}>
                    {isDragActive
                      ? t('drop_image_here') || 'Drop image here'
                      : isCompact
                        ? t('drag_drop_or_browse') || 'Drag & drop or browse'
                        : t('drag_drop_image') || 'Drag & drop an image here'}
                  </p>
                  {!isCompact ? (
                    <p className='mt-2 text-xs text-muted-foreground'>
                      {t('or_use_options_below') || 'or use the options below'} — PNG, JPG, WebP, GIF up to 5MB
                    </p>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          <div className={isCompact ? 'flex gap-1.5' : 'grid grid-cols-1 gap-2 sm:grid-cols-2'}>
            <Button
              type='button'
              variant='outline'
              size={isComfortable ? 'default' : 'sm'}
              onClick={(e) => {
                e.stopPropagation()
                handleFileSelect()
              }}
              disabled={disabled || uploading}
              className={isCompact ? 'h-7 flex-1 border-border/80 bg-background/80 px-2 text-xs' : 'h-11 w-full border-border/80 bg-background/80'}
            >
              <Upload className={isCompact ? 'mr-1 h-3.5 w-3.5' : 'mr-2 h-4 w-4'} />
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
                  className={isCompact ? 'h-7 flex-1 border-border/80 bg-background/80 px-2 text-xs' : 'h-11 w-full border-border/80 bg-background/80'}
                >
                  <Camera className={isCompact ? 'mr-1 h-3.5 w-3.5' : 'mr-2 h-4 w-4'} />
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

      {webSearchDialog}
    </div>
  )
}
