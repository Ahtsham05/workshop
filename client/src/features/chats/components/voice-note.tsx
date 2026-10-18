import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Loader2, Mic, Pause, Play } from 'lucide-react'
import type { ChatAttachment } from '@/stores/chat.api'
import { cn } from '@/lib/utils'
import { CurrentUserAvatar, UserAvatar } from '@/components/user-avatar'
import { formatDuration, localPreviewFor, voicePlaybackUrl } from '../lib/chat-media'
import { useVoicePlayback } from '../hooks/use-voice-playback'
import { UploadRing } from './message-media'

/* ── Waveform scrubber ───────────────────────────────────────────────────── */

/**
 * WhatsApp's voice-note waveform: one bar per slice of loudness, the played part solid, a
 * round thumb you can drag (or arrow-key) to any point — even before pressing play.
 */
export function VoiceWaveform({
  bars,
  progress,
  duration,
  onSeek,
  thumbClassName,
  disabled,
  className,
  label = 'Voice message position',
}: {
  bars: number[]
  /** 0–1 */
  progress: number
  duration: number
  onSeek?: (fraction: number) => void
  thumbClassName?: string
  disabled?: boolean
  className?: string
  label?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const shown = Math.min(1, Math.max(0, progress))

  const fractionAt = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect || !rect.width) return 0
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || !onSeek || e.button > 0) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
    onSeek(fractionAt(e.clientX))
  }

  return (
    <div
      ref={ref}
      dir='ltr'
      role='slider'
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(shown * duration)}
      aria-valuetext={`${formatDuration(shown * duration) || '0:00'} of ${formatDuration(duration) || '0:00'}`}
      aria-disabled={disabled || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={(e) => dragging && onSeek?.(fractionAt(e.clientX))}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={(e) => {
        if (disabled || !onSeek || !duration) return
        const step = 5 / duration
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onSeek(Math.min(1, shown + step))
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onSeek(Math.max(0, shown - step))
        else if (e.key === 'Home') onSeek(0)
        else if (e.key === 'End') onSeek(1)
        else return
        e.preventDefault()
      }}
      className={cn(
        'group/wave relative flex h-8 touch-none items-center justify-between rounded outline-none select-none focus-visible:ring-2 focus-visible:ring-current/40',
        !disabled && onSeek && 'cursor-pointer',
        className
      )}
      data-voice-waveform
    >
      {bars.map((value, i) => {
        const done = (i + 0.5) / bars.length <= shown
        return (
          <span
            key={i}
            aria-hidden
            className={cn('w-[2px] shrink-0 rounded-full bg-current transition-opacity sm:w-[3px]', done ? 'opacity-90' : 'opacity-35')}
            style={{ height: `${Math.max(12, value)}%` }}
          />
        )
      })}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-sm transition-transform',
          dragging ? 'scale-125' : 'group-hover/wave:scale-110',
          thumbClassName ?? 'bg-current'
        )}
        style={{ left: `${shown * 100}%` }}
      />
    </div>
  )
}

/* ── The bubble ──────────────────────────────────────────────────────────── */

interface UploadState {
  progress?: number
  failed?: boolean
  onCancel?: () => void
  onRetry?: () => void
}

/**
 * A voice note as WhatsApp draws it: the sender's photo with a small mic (green = new to
 * you, blue = played), play/pause, the waveform with a thumb, and the length underneath.
 * While playing, the photo becomes the 1× / 1.5× / 2× speed button. When it ends, the
 * next unplayed voice note in the thread plays on its own.
 */
export function VoiceNotePlayer({
  attachment,
  mine,
  senderName,
  played,
  onPlayed,
  upload,
}: {
  attachment: ChatAttachment
  mine: boolean
  senderName: string
  /** Incoming: I have played it. Mine: someone else has. */
  played: boolean
  onPlayed?: () => void
  upload?: UploadState
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const local = attachment.localUrl || localPreviewFor(attachment.url)
  const src = local || (attachment.url ? voicePlaybackUrl(attachment) : '')
  const { isPlaying, waiting, time, duration, speed, toggle, seek, cycleSpeed, audioProps } = useVoicePlayback(
    src,
    attachment.duration ?? 0,
    { onEnded: () => playNext() }
  )
  const uploading = !!upload && (upload.failed || (upload.progress ?? 1) < 1)
  const bars = attachment.waveform?.length ? attachment.waveform : FLAT_BARS
  const progress = duration ? time / duration : 0
  const started = isPlaying || time > 0
  const fresh = !mine && !played
  const playedRef = useRef(played)
  playedRef.current = played

  function playNext() {
    // WhatsApp: when one voice note finishes, the next new one (from the others) plays.
    const host = rootRef.current?.closest('[id^="chat-msg-"]')
    let next = host?.nextElementSibling
    for (let hops = 0; next && hops < 6; hops += 1, next = next.nextElementSibling) {
      if (!next.id.startsWith('chat-msg-')) {
        // Date separators / the "new messages" line sit between bubbles.
        continue
      }
      const button = next.querySelector<HTMLButtonElement>('[data-voice-note][data-voice-fresh="true"] [data-voice-play]')
      button?.click()
      break
    }
  }

  return (
    <div
      ref={rootRef}
      className='relative flex w-[min(320px,68vw)] items-center gap-2 pt-1 pb-4'
      data-voice-note
      data-voice-fresh={fresh ? 'true' : 'false'}
    >
      {/* Photo with the mic badge — or the speed button while it plays. */}
      <span className='relative flex size-12 shrink-0 items-center justify-center'>
        {started ? (
          <button
            type='button'
            onClick={cycleSpeed}
            className='rounded-full bg-current/15 px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors hover:bg-current/25'
            aria-label={`Playback speed ${speed}×`}
            title='Playback speed'
            data-voice-speed
          >
            {speed}×
          </button>
        ) : (
          <>
            {mine ? (
              <CurrentUserAvatar className='size-12' fallbackClassName='text-sm' />
            ) : (
              <UserAvatar name={senderName} className='size-12' fallbackClassName='text-sm' />
            )}
            <Mic
              aria-hidden
              className={cn(
                'absolute -end-0.5 bottom-0 size-[18px] drop-shadow-[0_0_1.5px_rgba(0,0,0,0.45)]',
                played ? 'text-sky-400' : fresh ? 'text-emerald-400' : 'opacity-70'
              )}
              strokeWidth={2.5}
              data-voice-mic={played ? 'played' : fresh ? 'fresh' : 'sent'}
            />
          </>
        )}
      </span>

      {uploading ? (
        <UploadRing {...upload} size={36} tone='plain' />
      ) : (
        <button
          type='button'
          onClick={() => {
            if (!isPlaying && fresh && !playedRef.current) onPlayed?.()
            toggle()
          }}
          disabled={!src}
          className='relative flex size-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-current/10 disabled:opacity-50'
          aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
          data-voice-play
        >
          {waiting && isPlaying ? (
            <Loader2 className='size-5 animate-spin' />
          ) : isPlaying ? (
            <Pause className='size-6 fill-current' strokeWidth={0} />
          ) : (
            <Play className='ms-0.5 size-6 fill-current' strokeWidth={0} />
          )}
          {waiting && !isPlaying && <Loader2 className='absolute inset-0 m-auto size-9 animate-spin opacity-40' strokeWidth={1.5} />}
        </button>
      )}

      <div className='relative min-w-0 flex-1 pe-1'>
        <VoiceWaveform
          bars={bars}
          progress={progress}
          duration={duration}
          onSeek={seek}
          disabled={uploading}
          thumbClassName={played ? 'bg-sky-400' : fresh ? 'bg-emerald-500' : 'bg-current'}
        />
      </div>

      {/* Under the waveform, on the same line as the bubble's time + ticks (photo 48 + gap 8 + button 36 + gap 8). */}
      <span className='absolute start-[100px] bottom-0 text-[11px] leading-none tabular-nums opacity-75' data-voice-time>
        {formatDuration(started ? time : duration) || '0:00'}
      </span>

      {src && <audio {...audioProps} />}
    </div>
  )
}

const FLAT_BARS = Array.from({ length: 48 }, (_, i) => 18 + ((i * 37) % 23))
