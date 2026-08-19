import { useState } from 'react'
import { format, isValid } from 'date-fns'
import { Bot, User, Copy, Check, Volume2, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AiMessage } from '@/stores/aiAssistant.api'
import { BusinessResponse } from './business-responses/business-response'
import { ActionConfirmationCard } from './business-responses/action-confirmation-card'
import { getFollowUpsFor } from './business-responses/follow-ups'
import { FollowUpChips } from './follow-up-chips'

function safeTime(value: string) {
  const date = new Date(value)
  return isValid(date) ? format(date, 'h:mm a') : ''
}

export function MessageBubble({
  message,
  onFollowUp,
  isSpeaking,
  onToggleSpeak,
}: {
  message: AiMessage
  onFollowUp?: (text: string) => void
  isSpeaking?: boolean
  onToggleSpeak?: () => void
}) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard permission denied — silently ignore, nothing to recover from
    }
  }

  return (
    <div
      className={cn(
        'flex w-full flex-col gap-1 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300',
        isUser ? 'items-end' : 'items-start'
      )}
    >
      <div className={cn('flex w-full gap-3', isUser && 'flex-row-reverse')}>
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
            isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          )}
        >
          {isUser ? <User className='h-4 w-4' /> : <Bot className='h-4 w-4' />}
        </div>
        <div className='flex min-w-0 max-w-[85%] flex-col sm:max-w-[75%]'>
          <div
            className={cn(
              'px-3.5 py-2 text-sm whitespace-pre-wrap break-words shadow-sm',
              isUser
                ? 'rounded-[16px_16px_0_16px] bg-primary text-primary-foreground'
                : 'rounded-[16px_16px_16px_0] border bg-background text-foreground'
            )}
          >
            {message.content}
            <div className={cn('mt-1 text-[10px] opacity-60', isUser ? 'text-right' : 'text-left')}>
              {safeTime(message.createdAt)}
            </div>
          </div>

          {!isUser && message.id !== 'pending' && (
            <div className='mt-1 flex items-center gap-0.5'>
              <button
                type='button'
                onClick={handleCopy}
                title='Copy'
                className='rounded-md p-1.5 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground'
              >
                {copied ? <Check className='h-3.5 w-3.5' /> : <Copy className='h-3.5 w-3.5' />}
              </button>
              {onToggleSpeak && (
                <button
                  type='button'
                  onClick={onToggleSpeak}
                  title={isSpeaking ? 'Stop' : 'Read aloud'}
                  className={cn(
                    'rounded-md p-1.5 transition-colors hover:bg-muted',
                    isSpeaking ? 'text-primary' : 'text-muted-foreground/60 hover:text-foreground'
                  )}
                >
                  {isSpeaking ? <Square className='h-3.5 w-3.5 fill-current' /> : <Volume2 className='h-3.5 w-3.5' />}
                </button>
              )}
            </div>
          )}

          {!isUser && message.pendingAction && (
            <ActionConfirmationCard conversationId={message.conversationId} messageId={message.id} action={message.pendingAction} />
          )}
          {!isUser && !message.pendingAction && <BusinessResponse toolCalls={message.toolCalls} />}
          {!isUser && onFollowUp && <FollowUpChips items={getFollowUpsFor(message.toolCalls)} onSelect={onFollowUp} />}
        </div>
      </div>
    </div>
  )
}
