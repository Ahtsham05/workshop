import { useCallback, useEffect, useRef, useState } from 'react'

// Bumped from `ai-assistant:voice-feedback` — this feature is meant to be on by default, and a
// `v2` key means anyone with a stale `'false'` from earlier local testing gets reset to the new
// default instead of being stuck with it forever.
const FEEDBACK_STORAGE_KEY = 'ai-assistant:voice-feedback:v2'

function readStoredFeedback(): boolean {
  if (typeof window === 'undefined') return true
  const stored = window.localStorage.getItem(FEEDBACK_STORAGE_KEY)
  return stored === null ? true : stored === 'true'
}

/** Voice metadata is inconsistent across browsers/OSes — some voices label gender in the name
 *  ("Microsoft David", "Google UK English Male"), most don't. This is a best-effort default, not
 *  a guarantee: a language with only one (or zero) installed voice just gets what's there. */
function pickVoiceForLang(voices: SpeechSynthesisVoice[], bcp47Lang: string) {
  const matching = voices.filter((v) => v.lang?.toLowerCase().startsWith(bcp47Lang.slice(0, 2).toLowerCase()))
  const voice = matching.find((v) => /male/i.test(v.name) && !/female/i.test(v.name)) || matching[0] || null
  return { matching, voice }
}

/**
 * Thin wrapper around the browser's SpeechSynthesis API — reads the assistant's replies aloud
 * in voice mode. Entirely client-side (no backend/API cost, but also no control over voice
 * quality: which languages have a natural-sounding voice at all, versus a robotic or entirely
 * missing one, is decided by the OS/browser's installed voice packs, not this code).
 *
 * @param bcp47Lang Raw BCP-47 tag (e.g. `'ur-PK'`), independent of the app's i18n language. Acts
 *   as the default voice — `speak()` can override it per call once the language of the specific
 *   text being spoken is known (e.g. auto-detected from the reply).
 */
export function useSpeechSynthesis(bcp47Lang?: string) {
  const [isSupported] = useState(() => typeof window !== 'undefined' && 'speechSynthesis' in window)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [feedbackEnabled, setFeedbackEnabledState] = useState(readStoredFeedback)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  useEffect(() => {
    if (!isSupported) return
    const loadVoices = () => setVoices(window.speechSynthesis.getVoices())
    loadVoices()
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices)
  }, [isSupported])

  useEffect(() => {
    return () => {
      if (isSupported) window.speechSynthesis.cancel()
    }
  }, [isSupported])

  const langCode = bcp47Lang || 'en-US'
  const { matching: matchingVoices, voice: activeVoice } = pickVoiceForLang(voices, langCode)

  const setFeedbackEnabled = useCallback((enabled: boolean) => {
    setFeedbackEnabledState(enabled)
    if (typeof window !== 'undefined') window.localStorage.setItem(FEEDBACK_STORAGE_KEY, String(enabled))
  }, [])

  const cancel = useCallback(() => {
    if (!isSupported) return
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
    setIsPaused(false)
  }, [isSupported])

  const speak = useCallback(
    (text: string, onEnd?: () => void, langOverride?: string) => {
      if (!isSupported || !text.trim()) {
        onEnd?.()
        return
      }
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      const targetLang = langOverride || langCode
      const { voice } = langOverride ? pickVoiceForLang(voices, targetLang) : { voice: activeVoice }
      utterance.lang = targetLang
      if (voice) utterance.voice = voice
      utterance.rate = 1
      utterance.onstart = () => {
        setIsSpeaking(true)
        setIsPaused(false)
      }
      utterance.onend = () => {
        setIsSpeaking(false)
        setIsPaused(false)
        onEnd?.()
      }
      utterance.onerror = () => {
        setIsSpeaking(false)
        setIsPaused(false)
        onEnd?.()
      }
      utteranceRef.current = utterance
      window.speechSynthesis.speak(utterance)
    },
    [isSupported, langCode, activeVoice, voices]
  )

  const togglePause = useCallback(() => {
    if (!isSupported) return
    if (isPaused) {
      window.speechSynthesis.resume()
      setIsPaused(false)
    } else {
      window.speechSynthesis.pause()
      setIsPaused(true)
    }
  }, [isSupported, isPaused])

  const hasVoiceForLang = useCallback((lang: string) => pickVoiceForLang(voices, lang).matching.length > 0, [voices])

  return {
    isSupported,
    /** True when this language has no installed voice at all — reply text still shows, it just won't be spoken. */
    hasVoiceForLanguage: matchingVoices.length > 0,
    /** Same check for an arbitrary BCP-47 tag, not just the hook's bound default — for checking
     *  auto-detected/override languages ahead of speaking them. */
    hasVoiceForLang,
    activeVoice,
    isSpeaking,
    isPaused,
    feedbackEnabled,
    setFeedbackEnabled,
    speak,
    cancel,
    togglePause,
  }
}
