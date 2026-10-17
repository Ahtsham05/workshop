import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import {
  Download,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Headphones,
  Pause,
  Play,
  RotateCw,
  X,
} from 'lucide-react'
import type { ChatAttachment, ChatMessage } from '@/stores/chat.api'
import { cn } from '@/lib/utils'
import { formatFileSize } from '../lib/chat-format'
import {
  downloadUrl,
  fileExtension,
  formatDuration,
  imageThumbUrl,
  isVisual,
  localPreviewFor,
  mediaKind,
  videoPosterUrl,
} from '../lib/chat-media'

/* ── Upload ring (sender, while sending) ─────────────────────────────────── */

interface UploadState {
  /** 0–1 while uploading; undefined once uploaded. */
  progress?: number
  failed?: boolean
  onCancel?: () => void
  onRetry?: () => void
}

/** WhatsApp's ring: fills as the file uploads, ✕ cancels; after a failure, ↻ retries. */
export function UploadRing({
  progress = 0,
  failed,
  onCancel,
  onRetry,
  size = 48,
  tone = 'dark',
}: UploadState & { size?: number; tone?: 'dark' | 'plain' }) {
  const r = (size - 6) / 2
  const c = 2 * Math.PI * r
  const shown = Math.max(0.03, progress)
  return (
    <button
      type='button'
      onClick={(e) => {
        e.stopPropagation()
        if (failed) onRetry?.()
        else onCancel?.()
      }}
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-full',
        tone === 'dark' ? 'bg-black/55 text-white' : 'bg-current/10'
      )}
      style={{ width: size, height: size }}
      aria-label={
        failed
          ? 'Retry upload'
          : `Cancel upload (${Math.round(progress * 100)}%)`
      }
      title={failed ? 'Retry' : `Uploading… ${Math.round(progress * 100)}%`}
      data-upload-ring={failed ? 'failed' : Math.round(progress * 100)}
    >
      {!failed && (
        <svg
          className='absolute inset-0 -rotate-90'
          width={size}
          height={size}
          aria-hidden
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill='none'
            stroke='currentColor'
            strokeOpacity={0.25}
            strokeWidth={3}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill='none'
            stroke='currentColor'
            strokeWidth={3}
            strokeLinecap='round'
            strokeDasharray={c}
            strokeDashoffset={c * (1 - shown)}
            className='transition-[stroke-dashoffset] duration-300'
          />
        </svg>
      )}
      {failed ? <RotateCw className='size-5' /> : <X className='size-5' />}
    </button>
  )
}

/* ── Photos & videos ─────────────────────────────────────────────────────── */

const ALBUM_WIDTH = 'w-[min(330px,68vw)]'

/** Shape of a single photo/video: its own ratio, kept between 9:16 portrait and 16:9. */
function aspectOf(a: ChatAttachment): number {
  if (!a.width || !a.height) return 4 / 3
  return Math.min(16 / 9, Math.max(9 / 16, a.width / a.height))
}

function MediaTile({
  attachment,
  className,
  style,
  sizes = 720,
  overlay,
  upload,
  onOpen,
}: {
  attachment: ChatAttachment
  className?: string
  style?: CSSProperties
  sizes?: number
  overlay?: ReactNode
  upload?: UploadState
  onOpen: () => void
}) {
  const kind = mediaKind(attachment.mimeType)
  const local = attachment.localUrl || localPreviewFor(attachment.url)
  const [loaded, setLoaded] = useState(false)
  const uploading = upload && (upload.failed || (upload.progress ?? 1) < 1)
  const src =
    kind === 'image'
      ? local || imageThumbUrl(attachment.url, sizes)
      : local
        ? ''
        : videoPosterUrl(attachment.url, sizes)

  return (
    <div
      role='button'
      tabIndex={0}
      onClick={() => !uploading && onOpen()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !uploading) {
          e.preventDefault()
          onOpen()
        }
      }}
      className={cn(
        'bg-muted focus-visible:ring-ring relative block overflow-hidden outline-none focus-visible:ring-2',
        !uploading && 'cursor-pointer',
        className
      )}
      style={style}
      aria-label={
        kind === 'video'
          ? `Play video ${attachment.name || ''}`
          : `Open photo ${attachment.name || ''}`
      }
      data-media-tile={kind}
    >
      {kind === 'video' && local ? (
        // The sender's own clip: its first frame, straight from the local file.
        <video
          src={`${local}#t=0.1`}
          muted
          playsInline
          preload='metadata'
          className='size-full object-cover'
          onLoadedData={() => setLoaded(true)}
        />
      ) : src ? (
        <img
          src={src}
          alt={attachment.name || (kind === 'video' ? 'Video' : 'Photo')}
          loading='lazy'
          draggable={false}
          onLoad={() => setLoaded(true)}
          className={cn(
            'size-full object-cover transition-opacity duration-300',
            loaded ? 'opacity-100' : 'opacity-0'
          )}
        />
      ) : null}
      {!loaded && (
        <span
          className='bg-muted-foreground/15 absolute inset-0 animate-pulse'
          aria-hidden
        />
      )}

      {kind === 'video' && !uploading && (
        <>
          <span
            className='absolute inset-0 flex items-center justify-center'
            aria-hidden
          >
            <span className='flex size-12 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-[2px]'>
              <Play className='ms-0.5 size-6 fill-current' />
            </span>
          </span>
          {attachment.duration != null && (
            <span className='absolute start-1.5 bottom-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[11px] leading-none font-medium text-white tabular-nums'>
              ▶ {formatDuration(attachment.duration)}
            </span>
          )}
        </>
      )}
      {uploading && (
        <span className='absolute inset-0 flex items-center justify-center bg-black/25'>
          <UploadRing {...upload} />
        </span>
      )}
      {overlay}
    </div>
  )
}

/**
 * Photos and videos of one message: a single one in its own shape, or an album grid
 * (2 side by side, 3 as one wide + two, 4+ as a 2×2 with "+N" like WhatsApp).
 */
export function MediaAlbum({
  message,
  onOpen,
  upload,
}: {
  message: ChatMessage
  onOpen: (attachmentIndex: number) => void
  upload?: Omit<UploadState, 'progress'>
}) {
  const items = message.attachments
    .map((a, index) => ({ a, index }))
    .filter(({ a }) => isVisual(a))
  if (!items.length) return null
  const stateFor = (a: ChatAttachment): UploadState | undefined =>
    message.pending || message.failed
      ? {
          ...upload,
          progress: a.progress ?? 0,
          failed: message.failed && !a.url,
        }
      : undefined

  if (items.length === 1) {
    const { a, index } = items[0]
    return (
      <MediaTile
        attachment={a}
        className={cn(ALBUM_WIDTH, 'rounded-xl')}
        style={{ aspectRatio: aspectOf(a) }}
        upload={stateFor(a)}
        onOpen={() => onOpen(index)}
      />
    )
  }

  const shown = items.slice(0, 4)
  const extra = items.length - shown.length
  return (
    <div
      className={cn(
        ALBUM_WIDTH,
        'grid grid-cols-2 gap-0.5 overflow-hidden rounded-xl'
      )}
      data-media-album={items.length}
    >
      {shown.map(({ a, index }, i) => (
        <MediaTile
          key={`${a.url || a.localUrl}-${index}`}
          attachment={a}
          sizes={400}
          className={cn(items.length === 3 && i === 0 && 'col-span-2')}
          style={{ aspectRatio: items.length === 3 && i === 0 ? 2 : 1 }}
          upload={stateFor(a)}
          onOpen={() => onOpen(index)}
          overlay={
            extra > 0 && i === 3 ? (
              <span className='absolute inset-0 flex items-center justify-center bg-black/50 text-2xl font-semibold text-white'>
                +{extra}
              </span>
            ) : undefined
          }
        />
      ))}
    </div>
  )
}

/* ── Audio ───────────────────────────────────────────────────────────────── */

// One clip plays at a time, across the whole chat.
let playing: HTMLAudioElement | null = null
const SPEEDS = [1, 1.5, 2]

export function AudioPlayer({
  attachment,
  mine,
  upload,
}: {
  attachment: ChatAttachment
  mine: boolean
  upload?: UploadState
}) {
  const ref = useRef<HTMLAudioElement>(null)
  const [isPlaying, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(attachment.duration ?? 0)
  const [speed, setSpeed] = useState(1)
  const src =
    attachment.localUrl || localPreviewFor(attachment.url) || attachment.url
  const uploading = upload && (upload.failed || (upload.progress ?? 1) < 1)

  useEffect(() => {
    const el = ref.current
    return () => {
      if (el && playing === el) playing = null
    }
  }, [])

  const toggle = () => {
    const el = ref.current
    if (!el) return
    if (el.paused) {
      if (playing && playing !== el) playing.pause()
      playing = el
      void el.play()
    } else {
      el.pause()
    }
  }
  const total = duration || attachment.duration || 0

  return (
    <div
      className='flex w-[min(300px,66vw)] items-center gap-2.5 py-0.5'
      data-audio-player
    >
      <span
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-full',
          mine
            ? 'bg-primary-foreground/15 text-primary-foreground'
            : 'bg-primary/15 text-primary'
        )}
      >
        <Headphones className='size-5' />
      </span>
      {uploading ? (
        <UploadRing {...upload} size={36} tone='plain' />
      ) : (
        <button
          type='button'
          onClick={toggle}
          className='flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-current/10'
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className='size-5 fill-current' />
          ) : (
            <Play className='ms-0.5 size-5 fill-current' />
          )}
        </button>
      )}
      <div className='min-w-0 flex-1'>
        <input
          type='range'
          min={0}
          max={total || 1}
          step={0.05}
          value={Math.min(time, total || 1)}
          disabled={!!uploading}
          onChange={(e) => {
            const el = ref.current
            if (el) el.currentTime = Number(e.target.value)
            setTime(Number(e.target.value))
          }}
          aria-label='Seek'
          className={cn(
            'h-1.5 w-full cursor-pointer',
            mine ? 'accent-primary-foreground' : 'accent-primary'
          )}
        />
        <div className='mt-1 flex items-center justify-between text-[11px] tabular-nums opacity-75'>
          <span>
            {formatDuration(isPlaying || time ? time : total) || '0:00'}
          </span>
          <button
            type='button'
            onClick={() => {
              const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]
              setSpeed(next)
              if (ref.current) ref.current.playbackRate = next
            }}
            className='rounded-full bg-current/15 px-1.5 py-px text-[10px] font-semibold'
            aria-label='Playback speed'
          >
            {speed}×
          </button>
        </div>
      </div>
      <audio
        ref={ref}
        src={src}
        preload='metadata'
        onLoadedMetadata={(e) =>
          Number.isFinite(e.currentTarget.duration) &&
          setDuration(e.currentTarget.duration)
        }
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setTime(0)
        }}
      />
    </div>
  )
}

/* ── Documents ───────────────────────────────────────────────────────────── */

function docIcon(ext: string) {
  if (['XLS', 'XLSX', 'CSV', 'ODS'].includes(ext))
    return { Icon: FileSpreadsheet, tint: 'bg-emerald-600' }
  if (['ZIP', 'RAR', '7Z'].includes(ext))
    return { Icon: FileArchive, tint: 'bg-amber-600' }
  if (['DOC', 'DOCX', 'ODT', 'RTF', 'TXT'].includes(ext))
    return { Icon: FileText, tint: 'bg-sky-600' }
  return { Icon: FileText, tint: 'bg-red-600' }
}

export function DocumentCard({
  attachment,
  mine,
  upload,
}: {
  attachment: ChatAttachment
  mine: boolean
  upload?: UploadState
}) {
  const ext = fileExtension(attachment.name, attachment.mimeType)
  const { Icon, tint } = docIcon(ext)
  const uploading = upload && (upload.failed || (upload.progress ?? 1) < 1)
  return (
    <div
      className={cn(
        'flex w-[min(300px,66vw)] items-center gap-3 rounded-lg p-2',
        mine ? 'bg-primary-foreground/10' : 'bg-background/70'
      )}
      data-document-card
    >
      <span
        className={cn(
          'relative flex h-11 w-9 shrink-0 items-center justify-center rounded-md text-white',
          tint
        )}
      >
        <Icon className='size-5' />
      </span>
      <span className='min-w-0 flex-1'>
        <span className='block truncate text-sm font-medium'>
          {attachment.name || 'Document'}
        </span>
        <span className='block text-[11px] opacity-70'>
          {ext}
          {attachment.size ? ` · ${formatFileSize(attachment.size)}` : ''}
        </span>
      </span>
      {uploading ? (
        <UploadRing {...upload} size={36} tone='plain' />
      ) : (
        <a
          href={downloadUrl(attachment)}
          target='_blank'
          rel='noreferrer'
          download={attachment.name || true}
          className='flex size-9 shrink-0 items-center justify-center rounded-full border border-current/25 hover:bg-current/10'
          aria-label={`Download ${attachment.name || 'document'}`}
          title='Download'
        >
          <Download className='size-4' />
        </a>
      )}
    </div>
  )
}
