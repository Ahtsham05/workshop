import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Input } from '@/components/ui/input'

export interface ChipOption {
  value: string
  label: string
  count?: number
  /** Colours the count when it needs attention (e.g. overdue). */
  tone?: 'danger' | 'warning'
}

/**
 * Single-choice filter chips with optional counts. Scrolls sideways on small screens
 * instead of wrapping into a wall of buttons.
 */
export function FilterChips({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: ChipOption[]
  value: string
  onChange: (value: string) => void
  label: string
  className?: string
}) {
  return (
    <div
      role='group'
      aria-label={label}
      className={cn(
        '-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0',
        className
      )}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type='button'
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'focus-visible:ring-ring inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-2 sm:h-8',
              selected
                ? 'border-foreground bg-foreground text-background'
                : 'bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30'
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span
                className={cn(
                  'tabular-nums',
                  selected ? 'opacity-70' : 'text-muted-foreground/80',
                  !selected &&
                    option.count > 0 &&
                    option.tone === 'danger' &&
                    'text-rose-600 dark:text-rose-400',
                  !selected &&
                    option.count > 0 &&
                    option.tone === 'warning' &&
                    'text-amber-600 dark:text-amber-400'
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Search box with a leading icon and a clear button. */
export function SearchField({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  className?: string
}) {
  const { t } = useLanguage()
  return (
    <div className={cn('relative w-full sm:w-72', className)}>
      <Search
        className='text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2'
        aria-hidden
      />
      <Input
        type='search'
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        showVoiceInput={false}
        className='h-9 pr-8 pl-9 [&::-webkit-search-cancel-button]:hidden'
      />
      {value && (
        <button
          type='button'
          onClick={() => onChange('')}
          aria-label={t('Clear search')}
          className='text-muted-foreground hover:text-foreground absolute top-1/2 right-2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded'
        >
          <X className='h-3.5 w-3.5' />
        </button>
      )}
    </div>
  )
}

/** The row above a list: filters on the left, secondary controls on the right. */
export function Toolbar({
  children,
  end,
  className,
}: {
  children: React.ReactNode
  end?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between',
        className
      )}
    >
      <div className='flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center'>
        {children}
      </div>
      {end && <div className='flex flex-wrap items-center gap-2'>{end}</div>}
    </div>
  )
}
