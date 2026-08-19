export interface VoiceLanguageOption {
  code: 'en' | 'ur' | 'pa'
  label: string
  nativeLabel: string
  flag: string
  /** BCP-47 tag used for both SpeechRecognition and SpeechSynthesis. */
  bcp47: string
}

// Scoped to voice mode only — deliberately NOT the app's global i18n language list, so picking
// a voice language here never touches the rest of the UI's translation.
export const VOICE_LANGUAGES: VoiceLanguageOption[] = [
  { code: 'en', label: 'English', nativeLabel: 'English', flag: '🇺🇸', bcp47: 'en-US' },
  { code: 'ur', label: 'Urdu', nativeLabel: 'اردو', flag: '🇵🇰', bcp47: 'ur-PK' },
  { code: 'pa', label: 'Punjabi', nativeLabel: 'ਪੰਜਾਬੀ', flag: '🇮🇳', bcp47: 'pa-IN' },
]

export const DEFAULT_VOICE_LANGUAGE = VOICE_LANGUAGES[0]

/** `'auto'` means "detect per-utterance from what's actually said/replied" — see `detectVoiceLanguage`.
 *  Any concrete `VoiceLanguageOption['code']` pins listening + replies to that one language instead. */
export type VoiceLanguageSelection = VoiceLanguageOption['code'] | 'auto'
