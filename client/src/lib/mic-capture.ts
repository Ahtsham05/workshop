import { NoiseSuppressorWorklet_Name } from '@timephy/rnnoise-wasm'
import rnnoiseWorkletUrl from '@timephy/rnnoise-wasm/NoiseSuppressorWorklet?worker&url'
import levelerWorkletUrl from '@/lib/audio/voice-leveler.worklet.ts?worker&url'
import { VOICE_LEVELER_NAME } from '@/lib/audio/voice-leveler-config'

/**
 * How the voice was cleaned:
 *  - 'ai'      RNNoise (a neural noise suppressor) followed by a speech leveller. Removes keyboard
 *              clicks, fans, hum and background voices; leaves silence between phrases.
 *  - 'browser' the browser's own suppression, used only when the AI worklets can't start.
 */
export type MicSuppression = 'ai' | 'browser'

export type MicFailure = 'denied' | 'missing' | 'busy' | 'unknown'

export class MicUnavailableError extends Error {
  readonly reason: MicFailure
  constructor(reason: MicFailure) {
    super(`Microphone unavailable: ${reason}`)
    this.reason = reason
  }
}

export type CleanMic = {
  /** The cleaned audio to record. */
  track: MediaStreamTrack
  suppression: MicSuppression
  setMuted: (muted: boolean) => void
  /** Loudness of what is actually being recorded, 0 (silent) to 1 (loud) — drives the level meter. */
  getLevel: () => number
  /** Fires if the microphone is unplugged or taken away mid-recording. */
  onEnded: (listener: () => void) => void
  stop: () => void
}

export function canRecordMic(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'
}

/** 'unknown' where the Permissions API doesn't cover the microphone (Safari, older Firefox). */
export async function getMicPermission(): Promise<PermissionState | 'unknown'> {
  try {
    return (await navigator.permissions.query({ name: 'microphone' as PermissionName })).state
  } catch {
    return 'unknown'
  }
}

/**
 * Fails fast — before the person has been through the screen-share prompt — when a microphone
 * can't possibly work: blocked for this site, or no input device at all. Returns the permission
 * state so the caller knows whether opening the mic will pop a prompt.
 */
export async function checkMicUsable(): Promise<PermissionState | 'unknown'> {
  const permission = await getMicPermission()
  if (permission === 'denied') throw new MicUnavailableError('denied')
  const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [])
  if (devices.length > 0 && !devices.some((device) => device.kind === 'audioinput')) {
    throw new MicUnavailableError('missing')
  }
  return permission
}

function toMicError(error: unknown): MicUnavailableError {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return new MicUnavailableError('denied')
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return new MicUnavailableError('missing')
  if (name === 'NotReadableError' || name === 'AbortError') return new MicUnavailableError('busy')
  return new MicUnavailableError('unknown')
}

/** The worklets need a 48 kHz context (RNNoise works on 480-sample frames = 10 ms). Resolves to
 * null instead of throwing, so any failure just means "use the browser's suppression". */
async function prepareAiContext(): Promise<AudioContext | null> {
  let context: AudioContext | undefined
  try {
    context = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' })
    await context.audioWorklet.addModule(rnnoiseWorkletUrl)
    await context.audioWorklet.addModule(levelerWorkletUrl)
    return context
  } catch {
    void context?.close()
    return null
  }
}

/** Mono, echo-cancelled; the browser's own noise suppression and gain control are left off because
 * the AI chain does that job (stacking both only thinned the voice without removing more noise). */
function openMicStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: false, autoGainControl: false },
  })
}

/**
 * Opens the microphone and returns a cleaned track. The worklets load in parallel with the
 * microphone opening, and — when the person already granted access — this is started before the
 * screen-share picker so the noise suppressor is already tuned in when recording begins.
 */
export async function connectCleanMic(): Promise<CleanMic> {
  const [streamResult, contextResult] = await Promise.allSettled([openMicStream(), prepareAiContext()])
  const aiContext = contextResult.status === 'fulfilled' ? contextResult.value : null

  if (streamResult.status === 'rejected') {
    void aiContext?.close()
    throw toMicError(streamResult.reason)
  }
  let stream = streamResult.value
  const suppression: MicSuppression = aiContext ? 'ai' : 'browser'

  let context: AudioContext | undefined
  try {
    if (!aiContext) {
      // No worklets, so the browser has to do the cleaning — and it only reliably does so when
      // asked at open time (switching it on for a live track was measured to be ignored).
      // Access is already granted, so reopening is silent.
      stream.getTracks().forEach((t) => t.stop())
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    }
    context = aiContext ?? new AudioContext({ latencyHint: 'interactive' })
    await context.resume()

    const source = context.createMediaStreamSource(stream)
    // Below the lowest voices: takes out rumble, desk thumps and the mains-hum fundamental.
    const highpass = context.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.value = 85
    highpass.Q.value = 0.707
    const mute = context.createGain()
    const analyser = context.createAnalyser()
    analyser.fftSize = 1024
    const destination = context.createMediaStreamDestination()
    destination.channelCount = 1 // a voice is mono; the default of 2 would just duplicate it and waste bitrate

    const monoNode = (name: string) =>
      new AudioWorkletNode(context!, name, { channelCount: 1, channelCountMode: 'explicit', outputChannelCount: [1] })
    let tail: AudioNode = source.connect(highpass)
    if (aiContext) tail = tail.connect(monoNode(NoiseSuppressorWorklet_Name)).connect(monoNode(VOICE_LEVELER_NAME))
    tail.connect(mute)
    mute.connect(analyser) // a tap only: it reads what is being recorded, after the mute
    mute.connect(destination)

    const samples = new Float32Array(analyser.fftSize)
    const track = destination.stream.getAudioTracks()[0]
    let stopped = false

    return {
      track,
      suppression,
      setMuted: (muted) => mute.gain.setTargetAtTime(muted ? 0 : 1, context!.currentTime, 0.015),
      getLevel: () => {
        analyser.getFloatTimeDomainData(samples)
        let sum = 0
        for (const sample of samples) sum += sample * sample
        const db = 20 * Math.log10(Math.sqrt(sum / samples.length) + 1e-9)
        return Math.min(1, Math.max(0, (db + 60) / 45)) // -60 dBFS → 0, -15 dBFS → 1
      },
      onEnded: (listener) => stream.getAudioTracks()[0]?.addEventListener('ended', listener),
      stop: () => {
        if (stopped) return
        stopped = true
        stream.getTracks().forEach((t) => t.stop())
        track.stop()
        void context?.close()
      },
    }
  } catch (error) {
    stream.getTracks().forEach((t) => t.stop())
    void context?.close()
    throw toMicError(error)
  }
}
