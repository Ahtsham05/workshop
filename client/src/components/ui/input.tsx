import * as React from 'react'
import { cn } from '@/lib/utils'
import { VoiceInputButton } from '@/components/ui/voice-input-button'
import {
  formatPhoneInput,
  formatCNICInput,
  processVoiceForPhone,
  processVoiceForCNIC,
  processVoiceText,
} from '@/utils/phone-cnic-utils'

// Input types where a microphone / formatting makes no sense
const NO_VOICE_TYPES = new Set([
  'password', 'number', 'file', 'hidden', 'color', 'range',
  'submit', 'button', 'reset', 'image', 'date', 'time',
  'datetime-local', 'month', 'week', 'checkbox', 'radio',
])

interface InputProps extends React.ComponentProps<'input'> {
  /** Hides the mic button when set to false. Defaults to true for text-like inputs. */
  showVoiceInput?: boolean
  /**
   * 'phone' → digits only, max 11, smart voice replacement
   * 'cnic'  → auto-formats as XXXXX-XXXXXXX-X, smart voice replacement
   */
  fieldType?: 'phone' | 'cnic'
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type,
      onWheel,
      onKeyDown,
      showVoiceInput,
      fieldType,
      onChange,
      value,
      maxLength,
      inputMode,
      ...props
    },
    ref,
  ) => {
    const handleWheel = React.useCallback(
      (e: React.WheelEvent<HTMLInputElement>) => {
        if (type === 'number') e.currentTarget.blur()
        onWheel?.(e)
      },
      [type, onWheel],
    )

    const handleKeyDown = React.useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (type === 'number' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault()
        }
        onKeyDown?.(e)
      },
      [type, onKeyDown],
    )

    // Intercept keyboard input for phone/cnic formatting
    const handleChange = React.useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!onChange) return
        if (fieldType === 'phone') {
          const formatted = formatPhoneInput(e.target.value)
          // Update the DOM element directly (works for both RHF register and controlled inputs)
          e.target.value = formatted
          onChange({ target: { value: formatted, name: e.target.name } } as any)
        } else if (fieldType === 'cnic') {
          const formatted = formatCNICInput(e.target.value)
          e.target.value = formatted
          onChange({ target: { value: formatted, name: e.target.name } } as any)
        } else {
          onChange(e)
        }
      },
      [onChange, fieldType],
    )

    // Smart voice transcript processing
    const handleVoiceTranscript = React.useCallback(
      (transcript: string) => {
        let newValue: string
        if (fieldType === 'phone') {
          // Replace entire field with the spoken phone number (digits only)
          newValue = processVoiceForPhone(transcript)
        } else if (fieldType === 'cnic') {
          // Replace entire field with the spoken CNIC (formatted)
          newValue = processVoiceForCNIC(transcript)
        } else {
          // Smart detection: digits-only → strip spaces; text → keep spaces
          const processed = processVoiceText(transcript)
          const currentVal = typeof value === 'string' ? value : ''
          newValue = currentVal ? `${currentVal.trimEnd()} ${processed}` : processed
        }
        onChange?.({ target: { value: newValue } } as React.ChangeEvent<HTMLInputElement>)
      },
      [value, onChange, fieldType],
    )

    const shouldShowVoice = showVoiceInput !== false && !NO_VOICE_TYPES.has(type || 'text')

    // Resolve maxLength and inputMode based on fieldType
    const resolvedMaxLength = maxLength ?? (fieldType === 'phone' ? 11 : fieldType === 'cnic' ? 15 : undefined)
    const resolvedInputMode = inputMode ?? (fieldType === 'phone' || fieldType === 'cnic' ? 'numeric' : undefined)

    const inputEl = (
      <input
        type={type}
        data-slot='input'
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        maxLength={resolvedMaxLength}
        inputMode={resolvedInputMode}
        className={cn(
          'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
          'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
          shouldShowVoice && 'pr-9',
          className,
        )}
        value={value}
        onChange={handleChange}
        ref={ref}
        {...props}
      />
    )

    if (shouldShowVoice) {
      return (
        <div className={cn('relative', className)}>
          {inputEl}
          <div className='absolute right-2 top-1/2 -translate-y-1/2 z-10'>
            <VoiceInputButton onTranscript={handleVoiceTranscript} size='sm' />
          </div>
        </div>
      )
    }

    return inputEl
  },
)

Input.displayName = 'Input'

export { Input }
