import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Mic, ArrowUp, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Textarea } from '@/components/ui/textarea'
import { useLanguage } from '@/context/language-context'
import { useRecording, type RecordingEndError } from '../hooks/use-recording'
import { RecordingBar } from './recording-bar'

const TAP_THRESHOLD_MS = 300

type RecordingPhase = 'idle' | 'held' | 'toggled'

const PERMISSION_DENIED_MESSAGE =
  'Microphone access is blocked. Allow it for this site in your browser’s address-bar permissions, then try again.'

const END_ERROR_MESSAGES: Record<RecordingEndError, string> = {
  'permission-denied': PERMISSION_DENIED_MESSAGE,
  'mic-unavailable': 'No microphone was found. Please check your device and try again.',
  'no-speech': "Didn't catch that — please try again.",
  'recognition-error': 'Voice recognition had a problem. Please try again.',
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: (text: string) => void
  disabled?: boolean
}) {
  const { language } = useLanguage()
  const { isRecording, elapsedSeconds, isSupported, pressStart, pressEnd } = useRecording(language)
  const [isTapHeld, setIsTapHeld] = useState(false)
  const pointerDownAtRef = useRef(0)
  // Drives the press/release gesture logic. A ref (not the `isRecording` state) because two
  // pointer events from the same click can fire before React commits a re-render, which would
  // otherwise make the second handler read a stale `isRecording` value from the prior render.
  const phaseRef = useRef<RecordingPhase>('idle')
  // TS narrows `phaseRef.current` to a single literal across an `await` boundary, which is
  // unsound here since other handlers mutate the ref while we're awaiting. Reading through a
  // function call avoids that false narrowing.
  const getPhase = (): RecordingPhase => phaseRef.current

  const finishRecording = (cancel: boolean) => {
    phaseRef.current = 'idle'
    setIsTapHeld(false)
    const { transcript, error } = pressEnd({ cancel })
    if (transcript) {
      onSubmit(transcript)
    } else if (!cancel && error) {
      toast.error(END_ERROR_MESSAGES[error])
    }
  }

  const handleMicPointerDown = async (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    if (phaseRef.current !== 'idle') {
      // Second tap while in "tap to toggle" mode — stop and send.
      finishRecording(false)
      return
    }
    phaseRef.current = 'held'
    pointerDownAtRef.current = Date.now()
    const { started, error } = await pressStart()
    if (getPhase() === 'idle') {
      // Already released/cancelled while we were awaiting mic permission — clean up quietly.
      if (started) pressEnd({ cancel: true })
      return
    }
    if (!started) {
      phaseRef.current = 'idle'
      toast.error(error === 'permission-denied' ? PERMISSION_DENIED_MESSAGE : 'Could not start recording. Please try again.')
    }
  }

  const handleMicPointerUp = () => {
    if (phaseRef.current !== 'held') return
    const heldFor = Date.now() - pointerDownAtRef.current
    if (heldFor < TAP_THRESHOLD_MS) {
      // Short tap — keep recording until the user taps again.
      phaseRef.current = 'toggled'
      setIsTapHeld(true)
      return
    }
    finishRecording(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!value.trim()) return
    onSubmit(value)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim()) onSubmit(value)
    }
  }

  const hasDraft = value.trim().length > 0

  return (
    <form onSubmit={handleSubmit} className='flex-none p-3'>
      <div className='flex items-end gap-2 rounded-3xl border bg-background px-2 py-1.5 shadow-sm transition-shadow focus-within:ring-1 focus-within:ring-ring'>
        {isRecording ? (
          <RecordingBar elapsedSeconds={elapsedSeconds} onCancel={() => finishRecording(true)} />
        ) : (
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='Ask about profit, unpaid customers, dead stock…'
            className='max-h-40 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0'
            showVoiceInput={false}
            rows={1}
          />
        )}

        {hasDraft && !isRecording ? (
          <button
            type='submit'
            disabled={disabled}
            className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50'
          >
            <ArrowUp className='h-4 w-4' />
          </button>
        ) : (
          isSupported && (
            <button
              type='button'
              disabled={disabled}
              onPointerDown={handleMicPointerDown}
              onPointerUp={handleMicPointerUp}
              title={isRecording ? (isTapHeld ? 'Tap again to send' : 'Release to send') : 'Hold to record'}
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50',
                isRecording
                  ? 'bg-destructive text-destructive-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70'
              )}
            >
              {isRecording ? <Square className='h-3 w-3 fill-current' /> : <Mic className='h-4 w-4' />}
            </button>
          )
        )}
      </div>
    </form>
  )
}
