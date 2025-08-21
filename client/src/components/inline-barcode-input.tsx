import React, { useState, useRef, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Zap, ZapOff, Check } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'

interface InlineBarcodeInputProps {
  onBarcodeEntered: (barcode: string) => void
  placeholder?: string
  value?: string
  onChange?: (value: string) => void
  className?: string
  disabled?: boolean
}

export function InlineBarcodeInput({ 
  onBarcodeEntered, 
  placeholder,
  value = '',
  onChange,
  className,
  disabled = false
}: InlineBarcodeInputProps) {
  const { t } = useLanguage()
  const [isListening, setIsListening] = useState(false)
  const [inputValue, setInputValue] = useState(value)
  const [lastScanTime, setLastScanTime] = useState<number>(0)
  const [recentlyScanned, setRecentlyScanned] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    setInputValue(value)
  }, [value])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    onChange?.(newValue)

    // Detect rapid input (scanner gun behavior)
    const now = Date.now()
    const timeDiff = now - lastScanTime
    
    // If input is coming rapidly (less than 100ms between characters) and has good length
    if (timeDiff < 100 && newValue.length > 6) {
      // Clear existing timeout
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current)
      }
      
      // Set timeout to process barcode after rapid input stops
      scanTimeoutRef.current = setTimeout(() => {
        if (newValue.trim().length > 0) {
          onBarcodeEntered(newValue.trim())
          setRecentlyScanned(true)
          setTimeout(() => setRecentlyScanned(false), 2000)
        }
      }, 50)
    }
    
    setLastScanTime(now)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Scanner guns typically send Enter after barcode
    if (e.key === 'Enter' && inputValue.trim().length > 0) {
      e.preventDefault()
      onBarcodeEntered(inputValue.trim())
      setRecentlyScanned(true)
      setTimeout(() => setRecentlyScanned(false), 2000)
    }
  }

  const toggleListening = () => {
    setIsListening(!isListening)
    if (!isListening) {
      // Focus input when activating scanner mode
      inputRef.current?.focus()
    }
  }

  const clearInput = () => {
    setInputValue('')
    onChange?.('')
    inputRef.current?.focus()
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || t('enter_or_scan_barcode')}
          disabled={disabled}
          className={cn(
            "pr-10 font-mono",
            isListening && "border-blue-500 ring-2 ring-blue-200",
            recentlyScanned && "border-green-500 ring-2 ring-green-200"
          )}
          autoComplete="off"
        />
        
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
          {recentlyScanned && (
            <Badge variant="outline" className="text-green-600 bg-white border-green-600">
              <Check className="h-3 w-3 mr-1" />
              {t('scanned')}
            </Badge>
          )}
          
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={toggleListening}
            className={cn(
              "h-7 w-7 p-0",
              isListening && "bg-blue-50 border-blue-500 text-blue-600"
            )}
            title={isListening ? t('stop_scanner') : t('use_scanner_gun')}
          >
            {isListening ? (
              <Zap className="h-3 w-3" />
            ) : (
              <ZapOff className="h-3 w-3" />
            )}
          </Button>
        </div>
      </div>
      
      <div className="flex justify-between items-center text-xs">
        {/* <div className="flex items-center gap-2">
          {isListening ? (
            <Badge variant="outline" className="text-blue-600 border-blue-600">
              <Zap className="h-3 w-3 mr-1" />
              {t('scanner_ready')}
            </Badge>
          ) : (
            <span className="text-gray-500">
              {t('click_scanner_button_to_activate')}
            </span>
          )}
        </div> */}
        
        {inputValue && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearInput}
            className="h-auto p-1 text-xs text-gray-500 hover:text-gray-700"
          >
            {t('clear')}
          </Button>
        )}
      </div>
    </div>
  )
}

export default InlineBarcodeInput
