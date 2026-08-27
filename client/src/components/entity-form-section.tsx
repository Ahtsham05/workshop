import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { toneColor, type StatCardTone } from '@/lib/stat-card-tones'

/** Card-style form section (matches product / category entity dialogs). */
export function EntityFormSection({
  title,
  description,
  children,
  className,
  icon,
  tone = 'slate',
}: {
  title: string
  description?: string
  children: ReactNode
  className?: string
  /** Optional small badge icon shown beside the title (e.g. a section-category cue). */
  icon?: ReactNode
  tone?: StatCardTone
}) {
  return (
    <section className={cn('rounded-xl border border-border/80 bg-gradient-to-b from-card/80 to-muted/15 p-4 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.05] sm:p-5', className)}>
      <header className='mb-4 flex items-start gap-3 border-b border-border/60 pb-3'>
        {icon ? (
          <span
            className='mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white [&_svg]:h-4 [&_svg]:w-4'
            style={{ backgroundColor: toneColor(tone) }}
          >
            {icon}
          </span>
        ) : null}
        <div className='space-y-1'>
          <h3 className='text-sm font-semibold tracking-tight text-foreground'>{title}</h3>
          {description ? (
            <p className='text-xs leading-relaxed text-muted-foreground'>{description}</p>
          ) : null}
        </div>
      </header>
      <div className='space-y-4'>{children}</div>
    </section>
  )
}
