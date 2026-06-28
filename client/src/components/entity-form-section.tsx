import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Card-style form section (matches product / category entity dialogs). */
export function EntityFormSection({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-xl border border-border/80 bg-gradient-to-b from-card/80 to-muted/15 p-4 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.05] sm:p-5', className)}>
      <header className='mb-4 space-y-1 border-b border-border/60 pb-3'>
        <h3 className='text-sm font-semibold tracking-tight text-foreground'>{title}</h3>
        {description ? (
          <p className='text-xs leading-relaxed text-muted-foreground'>{description}</p>
        ) : null}
      </header>
      <div className='space-y-4'>{children}</div>
    </section>
  )
}
