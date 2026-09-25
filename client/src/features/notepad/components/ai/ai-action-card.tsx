import { cn } from '@/lib/utils'
import { AI_COLOR_STYLES, type AiColor } from '../../lib/note-ai'

interface AiActionCardProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  color: AiColor
  active?: boolean
  disabled?: boolean
  onClick: () => void
}

/** One quick-action tile in the AI panel's grid — a real card with its own icon color, not a plain text row. */
export function AiActionCard({ icon: Icon, label, color, active, disabled, onClick }: AiActionCardProps) {
  const palette = AI_COLOR_STYLES[color]
  return (
    <button
      type='button'
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-2 rounded-xl border px-2.5 py-2.5 text-start text-[12.5px] font-medium transition-all',
        'hover:border-primary/40 hover:shadow-sm',
        'disabled:pointer-events-none disabled:opacity-50',
        active ? 'border-primary/50 bg-primary/5 shadow-sm' : 'border-border/60 bg-background',
      )}
    >
      <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg', palette.tile, palette.icon)}>
        <Icon className='size-4' />
      </span>
      <span className='min-w-0 flex-1 truncate'>{label}</span>
    </button>
  )
}
