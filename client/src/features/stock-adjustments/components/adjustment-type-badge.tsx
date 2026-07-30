import { Badge } from '@/components/ui/badge'
import { useLanguage } from '@/context/language-context'
import type { AdjustmentType } from '@/stores/stockAdjustment.api'
import { ADJUSTMENT_TYPE_META } from '../lib/adjustment-types'

export function AdjustmentTypeBadge({ type }: { type: AdjustmentType }) {
  const { t } = useLanguage()
  const meta = ADJUSTMENT_TYPE_META[type]
  const Icon = meta.icon
  return (
    <Badge variant='outline' className={`gap-1 ${meta.badgeClass}`}>
      <Icon className='h-3 w-3' />
      {t(meta.label)}
    </Badge>
  )
}
