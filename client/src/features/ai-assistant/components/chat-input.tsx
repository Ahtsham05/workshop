import { Mic, ArrowUp, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Textarea } from '@/components/ui/textarea'

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onOpenVoiceMode,
  isMicSupported,
  disabled,
  isSending,
  onStop,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: (text: string) => void
  onOpenVoiceMode: () => void
  isMicSupported: boolean
  disabled?: boolean
  isSending?: boolean
  onStop?: () => void
}) {
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
    // `sticky` (not just flex-none) is the important part here: it keeps the composer pinned
    // to the bottom of whichever ancestor actually ends up scrolling. The page has more than
    // one nested "could be the scroll container" candidate (the shared Main layout wrapper vs.
    // this feature's own inner ScrollArea) — sticky works correctly either way, where relying
    // on the inner container always being exactly viewport-bounded does not.
    <form onSubmit={handleSubmit} className='sticky bottom-0 z-20 flex-none bg-background p-3'>
      <div className='flex items-end gap-2 rounded-3xl border bg-background px-2 py-1.5 shadow-sm transition-shadow focus-within:ring-1 focus-within:ring-ring'>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='Ask anything about your business…'
          className='max-h-40 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0'
          showVoiceInput={false}
          rows={1}
        />

        {isSending && onStop ? (
          <button
            type='button'
            onClick={onStop}
            title='Stop generating'
            className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive transition-colors hover:bg-destructive/20'
          >
            <Square className='h-3.5 w-3.5 fill-current' />
          </button>
        ) : hasDraft ? (
          <button
            type='submit'
            disabled={disabled}
            className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50'
          >
            <ArrowUp className='h-4 w-4' />
          </button>
        ) : (
          isMicSupported && (
            <button
              type='button'
              disabled={disabled}
              onClick={onOpenVoiceMode}
              title='Use voice'
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/70 disabled:opacity-50'
              )}
            >
              <Mic className='h-4 w-4' />
            </button>
          )
        )}
      </div>
    </form>
  )
}
