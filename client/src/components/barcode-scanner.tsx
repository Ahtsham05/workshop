import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Camera, X, Zap } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { toast } from 'sonner'

// Modern barcode scanning with ZXing
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library'

interface BarcodeScannerProps {
  onScanResult: (barcode: string) => void
  trigger?: React.ReactNode
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

export function BarcodeScanner({ 
  onScanResult, 
  trigger, 
  isOpen, 
  onOpenChange 
}: BarcodeScannerProps) {
  const { t } = useLanguage()
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [internalOpen, setInternalOpen] = useState(false)
  const codeReader = useRef<BrowserMultiFormatReader | null>(null)

  const open = isOpen !== undefined ? isOpen : internalOpen
  const setOpen = onOpenChange || setInternalOpen

  const startScanner = async () => {
    if (!videoRef.current) return

    try {
      setIsScanning(true)
      setError(null)

      // Initialize the code reader
      codeReader.current = new BrowserMultiFormatReader()

      // Get available video input devices
      const videoInputDevices = await codeReader.current.listVideoInputDevices()
      
      if (videoInputDevices.length === 0) {
        throw new Error('No camera found')
      }

      // Use the first available camera (or rear camera if available)
      const selectedDeviceId = videoInputDevices.find(device => 
        device.label.toLowerCase().includes('back') || 
        device.label.toLowerCase().includes('rear')
      )?.deviceId || videoInputDevices[0].deviceId

      // Start decoding from video element
      await codeReader.current.decodeFromVideoDevice(
        selectedDeviceId,
        videoRef.current,
        (result, error) => {
          if (result) {
            const code = result.getText()
            onScanResult(code)
            stopScanner()
            setOpen(false)
            toast.success(`${t('barcode_scanned')}: ${code}`)
          }
          if (error && !(error instanceof NotFoundException)) {
            console.error('Decode error:', error)
          }
        }
      )

    } catch (err) {
      console.error('Scanner initialization failed:', err)
      setError(t('camera_access_failed'))
      setIsScanning(false)
    }
  }

  const stopScanner = () => {
    if (codeReader.current) {
      codeReader.current.reset()
    }
    setIsScanning(false)
  }

  useEffect(() => {
    if (open) {
      startScanner()
    } else {
      stopScanner()
    }

    return () => {
      stopScanner()
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
                onClick={startScanner} 
                className="mt-4"
                variant="outline"
              >
                {t('try_again')}
              </Button>
            </div>
          ) : (
            <div className="relative">
              <video 
                ref={videoRef} 
                className="w-full h-64 bg-black rounded-lg object-cover"
                autoPlay
                muted
                playsInline
              />
              {isScanning && (
                <div className="absolute inset-0 border-2 border-blue-500 rounded-lg">
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                    <div className="w-48 h-1 bg-red-500 animate-pulse"></div>
                  </div>
                </div>
              )}
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

export default BarcodeScanner
