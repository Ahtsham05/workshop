import { ArrowDownRight, ArrowUpRight, Minus, Sparkles } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import type { AbcClass, Movement } from '@/stores/productAnalytics.api'
import { formatGrowth } from '../lib/analytics-format'
import { ABC_DESCRIPTIONS, ABC_STYLES, MOVEMENT_META } from '../lib/analytics-classes'

export function AbcBadge({ value, className }: { value: AbcClass | null; className?: string }) {
  const { t } = useLanguage()
  if (!value) {
    return <span className={cn('text-xs text-muted-foreground', className)}>—</span>
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex h-6 w-6 shrink-0 cursor-default items-center justify-center rounded-md text-xs font-bold',
            ABC_STYLES[value],
            className,
          )}
          aria-label={t(ABC_DESCRIPTIONS[value])}
        >
          {value}
        </span>
      </TooltipTrigger>
      <TooltipContent>{t(ABC_DESCRIPTIONS[value])}</TooltipContent>
    </Tooltip>
  )
}

export function MovementBadge({ value, compact = false }: { value: Movement; compact?: boolean }) {
  const { t } = useLanguage()
  const meta = MOVEMENT_META[value]
  if (!meta) return null
  const Icon = meta.icon
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex cursor-default items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium',
            meta.className,
          )}
        >
          <Icon className='h-3 w-3' aria-hidden />
          {compact ? null : t(meta.label)}
          {compact ? <span className='sr-only'>{t(meta.label)}</span> : null}
        </span>
      </TooltipTrigger>
      <TooltipContent>{t(meta.hint)}</TooltipContent>
    </Tooltip>
  )
}

/** Growth vs the previous period: arrow + signed %, colored by direction; "New" when there's no base. */
export function GrowthIndicator({
  value,
  isNew,
  className,
  invert = false,
}: {
  value: number | null
  isNew?: boolean
  className?: string
  /** For metrics where going down is good. */
  invert?: boolean
}) {
  const { t } = useLanguage()
  if (isNew) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-400', className)}>
        <Sparkles className='h-3 w-3' aria-hidden />
        {t('New')}
      </span>
    )
  }
  if (value === null || value === undefined) {
    return <span className={cn('text-xs text-muted-foreground', className)}>—</span>
  }
  const up = value > 0
  const flat = value === 0
  const good = invert ? !up : up
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium tabular-nums',
        flat ? 'text-muted-foreground' : good ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
        className,
      )}
    >
      <Icon className='h-3.5 w-3.5' aria-hidden />
      {formatGrowth(value)}
    </span>
  )
}
