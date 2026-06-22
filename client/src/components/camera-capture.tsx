'use client'

import React, { useRef, useState, useCallback, useEffect } from 'react'
import { Camera, X, RotateCcw, Loader2 } from 'lucide-react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Button } from '@/components/ui/button'

interface CameraCaptureProps {
  onCapture: (file: File) => void
  trigger: React.ReactNode
  disabled?: boolean
}

export default function CameraCapture({
  onCapture,
  trigger,
  disabled,
}: CameraCaptureProps) {
  const { t } = useLanguage()
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(
    'environment'
  )
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const startingRef = useRef(false)

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setVideoReady(false)
    setIsLoading(false)
    startingRef.current = false
  }, [])

  const attachStreamToVideo = useCallback(async (video: HTMLVideoElement) => {
    const mediaStream = streamRef.current
    if (!mediaStream) return false

    video.srcObject = mediaStream

    await new Promise<void>((resolve, reject) => {
      const timeoutId = window.setTimeout(
        () => reject(new Error('Video loading timeout')),
        10000
      )

      const onReady = () => {
        window.clearTimeout(timeoutId)
        video
          .play()
          .then(() => resolve())
          .catch(reject)
      }

      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        onReady()
        return
      }

      video.onloadeddata = onReady
      video.onerror = () => {
        window.clearTimeout(timeoutId)
        reject(new Error('Video failed to load'))
      }
    })

    setVideoReady(true)
    setIsLoading(false)
    return true
  }, [])

  const startCamera = useCallback(async () => {
    if (startingRef.current) return
    startingRef.current = true

    try {
      setIsLoading(true)
      setError(null)
      setVideoReady(false)

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          t('camera_access_failed') || 'Camera not supported in this browser'
        )
      }

      const constraints = [
        {
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        { video: true },
      ]

      let mediaStream: MediaStream | null = null

      for (const constraint of constraints) {
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia(constraint)
          break
        } catch {
          continue
        }
      }

      if (!mediaStream) {
        throw new Error(t('camera_access_failed') || 'Failed to access camera')
      }

      streamRef.current = mediaStream

      const video = videoRef.current
      if (video) {
        await attachStreamToVideo(video)
      } else {
        setIsLoading(false)
      }
    } catch (err) {
      setIsLoading(false)

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }

      let errorMessage =
        t('camera_access_failed') ||
        'Failed to access camera. Please check permissions.'

      if (err instanceof Error) {
        switch (err.name) {
          case 'NotAllowedError':
            errorMessage =
              'Camera access denied. Click the camera icon in the address bar to allow access, then try again.'
            break
          case 'NotFoundError':
            errorMessage = 'No camera found on this device.'
            break
          case 'NotReadableError':
            errorMessage = 'Camera is being used by another application.'
            break
          default:
            errorMessage = err.message || errorMessage
        }
      }

      setError(errorMessage)
    } finally {
      startingRef.current = false
    }
  }, [attachStreamToVideo, facingMode, t])

  const setVideoNode = useCallback(
    (node: HTMLVideoElement | null) => {
      videoRef.current = node
      if (
        node &&
        streamRef.current &&
        isOpen &&
        !videoReady &&
        !startingRef.current
      ) {
        void attachStreamToVideo(node).catch(() => {
          setError('Failed to start camera preview. Please try again.')
          setIsLoading(false)
        })
      }
    },
    [attachStreamToVideo, isOpen, videoReady]
  )

  const handleOpen = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (disabled) return
      setIsOpen(true)
      setError(null)
    },
    [disabled]
  )

  const handleClose = useCallback(() => {
    stopCamera()
    setIsOpen(false)
    setError(null)
  }, [stopCamera])

  const capturePhoto = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || !canvas || !streamRef.current) {
      setError('Camera not ready. Please wait a moment.')
      return
    }

    const context = canvas.getContext('2d')
    if (!context) {
      setError('Failed to prepare capture. Please try again.')
      return
    }

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setError('Camera not ready. Please wait and try again.')
      return
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    canvas.toBlob(
      (blob) => {
        if (blob) {
          const file = new File([blob], `photo-${Date.now()}.jpg`, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          })
          onCapture(file)
          handleClose()
        } else {
          setError('Failed to capture photo. Please try again.')
        }
      },
      'image/jpeg',
      0.9
    )
  }, [handleClose, onCapture])

  const switchCamera = useCallback(() => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'))
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const frame = window.requestAnimationFrame(() => {
      void startCamera()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [isOpen, facingMode, startCamera])

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, handleClose])

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  const triggerElement = React.isValidElement(trigger) ? (
    React.cloneElement(
      trigger as React.ReactElement<{
        onClick?: React.MouseEventHandler
        disabled?: boolean
        type?: 'button' | 'submit' | 'reset'
      }>,
      {
        type: 'button',
        onClick: (e: React.MouseEvent) => {
          const originalOnClick = (
            trigger as React.ReactElement<{ onClick?: React.MouseEventHandler }>
          ).props.onClick
          originalOnClick?.(e)
          handleOpen(e)
        },
        disabled:
          disabled ||
          (trigger as React.ReactElement<{ disabled?: boolean }>).props
            .disabled,
      }
    )
  ) : (
    <button type='button' onClick={handleOpen} disabled={disabled}>
      {trigger}
    </button>
  )

  return (
    <>
      {triggerElement}

      {isOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              className='fixed inset-0 z-[200] flex flex-col bg-black'
              role='dialog'
              aria-modal='true'
              aria-labelledby='camera-capture-title'
            >
              <h2 id='camera-capture-title' className='sr-only'>
                {t('take_photo') || 'Take Photo'}
              </h2>

              <div className='relative flex-1 overflow-hidden bg-black'>
                {error ? (
                  <div className='flex h-full items-center justify-center p-6'>
                    <div className='w-full max-w-sm space-y-4 text-center'>
                      <div className='rounded-lg bg-red-950/50 p-4 text-red-200'>
                        <p className='mb-2 text-sm font-medium'>Camera Error</p>
                        <p className='text-sm'>{error}</p>
                      </div>
                      <Button
                        type='button'
                        onClick={() => void startCamera()}
                        variant='outline'
                        className='w-full'
                      >
                        <Camera className='mr-2 h-4 w-4' />
                        {t('retry') || 'Try Again'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <video
                      ref={setVideoNode}
                      autoPlay
                      playsInline
                      muted
                      className={cn(
                        'h-full w-full object-cover',
                        videoReady ? 'opacity-100' : 'opacity-0'
                      )}
                    />

                    <canvas ref={canvasRef} className='hidden' />

                    {isLoading ? (
                      <div className='absolute inset-0 flex items-center justify-center bg-black'>
                        <div className='space-y-3 text-center text-white'>
                          <Loader2 className='mx-auto h-8 w-8 animate-spin' />
                          <p className='text-sm'>Starting camera...</p>
                        </div>
                      </div>
                    ) : null}
                  </>
                )}

                <button
                  type='button'
                  onClick={handleClose}
                  aria-label={t('cancel') || 'Close'}
                  className='absolute top-4 left-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm'
                >
                  <X className='h-5 w-5' />
                </button>

                {!error && videoReady ? (
                  <button
                    type='button'
                    onClick={switchCamera}
                    disabled={isLoading}
                    aria-label={t('switch_camera') || 'Switch camera'}
                    className='absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm'
                  >
                    <RotateCcw className='h-5 w-5' />
                  </button>
                ) : null}
              </div>

              {!error ? (
                <div className='flex items-center justify-center gap-10 bg-black px-6 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]'>
                  <button
                    type='button'
                    onClick={handleClose}
                    className='text-sm font-medium text-white/80'
                  >
                    {t('cancel') || 'Cancel'}
                  </button>

                  <button
                    type='button'
                    onClick={capturePhoto}
                    disabled={isLoading || !videoReady}
                    aria-label={t('capture') || 'Capture'}
                    className='flex h-18 w-18 items-center justify-center rounded-full border-4 border-white bg-white/20 disabled:opacity-40'
                  >
                    <span className='h-14 w-14 rounded-full bg-white' />
                  </button>

                  <span className='w-[3ch]' aria-hidden='true' />
                </div>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </>
  )
}
