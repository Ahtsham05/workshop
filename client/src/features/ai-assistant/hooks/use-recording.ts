import { useCallback, useEffect, useRef, useState } from 'react'

const SPEECH_LANGUAGE_CODES: Record<string, string> = {
  en: 'en-US',
  ur: 'ur-PK',
  ar: 'ar-SA',
  hi: 'hi-IN',
}

export type RecordingStartError = 'permission-denied' | 'start-failed'
export type RecordingEndError = 'permission-denied' | 'no-speech' | 'mic-unavailable' | 'recognition-error'

/**
 * Press-and-hold speech capture for a WhatsApp-style recording bar.
 * Unlike the shared single-shot `useVoiceInput`, this keeps listening for as
 * long as the button is held (continuous + interim results), tracks elapsed
 * time so the UI can show a live mm:ss timer, and actively requests
 * microphone permission up front so the browser's "Allow microphone" prompt
 * reliably appears instead of `SpeechRecognition` failing silently.
 */
export function useRecording(language?: string) {
  const [isRecording, setIsRecording] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [isSupported, setIsSupported] = useState(false)

  const recognitionRef = useRef<any>(null)
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
    recognition.lang = SPEECH_LANGUAGE_CODES[language ?? ''] || 'en-US'

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
    }
  }, [language])

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  /** Actively triggers the browser's microphone permission prompt if it hasn't been decided yet. */
  const ensureMicPermission = async (): Promise<boolean> => {
    if (!navigator.mediaDevices?.getUserMedia) return true
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      return true
    } catch {
      return false
    }
  }

  const pressStart = useCallback(async (): Promise<{ started: boolean; error: RecordingStartError | null }> => {
    if (!recognitionRef.current || isRecording) return { started: false, error: null }

    const granted = await ensureMicPermission()
    if (!granted) {
      return { started: false, error: 'permission-denied' }
    }

    transcriptRef.current = ''
    interimRef.current = ''
    cancelledRef.current = false
    lastErrorRef.current = null
    startedAtRef.current = Date.now()
    setElapsedSeconds(0)
    try {
      wantsListeningRef.current = true
      recognitionRef.current.start()
      setIsRecording(true)
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000))
      }, 250)
      return { started: true, error: null }
    } catch {
      wantsListeningRef.current = false
      setIsRecording(false)
      return { started: false, error: 'start-failed' }
    }
  }, [isRecording])

  /** Stops listening. Returns the captured transcript (or null) plus why it might be empty. */
  const pressEnd = useCallback((opts: { cancel?: boolean } = {}): { transcript: string | null; error: RecordingEndError | null } => {
    if (!recognitionRef.current) return { transcript: null, error: null }
    wantsListeningRef.current = false
    cancelledRef.current = !!opts.cancel
    stopTimer()
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
    if (cancelledRef.current) return { transcript: null, error: null }
    if (!transcript) return { transcript: null, error }
    return { transcript, error: null }
  }, [])

  return { isRecording, elapsedSeconds, isSupported, pressStart, pressEnd }
}
