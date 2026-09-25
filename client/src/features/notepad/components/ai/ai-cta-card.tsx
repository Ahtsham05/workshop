import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AI_COLOR_STYLES, type AiColor } from '../../lib/note-ai'

interface AiCtaCardProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  onClick?: () => void
  disabled?: boolean
  /** 'highlight' is a primary-tinted card (Ask Your Notes, the footer callout); 'default' takes an explicit icon `color`. */
  tone?: 'default' | 'highlight'
  /** Icon tile color for `tone="default"` — ignored (uses the primary tint) when tone is "highlight". */
  color?: AiColor
}

/** A wide, descriptive entry point — "Ask Your Notes", "Organize with AI", the footer callout. */
export function AiCtaCard({ icon: Icon, title, description, onClick, disabled, tone = 'default', color = 'blue' }: AiCtaCardProps) {
  const palette = AI_COLOR_STYLES[color]
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border p-3 text-start transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        tone === 'highlight'
          ? 'border-primary/25 bg-primary/[0.06] hover:bg-primary/10'
          : 'border-border/60 bg-background hover:bg-accent',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg',
          tone === 'highlight' ? 'bg-primary/15 text-primary' : cn(palette.tile, palette.icon),
        )}
      >
        <Icon className='size-4' />
      </span>
      <span className='min-w-0 flex-1'>
        <span className='block text-[13px] font-semibold'>{title}</span>
        <span className='mt-0.5 block text-[11.5px] leading-snug text-muted-foreground'>{description}</span>
      </span>
      <ChevronRight className='mt-1 size-3.5 shrink-0 text-muted-foreground' />
    </button>
  )
}
