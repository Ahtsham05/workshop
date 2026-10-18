import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { toast } from 'sonner'
import { claimPlayback, releasePlayback } from '../lib/chat-media'

const SPEEDS = [1, 1.5, 2] as const

/**
 * MediaRecorder's WebM has no duration and no seek index, so Chrome reports Infinity and
 * ignores seeks until it has read the whole file. Asking for a time far past the end makes
 * it do that once; after which seeking works. Cheap for a voice note (tens of KB).
 */
function makeSeekable(el: HTMLAudioElement): Promise<void> {
  if (Number.isFinite(el.duration) && el.duration > 0) return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      el.removeEventListener('durationchange', check)
      el.removeEventListener('timeupdate', check)
      window.clearTimeout(timer)
      try {
        el.currentTime = 0
      } catch {
        /* ignore */
      }
      resolve()
    }
    const check = () => {
      if (Number.isFinite(el.duration)) done()
    }
    const timer = window.setTimeout(done, 3000)
    el.addEventListener('durationchange', check)
    el.addEventListener('timeupdate', check)
    try {
      el.currentTime = 1e101
    } catch {
      done()
    }
  })
}

/* ── Playback state shared by the bubble and the recorder's listen-back ──── */

/**
 * Drives an <audio>: smooth progress (rAF, not the 4 Hz timeupdate), seeking before the
 * first play, speed, and the one-at-a-time rule. `knownDuration` comes from the recorder,
 * because a WebM voice note doesn't carry one.
 */
export function useVoicePlayback(src: string, knownDuration: number, { onEnded }: { onEnded?: () => void } = {}) {
  const ref = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setPlaying] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [time, setTime] = useState(0)
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1)
  const [mediaDuration, setMediaDuration] = useState(0)
  const seekableRef = useRef(false)
  const pendingRef = useRef<number | null>(null)
  const frameRef = useRef(0)

  const duration = knownDuration > 0 ? knownDuration : mediaDuration

  // New source (local blob → uploaded URL, or a new listen-back snapshot): start over.
  useEffect(() => {
    seekableRef.current = false
    const el = ref.current
    return () => {
      cancelAnimationFrame(frameRef.current)
      el?.pause()
      releasePlayback(el)
    }
  }, [src])

  const tick = useCallback(() => {
    const el = ref.current
    if (!el) return
    if (el.paused) return
    setTime(el.currentTime)
    frameRef.current = requestAnimationFrame(tick)
  }, [])

  const prepare = useCallback(async (el: HTMLAudioElement) => {
    if (seekableRef.current) return
    if (el.readyState < 1) {
      await new Promise<void>((resolve) => {
        const ok = () => {
          el.removeEventListener('loadedmetadata', ok)
          el.removeEventListener('error', ok)
          resolve()
        }
        el.addEventListener('loadedmetadata', ok)
        el.addEventListener('error', ok)
        el.load()
      })
    }
    await makeSeekable(el)
    seekableRef.current = true
  }, [])

  const play = useCallback(async () => {
    const el = ref.current
    if (!el) return
    claimPlayback(el)
    setWaiting(true)
    try {
      await prepare(el)
      const resumeAt = pendingRef.current ?? (el.ended || (duration && el.currentTime >= duration - 0.05) ? 0 : el.currentTime)
      pendingRef.current = null
      el.currentTime = resumeAt
      el.playbackRate = speed
      await el.play()
    } catch (err) {
      if ((err as { name?: string })?.name !== 'AbortError') toast.error('Could not play this voice message')
    } finally {
      setWaiting(false)
    }
  }, [duration, prepare, speed])

  const toggle = useCallback(() => {
    const el = ref.current
    if (!el) return
    if (el.paused) void play()
    else el.pause()
  }, [play])

  const seek = useCallback(
    (fraction: number) => {
      const el = ref.current
      const at = fraction * (duration || 0)
      setTime(at)
      if (!el) return
      if (seekableRef.current) el.currentTime = at
      else pendingRef.current = at
    },
    [duration]
  )

  const cycleSpeed = useCallback(() => {
    setSpeed((current) => {
      const next = SPEEDS[(SPEEDS.indexOf(current) + 1) % SPEEDS.length]
      if (ref.current) ref.current.playbackRate = next
      return next
    })
  }, [])

  const audioProps = {
    ref,
    src,
    preload: 'none' as const,
    onLoadedMetadata: (e: SyntheticEvent<HTMLAudioElement>) => {
      const d = e.currentTarget.duration
      if (Number.isFinite(d)) setMediaDuration(d)
    },
    onDurationChange: (e: SyntheticEvent<HTMLAudioElement>) => {
      const d = e.currentTarget.duration
      if (Number.isFinite(d) && d < 1e9) setMediaDuration(d)
    },
    onPlay: () => {
      setPlaying(true)
      cancelAnimationFrame(frameRef.current)
      frameRef.current = requestAnimationFrame(tick)
    },
    onPause: (e: SyntheticEvent<HTMLAudioElement>) => {
      setPlaying(false)
      setTime(e.currentTarget.currentTime)
    },
    onEnded: () => {
      // Back to the start (a frame queued before the end must not put the thumb back there).
      cancelAnimationFrame(frameRef.current)
      setTime(0)
      onEnded?.()
    },
    onWaiting: () => setWaiting(true),
    onPlaying: () => setWaiting(false),
  }

  return { ref, isPlaying, waiting, time, setTime, duration, speed, play, toggle, seek, cycleSpeed, audioProps }
}
