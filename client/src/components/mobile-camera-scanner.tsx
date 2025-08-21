import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Camera, X, FlashlightIcon as Flashlight } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { toast } from 'sonner'
import { Html5QrcodeScanner, Html5QrcodeScanType, Html5QrcodeSupportedFormats } from 'html5-qrcode'

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
  const scannerRef = useRef<HTMLDivElement>(null)
  const [internalOpen, setInternalOpen] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [scannerReady, setScannerReady] = useState(false)
  const html5QrcodeScannerRef = useRef<Html5QrcodeScanner | null>(null)
  const [scannerId] = useState(() => `qr-scanner-${Math.random().toString(36).substr(2, 9)}`)

  const open = isOpen !== undefined ? isOpen : internalOpen
  const setOpen = onOpenChange || setInternalOpen

  // Check camera permissions
  const checkCameraPermission = async () => {
    try {
      const result = await navigator.permissions.query({ name: 'camera' as PermissionName })
      console.log('Camera permission status:', result.state)
      return result.state === 'granted' || result.state === 'prompt'
    } catch (error) {
      console.warn('Could not check camera permission:', error)
      return true // Assume permission available if we can't check
    }
  }

  const startCamera = async () => {
    try {
      setIsScanning(true)
      setError(null)
      setScannerReady(false)

      console.log('Starting camera scanner...')

      // Check camera permission first
      const hasPermission = await checkCameraPermission()
      if (!hasPermission) {
        setError('Camera permission is required for scanning')
        setIsScanning(false)
        return
      }

      // Wait just enough to ensure the DOM element is ready
      await new Promise(resolve => setTimeout(resolve, 100))

      if (!scannerRef.current) {
        console.error('Scanner ref not available')
        setError('Scanner container not ready')
        setIsScanning(false)
        return
      }

      // Double check that the element exists in the DOM
      const element = document.getElementById(scannerId)
      if (!element) {
        console.error('Scanner element not found in DOM:', scannerId)
        setError('Scanner element not ready')
        setIsScanning(false)
        return
      }

      console.log('Found scanner element:', element)

      // Clear any existing content
      element.innerHTML = ''

      // Simplified config for better compatibility
      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
        disableFlip: false,
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.UPC_A
        ],
        rememberLastUsedCamera: true,
        showTorchButtonIfSupported: true
      }

      // Success callback
      const onScanSuccess = (decodedText: string) => {
        console.log('Scan successful:', decodedText)
        onScanResult(decodedText)
        setOpen(false)
        toast.success(`${t('barcode_scanned')}: ${decodedText}`)
        stopCamera()
      }

      // Error callback - only log significant errors
      const onScanFailure = (error: string) => {
        if (error && !error.includes('NotFoundException') && !error.includes('No MultiFormat Readers')) {
          console.warn('Scan error:', error)
        }
      }

      console.log('Creating scanner with ID:', scannerId)

      // Initialize scanner
      html5QrcodeScannerRef.current = new Html5QrcodeScanner(
        scannerId,
        config,
        /* verbose */ false
      )

      // Render the scanner
      html5QrcodeScannerRef.current.render(onScanSuccess, onScanFailure)
      
      console.log('Scanner rendered')
      
      // Check if scanner is ready by monitoring the DOM changes
      let isReady = false
      const checkScannerReady = () => {
        if (isReady) return
        
        const element = document.getElementById(scannerId)
        if (element && element.children.length > 0) {
          // Scanner has populated the DOM, mark as ready
          isReady = true
          setScannerReady(true)
          console.log('Scanner marked as ready (DOM populated)')
        } else {
          // Check again in a short time
          setTimeout(checkScannerReady, 200)
        }
      }
      
      // Start checking immediately and also set a fallback timeout
      setTimeout(checkScannerReady, 100)
      setTimeout(() => {
        if (!isReady) {
          isReady = true
          setScannerReady(true)
          console.log('Scanner marked as ready (fallback timeout)')
        }
        // Check for flashlight capability after scanner is ready
        checkFlashlightCapability()
      }, 1000)

    } catch (err) {
      console.error('Camera initialization failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to start camera')
      setIsScanning(false)
    }
  }

  const checkFlashlightCapability = async () => {
    try {
      // Get available camera devices
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = devices.filter(device => device.kind === 'videoinput')
      
      console.log('Available cameras:', videoDevices.length)
      
      if (videoDevices.length === 0) {
        console.warn('No camera devices found')
        return
      }

      // Try to get camera access to check capabilities
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      })
      
      const track = stream.getVideoTracks()[0]
      const capabilities = track.getCapabilities?.()
      
      console.log('Camera capabilities:', capabilities)
      
      if (capabilities && 'torch' in capabilities) {
        setHasFlashlight(true)
        console.log('Flashlight is available')
      }
      
      // Store stream for flashlight control
      setStream(stream)
      
    } catch (error) {
      console.warn('Could not check camera capability:', error)
    }
  }

  // const checkFlashlightCapability = async () => {
  //   try {
  //     // Get available camera devices
  //     const devices = await navigator.mediaDevices.enumerateDevices()
  //     const videoDevices = devices.filter(device => device.kind === 'videoinput')
      
  //     console.log('Available cameras:', videoDevices.length)
      
  //     if (videoDevices.length === 0) {
  //       console.warn('No camera devices found')
  //       return
  //     }

  //     // Try to get camera access to check capabilities
  //     const stream = await navigator.mediaDevices.getUserMedia({ 
  //       video: { 
  //         facingMode: { ideal: 'environment' },
  //         width: { ideal: 1280 },
  //         height: { ideal: 720 }
  //       } 
  //     })
      
  //     const track = stream.getVideoTracks()[0]
  //     const capabilities = track.getCapabilities?.()
      
  //     console.log('Camera capabilities:', capabilities)
      
  //     if (capabilities && 'torch' in capabilities) {
  //       setHasFlashlight(true)
  //       console.log('Flashlight is available')
  //     }
      
  //     // Store stream for flashlight control
  //     setStream(stream)
      
  //   } catch (error) {
  //     console.warn('Could not check camera capability:', error)
  //   }
  // }

  const stopCamera = () => {
    try {
      setIsScanning(false)
      setScannerReady(false)
      
      // Stop the Html5QrcodeScanner
      if (html5QrcodeScannerRef.current) {
        html5QrcodeScannerRef.current.clear().catch((error) => {
          console.warn('Error clearing scanner:', error)
        })
        html5QrcodeScannerRef.current = null
      }
      
      // Stop any camera streams
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
        setStream(null)
      }
      
    } catch (error) {
      console.warn('Error stopping scanner:', error)
    }
    
    setFlashlightOn(false)
    setHasFlashlight(false)
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
      toast.success(flashlightOn ? 'Flashlight turned off' : 'Flashlight turned on')
    } catch (err) {
      console.error('Flashlight toggle failed:', err)
      toast.error('Flashlight not available on this device')
    }
  }

  // const toggleFlashlight = async () => {
  //   if (!stream) return

  //   const track = stream.getVideoTracks()[0]
  //   try {
  //     // Use type assertion for torch constraint since it's not in standard types
  //     await track.applyConstraints({
  //       advanced: [{ torch: !flashlightOn } as any]
  //     })
  //     setFlashlightOn(!flashlightOn)
  //   } catch (err) {
  //     console.error('Flashlight toggle failed:', err)
  //     toast.error('Flashlight not available on this device')
  //   }
  // }

  // Manual barcode input as fallback
  const handleManualBarcode = () => {
    const barcode = prompt(t('enter_barcode_manually'))
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
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-x-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            {t('mobile_camera_scanner')}
          </DialogTitle>
          <DialogDescription>
            {t('point_camera_at_barcode')} {t('hold_phone_steady')}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {error ? (
            <div className="text-center p-8">
              <X className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <p className="text-red-600 mb-4">{error}</p>
              <div className="space-y-2">
                <Button 
                  onClick={() => {
                    setError(null)
                    startCamera()
                  }} 
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
              <div className="mt-4 text-sm text-gray-600">
                <p>Make sure to:</p>
                <ul className="text-left mt-2 space-y-1">
                  <li>• Allow camera permission when prompted</li>
                  <li>• Try refreshing the page</li>
                  <li>• Check if camera is being used by another app</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Scanner container */}
              <div className="relative rounded-lg overflow-hidden border">
                <div 
                  ref={scannerRef} 
                  id={scannerId}
                  className="w-full min-h-[350px] bg-gray-100"
                  style={{ minHeight: '350px' }}
                >
                  {/* This div will be populated by html5-qrcode */}
                </div>
                
                {/* Loading indicator when scanner hasn't started */}
                {isScanning && !scannerReady && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70 z-10">
                    <div className="text-white text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-3"></div>
                      <p className="text-base font-medium">Initializing scanner...</p>
                      <p className="text-xs mt-1 opacity-80">This will only take a moment</p>
                    </div>
                  </div>
                )}

                {/* Flashlight button overlay */}
                {hasFlashlight && scannerReady && (
                  <Button
                    onClick={toggleFlashlight}
                    className="absolute top-4 right-4 z-20"
                    size="sm"
                    variant={flashlightOn ? "default" : "outline"}
                    title={flashlightOn ? 'Turn off flashlight' : 'Turn on flashlight'}
                  >
                    <Flashlight className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Instructions */}
              <div className="bg-blue-50 p-3 rounded-lg text-sm">
                <h4 className="font-semibold text-blue-900 mb-1">{t('scanning_instructions')}:</h4>
                <ul className="text-blue-800 space-y-1">
                  <li>• Point camera at QR code or barcode</li>
                  <li>• {t('hold_phone_steady')}</li>
                  <li>• {t('ensure_good_lighting')} or use flashlight button</li>
                  <li>• Align code within the scanning frame</li>
                  <li>• Detection is automatic - no need to press capture</li>
                  <li>• Supports QR codes, EAN, Code128, and more</li>
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
                  onClick={() => {
                    const element = document.getElementById(scannerId)
                    console.log('Debug info:', {
                      isScanning,
                      scannerReady,
                      hasScanner: !!html5QrcodeScannerRef.current,
                      elementExists: !!scannerRef.current,
                      domElementExists: !!element,
                      scannerId,
                      elementInnerHTML: element?.innerHTML || 'N/A'
                    })
                    // Try to restart scanner
                    stopCamera()
                    setTimeout(startCamera, 1000)
                  }}
                  variant="secondary"
                  size="sm"
                >
                  Debug
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
