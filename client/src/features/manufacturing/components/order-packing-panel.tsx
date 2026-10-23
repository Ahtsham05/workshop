import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import {
  useGetPackingVouchersQuery,
  type ProductionOrder,
} from '@/stores/manufacturing.api'
import { formatAppDate } from '@/lib/date-format'
import { getUnitLabel } from '@/lib/units'
import { useLanguage } from '@/context/language-context'
import { Button } from '@/components/ui/button'
import { fmtQty } from '../lib/constants'
import { Panel } from './page'

/**
 * What this order's output was packed into: packs per size across its packing vouchers,
 * the bulk they took, and what is left loose — the "how it finished" of the batch.
 */
export function OrderPackingPanel({ order }: { order: ProductionOrder }) {
  const { t } = useLanguage()
  const { data } = useGetPackingVouchersQuery({
    productionOrderId: order.id,
    status: 'posted',
    limit: 100,
  })
  const vouchers = data?.results || []
  if (!vouchers.length) return null

  const unit = getUnitLabel(order.unit)
  const bySize = new Map<
    string,
    { name: string; unit: string; quantity: number; bulk: number }
  >()
  vouchers.forEach((v) =>
    v.lines.forEach((l) => {
      const e = bySize.get(l.packName) || {
        name: l.packName,
        unit: l.unit,
        quantity: 0,
        bulk: 0,
      }
      e.quantity += l.quantity
      e.bulk += l.bulkQuantity
      bySize.set(l.packName, e)
    })
  )
  const packed = vouchers.reduce((s, v) => s + v.bulkQuantity, 0)
  const loose = Math.max(0, (order.completedQuantity || 0) - packed)

  return (
    <Panel
      title={t('Packing')}
      action={
        <Button variant='ghost' size='sm' className='-my-1 h-7 px-2' asChild>
          <Link to={'/manufacturing/packing' as never}>
            {t('Open')}
            <ArrowRight className='ml-1 h-3.5 w-3.5' />
          </Link>
        </Button>
      }
    >
      <div className='space-y-3 text-sm'>
        <ul className='divide-y rounded-lg border'>
          {[...bySize.values()].map((s) => (
            <li
              key={s.name}
              className='flex items-center justify-between gap-3 px-3 py-1.5'
            >
              <span className='min-w-0 break-words'>{s.name}</span>
              <span className='shrink-0 tabular-nums'>
                <span className='font-semibold'>{fmtQty(s.quantity)}</span>{' '}
                <span className='text-muted-foreground text-xs'>
                  {getUnitLabel(s.unit)} · {fmtQty(s.bulk)} {unit}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <div className='grid grid-cols-2 gap-2 text-xs'>
          <div className='rounded-lg border px-2.5 py-1.5'>
            <div className='text-muted-foreground'>{t('Packed')}</div>
            <div className='text-sm font-semibold tabular-nums'>
              {fmtQty(packed)} {unit}
            </div>
          </div>
          <div className='rounded-lg border px-2.5 py-1.5'>
            <div className='text-muted-foreground'>{t('Extra / loose')}</div>
            <div className='text-sm font-semibold tabular-nums'>
              {fmtQty(loose)} {unit}
            </div>
          </div>
        </div>
        <p className='text-muted-foreground text-xs'>
          {vouchers
            .map(
              (v) =>
                `${v.voucherNumber} · ${formatAppDate(new Date(v.packingDate))}`
            )
            .join('  ·  ')}
        </p>
      </div>
    </Panel>
  )
}
