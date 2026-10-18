import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * WhatsApp-style voice notes: the microphone recorded with MediaRecorder (Opus where the
 * browser has it), a live loudness meter for the scrolling waveform, pause/resume with a
 * listen-back of what is recorded so far, and a compact waveform sent with the note so the
 * recipient's bubble draws before the audio downloads.
 */

export type RecorderState = 'idle' | 'starting' | 'recording' | 'paused'

export interface VoiceNote {
  file: File
  /** Seconds, measured while recording (MediaRecorder's WebM has no duration header). */
  duration: number
  /** Loudness bars, 0–100. */
  waveform: number[]
}

/** WhatsApp's limit is far longer, but a shop message over 15 minutes is a mistake. */
export const MAX_VOICE_SECONDS = 15 * 60
/** Shorter than this is a mis-tap ("Hold to record, release to send"). */
export const MIN_VOICE_SECONDS = 1
/** One live level every 100 ms — the recording bar's bar width. */
const LEVEL_EVERY_MS = 100
export const WAVEFORM_BARS = 48

const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm']

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  return MIME_TYPES.find((type) => MediaRecorder.isTypeSupported?.(type)) ?? ''
}

const extensionFor = (mime: string) => (mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm')

/** RMS of one analyser frame → 0–1 on a speech-friendly dB scale (-55 dB silence … -10 dB loud). */
function levelOf(samples: Float32Array<ArrayBuffer>): number {
  let sum = 0
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i]
  const rms = Math.sqrt(sum / samples.length)
  if (rms <= 0) return 0
  const db = 20 * Math.log10(rms)
  return Math.min(1, Math.max(0, (db + 55) / 45))
}

/** Squeezes the live levels into `bars` bars (0–100), scaled to the loudest so quiet voices still show shape. */
export function compressWaveform(levels: number[], bars = WAVEFORM_BARS): number[] {
  if (!levels.length) return Array.from({ length: bars }, () => 4)
  const out: number[] = []
  for (let i = 0; i < bars; i += 1) {
    const from = Math.floor((i * levels.length) / bars)
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / bars))
    let peak = 0
    for (let j = from; j < to && j < levels.length; j += 1) peak = Math.max(peak, levels[j])
    out.push(peak)
  }
  const loudest = Math.max(...out, 0.05)
  return out.map((v) => Math.max(4, Math.min(100, Math.round((v / loudest) * 100))))
}

export function microphoneError(err: unknown): string {
  const name = (err as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Microphone access is blocked. Allow the microphone for this site in your browser, then try again.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone was found on this device.'
  if (name === 'NotReadableError') return 'The microphone is being used by another app. Close it and try again.'
  return 'Could not start the microphone.'
}

export function canRecordVoice(): boolean {
  return typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
}

export function useVoiceRecorder({ onLimit }: { onLimit?: () => void } = {}) {
  const [state, setState] = useState<RecorderState>('idle')
  const [elapsed, setElapsed] = useState(0) // ms recorded (pauses excluded)
  const [levels, setLevels] = useState<number[]>([])

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const levelsRef = useRef<number[]>([])
  const timerRef = useRef<number | null>(null)
  // Time accounting: what was recorded before the current run + when this run started.
  const bankedRef = useRef(0)
  const runStartRef = useRef(0)
  const stateRef = useRef<RecorderState>('idle')
  const onLimitRef = useRef(onLimit)
  onLimitRef.current = onLimit
  // A start that is still waiting for the permission prompt when the person lets go / cancels.
  const startTokenRef = useRef(0)

  const setBoth = (next: RecorderState) => {
    stateRef.current = next
    setState(next)
  }

  const now = () => bankedRef.current + (stateRef.current === 'recording' ? performance.now() - runStartRef.current : 0)

  const teardown = useCallback(() => {
    if (timerRef.current != null) window.clearInterval(timerRef.current)
    timerRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    void audioCtxRef.current?.close().catch(() => undefined)
    audioCtxRef.current = null
    const recorder = recorderRef.current
    recorderRef.current = null
    if (recorder && recorder.state !== 'inactive') {
      recorder.ondataavailable = null
      try {
        recorder.stop()
      } catch {
        /* already stopped */
      }
    }
    chunksRef.current = []
    levelsRef.current = []
    bankedRef.current = 0
    setLevels([])
    setElapsed(0)
    setBoth('idle')
  }, [])

  useEffect(() => () => teardown(), [teardown])

  const start = useCallback(async (): Promise<boolean> => {
    if (stateRef.current !== 'idle') return false
    if (!canRecordVoice()) {
      throw new Error(
        window.isSecureContext === false
          ? 'Voice messages need a secure (https) connection.'
          : 'This browser cannot record voice messages.'
      )
    }
    const token = ++startTokenRef.current
    setBoth('starting')
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      })
    } catch (err) {
      if (token === startTokenRef.current) setBoth('idle')
      throw new Error(microphoneError(err))
    }
    // Cancelled (or released) while the permission prompt was open.
    if (token !== startTokenRef.current || (stateRef.current as RecorderState) !== 'starting') {
      stream.getTracks().forEach((t) => t.stop())
      return false
    }
    streamRef.current = stream
    const mimeType = pickMimeType()
    const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32000 })
    recorderRef.current = recorder
    chunksRef.current = []
    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunksRef.current.push(event.data)
    }

    // Loudness for the live waveform.
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      audioCtxRef.current = ctx
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      ctx.createMediaStreamSource(stream).connect(analyser)
      const buffer = new Float32Array(analyser.fftSize)
      let peak = 0
      let lastPush = performance.now()
      timerRef.current = window.setInterval(() => {
        if (stateRef.current !== 'recording') return
        analyser.getFloatTimeDomainData(buffer)
        peak = Math.max(peak, levelOf(buffer))
        const t = performance.now()
        if (t - lastPush >= LEVEL_EVERY_MS) {
          lastPush = t
          levelsRef.current.push(peak)
          peak = 0
          setLevels(levelsRef.current.slice())
        }
        const ms = now()
        setElapsed(ms)
        if (ms >= MAX_VOICE_SECONDS * 1000) {
          // Stop growing, keep what was said: pause and let them send it.
          pauseRef.current()
          onLimitRef.current?.()
        }
      }, 25)
    } catch {
      // No Web Audio: still record, with a flat bar and a timer.
      timerRef.current = window.setInterval(() => {
        if (stateRef.current !== 'recording') return
        levelsRef.current.push(0.15)
        setLevels(levelsRef.current.slice())
        setElapsed(now())
      }, LEVEL_EVERY_MS)
    }

    // Timeslices so a paused recording can be played back from the chunks so far.
    recorder.start(250)
    bankedRef.current = 0
    runStartRef.current = performance.now()
    setElapsed(0)
    setLevels([])
    levelsRef.current = []
    setBoth('recording')
    return true
     
  }, [])

  const pause = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || stateRef.current !== 'recording') return
    bankedRef.current = now()
    setElapsed(bankedRef.current)
    try {
      recorder.requestData()
      recorder.pause()
    } catch {
      /* some browsers can't pause — keep recording */
      return
    }
    setBoth('paused')
     
  }, [])
  const pauseRef = useRef(pause)
  pauseRef.current = pause

  const resume = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || stateRef.current !== 'paused') return
    if (bankedRef.current >= MAX_VOICE_SECONDS * 1000) {
      onLimitRef.current?.()
      return
    }
    recorder.resume()
    runStartRef.current = performance.now()
    setBoth('recording')
  }, [])

  /** What is recorded so far, playable while paused (WhatsApp's listen-before-send). */
  const snapshot = useCallback((): Blob | null => {
    const recorder = recorderRef.current
    if (!recorder || !chunksRef.current.length) return null
    return new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
  }, [])

  /** Finishes and hands back the note; null if it was too short or nothing was captured. */
  const stop = useCallback((): Promise<VoiceNote | null> => {
    const recorder = recorderRef.current
    if (stateRef.current === 'starting') {
      startTokenRef.current += 1
      teardown()
      return Promise.resolve(null)
    }
    if (!recorder || stateRef.current === 'idle') return Promise.resolve(null)
    const seconds = now() / 1000
    const waveform = compressWaveform(levelsRef.current)
    return new Promise((resolve) => {
      const finish = () => {
        const mime = (recorder.mimeType || 'audio/webm').split(';')[0]
        const blob = new Blob(chunksRef.current, { type: mime })
        teardown()
        if (seconds < MIN_VOICE_SECONDS || !blob.size) return resolve(null)
        const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '.')
        const file = new File([blob], `Voice message ${stamp}.${extensionFor(mime)}`, { type: mime })
        resolve({ file, duration: Math.round(seconds * 10) / 10, waveform })
      }
      recorder.onstop = finish
      try {
        if (recorder.state === 'inactive') finish()
        else recorder.stop()
      } catch {
        finish()
      }
    })
     
  }, [teardown])

  const cancel = useCallback(() => {
    startTokenRef.current += 1
    teardown()
  }, [teardown])

  /** The state right now (the rendered `state` can be a frame behind inside event handlers). */
  const current = useCallback(() => stateRef.current, [])

  return { state, current, elapsed, levels, start, pause, resume, stop, cancel, snapshot }
}
