import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Tap-to-toggle chips for quick picks (problems, condition, accessories). */
export function ChipGroup({
  options,
  value,
  onChange,
  tone = 'primary',
  ariaLabel,
}: {
  options: string[]
  value: string[]
  onChange: (next: string[]) => void
  tone?: 'primary' | 'warning'
  ariaLabel: string
}) {
  const toggle = (opt: string) =>
    onChange(
      value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]
    )
  return (
    <div role='group' aria-label={ariaLabel} className='flex flex-wrap gap-1.5'>
      {options.map((opt) => {
        const on = value.includes(opt)
        return (
          <button
            key={opt}
            type='button'
            aria-pressed={on}
            onClick={() => toggle(opt)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
              on
                ? tone === 'warning'
                  ? 'border-amber-500 bg-amber-500/15 text-amber-900 dark:text-amber-200'
                  : 'border-primary bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground'
            )}
          >
            {on && <Check className='h-3 w-3' aria-hidden />}
            {opt}
          </button>
        )
      })}
    </div>
  )
}
