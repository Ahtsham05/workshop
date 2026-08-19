import { useCallback, useRef, useState } from 'react'
import { useRecording, type RecordingEndError, type RecordingStartError } from './use-recording'
import type { useSpeechSynthesis } from './use-speech-synthesis'
import type { AiToolCall } from '@/stores/aiAssistant.api'
import { detectVoiceLanguage } from '../lib/detect-language'
import { VOICE_LANGUAGES } from '../lib/voice-languages'

export type VoiceModeState = 'closed' | 'listening' | 'processing' | 'speaking'
export type VoiceModeError = RecordingEndError | RecordingStartError
export interface VoiceReply {
  text: string
  toolCalls?: AiToolCall[]
}

/**
 * Drives the full-screen voice experience: listening -> processing -> speaking (answer shown,
 * and spoken if feedback is on). From there the user explicitly picks what's next — `askAnother`
 * loops straight back into listening for a hands-free back-and-forth, or `close` returns to the
 * normal chat view, where the same exchange is already sitting in history. Voice and typed
 * messages share one conversation — `onSubmit` is the same send-message path the composer uses,
 * so a voice-originated question lands in history exactly like a typed one.
 */
export function useVoiceMode({
  language,
  autoDetectLanguage,
  synthesis,
  onSubmit,
}: {
  language?: string
  /** When true, `language` is just the STT hint (or unset) — each reply picks its spoken
   *  language fresh from `detectVoiceLanguage(reply.text)` instead of a fixed pre-set one. */
  autoDetectLanguage?: boolean
  synthesis: ReturnType<typeof useSpeechSynthesis>
  onSubmit: (text: string) => Promise<VoiceReply | null>
}) {
  const [state, setState] = useState<VoiceModeState>('closed')
  const [error, setError] = useState<VoiceModeError | null>(null)
  const [lastTranscript, setLastTranscript] = useState('')
  const [lastReply, setLastReply] = useState<VoiceReply | null>(null)
  const recording = useRecording(language)
  // Distinguishes "user closed the overlay" from normal state transitions so an async
  // pressStart()/onSubmit() that resolves after close doesn't resurrect the UI.
  const closingRef = useRef(false)

  const close = useCallback(() => {
    closingRef.current = true
    synthesis.cancel()
    if (recording.isRecording) recording.pressEnd({ cancel: true })
    setState('closed')
  }, [recording, synthesis])

  const beginListening = useCallback(async () => {
    setError(null)
    setLastTranscript('')
    setLastReply(null)
    setState('listening')
    const { started, error: startError } = await recording.pressStart()
    if (closingRef.current) {
      if (started) recording.pressEnd({ cancel: true })
      return
    }
    if (!started) {
      setError(startError)
      setState('closed')
    }
  }, [recording])

  const open = useCallback(async () => {
    closingRef.current = false
    await beginListening()
  }, [beginListening])

  const finishListening = useCallback(async () => {
    const { transcript, error: endError } = recording.pressEnd({})
    if (!transcript) {
      setError(endError)
      setState('closed')
      return
    }
    setLastTranscript(transcript)
    setState('processing')

    const reply = await onSubmit(transcript)
    if (closingRef.current) return

    if (!reply) {
      setState('closed')
      return
    }
    setLastReply(reply)
    // Always land on the answer screen — text stays on-screen either way, and it only actually
    // speaks if voice feedback is on and supported. Nothing here auto-closes back to chat
    // anymore: the user reads (and optionally hears) the answer, then explicitly chooses to ask
    // another question or go back, via the buttons the answer screen renders.
    setState('speaking')
    if (synthesis.isSupported && synthesis.feedbackEnabled) {
      // Detect fresh off the actual reply text (not the question) — that's what's about to be
      // read aloud, so it's the one detection that can never drift out of sync with the voice
      // picked for it.
      const spokenLang = autoDetectLanguage
        ? VOICE_LANGUAGES.find((l) => l.code === detectVoiceLanguage(reply.text))?.bcp47
        : undefined
      synthesis.speak(reply.text, () => {}, spokenLang)
    }
  }, [recording, onSubmit, synthesis, autoDetectLanguage])

  const askAnother = useCallback(async () => {
    synthesis.cancel()
    await beginListening()
  }, [synthesis, beginListening])

  return {
    state,
    isOpen: state !== 'closed',
    error,
    lastTranscript,
    lastReply,
    liveTranscript: recording.liveTranscript,
    levels: recording.levels,
    elapsedSeconds: recording.elapsedSeconds,
    isMicSupported: recording.isSupported,
    synthesis,
    open,
    close,
    finishListening,
    askAnother,
  }
}
