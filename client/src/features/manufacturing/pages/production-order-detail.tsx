import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Factory,
  GitBranch,
  Layers,
  MapPin,
  MoreHorizontal,
  PackageCheck,
  PackageMinus,
  PackagePlus,
  Pencil,
  Play,
  Recycle,
  RefreshCw,
  Trash2,
  Undo2,
  UserRound,
  Warehouse,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  useChangeProductionStatusMutation,
  useCreateSubAssembliesMutation,
  useDeleteProductionOrderMutation,
  useGetMaterialIssuesQuery,
  useGetOrderTreeQuery,
  useGetOrderRequirementsQuery,
  useGetOutputsQuery,
  useGetProductionOrderQuery,
  useGetProductionReceiptsQuery,
  useGetScrapRecordsQuery,
  useRefreshProductionMaterialsMutation,
  useStartAssemblyMutation,
  useTraceOrderQuery,
  type OrderTreeNode,
  type ProductionOrder,
  type ProductionOutput,
  type ProductionStatus,
} from '@/stores/manufacturing.api'
import { useFormatMoney } from '@/lib/format-money'
import { getErrorMessage } from '@/lib/get-error-message'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { Badge } from '@/components/ui/badge'
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
import { PriorityText, StatusBadge } from '../components/badges'
import {
  CompleteOrderDialog,
  InspectOutputDialog,
  IssueMaterialsDialog,
  RecordScrapDialog,
  ReportOutputDialog,
  ReturnMaterialsDialog,
  ReworkDialog,
} from '../components/execution-dialogs'
import {
  IssueStatusBadge,
  MaterialProgress,
  ProgressLegend,
} from '../components/material-progress'
import { MovementsTable } from '../components/movements-table'
import { ProductionOrderDialog } from '../components/production-order-dialog'
import { TraceTree } from '../components/trace-views'
import {
  SCRAP_REASON_LABELS,
  SCRAP_STAGE_LABELS,
  STATUS_META,
  TRANSITION_LABELS,
  fmtDate,
  fmtQty,
  refName,
  statusLabel,
  transitionsFor,
  orderPath,
} from '../lib/constants'
import { lineRemaining, lineWip } from '../lib/material-math'

const LIFECYCLE: ProductionStatus[] = [
  'draft',
  'planned',
  'released',
  'in_production',
  'completed',
]
const ASSEMBLY_LIFECYCLE: ProductionStatus[] = [
  'draft',
  'released',
  'in_production',
  'qc_pending',
  'completed',
]
const EXECUTABLE: ProductionStatus[] = ['released', 'in_production', 'paused']
const EPS = 1e-6

type DialogKind =
  | 'edit'
  | 'issue'
  | 'return'
  | 'output'
  | 'rework'
  | 'complete'
  | 'scrap'
  | 'assemble'

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
  const canInspect = hasPermission('inspectProduction')

  const { data: order, isLoading, error } = useGetProductionOrderQuery(orderId)
  const { data: requirements } = useGetOrderRequirementsQuery(orderId)
  const { data: pendingOutputs } = useGetOutputsQuery({
    productionOrderId: orderId,
    status: 'pending_qc',
    limit: 50,
  })
  const [changeStatus, { isLoading: changing }] =
    useChangeProductionStatusMutation()
  const [refreshMaterials] = useRefreshProductionMaterialsMutation()
  const [startAssemblyMutation, { isLoading: starting }] =
    useStartAssemblyMutation()
  const [deleteOrder] = useDeleteProductionOrderMutation()
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const [inspecting, setInspecting] = useState<ProductionOutput | null>(null)

  const pathname = useLocation({ select: (l) => l.pathname })
  // Links that only know an order id land on /production-orders/…; keep assembly
  // orders on their own section so the rail and back link stay correct.
  const canonical = order ? orderPath(order) : null
  useEffect(() => {
    if (canonical && pathname !== canonical) {
      navigate({ to: canonical as never, replace: true })
    }
  }, [canonical, pathname, navigate])

  if (isLoading) return <Skeleton className='h-96 w-full rounded-xl' />
  if (!order) {
    return (
      <div className='text-muted-foreground rounded-xl border p-10 text-center text-sm'>
        {getErrorMessage(error, t('Production order not found'))}
      </div>
    )
  }

  const executable = EXECUTABLE.includes(order.status)
  const isAssembly = order.orderType === 'assembly'
  const allowed = transitionsFor(order.orderType)[order.status]
  // Assembly orders start and complete through their own actions (which move stock).
  const transitions = allowed.filter(
    (s) =>
      s !== 'cancelled' &&
      s !== 'draft' &&
      s !== 'completed' &&
      s !== 'qc_pending' &&
      !(isAssembly && s === 'in_production' && order.status === 'released')
  )
  const canComplete = allowed.includes('completed')
  const canStartAssembly = isAssembly && order.status === 'released'
  const canCompleteAssembly =
    isAssembly &&
    ['in_production', 'paused'].includes(order.status) &&
    order.producedQuantity < order.plannedQuantity
  const wipLots = order.wipLots.filter((l) => l.quantity > EPS)
  const wipValue = wipLots.reduce(
    (s, l) => s + l.quantity * (l.unitCost || 0),
    0
  )
  const remaining = Math.max(0, order.plannedQuantity - order.producedQuantity)
  const availableByLine = new Map(
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
        t('Order moved to {{s}}').replace(
          '{{s}}',
          t(statusLabel(status, order.orderType))
        )
      )
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not change status')))
    }
  }

  const startAssembly = async () => {
    try {
      await startAssemblyMutation({ orderId: order.id }).unwrap()
      toast.success(t('Assembly started — components moved into WIP'))
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not start assembly')))
    }
  }

  const lifecycle = isAssembly ? ASSEMBLY_LIFECYCLE : LIFECYCLE
  const lifecycleIndex =
    order.status === 'paused'
      ? lifecycle.indexOf('in_production')
      : lifecycle.indexOf(order.status)

  return (
    <div className='space-y-4'>
      <Button variant='ghost' size='sm' asChild className='-ml-2'>
        <Link
          to={
            (isAssembly
              ? '/manufacturing/assembly-orders'
              : '/manufacturing/production-orders') as never
          }
        >
          <ArrowLeft className='mr-1.5 h-4 w-4' />
          {isAssembly ? t('Assembly orders') : t('Production orders')}
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
              <StatusBadge status={order.status} orderType={order.orderType} />
              {isAssembly && (
                <Badge
                  variant='outline'
                  className='gap-1 border-violet-500/30 text-violet-700 dark:text-violet-300'
                >
                  <Layers className='h-3 w-3' />
                  {t('Assembly')}
                </Badge>
              )}
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
              {order.operatorName && (
                <>
                  {' · '}
                  <UserRound className='mb-0.5 inline h-3.5 w-3.5' />{' '}
                  {order.operatorName}
                </>
              )}
            </p>
          </div>
          <div className='flex flex-wrap items-center gap-2 max-sm:w-full'>
            {canExecute && canStartAssembly && (
              <Button onClick={startAssembly} disabled={starting}>
                <Play className='mr-2 h-4 w-4' />
                {t('Start assembly')}
              </Button>
            )}
            {canExecute && canCompleteAssembly && (
              <Button onClick={() => setDialog('assemble')}>
                <PackageCheck className='mr-2 h-4 w-4' />
                {t('Complete assembly')}
              </Button>
            )}
            {canExecute && executable && !isAssembly && (
              <>
                <Button
                  variant='outline'
                  onClick={() => setDialog('issue')}
                  disabled={!order.materials.length}
                >
                  <PackageMinus className='mr-2 h-4 w-4' />
                  {t('Issue materials')}
                </Button>
                <Button onClick={() => setDialog('output')}>
                  <Factory className='mr-2 h-4 w-4' />
                  {t('Report output')}
                </Button>
              </>
            )}
            {canManage &&
              transitions.map((s) => (
                <Button
                  key={s}
                  variant={s === 'released' ? 'default' : 'secondary'}
                  disabled={changing}
                  onClick={() => move(s)}
                >
                  {isAssembly && s === 'in_production'
                    ? t('Resume assembly')
                    : t(TRANSITION_LABELS[s] || STATUS_META[s].label)}
                </Button>
              ))}
            {canManage && canComplete && (
              <Button variant='secondary' onClick={() => setDialog('complete')}>
                <CheckCircle2 className='mr-2 h-4 w-4' />
                {t('Complete')}
              </Button>
            )}
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
                  {canExecute && executable && wipLots.length > 0 && (
                    <DropdownMenuItem onClick={() => setDialog('return')}>
                      <Undo2 className='mr-2 h-4 w-4' />
                      {t('Return unused material')}
                    </DropdownMenuItem>
                  )}
                  {canExecute && order.status !== 'cancelled' && (
                    <DropdownMenuItem onClick={() => setDialog('scrap')}>
                      <Recycle className='mr-2 h-4 w-4' />
                      {t('Record scrap')}
                    </DropdownMenuItem>
                  )}
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
                  {canManage && allowed.includes('draft') && (
                    <DropdownMenuItem onClick={() => move('draft')}>
                      {t('Back to Draft')}
                    </DropdownMenuItem>
                  )}
                  {canManage && allowed.includes('cancelled') && (
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

        {order.status !== 'cancelled' && (
          <div className='bg-muted/30 flex items-center gap-1 overflow-x-auto border-t px-5 py-3 max-sm:px-4'>
            {lifecycle.map((step, i) => {
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
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full',
                        done
                          ? 'bg-emerald-500'
                          : current
                            ? 'bg-primary ring-primary/30 ring-4'
                            : 'bg-border'
                      )}
                    />
                    {current && order.status === 'paused'
                      ? t('Paused')
                      : t(statusLabel(step, order.orderType))}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Quantities: planned / produced / good / rejected / remaining */}
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5'>
        <Kpi
          label={t('Planned')}
          value={fmtQty(order.plannedQuantity)}
          unit={order.unit}
        />
        <Kpi
          label={t('Produced')}
          value={fmtQty(order.producedQuantity)}
          unit={order.unit}
          bar={(order.producedQuantity / order.plannedQuantity) * 100}
        />
        <Kpi
          label={t('Good')}
          value={fmtQty(order.completedQuantity)}
          unit={order.unit}
          tone='emerald'
          hint={
            order.reworkedGoodQuantity
              ? `${fmtQty(order.reworkedGoodQuantity)} ${t('after rework')}`
              : undefined
          }
        />
        <Kpi
          label={t('Rejected')}
          value={fmtQty(order.rejectedQuantity)}
          unit={order.unit}
          tone={order.rejectedQuantity ? 'rose' : undefined}
        />
        <Kpi
          label={t('Remaining')}
          value={fmtQty(remaining)}
          unit={order.unit}
          tone={remaining > 0 ? 'amber' : undefined}
        />
      </div>

      {/* Flow: stock → WIP → produced → QC → finished goods */}
      <Card>
        <CardContent className='[&>*]:bg-card bg-border grid grid-cols-2 gap-px overflow-hidden rounded-xl p-0 sm:grid-cols-4'>
          <FlowStage
            icon={Warehouse}
            title={t('Material issued')}
            value={formatMoney(order.materialCost)}
            sub={`${order.materials.filter((m) => lineRemaining(m) > EPS).length} ${t('line(s) still to issue')}`}
          />
          <FlowStage
            icon={Factory}
            title={t('In WIP')}
            value={formatMoney(wipValue)}
            sub={`${wipLots.length} ${t('lot(s)')} · ${order.wipLocation || t('production floor')}`}
            tone='amber'
          />
          <FlowStage
            icon={ClipboardCheck}
            title={t('Awaiting QC')}
            value={`${fmtQty(order.qcPendingQuantity)} ${order.unit}`}
            sub={
              order.reworkPendingQuantity > 0
                ? `${fmtQty(order.reworkPendingQuantity)} ${t('in rework')}`
                : t('Rework queue empty')
            }
            tone='sky'
          />
          <FlowStage
            icon={PackageCheck}
            title={t('Finished goods')}
            value={`${fmtQty(order.completedQuantity)} ${order.unit}`}
            sub={formatMoney(order.finishedGoodsValue)}
            tone='emerald'
          />
        </CardContent>
      </Card>

      {/* Work waiting on someone */}
      {((pendingOutputs?.results.length ?? 0) > 0 ||
        order.reworkPendingQuantity > EPS) && (
        <div className='grid gap-3 md:grid-cols-2'>
          {(pendingOutputs?.results.length ?? 0) > 0 && (
            <Card className='border-sky-500/40'>
              <CardHeader className='pb-2'>
                <CardTitle className='flex items-center gap-2 text-sm'>
                  <ClipboardCheck className='h-4 w-4 text-sky-600' />
                  {t('Waiting for quality inspection')}
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-2'>
                {pendingOutputs?.results.map((o) => (
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
                        onClick={() => setInspecting(o)}
                      >
                        {t('Inspect')}
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {order.reworkPendingQuantity > EPS && (
            <Card className='border-violet-500/40'>
              <CardHeader className='pb-2'>
                <CardTitle className='flex items-center gap-2 text-sm'>
                  <Wrench className='h-4 w-4 text-violet-600' />
                  {t('In rework')}
                </CardTitle>
              </CardHeader>
              <CardContent className='flex items-center gap-3 text-sm'>
                <span className='text-2xl font-semibold tabular-nums'>
                  {fmtQty(order.reworkPendingQuantity)}
                </span>
                <span className='text-muted-foreground'>{order.unit}</span>
                {canInspect && (
                  <Button
                    size='sm'
                    className='ml-auto'
                    variant='outline'
                    onClick={() => setDialog('rework')}
                  >
                    {t('Post rework result')}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]'>
        <Tabs defaultValue='materials' className='min-w-0'>
          <TabsList className='max-w-full overflow-x-auto'>
            <TabsTrigger value='materials'>
              {t('Materials')}
              {requirements && requirements.shortageCount > 0 && (
                <span className='ml-1.5 rounded-full bg-rose-500/15 px-1.5 text-[10px] font-semibold text-rose-600'>
                  {requirements.shortageCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value='wip'>
              {t('WIP')}
              {wipLots.length > 0 && (
                <span className='text-muted-foreground ml-1.5 text-[10px]'>
                  {wipLots.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value='outputs'>{t('Output & QC')}</TabsTrigger>
            <TabsTrigger value='issues'>{t('Issues & returns')}</TabsTrigger>
            <TabsTrigger value='receipts'>{t('Receipts')}</TabsTrigger>
            <TabsTrigger value='scrap'>{t('Scrap')}</TabsTrigger>
            <TabsTrigger value='movements'>{t('Stock ledger')}</TabsTrigger>
            <TabsTrigger value='trace'>{t('Traceability')}</TabsTrigger>
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
                  <>
                    <div className='flex justify-end border-b px-4 py-2'>
                      <ProgressLegend />
                    </div>
                    <div className='overflow-x-auto'>
                      <Table>
                        <TableHeader>
                          <TableRow className='bg-muted/40'>
                            <TableHead>{t('Material')}</TableHead>
                            <TableHead className='w-56'>
                              {t('Issued / required')}
                            </TableHead>
                            <TableHead className='text-right'>
                              {t('In WIP')}
                            </TableHead>
                            <TableHead className='text-right'>
                              {t('Consumed')}
                            </TableHead>
                            <TableHead className='text-right'>
                              {t('Remaining')}
                            </TableHead>
                            <TableHead className='text-right'>
                              {t('On hand')}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {order.materials.map((m) => {
                            const req = availableByLine.get(m._id)
                            const rem = lineRemaining(m)
                            const short = req && req.shortageQuantity > 0
                            return (
                              <TableRow key={m._id}>
                                <TableCell>
                                  <div
                                    className='flex flex-wrap items-center gap-1.5'
                                    style={{ paddingLeft: (m.level - 1) * 12 }}
                                  >
                                    <span className='font-medium'>
                                      {m.productName}
                                    </span>
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
                                </TableCell>
                                <TableCell>
                                  <MaterialProgress material={m} />
                                </TableCell>
                                <TableCell className='text-right tabular-nums'>
                                  {fmtQty(lineWip(m))}
                                </TableCell>
                                <TableCell className='text-muted-foreground text-right tabular-nums'>
                                  {fmtQty(m.consumedQuantity)}
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    'text-right font-medium tabular-nums',
                                    rem > EPS
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : 'text-emerald-600 dark:text-emerald-400'
                                  )}
                                >
                                  {rem > EPS ? fmtQty(rem) : '✓'}
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    'text-right tabular-nums',
                                    short
                                      ? 'font-medium text-rose-600 dark:text-rose-400'
                                      : 'text-muted-foreground'
                                  )}
                                >
                                  {req ? fmtQty(req.availableQuantity) : '—'}
                                  {short && (
                                    <div className='text-[10px]'>
                                      −{fmtQty(req!.shortageQuantity)}{' '}
                                      {t('short')}
                                    </div>
                                  )}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value='wip' className='mt-3'>
            <WipLotsTab order={order} />
          </TabsContent>
          <TabsContent value='outputs' className='mt-3'>
            <OutputsTab
              orderId={order.id}
              canInspect={canInspect}
              onInspect={setInspecting}
            />
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
          <TabsContent value='movements' className='mt-3'>
            <Card>
              <CardContent className='p-0'>
                <MovementsTable productionOrderId={order.id} />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value='trace' className='mt-3'>
            <OrderTraceTab orderId={order.id} />
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
                        <StatusBadge
                          status={h.to}
                          orderType={order.orderType}
                        />
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

        <div className='space-y-4'>
          <HierarchyCard order={order} canManage={canManage} />
          <Card className='h-fit'>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm'>{t('Locations')}</CardTitle>
              <CardDescription className='text-xs'>
                {t('Within this branch (the warehouse)')}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3 text-sm'>
              {[
                [t('Raw material source'), order.sourceLocation],
                [t('Work in progress'), order.wipLocation],
                [t('Finished goods'), order.finishedGoodsLocation],
              ].map(([label, value], i) => (
                <div key={label} className='flex items-start gap-2'>
                  <MapPin className='text-muted-foreground mt-0.5 h-3.5 w-3.5 shrink-0' />
                  <div>
                    <div className='text-muted-foreground text-xs'>{label}</div>
                    <div>{value || '—'}</div>
                  </div>
                  {i < 2 && (
                    <ArrowRight className='text-muted-foreground/50 ml-auto h-3.5 w-3.5' />
                  )}
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
      </div>

      {dialog === 'edit' && (
        <ProductionOrderDialog order={order} onClose={() => setDialog(null)} />
      )}
      {dialog === 'issue' && (
        <IssueMaterialsDialog order={order} onClose={() => setDialog(null)} />
      )}
      {dialog === 'return' && (
        <ReturnMaterialsDialog order={order} onClose={() => setDialog(null)} />
      )}
      {dialog === 'output' && (
        <ReportOutputDialog order={order} onClose={() => setDialog(null)} />
      )}
      {dialog === 'assemble' && (
        <ReportOutputDialog
          order={order}
          assembly
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'rework' && (
        <ReworkDialog order={order} onClose={() => setDialog(null)} />
      )}
      {dialog === 'complete' && (
        <CompleteOrderDialog order={order} onClose={() => setDialog(null)} />
      )}
      {dialog === 'scrap' && (
        <RecordScrapDialog order={order} onClose={() => setDialog(null)} />
      )}
      {inspecting && (
        <InspectOutputDialog
          order={order}
          output={inspecting}
          onClose={() => setInspecting(null)}
        />
      )}
    </div>
  )
}

function Kpi({
  label,
  value,
  unit,
  hint,
  tone,
  bar,
}: {
  label: string
  value: string
  unit?: string
  hint?: string
  tone?: 'emerald' | 'rose' | 'amber'
  bar?: number
}) {
  const color =
    tone === 'emerald'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'rose'
        ? 'text-rose-600 dark:text-rose-400'
        : tone === 'amber'
          ? 'text-amber-600 dark:text-amber-400'
          : ''
  return (
    <Card>
      <CardContent className='space-y-1.5 p-4'>
        <div className='text-muted-foreground text-xs'>{label}</div>
        <div className='flex items-baseline gap-1'>
          <span
            className={cn(
              'text-2xl font-semibold tracking-tight tabular-nums',
              color
            )}
          >
            {value}
          </span>
          {unit && (
            <span className='text-muted-foreground text-xs'>{unit}</span>
          )}
        </div>
        {bar !== undefined && (
          <div className='bg-muted h-1 overflow-hidden rounded-full'>
            <div
              className='bg-primary h-full rounded-full'
              style={{ width: `${Math.min(100, bar)}%` }}
            />
          </div>
        )}
        {hint && (
          <div className='text-muted-foreground text-[11px]'>{hint}</div>
        )}
      </CardContent>
    </Card>
  )
}

function FlowStage({
  icon: Icon,
  title,
  value,
  sub,
  tone,
}: {
  icon: React.ElementType
  title: string
  value: string
  sub: string
  tone?: 'amber' | 'sky' | 'emerald'
}) {
  const accent =
    tone === 'amber'
      ? 'bg-amber-500/10 text-amber-600'
      : tone === 'sky'
        ? 'bg-sky-500/10 text-sky-600'
        : tone === 'emerald'
          ? 'bg-emerald-500/10 text-emerald-600'
          : 'bg-muted text-muted-foreground'
  return (
    <div className='flex items-start gap-3 p-4'>
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          accent
        )}
      >
        <Icon className='h-4 w-4' />
      </div>
      <div className='min-w-0'>
        <div className='text-muted-foreground text-xs'>{title}</div>
        <div className='truncate font-semibold tabular-nums'>{value}</div>
        <div className='text-muted-foreground truncate text-[11px]'>{sub}</div>
      </div>
    </div>
  )
}

function WipLotsTab({ order }: { order: ProductionOrder }) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const lots = order.wipLots.filter((l) => l.quantity > EPS)
  if (!lots.length)
    return <EmptyLine text={t('Nothing is in WIP for this order.')} />
  return (
    <Card>
      <CardContent className='p-0'>
        <Table>
          <TableHeader>
            <TableRow className='bg-muted/40'>
              <TableHead>{t('Item')}</TableHead>
              <TableHead>{t('Batch / serials')}</TableHead>
              <TableHead className='text-right'>{t('Quantity')}</TableHead>
              <TableHead className='text-right'>{t('Value')}</TableHead>
              <TableHead>{t('Issued')}</TableHead>
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
                <TableCell className='text-xs'>
                  {l.batchNumber && (
                    <Badge variant='outline' className='font-mono text-[10px]'>
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
                <TableCell className='text-right tabular-nums'>
                  {formatMoney(l.quantity * (l.unitCost || 0))}
                </TableCell>
                <TableCell className='text-muted-foreground text-xs'>
                  {fmtDate(l.issuedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function OutputsTab({
  orderId,
  canInspect,
  onInspect,
}: {
  orderId: string
  canInspect: boolean
  onInspect: (o: ProductionOutput) => void
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { data } = useGetOutputsQuery({ productionOrderId: orderId, limit: 50 })
  if (data && !data.results.length)
    return <EmptyLine text={t('No output reported yet.')} />
  return (
    <Card>
      <CardContent className='p-0'>
        <Table>
          <TableHeader>
            <TableRow className='bg-muted/40'>
              <TableHead>{t('Output')}</TableHead>
              <TableHead className='text-right'>{t('Produced')}</TableHead>
              <TableHead className='text-right'>{t('Good')}</TableHead>
              <TableHead className='text-right'>{t('Rejected')}</TableHead>
              <TableHead className='text-right'>{t('Unit cost')}</TableHead>
              <TableHead>{t('QC')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.results.map((o) => (
              <TableRow key={o.id}>
                <TableCell>
                  <div className='font-mono text-xs font-medium'>
                    {o.outputNumber}
                  </div>
                  <div className='text-muted-foreground text-xs'>
                    {fmtDate(o.reportedAt)} · {refName(o.reportedBy) || '—'}
                  </div>
                </TableCell>
                <TableCell className='text-right tabular-nums'>
                  {fmtQty(o.producedQuantity)}
                </TableCell>
                <TableCell className='text-right text-emerald-600 tabular-nums dark:text-emerald-400'>
                  {o.status === 'inspected' ? fmtQty(o.goodQuantity) : '—'}
                </TableCell>
                <TableCell className='text-right tabular-nums'>
                  {o.status === 'inspected' ? (
                    <span
                      className={cn(
                        o.rejectedQuantity > 0 &&
                          'text-rose-600 dark:text-rose-400'
                      )}
                    >
                      {fmtQty(o.rejectedQuantity)}
                      {o.rejectDisposition && (
                        <span className='text-muted-foreground ml-1 text-[10px]'>
                          →{' '}
                          {t(
                            o.rejectDisposition === 'scrap' ? 'scrap' : 'rework'
                          )}
                        </span>
                      )}
                    </span>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className='text-right tabular-nums'>
                  {formatMoney(o.unitCost)}
                </TableCell>
                <TableCell>
                  {o.status === 'pending_qc' ? (
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
                        className='border-sky-500/30 bg-sky-500/10 text-sky-700'
                      >
                        {t('Pending')}
                      </Badge>
                    )
                  ) : (
                    <span className='text-muted-foreground text-xs'>
                      {t('Passed')} {fmtDate(o.inspectedAt)} ·{' '}
                      {refName(o.inspectedBy) || '—'}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
              {issue.kind === 'return' ? (
                <Undo2 className='h-4 w-4 text-sky-600' />
              ) : (
                <PackagePlus className='h-4 w-4 text-amber-600' />
              )}
              <span className='font-mono text-xs'>{issue.issueNumber}</span>
              <Badge variant='outline' className='text-[10px]'>
                {issue.kind === 'return' ? t('Return') : t('Issue')}
              </Badge>
              {issue.isOverIssue && (
                <Badge
                  variant='outline'
                  className='border-violet-500/30 text-[10px] text-violet-700'
                >
                  {t('Over-issue')}
                </Badge>
              )}
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
                    {line.batchNumber && (
                      <span className='text-muted-foreground ml-1 font-mono text-xs'>
                        · {line.batchNumber}
                      </span>
                    )}
                    {line.serialNumbers?.length ? (
                      <span className='text-muted-foreground ml-1 font-mono text-xs'>
                        · {line.serialNumbers.join(', ')}
                      </span>
                    ) : null}
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
    return <EmptyLine text={t('No finished goods received yet.')} />
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
            {r.source === 'rework' && (
              <Badge variant='outline' className='text-[10px]'>
                {t('from rework')}
              </Badge>
            )}
            {r.batchNumber && (
              <Badge variant='outline' className='font-mono text-[10px]'>
                {r.batchNumber}
              </Badge>
            )}
            <span className='text-muted-foreground'>{r.location}</span>
            <span className='ml-auto tabular-nums'>
              +{fmtQty(r.quantity)} {r.unit}
            </span>
            <span className='text-muted-foreground w-24 text-right tabular-nums'>
              {formatMoney(r.totalCost)}
            </span>
            {r.serialNumbers?.length ? (
              <div className='text-muted-foreground w-full font-mono text-[11px]'>
                {r.serialNumbers.join(', ')}
              </div>
            ) : null}
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

function OrderTraceTab({ orderId }: { orderId: string }) {
  const { t } = useLanguage()
  const { data, isLoading, error } = useTraceOrderQuery(orderId)
  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='text-sm'>{t('Genealogy')}</CardTitle>
        <CardDescription className='text-xs'>
          {t(
            'What this order produced, the components it consumed, their batches and serials, and the supplier or sub-assembly order each came from.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className='h-40 w-full' />
        ) : data ? (
          <TraceTree node={data} />
        ) : (
          <EmptyLine text={getErrorMessage(error, t('No trace available'))} />
        )}
      </CardContent>
    </Card>
  )
}

function TreeRow({
  node,
  current,
  depth,
}: {
  node: OrderTreeNode
  current: string
  depth: number
}) {
  const isCurrent = node.id === current
  return (
    <>
      <div
        className={cn(
          'flex items-center gap-2 rounded-md px-1.5 py-1 text-xs',
          isCurrent && 'bg-primary/5 ring-primary/20 ring-1'
        )}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
      >
        {node.orderType === 'assembly' ? (
          <Layers className='h-3.5 w-3.5 shrink-0 text-violet-600' />
        ) : (
          <Factory className='text-primary h-3.5 w-3.5 shrink-0' />
        )}
        <div className='min-w-0 flex-1'>
          {isCurrent ? (
            <span className='font-mono font-semibold'>{node.orderNumber}</span>
          ) : (
            <Link
              to={orderPath(node) as never}
              className='font-mono font-medium hover:underline'
            >
              {node.orderNumber}
            </Link>
          )}
          <div className='text-muted-foreground truncate'>
            {node.productName} · {fmtQty(node.plannedQuantity)} {node.unit}
          </div>
        </div>
        <StatusBadge
          status={node.status}
          orderType={node.orderType}
          className='h-5 px-1.5 text-[10px]'
        />
      </div>
      {node.children?.map((c) => (
        <TreeRow key={c.id} node={c} current={current} depth={depth + 1} />
      ))}
    </>
  )
}

/** Parent chain and nested sub-assembly orders, with one-click creation of missing ones. */
function HierarchyCard({
  order,
  canManage,
}: {
  order: ProductionOrder
  canManage: boolean
}) {
  const { t } = useLanguage()
  const { data: tree } = useGetOrderTreeQuery(order.id)
  const [createSubs, { isLoading }] = useCreateSubAssembliesMutation()
  const open = !['completed', 'cancelled'].includes(order.status)

  const create = async (recursive: boolean) => {
    try {
      const created = await createSubs({
        orderId: order.id,
        recursive,
      }).unwrap()
      if (!created.length) {
        toast.info(
          t(
            'Nothing to create — sub-assemblies are in stock or already on order'
          )
        )
      } else {
        toast.success(
          t('{{n}} sub-assembly order(s) created').replace(
            '{{n}}',
            String(created.length)
          )
        )
      }
    } catch (err) {
      toast.error(
        getErrorMessage(err, t('Could not create sub-assembly orders'))
      )
    }
  }

  if (!tree) return null
  const hasTree =
    tree.ancestors.length > 0 || (tree.order.children?.length || 0) > 0
  if (!hasTree && !(canManage && open)) return null

  // Ancestors arrive root-first: root → … → this order → its children.
  const chain = tree.ancestors
  return (
    <Card className='h-fit'>
      <CardHeader className='pb-2'>
        <CardTitle className='flex items-center gap-1.5 text-sm'>
          <GitBranch className='h-4 w-4' />
          {t('Assembly structure')}
        </CardTitle>
        <CardDescription className='text-xs'>
          {t('Parent orders and the sub-assembly orders that feed this one')}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        {hasTree ? (
          <div className='space-y-0.5'>
            {chain.map((a, i) => (
              <TreeRow
                key={a.id}
                node={{ ...a, children: [] }}
                current={order.id}
                depth={i}
              />
            ))}
            <TreeRow
              node={tree.order}
              current={order.id}
              depth={chain.length}
            />
          </div>
        ) : (
          <p className='text-muted-foreground text-xs'>
            {t('No linked parent or sub-assembly orders.')}
          </p>
        )}
        {canManage && open && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant='outline'
                size='sm'
                className='w-full'
                disabled={isLoading}
              >
                <Layers className='mr-2 h-3.5 w-3.5' />
                {t('Create sub-assembly orders')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-64'>
              <DropdownMenuItem onClick={() => create(false)}>
                <div>
                  <div>{t('Direct sub-assemblies')}</div>
                  <div className='text-muted-foreground text-xs'>
                    {t('One level, for components short in stock')}
                  </div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => create(true)}>
                <div>
                  <div>{t('Full nested chain')}</div>
                  <div className='text-muted-foreground text-xs'>
                    {t('Every level down to raw materials')}
                  </div>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
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
