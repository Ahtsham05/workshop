'use client'

import React, { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { VoiceInputButton } from '@/components/ui/voice-input-button'
import { getInputClasses, detectKeyboardLanguage, detectCurrentKeyboardLanguage } from '@/utils/keyboard-language-utils'
import { cn } from '@/lib/utils'

interface SmartInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  showVoiceInput?: boolean
  voiceInputSize?: 'sm' | 'md' | 'lg'
  onVoiceTranscript?: (text: string) => void
}

const SmartInput = React.forwardRef<HTMLInputElement, SmartInputProps>(
  ({ 
    className, 
    showVoiceInput = false, 
    voiceInputSize = 'sm',
    onVoiceTranscript,
    onChange,
    value,
    ...props 
  }, ref) => {
    const [currentValue, setCurrentValue] = useState(value || '')
    const [currentKeyboardLang, setCurrentKeyboardLang] = useState<'ur' | 'en'>('en')
    
    // Update internal state when external value changes
    useEffect(() => {
      setCurrentValue(value || '')
    }, [value])

    // Detect keyboard language and update voice input language
    useEffect(() => {
      const detectAndUpdateLanguage = () => {
        // First try to detect from current keyboard layout
        const keyboardLang = detectCurrentKeyboardLanguage()
        
        // If there's text content, also consider that
        const textBasedLang = currentValue ? detectKeyboardLanguage(String(currentValue)) : keyboardLang
        
        // Use text-based detection if it's different from system, otherwise use system
        const finalLang = currentValue && textBasedLang !== keyboardLang ? textBasedLang : keyboardLang
        
        // Debug logging (remove in production)
        console.log('🎤 Voice Language Detection:', {
          keyboardLang,
          textBasedLang,
          finalLang,
          currentValue: String(currentValue).substring(0, 20) + '...'
        })
        
        setCurrentKeyboardLang(finalLang)
      }

      // Detect immediately
      detectAndUpdateLanguage()

      // Listen for keyboard language changes via common shortcuts
      const handleKeyDown = (e: KeyboardEvent) => {
        // Common keyboard switching shortcuts
        if (
          (e.altKey && e.shiftKey) ||  // Alt+Shift (Windows/Linux)
          (e.ctrlKey && e.shiftKey) || // Ctrl+Shift (some systems)
          (e.metaKey && e.code === 'Space') || // Cmd+Space (macOS)
          (e.shiftKey && e.altKey) // Shift+Alt (alternative)
        ) {
          // Small delay to let the keyboard switch complete
          setTimeout(detectAndUpdateLanguage, 150)
        }
      }

      // Listen for focus events to re-detect language
      const handleFocus = () => {
        detectAndUpdateLanguage()
      }

      document.addEventListener('keydown', handleKeyDown)
      window.addEventListener('focus', handleFocus)

      return () => {
        document.removeEventListener('keydown', handleKeyDown)
        window.removeEventListener('focus', handleFocus)
      }
    }, [currentValue])

    // Get appropriate classes and voice language based on current text and keyboard
    const inputClasses = getInputClasses(currentValue as string, showVoiceInput ? 'pr-10' : '')
    const voiceLanguage = currentKeyboardLang === 'ur' ? 'ur-PK' : 'en-US'

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value
      setCurrentValue(newValue)
      onChange?.(e)
    }

    const handleVoiceTranscript = (text: string) => {
      setCurrentValue(text)
      
      // Create a synthetic event to maintain compatibility
      const syntheticEvent = {
        target: { value: text },
        currentTarget: { value: text }
      } as React.ChangeEvent<HTMLInputElement>
      
      onChange?.(syntheticEvent)
      onVoiceTranscript?.(text)
    }

    if (showVoiceInput) {
      return (
        <div className={cn("relative", className)}>
          <Input
            {...props}
            ref={ref}
            value={currentValue}
            onChange={handleChange}
            className={cn(inputClasses, 'pr-10')}
          />
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2 z-10">
            <VoiceInputButton
              onTranscript={handleVoiceTranscript}
              language={voiceLanguage}
              size={voiceInputSize}
            />
          </div>
        </div>
      )
    }

    return (
      <Input
        {...props}
        ref={ref}
        value={currentValue}
        onChange={handleChange}
        className={cn(inputClasses, className)}
      />
    )
  }
)

SmartInput.displayName = 'SmartInput'

export default SmartInput
