import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Curated palette shared by every color picker in the app (product display color,
 *  product/invoice flags) — one consistent visual language for "pick a color" everywhere. */
export const SWATCH_COLORS = [
  { name: 'red', hex: '#ef4444' },
  { name: 'orange', hex: '#f97316' },
  { name: 'amber', hex: '#f59e0b' },
  { name: 'green', hex: '#22c55e' },
  { name: 'teal', hex: '#14b8a6' },
  { name: 'blue', hex: '#3b82f6' },
  { name: 'indigo', hex: '#6366f1' },
  { name: 'purple', hex: '#a855f7' },
  { name: 'pink', hex: '#ec4899' },
  { name: 'gray', hex: '#6b7280' },
] as const

interface ColorSwatchPickerProps {
  value?: string | null
  onChange: (hex: string | null) => void
  /** Show a "clear" swatch that resets the value to null. */
  clearable?: boolean
  className?: string
}

/** A row of curated color swatches plus a native custom-hex fallback. Reused for the
 *  product display color and the product/invoice flag colors. */
export function ColorSwatchPicker({ value, onChange, clearable = false, className }: ColorSwatchPickerProps) {
  const normalized = value?.toLowerCase()
  const matchesPalette = SWATCH_COLORS.some((c) => c.hex === normalized)

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {clearable && (
        <button
          type='button'
          onClick={() => onChange(null)}
          title='No color'
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground transition-transform hover:scale-110',
            !value && 'ring-2 ring-ring ring-offset-2 ring-offset-background'
          )}
        >
          <span className='text-xs'>✕</span>
        </button>
      )}
      {SWATCH_COLORS.map((color) => (
        <button
          key={color.hex}
          type='button'
          title={color.name}
          onClick={() => onChange(color.hex)}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-full transition-transform hover:scale-110',
            normalized === color.hex && 'ring-2 ring-ring ring-offset-2 ring-offset-background'
          )}
          style={{ backgroundColor: color.hex }}
        >
          {normalized === color.hex && <Check className='h-3.5 w-3.5 text-white drop-shadow' />}
        </button>
      ))}
      <label
        title='Custom color'
        className={cn(
          'relative flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-border bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)] transition-transform hover:scale-110',
          value && !matchesPalette && 'ring-2 ring-ring ring-offset-2 ring-offset-background'
        )}
      >
        <input
          type='color'
          value={value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#888888'}
          onChange={(e) => onChange(e.target.value)}
          className='absolute inset-0 h-full w-full cursor-pointer opacity-0'
        />
        {value && !matchesPalette && (
          <span className='pointer-events-none h-full w-full' style={{ backgroundColor: value }} />
        )}
      </label>
    </div>
  )
}

/** Small read-only color dot, e.g. next to a product name in a table row. */
export function ColorDot({ hex, className }: { hex?: string | null; className?: string }) {
  if (!hex) return null
  return (
    <span
      className={cn('inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ring-1 ring-black/10', className)}
      style={{ backgroundColor: hex }}
      title={hex}
    />
  )
}
