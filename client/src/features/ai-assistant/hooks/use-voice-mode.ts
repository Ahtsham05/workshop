import { useCallback, useEffect, useRef, useState } from 'react'
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

// Barge-in: how loud (0..1 RMS, same scale as the waveform bars) and how many consecutive
// ~60ms samples in a row the mic must read before we treat it as the user actually talking
// over the reply, not TTS bleed picked back up through the mic. There's no true acoustic echo
// cancellation available here — `getUserMedia`'s echoCancellation is tuned for a known WebRTC
// "far end" stream, not arbitrary `speechSynthesis` output — so on speaker (non-headphone)
// playback the mic *will* pick up some of the assistant's own voice. Requiring both a level well
// above the resting baseline (0.12, see use-recording.ts) AND that it holds for ~3 samples
// (~180ms) filters out brief bleed transients while staying responsive to a real interruption;
// it is a heuristic, not a guarantee — quiet interruptions on a loud speaker can still be missed,
// and very loud speaker playback close to the mic can still occasionally false-trigger.
const BARGE_IN_LEVEL_THRESHOLD = 0.45
const BARGE_IN_SUSTAIN_SAMPLES = 3

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
  // True while the mic is running in the background during `speaking` purely to detect
  // barge-in — as opposed to a real, user-facing listening turn. Lets the level-watching
  // effect and the speech-end handler agree on whether the mic session in progress is still
  // "just armed" (stop it when TTS ends) or has already been promoted into a real turn by a
  // detected interruption (leave it alone — recording.pressEnd() there would cut the user off).
  const bargeInArmedRef = useRef(false)

  const close = useCallback(() => {
    closingRef.current = true
    bargeInArmedRef.current = false
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
      // Arm the barge-in mic alongside playback (fire-and-forget — if the mic fails to start,
      // e.g. permission revoked mid-session, barge-in just silently isn't available for this
      // reply; TTS still plays either way). Only meaningful while `recording.isSupported`.
      if (recording.isSupported) {
        bargeInArmedRef.current = true
        void recording.pressStart()
      }
      synthesis.speak(
        reply.text,
        () => {
          // Fires on natural end AND on a manual cancel() (browsers route cancel() through the
          // utterance's onerror, which this hook's onEnd also runs from). If a barge-in already
          // promoted the mic to a real turn, bargeInArmedRef is already false — leave it alone.
          if (bargeInArmedRef.current) {
            bargeInArmedRef.current = false
            if (recording.isRecording) recording.pressEnd({ cancel: true })
          }
        },
        spokenLang
      )
    }
  }, [recording, onSubmit, synthesis, autoDetectLanguage])

  // Barge-in detection — only live while a reply is actually being spoken and the mic is
  // armed for it. `recording.levels` is a rolling window, most-recent-last (see use-recording),
  // so the last BARGE_IN_SUSTAIN_SAMPLES entries are the most recent consecutive readings.
  useEffect(() => {
    if (state !== 'speaking' || !bargeInArmedRef.current) return
    const recent = recording.levels.slice(-BARGE_IN_SUSTAIN_SAMPLES)
    const isSustainedLoud = recent.length === BARGE_IN_SUSTAIN_SAMPLES && recent.every((level) => level >= BARGE_IN_LEVEL_THRESHOLD)
    if (!isSustainedLoud) return

    bargeInArmedRef.current = false
    synthesis.cancel()
    setState('listening')
  }, [recording.levels, state, synthesis])

  const askAnother = useCallback(async () => {
    // The mic may already be running as an armed-but-not-yet-triggered barge-in session (the
    // user tapped Ask Another while still mid-reply) — promote it in place instead of calling
    // pressStart() again, which would no-op against an already-active recognition session and
    // read back as a start failure.
    if (bargeInArmedRef.current && recording.isRecording) {
      bargeInArmedRef.current = false
      synthesis.cancel()
      setState('listening')
      return
    }
    synthesis.cancel()
    await beginListening()
  }, [synthesis, beginListening, recording])

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
    /** Whether the mic is currently armed to detect the user talking over the reply — see the
     *  barge-in detection effect above. Purely informational, for a UI hint. */
    canBargeIn: recording.isSupported,
    synthesis,
    open,
    close,
    finishListening,
    askAnother,
  }
}
