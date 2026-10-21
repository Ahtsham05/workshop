import { Recycle } from 'lucide-react'
import {
  useGetScrapRecordsQuery,
  type ProductionOrder,
  type ScrapReason,
  type ScrapStage,
} from '@/stores/manufacturing.api'
import { useFormatMoney } from '@/features/manufacturing/lib/use-mfg-money'
import { useCanViewManufacturingCosts } from '@/lib/cost-visibility'
import { useLanguage } from '@/context/language-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Panel, Stat, StatGrid } from '../../components/page'
import {
  SCRAP_REASON_LABELS,
  SCRAP_STAGE_LABELS,
  fmtDate,
  fmtQty,
} from '../../lib/constants'

export function ScrapTab({
  order,
  canRecord,
  onRecord,
}: {
  order: ProductionOrder
  canRecord: boolean
  onRecord: () => void
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const canSeeCosts = useCanViewManufacturingCosts()
  const { data } = useGetScrapRecordsQuery({
    productionOrderId: order.id,
    limit: 100,
  })
  const rows = data?.results || []
  const total = rows.reduce((s, r) => s + (r.totalCost || 0), 0)
  const sumBy = <K extends string>(key: (r: (typeof rows)[number]) => K) => {
    const m = new Map<K, number>()
    rows.forEach((r) =>
      m.set(key(r), (m.get(key(r)) || 0) + (r.totalCost || 0))
    )
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }
  const byStage = sumBy<ScrapStage>((r) => r.stage)
  const byReason = sumBy<ScrapReason>((r) => r.reason)
  // Scrapped value came out of material already issued to the order (net of returns).
  const rate =
    order.materialCost > 0
      ? Math.round((total / order.materialCost) * 1000) / 10
      : 0

  return (
    <div className='space-y-4'>
      <StatGrid className='md:grid-cols-4'>
        {canSeeCosts && (
          <Stat
            label={t('Scrap value')}
            value={formatMoney(total)}
            tone='danger'
            active={total > 0}
          />
        )}
        <Stat label={t('Scrap records')} value={rows.length} />
        {/* The rate is value-based (scrap value ÷ material value issued). */}
        {canSeeCosts && (
          <Stat
            label={t('Scrap rate')}
            value={`${rate}%`}
            hint={t('of material value issued')}
            tone='warning'
            active={rate >= 5}
          />
        )}
        <Stat
          label={t('Units rejected at QC')}
          value={`${fmtQty(order.rejectedQuantity)} ${order.unit}`}
        />
      </StatGrid>

      {canSeeCosts && rows.length > 0 && (
        <div className='grid gap-4 md:grid-cols-2'>
          <Breakdown
            title={t('By stage')}
            rows={byStage.map(([k, v]) => [t(SCRAP_STAGE_LABELS[k]), v])}
            total={total}
            format={formatMoney}
          />
          <Breakdown
            title={t('By reason')}
            rows={byReason.map(([k, v]) => [t(SCRAP_REASON_LABELS[k]), v])}
            total={total}
            format={formatMoney}
          />
        </div>
      )}

      <Panel
        flush
        title={t('Scrap records')}
        action={
          canRecord ? (
            <Button size='sm' variant='outline' onClick={onRecord}>
              <Recycle className='mr-1.5 h-3.5 w-3.5' />
              {t('Record scrap')}
            </Button>
          ) : undefined
        }
      >
        {data && !rows.length ? (
          <p className='text-muted-foreground p-8 text-center text-sm'>
            {t('No scrap recorded.')}
          </p>
        ) : (
          <ul className='divide-y'>
            {rows.map((s) => (
              <li
                key={s.id}
                className='flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm max-sm:px-4'
              >
                <span className='font-mono text-xs'>{s.scrapNumber}</span>
                <span className='min-w-0 flex-1 truncate font-medium'>
                  {s.productName}
                </span>
                <Badge variant='outline' className='text-[10px] font-normal'>
                  {t(SCRAP_STAGE_LABELS[s.stage])}
                </Badge>
                <span className='text-muted-foreground text-xs'>
                  {t(SCRAP_REASON_LABELS[s.reason])} · {fmtDate(s.scrapDate)}
                </span>
                <span className='tabular-nums'>
                  {fmtQty(s.quantity)} {s.unit}
                </span>
                {canSeeCosts && (
                  <span className='w-24 text-right font-medium tabular-nums'>
                    {formatMoney(s.totalCost)}
                  </span>
                )}
                {s.notes && (
                  <p className='text-muted-foreground w-full text-xs'>
                    {s.notes}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

function Breakdown({
  title,
  rows,
  total,
  format,
}: {
  title: string
  rows: [string, number][]
  total: number
  format: (n: number) => string
}) {
  return (
    <Panel title={title} contentClassName='space-y-3'>
      {rows.map(([label, value]) => (
        <div key={label}>
          <div className='flex justify-between gap-2 text-sm'>
            <span className='truncate'>{label}</span>
            <span className='shrink-0 tabular-nums'>{format(value)}</span>
          </div>
          <div className='bg-muted mt-1 h-1.5 overflow-hidden rounded-full'>
            <div
              className='h-full rounded-full bg-rose-500/70'
              style={{ width: `${total > 0 ? (value / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      ))}
    </Panel>
  )
}
