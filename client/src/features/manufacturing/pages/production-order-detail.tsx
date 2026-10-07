import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  MapPin,
  MoreHorizontal,
  PackageCheck,
  PackageMinus,
  Pencil,
  Recycle,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  useChangeProductionStatusMutation,
  useDeleteProductionOrderMutation,
  useGetMaterialIssuesQuery,
  useGetOrderRequirementsQuery,
  useGetProductionOrderQuery,
  useGetProductionReceiptsQuery,
  useGetScrapRecordsQuery,
  useRefreshProductionMaterialsMutation,
  type ProductionStatus,
} from '@/stores/manufacturing.api'
import { useFormatMoney } from '@/lib/format-money'
import { getErrorMessage } from '@/lib/get-error-message'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PriorityText, ProgressBar, StatusBadge } from '../components/badges'
import {
  IssueMaterialsDialog,
  ReceiveOutputDialog,
  RecordScrapDialog,
} from '../components/execution-dialogs'
import { ProductionOrderDialog } from '../components/production-order-dialog'
import {
  SCRAP_REASON_LABELS,
  SCRAP_STAGE_LABELS,
  STATUS_META,
  STATUS_TRANSITIONS,
  TRANSITION_LABELS,
  fmtDate,
  fmtQty,
} from '../lib/constants'

const LIFECYCLE: ProductionStatus[] = [
  'draft',
  'planned',
  'released',
  'in_production',
  'completed',
]
const EXECUTABLE: ProductionStatus[] = ['released', 'in_production', 'paused']

export default function ProductionOrderDetail({
  orderId,
}: {
  orderId: string
}) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const formatMoney = useFormatMoney()
  const { hasPermission } = usePermissions()
  const canManage = hasPermission('manageProductionOrders')
  const canExecute = hasPermission('executeProduction')

  const { data: order, isLoading, error } = useGetProductionOrderQuery(orderId)
  const { data: requirements } = useGetOrderRequirementsQuery(orderId)
  const [changeStatus, { isLoading: changing }] =
    useChangeProductionStatusMutation()
  const [refreshMaterials] = useRefreshProductionMaterialsMutation()
  const [deleteOrder] = useDeleteProductionOrderMutation()
  const [dialog, setDialog] = useState<
    'edit' | 'issue' | 'receive' | 'scrap' | null
  >(null)

  if (isLoading) return <Skeleton className='h-96 w-full rounded-xl' />
  if (!order) {
    return (
      <div className='text-muted-foreground rounded-xl border p-10 text-center text-sm'>
        {getErrorMessage(error, t('Production order not found'))}
      </div>
    )
  }

  const transitions = STATUS_TRANSITIONS[order.status]
  const executable = EXECUTABLE.includes(order.status)
  const outputPct = (order.completedQuantity / order.plannedQuantity) * 100
  const required = order.materials.filter((m) => !m.isOptional)
  const materialPct = required.length
    ? (required.reduce(
        (s, m) => s + Math.min(m.issuedQuantity, m.requiredQuantity),
        0
      ) /
        required.reduce((s, m) => s + m.requiredQuantity, 0)) *
      100
    : 0
  const shortageByLine = new Map(
    (requirements?.lines || []).map((l) => [l.materialLineId, l])
  )

  const move = async (status: ProductionStatus) => {
    if (
      status === 'cancelled' &&
      !window.confirm(t('Cancel this production order?'))
    )
      return
    try {
      await changeStatus({ orderId: order.id, status }).unwrap()
      toast.success(
        t('Order moved to {{s}}').replace('{{s}}', t(STATUS_META[status].label))
      )
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not change status')))
    }
  }

  const lifecycleIndex =
    order.status === 'paused'
      ? LIFECYCLE.indexOf('in_production')
      : LIFECYCLE.indexOf(order.status)

  return (
    <div className='space-y-4'>
      <Button variant='ghost' size='sm' asChild className='-ml-2'>
        <Link to={'/manufacturing/production-orders' as never}>
          <ArrowLeft className='mr-1.5 h-4 w-4' />
          {t('Production orders')}
        </Link>
      </Button>

      {/* Header */}
      <Card className='overflow-hidden'>
        <div className='flex flex-wrap items-start gap-4 p-5 max-sm:p-4'>
          <div className='min-w-0 flex-1'>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='bg-muted rounded-md px-2 py-0.5 font-mono text-xs'>
                {order.orderNumber}
              </span>
              <StatusBadge status={order.status} />
              <PriorityText priority={order.priority} />
            </div>
            <h2 className='mt-2 text-2xl font-semibold tracking-tight'>
              {order.productName}
            </h2>
            <p className='text-muted-foreground text-sm'>
              {fmtQty(order.plannedQuantity)} {order.unit}
              {order.bomNumber && (
                <>
                  {' · '}
                  <Link
                    to={'/manufacturing/boms' as never}
                    search={{ bomId: order.bomId } as never}
                    className='hover:underline'
                  >
                    {order.bomNumber} v{order.bomVersion}
                  </Link>
                </>
              )}
              {(order.plannedStartDate || order.plannedCompletionDate) && (
                <>
                  {' · '}
                  {fmtDate(order.plannedStartDate)} →{' '}
                  {fmtDate(order.plannedCompletionDate)}
                </>
              )}
            </p>
          </div>
          <div className='flex flex-wrap items-center gap-2 max-sm:w-full'>
            {canExecute && executable && (
              <>
                <Button
                  variant='outline'
                  onClick={() => setDialog('issue')}
                  disabled={!order.materials.length}
                >
                  <PackageMinus className='mr-2 h-4 w-4' />
                  {t('Issue materials')}
                </Button>
                <Button onClick={() => setDialog('receive')}>
                  <PackageCheck className='mr-2 h-4 w-4' />
                  {t('Receive output')}
                </Button>
              </>
            )}
            {canManage &&
              transitions
                .filter((s) => s !== 'cancelled' && s !== 'draft')
                .map((s) => (
                  <Button
                    key={s}
                    variant={
                      s === 'completed' || s === 'released'
                        ? 'default'
                        : 'secondary'
                    }
                    disabled={changing}
                    onClick={() => move(s)}
                  >
                    {t(TRANSITION_LABELS[s] || STATUS_META[s].label)}
                  </Button>
                ))}
            {(canManage || canExecute) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant='ghost'
                    size='icon'
                    aria-label={t('More actions')}
                  >
                    <MoreHorizontal className='h-4 w-4' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                  {canManage &&
                    !['completed', 'cancelled'].includes(order.status) && (
                      <DropdownMenuItem onClick={() => setDialog('edit')}>
                        <Pencil className='mr-2 h-4 w-4' />
                        {t('Edit order')}
                      </DropdownMenuItem>
                    )}
                  {canManage &&
                    ['draft', 'planned'].includes(order.status) &&
                    order.bomId && (
                      <DropdownMenuItem
                        onClick={async () => {
                          try {
                            await refreshMaterials(order.id).unwrap()
                            toast.success(t('Materials refreshed from the BOM'))
                          } catch (err) {
                            toast.error(
                              getErrorMessage(err, t('Refresh failed'))
                            )
                          }
                        }}
                      >
                        <RefreshCw className='mr-2 h-4 w-4' />
                        {t('Refresh materials from BOM')}
                      </DropdownMenuItem>
                    )}
                  {canExecute && order.status !== 'cancelled' && (
                    <DropdownMenuItem onClick={() => setDialog('scrap')}>
                      <Recycle className='mr-2 h-4 w-4' />
                      {t('Record scrap')}
                    </DropdownMenuItem>
                  )}
                  {canManage && transitions.includes('draft') && (
                    <DropdownMenuItem onClick={() => move('draft')}>
                      {t('Back to Draft')}
                    </DropdownMenuItem>
                  )}
                  {canManage && transitions.includes('cancelled') && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className='text-destructive'
                        onClick={() => move('cancelled')}
                      >
                        {t('Cancel order')}
                      </DropdownMenuItem>
                    </>
                  )}
                  {canManage &&
                    ['draft', 'planned', 'cancelled'].includes(
                      order.status
                    ) && (
                      <DropdownMenuItem
                        className='text-destructive'
                        onClick={async () => {
                          if (
                            !window.confirm(
                              t('Delete this production order permanently?')
                            )
                          )
                            return
                          try {
                            await deleteOrder(order.id).unwrap()
                            toast.success(t('Production order deleted'))
                            navigate({
                              to: '/manufacturing/production-orders' as never,
                            })
                          } catch (err) {
                            toast.error(
                              getErrorMessage(err, t('Delete failed'))
                            )
                          }
                        }}
                      >
                        <Trash2 className='mr-2 h-4 w-4' />
                        {t('Delete')}
                      </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Lifecycle stepper */}
        {order.status !== 'cancelled' && (
          <div className='bg-muted/30 flex items-center gap-1 overflow-x-auto border-t px-5 py-3 max-sm:px-4'>
            {LIFECYCLE.map((step, i) => {
              const done = i < lifecycleIndex || order.status === 'completed'
              const current =
                i === lifecycleIndex && order.status !== 'completed'
              return (
                <div key={step} className='flex shrink-0 items-center gap-1'>
                  {i > 0 && (
                    <div
                      className={cn(
                        'h-px w-6 sm:w-10',
                        done || current ? 'bg-foreground/40' : 'bg-border'
                      )}
                    />
                  )}
                  <span
                    className={cn(
                      'flex items-center gap-1.5 text-xs',
                      current
                        ? 'text-foreground font-semibold'
                        : done
                          ? 'text-foreground/70'
                          : 'text-muted-foreground'
                    )}
                  >
                    {done ? (
                      <CheckCircle2 className='h-3.5 w-3.5 text-emerald-500' />
                    ) : (
                      <Circle
                        className={cn(
                          'h-3.5 w-3.5',
                          current && 'fill-primary text-primary'
                        )}
                      />
                    )}
                    {current && order.status === 'paused'
                      ? t('Paused')
                      : t(STATUS_META[step].label)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* KPIs */}
      <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
        <Kpi
          label={t('Output received')}
          value={`${fmtQty(order.completedQuantity)} / ${fmtQty(order.plannedQuantity)}`}
          hint={order.unit}
        >
          <ProgressBar value={outputPct} tone='emerald' />
        </Kpi>
        <Kpi
          label={t('Materials issued')}
          value={`${Math.round(materialPct)}%`}
          hint={t('of required')}
        >
          <ProgressBar value={materialPct} tone='amber' />
        </Kpi>
        <Kpi
          label={t('Material cost')}
          value={formatMoney(order.materialCost)}
          hint={`${t('FG value')} ${formatMoney(order.finishedGoodsValue)}`}
        />
        <Kpi
          label={t('Scrapped output')}
          value={fmtQty(order.scrappedQuantity)}
          hint={order.unit}
        />
      </div>

      <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]'>
        <Tabs defaultValue='materials'>
          <TabsList className='max-w-full overflow-x-auto'>
            <TabsTrigger value='materials'>
              {t('Materials')}
              {requirements && requirements.shortageCount > 0 && (
                <span className='ml-1.5 rounded-full bg-rose-500/15 px-1.5 text-[10px] font-semibold text-rose-600'>
                  {requirements.shortageCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value='issues'>{t('Issues')}</TabsTrigger>
            <TabsTrigger value='receipts'>{t('Receipts')}</TabsTrigger>
            <TabsTrigger value='scrap'>{t('Scrap')}</TabsTrigger>
            <TabsTrigger value='history'>{t('History')}</TabsTrigger>
          </TabsList>

          <TabsContent value='materials' className='mt-3'>
            <Card>
              <CardContent className='p-0'>
                {order.materials.length === 0 ? (
                  <p className='text-muted-foreground p-8 text-center text-sm'>
                    {t('This order has no BOM materials.')}
                  </p>
                ) : (
                  <div className='overflow-x-auto'>
                    <Table>
                      <TableHeader>
                        <TableRow className='bg-muted/40'>
                          <TableHead>{t('Material')}</TableHead>
                          <TableHead className='text-right'>
                            {t('Required')}
                          </TableHead>
                          <TableHead className='w-40'>{t('Issued')}</TableHead>
                          <TableHead className='text-right'>
                            {t('On hand')}
                          </TableHead>
                          <TableHead className='text-right'>
                            {t('Shortage')}
                          </TableHead>
                          <TableHead className='text-right'>
                            {t('Cost')}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {order.materials.map((m) => {
                          const req = shortageByLine.get(m._id)
                          return (
                            <TableRow key={m._id}>
                              <TableCell>
                                <div
                                  className='font-medium'
                                  style={{ paddingLeft: (m.level - 1) * 12 }}
                                >
                                  {m.productName}
                                </div>
                                <div className='text-muted-foreground text-xs'>
                                  {[
                                    m.sku,
                                    m.level > 1
                                      ? `${t('Level')} ${m.level}`
                                      : null,
                                    m.isOptional ? t('Optional') : null,
                                    m.alternatives.length
                                      ? `${m.alternatives.length} ${t('alternative(s)')}`
                                      : null,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ') || '—'}
                                </div>
                              </TableCell>
                              <TableCell className='text-right tabular-nums'>
                                {fmtQty(m.requiredQuantity)}{' '}
                                <span className='text-muted-foreground text-xs'>
                                  {m.unit}
                                </span>
                              </TableCell>
                              <TableCell>
                                <div className='text-muted-foreground mb-1 text-xs tabular-nums'>
                                  {fmtQty(m.issuedQuantity)}
                                  {m.scrappedQuantity > 0 &&
                                    ` · ${fmtQty(m.scrappedQuantity)} ${t('scrapped')}`}
                                </div>
                                <ProgressBar
                                  value={
                                    (m.issuedQuantity /
                                      (m.requiredQuantity || 1)) *
                                    100
                                  }
                                  tone='amber'
                                />
                              </TableCell>
                              <TableCell className='text-muted-foreground text-right tabular-nums'>
                                {req ? fmtQty(req.availableQuantity) : '—'}
                              </TableCell>
                              <TableCell className='text-right tabular-nums'>
                                {req && req.shortageQuantity > 0 ? (
                                  <span className='font-medium text-rose-600 dark:text-rose-400'>
                                    −{fmtQty(req.shortageQuantity)}
                                  </span>
                                ) : (
                                  <span className='text-emerald-600 dark:text-emerald-400'>
                                    ✓
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className='text-right tabular-nums'>
                                {formatMoney(m.issuedCost)}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value='issues' className='mt-3'>
            <OrderIssues orderId={order.id} />
          </TabsContent>
          <TabsContent value='receipts' className='mt-3'>
            <OrderReceipts orderId={order.id} />
          </TabsContent>
          <TabsContent value='scrap' className='mt-3'>
            <OrderScrap orderId={order.id} />
          </TabsContent>
          <TabsContent value='history' className='mt-3'>
            <Card>
              <CardContent className='p-5'>
                <ol className='relative space-y-4 border-l pl-5'>
                  {[...order.statusHistory].reverse().map((h, i) => (
                    <li key={i} className='relative'>
                      <span
                        className={cn(
                          'border-background absolute top-1 -left-[1.6rem] h-2.5 w-2.5 rounded-full border-2',
                          STATUS_META[h.to].dot
                        )}
                      />
                      <div className='flex flex-wrap items-center gap-2 text-sm'>
                        <StatusBadge status={h.to} />
                        <span className='text-muted-foreground text-xs'>
                          {new Date(h.at).toLocaleString()}
                        </span>
                      </div>
                      {h.note && (
                        <p className='text-muted-foreground mt-1 text-xs'>
                          {h.note}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Card className='h-fit'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm'>{t('Locations')}</CardTitle>
            <CardDescription className='text-xs'>
              {t('Within this branch')}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3 text-sm'>
            {[
              [t('Source'), order.sourceLocation],
              [t('Work in progress'), order.wipLocation],
              [t('Finished goods'), order.finishedGoodsLocation],
            ].map(([label, value]) => (
              <div key={label} className='flex items-start gap-2'>
                <MapPin className='text-muted-foreground mt-0.5 h-3.5 w-3.5 shrink-0' />
                <div>
                  <div className='text-muted-foreground text-xs'>{label}</div>
                  <div>{value || '—'}</div>
                </div>
              </div>
            ))}
            {order.notes && (
              <div className='border-t pt-3'>
                <div className='text-muted-foreground text-xs'>
                  {t('Notes')}
                </div>
                <p className='whitespace-pre-wrap'>{order.notes}</p>
              </div>
            )}
            <div className='text-muted-foreground border-t pt-3 text-xs'>
              {t('Started')}: {fmtDate(order.actualStartDate)}
              <br />
              {t('Completed')}: {fmtDate(order.actualCompletionDate)}
            </div>
          </CardContent>
        </Card>
      </div>

      {dialog === 'edit' && (
        <ProductionOrderDialog order={order} onClose={() => setDialog(null)} />
      )}
      {dialog === 'issue' && (
        <IssueMaterialsDialog
          order={order}
          requirements={requirements}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'receive' && (
        <ReceiveOutputDialog order={order} onClose={() => setDialog(null)} />
      )}
      {dialog === 'scrap' && (
        <RecordScrapDialog order={order} onClose={() => setDialog(null)} />
      )}
    </div>
  )
}

function Kpi({
  label,
  value,
  hint,
  children,
}: {
  label: string
  value: string
  hint?: string
  children?: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className='space-y-2 p-4'>
        <div className='text-muted-foreground text-xs'>{label}</div>
        <div className='flex items-baseline gap-1.5'>
          <span className='text-xl font-semibold tracking-tight tabular-nums'>
            {value}
          </span>
          {hint && (
            <span className='text-muted-foreground text-xs'>{hint}</span>
          )}
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

function OrderIssues({ orderId }: { orderId: string }) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { data } = useGetMaterialIssuesQuery({
    productionOrderId: orderId,
    limit: 50,
  })
  if (data && !data.results.length)
    return <EmptyLine text={t('No materials issued yet.')} />
  return (
    <div className='space-y-2'>
      {data?.results.map((issue) => (
        <Card key={issue.id}>
          <CardContent className='p-4'>
            <div className='flex flex-wrap items-center gap-2 text-sm'>
              <span className='font-mono text-xs'>{issue.issueNumber}</span>
              <span className='text-muted-foreground'>
                {fmtDate(issue.issueDate)}
              </span>
              <span className='ml-auto font-medium tabular-nums'>
                {formatMoney(issue.totalCost)}
              </span>
            </div>
            <ul className='mt-2 space-y-1 text-sm'>
              {issue.lines.map((line, i) => (
                <li key={i} className='flex justify-between gap-2'>
                  <span className='truncate'>
                    {line.productName}
                    {line.isAlternative && (
                      <span className='text-muted-foreground ml-1 text-xs'>
                        ({t('alternative')})
                      </span>
                    )}
                  </span>
                  <span className='text-muted-foreground shrink-0 tabular-nums'>
                    {fmtQty(line.quantity)} {line.unit}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function OrderReceipts({ orderId }: { orderId: string }) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { data } = useGetProductionReceiptsQuery({
    productionOrderId: orderId,
    limit: 50,
  })
  if (data && !data.results.length)
    return <EmptyLine text={t('No output received yet.')} />
  return (
    <Card>
      <CardContent className='divide-y p-0'>
        {data?.results.map((r) => (
          <div
            key={r.id}
            className='flex flex-wrap items-center gap-3 px-4 py-3 text-sm'
          >
            <span className='font-mono text-xs'>{r.receiptNumber}</span>
            <span className='text-muted-foreground'>
              {fmtDate(r.receiptDate)}
            </span>
            <span className='text-muted-foreground'>{r.location}</span>
            <span className='ml-auto tabular-nums'>
              +{fmtQty(r.quantity)} {r.unit}
            </span>
            <span className='text-muted-foreground w-24 text-right tabular-nums'>
              {formatMoney(r.totalCost)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function OrderScrap({ orderId }: { orderId: string }) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { data } = useGetScrapRecordsQuery({
    productionOrderId: orderId,
    limit: 50,
  })
  if (data && !data.results.length)
    return <EmptyLine text={t('No scrap recorded.')} />
  return (
    <Card>
      <CardContent className='divide-y p-0'>
        {data?.results.map((s) => (
          <div
            key={s.id}
            className='flex flex-wrap items-center gap-3 px-4 py-3 text-sm'
          >
            <span className='font-mono text-xs'>{s.scrapNumber}</span>
            <span className='min-w-0 flex-1 truncate'>{s.productName}</span>
            <span className='text-muted-foreground text-xs'>
              {t(SCRAP_STAGE_LABELS[s.stage])} ·{' '}
              {t(SCRAP_REASON_LABELS[s.reason])}
            </span>
            <span className='tabular-nums'>
              {fmtQty(s.quantity)} {s.unit}
            </span>
            <span className='text-muted-foreground w-24 text-right tabular-nums'>
              {formatMoney(s.totalCost)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div className='text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm'>
      {text}
    </div>
  )
}
