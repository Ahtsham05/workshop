import { Badge } from '@/components/ui/badge'
import { useLanguage } from '@/context/language-context'
import type { AdjustmentType } from '@/stores/stockAdjustment.api'
import { ADJUSTMENT_TYPE_META } from '../lib/adjustment-types'

export function AdjustmentTypeBadge({ type }: { type: AdjustmentType }) {
  const { t } = useLanguage()
  // Fall back so a type the server adds before this map knows about can't crash the page.
  const meta = ADJUSTMENT_TYPE_META[type] ?? ADJUSTMENT_TYPE_META.other
  const Icon = meta.icon
  return (
    <Badge variant='outline' className={`gap-1 ${meta.badgeClass}`}>
      <Icon className='h-3 w-3' />
      {t(meta.label)}
    </Badge>
  )
}
