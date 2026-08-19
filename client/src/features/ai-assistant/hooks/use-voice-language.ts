import { useCallback, useState } from 'react'
import { VOICE_LANGUAGES, DEFAULT_VOICE_LANGUAGE, type VoiceLanguageSelection } from '../lib/voice-languages'

const STORAGE_KEY = 'ai-assistant:voice-language'
const AUTO: VoiceLanguageSelection = 'auto'

function readStored(): VoiceLanguageSelection {
  if (typeof window === 'undefined') return AUTO
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === null) return AUTO
  return VOICE_LANGUAGES.some((l) => l.code === stored) ? (stored as VoiceLanguageSelection) : AUTO
}

/**
 * Voice mode's own language preference — persisted, but entirely separate from the app-wide
 * `useLanguage()` context so picking a voice language here never re-translates the rest of the UI.
 *
 * Defaults to `'auto'`: voice mode detects the language of what's said/replied per-utterance
 * (see `detectVoiceLanguage`) instead of requiring an upfront pick. Choosing a specific language
 * from the selector pins both listening and replies to it, overriding detection — useful when
 * detection guesses wrong, or the user just prefers one language every time.
 */
export function useVoiceLanguage() {
  const [selection, setSelection] = useState<VoiceLanguageSelection>(readStored)

  const setCode = useCallback((code: VoiceLanguageSelection) => {
    setSelection(code)
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, code)
  }, [])

  const isAuto = selection === AUTO
  const option = isAuto ? DEFAULT_VOICE_LANGUAGE : VOICE_LANGUAGES.find((l) => l.code === selection) ?? DEFAULT_VOICE_LANGUAGE

  return { selection, option, isAuto, setCode }
}
