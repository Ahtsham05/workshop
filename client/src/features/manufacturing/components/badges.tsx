import { Layers } from 'lucide-react'
import type {
  ProductType,
  ProductionPriority,
  ProductionStatus,
  OrderType,
} from '@/stores/manufacturing.api'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Badge } from '@/components/ui/badge'
import {
  PRIORITY_META,
  PRODUCT_TYPE_META,
  STATUS_META,
  statusLabel,
} from '../lib/constants'

export function StatusBadge({
  status,
  orderType,
  className,
}: {
  status: ProductionStatus
  orderType?: OrderType
  className?: string
}) {
  const { t } = useLanguage()
  const meta = { ...STATUS_META[status], label: statusLabel(status, orderType) }
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
  label,
}: {
  value: number
  tone?: 'primary' | 'amber' | 'emerald'
  /** Accessible name; defaults to "Progress". */
  label?: string
}) {
  const { t } = useLanguage()
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
      aria-label={label || t('Progress')}
      aria-valuenow={Math.round(pct)}
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

/**
 * A batch (lot) number in the invoice's batch-pill look. `tone="danger"` for an expired
 * or short batch; `size="sm"` inside tables.
 */
export function BatchBadge({
  batchNumber,
  tone = 'default',
  size = 'md',
  title,
  className,
  children,
  mono = true,
}: {
  batchNumber: string
  /** Batch numbers read best monospaced; counts / labels don't. */
  mono?: boolean
  tone?: 'default' | 'danger' | 'muted'
  size?: 'sm' | 'md'
  title?: string
  className?: string
  children?: React.ReactNode
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border font-medium',
        size === 'sm' ? 'px-1.5 py-0 text-[11px]' : 'px-2 py-0.5 text-xs',
        tone === 'danger'
          ? 'border-destructive bg-destructive/10 text-destructive'
          : tone === 'muted'
            ? 'border-border bg-muted text-muted-foreground'
            : 'border-blue-600 bg-blue-100 text-blue-800 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-200',
        className
      )}
    >
      <Layers
        className={cn('shrink-0', size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3')}
        aria-hidden
      />
      <span className={cn('truncate', mono && 'font-mono')}>
        {batchNumber}
      </span>
      {children}
    </span>
  )
}
