import React, { useState, useCallback, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { VoiceInputButton } from '@/components/ui/voice-input-button'
import { getInputClasses } from '@/utils/keyboard-language-utils'
import { cn } from '@/lib/utils'

interface SmartInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onValueChange?: (value: string) => void
  showVoiceInput?: boolean
  voiceInputSize?: 'sm' | 'md' | 'lg'
}

export const SmartInput = React.forwardRef<HTMLInputElement, SmartInputProps>(
  ({ className, onValueChange, onChange, showVoiceInput = false, voiceInputSize = 'sm', ...props }, ref) => {
    const [inputValue, setInputValue] = useState(props.value?.toString() || '')

    useEffect(() => {
      const newValue = props.value?.toString() || ''
      setInputValue(newValue)
    }, [props.value])

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value
      setInputValue(newValue)
      onChange?.(e)
      onValueChange?.(newValue)
    }, [onChange, onValueChange])

    const handleVoiceInput = useCallback((transcript: string) => {
      const newValue = inputValue + transcript
      setInputValue(newValue)
      const syntheticEvent = {
        target: { value: newValue }
      } as React.ChangeEvent<HTMLInputElement>
      onChange?.(syntheticEvent)
      onValueChange?.(newValue)
    }, [inputValue, onChange, onValueChange])

    // Apply RTL/font classes based on the text content
    const smartClasses = getInputClasses(inputValue, className || '')

    if (showVoiceInput) {
      return (
        <div className="relative">
          {/* showVoiceInput={false} prevents the base Input from adding its own mic button */}
          <Input
            {...props}
            ref={ref}
            showVoiceInput={false}
            className={cn(smartClasses, 'pr-10')}
            value={inputValue}
            onChange={handleChange}
          />
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2 z-10">
            {/* No language prop — VoiceInputButton reads language from settings context */}
            <VoiceInputButton
              onTranscript={handleVoiceInput}
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
        showVoiceInput={false}
        className={smartClasses}
        value={inputValue}
        onChange={handleChange}
      />
    )
  }
)

SmartInput.displayName = 'SmartInput'

export default SmartInput
