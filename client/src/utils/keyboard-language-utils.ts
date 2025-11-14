import { useState, useCallback } from 'react'

/**
 * Keyboard language detection and font utilities
 */

// Global state for manual keyboard language override
let manualKeyboardLanguage: 'ur' | 'en' | null = null

/**
 * Manually set the keyboard language (useful for testing or manual override)
 * @param language - 'ur' | 'en' | null (null to auto-detect)
 */
export const setManualKeyboardLanguage = (language: 'ur' | 'en' | null) => {
  try {
    manualKeyboardLanguage = language
    console.log('🔤 Manual keyboard language set to:', language)
  } catch (error) {
    console.warn('Error setting manual keyboard language:', error)
  }
}

/**
 * Get the manually set keyboard language
 * @returns 'ur' | 'en' | null
 */
export const getManualKeyboardLanguage = (): 'ur' | 'en' | null => {
  try {
    return manualKeyboardLanguage
  } catch (error) {
    console.warn('Error getting manual keyboard language:', error)
    return null
  }
}

/**
 * Detect keyboard language based on input text patterns and browser settings
 * @param text - The text being typed
 * @returns 'ur' | 'en' - detected language
 */
export const detectKeyboardLanguage = (text: string): 'ur' | 'en' => {
  if (!text || text.trim() === '') {
    // If no text, try to detect from browser/system keyboard
    const systemLang = getSystemKeyboardLanguage()
    return systemLang
  }
  
  // Check if text contains Urdu/Arabic characters
  const urduRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/
  const hasUrduChars = urduRegex.test(text)
  
  // Check if text contains English characters
  const englishRegex = /[a-zA-Z]/
  const hasEnglishChars = englishRegex.test(text)
  
  // If mixed content, determine which is dominant
  if (hasUrduChars && hasEnglishChars) {
    const urduMatches = text.match(urduRegex)?.length || 0
    const englishMatches = text.match(englishRegex)?.length || 0
    return urduMatches >= englishMatches ? 'ur' : 'en'
  }
  
  // If only one type of characters
  if (hasUrduChars) return 'ur'
  if (hasEnglishChars) return 'en'
  
  // Default to system keyboard language
  return getSystemKeyboardLanguage()
}

/**
 * Get system keyboard language from browser settings
 * @returns 'ur' | 'en' - detected system language
 */
export const getSystemKeyboardLanguage = (): 'ur' | 'en' => {
  // Try to get keyboard language from navigator
  const navigatorLanguage = navigator.language || navigator.languages?.[0] || 'en'
  
  // Check for Urdu/Arabic language codes
  if (navigatorLanguage.includes('ur') || navigatorLanguage.includes('pk') || navigatorLanguage.includes('arab')) {
    return 'ur'
  }
  
  // Check all available languages
  const allLanguages = navigator.languages || [navigatorLanguage]
  const hasUrdu = allLanguages.some(lang => 
    lang.toLowerCase().includes('ur') || 
    lang.toLowerCase().includes('pk') ||
    lang.toLowerCase().includes('urdu') ||
    lang.toLowerCase().includes('arab')
  )
  
  if (hasUrdu) {
    return 'ur'
  }
  
  return 'en'
}

/**
 * Real-time keyboard language detection with multiple methods
 */
export const getRealTimeKeyboardLanguage = (): 'ur' | 'en' => {
  try {
    // First check manual override
    const manual = getManualKeyboardLanguage()
    if (manual) {
      console.log('🔤 Using manual keyboard language override:', manual)
      return manual
    }

    // Use basic system detection without calling detectCurrentKeyboardLanguage to avoid circular dependency
    const systemLang = getSystemKeyboardLanguage()
    console.log('🔤 Real-time detected keyboard language:', systemLang)
    return systemLang
  } catch (error) {
    console.warn('Error in real-time keyboard language detection:', error)
    return 'en'
  }
}

/**
 * Detect current keyboard language with real-time detection
 * Uses multiple methods to detect the active keyboard layout
 * @returns 'ur' | 'en' - detected keyboard language
 */
export const detectCurrentKeyboardLanguage = (): 'ur' | 'en' => {
  try {
    // Check manual override first
    const manual = getManualKeyboardLanguage()
    if (manual) {
      console.log('🔤 Using manual keyboard language override:', manual)
      return manual
    }
    
    // Check browser language and keyboard settings
    const browserLang = (typeof navigator !== 'undefined' && navigator.language) || 
                       (typeof navigator !== 'undefined' && navigator.languages?.[0]) || 'en'
    console.log('🔤 Browser Language:', browserLang)
    
    if (browserLang.includes('ur') || browserLang.includes('pk') || browserLang.toLowerCase().includes('urdu')) {
      console.log('🔤 Detected Urdu from browser language')
      return 'ur'
    }

    // Check for Urdu/Arabic in any of the navigator languages
    const languages = (typeof navigator !== 'undefined' && navigator.languages) || 
                     [(typeof navigator !== 'undefined' && navigator.language) || 'en']
    const hasUrduLanguage = languages.some(lang => 
      lang && (lang.includes('ur') || lang.includes('pk') || lang.toLowerCase().includes('urdu') || lang.includes('arab'))
    )
    
    if (hasUrduLanguage) {
      console.log('🔤 Detected Urdu from navigator languages:', languages)
      return 'ur'
    }

    // Check document direction or any RTL indicators
    if (typeof document !== 'undefined') {
      const documentDir = document.documentElement.dir || document.body.dir
      if (documentDir === 'rtl') {
        console.log('🔤 Detected RTL document direction')
        return 'ur'
      }
    }

    // Use system language as fallback
    const systemLang = getSystemKeyboardLanguage()
    console.log('🔤 Using system language fallback:', systemLang)
    return systemLang
  } catch (error) {
    console.warn('Error detecting keyboard language:', error)
    return 'en'
  }
}

/**
 * Get input classes with proper styling based on detected language
 * @param text - The text to analyze for language detection
 * @param additionalClasses - Additional CSS classes to apply
 * @returns CSS class string with appropriate font and direction
 */
export const getInputClasses = (text: string, additionalClasses: string = ''): string => {
  const keyboardLang = detectKeyboardLanguage(text)
  const fontClass = keyboardLang === 'ur' ? 'font-urdu' : 'font-inter'
  const directionClass = keyboardLang === 'ur' ? 'rtl' : 'ltr'
  
  return [fontClass, directionClass, additionalClasses].filter(Boolean).join(' ')
}

/**
 * Get voice input language based on detected keyboard language
 * @param text - Current input text
 * @returns string - Language code for voice input ('ur-PK' | 'en-US')
 */
export const getVoiceInputLanguage = (text: string): string => {
  const keyboardLang = detectKeyboardLanguage(text)
  return keyboardLang === 'ur' ? 'ur-PK' : 'en-US'
}

/**
 * Hook to track keyboard language changes in real-time
 * @param initialText - Initial text value
 * @returns object with current language and font classes
 */
export const useKeyboardLanguage = (initialText: string = '') => {
  const [currentText, setCurrentText] = useState(initialText)
  const [keyboardLang, setKeyboardLang] = useState<'ur' | 'en'>(() => 
    detectKeyboardLanguage(initialText)
  )
  
  const updateText = useCallback((newText: string) => {
    setCurrentText(newText)
    const detectedLang = detectKeyboardLanguage(newText)
    setKeyboardLang(detectedLang)
  }, [])
  
  const getClasses = useCallback((additionalClasses: string = '') => {
    return getInputClasses(currentText, additionalClasses)
  }, [currentText])
  
  const getVoiceLang = useCallback(() => {
    return getVoiceInputLanguage(currentText)
  }, [currentText])
  
  return {
    keyboardLang,
    currentText,
    updateText,
    getClasses,
    getVoiceLang,
    isUrdu: keyboardLang === 'ur',
    isEnglish: keyboardLang === 'en'
  }
}
