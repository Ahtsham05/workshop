import React, { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { BarChart3, Keyboard, Camera, Scan } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { toast } from 'sonner'

interface BarcodeInputProps {
  onBarcodeEntered: (barcode: string) => void
  trigger?: React.ReactNode
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
  placeholder?: string
  autoFocus?: boolean
}

export function BarcodeInput({ 
  onBarcodeEntered, 
  trigger, 
  isOpen, 
  onOpenChange,
  placeholder,
  autoFocus = true
}: BarcodeInputProps) {
  const { t } = useLanguage()
  const [barcode, setBarcode] = useState('')
  const [isListening, setIsListening] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [internalOpen, setInternalOpen] = useState(false)

  const open = isOpen !== undefined ? isOpen : internalOpen
  const setOpen = onOpenChange || setInternalOpen

  // Handle barcode scanner gun input (they typically send data fast)
  useEffect(() => {
    let buffer = ''
    let timeout: NodeJS.Timeout

    const handleKeyPress = (e: KeyboardEvent) => {
      if (!open || !isListening) return

      // If it's Enter key, process the buffer as barcode
      if (e.key === 'Enter') {
        e.preventDefault()
        if (buffer.length > 3) { // Minimum barcode length
          setBarcode(buffer)
          onBarcodeEntered(buffer)
          setOpen(false)
          toast.success(`${t('barcode_entered')}: ${buffer}`)
          buffer = ''
        }
        return
      }

      // Add character to buffer
      if (e.key.length === 1) {
        buffer += e.key
        
        // Clear buffer after 100ms of inactivity (scanner guns type fast)
        clearTimeout(timeout)
        timeout = setTimeout(() => {
          buffer = ''
        }, 100)
      }
    }

    if (open && isListening) {
      document.addEventListener('keypress', handleKeyPress)
      return () => {
        document.removeEventListener('keypress', handleKeyPress)
        clearTimeout(timeout)
      }
    }
  }, [open, isListening, onBarcodeEntered, setOpen, t])

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (barcode.trim()) {
      onBarcodeEntered(barcode.trim())
      setOpen(false)
      toast.success(`${t('barcode_entered')}: ${barcode}`)
      setBarcode('')
    }
  }

  const toggleScanner = () => {
    setIsListening(!isListening)
    if (!isListening) {
      toast.info(t('scanner_ready'))
    }
  }

  useEffect(() => {
    if (open && autoFocus && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    }
  }, [open, autoFocus])

  const defaultTrigger = (
    <Button variant="outline" className="flex items-center gap-2">
      <BarChart3 className="h-4 w-4" />
      {t('enter_barcode')}
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
            <Scan className="h-5 w-5" />
            {t('barcode_input')}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleManualSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="barcode-input">
              {t('barcode')}
            </Label>
            <Input
              ref={inputRef}
              id="barcode-input"
              type="text"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder={placeholder || t('enter_or_scan_barcode')}
              className="font-mono"
              autoComplete="off"
            />
          </div>

          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant={isListening ? "destructive" : "secondary"}
              onClick={toggleScanner}
              className="flex items-center gap-2"
            >
              <Camera className="h-4 w-4" />
              {isListening ? t('stop_scanner') : t('use_scanner_gun')}
            </Button>

            <div className="flex gap-2">
              <Button 
                type="button"
                variant="outline" 
                onClick={() => setOpen(false)}
              >
                {t('cancel')}
              </Button>
              <Button 
                type="submit"
                disabled={!barcode.trim()}
                className="flex items-center gap-2"
              >
                <Keyboard className="h-4 w-4" />
                {t('add')}
              </Button>
            </div>
          </div>

          {isListening && (
            <div className="text-sm text-blue-600 bg-blue-50 p-3 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                {t('scanner_listening')}
              </div>
              <p className="text-xs mt-1">{t('scanner_instructions')}</p>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default BarcodeInput
