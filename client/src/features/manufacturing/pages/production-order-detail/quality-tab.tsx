import {
  ClipboardCheck,
  MoreHorizontal,
  RotateCcw,
  Undo2,
  Wrench,
} from 'lucide-react'
import {
  useGetOutputsQuery,
  type ProductionOrder,
  type ProductionOutput,
} from '@/stores/manufacturing.api'
import { useFormatMoney } from '@/features/manufacturing/lib/use-mfg-money'
import { useCanViewManufacturingCosts } from '@/lib/cost-visibility'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Panel, Stat, StatGrid } from '../../components/page'
import {
  OUTPUT_REVERSAL_REASON_LABELS,
  fmtDate,
  fmtQty,
  refName,
} from '../../lib/constants'
import { EPS } from './detail-utils'
import { Qty } from './shared'

/** An output that had been inspected (still, or before it was reversed). */
const wasInspected = (o: ProductionOutput) =>
  o.status === 'inspected' ||
  (o.status === 'reversed' && o.reversal?.previousStatus === 'inspected')

/** Output reported off the line, its inspections, and the rework queue. */
export function QualityTab({
  order,
  qualityChecks,
  canInspect,
  onInspect,
  onRework,
  canReverse = false,
  onReverse,
}: {
  order: ProductionOrder
  qualityChecks: boolean
  canInspect: boolean
  onInspect: (o: ProductionOutput) => void
  onRework: () => void
  /** Receipts posted by mistake can be reversed (and re-entered). */
  canReverse?: boolean
  onReverse?: (o: ProductionOutput, intent: 'correct' | 'reverse') => void
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const canSeeCosts = useCanViewManufacturingCosts()
  const { data } = useGetOutputsQuery({
    productionOrderId: order.id,
    limit: 100,
  })
  const outputs = data?.results || []
  const inspected = outputs.filter((o) => o.status === 'inspected')
  const firstGood = inspected.reduce((s, o) => s + (o.goodQuantity || 0), 0)
  const firstAll = inspected.reduce(
    (s, o) => s + (o.goodQuantity || 0) + (o.rejectedQuantity || 0),
    0
  )
  const fpy =
    firstAll > EPS ? Math.round((firstGood / firstAll) * 1000) / 10 : null
  const pending = outputs.filter((o) => o.status === 'pending_qc')

  return (
    <div className='space-y-4'>
      {!qualityChecks && (
        <p className='text-muted-foreground rounded-lg border border-dashed px-4 py-3 text-sm'>
          {t(
            'Quality checks are turned off in Manufacturing settings — reported output goes straight to finished stock.'
          )}
        </p>
      )}
      <StatGrid className='md:grid-cols-3 xl:grid-cols-6'>
        <Stat
          label={t('Produced')}
          value={<Qty value={order.producedQuantity} unit={order.unit} />}
        />
        <Stat
          label={t('Inspected')}
          value={<Qty value={firstAll} unit={order.unit} />}
          hint={`${inspected.length} ${t('output(s)')}`}
        />
        <Stat
          label={t('First-pass yield')}
          value={fpy == null ? '—' : `${fpy}%`}
          tone={fpy != null && fpy < 95 ? 'warning' : 'success'}
          active={fpy != null}
          hint={t('good at first inspection')}
        />
        <Stat
          label={t('Rejected')}
          value={<Qty value={order.rejectedQuantity} unit={order.unit} />}
          tone='danger'
          active={order.rejectedQuantity > EPS}
        />
        <Stat
          label={t('Awaiting QC')}
          value={<Qty value={order.qcPendingQuantity} unit={order.unit} />}
          tone='warning'
          active={order.qcPendingQuantity > EPS}
        />
        <Stat
          label={t('In rework')}
          value={<Qty value={order.reworkPendingQuantity} unit={order.unit} />}
          hint={
            order.reworkedGoodQuantity > EPS
              ? `${fmtQty(order.reworkedGoodQuantity)} ${t('passed after rework')}`
              : undefined
          }
          tone='warning'
          active={order.reworkPendingQuantity > EPS}
        />
      </StatGrid>

      {(pending.length > 0 || order.reworkPendingQuantity > EPS) && (
        <div className='grid gap-3 md:grid-cols-2'>
          {pending.length > 0 && (
            <Panel
              className='border-sky-500/40'
              title={
                <span className='flex items-center gap-2'>
                  <ClipboardCheck className='h-4 w-4 text-sky-600' />
                  {t('Waiting for quality inspection')}
                </span>
              }
              contentClassName='space-y-2'
            >
              {pending.map((o) => (
                <div
                  key={o.id}
                  className='flex items-center gap-3 rounded-lg border px-3 py-2 text-sm'
                >
                  <span className='font-mono text-xs'>{o.outputNumber}</span>
                  <span className='tabular-nums'>
                    {fmtQty(o.producedQuantity)} {o.unit}
                  </span>
                  <span className='text-muted-foreground text-xs'>
                    {fmtDate(o.reportedAt)}
                  </span>
                  {canInspect && (
                    <Button
                      size='sm'
                      className='ml-auto h-7'
                      onClick={() => onInspect(o)}
                    >
                      {t('Inspect')}
                    </Button>
                  )}
                </div>
              ))}
            </Panel>
          )}
          {order.reworkPendingQuantity > EPS && (
            <Panel
              className='border-violet-500/40'
              title={
                <span className='flex items-center gap-2'>
                  <Wrench className='h-4 w-4 text-violet-600' />
                  {t('In rework')}
                </span>
              }
              contentClassName='flex items-center gap-3 text-sm'
            >
              <span className='text-2xl font-semibold tabular-nums'>
                {fmtQty(order.reworkPendingQuantity)}
              </span>
              <span className='text-muted-foreground'>{order.unit}</span>
              {canInspect && (
                <Button
                  size='sm'
                  className='ml-auto'
                  variant='outline'
                  onClick={onRework}
                >
                  {t('Post rework result')}
                </Button>
              )}
            </Panel>
          )}
        </div>
      )}

      <Panel flush title={t('Output & inspections')}>
        {data && !outputs.length ? (
          <p className='text-muted-foreground p-8 text-center text-sm'>
            {t('No output reported yet.')}
          </p>
        ) : (
          <div className='overflow-x-auto'>
            <Table>
              <TableHeader>
                <TableRow className='bg-muted/40'>
                  <TableHead>{t('Output')}</TableHead>
                  <TableHead className='text-right'>{t('Produced')}</TableHead>
                  <TableHead className='text-right'>{t('Good')}</TableHead>
                  <TableHead className='text-right'>{t('Rejected')}</TableHead>
                  {canSeeCosts && (
                    <TableHead className='text-right max-md:hidden'>
                      {t('Unit cost')}
                    </TableHead>
                  )}
                  <TableHead>{t('QC')}</TableHead>
                  {canReverse && <TableHead className='w-10' />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {outputs.map((o) => (
                  <TableRow
                    key={o.id}
                    className={cn(
                      o.status === 'reversed' &&
                        'text-muted-foreground [&_.num]:line-through'
                    )}
                  >
                    <TableCell>
                      <div className='flex items-center gap-1.5 font-mono text-xs font-medium'>
                        {o.outputNumber}
                        {o.status === 'reversed' && (
                          <Badge
                            variant='outline'
                            className='h-4 border-rose-500/30 bg-rose-500/10 px-1 font-sans text-[10px] text-rose-700 dark:text-rose-300'
                          >
                            {t('Reversed')}
                          </Badge>
                        )}
                      </div>
                      <div className='text-muted-foreground text-xs'>
                        {fmtDate(o.reportedAt)} · {refName(o.reportedBy) || '—'}
                      </div>
                    </TableCell>
                    <TableCell className='num text-right tabular-nums'>
                      {fmtQty(o.producedQuantity)}
                    </TableCell>
                    <TableCell className='num text-right text-emerald-700 tabular-nums dark:text-emerald-400'>
                      {wasInspected(o) ? fmtQty(o.goodQuantity) : '—'}
                    </TableCell>
                    <TableCell className='num text-right tabular-nums'>
                      {wasInspected(o) ? (
                        <span
                          className={cn(
                            o.rejectedQuantity > 0 &&
                              'text-rose-700 dark:text-rose-400'
                          )}
                        >
                          {fmtQty(o.rejectedQuantity)}
                          {o.rejectDisposition && (
                            <span className='text-muted-foreground ml-1 text-[10px]'>
                              →{' '}
                              {t(
                                o.rejectDisposition === 'scrap'
                                  ? 'scrap'
                                  : 'rework'
                              )}
                            </span>
                          )}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    {canSeeCosts && (
                      <TableCell className='num text-right tabular-nums max-md:hidden'>
                        {formatMoney(o.unitCost)}
                      </TableCell>
                    )}
                    <TableCell>
                      {o.status === 'reversed' ? (
                        <span className='text-xs text-rose-700 dark:text-rose-400'>
                          {t('Reversed')} {fmtDate(o.reversal?.at)} ·{' '}
                          {t(
                            OUTPUT_REVERSAL_REASON_LABELS[
                              o.reversal?.reason || 'other'
                            ]
                          )}
                          {o.reversal?.notes ? ` — ${o.reversal.notes}` : ''}
                        </span>
                      ) : o.status === 'pending_qc' ? (
                        canInspect ? (
                          <Button
                            size='sm'
                            className='h-7'
                            onClick={() => onInspect(o)}
                          >
                            {t('Inspect')}
                          </Button>
                        ) : (
                          <Badge
                            variant='outline'
                            className='border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300'
                          >
                            {t('Pending')}
                          </Badge>
                        )
                      ) : (
                        <span className='text-muted-foreground text-xs'>
                          {t('Inspected')} {fmtDate(o.inspectedAt)} ·{' '}
                          {refName(o.inspectedBy) || '—'}
                        </span>
                      )}
                    </TableCell>
                    {canReverse && (
                      <TableCell className='text-right'>
                        {o.status !== 'reversed' && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant='ghost'
                                size='icon'
                                className='h-7 w-7'
                                aria-label={`${t('Actions')} ${o.outputNumber}`}
                              >
                                <MoreHorizontal className='h-4 w-4' />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align='end'>
                              <DropdownMenuItem
                                onClick={() => onReverse?.(o, 'correct')}
                              >
                                <RotateCcw className='mr-2 h-4 w-4' />
                                {t('Correct this receipt')}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className='text-destructive'
                                onClick={() => onReverse?.(o, 'reverse')}
                              >
                                <Undo2 className='mr-2 h-4 w-4' />
                                {t('Reverse receipt')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    )}
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
