import { Boxes, ShoppingBag } from 'lucide-react'
import { useGetRepairPartsUsageQuery } from '@/stores/mobile-shop.api'
import { formatBusinessDate } from '@/lib/business-timezone'
import { formatMoneyWithMeta, useCurrencyMeta } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { statusMeta } from '../lib/repair-meta'

/** Parts fitted across jobs — and, below it, the old hand-typed parts ledger if the shop used it. */
export function PartsUsageCard({
  onOpenJob,
}: {
  onOpenJob: (id: string) => void
}) {
  const currencyMeta = useCurrencyMeta()
  const fmt = (n?: number) => formatMoneyWithMeta(n ?? 0, currencyMeta)
  const { data: rows = [], isLoading } = useGetRepairPartsUsageQuery({
    limit: 25,
  })

  return (
    <Card className='min-w-0 gap-0 overflow-hidden py-0'>
      <div className='bg-primary text-primary-foreground flex items-center gap-2 px-4 py-3'>
        <Boxes className='h-4 w-4' aria-hidden />
        <h2 className='text-base font-semibold'>Recent parts used</h2>
      </div>
      <div className='p-4'>
        {rows.length === 0 ? (
          <div className='text-muted-foreground flex flex-col items-center gap-1 py-8 text-center text-sm'>
            <Boxes className='h-8 w-8 opacity-40' aria-hidden />
            <p className='text-foreground font-medium'>
              {isLoading ? 'Loading…' : 'No parts used yet'}
            </p>
            <p>
              Parts you add to a job come off your inventory and show up here.
            </p>
            <p className='text-xs'>
              Buy repair parts through Purchases like any other stock.
            </p>
          </div>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead className='bg-muted/50 text-muted-foreground text-xs'>
                <tr>
                  <th className='px-3 py-2 text-left font-medium'>Date</th>
                  <th className='px-3 py-2 text-left font-medium'>Part</th>
                  <th className='px-3 py-2 text-left font-medium'>Job</th>
                  <th className='px-3 py-2 text-right font-medium'>Qty</th>
                  <th className='px-3 py-2 text-right font-medium'>Cost</th>
                  <th className='px-3 py-2 text-right font-medium'>Charged</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={`${r.jobId}-${i}`}
                    className='hover:bg-muted/40 cursor-pointer border-t'
                    onClick={() => onOpenJob(r.jobId)}
                  >
                    <td className='text-muted-foreground px-3 py-2 text-xs whitespace-nowrap'>
                      {formatBusinessDate(r.addedAt)}
                    </td>
                    <td className='px-3 py-2'>
                      <div className='flex items-center gap-1.5'>
                        {r.fromStock ? (
                          <Boxes
                            className='h-3.5 w-3.5 text-sky-600'
                            aria-label='From stock'
                          />
                        ) : (
                          <ShoppingBag
                            className='h-3.5 w-3.5 text-amber-600'
                            aria-label='Bought outside'
                          />
                        )}
                        <span className='font-medium'>{r.name}</span>
                      </div>
                    </td>
                    <td className='px-3 py-2 whitespace-nowrap'>
                      <span className='font-mono text-xs'>
                        {r.jobNumber ?? '—'}
                      </span>{' '}
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                          statusMeta(r.status).pill
                        )}
                      >
                        {statusMeta(r.status).short}
                      </span>
                      <div className='text-muted-foreground max-w-40 truncate text-xs'>
                        {r.customerName} · {r.deviceModel}
                      </div>
                    </td>
                    <td className='px-3 py-2 text-right tabular-nums'>
                      {r.quantity}
                    </td>
                    <td className='px-3 py-2 text-right tabular-nums'>
                      {fmt(r.quantity * r.unitCost)}
                    </td>
                    <td className='px-3 py-2 text-right tabular-nums'>
                      {fmt(r.quantity * r.unitPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  )
}
