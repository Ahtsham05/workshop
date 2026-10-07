import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'

/*
 * Page-level building blocks shared by every Manufacturing screen. They keep the
 * module visually quiet: one heading scale, one card treatment, neutral figures —
 * colour is reserved for state (late, short, rejected), never decoration.
 */

/** Page title row: heading + one-line purpose on the left, primary actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  /** Small line above the title (e.g. a parent link or record type). */
  meta?: React.ReactNode
}) {
  return (
    <div className='flex flex-wrap items-start justify-between gap-x-6 gap-y-3'>
      <div className='min-w-0 flex-1 space-y-1'>
        {meta && <div className='text-muted-foreground text-xs'>{meta}</div>}
        <h2 className='text-xl font-semibold tracking-tight'>{title}</h2>
        {description && (
          <p className='text-muted-foreground max-w-3xl text-sm'>
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className='flex flex-wrap items-center gap-2 max-sm:w-full max-sm:[&>*]:flex-1'>
          {actions}
        </div>
      )}
    </div>
  )
}

/** Quiet empty state with an optional call to action. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  bordered = true,
  className,
}: {
  icon: React.ElementType
  title: string
  description?: string
  action?: React.ReactNode
  /** Dashed outline when standing alone; off inside a table or panel. */
  bordered?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 px-6 py-12 text-center',
        bordered && 'rounded-xl border border-dashed',
        className
      )}
    >
      <div className='bg-muted mb-1 flex h-10 w-10 items-center justify-center rounded-full'>
        <Icon className='text-muted-foreground h-5 w-5' aria-hidden />
      </div>
      <p className='text-sm font-medium'>{title}</p>
      {description && (
        <p className='text-muted-foreground max-w-sm text-sm'>{description}</p>
      )}
      {action && <div className='mt-3'>{action}</div>}
    </div>
  )
}

/** A titled card section. The header row carries an optional action (link, menu, button). */
export function Panel({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
  flush,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  contentClassName?: string
  /** No inner padding — for tables and lists that run edge to edge. */
  flush?: boolean
}) {
  return (
    <Card className={cn('gap-0 py-0', className)}>
      {(title || action) && (
        <div className='flex items-start justify-between gap-3 border-b px-5 py-3.5 max-sm:px-4'>
          <div className='min-w-0'>
            {title && <h3 className='text-sm font-semibold'>{title}</h3>}
            {description && (
              <p className='text-muted-foreground mt-0.5 text-xs'>
                {description}
              </p>
            )}
          </div>
          {action && <div className='shrink-0'>{action}</div>}
        </div>
      )}
      <div className={cn(!flush && 'px-5 py-4 max-sm:px-4', contentClassName)}>
        {children}
      </div>
    </Card>
  )
}

type Tone = 'default' | 'danger' | 'warning' | 'success'

const TONE_TEXT: Record<Tone, string> = {
  default: '',
  danger: 'text-rose-600 dark:text-rose-400',
  warning: 'text-amber-600 dark:text-amber-400',
  success: 'text-emerald-600 dark:text-emerald-400',
}
const TONE_DOT: Record<Tone, string> = {
  default: 'bg-muted-foreground/40',
  danger: 'bg-rose-500',
  warning: 'bg-amber-500',
  success: 'bg-emerald-500',
}

/** A row of key figures sharing one card, separated by hairlines. */
export function StatGrid({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'bg-border grid gap-px overflow-hidden rounded-xl border',
        'grid-cols-2 md:grid-cols-3',
        // An odd tile out on two columns spans the row instead of leaving a hole.
        'max-md:[&>*:last-child:nth-child(odd)]:col-span-2',
        className
      )}
    >
      {children}
    </div>
  )
}

/**
 * One key figure. Neutral by default; a tone only colours the value when it signals
 * something to act on (and only while it is non-zero).
 */
export function Stat({
  label,
  value,
  hint,
  tone = 'default',
  active = true,
  href,
  search,
  onClick,
  pressed,
  delta,
  className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  hint?: React.ReactNode
  /** Change vs a named period. `good` says whether this direction is good news. */
  delta?: { text: string; direction: 'up' | 'down' | 'flat'; good: boolean }
  tone?: Tone
  /** Whether the tone applies (e.g. overdue count > 0). */
  active?: boolean
  href?: string
  search?: Record<string, unknown>
  /** Act in place (e.g. apply a filter) instead of navigating. */
  onClick?: () => void
  /** With onClick: the filter this tile applies is currently on. */
  pressed?: boolean
  className?: string
}) {
  const appliedTone = active ? tone : 'default'
  const body = (
    <>
      <div className='text-muted-foreground flex items-center gap-1.5 text-xs font-medium'>
        <span
          className={cn('h-1.5 w-1.5 rounded-full', TONE_DOT[appliedTone])}
          aria-hidden
        />
        {label}
      </div>
      <div
        className={cn(
          'mt-2 truncate text-xl font-semibold tracking-tight @[13rem]:text-2xl',
          TONE_TEXT[appliedTone]
        )}
      >
        {value}
      </div>
      {delta && (
        <div
          className={cn(
            'mt-1 flex items-start gap-1 text-xs font-medium sm:truncate',
            delta.direction === 'flat'
              ? 'text-muted-foreground'
              : delta.good
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-rose-700 dark:text-rose-400'
          )}
        >
          <span aria-hidden>
            {delta.direction === 'up'
              ? '↑'
              : delta.direction === 'down'
                ? '↓'
                : '→'}
          </span>
          {delta.text}
        </div>
      )}
      {hint && (
        <div className='text-muted-foreground mt-1 text-xs sm:truncate'>
          {hint}
        </div>
      )}
    </>
  )
  const base = cn('bg-card @container min-w-0 px-5 py-4 max-sm:px-4', className)
  if (onClick) {
    return (
      <button
        type='button'
        onClick={onClick}
        aria-pressed={pressed}
        className={cn(
          base,
          'hover:bg-muted/40 focus-visible:ring-ring text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset',
          pressed && 'bg-muted/60 shadow-[inset_0_-2px_0_0_var(--foreground)]'
        )}
      >
        {body}
      </button>
    )
  }
  if (!href) return <div className={base}>{body}</div>
  return (
    <Link
      to={href as never}
      search={search as never}
      className={cn(
        base,
        'hover:bg-muted/40 focus-visible:ring-ring transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset'
      )}
    >
      {body}
    </Link>
  )
}

/** Label/value pair for detail panels. */
export function Field({
  label,
  children,
  className,
}: {
  label: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className='text-muted-foreground text-xs'>{label}</dt>
      <dd className='mt-0.5 truncate text-sm'>{children}</dd>
    </div>
  )
}
