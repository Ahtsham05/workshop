import {
  useGetOrderCostsQuery,
  type ProductionOrder,
} from '@/stores/manufacturing.api'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Panel, Stat, StatGrid } from '../../components/page'
import { fmtQty } from '../../lib/constants'
import { fmtMinutes } from './detail-utils'
import { EmptyLine } from './shared'

/** Over plan is bad news (red), under plan good (green); tiny differences stay neutral. */
function VarianceText({
  value,
  base,
  format,
}: {
  value: number
  base: number
  format: (n: number) => string
}) {
  const significant = Math.abs(value) >= Math.max(0.005 * Math.abs(base), 0.01)
  return (
    <span
      className={cn(
        'tabular-nums',
        !significant
          ? 'text-muted-foreground'
          : value > 0
            ? 'text-rose-700 dark:text-rose-400'
            : 'text-emerald-700 dark:text-emerald-400'
      )}
    >
      {significant ? `${value > 0 ? '+' : '−'}${format(Math.abs(value))}` : '—'}
    </span>
  )
}

export function CostsTab({ order }: { order: ProductionOrder }) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { data, isLoading } = useGetOrderCostsQuery(order.id)

  if (isLoading) return <Skeleton className='h-80 w-full rounded-xl' />
  if (!data) return <EmptyLine text={t('Costs are not available right now.')} />

  const variance = data.variance
  const variancePct =
    data.total.planned > 0
      ? Math.round((variance / data.total.planned) * 1000) / 10
      : null
  const estimatedSteps = data.operations.filter((o) => o.estimated).length
  const where: [string, number][] = [
    [t('Finished goods received'), data.breakdown.finishedGoods],
    [t('In QC'), data.breakdown.inQc],
    [t('In rework'), data.breakdown.inRework],
    [t('In WIP'), data.breakdown.inWip],
    [t('Scrapped'), data.breakdown.scrapped],
    [t('Returned to stock'), data.breakdown.returned],
  ]
  const whereMax = Math.max(...where.map(([, v]) => v), 0)

  return (
    <div className='space-y-4'>
      <StatGrid className='md:grid-cols-4'>
        <Stat
          label={t('Planned cost')}
          value={formatMoney(data.total.planned)}
          hint={`${formatMoney(data.unitCost.planned)} / ${order.unit}`}
        />
        <Stat
          label={t('Actual to date')}
          value={formatMoney(data.total.actual)}
          hint={t('material issued + time worked')}
        />
        <Stat
          label={t('Forecast at completion')}
          value={formatMoney(data.total.forecast)}
          hint={`${formatMoney(data.unitCost.forecast)} / ${order.unit}`}
        />
        <Stat
          label={t('Variance')}
          value={
            <VarianceText
              value={variance}
              base={data.total.planned}
              format={formatMoney}
            />
          }
          hint={
            variancePct != null && Math.abs(variancePct) >= 0.5
              ? `${variancePct > 0 ? '+' : ''}${variancePct}% ${t('vs plan')}`
              : t('on plan')
          }
        />
      </StatGrid>

      <div className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]'>
        <Panel flush title={t('Cost summary')}>
          <div className='overflow-x-auto'>
            <Table>
              <TableHeader>
                <TableRow className='bg-muted/40'>
                  <TableHead />
                  <TableHead className='text-right'>{t('Planned')}</TableHead>
                  <TableHead className='text-right'>{t('Actual')}</TableHead>
                  <TableHead className='text-right'>{t('Forecast')}</TableHead>
                  <TableHead className='text-right'>{t('Variance')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(
                  [
                    [t('Material'), data.material],
                    [t('Conversion (labour & machine)'), data.conversion],
                  ] as const
                ).map(([label, row]) => (
                  <TableRow key={label}>
                    <TableCell className='font-medium'>{label}</TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {formatMoney(row.planned)}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {formatMoney(row.actual)}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {formatMoney(row.forecast)}
                    </TableCell>
                    <TableCell className='text-right'>
                      <VarianceText
                        value={row.forecast - row.planned}
                        base={row.planned}
                        format={formatMoney}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className='font-semibold'>{t('Total')}</TableCell>
                  <TableCell className='text-right font-semibold tabular-nums'>
                    {formatMoney(data.total.planned)}
                  </TableCell>
                  <TableCell className='text-right font-semibold tabular-nums'>
                    {formatMoney(data.total.actual)}
                  </TableCell>
                  <TableCell className='text-right font-semibold tabular-nums'>
                    {formatMoney(data.total.forecast)}
                  </TableCell>
                  <TableCell className='text-right font-semibold'>
                    <VarianceText
                      value={variance}
                      base={data.total.planned}
                      format={formatMoney}
                    />
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
          <div className='text-muted-foreground space-y-1 border-t px-5 py-3 text-xs max-sm:px-4'>
            <p>
              {data.unitCost.actualFinished != null
                ? `${t('Good units were received into stock at')} ${formatMoney(data.unitCost.actualFinished)} / ${order.unit} (${t('material cost')}).`
                : t('No good units received into stock yet.')}
            </p>
            <p>
              {t(
                'Planned material uses today’s standard cost of each component. Conversion cost comes from each routing step’s rate and is for analysis only — stock is valued at material cost.'
              )}
            </p>
          </div>
        </Panel>

        <Panel
          title={t('Where the material value is')}
          contentClassName='space-y-3'
        >
          {where.map(([label, value]) => (
            <div key={label}>
              <div className='flex justify-between gap-2 text-sm'>
                <span className={cn(value <= 0 && 'text-muted-foreground')}>
                  {label}
                </span>
                <span className='tabular-nums'>{formatMoney(value)}</span>
              </div>
              <div className='bg-muted mt-1 h-1.5 overflow-hidden rounded-full'>
                <div
                  className='bg-primary/70 h-full rounded-full'
                  style={{
                    width: `${whereMax > 0 ? (value / whereMax) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </Panel>
      </div>

      <Panel flush title={t('Material cost by line')}>
        {data.materials.length === 0 ? (
          <p className='text-muted-foreground p-6 text-center text-sm'>
            {t('This order has no BOM materials.')}
          </p>
        ) : (
          <div className='overflow-x-auto'>
            <Table>
              <TableHeader>
                <TableRow className='bg-muted/40'>
                  <TableHead>{t('Material')}</TableHead>
                  <TableHead className='text-right max-md:hidden'>
                    {t('Std unit cost')}
                  </TableHead>
                  <TableHead className='text-right'>{t('Planned')}</TableHead>
                  <TableHead className='text-right'>{t('Actual')}</TableHead>
                  <TableHead className='text-right max-sm:hidden'>
                    {t('Forecast')}
                  </TableHead>
                  <TableHead className='text-right'>{t('Variance')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.materials.map((m) => (
                  <TableRow key={m.materialLineId}>
                    <TableCell>
                      <div className='font-medium'>{m.productName}</div>
                      <div className='text-muted-foreground text-xs tabular-nums'>
                        {fmtQty(m.issuedQuantity)} /{' '}
                        {fmtQty(m.requiredQuantity)} {m.unit} {t('issued')}
                        {m.isOptional ? ` · ${t('Optional')}` : ''}
                        {m.actualUnitCost != null &&
                          ` · ${formatMoney(m.actualUnitCost)} / ${m.unit}`}
                      </div>
                    </TableCell>
                    <TableCell className='text-muted-foreground text-right tabular-nums max-md:hidden'>
                      {formatMoney(m.standardUnitCost)}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {formatMoney(m.plannedCost)}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {formatMoney(m.actualCost)}
                    </TableCell>
                    <TableCell className='text-right tabular-nums max-sm:hidden'>
                      {formatMoney(m.forecastCost)}
                    </TableCell>
                    <TableCell className='text-right'>
                      <VarianceText
                        value={m.variance}
                        base={m.plannedCost}
                        format={formatMoney}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      <Panel
        flush
        title={t('Conversion cost by step')}
        description={
          estimatedSteps
            ? t(
                '“est.” — a running step counts its elapsed time up to the plan; a finished step with no time recorded counts at plan.'
              )
            : undefined
        }
      >
        {data.operations.length === 0 ? (
          <p className='text-muted-foreground p-6 text-center text-sm'>
            {t('No routing on this order — add steps on the Operations tab.')}
          </p>
        ) : (
          <div className='overflow-x-auto'>
            <Table>
              <TableHeader>
                <TableRow className='bg-muted/40'>
                  <TableHead>{t('Step')}</TableHead>
                  <TableHead className='text-right max-md:hidden'>
                    {t('Rate / hour')}
                  </TableHead>
                  <TableHead className='text-right'>{t('Planned')}</TableHead>
                  <TableHead className='text-right'>{t('Actual')}</TableHead>
                  <TableHead className='text-right max-sm:hidden'>
                    {t('Forecast')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.operations.map((o) => (
                  <TableRow key={o.operationId}>
                    <TableCell>
                      <div
                        className={cn(
                          'font-medium',
                          o.status === 'skipped' &&
                            'text-muted-foreground line-through'
                        )}
                      >
                        {o.name}
                      </div>
                      <div className='text-muted-foreground text-xs'>
                        {o.workCenter || '—'}
                      </div>
                    </TableCell>
                    <TableCell className='text-muted-foreground text-right tabular-nums max-md:hidden'>
                      {formatMoney(o.costPerHour)}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {formatMoney(o.plannedCost)}
                      <div className='text-muted-foreground text-[11px]'>
                        {fmtMinutes(o.plannedMinutes)}
                      </div>
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {o.actualMinutes == null ? (
                        <span className='text-muted-foreground'>—</span>
                      ) : (
                        <>
                          {formatMoney(o.actualCost)}
                          <div className='text-muted-foreground text-[11px]'>
                            {fmtMinutes(o.actualMinutes)}
                            {o.estimated && ` · ${t('est.')}`}
                          </div>
                        </>
                      )}
                    </TableCell>
                    <TableCell className='text-right tabular-nums max-sm:hidden'>
                      {formatMoney(o.forecastCost)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>
    </div>
  )
}
