'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Mic, MicOff } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

interface VoiceInputProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  autoComplete?: string
  name?: string
  id?: string
}

export function VoiceInput({
  value = '',
  onChange,
  placeholder,
  className,
  disabled = false,
  autoComplete,
  name,
  id
}: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const recognitionRef = useRef<any>(null)
  const { language, t } = useLanguage()

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      
      if (SpeechRecognition) {
        setIsSupported(true)
        const recognition = new SpeechRecognition()
        
        // Configure recognition settings
        recognition.continuous = false // Changed to false for better control
        recognition.interimResults = false // Changed to false to avoid partial results
        recognition.maxAlternatives = 1
        
        // Set language based on current language context
        recognition.lang = language === 'ur' ? 'ur-PK' : 'en-PK'
        
        recognition.onstart = () => {
          setIsListening(true)
          toast.success(t('voice_recording_started'))
        }
        
        recognition.onend = () => {
          setIsListening(false)
        }
        
        recognition.onresult = (event: SpeechRecognitionEvent) => {
          let finalTranscript = ''
          
          for (let i = 0; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript
            }
          }
          
          if (finalTranscript && onChange) {
            // Append to existing value if there's already text
            const currentValue = value || ''
            const newValue = currentValue ? `${currentValue} ${finalTranscript}`.trim() : finalTranscript.trim()
            onChange(newValue)
            toast.success(t('voice_recording_stopped'))
          }
        }
        
        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          setIsListening(false)
          console.error('Speech recognition error:', event.error)
          
          switch (event.error) {
            case 'no-speech':
              toast.error(t('no_speech_detected'))
              break
            case 'audio-capture':
              toast.error(t('microphone_not_available'))
              break
            case 'not-allowed':
              toast.error(t('microphone_permission_denied'))
              break
            case 'network':
              toast.error(t('network_error_voice_recognition'))
              break
            case 'aborted':
              // Don't show error for user-initiated abort
              break
            default:
              toast.error(t('voice_recognition_error'))
              break
          }
        }
        
        recognitionRef.current = recognition
      } else {
        setIsSupported(false)
        console.warn('Speech recognition not supported in this browser')
      }
    }
    
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort()
        } catch (error) {
          console.log('Error cleaning up speech recognition:', error)
        }
      }
    }
  }, [language, t]) // Removed value and onChange from dependencies

  // Update language when language context changes
  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = language === 'ur' ? 'ur-PK' : 'en-PK'
    }
  }, [language])

  const startListening = () => {
    if (recognitionRef.current && !isListening && !disabled) {
      try {
        // Ensure previous recognition is stopped
        if (isListening) {
          recognitionRef.current.stop()
        }
        
        // Update language before starting
        recognitionRef.current.lang = language === 'ur' ? 'ur-PK' : 'en-PK'
        
        recognitionRef.current.start()
      } catch (error) {
        console.error('Speech recognition start error:', error)
        setIsListening(false)
        toast.error(t('failed_to_start_voice_recording'))
      }
    }
  }

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      try {
        recognitionRef.current.stop()
      } catch (error) {
        console.error('Speech recognition stop error:', error)
        setIsListening(false)
      }
    }
  }

  const handleVoiceToggle = () => {
    if (!isSupported) {
      toast.error('Speech recognition is not supported in this browser')
      return
    }
    
    if (isListening) {
      stopListening()
    } else {
      startListening()
    }
  }

  return (
    <div className="relative flex items-center">
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'pr-12', 
          className,
          isListening && 'ring-2 ring-red-500 ring-opacity-50'
        )}
        disabled={disabled}
        autoComplete={autoComplete}
        name={name}
        id={id}
      />
      
      {isSupported && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            'absolute right-1 h-8 w-8 p-0 hover:bg-transparent transition-colors',
            isListening && 'text-red-500 hover:text-red-600 bg-red-50',
            !isListening && 'text-muted-foreground hover:text-foreground'
          )}
          onClick={handleVoiceToggle}
          disabled={disabled}
          title={isListening ? t('stop_voice_recording') : t('start_voice_recording')}
        >
          {isListening ? (
            <div className="relative flex items-center justify-center">
              <div className="h-3 w-3 bg-red-500 rounded-full animate-pulse" />
              <div className="absolute h-4 w-4 border-2 border-red-500 rounded-full animate-ping opacity-75" />
            </div>
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </Button>
      )}
      
      {!isSupported && (
        <div 
          className="absolute right-3 text-xs text-muted-foreground"
          title="Voice input not supported in this browser"
        >
          <MicOff className="h-4 w-4" />
        </div>
      )}
    </div>
  )
}

// Type definitions for Speech Recognition API
declare global {
  interface Window {
    SpeechRecognition: any
    webkitSpeechRecognition: any
  }
  
  interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList
    resultIndex: number
  }
  
  interface SpeechRecognitionErrorEvent extends Event {
    error: string
    message: string
  }
}

export default VoiceInput
