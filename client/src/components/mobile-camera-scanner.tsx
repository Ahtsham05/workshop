import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Camera, X, FlashlightIcon as Flashlight } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { toast } from 'sonner'

interface MobileCameraScannerProps {
  onScanResult: (barcode: string) => void
  trigger?: React.ReactNode
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

export function MobileCameraScanner({ 
  onScanResult, 
  trigger, 
  isOpen, 
  onOpenChange 
}: MobileCameraScannerProps) {
  const { t } = useLanguage()
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasFlashlight, setHasFlashlight] = useState(false)
  const [flashlightOn, setFlashlightOn] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [internalOpen, setInternalOpen] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)

  const open = isOpen !== undefined ? isOpen : internalOpen
  const setOpen = onOpenChange || setInternalOpen

  const startCamera = async () => {
    try {
      setIsScanning(true)
      setError(null)

      // Request camera with specific constraints for barcode scanning
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: 'environment', // Use rear camera
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          frameRate: { ideal: 30, min: 15 }
        }
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints)

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
        setStream(mediaStream)
        
        // Check if device supports flashlight
        const track = mediaStream.getVideoTracks()[0]
        const capabilities = track.getCapabilities?.()
        if (capabilities && 'torch' in capabilities) {
          setHasFlashlight(true)
        }
      }

    } catch (err) {
      console.error('Camera access failed:', err)
      setError(t('camera_access_failed'))
      setIsScanning(false)
    }
  }

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      setStream(null)
    }
    setIsScanning(false)
    setFlashlightOn(false)
  }

  const toggleFlashlight = async () => {
    if (!stream) return

    const track = stream.getVideoTracks()[0]
    try {
      // Use type assertion for torch constraint since it's not in standard types
      await track.applyConstraints({
        advanced: [{ torch: !flashlightOn } as any]
      })
      setFlashlightOn(!flashlightOn)
    } catch (err) {
      console.error('Flashlight toggle failed:', err)
      toast.error('Flashlight not available on this device')
    }
  }

  // Simple barcode detection using manual input for demo
  const handleManualBarcode = () => {
    const barcode = prompt(t('enter_barcode_manually_for_testing'))
    if (barcode && barcode.trim()) {
      onScanResult(barcode.trim())
      setOpen(false)
      toast.success(`${t('barcode_scanned')}: ${barcode}`)
    }
  }

  useEffect(() => {
    if (open) {
      startCamera()
    } else {
      stopCamera()
    }

    return () => {
      stopCamera()
    }
  }, [open])

  const defaultTrigger = (
    <Button variant="outline" className="flex items-center gap-2">
      <Camera className="h-4 w-4" />
      {t('scan_with_camera')}
    </Button>
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            {t('mobile_camera_scanner')}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {error ? (
            <div className="text-center p-8">
              <X className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <p className="text-red-600 mb-4">{error}</p>
              <div className="space-y-2">
                <Button 
                  onClick={startCamera} 
                  className="w-full"
                  variant="outline"
                >
                  {t('try_again')}
                </Button>
                <Button 
                  onClick={handleManualBarcode}
                  className="w-full"
                  variant="secondary"
                >
                  {t('enter_manually_instead')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative bg-black rounded-lg overflow-hidden">
                <video 
                  ref={videoRef} 
                  className="w-full h-64 object-cover"
                  autoPlay
                  muted
                  playsInline
                />
                
                {/* Scanning overlay */}
                {isScanning && (
                  <div className="absolute inset-0">
                    {/* Scanning line */}
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-48 h-1 bg-red-500 animate-pulse shadow-lg"></div>
                    
                    {/* Corner guides */}
                    <div className="absolute top-4 left-4 w-6 h-6 border-l-2 border-t-2 border-white"></div>
                    <div className="absolute top-4 right-4 w-6 h-6 border-r-2 border-t-2 border-white"></div>
                    <div className="absolute bottom-4 left-4 w-6 h-6 border-l-2 border-b-2 border-white"></div>
                    <div className="absolute bottom-4 right-4 w-6 h-6 border-r-2 border-b-2 border-white"></div>
                  </div>
                )}
                
                {/* Flash button */}
                {hasFlashlight && (
                  <Button
                    onClick={toggleFlashlight}
                    className="absolute top-2 right-2"
                    size="sm"
                    variant={flashlightOn ? "default" : "outline"}
                  >
                    <Flashlight className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Instructions */}
              <div className="bg-blue-50 p-3 rounded-lg text-sm">
                <h4 className="font-semibold text-blue-900 mb-1">{t('scanning_instructions')}:</h4>
                <ul className="text-blue-800 space-y-1">
                  <li>• {t('hold_phone_steady')}</li>
                  <li>• {t('point_camera_at_barcode')}</li>
                  <li>• {t('ensure_good_lighting')}</li>
                  <li>• {t('barcode_should_fill_frame')}</li>
                </ul>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <Button 
                  onClick={handleManualBarcode}
                  className="flex-1"
                  variant="outline"
                >
                  {t('enter_manually')}
                </Button>
                <Button 
                  onClick={() => setOpen(false)}
                  variant="outline"
                >
                  {t('cancel')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default MobileCameraScanner
