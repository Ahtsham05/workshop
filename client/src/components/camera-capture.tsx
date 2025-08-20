'use client'

import React, { useRef, useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Camera, X, RotateCcw, Loader2 } from 'lucide-react'
import { useLanguage } from '@/context/language-context'

interface CameraCaptureProps {
  onCapture: (file: File) => void
  trigger: React.ReactNode
  disabled?: boolean
}

export default function CameraCapture({ onCapture, trigger }: CameraCaptureProps) {
  const { t } = useLanguage()
  const [isOpen, setIsOpen] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      setStream(null)
    }
    setVideoReady(false)
    setIsLoading(false)
  }, [stream])

  const startCamera = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      setVideoReady(false)
      
      // Stop existing stream first
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
        setStream(null)
      }

      // Check camera API support
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera not supported in this browser')
      }

      console.log('🎥 Starting camera with facingMode:', facingMode)

      // Progressive constraint strategy
      const constraints = [
        // Try exact facingMode first
        {
          video: {
            facingMode: { exact: facingMode },
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30 }
          }
        },
        // Fallback to ideal facingMode
        {
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        },
        // Final fallback - any camera
        { video: true }
      ]

      let mediaStream: MediaStream | null = null
      
      for (const constraint of constraints) {
        try {
          console.log('Trying constraint:', constraint)
          mediaStream = await navigator.mediaDevices.getUserMedia(constraint)
          console.log('✅ Camera stream obtained with constraint:', constraint)
          break
        } catch (err) {
          console.log('❌ Constraint failed:', constraint, err)
          continue
        }
      }

      if (!mediaStream) {
        throw new Error('Failed to access camera with all constraints')
      }

      setStream(mediaStream)

      // Setup video element
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
        
        // Wait for video to be ready
        const videoElement = videoRef.current
        
        await new Promise<void>((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('Video loading timeout'))
          }, 10000) // 10 second timeout

          videoElement.onloadedmetadata = () => {
            console.log('📹 Video metadata loaded')
            clearTimeout(timeoutId)
            
            videoElement.play()
              .then(() => {
                console.log('▶️ Video playing')
                setVideoReady(true)
                setIsLoading(false)
                resolve()
              })
              .catch(reject)
          }

          videoElement.onerror = (e) => {
            console.error('❌ Video error:', e)
            clearTimeout(timeoutId)
            reject(new Error('Video failed to load'))
          }
        })
      }

    } catch (err) {
      console.error('❌ Camera error:', err)
      setIsLoading(false)
      
      // Stop stream on error
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
        setStream(null)
      }
      
      let errorMessage = 'Failed to access camera. Please check permissions.'
      
      if (err instanceof Error) {
        switch (err.name) {
          case 'NotAllowedError':
            errorMessage = 'Camera access denied. Please allow camera permissions and try again.'
            break
          case 'NotFoundError':
            errorMessage = 'No camera found on this device.'
            break
          case 'NotReadableError':
            errorMessage = 'Camera is being used by another application.'
            break
          case 'OverconstrainedError':
            errorMessage = 'Camera constraints not supported. Please try again.'
            break
          default:
            errorMessage = err.message || errorMessage
        }
      }
      
      setError(errorMessage)
    }
  }, [facingMode, stream])

  const handleOpen = async () => {
    setIsOpen(true)
    setError(null)
    
    // Check permissions first
    try {
      const permissions = await navigator.permissions.query({ name: 'camera' as PermissionName })
      console.log('📋 Camera permission:', permissions.state)
      
      if (permissions.state === 'denied') {
        setError('Camera access blocked. Please enable camera in browser settings.')
        return
      }
    } catch (e) {
      console.log('Permission API not available, proceeding...')
    }
  }

  const handleClose = () => {
    stopCamera()
    setIsOpen(false)
    setError(null)
  }

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current || !stream || !videoReady) {
      console.error('❌ Camera not ready for capture')
      setError('Camera not ready. Please wait a moment.')
      return
    }

    const video = videoRef.current
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')

    if (!context) {
      console.error('❌ Canvas context unavailable')
      setError('Failed to prepare capture. Please try again.')
      return
    }

    // Validate video dimensions
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.error('❌ Invalid video dimensions')
      setError('Camera not ready. Please wait and try again.')
      return
    }

    console.log('📸 Capturing photo:', video.videoWidth, 'x', video.videoHeight)

    // Set canvas to match video
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    // Draw video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    // Convert to file
    canvas.toBlob(
      (blob) => {
        if (blob) {
          console.log('✅ Photo captured:', blob.size, 'bytes')
          const file = new File([blob], `photo-${Date.now()}.jpg`, { 
            type: 'image/jpeg',
            lastModified: Date.now()
          })
          onCapture(file)
          handleClose()
        } else {
          console.error('❌ Failed to create image blob')
          setError('Failed to capture photo. Please try again.')
        }
      },
      'image/jpeg',
      0.9
    )
  }

  const switchCamera = () => {
    console.log('🔄 Switching camera')
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user')
  }

  // Start camera when dialog opens
  useEffect(() => {
    if (isOpen) {
      startCamera()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Restart camera when facingMode changes (only if dialog is open)
  useEffect(() => {
    if (isOpen && !isLoading) {
      startCamera()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
      }
    }
  }, [stream])

  return (
    <>
      <div onClick={handleOpen}>
        {trigger}
      </div>

      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('take_photo') || 'Take Photo'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {error ? (
              <div className="text-center p-8 space-y-4">
                <div className="text-red-600 bg-red-50 p-4 rounded-lg">
                  <p className="text-sm font-medium mb-2">Camera Error</p>
                  <p className="text-sm">{error}</p>
                </div>
                <Button onClick={startCamera} variant="outline" className="w-full">
                  <Camera className="h-4 w-4 mr-2" />
                  {t('retry') || 'Try Again'}
                </Button>
              </div>
            ) : (
              <div className="relative bg-gray-900 rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-64 object-cover"
                  style={{ display: videoReady ? 'block' : 'none' }}
                />
                
                <canvas
                  ref={canvasRef}
                  className="hidden"
                />
                
                {/* Loading overlay */}
                {isLoading && (
                  <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
                    <div className="text-center text-white space-y-3">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                      <p className="text-sm">Starting camera...</p>
                    </div>
                  </div>
                )}
                
                {/* Camera ready overlay */}
                {videoReady && (
                  <div className="absolute top-2 left-2 bg-green-600 text-white text-xs px-2 py-1 rounded">
                    {facingMode === 'environment' ? '📷 Back Camera' : '🤳 Front Camera'}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="flex justify-between">
            <Button 
              onClick={switchCamera} 
              variant="outline" 
              size="sm"
              disabled={!videoReady || !!error}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              {t('switch_camera') || 'Switch'}
            </Button>
            
            <div className="flex gap-2">
              <Button onClick={handleClose} variant="outline">
                <X className="h-4 w-4 mr-2" />
                {t('cancel') || 'Cancel'}
              </Button>
              <Button 
                onClick={capturePhoto} 
                disabled={!videoReady || !!error}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Camera className="h-4 w-4 mr-2" />
                {t('capture') || 'Capture'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
