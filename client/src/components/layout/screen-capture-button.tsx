import { useEffect, useRef, useState } from 'react'
import { Camera, Mic, MicOff, Square, Video } from 'lucide-react'
import { canCaptureTab } from '@/lib/screen-capture'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MUTE_SHORTCUT, RECORD_SHORTCUT, SCREENSHOT_SHORTCUT, useScreenCapture } from '@/hooks/use-screen-capture'
import { CapturePreviewDialog } from '@/components/layout/capture-preview-dialog'

function formatElapsed(totalSeconds: number): string {
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`
}

/** Own ticking state, so the header doesn't re-render every half second while recording. */
function RecordingTimer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [])
  return <span className='tabular-nums'>{formatElapsed(Math.max(0, Math.floor((now - startedAt) / 1000)))}</span>
}

const BAR_SHAPE = [0.7, 1, 0.8]

/** Three bars that follow the recorded voice, so it is obvious the microphone is alive (and, when
 * the bars sit flat while talking, that it is muted or picking up nothing). Drawn straight to the
 * DOM from an animation frame loop — no React state, no re-render per frame. */
function MicMeter({ getLevel, active }: { getLevel: () => number; active: boolean }) {
  const bars = useRef<Array<HTMLSpanElement | null>>([])

  useEffect(() => {
    const draw = (level: number) =>
      bars.current.forEach((bar, i) => {
        if (bar) bar.style.transform = `scaleY(${Math.max(0.15, Math.min(1, level * BAR_SHAPE[i] * 1.1))})`
      })
    if (!active) {
      draw(0)
      return
    }
    let frame = 0
    const tick = () => {
      draw(getLevel())
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, getLevel])

  return (
    <span aria-hidden className='flex h-4 items-center gap-0.5'>
      {BAR_SHAPE.map((_, i) => (
        <span
          key={i}
          ref={(el) => {
            bars.current[i] = el
          }}
          // Inline, not a `scale-y-*` class: that sets the separate CSS `scale` property, which multiplies with
          // the `transform` the effect drives and left the bars permanently squashed.
          style={{ transform: 'scaleY(0.15)' }}
          className='h-full w-0.5 origin-center rounded-full bg-current transition-transform duration-75'
        />
      ))}
    </span>
  )
}

/**
 * Header camera: take a screenshot or record the screen while testing, then download / copy /
 * share it. Everything happens in the browser — no capture is ever uploaded.
 */
export function ScreenCaptureButton({ className }: { className?: string }) {
  const {
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
  } = useScreenCapture()

  return (
    <>
      {recordingStartedAt !== null ? (
        <div className='flex items-center gap-1.5'>
          {activeMic && (
            <Button
              type='button'
              variant='outline'
              size='sm'
              className={cn('gap-1.5 px-2', micMuted && 'text-destructive border-destructive/40')}
              onClick={toggleMicMute}
              aria-pressed={micMuted}
              aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
              title={`${micMuted ? 'Unmute' : 'Mute'} microphone (${MUTE_SHORTCUT})`}
            >
              {micMuted ? <MicOff /> : <Mic />}
              <MicMeter getLevel={activeMic.getLevel} active={!micMuted} />
            </Button>
          )}
          <Button
            type='button'
            variant='destructive'
            size='sm'
            className='gap-2 px-2.5'
            onClick={stopRecording}
            title={`Stop recording (${RECORD_SHORTCUT})`}
            aria-label='Stop recording'
          >
            <span className='relative flex h-2.5 w-2.5'>
              <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70' />
              <span className='relative inline-flex h-2.5 w-2.5 rounded-full bg-white' />
            </span>
            <RecordingTimer startedAt={recordingStartedAt} />
            <Square className='size-3.5 fill-current' />
          </Button>
        </div>
      ) : (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className={cn('scale-95 rounded-full', className)}
              aria-label={canRecord ? 'Screenshot or record screen' : 'Take screenshot'}
              title={canRecord ? 'Screenshot / record screen' : `Take screenshot (${SCREENSHOT_SHORTCUT})`}
            >
              <Camera className='size-[1.2rem]' />
            </Button>
          </DropdownMenuTrigger>
          {/* data-html2canvas-ignore: the menu must never appear in the screenshot it just triggered. */}
          <DropdownMenuContent align='end' data-html2canvas-ignore>
            <DropdownMenuItem onSelect={() => void takeScreenshot()}>
              <Camera /> Take screenshot
              <DropdownMenuShortcut className='hidden pl-4 sm:inline'>{SCREENSHOT_SHORTCUT}</DropdownMenuShortcut>
            </DropdownMenuItem>
            {canRecord && (
              <DropdownMenuItem onSelect={() => void startRecording()}>
                <Video /> Record screen
                <DropdownMenuShortcut className='hidden pl-4 sm:inline'>{RECORD_SHORTCUT}</DropdownMenuShortcut>
              </DropdownMenuItem>
            )}
            {canRecord && canUseMic && (
              <DropdownMenuCheckboxItem
                checked={micEnabled}
                onCheckedChange={setMicEnabled}
                // A setting, not an action: keep the menu open so it can be flipped and then "Record screen" chosen.
                onSelect={(event) => event.preventDefault()}
                className='items-start'
              >
                <span className='flex flex-col gap-0.5'>
                  <span className='flex items-center gap-2'>
                    <Mic className='size-4' /> Record microphone
                  </span>
                  <span className='text-muted-foreground max-w-48 text-xs font-normal'>
                    Noise-free voice: keyboard, fan and background sound are removed.
                  </span>
                </span>
              </DropdownMenuCheckboxItem>
            )}
            {canCaptureTab() && (
              <DropdownMenuLabel className='text-muted-foreground max-w-56 px-2 pt-2 pb-1 text-xs font-normal'>
                Exact copy of this tab — your browser will ask you to confirm sharing it.
              </DropdownMenuLabel>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {result && <CapturePreviewDialog result={result} onClose={dismissResult} />}
    </>
  )
}
