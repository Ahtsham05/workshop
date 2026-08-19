import { Bot, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The one growing assistant bubble for an in-progress reply — text is appended as delta
 * events arrive (never re-created per token, see index.tsx#streamAndTrack) and swapped out
 * for the real persisted MessageBubble once the backend confirms the message landed.
 */
export function StreamingMessage({
  text,
  status,
  interrupted,
}: {
  text: string
  status: string | null
  interrupted?: boolean
}) {
  return (
    <div className='flex w-full flex-col items-start gap-1 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300'>
      <div className='flex w-full gap-3'>
        <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground'>
          <Bot className='h-4 w-4' />
        </div>
        <div className='flex min-w-0 max-w-[85%] flex-col sm:max-w-[75%]'>
          <div
            className={cn(
              'min-h-[2.25rem] rounded-[16px_16px_16px_0] border bg-background px-3.5 py-2 text-sm whitespace-pre-wrap break-words text-foreground shadow-sm'
            )}
          >
            {text}
            {!interrupted && (
              <span className='ml-0.5 inline-block h-3.5 w-[2px] translate-y-[2px] bg-foreground/60 motion-safe:animate-pulse' />
            )}
          </div>

          {status && !interrupted && (
            <div className='mt-1 flex items-center gap-1.5 px-1 text-xs text-muted-foreground'>
              <Sparkles className='h-3 w-3 shrink-0 motion-safe:animate-pulse' />
              <span key={status} className='motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300'>
                {status}
              </span>
            </div>
          )}

          {interrupted && <div className='mt-1 px-1 text-xs text-muted-foreground'>Stopped</div>}
        </div>
      </div>
    </div>
  )
}
