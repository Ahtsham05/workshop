'use client'

import React, { useRef, useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Camera, X, RotateCcw, Loader2 } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'

interface CameraCaptureProps {
  onCapture: (file: File) => void
  trigger: React.ReactNode
  disabled?: boolean
}

export default function CameraCapture({ onCapture, trigger, disabled }: CameraCaptureProps) {
  const { t } = useLanguage()
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
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
      const timeoutId = window.setTimeout(() => reject(new Error('Video loading timeout')), 10000)

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
        throw new Error(t('camera_access_failed') || 'Camera not supported in this browser')
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

      let errorMessage = t('camera_access_failed') || 'Failed to access camera. Please check permissions.'

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
      if (node && streamRef.current && isOpen && !videoReady && !startingRef.current) {
        void attachStreamToVideo(node).catch(() => {
          setError('Failed to start camera preview. Please try again.')
          setIsLoading(false)
        })
      }
    },
    [attachStreamToVideo, isOpen, videoReady],
  )

  const handleOpen = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (disabled) return
      setIsOpen(true)
      setError(null)
    },
    [disabled],
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
      0.9,
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

  const triggerElement = React.isValidElement(trigger)
    ? React.cloneElement(
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
          disabled: disabled || (trigger as React.ReactElement<{ disabled?: boolean }>).props.disabled,
        },
      )
    : (
        <button type="button" onClick={handleOpen} disabled={disabled}>
          {trigger}
        </button>
      )

  return (
    <>
      {triggerElement}

      {isOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="camera-capture-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label={t('cancel') || 'Close'}
            onClick={handleClose}
          />

          <div
            className={cn(
              'bg-background relative z-10 grid w-full max-w-md gap-4 rounded-lg border p-6 shadow-lg',
            )}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-2 text-center sm:text-left">
              <h2 id="camera-capture-title" className="text-lg leading-none font-semibold">
                {t('take_photo') || 'Take Photo'}
              </h2>
            </div>

            <div className="space-y-4">
              {error ? (
                <div className="space-y-4 text-center">
                  <div className="rounded-lg bg-red-50 p-4 text-red-600">
                    <p className="mb-2 text-sm font-medium">Camera Error</p>
                    <p className="text-sm">{error}</p>
                  </div>
                  <Button type="button" onClick={() => void startCamera()} variant="outline" className="w-full">
                    <Camera className="mr-2 h-4 w-4" />
                    {t('retry') || 'Try Again'}
                  </Button>
                </div>
              ) : (
                <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-gray-900">
                  <video
                    ref={setVideoNode}
                    autoPlay
                    playsInline
                    muted
                    className={cn(
                      'h-full w-full object-cover',
                      videoReady ? 'opacity-100' : 'opacity-0',
                    )}
                  />

                  <canvas ref={canvasRef} className="hidden" />

                  {isLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                      <div className="space-y-3 text-center text-white">
                        <Loader2 className="mx-auto h-8 w-8 animate-spin" />
                        <p className="text-sm">Starting camera...</p>
                      </div>
                    </div>
                  ) : null}

                  {videoReady ? (
                    <div className="pointer-events-none absolute top-2 left-2 rounded bg-green-600 px-2 py-1 text-xs text-white">
                      {facingMode === 'environment' ? 'Back camera' : 'Front camera'}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                onClick={switchCamera}
                variant="outline"
                size="sm"
                disabled={!!error || isLoading}
                className="w-full sm:w-auto"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                {t('switch_camera') || 'Switch'}
              </Button>

              <div className="flex w-full gap-2 sm:w-auto">
                <Button
                  type="button"
                  onClick={handleClose}
                  variant="outline"
                  className="flex-1 sm:min-w-[7rem]"
                >
                  <X className="mr-2 h-4 w-4" />
                  {t('cancel') || 'Cancel'}
                </Button>
                <Button
                  type="button"
                  onClick={capturePhoto}
                  disabled={!!error || isLoading || !videoReady}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 sm:min-w-[7rem]"
                >
                  <Camera className="mr-2 h-4 w-4" />
                  {t('capture') || 'Capture'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
