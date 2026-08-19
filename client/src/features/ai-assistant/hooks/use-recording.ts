import { useCallback, useEffect, useRef, useState } from 'react'

export type RecordingStartError = 'permission-denied' | 'start-failed'
export type RecordingEndError = 'permission-denied' | 'no-speech' | 'mic-unavailable' | 'recognition-error'

// Number of bars the waveform renders and the resting height (0..1) they sit at when there's
// no signal yet, so the bar row reads as "live" rather than a flat line at zero.
const WAVEFORM_BAR_COUNT = 32
const WAVEFORM_BASELINE = 0.12

function createBaselineLevels() {
  return Array(WAVEFORM_BAR_COUNT).fill(WAVEFORM_BASELINE)
}

/**
 * Press-and-hold speech capture powering the full-screen voice mode. Keeps listening for as
 * long as the mic is open (continuous + interim results), tracks elapsed time so the UI can
 * show a live mm:ss timer, and actively requests microphone permission up front so the
 * browser's "Allow microphone" prompt reliably appears instead of `SpeechRecognition` failing
 * silently.
 *
 * @param bcp47Lang Raw BCP-47 tag (e.g. `'ur-PK'`) — the caller resolves this, independent of
 *   the app's own i18n language, so voice mode can listen in a language the rest of the UI
 *   isn't translated into.
 */
export function useRecording(bcp47Lang?: string) {
  const [isRecording, setIsRecording] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [isSupported, setIsSupported] = useState(false)
  // Rolling window of recent mic amplitude samples (0..1), oldest first, driving a
  // scrolling waveform like voice-note recorders show.
  const [levels, setLevels] = useState<number[]>(createBaselineLevels)
  // Mirrors transcriptRef/interimRef into state, updated on every `onresult`, so a live
  // transcript can be displayed while the user is still talking (e.g. the full-screen voice
  // mode) instead of only being available once they release/stop.
  const [liveTranscript, setLiveTranscript] = useState('')

  const recognitionRef = useRef<any>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const levelsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const transcriptRef = useRef('')
  // Chrome only marks a result `isFinal` after it decides (via its own silence-based
  // endpointing) that you've stopped talking — often a couple of SECONDS after you
  // actually finished. Waiting for that would make release feel laggy, unlike a WhatsApp
  // voice note. `interimRef` holds the latest not-yet-final text, updated live on every
  // `onresult` as you speak, so release can use it immediately instead of waiting.
  const interimRef = useRef('')
  const cancelledRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAtRef = useRef(0)
  const lastErrorRef = useRef<RecordingEndError | null>(null)
  // Tracks whether the USER still wants to be listening, independent of the engine's own
  // started/stopped state — lets `onend` tell an unexpected stop (Chrome silently ends
  // "continuous" sessions after a stretch of silence, sometimes well under a minute, even
  // though we never called stop()) apart from a deliberate `pressEnd()`.
  const wantsListeningRef = useRef(false)

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setIsSupported(false)
      return
    }
    setIsSupported(true)

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    // Leave `.lang` unset in auto-detect mode (no `bcp47Lang`) rather than forcing 'en-US' —
    // the engine then falls back to the browser/OS locale, which for a non-English speaker is
    // often a better guess than hardcoding English. A specific `bcp47Lang` (manual override)
    // still pins it exactly, since accurate transcription needs the right language hinted
    // upfront — the Web Speech API has no true "detect what's being spoken" mode.
    if (bcp47Lang) recognition.lang = bcp47Lang

    recognition.onresult = (event: any) => {
      let finalChunk = ''
      let interimChunk = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        if (result.isFinal) {
          finalChunk += result[0].transcript
        } else {
          interimChunk += result[0].transcript
        }
      }
      if (finalChunk) {
        transcriptRef.current = `${transcriptRef.current} ${finalChunk}`.trim()
      }
      interimRef.current = interimChunk
      setLiveTranscript(`${transcriptRef.current} ${interimRef.current}`.trim())
    }

    recognition.onerror = (event: any) => {
      const code = event?.error
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        lastErrorRef.current = 'permission-denied'
      } else if (code === 'audio-capture') {
        lastErrorRef.current = 'mic-unavailable'
      } else if (code === 'no-speech') {
        lastErrorRef.current = 'no-speech'
      } else if (code !== 'aborted') {
        lastErrorRef.current = 'recognition-error'
      }
    }

    // Chrome fires `onend` on its own well before the user releases the button — most
    // commonly right after a `no-speech` timeout, or with no error at all once it hits an
    // internal duration cap. If the user is still holding and the reason was benign,
    // restart transparently so the hold keeps listening instead of silently going dead
    // while the UI still says "Listening…". Anything else (permission/mic/network trouble)
    // is left alone — restarting into the same failure would just spin — so it stops
    // cleanly and surfaces through the normal pressEnd() error path on release.
    recognition.onend = () => {
      if (!wantsListeningRef.current) return
      const benign = lastErrorRef.current === null || lastErrorRef.current === 'no-speech'
      if (!benign) {
        wantsListeningRef.current = false
        stopTimer()
        stopAudioMeter()
        setIsRecording(false)
        return
      }
      // The engine's internal results list resets on restart — commit whatever was still
      // pending as if final now, or a mid-hold restart would silently drop it.
      if (interimRef.current) {
        transcriptRef.current = `${transcriptRef.current} ${interimRef.current}`.trim()
        interimRef.current = ''
      }
      lastErrorRef.current = null
      try {
        recognition.start()
      } catch {
        wantsListeningRef.current = false
        stopTimer()
        setIsRecording(false)
      }
    }

    recognitionRef.current = recognition

    return () => {
      wantsListeningRef.current = false
      try {
        recognition.abort()
      } catch {
        // ignore
      }
      stopAudioMeter()
    }
  }, [bcp47Lang])

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  /**
   * Analyses the live mic stream to drive a reactive waveform, sampling amplitude on an
   * interval (not every animation frame) so the bar row updates smoothly without re-rendering
   * at 60fps. Purely cosmetic — SpeechRecognition captures audio independently, so if this
   * fails to set up the transcript still works, just without the waveform.
   */
  const startAudioMeter = (stream: MediaStream) => {
    micStreamRef.current = stream
    try {
      const AudioContextCtor =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const audioCtx = new AudioContextCtor()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.5
      source.connect(analyser)
      audioCtxRef.current = audioCtx
      const buffer = new Uint8Array(analyser.frequencyBinCount)
      levelsTimerRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(buffer)
        let sumSquares = 0
        for (let i = 0; i < buffer.length; i += 1) {
          const normalized = (buffer[i] - 128) / 128
          sumSquares += normalized * normalized
        }
        const rms = Math.sqrt(sumSquares / buffer.length)
        const amplitude = Math.max(WAVEFORM_BASELINE, Math.min(1, rms * 4))
        setLevels((prev) => [...prev.slice(1), amplitude])
      }, 60)
    } catch {
      // ignore — waveform is best-effort
    }
  }

  const stopAudioMeter = () => {
    if (levelsTimerRef.current) {
      clearInterval(levelsTimerRef.current)
      levelsTimerRef.current = null
    }
    micStreamRef.current?.getTracks().forEach((track) => track.stop())
    micStreamRef.current = null
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    setLevels(createBaselineLevels())
  }

  const pressStart = useCallback(async (): Promise<{ started: boolean; error: RecordingStartError | null }> => {
    if (!recognitionRef.current || isRecording) return { started: false, error: null }

    let stream: MediaStream | null = null
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch {
        return { started: false, error: 'permission-denied' }
      }
    }

    transcriptRef.current = ''
    interimRef.current = ''
    cancelledRef.current = false
    lastErrorRef.current = null
    startedAtRef.current = Date.now()
    setElapsedSeconds(0)
    setLiveTranscript('')
    try {
      wantsListeningRef.current = true
      recognitionRef.current.start()
      setIsRecording(true)
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000))
      }, 250)
      if (stream) startAudioMeter(stream)
      return { started: true, error: null }
    } catch {
      wantsListeningRef.current = false
      setIsRecording(false)
      stream?.getTracks().forEach((track) => track.stop())
      return { started: false, error: 'start-failed' }
    }
  }, [isRecording])

  /** Stops listening. Returns the captured transcript (or null) plus why it might be empty. */
  const pressEnd = useCallback((opts: { cancel?: boolean } = {}): { transcript: string | null; error: RecordingEndError | null } => {
    if (!recognitionRef.current) return { transcript: null, error: null }
    wantsListeningRef.current = false
    cancelledRef.current = !!opts.cancel
    stopTimer()
    stopAudioMeter()
    try {
      recognitionRef.current.stop()
    } catch {
      // ignore
    }
    setIsRecording(false)
    // Use whatever's pending right now rather than only what Chrome has already marked
    // final — that's the fix for "must pause a couple seconds before releasing or it
    // drops the last words": the interim text is already there, updated live as you speak.
    const transcript = `${transcriptRef.current} ${interimRef.current}`.trim()
    const error = lastErrorRef.current
    transcriptRef.current = ''
    interimRef.current = ''
    lastErrorRef.current = null
    setLiveTranscript('')
    if (cancelledRef.current) return { transcript: null, error: null }
    if (!transcript) return { transcript: null, error }
    return { transcript, error: null }
  }, [])

  return { isRecording, elapsedSeconds, isSupported, levels, liveTranscript, pressStart, pressEnd }
}
