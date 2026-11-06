import { Link } from '@tanstack/react-router'
import { BarChart3, CopyPlus, Pencil, Trash2 } from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { toast } from 'sonner'
import {
  useDeleteProductionTargetMutation,
  useGetProductionTargetQuery,
  type ProductionTarget,
  type TargetLine,
} from '@/stores/manufacturing.api'
import { getErrorMessage } from '@/lib/get-error-message'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirm } from '../lib/confirm'
import {
  TARGET_MEASURE_LABELS,
  TARGET_PERIOD_LABELS,
  fmtDay,
  fmtQty,
} from '../lib/constants'
import { ChartPanel, MiniTable, TooltipCard } from './charts/chart-kit'
import { VIZ, axisTick, compact } from './charts/viz'
import { ProgressBar } from './badges'
import { DetailSheet } from './detail-sheet'
import { Field } from './page'
import { lineVerdict, progressTone, timingText } from '../lib/targets'
import { TargetStatusPill } from './target-parts'

const shortDay = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** Made so far, day by day, against the even pace that reaches the target on the last day. */
function PaceChart({ line, measure }: { line: TargetLine; measure: ProductionTarget['measure'] }) {
  const { t } = useLanguage()
  const daily = line.daily || []
  return (
    <ChartPanel
      title={t('Made vs plan')}
      description={
        measure === 'stock'
          ? t('Goods made in the period. This target counts stock on hand, shown above.')
          : t('Cumulative made against the even pace to the target')
      }
      legend={[
        { label: t('Made (cumulative)'), color: VIZ.production, kind: 'line' },
        { label: t('Plan'), color: VIZ.muted, kind: 'line' },
      ]}
      empty={!daily.length}
      emptyText={t('The period has not started yet.')}
      height={200}
      className='shadow-none'
      table={
        <MiniTable
          head={[t('Date'), t('Made'), t('Cumulative'), t('Plan')]}
          rows={daily.map((d) => [fmtDay(d.day), fmtQty(d.made), fmtQty(d.cumulative), fmtQty(d.plan)])}
        />
      }
    >
      <ResponsiveContainer width='100%' height='100%'>
        <LineChart data={daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} stroke={VIZ.grid} />
          <XAxis
            dataKey='day'
            tick={axisTick}
            tickLine={false}
            axisLine={{ stroke: VIZ.grid }}
            tickFormatter={shortDay}
            minTickGap={18}
          />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40} tickFormatter={compact} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as NonNullable<TargetLine['daily']>[number]
              return (
                <TooltipCard
                  title={fmtDay(d.day)}
                  rows={[
                    { label: t('made to date'), value: `${fmtQty(d.cumulative)} ${line.unit}`, color: VIZ.production },
                    { label: t('plan to date'), value: `${fmtQty(d.plan)} ${line.unit}`, color: VIZ.muted },
                  ]}
                  footer={`${t('made that day')}: ${fmtQty(d.made)} ${line.unit}`}
                />
              )
            }}
          />
          <Line
            isAnimationActive={false}
            type='linear'
            dataKey='plan'
            stroke={VIZ.muted}
            strokeWidth={1.5}
            strokeDasharray='4 4'
            dot={false}
          />
          <Line
            isAnimationActive={false}
            type='monotone'
            dataKey='cumulative'
            stroke={VIZ.production}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartPanel>
  )
}

function LineCard({ line, target }: { line: TargetLine; target: ProductionTarget }) {
  const { t } = useLanguage()
  const u = line.unit
  const isStock = target.measure === 'stock'
  const figures: [string, number | null, string?][] = [
    [t('Target'), line.target],
    [isStock ? t('In stock now') : t('Made'), line.achieved],
    [t('Remaining'), line.remaining],
    [isStock ? t('Made in period') : t('In stock now'), isStock ? line.made : line.stock],
  ]
  const details: [string, string][] = [
    ...(line.expected !== null && target.phase === 'running'
      ? ([
          [t('Should have made by yesterday'), `${fmtQty(line.expected)} ${u}`],
          [
            line.paceGap !== null && line.paceGap < 0 ? t('Behind pace') : t('Ahead of pace'),
            `${fmtQty(Math.abs(line.paceGap || 0))} ${u}`,
          ],
        ] as [string, string][])
      : []),
    ...(line.avgPerDay !== null ? ([[t('Average made / day'), `${fmtQty(line.avgPerDay)} ${u}`]] as [string, string][]) : []),
    ...(line.requiredPerDay !== null
      ? ([[t('Needed / day to finish'), `${fmtQty(line.requiredPerDay)} ${u}`]] as [string, string][])
      : []),
    ...(line.projected !== null && target.phase === 'running'
      ? ([[t('At this rate, by the end'), `${fmtQty(line.projected)} ${u}`]] as [string, string][])
      : []),
    [
      t('In open orders'),
      `${fmtQty(line.inOrders)} ${u}${line.openOrders ? ` (${line.openOrders} ${t(line.openOrders === 1 ? 'order' : 'orders')})` : ''}`,
    ],
    [t('Still to plan'), `${fmtQty(line.toPlan)} ${u}`],
  ]
  return (
    <section className='space-y-3 rounded-xl border p-4'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <h3 className='truncate font-semibold'>{line.productName}</h3>
          <p className='text-muted-foreground text-xs'>{lineVerdict(line, t)}</p>
        </div>
        <TargetStatusPill status={line.status} />
      </div>
      <div className='flex items-center gap-2'>
        <ProgressBar value={line.percent} tone={progressTone(line.status)} />
        <span className='shrink-0 text-sm font-semibold tabular-nums'>{line.percent}%</span>
      </div>
      <dl className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
        {figures.map(([label, value]) => (
          <div key={label} className='min-w-0'>
            <dt className='text-muted-foreground text-xs'>{label}</dt>
            <dd className='truncate text-lg font-semibold tabular-nums'>
              {fmtQty(value)} <span className='text-muted-foreground text-xs font-normal'>{u}</span>
            </dd>
          </div>
        ))}
      </dl>
      <dl className='grid grid-cols-1 gap-x-4 gap-y-1.5 border-t pt-3 text-sm sm:grid-cols-2'>
        {details.map(([label, value]) => (
          <div key={label} className='flex justify-between gap-3'>
            <dt className='text-muted-foreground'>{label}</dt>
            <dd className='font-medium tabular-nums'>{value}</dd>
          </div>
        ))}
      </dl>
      {line.notes && <p className='text-muted-foreground text-xs'>{line.notes}</p>}
      <PaceChart line={line} measure={target.measure} />
    </section>
  )
}

export function TargetDetailSheet({
  targetId,
  onClose,
  onEdit,
  onCopy,
}: {
  targetId: string
  onClose: () => void
  onEdit: (target: ProductionTarget) => void
  onCopy: (target: ProductionTarget) => void
}) {
  const { t } = useLanguage()
  const confirm = useConfirm()
  const { hasPermission } = usePermissions()
  const canManage = hasPermission('manageProductionTargets')
  const { data: target, isLoading, isError } = useGetProductionTargetQuery(targetId)
  const [remove, { isLoading: deleting }] = useDeleteProductionTargetMutation()

  const onDelete = async () => {
    if (!target) return
    const ok = await confirm({
      title: `${t('Delete target')} ${target.targetNumber}?`,
      description: t('The target and its progress view are removed. Production, stock and orders are not touched.'),
      confirmText: t('Delete'),
      destructive: true,
    })
    if (!ok) return
    // Close first: the delete refreshes every target query, and this sheet's own query
    // would otherwise refetch the target that no longer exists.
    onClose()
    try {
      await remove(target.id).unwrap()
      toast.success(t('Target deleted'))
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not delete the target')))
    }
  }

  return (
    <DetailSheet
      open
      onOpenChange={(open) => !open && onClose()}
      className='sm:max-w-2xl'
      title={target ? `${target.targetNumber} · ${target.title}` : t('Production target')}
      description={
        target
          ? `${fmtDay(target.startDay)} – ${fmtDay(target.endDay)} · ${timingText(target, t)}`
          : undefined
      }
      badges={
        target && (
          <>
            <TargetStatusPill status={target.status} />
            <span className='text-muted-foreground text-xs'>
              {t(TARGET_PERIOD_LABELS[target.periodType])} · {t(TARGET_MEASURE_LABELS[target.measure].label)} ·{' '}
              {target.progress}% {t('overall')}
            </span>
          </>
        )
      }
      footer={
        target && (
          <>
            <Button variant='outline' size='sm' asChild className='mr-auto'>
              <Link to={'/manufacturing/reports' as never} search={{ report: 'targets' } as never}>
                <BarChart3 className='h-4 w-4' />
                {t('Report')}
              </Link>
            </Button>
            {canManage && (
              <>
                <Button variant='ghost' size='sm' onClick={onDelete} disabled={deleting}>
                  <Trash2 className='h-4 w-4' />
                  {t('Delete')}
                </Button>
                <Button variant='outline' size='sm' onClick={() => onCopy(target)}>
                  <CopyPlus className='h-4 w-4' />
                  {t('Copy to next period')}
                </Button>
                <Button size='sm' onClick={() => onEdit(target)}>
                  <Pencil className='h-4 w-4' />
                  {t('Edit')}
                </Button>
              </>
            )}
          </>
        )
      }
    >
      {isLoading ? (
        <div className='space-y-3'>
          <Skeleton className='h-20 w-full' />
          <Skeleton className='h-64 w-full' />
        </div>
      ) : isError || !target ? (
        <p className='text-muted-foreground text-sm'>{t('This target could not be loaded — it may have been deleted.')}</p>
      ) : (
        <>
          <dl className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
            <Field label={t('Products')}>{target.counts.lines}</Field>
            <Field label={t('Achieved')}>{target.counts.achieved}</Field>
            <Field label={t('Behind')}>{target.counts.atRisk + target.counts.missed}</Field>
            <Field label={t('Alert below pace')}>{target.alertAtPercent}%</Field>
            {target.createdByName && <Field label={t('Set by')}>{target.createdByName}</Field>}
          </dl>
          {target.notes && <p className='text-muted-foreground text-sm whitespace-pre-line'>{target.notes}</p>}
          {target.lines.map((line) => (
            <LineCard key={line.id} line={line} target={target} />
          ))}
        </>
      )}
    </DetailSheet>
  )
}
