'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { VoiceInputButton } from '@/components/ui/voice-input-button'
import { getInputClasses } from '@/utils/keyboard-language-utils'
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

    useEffect(() => {
      setCurrentValue(value || '')
    }, [value])

    // Apply RTL/font classes based on text content (not keyboard state)
    const inputClasses = getInputClasses(currentValue as string, showVoiceInput ? 'pr-10' : '')

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value
      setCurrentValue(newValue)
      onChange?.(e)
    }, [onChange])

    const handleVoiceTranscript = useCallback((text: string) => {
      setCurrentValue(text)
      const syntheticEvent = {
        target: { value: text },
        currentTarget: { value: text }
      } as React.ChangeEvent<HTMLInputElement>
      onChange?.(syntheticEvent)
      onVoiceTranscript?.(text)
    }, [onChange, onVoiceTranscript])

    if (showVoiceInput) {
      return (
        <div className={cn('relative', className)}>
          {/* showVoiceInput={false} prevents the base Input from adding its own mic button */}
          <Input
            {...props}
            ref={ref}
            value={currentValue}
            onChange={handleChange}
            showVoiceInput={false}
            className={cn(inputClasses, 'pr-10')}
          />
          <div className='absolute right-2 top-1/2 transform -translate-y-1/2 z-10'>
            {/* No language prop — VoiceInputButton reads language from settings context */}
            <VoiceInputButton
              onTranscript={handleVoiceTranscript}
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
        showVoiceInput={false}
        className={cn(inputClasses, className)}
      />
    )
  }
)

SmartInput.displayName = 'SmartInput'

export default SmartInput
