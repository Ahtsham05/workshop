import { useState, useRef, useEffect, useCallback } from 'react';
import { useLanguage } from '@/context/language-context';

interface UseVoiceInputProps {
  onResult: (transcript: string) => void;
  onError: (error: string) => void;
  language?: string; // Add language parameter
}

export const useVoiceInput = ({ onResult, onError, language: propLanguage }: UseVoiceInputProps) => {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const { language: contextLanguage, t } = useLanguage();
  
  // Use prop language if provided, otherwise fall back to context language
  const currentLanguage = propLanguage || (contextLanguage === 'ur' ? 'ur-PK' : 'en-US');

  // Initialize speech recognition only once
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      
      if (SpeechRecognition) {
        setIsSupported(true);
        
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        
        // Set initial language
        recognition.lang = currentLanguage;

        recognition.onstart = () => {
          console.log('Speech recognition started');
          setIsListening(true);
        };

        recognition.onend = () => {
          console.log('Speech recognition ended');
          setIsListening(false);
        };

        recognition.onresult = (event: any) => {
          console.log('Speech recognition result:', event);
          if (event.results && event.results.length > 0) {
            const transcript = event.results[0][0].transcript;
            console.log('Transcript:', transcript);
            onResult(transcript);
          }
        };

        recognition.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
          
          switch (event.error) {
            case 'no-speech':
              onError(t('no_speech_detected'));
              break;
            case 'audio-capture':
              onError(t('microphone_not_available'));
              break;
            case 'not-allowed':
              onError(t('microphone_permission_denied'));
              break;
            case 'network':
              onError(t('network_error_voice_recognition'));
              break;
            case 'aborted':
              // Don't show error for aborted recognition (user stopped it)
              break;
            default:
              onError(`${t('voice_recognition_error')}: ${event.error}`);
              break;
          }
        };

        recognitionRef.current = recognition;
      } else {
        setIsSupported(false);
        console.warn('Speech recognition not supported in this browser');
      }
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []); // Remove dependencies to avoid recreation

  // Update language when language changes
  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = currentLanguage;
      console.log('Updated recognition language to:', currentLanguage);
    }
  }, [currentLanguage]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      onError(t('voice_recognition_error'));
      return;
    }

    if (isListening) {
      console.log('Already listening, ignoring start request');
      return;
    }

    try {
      console.log('Starting speech recognition...');
      recognitionRef.current.start();
    } catch (error) {
      console.error('Failed to start speech recognition:', error);
      onError(t('failed_to_start_voice_recording'));
    }
  }, [isListening, onError, t]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      console.log('Stopping speech recognition...');
      recognitionRef.current.stop();
    }
  }, [isListening]);

  return {
    isListening,
    isSupported,
    startListening,
    stopListening,
  };
};

// Type definitions for Speech Recognition API
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}
