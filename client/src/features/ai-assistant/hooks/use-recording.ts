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
  const cancelledRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAtRef = useRef(0)
  const lastErrorRef = useRef<RecordingEndError | null>(null)

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
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) {
          finalChunk += event.results[i][0].transcript
        }
      }
      if (finalChunk) {
        transcriptRef.current = `${transcriptRef.current} ${finalChunk}`.trim()
      }
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

    recognitionRef.current = recognition

    return () => {
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
    cancelledRef.current = false
    lastErrorRef.current = null
    startedAtRef.current = Date.now()
    setElapsedSeconds(0)
    try {
      recognitionRef.current.start()
      setIsRecording(true)
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000))
      }, 250)
      return { started: true, error: null }
    } catch {
      setIsRecording(false)
      return { started: false, error: 'start-failed' }
    }
  }, [isRecording])

  /** Stops listening. Returns the captured transcript (or null) plus why it might be empty. */
  const pressEnd = useCallback((opts: { cancel?: boolean } = {}): { transcript: string | null; error: RecordingEndError | null } => {
    if (!recognitionRef.current) return { transcript: null, error: null }
    cancelledRef.current = !!opts.cancel
    stopTimer()
    try {
      recognitionRef.current.stop()
    } catch {
      // ignore
    }
    setIsRecording(false)
    const transcript = transcriptRef.current.trim()
    const error = lastErrorRef.current
    transcriptRef.current = ''
    lastErrorRef.current = null
    if (cancelledRef.current) return { transcript: null, error: null }
    if (!transcript) return { transcript: null, error }
    return { transcript, error: null }
  }, [])

  return { isRecording, elapsedSeconds, isSupported, pressStart, pressEnd }
}
