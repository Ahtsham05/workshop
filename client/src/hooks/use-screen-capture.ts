import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  buildCaptureFilename,
  canRecordScreen,
  captureScreenshot,
  CaptureCancelledError,
  MAX_RECORDING_SECONDS,
  startScreenRecording,
  type ScreenRecording,
  type ScreenshotMethod,
} from '@/lib/screen-capture'
import { canRecordMic, MicUnavailableError, type CleanMic, type MicFailure, type MicSuppression } from '@/lib/mic-capture'

export const SCREENSHOT_SHORTCUT = 'Alt+Shift+S'
export const RECORD_SHORTCUT = 'Alt+Shift+R'
export const MUTE_SHORTCUT = 'Alt+Shift+M'

const MIC_PREF_KEY = 'capture.mic'

// A per-device convenience only: the page works the same when storage is blocked or empty.
function readMicPref(): boolean {
  try {
    return localStorage.getItem(MIC_PREF_KEY) === '1'
  } catch {
    return false
  }
}

const MIC_FAILURE_TEXT: Record<MicFailure, { title: string; description: string }> = {
  denied: {
    title: 'Microphone is blocked',
    description: 'Allow the microphone for this site (lock icon in the address bar), or untick “Record microphone”.',
  },
  missing: {
    title: 'No microphone found',
    description: 'Plug one in, or untick “Record microphone” to record without sound.',
  },
  busy: {
    title: 'Microphone is in use by another app',
    description: 'Close the other app, or untick “Record microphone”.',
  },
  unknown: {
    title: "Couldn't open the microphone",
    description: 'Untick “Record microphone” to record without sound.',
  },
}

export type CaptureResult = {
  kind: 'image' | 'video'
  blob: Blob
  /** Object URL for previewing/downloading; revoked when the result is dismissed. */
  url: string
  filename: string
  /** How a screenshot was taken: 'tab' is an exact copy of what the browser painted, 'dom' an approximation redrawn from the page. */
  method?: ScreenshotMethod
  /** For a recording with a microphone: how the voice was cleaned. Absent = no audio. */
  audio?: MicSuppression
}

/** What the hook is waiting on. Kept in a ref only — the header must look identical while a
 * screenshot is being taken, so none of this is rendered (feedback goes through toasts). */
type Busy = 'capturing' | 'starting' | null

/**
 * Owns screenshot + screen-recording state for the header camera button.
 *
 * The keyboard shortcuts live here (capture phase on `window`) rather than on the button because
 * a modal dialog makes the whole header unclickable — and dialogs are exactly where testers hit
 * bugs. A shortcut still works there, and is also the way to stop a recording while one is open.
 */
export function useScreenCapture() {
  const [canRecord] = useState(canRecordScreen)
  const [canUseMic] = useState(canRecordMic)
  const [micEnabled, setMicEnabledState] = useState(readMicPref)
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null)
  const [activeMic, setActiveMic] = useState<CleanMic | null>(null)
  const [micMuted, setMicMuted] = useState(false)
  const [result, setResult] = useState<CaptureResult | null>(null)

  // Refs mirror the state so guards are synchronous: two quick key presses must not both pass.
  const busyRef = useRef<Busy>(null)
  const recordingRef = useRef<ScreenRecording | null>(null)
  const hasResultRef = useRef(false)
  const unmountedRef = useRef(false)
  // Read by the (stable) start callback, which the keyboard shortcut also calls.
  const micEnabledRef = useRef(micEnabled)
  const mutedRef = useRef(false)

  const setMicEnabled = useCallback((enabled: boolean) => {
    micEnabledRef.current = enabled
    setMicEnabledState(enabled)
    try {
      localStorage.setItem(MIC_PREF_KEY, enabled ? '1' : '0')
    } catch {
      // storage unavailable: the choice simply won't be remembered
    }
  }, [])

  const showResult = useCallback(
    (kind: CaptureResult['kind'], blob: Blob, extra: Pick<CaptureResult, 'method' | 'audio'> = {}) => {
      if (unmountedRef.current) return
      hasResultRef.current = true
      setResult({ kind, blob, url: URL.createObjectURL(blob), filename: buildCaptureFilename(kind, blob), ...extra })
    },
    []
  )

  const dismissResult = useCallback(() => {
    hasResultRef.current = false
    setResult(null)
  }, [])

  // Free the previous file's object URL whenever the result is replaced, dismissed or unmounted.
  useEffect(() => {
    return () => {
      if (result) URL.revokeObjectURL(result.url)
    }
  }, [result])

  useEffect(() => {
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
      recordingRef.current?.stop()
    }
  }, [])

  const isIdle = () => !busyRef.current && !recordingRef.current && !hasResultRef.current

  const takeScreenshot = useCallback(async () => {
    if (!isIdle()) return
    busyRef.current = 'capturing'
    let progressToast: string | number | undefined
    try {
      const { blob, method } = await captureScreenshot({
        // Only the DOM route is slow enough to need feedback. Sonner's toaster is excluded from
        // that capture, so the toast never shows up in the image itself.
        onDomFallback: () => {
          progressToast = toast.loading('Capturing screenshot…')
        },
      })
      showResult('image', blob, { method })
    } catch (error) {
      if (error instanceof CaptureCancelledError) {
        toast('Screenshot cancelled', {
          description: "If you didn't cancel it, allow screen sharing for this site in your browser.",
        })
      } else {
        toast.error("Couldn't capture the screen", {
          description: canRecord ? 'Try “Record screen” instead.' : undefined,
        })
      }
    } finally {
      if (progressToast !== undefined) toast.dismiss(progressToast)
      busyRef.current = null
    }
  }, [canRecord, showResult])

  const startRecording = useCallback(async () => {
    if (!canRecord || !isIdle()) return
    busyRef.current = 'starting'
    let recording: ScreenRecording
    try {
      recording = await startScreenRecording({ mic: micEnabledRef.current && canUseMic })
    } catch (error) {
      if (error instanceof MicUnavailableError) {
        const { title, description } = MIC_FAILURE_TEXT[error.reason]
        toast.error(title, { description })
      } else if (error instanceof DOMException && error.name === 'NotAllowedError') {
        toast('Recording cancelled', {
          description: "If you didn't cancel it, allow screen sharing for this site in your browser.",
        })
      } else {
        toast.error("Couldn't start recording", { description: 'Your browser blocked screen capture.' })
      }
      return
    } finally {
      busyRef.current = null
    }

    const startedAt = Date.now()
    recordingRef.current = recording
    mutedRef.current = false
    setMicMuted(false)
    setActiveMic(recording.mic ?? null)
    setRecordingStartedAt(startedAt)
    recording.mic?.onEnded(() =>
      toast.warning('Microphone disconnected', { description: 'The recording continues without sound.' })
    )
    if (recording.mic?.suppression === 'browser') {
      toast("Using your browser's noise reduction", {
        description: "The advanced noise remover couldn't start here, so background noise may be less filtered.",
      })
    }
    try {
      const blob = await recording.finished
      if (Date.now() - startedAt >= MAX_RECORDING_SECONDS * 1000 - 1500) {
        toast.info(`Recording stopped at the ${MAX_RECORDING_SECONDS / 60}-minute limit`)
      }
      showResult('video', blob, { audio: recording.mic?.suppression })
    } catch {
      toast.error('Recording failed', { description: 'Nothing was saved.' })
    } finally {
      recordingRef.current = null
      if (!unmountedRef.current) {
        setRecordingStartedAt(null)
        setActiveMic(null)
      }
    }
  }, [canRecord, canUseMic, showResult])

  const stopRecording = useCallback(() => recordingRef.current?.stop(), [])

  const toggleMicMute = useCallback(() => {
    const mic = recordingRef.current?.mic
    if (!mic) return
    mutedRef.current = !mutedRef.current
    mic.setMuted(mutedRef.current)
    setMicMuted(mutedRef.current)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return
      // event.code, not event.key: Option+Shift+S types a different character on macOS.
      if (event.code === 'KeyS') {
        event.preventDefault()
        void takeScreenshot()
      } else if (event.code === 'KeyR' && canRecord) {
        event.preventDefault()
        if (recordingRef.current) recordingRef.current.stop()
        else void startRecording()
      } else if (event.code === 'KeyM' && recordingRef.current?.mic) {
        event.preventDefault()
        toggleMicMute()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [canRecord, startRecording, takeScreenshot, toggleMicMute])

  return {
    canRecord,
    canUseMic,
    micEnabled,
    setMicEnabled,
    activeMic,
    micMuted,
    toggleMicMute,
    recordingStartedAt,
    result,
    takeScreenshot,
    startRecording,
    stopRecording,
    dismissResult,
  }
}
