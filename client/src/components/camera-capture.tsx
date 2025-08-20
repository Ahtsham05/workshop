'use client'

import React, { useRef, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Camera, X, RotateCcw } from 'lucide-react'
import { useLanguage } from '@/context/language-context'

interface CameraCaptureProps {
  onCapture: (file: File) => void
  trigger: React.ReactNode
  disabled?: boolean
}

export default function CameraCapture({ onCapture, trigger, disabled = false }: CameraCaptureProps) {
  const { t } = useLanguage()
  const [isOpen, setIsOpen] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const startCamera = useCallback(async () => {
    try {
      setError(null)
      
      // Stop existing stream
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
        setStream(null)
      }

      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not supported by this browser')
      }

      console.log('Requesting camera access with facingMode:', facingMode)

      // Try with specific constraints first
      let constraints: MediaStreamConstraints = {
        video: { 
          facingMode: { exact: facingMode },
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 }
        },
        audio: false
      }

      let mediaStream
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints)
      } catch (exactError) {
        console.log('Exact facingMode failed, trying ideal:', exactError)
        // If exact facingMode fails, try with ideal
        constraints = {
          video: { 
            facingMode: { ideal: facingMode },
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 }
          },
          audio: false
        }
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia(constraints)
        } catch (idealError) {
          console.log('Ideal facingMode failed, trying basic:', idealError)
          // If that fails, try basic video constraint
          mediaStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: false 
          })
        }
      }

      console.log('Camera stream obtained:', mediaStream)
      setStream(mediaStream)
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
        // Add event listeners for better debugging
        videoRef.current.onloadedmetadata = () => {
          console.log('Video metadata loaded')
          videoRef.current?.play().catch(e => console.error('Play failed:', e))
        }
        videoRef.current.oncanplay = () => {
          console.log('Video can play')
        }
        videoRef.current.onerror = (e) => {
          console.error('Video error:', e)
        }
      }
    } catch (err) {
      console.error('Camera access error:', err)
      let errorMessage = t('camera_access_failed') || 'Failed to access camera. Please check permissions.'
      
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          errorMessage = 'Camera access denied. Please allow camera access and try again.'
        } else if (err.name === 'NotFoundError') {
          errorMessage = 'No camera found. Please check if your device has a camera.'
        } else if (err.name === 'NotReadableError') {
          errorMessage = 'Camera is already in use by another application.'
        }
      }
      
      setError(errorMessage)
    }
  }, [facingMode, stream, t])

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      setStream(null)
    }
  }, [stream])

  const handleOpen = async () => {
    setIsOpen(true)
    setError(null)
    
    // Check camera permissions first
    try {
      const permissions = await navigator.permissions.query({ name: 'camera' as PermissionName })
      console.log('Camera permission status:', permissions.state)
      
      if (permissions.state === 'denied') {
        setError('Camera access is blocked. Please enable camera permissions in your browser settings.')
        return
      }
    } catch (e) {
      console.log('Permission API not supported, proceeding with camera request')
    }
  }

  const handleClose = () => {
    stopCamera()
    setIsOpen(false)
    setError(null)
  }

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current || !stream) {
      console.error('Missing video, canvas, or stream for capture')
      return
    }

    const video = videoRef.current
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')

    if (!context) {
      console.error('Could not get canvas context')
      return
    }

    // Ensure video is playing and has dimensions
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.error('Video dimensions not available')
      setError('Camera not ready. Please wait a moment and try again.')
      return
    }

    console.log('Capturing photo with dimensions:', video.videoWidth, 'x', video.videoHeight)

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    // Draw the video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    // Convert canvas to blob
    canvas.toBlob(
      (blob) => {
        if (blob) {
          console.log('Photo captured, blob size:', blob.size)
          const file = new File([blob], `camera-capture-${Date.now()}.jpg`, { 
            type: 'image/jpeg',
            lastModified: Date.now()
          })
          onCapture(file)
          handleClose()
        } else {
          console.error('Failed to create blob from canvas')
          setError('Failed to capture photo. Please try again.')
        }
      },
      'image/jpeg',
      0.9
    )
  }

  const switchCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user')
  }

  // Start camera when dialog opens
  React.useEffect(() => {
    if (isOpen) {
      startCamera()
    }
  }, [isOpen, startCamera])

  // Cleanup when component unmounts
  React.useEffect(() => {
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
              <div className="text-center p-8">
                <p className="text-sm text-red-600 mb-4">{error}</p>
                <Button onClick={startCamera} variant="outline">
                  {t('retry') || 'Retry'}
                </Button>
              </div>
            ) : (
              <div className="relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full rounded-lg bg-gray-900"
                  style={{ 
                    aspectRatio: '4/3',
                    minHeight: '240px',
                    objectFit: 'cover'
                  }}
                  onLoadedData={() => console.log('Video loaded data')}
                  onCanPlay={() => console.log('Video can play')}
                  onPlaying={() => console.log('Video is playing')}
                />
                <canvas
                  ref={canvasRef}
                  className="hidden"
                />
                
                {/* Loading overlay */}
                {!stream && (
                  <div className="absolute inset-0 bg-gray-900 rounded-lg flex items-center justify-center">
                    <div className="text-center text-white">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
                      <p className="text-sm">Starting camera...</p>
                    </div>
                  </div>
                )}
                
                {/* Camera info overlay */}
                {stream && (
                  <div className="absolute top-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
                    {facingMode === 'environment' ? 'Back Camera' : 'Front Camera'}
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
              disabled={!stream || !!error}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              {t('switch_camera') || 'Switch Camera'}
            </Button>
            
            <div className="flex gap-2">
              <Button onClick={handleClose} variant="outline">
                <X className="h-4 w-4 mr-2" />
                {t('cancel') || 'Cancel'}
              </Button>
              <Button 
                onClick={capturePhoto} 
                disabled={!stream || !!error}
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
