import * as React from 'react'
import { cn } from '@/lib/utils'
import { VoiceInputButton } from '@/components/ui/voice-input-button'

interface TextareaProps extends React.ComponentProps<'textarea'> {
  showVoiceInput?: boolean
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, showVoiceInput, onChange, value, ...props }, ref) => {
    const shouldShowVoice = showVoiceInput !== false

    const handleVoiceTranscript = React.useCallback(
      (transcript: string) => {
        const currentVal = typeof value === 'string' ? value : ''
        const event = {
          target: { value: currentVal + transcript },
        } as React.ChangeEvent<HTMLTextAreaElement>
        onChange?.(event)
      },
      [value, onChange],
    )

    const textareaEl = (
      <textarea
        data-slot='textarea'
        className={cn(
          'border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          shouldShowVoice && 'pb-8',
          className,
        )}
        value={value}
        onChange={onChange}
        ref={ref}
        {...props}
      />
    )

    if (shouldShowVoice) {
      return (
        <div className='relative w-full'>
          {textareaEl}
          <div className='absolute right-2 bottom-2 z-10'>
            <VoiceInputButton onTranscript={handleVoiceTranscript} size='sm' />
          </div>
        </div>
      )
    }

    return textareaEl
  },
)

Textarea.displayName = 'Textarea'

export { Textarea }
