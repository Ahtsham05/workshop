import React, { useState, useCallback, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { VoiceInputButton } from '@/components/ui/voice-input-button'
import { getInputClasses, getVoiceInputLanguage, detectKeyboardLanguage } from '@/utils/keyboard-language-utils'
import { cn } from '@/lib/utils'

interface SmartInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onValueChange?: (value: string) => void
  showVoiceInput?: boolean
  voiceInputSize?: 'sm' | 'md' | 'lg'
}

export const SmartInput = React.forwardRef<HTMLInputElement, SmartInputProps>(
  ({ className, onValueChange, onChange, showVoiceInput = false, voiceInputSize = 'sm', ...props }, ref) => {
    const [inputValue, setInputValue] = useState(props.value?.toString() || '')
    const [keyboardLang, setKeyboardLang] = useState<'ur' | 'en'>('en')

    // Update internal state when props.value changes
    useEffect(() => {
      const newValue = props.value?.toString() || ''
      setInputValue(newValue)
      setKeyboardLang(detectKeyboardLanguage(newValue))
    }, [props.value])

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value
      setInputValue(newValue)
      
      // Detect keyboard language from the new input
      const detectedLang = detectKeyboardLanguage(newValue)
      setKeyboardLang(detectedLang)
      
      // Call the original onChange if provided
      if (onChange) {
        onChange(e)
      }
      
      // Call onValueChange if provided
      if (onValueChange) {
        onValueChange(newValue)
      }
    }, [onChange, onValueChange])

    const handleVoiceInput = useCallback((transcript: string) => {
      const newValue = inputValue + transcript
      setInputValue(newValue)
      
      // Detect language for the combined text
      const detectedLang = detectKeyboardLanguage(newValue)
      setKeyboardLang(detectedLang)
      
      // Create a synthetic event to maintain compatibility
      const syntheticEvent = {
        target: { value: newValue }
      } as React.ChangeEvent<HTMLInputElement>
      
      if (onChange) {
        onChange(syntheticEvent)
      }
      
      if (onValueChange) {
        onValueChange(newValue)
      }
    }, [inputValue, onChange, onValueChange])

    // Get appropriate classes based on current input text
    const smartClasses = getInputClasses(inputValue, className || '')
    
    // Get voice input language based on current text
    const voiceLanguage = getVoiceInputLanguage(inputValue)

    if (showVoiceInput) {
      return (
        <div className="relative">
          <Input
            {...props}
            ref={ref}
            className={cn(smartClasses, showVoiceInput ? 'pr-10' : '')}
            value={inputValue}
            onChange={handleChange}
          />
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2 z-10">
            <VoiceInputButton
              onTranscript={handleVoiceInput}
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
        className={smartClasses}
        value={inputValue}
        onChange={handleChange}
      />
    )
  }
)

SmartInput.displayName = 'SmartInput'

export default SmartInput
