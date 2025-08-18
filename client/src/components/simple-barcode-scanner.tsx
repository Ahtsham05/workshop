import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Camera, X, Zap, Upload } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'

interface SimpleBarcodeeScannerProps {
  onScanResult: (barcode: string) => void
  trigger?: React.ReactNode
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

export function SimpleBarcodeScanner({ 
  onScanResult, 
  trigger, 
  isOpen, 
  onOpenChange 
}: SimpleBarcodeeScannerProps) {
  const { t } = useLanguage()
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [internalOpen, setInternalOpen] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)

  const open = isOpen !== undefined ? isOpen : internalOpen
  const setOpen = onOpenChange || setInternalOpen

  const startCamera = async () => {
    try {
      setIsScanning(true)
      setError(null)

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Use rear camera
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      })

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
        setStream(mediaStream)
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
  }

  const captureImage = () => {
    if (!videoRef.current || !canvasRef.current) return

    const canvas = canvasRef.current
    const context = canvas.getContext('2d')
    
    if (!context) return

    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    
    context.drawImage(videoRef.current, 0, 0)
    
    // Convert to blob and simulate barcode reading
    canvas.toBlob((blob) => {
      if (blob) {
        // For demonstration, we'll show a dialog to manually enter the barcode
        // In a real implementation, you would use a barcode library here
        const manualEntry = prompt(t('enter_barcode_manually'))
        if (manualEntry && manualEntry.trim()) {
          onScanResult(manualEntry.trim())
          setOpen(false)
          toast.success(`${t('barcode_entered')}: ${manualEntry}`)
        }
      }
    })
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // For demonstration, prompt for manual entry
    // In a real implementation, you would process the image
    const manualEntry = prompt(`${t('barcode_from_image')} - ${t('enter_barcode_manually')}`)
    if (manualEntry && manualEntry.trim()) {
      onScanResult(manualEntry.trim())
      setOpen(false)
      toast.success(`${t('barcode_entered')}: ${manualEntry}`)
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
      {t('scan_barcode')}
    </Button>
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            {t('barcode_scanner')}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {error ? (
            <div className="text-center p-8">
              <X className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <p className="text-red-600">{error}</p>
              <Button 
                onClick={startCamera} 
                className="mt-4"
                variant="outline"
              >
                {t('try_again')}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative">
                <video 
                  ref={videoRef} 
                  className="w-full h-64 bg-black rounded-lg object-cover"
                  autoPlay
                  muted
                  playsInline
                />
                <canvas 
                  ref={canvasRef} 
                  className="hidden"
                />
                {isScanning && (
                  <div className="absolute inset-0 border-2 border-blue-500 rounded-lg">
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                      <div className="w-48 h-1 bg-red-500 animate-pulse"></div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button 
                  onClick={captureImage}
                  className="flex-1"
                  disabled={!isScanning}
                >
                  <Camera className="h-4 w-4 mr-2" />
                  {t('capture_barcode')}
                </Button>
                
                <div className="relative">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <Button variant="outline">
                    <Upload className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
          
          <div className="text-center text-sm text-gray-600">
            {t('point_camera_at_barcode')}
          </div>
          
          <div className="flex justify-end">
            <Button 
              variant="outline" 
              onClick={() => setOpen(false)}
            >
              {t('cancel')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default SimpleBarcodeScanner
