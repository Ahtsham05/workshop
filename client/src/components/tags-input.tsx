import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TagsInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  /** Existing tag values (e.g. already used elsewhere in the org) shown as click-to-add suggestions. */
  suggestions?: string[]
  className?: string
  /** Called when Enter is pressed with no draft text typed — signals "done adding tags"
   *  so a caller can move focus elsewhere (e.g. the next field) instead of the no-op
   *  default of just swallowing the keypress. */
  onEmptyEnter?: () => void
}

/** Free-text chip/tag input — Enter or comma commits a tag, Backspace on an empty input
 *  removes the last one. Generalized from the sub-category tags interaction pattern but
 *  works on a plain string[] with no backend coupling, so it's reusable anywhere.
 *  Forwards a ref to the underlying draft `<input>` so a caller can focus it directly
 *  (e.g. right after a preceding field's own selection commits). */
export const TagsInput = forwardRef<HTMLInputElement, TagsInputProps>(function TagsInput(
  { value, onChange, placeholder, suggestions, className, onEmptyEnter },
  forwardedRef
) {
  const [draft, setDraft] = useState('')
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useImperativeHandle(forwardedRef, () => inputRef.current as HTMLInputElement)

  const commitDraft = (raw?: string) => {
    const trimmed = (raw ?? draft).trim()
    setDraft('')
    if (!trimmed) return
    if (value.some((t) => t.toLowerCase() === trimmed.toLowerCase())) return
    onChange([...value, trimmed])
  }

  const removeAt = (index: number) => onChange(value.filter((_, i) => i !== index))

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      if (event.key === 'Enter' && !draft.trim() && onEmptyEnter) {
        event.preventDefault()
        onEmptyEnter()
        return
      }
      event.preventDefault()
      commitDraft()
    } else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      removeAt(value.length - 1)
    }
  }

  const filteredSuggestions = useMemo(() => {
    if (!suggestions?.length) return []
    const q = draft.trim().toLowerCase()
    return suggestions
      .filter((s) => !value.some((t) => t.toLowerCase() === s.toLowerCase()))
      .filter((s) => !q || s.toLowerCase().includes(q))
      .slice(0, 8)
  }, [suggestions, draft, value])

  return (
    <div className={cn('relative space-y-1.5', className)}>
      <div
        onClick={() => inputRef.current?.focus()}
        className='flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background px-2.5 py-1.5 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50'
      >
        {value.map((tag, index) => (
          <span
            key={`${tag}-${index}`}
            className='inline-flex items-center gap-1 rounded-full bg-primary/10 py-1 pl-2.5 pr-1 text-xs font-medium text-primary'
          >
            {tag}
            <button
              type='button'
              onClick={(e) => { e.stopPropagation(); removeAt(index) }}
              className='flex h-4 w-4 shrink-0 items-center justify-center rounded-full hover:bg-primary/20'
              aria-label='Remove tag'
            >
              <X className='h-3 w-3' />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setSuggestionsOpen(true)}
          onBlur={() => { commitDraft(); setTimeout(() => setSuggestionsOpen(false), 100) }}
          placeholder={value.length === 0 ? placeholder ?? 'Add a tag and press Enter...' : ''}
          className='h-6 min-w-[8rem] flex-1 border-none bg-transparent text-sm outline-none placeholder:text-muted-foreground'
        />
      </div>
      {suggestionsOpen && filteredSuggestions.length > 0 && (
        <div className='absolute z-10 flex w-full flex-wrap gap-1 rounded-lg border border-border bg-popover p-2 shadow-md'>
          {filteredSuggestions.map((s) => (
            <button
              key={s}
              type='button'
              onMouseDown={(e) => { e.preventDefault(); commitDraft(s) }}
              className={cn('rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-xs font-medium hover:bg-muted')}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
})
