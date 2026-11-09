import { cn } from '@/lib/utils'
import type { CreditStatusKey } from '@/stores/creditControl.api'
import { CREDIT_STATUS_META } from './credit-utils'

/**
 * Used-vs-limit bar. With `projected`, the part this sale would add is drawn striped after
 * what is already owed, so the cashier sees whether the sale fits before saving.
 */
export function CreditMeter({
  limit,
  exposure,
  projected,
  status,
  className,
}: {
  limit: number
  exposure: number
  projected?: number
  status: CreditStatusKey
  className?: string
}) {
  if (limit <= 0) return null
  const scale = Math.max(limit, projected ?? 0, exposure)
  const usedPct = Math.min(100, (Math.max(0, exposure) / scale) * 100)
  const salePct = projected !== undefined ? Math.min(100 - usedPct, (Math.max(0, projected - Math.max(0, exposure)) / scale) * 100) : 0
  const limitPct = (limit / scale) * 100
  const projectedOver = projected !== undefined && projected > limit + 0.005
  return (
    <div className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div className={cn('absolute inset-y-0 left-0 rounded-full', CREDIT_STATUS_META[status].bar)} style={{ width: `${usedPct}%` }} />
      {salePct > 0 && (
        <div
          className='absolute inset-y-0'
          style={{
            left: `${usedPct}%`,
            width: `${salePct}%`,
            backgroundImage: `repeating-linear-gradient(45deg, ${projectedOver ? '#ef4444' : '#0ea5e9'} 0 4px, transparent 4px 8px)`,
          }}
        />
      )}
      {limitPct < 100 && <div className='absolute inset-y-0 w-0.5 bg-foreground/70' style={{ left: `${limitPct}%` }} />}
    </div>
  )
}
