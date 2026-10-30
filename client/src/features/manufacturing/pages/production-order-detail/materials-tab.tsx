import { Link } from '@tanstack/react-router'
import { PackageMinus, PackagePlus, Undo2 } from 'lucide-react'
import {
  useGetMaterialIssuesQuery,
  type OrderRequirements,
  type ProductionMaterial,
  type ProductionOrder,
  type RequirementLine,
} from '@/stores/manufacturing.api'
import { useCanViewManufacturingCosts } from '@/lib/cost-visibility'
import { formatTotalsByUnit } from '@/lib/units'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useFormatMoney } from '@/features/manufacturing/lib/use-mfg-money'
import {
  IssueStatusBadge,
  MaterialProgress,
  ProgressLegend,
} from '../../components/material-progress'
import { Panel, Stat, StatGrid } from '../../components/page'
import { fmtDate, fmtQty, orderPath } from '../../lib/constants'
import { lineIssuedNet, lineRemaining } from '../../lib/material-math'
import { EPS } from './detail-utils'
import { EmptyLine } from './shared'

export function MaterialsTab({
  order,
  requirements,
  canIssue,
}: {
  order: ProductionOrder
  requirements?: OrderRequirements
  canIssue: boolean
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const canSeeCosts = useCanViewManufacturingCosts()
  const byLine = new Map(
    (requirements?.lines || []).map((l) => [l.materialLineId, l])
  )
  const required = order.materials.filter((m) => !m.isOptional)
  const fullyIssued = required.filter((m) => lineRemaining(m) <= EPS).length
  const shortLines = (requirements?.lines || []).filter(
    (l) => (l.netShortageQuantity ?? 0) > EPS
  ).length
  const reserving = requirements?.reserving ?? false

  if (order.materials.length === 0) {
    return <EmptyLine text={t('This order has no BOM materials.')} />
  }

  // per unit (kg with kg) — the lines are the exploded leaves, so nothing is counted twice
  const total = (pick: (m: ProductionMaterial) => number) =>
    formatTotalsByUnit(
      order.materials.map((m) => ({ quantity: pick(m), unit: m.unit }))
    )
  const totals = {
    required: total((m) => m.requiredQuantity),
    issued: total(lineIssuedNet),
    consumed: total((m) => m.consumedQuantity),
    remaining: total(lineRemaining),
  }

  return (
    <div className='space-y-4'>
      <StatGrid className='md:grid-cols-4'>
        <Stat label={t('Material lines')} value={order.materials.length} />
        <Stat
          label={t('Fully issued')}
          value={`${fullyIssued} / ${required.length}`}
          tone='success'
          active={required.length > 0 && fullyIssued === required.length}
        />
        <Stat
          label={t('Short')}
          value={shortLines}
          tone='danger'
          active={shortLines > 0}
          hint={t('after earlier orders’ reservations')}
        />
        {canSeeCosts && (
          <Stat
            label={t('Issued value')}
            value={formatMoney(order.materialCost)}
            hint={t('net of returns')}
          />
        )}
      </StatGrid>

      <Panel
        flush
        title={t('Materials')}
        description={
          reserving
            ? t(
                'Reserved = on-hand stock promised to this order after the orders ahead of it in the queue (running first, then by priority and start date).'
              )
            : ['completed', 'cancelled'].includes(order.status)
              ? t('This order is closed — it no longer reserves stock.')
              : t(
                  'Draft orders don’t reserve stock — shortage shows what would be missing after the open orders.'
                )
        }
        action={
          canIssue ? (
            <div className='flex flex-wrap gap-2'>
              {/* The full voucher: warehouses, requested/issued by, batches, overrides, print. */}
              <Button asChild size='sm'>
                <Link
                  to={'/manufacturing/material-issues/new' as never}
                  search={{ orderId: order.id } as never}
                >
                  <PackageMinus className='mr-1.5 h-3.5 w-3.5' />
                  {t('Issue materials')}
                </Link>
              </Button>
            </div>
          ) : undefined
        }
      >
        <div className='flex justify-end border-b px-4 py-2'>
          <ProgressLegend />
        </div>

        {/* Desktop / tablet: one row per line */}
        <div className='hidden overflow-x-auto md:block'>
          <Table>
            <TableHeader>
              <TableRow className='bg-muted/40'>
                <TableHead className='min-w-48'>{t('Material')}</TableHead>
                <TableHead className='w-52 max-lg:hidden'>
                  {t('Progress')}
                </TableHead>
                <TableHead className='text-right'>{t('Required')}</TableHead>
                <TableHead className='text-right'>{t('Reserved')}</TableHead>
                <TableHead className='text-right'>{t('Issued')}</TableHead>
                <TableHead className='text-right'>{t('Consumed')}</TableHead>
                <TableHead className='text-right'>{t('Remaining')}</TableHead>
                <TableHead className='text-right'>{t('Shortage')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.materials.map((m) => {
                const req = byLine.get(m._id)
                return (
                  <TableRow key={m._id}>
                    <TableCell>
                      <MaterialName material={m} />
                      <div className='mt-2 lg:hidden'>
                        <MaterialProgress material={m} />
                      </div>
                    </TableCell>
                    <TableCell className='max-lg:hidden'>
                      <MaterialProgress material={m} />
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {fmtQty(m.requiredQuantity)}
                      <div className='text-muted-foreground text-[11px]'>
                        {m.unit}
                      </div>
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      <ReservedCell line={req} reserving={reserving} />
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {fmtQty(lineIssuedNet(m))}
                    </TableCell>
                    <TableCell className='text-muted-foreground text-right tabular-nums'>
                      {fmtQty(m.consumedQuantity)}
                    </TableCell>
                    <TableCell className='text-right'>
                      <RemainingValue material={m} />
                    </TableCell>
                    <TableCell className='text-right'>
                      <ShortageCell line={req} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
            {order.materials.length > 0 && (
              <TableFooter>
                <TableRow className='font-semibold'>
                  <TableCell>{t('Total')}</TableCell>
                  <TableCell className='max-lg:hidden' />
                  <TableCell className='text-right tabular-nums'>
                    {totals.required}
                  </TableCell>
                  <TableCell />
                  <TableCell className='text-right tabular-nums'>
                    {totals.issued}
                  </TableCell>
                  <TableCell className='text-muted-foreground text-right tabular-nums'>
                    {totals.consumed}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {totals.remaining}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>

        {/* Phone: one card per line, every figure kept */}
        <ul className='divide-y md:hidden'>
          {order.materials.map((m) => {
            const req = byLine.get(m._id)
            return (
              <li key={m._id} className='space-y-2.5 px-4 py-3'>
                <MaterialName material={m} />
                <MaterialProgress material={m} />
                <dl className='grid grid-cols-3 gap-x-3 gap-y-2 text-sm'>
                  <MiniFigure label={t('Required')}>
                    {fmtQty(m.requiredQuantity)}
                  </MiniFigure>
                  <MiniFigure label={t('Reserved')}>
                    <ReservedCell line={req} reserving={reserving} compact />
                  </MiniFigure>
                  <MiniFigure label={t('Issued')}>
                    {fmtQty(lineIssuedNet(m))}
                  </MiniFigure>
                  <MiniFigure label={t('Consumed')}>
                    {fmtQty(m.consumedQuantity)}
                  </MiniFigure>
                  <MiniFigure label={t('Remaining')}>
                    <RemainingValue material={m} />
                  </MiniFigure>
                  <MiniFigure label={t('Shortage')}>
                    <ShortageCell line={req} compact />
                  </MiniFigure>
                </dl>
              </li>
            )
          })}
          {order.materials.length > 0 && (
            <li className='bg-muted/40 px-4 py-3'>
              <div className='mb-1.5 text-sm font-semibold'>{t('Total')}</div>
              <dl className='grid grid-cols-2 gap-x-3 gap-y-2 text-sm'>
                <MiniFigure label={t('Required')}>{totals.required}</MiniFigure>
                <MiniFigure label={t('Issued')}>{totals.issued}</MiniFigure>
                <MiniFigure label={t('Consumed')}>{totals.consumed}</MiniFigure>
                <MiniFigure label={t('Remaining')}>
                  {totals.remaining}
                </MiniFigure>
              </dl>
            </li>
          )}
        </ul>
      </Panel>

      <IssueHistory orderId={order.id} />
    </div>
  )
}

function MaterialName({ material: m }: { material: ProductionMaterial }) {
  const { t } = useLanguage()
  return (
    <div style={{ paddingLeft: (m.level - 1) * 12 }}>
      <div className='flex flex-wrap items-center gap-1.5'>
        <span className='font-medium'>{m.productName}</span>
        <IssueStatusBadge material={m} />
      </div>
      <div className='text-muted-foreground text-xs'>
        {[
          m.sku,
          m.isOptional ? t('Optional') : null,
          m.alternatives.length
            ? `${m.alternatives.length} ${t('alternative(s)')}`
            : null,
          m.returnedQuantity
            ? `${fmtQty(m.returnedQuantity)} ${t('returned')}`
            : null,
          m.scrappedQuantity
            ? `${fmtQty(m.scrappedQuantity)} ${t('scrapped')}`
            : null,
        ]
          .filter(Boolean)
          .join(' · ') || m.unit}
      </div>
    </div>
  )
}

function MiniFigure({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className='min-w-0'>
      <dt className='text-muted-foreground text-[11px]'>{label}</dt>
      <dd className='tabular-nums'>{children}</dd>
    </div>
  )
}

function RemainingValue({ material }: { material: ProductionMaterial }) {
  const rem = lineRemaining(material)
  return (
    <span
      className={cn(
        'font-medium tabular-nums',
        rem > EPS
          ? 'text-amber-700 dark:text-amber-400'
          : 'text-emerald-700 dark:text-emerald-400'
      )}
    >
      {rem > EPS ? fmtQty(rem) : '✓'}
    </span>
  )
}

function ReservedCell({
  line,
  reserving,
  compact,
}: {
  line?: RequirementLine
  reserving: boolean
  compact?: boolean
}) {
  const { t } = useLanguage()
  if (!line || !reserving || line.isOptional) {
    return <span className='text-muted-foreground'>—</span>
  }
  const held = line.heldByEarlierOrdersQuantity ?? 0
  return (
    <span>
      {fmtQty(line.reservedQuantity)}
      {!compact && held > EPS && (
        <span className='text-muted-foreground block text-[10px] whitespace-nowrap'>
          {fmtQty(held)} {t('held for')}{' '}
          {(line.heldByEarlierOrders || []).slice(0, 2).map((o, i) => (
            <span key={o.orderId}>
              {i > 0 && ', '}
              <Link
                to={
                  orderPath({ id: o.orderId, orderType: o.orderType }) as never
                }
                className='font-mono hover:underline'
              >
                {o.orderNumber}
              </Link>
            </span>
          ))}
          {(line.heldByEarlierOrders?.length ?? 0) > 2 && '…'}
        </span>
      )}
    </span>
  )
}

function ShortageCell({
  line,
  compact,
}: {
  line?: RequirementLine
  compact?: boolean
}) {
  const { t } = useLanguage()
  const short = line?.netShortageQuantity ?? 0
  if (!line) return <span className='text-muted-foreground'>—</span>
  return (
    <span>
      <span
        className={cn(
          'tabular-nums',
          short > EPS
            ? 'font-semibold text-rose-700 dark:text-rose-400'
            : 'text-muted-foreground'
        )}
      >
        {short > EPS ? fmtQty(short) : '—'}
      </span>
      {!compact && (
        <span className='text-muted-foreground block text-[10px] whitespace-nowrap'>
          {fmtQty(line.availableQuantity)} {t('on hand')}
        </span>
      )}
    </span>
  )
}

/** Issue and return documents for this order, newest first. */
function IssueHistory({ orderId }: { orderId: string }) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const canSeeCosts = useCanViewManufacturingCosts()
  const { data } = useGetMaterialIssuesQuery({
    productionOrderId: orderId,
    status: 'posted',
    limit: 50,
  })
  return (
    <Panel
      title={t('Issues & returns')}
      flush
      description={t(
        'Every movement of material between stock and this order’s WIP'
      )}
    >
      {data && !data.results.length ? (
        <p className='text-muted-foreground p-6 text-center text-sm'>
          {t('No materials issued yet.')}
        </p>
      ) : (
        <ul className='divide-y'>
          {data?.results.map((issue) => (
            <li key={issue.id} className='px-5 py-3 max-sm:px-4'>
              <div className='flex flex-wrap items-center gap-2 text-sm'>
                {issue.kind === 'return' ? (
                  <Undo2 className='h-4 w-4 text-sky-600' />
                ) : (
                  <PackagePlus className='h-4 w-4 text-amber-600' />
                )}
                <Link
                  to={`/manufacturing/material-issues/${issue.id}` as never}
                  className={cn(
                    'font-mono text-xs hover:underline',
                    issue.status === 'cancelled' && 'line-through'
                  )}
                >
                  {issue.issueNumber}
                </Link>
                <Badge variant='outline' className='text-[10px]'>
                  {issue.kind === 'return' ? t('Return') : t('Issue')}
                </Badge>
                {issue.status === 'cancelled' && (
                  <Badge
                    variant='outline'
                    className='border-rose-500/30 text-[10px] text-rose-700 dark:text-rose-300'
                  >
                    {t('Cancelled')}
                  </Badge>
                )}
                {issue.isOverIssue && (
                  <Badge
                    variant='outline'
                    className='border-violet-500/30 text-[10px] text-violet-700 dark:text-violet-300'
                  >
                    {t('Over-issue')}
                  </Badge>
                )}
                <span className='text-muted-foreground'>
                  {fmtDate(issue.issueDate)}
                </span>
                {canSeeCosts && (
                  <span className='ml-auto font-medium tabular-nums'>
                    {formatMoney(issue.totalCost)}
                  </span>
                )}
              </div>
              <ul className='mt-1.5 space-y-0.5 text-sm'>
                {issue.lines.map((line, i) => (
                  <li key={i} className='flex justify-between gap-2'>
                    <span className='truncate'>
                      {line.productName}
                      {line.batchNumber && (
                        <span className='text-muted-foreground ml-1 font-mono text-xs'>
                          · {line.batchNumber}
                        </span>
                      )}
                      {line.isAlternative && (
                        <span className='text-muted-foreground ml-1 text-xs'>
                          ({t('alternative')})
                        </span>
                      )}
                    </span>
                    <span className='text-muted-foreground shrink-0 tabular-nums'>
                      {issue.kind === 'return' ? '+' : '−'}
                      {fmtQty(line.quantity)} {line.unit}
                    </span>
                  </li>
                ))}
                {issue.lines.length > 1 && (
                  <li className='flex justify-between gap-2 border-t pt-0.5 font-medium'>
                    <span>{t('Total')}</span>
                    <span className='shrink-0 tabular-nums'>
                      {formatTotalsByUnit(issue.lines)}
                    </span>
                  </li>
                )}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
