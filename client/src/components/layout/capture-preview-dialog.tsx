import { useMemo, useRef, type SyntheticEvent } from 'react'
import { Check, Copy, Download, Mic, Share2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { CaptureResult } from '@/hooks/use-screen-capture'
import { canCopyImage, canShareFile, copyImageToClipboard, downloadBlob, shareFile } from '@/lib/screen-capture'

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** MediaRecorder writes WebM with no duration header, so Chrome shows an endless, unseekable
 * timeline. Seeking far past the end forces it to scan the file and learn the real length. */
function fixUnknownDuration(event: SyntheticEvent<HTMLVideoElement>) {
  const video = event.currentTarget
  if (video.duration !== Infinity) return
  video.addEventListener('timeupdate', () => (video.currentTime = 0), { once: true })
  video.currentTime = 1e101
}

export function CapturePreviewDialog({ result, onClose }: { result: CaptureResult; onClose: () => void }) {
  const downloadRef = useRef<HTMLButtonElement>(null)
  const file = useMemo(
    () => new File([result.blob], result.filename, { type: result.blob.type }),
    [result.blob, result.filename]
  )

  const handleDownload = () => {
    downloadBlob(result.url, result.filename)
    toast.success('Saved to your downloads', { description: result.filename })
  }

  const handleCopy = async () => {
    try {
      await copyImageToClipboard(result.blob)
      toast.success('Screenshot copied', { description: 'Paste it into WhatsApp, email or a bug ticket.' })
    } catch {
      toast.error("Couldn't copy the screenshot", { description: 'Use Download instead.' })
    }
  }

  const handleShare = async () => {
    try {
      await shareFile(file)
    } catch (error) {
      // Closing the share sheet rejects with AbortError — not worth an error toast.
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        toast.error("Couldn't open the share sheet", { description: 'Use Download instead.' })
      }
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className='sm:max-w-3xl'
        // Land on Download so Enter saves the file straight away.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          downloadRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{result.kind === 'image' ? 'Screenshot ready' : 'Recording ready'}</DialogTitle>
          <DialogDescription>
            {result.filename} · {formatSize(result.blob.size)}
          </DialogDescription>
        </DialogHeader>

        <div className='bg-muted/40 flex max-h-[60vh] min-h-32 items-center justify-center overflow-hidden rounded-md border'>
          {result.kind === 'image' ? (
            <img src={result.url} alt='Captured screen' className='max-h-[60vh] w-auto max-w-full object-contain' />
          ) : (
            <video
              src={result.url}
              controls
              playsInline
              onLoadedMetadata={fixUnknownDuration}
              className='max-h-[60vh] w-auto max-w-full'
            />
          )}
        </div>

        <div className='text-muted-foreground space-y-1 text-xs'>
          {result.audio && (
            <p className='flex items-center gap-1.5'>
              <Mic className='h-3.5 w-3.5 shrink-0' />
              {result.audio === 'ai'
                ? 'Includes your voice, cleaned by AI noise removal (keyboard, fan and background sound filtered out).'
                : "Includes your voice, cleaned by your browser's basic noise reduction."}
            </p>
          )}
          {result.method === 'dom' && (
            <p className='flex items-start gap-1.5 text-amber-700 dark:text-amber-400'>
              <TriangleAlert className='mt-px h-3.5 w-3.5 shrink-0' />
              Redrawn from the page because this browser can't screen-capture, so blur, video and some
              effects may look different. Use a desktop browser for an exact copy.
            </p>
          )}
          <p className='flex items-center gap-1.5'>
            <Check className='h-3.5 w-3.5 shrink-0 text-emerald-600' />
            Saved only on this device — nothing is uploaded until you send it yourself.
          </p>
        </div>

        <DialogFooter className='gap-2'>
          {result.kind === 'image' && canCopyImage() && (
            <Button type='button' variant='outline' onClick={handleCopy}>
              <Copy /> Copy image
            </Button>
          )}
          {canShareFile(file) && (
            <Button type='button' variant='outline' onClick={handleShare}>
              <Share2 /> Share
            </Button>
          )}
          <Button ref={downloadRef} type='button' onClick={handleDownload}>
            <Download /> Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
