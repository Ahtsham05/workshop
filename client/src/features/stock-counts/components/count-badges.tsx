import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import type { AbcClass, StockCountStatus } from '@/stores/stockCount.api'
import { CLASS_META, STATUS_META } from '../lib/labels'

export function CountStatusBadge({ status, className }: { status: StockCountStatus; className?: string }) {
  const { t } = useLanguage()
  const meta = STATUS_META[status]
  return (
    <Badge variant='outline' className={cn('whitespace-nowrap', meta.className, className)}>
      {t(meta.label)}
    </Badge>
  )
}

export function ClassBadge({ cls, className }: { cls: AbcClass | 'exclude' | null | undefined; className?: string }) {
  const { t } = useLanguage()
  if (!cls) return <span className='text-xs text-muted-foreground'>—</span>
  if (cls === 'exclude') {
    return (
      <Badge variant='outline' className={cn('text-muted-foreground', className)}>
        {t('Excluded')}
      </Badge>
    )
  }
  const meta = CLASS_META[cls]
  return (
    <Badge variant='outline' title={t(meta.hint)} className={cn('w-6 justify-center px-0 font-semibold', meta.className, className)}>
      {meta.label}
    </Badge>
  )
}
