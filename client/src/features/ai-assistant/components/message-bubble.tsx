import { format, isValid } from 'date-fns'
import { Bot, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AiMessage } from '@/stores/aiAssistant.api'

function safeTime(value: string) {
  const date = new Date(value)
  return isValid(date) ? format(date, 'h:mm a') : ''
}

export function MessageBubble({ message }: { message: AiMessage }) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex w-full gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
        )}
      >
        {isUser ? <User className='h-4 w-4' /> : <Bot className='h-4 w-4' />}
      </div>
      <div
        className={cn(
          'max-w-[85%] px-3.5 py-2 text-sm whitespace-pre-wrap break-words shadow-sm sm:max-w-[75%]',
          isUser
            ? 'rounded-[16px_16px_0_16px] bg-primary text-primary-foreground'
            : 'rounded-[16px_16px_16px_0] bg-background text-foreground'
        )}
      >
        {message.content}
        <div className={cn('mt-1 text-[10px] opacity-60', isUser ? 'text-right' : 'text-left')}>
          {safeTime(message.createdAt)}
        </div>
      </div>
    </div>
  )
}
