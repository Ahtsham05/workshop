import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronLeft, ChevronUp, Lock, Mic, Pause, Play, SendHorizontal, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDuration } from '../lib/chat-media'
import { compressWaveform, type RecorderState } from '../hooks/use-voice-recorder'
import { useVoicePlayback } from '../hooks/use-voice-playback'
import { VoiceWaveform } from './voice-note'

/** How far a held mic must travel to cancel (sideways) or lock (upwards), in px. */
const CANCEL_AT = 110
const LOCK_AT = 72
/** A press shorter than this is a tap: recording starts hands-free (WhatsApp Web style). */
const TAP_MS = 350

const clock = (ms: number) => formatDuration(ms / 1000) || '0:00'

/* ── Live waveform while recording ───────────────────────────────────────── */

/** Newest level on the right; older bars scroll off the left edge. */
function LiveWaveform({ levels, className }: { levels: number[]; className?: string }) {
  const shown = levels.slice(-160)
  return (
    <div
      dir='ltr'
      className={cn('flex h-8 items-center justify-end gap-[2px] overflow-hidden', className)}
      aria-hidden
      data-live-waveform={levels.length}
    >
      {shown.map((level, i) => (
        <span
          key={levels.length - shown.length + i}
          className='w-[3px] shrink-0 rounded-full bg-foreground/70'
          style={{ height: `${Math.max(10, Math.round(level * 100))}%` }}
        />
      ))}
    </div>
  )
}

function RecordingDot({ paused }: { paused?: boolean }) {
  return (
    <span className='relative flex size-2.5 shrink-0' aria-hidden>
      {!paused && <span className='absolute inset-0 animate-ping rounded-full bg-red-500/70' />}
      <span className={cn('relative size-2.5 rounded-full', paused ? 'bg-muted-foreground' : 'bg-red-500')} />
    </span>
  )
}

/* ── Hands-free (locked) recorder ────────────────────────────────────────── */

/**
 * WhatsApp Web's recording bar: 🗑 · ● 0:07 · live waveform · ⏸ · ➤. Paused, it lets you
 * listen to what you have so far (▶ + waveform you can scrub), then carry on (🎤) or send.
 */
export function LockedRecorder({
  state,
  elapsed,
  levels,
  snapshot,
  onPause,
  onResume,
  onDiscard,
  onSend,
}: {
  state: RecorderState
  elapsed: number
  levels: number[]
  snapshot: () => Blob | null
  onPause: () => void
  onResume: () => void
  onDiscard: () => void
  onSend: () => void
}) {
  const paused = state === 'paused'
  const sendRef = useRef<HTMLButtonElement>(null)

  // Listen-back: a blob of what is recorded so far, made and revoked in one effect (a
  // memoised blob URL dies under StrictMode's double mount).
  const [previewUrl, setPreviewUrl] = useState('')
  useEffect(() => {
    if (!paused) return
    // The recorder hands over its last chunk asynchronously after requestData().
    let url = ''
    const timer = window.setTimeout(() => {
      const blob = snapshot()
      if (!blob) return
      url = URL.createObjectURL(blob)
      setPreviewUrl(url)
    }, 120)
    return () => {
      window.clearTimeout(timer)
      if (url) URL.revokeObjectURL(url)
      setPreviewUrl('')
    }
  }, [paused, snapshot])

  const preview = useVoicePlayback(previewUrl, elapsed / 1000)
  const bars = useMemo(() => (paused ? compressWaveform(levels, 40) : []), [paused, levels])

  useEffect(() => {
    if (state === 'recording' || state === 'paused') sendRef.current?.focus({ preventScroll: true })
  }, [state])

  return (
    <div className='flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:gap-2' data-voice-recorder={paused ? 'paused' : state}>
      <button
        type='button'
        onClick={onDiscard}
        className='flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-destructive'
        aria-label='Delete recording'
        title='Delete'
      >
        <Trash2 className='size-5' />
      </button>

      {paused ? (
        <div className='flex min-w-0 flex-1 items-center gap-2 rounded-full bg-muted px-2 py-1 sm:max-w-80 sm:flex-none sm:basis-80'>
          <button
            type='button'
            onClick={preview.toggle}
            disabled={!previewUrl}
            className='flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-foreground/10 disabled:opacity-40'
            aria-label={preview.isPlaying ? 'Pause preview' : 'Listen to your recording'}
            data-voice-preview
          >
            {preview.isPlaying ? <Pause className='size-5 fill-current' strokeWidth={0} /> : <Play className='ms-0.5 size-5 fill-current' strokeWidth={0} />}
          </button>
          <VoiceWaveform
            bars={bars}
            progress={preview.duration ? preview.time / preview.duration : 0}
            duration={preview.duration}
            onSeek={preview.seek}
            disabled={!previewUrl}
            className='min-w-0 flex-1 text-foreground'
            thumbClassName='bg-primary'
            label='Recording position'
          />
          <span className='shrink-0 pe-1 text-xs tabular-nums text-muted-foreground'>
            {preview.isPlaying || preview.time > 0 ? clock(preview.time * 1000) : clock(elapsed)}
          </span>
          {previewUrl && <audio {...preview.audioProps} />}
        </div>
      ) : (
        <>
          <span className='flex shrink-0 items-center gap-2 ps-1 text-sm font-medium tabular-nums' aria-live='off' data-voice-timer>
            <RecordingDot />
            {clock(elapsed)}
          </span>
          <LiveWaveform levels={levels} className='min-w-0 flex-1 sm:max-w-64 sm:flex-none sm:basis-64' />
        </>
      )}

      {paused ? (
        <button
          type='button'
          onClick={onResume}
          className='flex size-10 shrink-0 items-center justify-center rounded-full text-red-500 transition-colors hover:bg-red-500/10'
          aria-label='Continue recording'
          title='Continue recording'
        >
          <Mic className='size-5' />
        </button>
      ) : (
        <button
          type='button'
          onClick={onPause}
          disabled={state !== 'recording'}
          className='flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-red-500 text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-40'
          aria-label='Pause recording'
          title='Pause'
        >
          <Pause className='size-4 fill-current' strokeWidth={0} />
        </button>
      )}

      <button
        ref={sendRef}
        type='button'
        onClick={onSend}
        disabled={state === 'starting'}
        className='flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform hover:scale-105 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:scale-95 disabled:opacity-50'
        aria-label='Send voice message'
        title='Send'
        data-voice-send
      >
        <SendHorizontal className='size-5' />
      </button>
    </div>
  )
}

/* ── Held recorder (the phone gesture) ───────────────────────────────────── */

/** What the row shows while the mic is held: ● 0:04 · ‹ Slide to cancel. */
export function HoldRecorder({ state, elapsed, slide }: { state: RecorderState; elapsed: number; slide: number }) {
  const fade = Math.max(0, 1 - slide / CANCEL_AT)
  return (
    <div className='flex h-10 min-w-0 flex-1 items-center gap-3 overflow-hidden ps-2' data-voice-recorder='hold'>
      <Mic className={cn('size-5 shrink-0 text-red-500', state === 'recording' && 'animate-pulse')} aria-hidden />
      <span className='shrink-0 text-sm font-medium tabular-nums' data-voice-timer>
        {state === 'starting' ? 'Starting…' : clock(elapsed)}
      </span>
      <span
        className='ms-auto me-8 flex items-center gap-1 text-sm whitespace-nowrap text-muted-foreground'
        style={{ opacity: fade, transform: `translateX(${document.dir === 'rtl' ? slide : -slide}px)` }}
      >
        <ChevronLeft className='size-4 animate-pulse rtl:rotate-180' aria-hidden /> Slide to cancel
      </span>
    </div>
  )
}

/* ── The mic button ──────────────────────────────────────────────────────── */

/**
 * WhatsApp's mic, for mouse, touch and keyboard:
 * - tap (or Enter/Space) → hands-free recording with the full bar;
 * - press and hold → records while held, release sends, slide sideways cancels,
 *   slide up locks it hands-free.
 */
export function MicButton({
  holding,
  disabled,
  onPress,
  onRelease,
  onSlide,
  onCancel,
  onLock,
}: {
  holding: boolean
  disabled?: boolean
  onPress: () => void
  onRelease: (kind: 'tap' | 'send') => void
  onSlide: (slide: { x: number; y: number }) => void
  onCancel: () => void
  onLock: () => void
}) {
  const startRef = useRef<{ x: number; y: number; t: number; id: number } | null>(null)
  const [lift, setLift] = useState(0)

  const end = () => {
    startRef.current = null
    setLift(0)
    onSlide({ x: 0, y: 0 })
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled || e.button > 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    startRef.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }
    onPress()
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const start = startRef.current
    if (!start || start.id !== e.pointerId) return
    const rtl = document.dir === 'rtl'
    const x = Math.max(0, rtl ? e.clientX - start.x : start.x - e.clientX)
    const y = Math.max(0, start.y - e.clientY)
    if (x > CANCEL_AT) {
      end()
      onCancel()
      return
    }
    if (y > LOCK_AT) {
      end()
      onLock()
      return
    }
    setLift(y)
    onSlide({ x, y })
  }
  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const start = startRef.current
    if (!start || start.id !== e.pointerId) return
    const held = performance.now() - start.t
    end()
    onRelease(held < TAP_MS ? 'tap' : 'send')
  }

  return (
    <span className='relative shrink-0'>
      {holding && (
        // The lock target above the finger; it rises with it.
        <span
          className='absolute end-[12px] bottom-full mb-9 flex w-9 flex-col items-center gap-0.5 rounded-full border bg-card py-2.5 text-muted-foreground shadow-lg'
          style={{ transform: `translateY(${-Math.min(lift, LOCK_AT)}px)` }}
          aria-hidden
          data-voice-lock
        >
          <Lock className='size-4' />
          <ChevronUp className='size-4 animate-bounce' />
        </span>
      )}
      <button
        type='button'
        disabled={disabled}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        // The browser took the gesture (scroll, system UI): keep the recording, hands-free.
        onPointerCancel={(e) => {
          if (!startRef.current || startRef.current.id !== e.pointerId) return
          end()
          onRelease('tap')
        }}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
            e.preventDefault()
            onPress()
            onRelease('tap')
          }
        }}
        className={cn(
          'relative z-10 flex size-9 touch-none items-center justify-center rounded-full transition-[transform,background-color,color] duration-150 select-none [-webkit-touch-callout:none]',
          'focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
          holding ? 'origin-bottom-right scale-[1.65] bg-red-500 text-white shadow-lg rtl:origin-bottom-left' : 'bg-primary text-primary-foreground hover:scale-105'
        )}
        style={holding && lift ? { transform: `translateY(${-Math.min(lift, LOCK_AT)}px) scale(1.65)` } : undefined}
        aria-label='Record voice message (tap, or hold and release to send)'
        title='Voice message — tap to record, or hold and release to send'
        data-voice-mic-button
      >
        <Mic className='size-[18px]' />
      </button>
    </span>
  )
}
