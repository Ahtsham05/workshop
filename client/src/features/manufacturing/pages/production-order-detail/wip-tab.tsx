import { Undo2 } from 'lucide-react'
import type { ProductionOrder } from '@/stores/manufacturing.api'
import { useFormatMoney } from '@/features/manufacturing/lib/use-mfg-money'
import { useCanViewManufacturingCosts } from '@/lib/cost-visibility'
import { useLanguage } from '@/context/language-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { MovementsTable } from '../../components/movements-table'
import { Panel, Stat, StatGrid } from '../../components/page'
import { fmtDate, fmtQty } from '../../lib/constants'
import { EPS } from './detail-utils'

/** Material on the floor for this order — the lots, their value, and the stock ledger. */
export function WipTab({
  order,
  canReturn,
  onReturn,
}: {
  order: ProductionOrder
  canReturn: boolean
  onReturn: () => void
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const canSeeCosts = useCanViewManufacturingCosts()
  const lots = order.wipLots.filter((l) => l.quantity > EPS)
  const value = lots.reduce((s, l) => s + l.quantity * (l.unitCost || 0), 0)
  const oldest = lots.reduce<string | null>(
    (min, l) => (!min || (l.issuedAt && l.issuedAt < min) ? l.issuedAt : min),
    null
  )

  return (
    <div className='space-y-4'>
      <StatGrid className='md:grid-cols-4'>
        {canSeeCosts && <Stat label={t('WIP value')} value={formatMoney(value)} />}
        <Stat label={t('Lots on the floor')} value={lots.length} />
        <Stat
          label={t('Location')}
          value={order.wipLocation || t('Production floor')}
        />
        <Stat label={t('Oldest lot')} value={oldest ? fmtDate(oldest) : '—'} />
      </StatGrid>

      <Panel
        flush
        title={t('Work in progress')}
        description={t(
          'Issued material not yet built into output, returned or scrapped — consumed first in, first out.'
        )}
        action={
          canReturn ? (
            <Button size='sm' variant='outline' onClick={onReturn}>
              <Undo2 className='mr-1.5 h-3.5 w-3.5' />
              {t('Return unused material')}
            </Button>
          ) : undefined
        }
      >
        {!lots.length ? (
          <p className='text-muted-foreground p-8 text-center text-sm'>
            {t('Nothing is in WIP for this order.')}
          </p>
        ) : (
          <div className='overflow-x-auto'>
            <Table>
              <TableHeader>
                <TableRow className='bg-muted/40'>
                  <TableHead>{t('Item')}</TableHead>
                  <TableHead className='max-md:hidden'>
                    {t('Batch / serials')}
                  </TableHead>
                  <TableHead className='text-right'>{t('Quantity')}</TableHead>
                  {canSeeCosts && (
                    <TableHead className='text-right max-sm:hidden'>
                      {t('Value')}
                    </TableHead>
                  )}
                  <TableHead className='max-lg:hidden'>{t('Issued')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lots.map((l) => (
                  <TableRow key={l._id}>
                    <TableCell>
                      <div className='font-medium'>{l.productName}</div>
                      {l.isAlternative && (
                        <div className='text-muted-foreground text-[11px]'>
                          {t('alternative')} ×{l.ratio}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className='text-xs max-md:hidden'>
                      {l.batchNumber && (
                        <Badge
                          variant='outline'
                          className='font-mono text-[10px]'
                        >
                          {l.batchNumber}
                        </Badge>
                      )}
                      {l.serialNumbers?.length ? (
                        <span
                          className='text-muted-foreground font-mono'
                          title={l.serialNumbers.join(', ')}
                        >
                          {l.serialNumbers.slice(0, 3).join(', ')}
                          {l.serialNumbers.length > 3
                            ? ` +${l.serialNumbers.length - 3}`
                            : ''}
                        </span>
                      ) : !l.batchNumber ? (
                        <span className='text-muted-foreground'>—</span>
                      ) : null}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {fmtQty(l.quantity)}{' '}
                      <span className='text-muted-foreground text-xs'>
                        {l.unit}
                      </span>
                    </TableCell>
                    {canSeeCosts && (
                      <TableCell className='text-right tabular-nums max-sm:hidden'>
                        {formatMoney(l.quantity * (l.unitCost || 0))}
                      </TableCell>
                    )}
                    <TableCell className='text-muted-foreground text-xs max-lg:hidden'>
                      {fmtDate(l.issuedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      <section className='space-y-2'>
        <h3 className='text-sm font-semibold'>{t('Stock ledger')}</h3>
        <MovementsTable productionOrderId={order.id} />
      </section>
    </div>
  )
}
