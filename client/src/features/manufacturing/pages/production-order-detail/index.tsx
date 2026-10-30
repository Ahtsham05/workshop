import { useEffect, useState } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useSearch,
} from '@tanstack/react-router'
import {
  ArrowLeft,
  CheckCircle2,
  Factory,
  Layers,
  MoreHorizontal,
  PackageCheck,
  PackageMinus,
  Pencil,
  Play,
  Printer,
  Recycle,
  RefreshCw,
  RotateCcw,
  Trash2,
  Undo2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  useChangeProductionStatusMutation,
  useDeleteProductionOrderMutation,
  useGetManufacturingSettingsQuery,
  useGetOrderRequirementsQuery,
  useGetOutputsQuery,
  useGetProductionOrderQuery,
  useRefreshProductionMaterialsMutation,
  useStartAssemblyMutation,
  type ProductionOutput,
  type ProductionStatus,
} from '@/stores/manufacturing.api'
import { getErrorMessage } from '@/lib/get-error-message'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useBranchName } from '@/hooks/use-branch-name'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BatchBadge, StatusBadge } from '../../components/badges'
import {
  CompleteOrderDialog,
  InspectOutputDialog,
  ReportOutputDialog,
  ReturnMaterialsDialog,
  ReworkDialog,
} from '../../components/execution-dialogs'
import { ProductionOrderDialog } from '../../components/production-order-dialog'
import { ReceiveFinishedGoodsDialog } from '../../components/receive-finished-goods-dialog'
import type { ReceiptPrefill } from '../../lib/use-finished-goods-receipt'
import { RecordScrapDialog } from '../../components/record-scrap-dialog'
import { ReverseOutputDialog } from '../../components/reverse-output-dialog'
import { useConfirm } from '../../lib/confirm'
import {
  PRIORITY_META,
  STATUS_META,
  TRANSITION_LABELS,
  fmtQty,
  orderPath,
  statusLabel,
  transitionsFor,
} from '../../lib/constants'
import { printJobCard } from '../../lib/job-card-print'
import { lineRemaining } from '../../lib/material-math'
import { ActivityTab } from './activity-tab'
import { AssembliesTab } from './assemblies-tab'
import { CostsTab } from './costs-tab'
import {
  EPS,
  completionPct,
  isDetailTab,
  remainingQty,
  type DetailTab,
} from './detail-utils'
import { DocumentsTab } from './documents-tab'
import { MaterialsTab } from './materials-tab'
import { OperationsTab } from './operations-tab'
import { OverviewTab } from './overview-tab'
import { QualityTab } from './quality-tab'
import { ScrapTab } from './scrap-tab'
import { WipTab } from './wip-tab'

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

export type DialogKind =
  | 'edit'
  | 'issue'
  | 'return'
  | 'output'
  | 'rework'
  | 'complete'
  | 'scrap'
  | 'assemble'
  | 'receive'

const TAB_LABELS: Record<DetailTab, string> = {
  overview: 'Overview',
  materials: 'Materials',
  operations: 'Operations',
  assemblies: 'Assemblies',
  wip: 'WIP',
  quality: 'Quality',
  scrap: 'Scrap',
  costs: 'Costs',
  documents: 'Documents',
  activity: 'Activity',
}

export default function ProductionOrderDetail({
  orderId,
}: {
  orderId: string
}) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const branchName = useBranchName()
  const { hasPermission } = usePermissions()
  const canManage = hasPermission('manageProductionOrders')
  // One permission per shop-floor task (Roles & Permissions → Manufacturing).
  const canExecute = hasPermission('executeProduction')
  const canIssue = hasPermission('issueMaterials')
  const canReceive = hasPermission('receiveFinishedGoods')
  const canScrap = hasPermission('recordScrap')
  const canInspect = hasPermission('inspectProduction')

  const {
    data: order,
    isLoading,
    error,
    refetch: refetchOrder,
  } = useGetProductionOrderQuery(orderId)
  const { data: requirements } = useGetOrderRequirementsQuery(orderId)
  const { data: settings } = useGetManufacturingSettingsQuery()
  const [changeStatus, { isLoading: changing }] =
    useChangeProductionStatusMutation()
  const [refreshMaterials] = useRefreshProductionMaterialsMutation()
  const [startAssemblyMutation, { isLoading: starting }] =
    useStartAssemblyMutation()
  const [deleteOrder] = useDeleteProductionOrderMutation()
  const confirm = useConfirm()
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const [inspecting, setInspecting] = useState<ProductionOutput | null>(null)
  // Filled in by "Reverse & receive again": the reversed receipt's quantity and packs.
  const [receivePrefill, setReceivePrefill] = useState<ReceiptPrefill | undefined>(undefined)
  const [reversing, setReversing] = useState<{
    output: ProductionOutput
    intent: 'correct' | 'reverse'
  } | null>(null)

  // The open tab lives in the URL (?tab=…) so it survives reloads and can be linked.
  const search = useSearch({ strict: false }) as {
    tab?: string
    reverse?: string
  }
  // Costs is its own tab only for roles that may see manufacturing costs.
  const canSeeCosts = hasPermission('viewManufacturingCosts')
  const tab: DetailTab =
    isDetailTab(search.tab) && (search.tab !== 'costs' || canSeeCosts)
      ? search.tab
      : 'overview'
  const setTab = (next: string) =>
    navigate({
      to: '.' as never,
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        tab: next === 'overview' ? undefined : next,
      })) as never,
      replace: true,
    })

  const pathname = useLocation({ select: (l) => l.pathname })
  // Links that only know an order id land on /production-orders/…; keep assembly
  // orders on their own section so the rail and back link stay correct.
  const canonical = order ? orderPath(order) : null
  useEffect(() => {
    // Only fix THIS order's URL when it's under the wrong section. While the user is
    // leaving (a link, the back button) the pathname briefly points elsewhere with this
    // page still mounted — redirecting then would trap them on the order.
    const isThisOrdersPage =
      !!order &&
      /^\/manufacturing\/(production|assembly)-orders\/[^/]+$/.test(pathname) &&
      pathname.endsWith(`/${order.id}`)
    if (canonical && isThisOrdersPage && pathname !== canonical) {
      navigate({
        to: canonical as never,
        search: { tab: search.tab } as never,
        replace: true,
      })
    }
  }, [canonical, pathname, navigate, search.tab, order])

  // ?reverse=<outputId>: open that receipt's Reverse dialog once, on the Quality tab.
  const reverseId = search.reverse
  const { data: outputsToReverse } = useGetOutputsQuery(
    { productionOrderId: orderId, limit: 100 },
    { skip: !reverseId }
  )
  useEffect(() => {
    if (!reverseId || !outputsToReverse) return
    const output = outputsToReverse.results.find((o) => o.id === reverseId)
    if (output && output.status !== 'reversed')
      setReversing({ output, intent: 'reverse' })
    navigate({
      to: '.' as never,
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        reverse: undefined,
        tab: 'quality',
      })) as never,
      replace: true,
    })
  }, [reverseId, outputsToReverse, navigate])

  if (isLoading) return <Skeleton className='h-96 w-full rounded-xl' />
  if (!order) {
    return (
      <div className='text-muted-foreground rounded-xl border p-10 text-center text-sm'>
        {getErrorMessage(error, t('Production order not found'))}
      </div>
    )
  }

  const executable = EXECUTABLE.includes(order.status)
  // Material lines with something still to issue (badge on "Issue materials").
  const openMaterialLines = order.materials.filter(
    (m) => !m.isOptional && lineRemaining(m) > 1e-6
  ).length
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
  // Mirrors the server: a started order whose issues/receipts were all reversed is empty
  // again and can be cancelled.
  const emptyStarted =
    !isAssembly &&
    ['in_production', 'paused'].includes(order.status) &&
    !order.materials.some((m) => m.issuedQuantity > 0) &&
    !(order.producedQuantity > 0) &&
    !(order.completedQuantity > 0) &&
    !order.wipLots.length
  const canCancel = allowed.includes('cancelled') || emptyStarted
  const canStartAssembly = isAssembly && order.status === 'released'
  const canCompleteAssembly =
    isAssembly &&
    ['in_production', 'paused'].includes(order.status) &&
    order.producedQuantity < order.plannedQuantity
  const wipLotCount = order.wipLots.filter((l) => l.quantity > EPS).length
  const qualityChecks = settings?.requireQualityCheck !== false

  const move = async (status: ProductionStatus) => {
    if (
      status === 'cancelled' &&
      !(await confirm({
        title: isAssembly
          ? t('Cancel this assembly order?')
          : t('Cancel this production order?'),
        description: t(
          'The order stops here and can no longer be executed. Stock already moved stays in the ledger.'
        ),
        confirmText: t('Cancel order'),
        cancelText: t('Keep order'),
        destructive: true,
      }))
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

  const pct = completionPct(order)
  const awaitingPct =
    order.plannedQuantity > 0
      ? Math.min(
          100 - pct,
          ((order.qcPendingQuantity + order.reworkPendingQuantity) /
            order.plannedQuantity) *
            100
        )
      : 0
  const remaining = remainingQty(order)
  const shortCount = requirements?.netShortageCount ?? 0
  const pendingQc = order.qcPendingQuantity > EPS
  const docCount = order.documents?.length ?? 0
  const opsTotal = order.operations?.length ?? 0
  const opsDone =
    order.operations?.filter((o) => ['completed', 'skipped'].includes(o.status))
      .length ?? 0

  const tabBadge: Partial<Record<DetailTab, React.ReactNode>> = {
    materials: shortCount > 0 && (
      <span className='ml-1.5 rounded-full bg-rose-500/15 px-1.5 text-[10px] font-semibold text-rose-700 dark:text-rose-400'>
        {shortCount}
      </span>
    ),
    operations: opsTotal > 0 && (
      <span className='text-muted-foreground ml-1.5 text-[10px] tabular-nums'>
        {opsDone}/{opsTotal}
      </span>
    ),
    wip: wipLotCount > 0 && (
      <span className='text-muted-foreground ml-1.5 text-[10px]'>
        {wipLotCount}
      </span>
    ),
    quality: pendingQc && (
      <span className='ml-1.5 rounded-full bg-sky-500/15 px-1.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300'>
        {fmtQty(order.qcPendingQuantity)}
      </span>
    ),
    documents: docCount > 0 && (
      <span className='text-muted-foreground ml-1.5 text-[10px]'>
        {docCount}
      </span>
    ),
  }

  return (
    <div className='space-y-4'>
      <nav
        aria-label={t('Breadcrumb')}
        className='text-muted-foreground flex items-center gap-1.5 text-sm'
      >
        <Link
          to={
            (isAssembly
              ? '/manufacturing/assembly-orders'
              : '/manufacturing/production-orders') as never
          }
          className='hover:text-foreground inline-flex items-center gap-1'
        >
          <ArrowLeft className='h-3.5 w-3.5' aria-hidden />
          {isAssembly ? t('Assembly orders') : t('Production orders')}
        </Link>
        <span aria-hidden>/</span>
        <span className='text-foreground font-mono text-xs' aria-current='page'>
          {order.orderNumber}
        </span>
      </nav>

      {/* Header: number, product, status, priority, progress, actions */}
      <Card className='gap-0 overflow-hidden py-0'>
        <div className='flex flex-wrap items-start gap-4 p-5 max-sm:p-4'>
          <div className='min-w-0 flex-1'>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='font-mono text-sm font-semibold tracking-tight'>
                {order.orderNumber}
              </span>
              <BatchBadge
                batchNumber={order.batchNumber || order.orderNumber}
                title={t('Finished-goods batch')}
              />
              {isAssembly && (
                <Badge variant='outline' className='gap-1 font-normal'>
                  <Layers className='h-3 w-3' />
                  {t('Assembly')}
                </Badge>
              )}
            </div>
            <h1 className='mt-1 text-2xl font-semibold tracking-tight max-sm:text-xl'>
              {order.productName}
            </h1>
            <dl className='mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm'>
              <div className='flex items-center gap-2'>
                <dt className='text-muted-foreground'>{t('Status')}</dt>
                <dd>
                  <StatusBadge
                    status={order.status}
                    orderType={order.orderType}
                  />
                </dd>
              </div>
              <div className='flex items-center gap-2'>
                <dt className='text-muted-foreground'>{t('Priority')}</dt>
                <dd
                  className={cn(
                    'font-medium',
                    PRIORITY_META[order.priority].className
                  )}
                >
                  {t(PRIORITY_META[order.priority].label)}
                </dd>
              </div>
              {order.bomNumber && (
                <div className='flex items-center gap-2'>
                  <dt className='text-muted-foreground'>{t('BOM')}</dt>
                  <dd>
                    <Link
                      to={'/manufacturing/boms' as never}
                      search={{ bomId: order.bomId } as never}
                      className='font-mono text-xs hover:underline'
                    >
                      {order.bomNumber} v{order.bomVersion}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
          </div>
          <div className='flex flex-wrap items-center gap-2 max-sm:w-full max-sm:[&>button:not([aria-label])]:flex-1'>
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
            {(canIssue || canReceive) && executable && !isAssembly && (
              <>
                {/* The full voucher, loaded with what this order still needs. */}
                {canIssue && (
                  <Button
                    asChild
                    variant='outline'
                    disabled={!order.materials.length}
                  >
                    <Link
                      to={'/manufacturing/material-issues/new' as never}
                      search={{ orderId: order.id } as never}
                    >
                      <PackageMinus className='mr-2 h-4 w-4' />
                      {t('Issue materials')}
                      {openMaterialLines > 0 && (
                        <span className='ml-1.5 rounded-full bg-amber-500/15 px-1.5 text-[11px] font-semibold text-amber-700 tabular-nums dark:text-amber-300'>
                          {openMaterialLines}
                        </span>
                      )}
                    </Link>
                  </Button>
                )}
                {canReceive && (
                  <Button onClick={() => setDialog('receive')}>
                    <Factory className='mr-2 h-4 w-4' />
                    {t('Receive finished goods')}
                  </Button>
                )}
              </>
            )}
            {canManage &&
              transitions.map((s) => (
                <Button
                  key={s}
                  variant={s === 'released' ? 'default' : 'outline'}
                  disabled={changing}
                  onClick={() => move(s)}
                >
                  {isAssembly && s === 'in_production'
                    ? t('Resume assembly')
                    : t(TRANSITION_LABELS[s] || STATUS_META[s].label)}
                </Button>
              ))}
            {canManage && canComplete && (
              <Button variant='outline' onClick={() => setDialog('complete')}>
                <CheckCircle2 className='mr-2 h-4 w-4' />
                {t('Complete')}
              </Button>
            )}
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
                <DropdownMenuItem
                  onClick={() => {
                    if (!printJobCard(order, { branchName, t }))
                      toast.error(
                        t('Allow pop-ups for this site to print the job card')
                      )
                  }}
                >
                  <Printer className='mr-2 h-4 w-4' />
                  {t('Print job card')}
                </DropdownMenuItem>
                {canIssue && executable && wipLotCount > 0 && (
                  <DropdownMenuItem onClick={() => setDialog('return')}>
                    <Undo2 className='mr-2 h-4 w-4' />
                    {t('Return unused material')}
                  </DropdownMenuItem>
                )}
                {canReceive &&
                  !isAssembly &&
                  ['in_production', 'paused', 'completed'].includes(
                    order.status
                  ) &&
                  order.producedQuantity > 0 && (
                    <DropdownMenuItem onClick={() => setTab('quality')}>
                      <RotateCcw className='mr-2 h-4 w-4' />
                      {t('Reverse or correct a receipt')}
                    </DropdownMenuItem>
                  )}
                {canScrap && order.status !== 'cancelled' && (
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
                          toast.success(
                            t('Materials and routing refreshed from the BOM')
                          )
                        } catch (err) {
                          toast.error(getErrorMessage(err, t('Refresh failed')))
                        }
                      }}
                    >
                      <RefreshCw className='mr-2 h-4 w-4' />
                      {t('Refresh from BOM')}
                    </DropdownMenuItem>
                  )}
                {canManage && allowed.includes('draft') && (
                  <DropdownMenuItem onClick={() => move('draft')}>
                    {t('Back to Draft')}
                  </DropdownMenuItem>
                )}
                {canManage && canCancel && (
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
                  ['draft', 'planned', 'cancelled'].includes(order.status) && (
                    <DropdownMenuItem
                      className='text-destructive'
                      onClick={async () => {
                        const ok = await confirm({
                          title: t('Delete {{n}}?').replace(
                            '{{n}}',
                            order.orderNumber
                          ),
                          description: t(
                            'The order is removed permanently. This cannot be undone.'
                          ),
                          confirmText: t('Delete'),
                          destructive: true,
                        })
                        if (!ok) return
                        try {
                          await deleteOrder(order.id).unwrap()
                          toast.success(t('Production order deleted'))
                          navigate({
                            to: (isAssembly
                              ? '/manufacturing/assembly-orders'
                              : '/manufacturing/production-orders') as never,
                          })
                        } catch (err) {
                          toast.error(getErrorMessage(err, t('Delete failed')))
                        }
                      }}
                    >
                      <Trash2 className='mr-2 h-4 w-4' />
                      {t('Delete')}
                    </DropdownMenuItem>
                  )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Progress — good units against plan, with output still in QC / rework shaded */}
        <div className='px-5 pb-5 max-sm:px-4 max-sm:pb-4'>
          <div className='flex items-end justify-between gap-3'>
            <div className='text-sm'>
              <span className='text-2xl font-semibold tracking-tight tabular-nums'>
                {pct}%
              </span>{' '}
              <span className='text-muted-foreground'>{t('complete')}</span>
            </div>
            <div className='text-muted-foreground text-right text-xs tabular-nums'>
              {fmtQty(order.completedQuantity)} {t('of')}{' '}
              {fmtQty(order.plannedQuantity)} {order.unit} {t('good')}
              {order.qcPendingQuantity + order.reworkPendingQuantity > EPS && (
                <>
                  {' · '}
                  {fmtQty(
                    order.qcPendingQuantity + order.reworkPendingQuantity
                  )}{' '}
                  {t('in QC / rework')}
                </>
              )}
              {remaining > EPS && order.status !== 'cancelled' && (
                <>
                  {' · '}
                  {fmtQty(remaining)} {t('to produce')}
                </>
              )}
            </div>
          </div>
          <div
            className='bg-muted mt-2 flex h-3 w-full overflow-hidden rounded-full'
            role='progressbar'
            aria-label={t('Order progress')}
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={`${pct}% ${t('complete')}`}
          >
            <div
              className={cn(
                'h-full transition-all',
                order.status === 'completed' ? 'bg-emerald-600' : 'bg-primary'
              )}
              style={{ width: `${pct}%` }}
            />
            {awaitingPct > 0 && (
              <div
                className='bg-primary/30 h-full'
                style={{ width: `${awaitingPct}%` }}
                title={t('Produced, waiting for QC or rework')}
              />
            )}
          </div>
        </div>

        {order.status !== 'cancelled' && (
          <div
            className='bg-muted/30 flex items-center gap-1 overflow-x-auto border-t px-5 py-3 [scrollbar-width:none] max-sm:px-4'
            aria-label={t('Order lifecycle')}
          >
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

      <Tabs value={tab} onValueChange={setTab} className='min-w-0'>
        <div className='-mx-1 overflow-x-auto px-1 [scrollbar-width:none]'>
          <TabsList className='w-max'>
            {(Object.keys(TAB_LABELS) as DetailTab[])
              .filter((key) => key !== 'costs' || canSeeCosts)
              .map((key) => (
                <TabsTrigger key={key} value={key}>
                  {t(TAB_LABELS[key])}
                  {tabBadge[key]}
                </TabsTrigger>
              ))}
          </TabsList>
        </div>

        <TabsContent value='overview' className='mt-3'>
          <OverviewTab
            order={order}
            requirements={requirements}
            branchName={branchName}
            qualityChecks={qualityChecks}
            canInspect={canInspect}
            onInspect={setInspecting}
            onDialog={setDialog}
            onTab={setTab}
          />
        </TabsContent>
        <TabsContent value='materials' className='mt-3'>
          <MaterialsTab
            order={order}
            requirements={requirements}
            canIssue={canIssue && executable && !isAssembly}
          />
        </TabsContent>
        <TabsContent value='operations' className='mt-3'>
          <OperationsTab
            order={order}
            qualityChecks={qualityChecks}
            canManage={canManage}
            canExecute={canExecute || canManage}
          />
        </TabsContent>
        <TabsContent value='assemblies' className='mt-3'>
          <AssembliesTab order={order} canManage={canManage} />
        </TabsContent>
        <TabsContent value='wip' className='mt-3'>
          <WipTab
            order={order}
            canReturn={canIssue && executable && wipLotCount > 0}
            onReturn={() => setDialog('return')}
          />
        </TabsContent>
        <TabsContent value='quality' className='mt-3'>
          <QualityTab
            order={order}
            qualityChecks={qualityChecks}
            canInspect={canInspect}
            onInspect={setInspecting}
            onRework={() => setDialog('rework')}
            canReverse={
              canReceive &&
              !isAssembly &&
              ['in_production', 'paused', 'completed'].includes(order.status)
            }
            onReverse={(output, intent) => setReversing({ output, intent })}
          />
        </TabsContent>
        <TabsContent value='scrap' className='mt-3'>
          <ScrapTab
            order={order}
            canRecord={canScrap && order.status !== 'cancelled'}
            onRecord={() => setDialog('scrap')}
          />
        </TabsContent>
        {canSeeCosts && (
          <TabsContent value='costs' className='mt-3'>
            <CostsTab order={order} />
          </TabsContent>
        )}
        <TabsContent value='documents' className='mt-3'>
          <DocumentsTab
            order={order}
            canAttach={canManage || canExecute}
            canManage={canManage}
            branchName={branchName}
          />
        </TabsContent>
        <TabsContent value='activity' className='mt-3'>
          <ActivityTab order={order} />
        </TabsContent>
      </Tabs>

      {dialog === 'edit' && (
        <ProductionOrderDialog order={order} onClose={() => setDialog(null)} />
      )}
      {dialog === 'return' && (
        <ReturnMaterialsDialog order={order} onClose={() => setDialog(null)} />
      )}
      {dialog === 'assemble' && (
        <ReportOutputDialog
          order={order}
          assembly
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'receive' && (
        <ReceiveFinishedGoodsDialog
          order={order}
          prefill={receivePrefill}
          onClose={() => {
            setDialog(null)
            setReceivePrefill(undefined)
          }}
          onInspect={setInspecting}
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
      {reversing && (
        <ReverseOutputDialog
          order={order}
          output={reversing.output}
          initialReason={
            reversing.intent === 'correct'
              ? ('wrong_quantity' as const)
              : undefined
          }
          canReopen={canManage}
          onClose={() => setReversing(null)}
          onReceiveAgain={async (prefill) => {
            // Open the receipt on the reopened order, with its WIP restored and the
            // reversed receipt's packs filled in.
            await refetchOrder()
            setReceivePrefill(prefill)
            setDialog('receive')
          }}
        />
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
