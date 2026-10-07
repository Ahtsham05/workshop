import type {
  ProductType,
  ProductionPriority,
  ProductionStatus,
} from '@/stores/manufacturing.api'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Badge } from '@/components/ui/badge'
import { PRIORITY_META, PRODUCT_TYPE_META, STATUS_META } from '../lib/constants'

export function StatusBadge({
  status,
  className,
}: {
  status: ProductionStatus
  className?: string
}) {
  const { t } = useLanguage()
  const meta = STATUS_META[status]
  return (
    <Badge
      variant='outline'
      className={cn('gap-1.5 font-medium', meta.className, className)}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} aria-hidden />
      {t(meta.label)}
    </Badge>
  )
}

export function ProductTypeBadge({
  type,
}: {
  type: ProductType | null | undefined
}) {
  const { t } = useLanguage()
  if (!type) {
    return (
      <Badge
        variant='outline'
        className='text-muted-foreground border-dashed font-normal'
      >
        {t('Unclassified')}
      </Badge>
    )
  }
  const meta = PRODUCT_TYPE_META[type]
  return (
    <Badge variant='outline' className={cn('font-medium', meta.className)}>
      {t(meta.label)}
    </Badge>
  )
}

export function PriorityText({ priority }: { priority: ProductionPriority }) {
  const { t } = useLanguage()
  const meta = PRIORITY_META[priority]
  return (
    <span className={cn('text-xs tracking-wide uppercase', meta.className)}>
      {t(meta.label)}
    </span>
  )
}

/** Thin two-tone progress bar used across WIP / orders. */
export function ProgressBar({
  value,
  tone = 'primary',
}: {
  value: number
  tone?: 'primary' | 'amber' | 'emerald'
}) {
  const pct = Math.max(0, Math.min(100, value))
  const color =
    tone === 'amber'
      ? 'bg-amber-500'
      : tone === 'emerald'
        ? 'bg-emerald-500'
        : 'bg-primary'
  return (
    <div
      className='bg-muted h-1.5 w-full overflow-hidden rounded-full'
      role='progressbar'
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn('h-full rounded-full transition-all', color)}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
