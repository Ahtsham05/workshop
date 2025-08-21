'use client'

import React, { useCallback, useState, useRef, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useLanguage } from '@/context/language-context'
import { Upload, X, ImageIcon, Loader2, Camera } from 'lucide-react'
import { cn } from '@/lib/utils'
// import { SimpleImageDisplay } from './simple-image-display'
import CameraCapture from './camera-capture'

interface ImageUploadProps {
  onImageUpload: (imageData: { url: string; publicId: string }) => void
  onImageRemove: () => void
  currentImageUrl?: string
  disabled?: boolean
  className?: string
}

export default function ImageUpload({
  onImageUpload,
  onImageRemove,
  currentImageUrl,
  disabled = false,
  className,
}: ImageUploadProps) {
  const { t } = useLanguage()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageLoading, setImageLoading] = useState(false)
  const [imageKey, setImageKey] = useState(0) // Force re-render
  const fileInputRef = useRef<HTMLInputElement>(null)
  console.log('imageLoading', imageLoading)
  // Reset image loading state when URL changes
  useEffect(() => {
    if (currentImageUrl) {
      setImageLoading(true)
      setError(null)
      setImageKey(prev => prev + 1) // Force image re-render
    } else {
      // Reset state when image is removed
      setImageLoading(false)
      setError(null)
      setImageKey(0)
    }
  }, [currentImageUrl])

  // Debug: Monitor currentImageUrl changes
  useEffect(() => {
    console.log('🔄 currentImageUrl prop changed:', currentImageUrl)
  }, [currentImageUrl])

  const uploadImage = async (file: File) => {
    setUploading(true)
    setError(null)
    
    try {
      const formData = new FormData()
      formData.append('image', file)

      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/products/upload-image`, {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
      })

      if (!response.ok) {
        throw new Error('Upload failed')
      }

      const result = await response.json()
      console.log('Upload result:', result) // Debug log
      
      // Ensure we have the correct URL format
      if (result && result.url) {
        onImageUpload(result)
      } else {
        throw new Error('Invalid response format')
      }
    } catch (error) {
      console.error('Upload error:', error)
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
    // Reset the input value to allow selecting the same file again
    if (event.target) {
      event.target.value = ''
    }
  }

  const handleImageLoad = () => {
    console.log('Image load handler called')
    setImageLoading(false)
    setError(null) // Clear any previous errors
  }

  const handleImageError = () => {
    console.log('Image error handler called')
    setImageLoading(false)
    setError(t('image_load_failed') || 'Failed to load image')
  }

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0]
      if (file) {
        await uploadImage(file)
      }
    },
    [onImageUpload]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp']
    },
    maxFiles: 1,
    maxSize: 5 * 1024 * 1024, // 5MB
    disabled: disabled || uploading,
  })

  const handleRemoveImage = () => {
    console.log('🗑️ handleRemoveImage called')
    console.log('   - currentImageUrl before:', currentImageUrl)
    console.log('   - calling onImageRemove()...')
    setError(null)
    setImageLoading(false)
    onImageRemove()
    console.log('   - onImageRemove() completed')
    
    // Force a slight delay to ensure form state updates
    setTimeout(() => {
      console.log('   - currentImageUrl after timeout:', currentImageUrl)
    }, 100)
  }

  // Process Cloudinary URL to ensure it loads correctly
  const processImageUrl = (url: string) => {
    if (!url) return url
    
    // If it's a Cloudinary URL, add transformation parameters for better loading
    if (url.includes('cloudinary.com')) {
      // Add auto format and quality parameters
      const urlParts = url.split('/upload/')
      if (urlParts.length === 2) {
        return `${urlParts[0]}/upload/f_auto,q_auto,w_400,h_300,c_fill/${urlParts[1]}`
      }
    }
    
    return url
  }

  console.log('ImageUpload conditional check: currentImageUrl =', currentImageUrl, 'type:', typeof currentImageUrl)
  
  if (currentImageUrl) {
    console.log('ImageUpload rendering with image, currentImageUrl:', currentImageUrl)
    const processedUrl = processImageUrl(currentImageUrl)
    console.log('Original URL:', currentImageUrl)
    console.log('Processed URL:', processedUrl)
    
    return (
      <Card className={cn("relative py-0", className)}>
        <CardContent className="p-2">
          <div className="relative group">
            {/* Remove button - always visible on top right */}
            {/* <Button
              type="button"
              variant="destructive"
              size="sm"
              className="absolute top-2 right-2 z-10 h-8 w-8 p-0 rounded-full shadow-lg"
              onClick={handleRemoveImage}
              disabled={disabled}
            >
              <X className="h-4 w-4" />
            </Button> */}
            
            <img
              key={imageKey}
              src={currentImageUrl}
              alt={t('product_image') || 'Product image'}
              onLoad={() => {
                console.log('Image loaded successfully:', currentImageUrl)
                handleImageLoad()
              }}
              onError={(e) => {
                console.error('Image failed to load:', currentImageUrl, e)
                handleImageError()
              }}
              style={{
                width: '100%',
                height: '192px',
                objectFit: 'cover',
                borderRadius: '8px',
                backgroundColor: '#f9fafb',
                border: '1px solid #e5e7eb',
                display: 'block'
              }}
            />
            
            {error && (
              <div className="absolute inset-0 bg-red-100 rounded-lg flex items-center justify-center">
                <p className="text-sm text-red-600 text-center px-4">
                  {error}
                  <br />
                  <button 
                    onClick={() => {
                      setError(null)
                      setImageKey(prev => prev + 1)
                    }}
                    className="text-blue-600 underline mt-1"
                  >
                    Retry
                  </button>
                </p>
              </div>
            )}
            
            <div className="absolute inset-0  bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 rounded-lg flex items-center justify-center">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                onClick={handleRemoveImage}
                disabled={disabled}
              >
                <X className="h-4 w-4 mr-2" />
                {t('remove_image') || 'Remove'}
              </Button>
            </div>
          </div>
          
          {/* Debug info - remove in production */}
          {/* <div className="mt-2 text-xs text-gray-500 break-all">
            Original: {currentImageUrl}
            <br />
            <a 
              href={currentImageUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 underline"
            >
              Test Original URL
            </a>
            {' | '}
            <a 
              href={processedUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 underline"
            >
              Test Processed URL
            </a>
          </div> */}
          
          {/* Backup test component for comparison */}
          {/* <div className="mt-4">
            <SimpleImageDisplay imageUrl={processedUrl} />
          </div> */}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn("border-dashed", className)}>
      <CardContent className="p-4">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
        
        <div className="space-y-4">
          {/* Drag and drop area */}
          <div
            {...getRootProps()}
            className={cn(
              "border-2 border-dashed rounded-lg p-2 sm:p-6 text-center cursor-pointer transition-colors",
              isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25",
              disabled || uploading ? "cursor-not-allowed opacity-50" : "hover:border-primary hover:bg-primary/5"
            )}
          >
            <input {...getInputProps()} />
            
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  {t('uploading_image') || 'Uploading image...'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                {isDragActive ? (
                  <Upload className="h-8 w-8 text-primary" />
                ) : (
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                )}
                
                <div className="text-center">
                  <p className="text-xs sm:text-sm font-medium">
                    {isDragActive
                      ? t('drop_image_here') || 'Drop image here'
                      : t('drag_drop_image') || 'Drag & drop an image here'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-3">
                    {t('or_use_options_below') || 'or use the options below'} (PNG, JPG, GIF up to 5MB)
                  </p>
                </div>
              </div>
            )}
          </div>
          
          {/* Upload options - outside dropzone */}
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
            <div>
              <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                handleFileSelect()
              }}
              disabled={disabled || uploading}
              className="flex-1 w-full text-xs sm:text-sm"
            >
              <Upload className="h-4 w-4 mr-2" />
              {t('select_file') || 'Select File'}
            </Button>
            </div>
            <CameraCapture
              onCapture={handleCameraCapture}
              disabled={disabled || uploading}
              trigger={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || uploading}
                  className="flex-1 w-full text-xs sm:text-sm"
                >
                  <Camera className="h-4 w-4 mr-2" />
                  {t('take_photo') || 'Take Photo'}
                </Button>
              }
            />
          </div>
        </div>
        
        {error && (
          <p className="text-sm text-destructive mt-2 text-center">{error}</p>
        )}
      </CardContent>
    </Card>
  )
}
