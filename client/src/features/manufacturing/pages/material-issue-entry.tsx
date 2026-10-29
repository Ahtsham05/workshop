import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardList,
  Eraser,
  Factory,
  Layers,
  Pencil,
  Trash2,
  Undo2,
  PackagePlus,
  PackageCheck,
  Printer,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { useDispatch } from 'react-redux'
import { toast } from 'sonner'
import {
  manufacturingApi,
  useBatchUnbatchedStockMutation,
  useGetIssueOptionsQuery,
  useGetMaterialIssueQuery,
  useGetOrderRequirementsQuery,
  useGetMaterialIssueReversalQuery,
  useEditMaterialIssueMutation,
  useGetOperatorsQuery,
  useGetProductionOrdersQuery,
  useGetManufacturingProductsQuery,
  useGetPendingMaterialsQuery,
  usePostMaterialIssueByMaterialMutation,
  useLazyGetMaterialIssuePlanQuery,
  usePostMaterialIssueMutation,
  type IssueVoucherBody,
  type IssueVoucherCheck,
  type IssueWarningCode,
  type MaterialIssue,
  type ManufacturingProduct,
  type PendingMaterial,
  type ProductType,
  type MaterialIssuePlan,
  type IssueReversalPreview,
  type RequirementLine,
} from '@/stores/manufacturing.api'
import type { AppDispatch } from '@/stores/store'
import { toBusinessCalendarDate } from '@/lib/business-timezone'
import { useCanViewManufacturingCosts } from '@/lib/cost-visibility'
import { getErrorMessage } from '@/lib/get-error-message'
import { getUnitLabel } from '@/lib/units'
import { cn } from '@/lib/utils'
import { useCurrentUser } from '@/context/auth-context'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useBranchName } from '@/hooks/use-branch-name'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  TransactionEntry,
  allocationFields,
  rowErrorsFromApi,
  useCatalogProductSource,
  useCatalogStockSource,
  type EntryProduct,
  type EntryStore,
  type HeaderField,
  type SaveMode,
} from '@/components/transaction-engine'
import { useFormatMoney } from '@/features/manufacturing/lib/use-mfg-money'
import { DeleteIssueDialog } from '../components/delete-issue-dialog'
import { PageHeader } from '../components/page'
import { ProductPicker } from '../components/product-picker'
import { useConfirm } from '../lib/confirm'
import {
  BUILDABLE_PRODUCT_TYPES,
  PRODUCT_TYPE_META,
  fmtDate,
  fmtQty,
  orderPath,
} from '../lib/constants'
import {
  blankIssueRow,
  createIssueConfig,
  lockRows,
  pendingOf,
  pendingProducts,
  orderMaterialProducts,
  orderMaterialSource,
  orderStockSource,
  withBatchCredit,
  requirementRows,
  rowFromProduct,
  rowStatus,
  rowToLine,
  rowsToIssue,
  suggestedQty,
  toneClass,
  type IssueHeader,
  type IssueMode,
  type IssueRow,
} from '../lib/material-issue'
import { printMaterialIssue } from '../lib/material-issue-print'

const LIST = '/manufacturing/material-issues'
const EXECUTABLE = 'released,in_production,paused'

const PERMISSION_LABEL: Record<string, string> = {
  overIssueMaterials: 'Over-issue materials',
  manageManufacturingSettings: 'Manufacturing settings (supervisor)',
  executeProduction: 'Run production steps',
  issueMaterials: 'Issue materials',
}
const CODE_LABEL: Record<IssueWarningCode, string> = {
  exceeds_remaining: 'More than required',
  expired_batch: 'Expired batch',
  insufficient_stock: 'Stock goes negative',
}

type Warning = IssueVoucherCheck['warnings'][number] & {
  /** "Row 2 · Blade Set" — where it is on screen (`line` counts posted rows only). */
  where?: string
}

/**
 * MIV — Material Issue Voucher. New: pick a production order, its open materials load
 * as rows (issue = what's needed, capped at stock), adjust, post. Posted: read-only view
 * with print. Built on the shared transaction engine; posting is one server transaction.
 */
export default function MaterialIssueEntryPage({
  issueId,
  orderId: initialOrderId,
  edit,
}: {
  issueId?: string
  orderId?: string
  /** With issueId: edit that posted voucher. */
  edit?: boolean
}) {
  if (issueId && edit) return <IssueEditLoader issueId={issueId} />
  if (issueId) return <IssueView issueId={issueId} />
  return <IssueEntry initialOrderId={initialOrderId} />
}

/** Editing a posted voucher: the voucher, its order's lines and whether it is locked. */
type EditContext = {
  issue: MaterialIssue
  /** The order's lines as if this voucher were reversed (its quantities open again). */
  lines: RequirementLine[]
  /** Material of it already used / scrapped / returned — rows can't change then. */
  locked: IssueReversalPreview['lines']
}

function IssueEditLoader({ issueId }: { issueId: string }) {
  const { t } = useLanguage()
  const { data: issue, error } = useGetMaterialIssueQuery(issueId, {
    refetchOnMountOrArgChange: true,
  })
  const { data: reqs } = useGetOrderRequirementsQuery(
    issue?.productionOrderId as string,
    { skip: !issue, refetchOnMountOrArgChange: true }
  )
  const { data: preview } = useGetMaterialIssueReversalQuery(issueId, {
    refetchOnMountOrArgChange: true,
  })
  const ctx = useMemo<EditContext | null>(() => {
    if (!issue || !reqs || !preview) return null
    const credited = new Map<string, number>()
    const units = new Map<string, number>()
    issue.lines.forEach((l) => {
      credited.set(
        l.materialLineId,
        (credited.get(l.materialLineId) || 0) + (l.creditedQuantity || 0)
      )
      if (!l.isAlternative)
        units.set(
          l.materialLineId,
          (units.get(l.materialLineId) || 0) + l.quantity
        )
    })
    return {
      issue,
      locked: preview.lines.filter((l) => l.gone > 1e-9),
      lines: reqs.lines.map((line) => {
        const c = credited.get(line.materialLineId || '') || 0
        return {
          ...line,
          issuedQuantity: roundQty((line.issuedQuantity || 0) - c),
          outstandingQuantity: roundQty((line.outstandingQuantity || 0) + c),
          availableQuantity: roundQty(
            line.availableQuantity + (units.get(line.materialLineId || '') || 0)
          ),
        }
      }),
    }
  }, [issue, reqs, preview])

  if (error)
    return (
      <div className='text-muted-foreground rounded-xl border p-10 text-center text-sm'>
        {getErrorMessage(error, t('Material issue not found'))}
      </div>
    )
  if (!ctx) return <Skeleton className='h-96 w-full rounded-xl' />
  if (ctx.issue.kind !== 'issue' || ctx.issue.status === 'cancelled')
    return (
      <div className='text-muted-foreground rounded-xl border p-10 text-center text-sm'>
        {ctx.issue.status === 'cancelled'
          ? t('This voucher is cancelled — it can’t be edited.')
          : t('A material return can’t be edited — issue again instead.')}
      </div>
    )
  return <IssueEntry edit={ctx} />
}

/** A finished good offered on an empty finished-good voucher's grid. */
type FinishedGoodRef = { kind: 'finished-good'; product: ManufacturingProduct }

/** The open order an "order" voucher issues against (for "Issue for N units"). */
type OrderInfo = {
  id: string
  orderNumber: string
  productName: string
  plannedQuantity: number
  producedQuantity: number
  unit: string
}

const roundQty = (n: number) => Math.round(n * 1e6) / 1e6

function IssueEntry({
  initialOrderId,
  edit,
}: {
  initialOrderId?: string
  edit?: EditContext
}) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const formatMoney = useFormatMoney()
  const canSeeCosts = useCanViewManufacturingCosts()
  const costSuffix = useCallback(
    (n: number) => (canSeeCosts ? ` · ${formatMoney(n)}` : ''),
    [canSeeCosts, formatMoney]
  )
  const branchName = useBranchName()
  const dispatch = useDispatch<AppDispatch>()
  const confirm = useConfirm()
  const user = useCurrentUser()
  const userId = user ? String(user.id || user._id || '') : ''

  const catalog = useCatalogProductSource()
  const catalogStock = useCatalogStockSource()
  const [batchUnbatched] = useBatchUnbatchedStockMutation()
  const storeRef = useRef<EntryStore<IssueRow, IssueHeader> | null>(null)
  // "Put them into a batch" from the batch picker: create the batch, then let every row
  // of that product see it (rows hold a snapshot of the catalog record).
  const stock = useMemo(
    () =>
      orderStockSource(catalogStock, async (product) => {
        const made = await batchUnbatched({
          productId: product.productId,
          variantId: product.variantId || null,
        }).unwrap()
        const store = storeRef.current
        if (store) {
          const credit = new Map([
            [
              made.id,
              { batchNumber: made.batchNumber, quantity: made.quantity },
            ],
          ])
          const s = store.getState()
          s.order.forEach((id) => {
            const p = s.rows[id].product
            if (
              p &&
              p.productId === product.productId &&
              (p.variantId || null) === (product.variantId || null)
            )
              store.updateRow(id, { product: withBatchCredit(p, credit) })
          })
        }
        return {
          id: made.id,
          batchNumber: made.batchNumber,
          quantity: made.quantity,
          expiryDate: made.expiryDate,
          cost: made.costPerUnit,
        }
      }),
    [catalogStock, batchUnbatched]
  )
  const { data: options } = useGetIssueOptionsQuery()
  const { data: operators } = useGetOperatorsQuery()
  const { data: orderPage } = useGetProductionOrdersQuery({
    status: EXECUTABLE,
    limit: 100,
    sortBy: 'createdAt:desc',
  } as never)
  const [postIssue] = usePostMaterialIssueMutation()
  const [postByMaterial] = usePostMaterialIssueByMaterialMutation()
  const [fetchPlan] = useLazyGetMaterialIssuePlanQuery()

  const [lines, setLines] = useState<RequirementLine[]>(edit?.lines || [])
  const [editIssue] = useEditMaterialIssueMutation()
  const locked = !!edit?.locked.length
  const [loadingOrder, setLoadingOrder] = useState(false)
  const [override, setOverride] = useState<{
    warnings: Warning[]
    resolve: (ok: boolean) => void
  } | null>(null)

  // What this voucher issues for. Opened from an order → that order; otherwise a
  // finished good and how many to make (the order is created when posting).
  // Issuing for a finished good creates its production order, so that mode is for roles
  // that may plan orders; everyone else issues against an existing order.
  const canCreateOrders = usePermissions().hasPermission(
    'manageProductionOrders'
  )
  const [mode, setModeState] = useState<IssueMode>(
    edit || initialOrderId || !canCreateOrders ? 'order' : 'product'
  )
  const modeRef = useRef(mode)
  const setMode = (next: IssueMode) => {
    modeRef.current = next
    setModeState(next)
  }
  const [plan, setPlan] = useState<MaterialIssuePlan | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)
  const planSeq = useRef(0)
  const planTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null)
  // By material, one post can write several vouchers (one per order): listed here.
  const [posted, setPosted] = useState<MaterialIssue[] | null>(null)

  const orders = useMemo(() => orderPage?.results || [], [orderPage])
  // Editing a posted voucher: its own batch quantities are available again (as on the
  // server), on every product the grid sees — rows re-link to these after a refresh.
  const editCredit = useMemo(() => {
    const byKey = new Map<
      string,
      Map<string, { batchNumber: string; quantity: number }>
    >()
    edit?.issue.lines.forEach((l) => {
      if (!l.batchId) return
      const key = `${l.materialLineId}:${l.isAlternative ? l.productId : ''}`
      const m = byKey.get(key) || new Map()
      const b = m.get(l.batchId)
      m.set(l.batchId, {
        batchNumber: l.batchNumber || '',
        quantity: roundQty((b?.quantity || 0) + l.quantity),
      })
      byKey.set(key, m)
    })
    return byKey
  }, [edit])
  const products = useMemo(
    () =>
      orderMaterialProducts(lines, catalog).map((p) => {
        const credit = editCredit.get(p.key)
        return credit ? withBatchCredit(p, credit) : p
      }),
    [lines, catalog, editCredit]
  )
  // Before a finished good is chosen, row 1's list offers the finished goods themselves
  // (invoice-style): picking one fills the header and asks for the quantity.
  const { data: buildablePage, isLoading: buildableLoading } =
    useGetManufacturingProductsQuery({
      productType: BUILDABLE_PRODUCT_TYPES,
      hasBom: true,
      packRole: 'make',
      limit: 200,
      sort: 'name',
    } as never)
  const finishedGoods = useMemo<EntryProduct[]>(
    () =>
      (buildablePage?.results || []).map((p) => ({
        key: `fg:${p.id}`,
        productId: p.id,
        variantId: null,
        name: p.name,
        subtitle: [
          p.productType ? t(PRODUCT_TYPE_META[p.productType].label) : null,
          p.sku || p.barcode,
          `${p.activeBomCount || p.bomCount} ${t('BOM')}`,
        ]
          .filter(Boolean)
          .join(' · '),
        code: p.sku || p.barcode,
        unit: p.unit,
        cost: p.cost,
        stock: p.stockQuantity,
        trackBatch: false,
        trackSerial: false,
        imageUrl: p.image?.url,
        raw: { kind: 'finished-good', product: p } satisfies FinishedGoodRef,
      })),
    [buildablePage, t]
  )
  // "Materials only": what open orders still need, per material.
  const {
    data: pendingData,
    isFetching: pendingLoading,
    refetch: refetchPending,
  } = useGetPendingMaterialsQuery(undefined, { skip: mode !== 'material' })
  const [pendingType, setPendingType] = useState<string>('all')
  const pendingMaterials = useMemo(
    () =>
      (pendingData?.materials || []).filter(
        (m) =>
          pendingType === 'all' ||
          (m.productType || 'unclassified') === pendingType
      ),
    [pendingData, pendingType]
  )
  const pickingFinishedGood = mode === 'product' && !lines.length
  const source = useMemo(() => {
    if (mode === 'material')
      return {
        ...orderMaterialSource(pendingProducts(pendingMaterials)),
        loading: pendingLoading && !pendingData,
      }
    if (!pickingFinishedGood) return orderMaterialSource(products)
    return {
      ...orderMaterialSource(finishedGoods),
      loading: buildableLoading,
    }
  }, [
    mode,
    pendingMaterials,
    pendingLoading,
    pendingData,
    pickingFinishedGood,
    products,
    finishedGoods,
    buildableLoading,
  ])

  /** Pending materials → rows (those not on the voucher yet), qty capped at stock. */
  const addPending = useCallback(
    (materials: PendingMaterial[]) => {
      const store = storeRef.current
      if (!store) return
      const onScreen = new Set(
        store
          .filledRows()
          .map((r) => pendingOf(r.product))
          .filter(Boolean)
          .map((m) => `${m!.productId}:${m!.variantId || ''}`)
      )
      const fresh = pendingProducts(
        materials.filter(
          (m) => !onScreen.has(`${m.productId}:${m.variantId || ''}`)
        )
      )
      if (!fresh.length) {
        toast.info(t('Already on the voucher'))
        return
      }
      // Drop the blank row first so the new rows don't land after it.
      const blanks = store
        .getState()
        .order.filter((id) => store.isEmpty(store.getState().rows[id]))
      if (blanks.length) store.deleteRows(blanks)
      store.appendRows(
        fresh.map((product) => {
          const { id: _id, ...row } = store.config.applyProduct(
            { ...blankIssueRow(), id: '' } as IssueRow,
            product,
            store.ctx()
          )
          return row
        })
      )
      store.ensureTrailingBlank()
    },
    [t]
  )

  const locations = useMemo(
    () => (options?.locations || []).map((l) => ({ value: l, label: l })),
    [options]
  )
  const people = useMemo(
    () =>
      (operators || []).map((o) => ({
        value: o.id,
        label: o.name || o.email || '—',
        sublabel: o.email,
      })),
    [operators]
  )

  /** Load (or reload) an order's open materials as rows. */
  const loadOrder = useCallback(
    async (
      orderId: string,
      { keepRows = false, info }: { keepRows?: boolean; info?: OrderInfo } = {}
    ) => {
      const store = storeRef.current
      if (!store) return
      if (!keepRows && store.filledRows().length) {
        const ok = await confirm({
          title: t('Replace the rows?'),
          description: t(
            'The materials of the newly chosen order replace the rows you have entered.'
          ),
          confirmText: t('Replace'),
        })
        if (!ok) return
      }
      setLoadingOrder(true)
      try {
        const reqs = await dispatch(
          manufacturingApi.endpoints.getOrderRequirements.initiate(orderId, {
            forceRefetch: true,
          })
        ).unwrap()
        setLines(reqs.lines)
        const order = orders.find((o) => o.id === orderId)
        setOrderInfo(
          info ||
            (order
              ? {
                  id: order.id,
                  orderNumber: order.orderNumber,
                  productName: order.productName,
                  plannedQuantity: order.plannedQuantity,
                  producedQuantity: order.producedQuantity || 0,
                  unit: order.unit,
                }
              : null)
        )
        const fresh = orderMaterialProducts(reqs.lines, catalog)
        const rows = requirementRows(reqs.lines, fresh)
        const header = store.getState().header
        store.reset(
          {
            ...header,
            mode: 'order',
            productionOrderId: orderId,
            issueForQuantity: null,
            sourceLocation:
              order?.sourceLocation ||
              header.sourceLocation ||
              options?.defaultSourceLocation ||
              '',
            wipLocation:
              order?.wipLocation ||
              header.wipLocation ||
              options?.defaultWipLocation ||
              '',
          },
          rows
        )
        // A blank row to add a material (or an alternative) by hand.
        store.ensureTrailingBlank()
        if (!rows.length)
          toast.info(t('Every material of this order is already issued'))
      } catch (err) {
        toast.error(getErrorMessage(err, t('Could not load the order')))
      } finally {
        setLoadingOrder(false)
      }
    },
    [catalog, confirm, dispatch, options, orders, t]
  )

  /**
   * Finished good + quantity → its BOM exploded for that quantity, as rows. The issue
   * quantity starts at what's needed, capped at stock on hand. Later answers win over
   * earlier ones (typing a quantity fires several).
   */
  const loadPlan = useCallback(async () => {
    clearTimeout(planTimer.current)
    const store = storeRef.current
    if (!store) return
    const h = store.getState().header
    const seq = ++planSeq.current
    if (!h.productId || !((h.produceQuantity || 0) > 0)) {
      setPlan(null)
      setLines([])
      setPlanError(null)
      setPlanLoading(false)
      if (store.filledRows().length) store.reset(h, [])
      return
    }
    setPlanLoading(true)
    try {
      const p = await fetchPlan({
        productId: h.productId,
        bomId: h.bomId,
        quantity: Number(h.produceQuantity),
      }).unwrap()
      if (seq !== planSeq.current) return
      setPlan(p)
      setLines(p.lines)
      setPlanError(null)
      const fresh = orderMaterialProducts(p.lines, catalog)
      store.reset(
        { ...store.getState().header, bomId: p.bom.id },
        requirementRows(p.lines, fresh)
      )
      store.ensureTrailingBlank()
    } catch (err) {
      if (seq !== planSeq.current) return
      setPlan(null)
      setLines([])
      setPlanError(getErrorMessage(err, t('Could not load the materials')))
      store.reset(store.getState().header, [])
    } finally {
      if (seq === planSeq.current) setPlanLoading(false)
    }
  }, [catalog, fetchPlan, t])

  const schedulePlan = useCallback(() => {
    clearTimeout(planTimer.current)
    planTimer.current = setTimeout(() => void loadPlan(), 400)
  }, [loadPlan])
  useEffect(() => () => clearTimeout(planTimer.current), [])

  /** A finished good picked on a grid row → it becomes the header's, then its quantity. */
  const loadPlanRef = useRef(loadPlan)
  loadPlanRef.current = loadPlan

  /** Fetches the voucher's materials again (Reload, or after production stock changed). */
  const reloadMaterials = () => {
    if (mode === 'material') {
      refetchPending()
      return
    }
    if (mode === 'product') {
      void loadPlan()
      return
    }
    const id = storeRef.current?.getState().header.productionOrderId
    if (id) void loadOrder(id, { info: orderInfo || undefined })
  }

  const ready = !catalog.loading && !!options
  const handlingPick = useRef(false)
  useEffect(() => {
    const store = storeRef.current
    if (!ready || !store) return
    return store.subscribe(() => {
      const state = store.getState()
      const picked = state.order
        .map((id) => state.rows[id].product?.raw as FinishedGoodRef | undefined)
        .find((raw) => raw?.kind === 'finished-good')
      if (!picked || handlingPick.current) return
      handlingPick.current = true
      const p = picked.product
      // After this pick's own update (and the engine's move to the next cell) settles.
      queueMicrotask(() => {
        store.reset(
          {
            ...store.getState().header,
            productId: p.id,
            productName: p.name,
            productUnit: p.unit,
            bomId: null,
          },
          []
        )
        if ((store.getState().header.produceQuantity || 0) > 0)
          void loadPlanRef.current()
        setTimeout(() => {
          const qty = document.querySelector<HTMLInputElement>(
            '[data-field="header:produceQuantity"]'
          )
          qty?.focus()
          qty?.select()
        }, 0)
        handlingPick.current = false
      })
    })
  }, [ready])

  /** "Issue for N units" of an open order: each line's share, capped at stock. */
  const scaleToOutput = useCallback(
    (units: number | null) => {
      const store = storeRef.current
      const planned = orderInfo?.plannedQuantity || 0
      if (!store || !planned) return
      store.getState().order.forEach((id) => {
        const row = store.getState().rows[id]
        if (
          !row.product ||
          !row.materialLineId ||
          row.alternativeProductId ||
          row.product.trackSerial
        )
          return
        const want =
          units === null
            ? row.remaining
            : Math.min(row.remaining, (row.required * units) / planned)
        const quantity = roundQty(
          Math.max(0, Math.min(want * (row.ratio || 1), row.available))
        )
        store.updateRow(id, { quantity: quantity || null })
      })
    },
    [orderInfo]
  )

  /** Finished good ⇄ production order. The header's shared fields carry over. */
  const switchMode = useCallback(
    async (next: IssueMode, orderToLoad?: string, info?: OrderInfo) => {
      const store = storeRef.current
      if (!store) return
      if (!orderToLoad && next === modeRef.current) return
      if (!orderToLoad && rowsToIssue(store.filledRows()).length) {
        const ok = await confirm({
          title: t('Clear the rows?'),
          description: t(
            'Switching what you issue for clears the materials entered so far.'
          ),
          confirmText: t('Switch'),
        })
        if (!ok) return
      }
      planSeq.current += 1
      clearTimeout(planTimer.current)
      const h = store.getState().header
      setMode(next)
      store.reset(
        {
          ...store.config.initialHeader(),
          mode: next,
          date: h.date,
          sourceLocation: h.sourceLocation,
          wipLocation: h.wipLocation,
          requestedById: h.requestedById,
          issuedById: h.issuedById,
          reference: h.reference,
          notes: h.notes,
        },
        []
      )
      setPlan(null)
      setPlanError(null)
      setPlanLoading(false)
      setLines([])
      setOrderInfo(null)
      if (orderToLoad) await loadOrder(orderToLoad, { keepRows: true, info })
    },
    [confirm, loadOrder, t]
  )

  // Opened from an order (?orderId=…): load it once everything it needs is here.
  const autoLoaded = useRef(false)
  useEffect(() => {
    if (
      autoLoaded.current ||
      !initialOrderId ||
      catalog.loading ||
      !options ||
      !orderPage
    )
      return
    autoLoaded.current = true
    void loadOrder(initialOrderId, { keepRows: true })
  }, [initialOrderId, catalog.loading, options, orderPage, loadOrder])

  const productFields = useMemo<HeaderField<IssueHeader>[]>(
    () => [
      {
        key: 'productId',
        label: 'Finished Good',
        kind: 'custom',
        required: true,
        span: 2,
        render: ({ header, id, next, error }) => (
          <ProductPicker
            id={id}
            data-field='header:productId'
            value={
              header.productId
                ? { id: header.productId, name: header.productName }
                : null
            }
            productType={BUILDABLE_PRODUCT_TYPES}
            packRole='make'
            icon={<Factory className='text-muted-foreground h-4 w-4' />}
            placeholder={t('Choose what to make')}
            searchPlaceholder={t('Search finished goods & by-products…')}
            className={error ? 'border-destructive' : undefined}
            onChange={(p) => {
              storeRef.current?.setHeader({
                productId: p.id,
                productName: p.name,
                productUnit: p.unit,
                bomId: null,
              })
              if (
                (storeRef.current?.getState().header.produceQuantity || 0) > 0
              )
                void loadPlan()
              next()
            }}
          />
        ),
      },
      {
        key: 'produceQuantity',
        label: 'Quantity to Make',
        kind: 'custom',
        required: true,
        render: ({ header, value, onChange, id, next, error }) => (
          <div
            className={cn(
              'border-input bg-background dark:bg-input/30 focus-within:border-ring focus-within:ring-ring/50 flex h-9 items-center overflow-hidden rounded-md border focus-within:ring-2',
              error && 'border-destructive'
            )}
          >
            <input
              id={id}
              data-field='header:produceQuantity'
              type='text'
              inputMode='decimal'
              autoComplete='off'
              aria-label={t('Quantity to make')}
              placeholder={t('How many?')}
              className='h-full min-w-0 flex-1 bg-transparent px-3 text-sm font-semibold tabular-nums outline-none'
              value={value === null || value === undefined ? '' : String(value)}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^\d.]/g, '')
                const n = raw === '' ? null : Number(raw)
                onChange(
                  raw === '' || Number.isNaN(n)
                    ? null
                    : raw.endsWith('.')
                      ? raw
                      : n
                )
                schedulePlan()
              }}
              onBlur={() => {
                const v = storeRef.current?.getState().header.produceQuantity
                if (typeof v === 'string') onChange(Number(v) || null)
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || e.ctrlKey || e.altKey) return
                e.preventDefault()
                const v = storeRef.current?.getState().header.produceQuantity
                if (typeof v === 'string') onChange(Number(v) || null)
                void loadPlan()
                next()
              }}
            />
            <span className='text-muted-foreground bg-muted/50 flex h-full items-center border-l px-2.5 text-xs'>
              {header.productUnit
                ? getUnitLabel(header.productUnit)
                : t('units')}
            </span>
          </div>
        ),
      },
      {
        key: 'bomId',
        label: 'BOM Version',
        kind: 'custom',
        render: ({ value, onChange, id, next }) => (
          <SearchableSelect
            id={id}
            options={(plan?.boms || []).map((b) => ({
              value: b.id,
              label: `${b.bomNumber} v${b.version}`,
              sublabel: [
                b.isDefault ? t('Default') : null,
                `${t('per')} ${fmtQty(b.quantity)} ${getUnitLabel(b.unit)}`,
                b.name || null,
              ]
                .filter(Boolean)
                .join(' · '),
            }))}
            value={(value as string) || ''}
            deselectable={false}
            disabled={!plan}
            onValueChange={(v) => {
              if (!v || v === value) return
              onChange(v)
              void loadPlan()
            }}
            onSelected={next}
            placeholder={plan ? t('Choose BOM') : t('Default BOM')}
          />
        ),
      },
    ],
    [plan, loadPlan, schedulePlan, t]
  )

  const orderFields = useMemo<HeaderField<IssueHeader>[]>(
    () => [
      {
        key: 'productionOrderId',
        label: 'Production Order',
        kind: 'custom',
        required: true,
        span: 2,
        render: ({ value, onChange, id, next, error }) => (
          <SearchableSelect
            id={id}
            options={orders.map((o) => ({
              value: o.id,
              label: `${o.orderNumber} — ${o.productName}`,
              sublabel: `${fmtQty(o.plannedQuantity)} ${o.unit} · ${t(o.status.replace('_', ' '))}`,
            }))}
            value={(value as string) || ''}
            deselectable={false}
            onValueChange={(v) => {
              if (!v || v === value) return
              onChange(v)
              void loadOrder(v)
            }}
            onSelected={next}
            placeholder={t('Choose a released order')}
            searchPlaceholder={t('Search order number or product…')}
            emptyText={t('No released orders')}
            className={error ? 'border-destructive' : undefined}
          />
        ),
      },
      {
        key: 'issueForQuantity',
        label: 'Issue For',
        kind: 'custom',
        render: ({ value, onChange, id, next }) => (
          <div className='border-input bg-background dark:bg-input/30 focus-within:border-ring focus-within:ring-ring/50 flex h-9 items-center overflow-hidden rounded-md border focus-within:ring-2'>
            <input
              id={id}
              data-field='header:issueForQuantity'
              type='text'
              inputMode='decimal'
              autoComplete='off'
              aria-label={t('Issue for how many units')}
              disabled={!orderInfo}
              placeholder={t('All open')}
              className='h-full min-w-0 flex-1 bg-transparent px-3 text-sm font-semibold tabular-nums outline-none disabled:opacity-50'
              value={value === null || value === undefined ? '' : String(value)}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^\d.]/g, '')
                const n = raw === '' ? null : Number(raw)
                const units = n === null || Number.isNaN(n) ? null : n
                onChange(raw.endsWith('.') ? raw : units)
                scaleToOutput(units)
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || e.ctrlKey || e.altKey) return
                e.preventDefault()
                next()
              }}
            />
            <span className='text-muted-foreground bg-muted/50 flex h-full items-center border-l px-2.5 text-xs whitespace-nowrap'>
              {orderInfo
                ? `${t('of')} ${fmtQty(orderInfo.plannedQuantity)} ${getUnitLabel(orderInfo.unit)}`
                : t('units')}
            </span>
          </div>
        ),
      },
    ],
    [orders, orderInfo, loadOrder, scaleToOutput, t]
  )

  const headerFields = useMemo<HeaderField<IssueHeader>[]>(
    () => [
      {
        key: 'voucherNumber',
        label: 'Voucher Number',
        kind: 'custom',
        render: () => (
          <div className='bg-muted/40 text-muted-foreground flex h-9 items-center rounded-md border px-3 text-sm'>
            {edit ? (
              <span className='text-foreground font-mono font-medium'>
                {edit.issue.issueNumber}
              </span>
            ) : (
              t('Assigned on save')
            )}
          </div>
        ),
      },
      { key: 'date', label: 'Date', kind: 'date', required: true },
      ...(edit
        ? [
            {
              key: 'productionOrderId',
              label: 'Production Order',
              kind: 'custom',
              span: 2,
              render: () => (
                <div className='bg-muted/40 flex h-9 items-center gap-2 truncate rounded-md border px-3 text-sm'>
                  <span className='font-mono font-medium'>
                    {edit.issue.orderNumber}
                  </span>
                  <span className='text-muted-foreground text-xs'>
                    {t(
                      'fixed — to move it to another order, delete this voucher and issue again'
                    )}
                  </span>
                </div>
              ),
            } satisfies HeaderField<IssueHeader>,
          ]
        : mode === 'product'
          ? productFields
          : mode === 'order'
            ? orderFields
            : []),
      /* Hidden for now — Source Warehouse, WIP Location, Branch, Requested By
         and Issued By. Uncomment to bring them back. While hidden, the
         locations come from Manufacturing Settings (defaultSourceLocation /
         defaultWipLocation) and Issued By falls back to the signed-in user.
      {
        key: 'sourceLocation',
        label: 'Source Warehouse',
        kind: 'custom',
        required: true,
        render: ({ value, onChange, id, next, error }) => (
          <SearchableSelect
            id={id}
            options={locations}
            value={(value as string) || ''}
            deselectable={false}
            onValueChange={(v) => onChange(v)}
            onSelected={next}
            placeholder={t('Choose warehouse')}
            className={error ? 'border-destructive' : undefined}
          />
        ),
      },
      {
        key: 'wipLocation',
        label: 'WIP Location',
        kind: 'custom',
        required: true,
        render: ({ value, onChange, id, next, error }) => (
          <SearchableSelect
            id={id}
            options={locations}
            value={(value as string) || ''}
            deselectable={false}
            onValueChange={(v) => onChange(v)}
            onSelected={next}
            placeholder={t('Choose WIP location')}
            className={error ? 'border-destructive' : undefined}
          />
        ),
      },
      {
        key: 'branch',
        label: 'Branch',
        kind: 'custom',
        render: () => (
          <div className='bg-muted/40 flex h-9 items-center truncate rounded-md border px-3 text-sm'>
            {branchName || t('Current branch')}
          </div>
        ),
      },
      {
        key: 'requestedById',
        label: 'Requested By',
        kind: 'custom',
        render: ({ value, onChange, id, next }) => (
          <SearchableSelect
            id={id}
            options={people}
            value={(value as string) || ''}
            onValueChange={(v) => onChange(v || null)}
            onSelected={next}
            placeholder={t('Optional')}
            clearLabel={t('Nobody')}
          />
        ),
      },
      {
        key: 'issuedById',
        label: 'Issued By',
        kind: 'custom',
        render: ({ value, onChange, id, next }) => (
          <SearchableSelect
            id={id}
            options={people}
            value={(value as string) || userId}
            deselectable={false}
            onValueChange={(v) => onChange(v || null)}
            onSelected={next}
            placeholder={t('You')}
          />
        ),
      },
      */
      {
        key: 'reference',
        label: 'Reference',
        kind: 'text',
        placeholder: 'Requisition / slip no.',
      },
      { key: 'notes', label: 'Notes', kind: 'textarea', span: 2 },
      ...(edit
        ? [
            {
              key: 'editNote',
              label: 'Reason for Change',
              kind: 'textarea',
              span: 2,
              placeholder: 'Kept in the voucher’s history',
            } satisfies HeaderField<IssueHeader>,
          ]
        : []),
    ],
    // locations/people/branchName/userId are only used by the hidden fields
    // above — kept here so uncommenting those fields just works.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      edit,
      mode,
      productFields,
      orderFields,
      locations,
      people,
      branchName,
      userId,
      t,
    ]
  )

  const config = useMemo(() => {
    const base = createIssueConfig({
      initialMode: () => modeRef.current,
      headerFields,
      defaultSourceLocation: options?.defaultSourceLocation || '',
      defaultWipLocation: options?.defaultWipLocation || '',
      formatMoney,
      hideMoney: !canSeeCosts,
      productPlaceholder:
        mode === 'material'
          ? t('Search materials open orders still need')
          : mode === 'product'
            ? lines.length
              ? t('Add a material of this BOM')
              : t('Choose the finished good to make')
            : lines.length
              ? t('Add a material of this order')
              : t('Choose the production order first'),
      productEmptyText:
        mode === 'material'
          ? 'No open production order still needs that'
          : mode === 'product'
            ? lines.length
              ? 'Not a material of this BOM'
              : 'No finished good with a BOM matches'
            : lines.length
              ? 'Not a material of this order'
              : 'Choose the production order above — its materials list here',
      renderStatus: (row) => {
        const s = rowStatus(row)
        return s.text ? (
          <Badge
            variant='outline'
            className={cn(
              'h-5 px-1.5 text-[10px] font-medium',
              toneClass[s.tone]
            )}
          >
            {t(s.text)}
          </Badge>
        ) : null
      },
    })
    // A voucher whose material was already used: its rows can't change (header can).
    return locked ? lockRows(base) : base
  }, [
    headerFields,
    options,
    formatMoney,
    canSeeCosts,
    mode,
    lines.length,
    locked,
    t,
  ])

  /** Bulk quantity actions over every material row. */
  const setQuantities = (how: 'all' | 'available' | 'clear') => {
    const store = storeRef.current
    if (!store) return
    let skippedSerial = 0
    store.getState().order.forEach((id) => {
      const row = store.getState().rows[id]
      if (!row.product || (!row.materialLineId && !row.pendingOrders)) return
      if (row.product.trackSerial) {
        if (how !== 'clear') skippedSerial += 1
        else store.updateRow(id, { serials: [] })
        return
      }
      const quantity =
        how === 'clear'
          ? null
          : how === 'all'
            ? roundQty(row.remaining * row.ratio) || null
            : suggestedQty(row) || null
      store.updateRow(id, { quantity })
    })
    if (skippedSerial)
      toast.info(
        `${skippedSerial} ${t('serial-tracked line(s): pick their serial numbers')}`
      )
  }

  const askOverride = (warnings: Warning[]) =>
    new Promise<boolean>((resolve) => setOverride({ warnings, resolve }))

  const onSave = useCallback(
    async (
      { header, rows }: { header: IssueHeader; rows: IssueRow[] },
      saveMode: SaveMode
    ) => {
      const store = storeRef.current
      const forProduct = header.mode === 'product'
      if (forProduct) {
        // The rows must be the plan for exactly what the header says.
        if (planLoading) {
          toast.info(t('The materials are still loading — try again'))
          return
        }
        if (
          !plan ||
          plan.productId !== header.productId ||
          plan.quantity !== Number(header.produceQuantity)
        ) {
          await loadPlan()
          toast.info(t('Materials recalculated — check them and post again'))
          return
        }
      }
      const selected = store?.getState().selected || {}
      const scope =
        saveMode === 'selected' ? rows.filter((r) => selected[r.id]) : rows
      if (saveMode === 'selected' && !scope.length) {
        toast.error(t('Select rows first — click their # number'))
        return
      }
      const posting = rowsToIssue(scope)
      if (!posting.length) {
        toast.error(
          edit
            ? t(
                'A voucher needs at least one line — to take it all back, delete the voucher'
              )
            : t('Enter an issue quantity on at least one row')
        )
        return
      }
      const shared = {
        date: header.date,
        sourceLocation: header.sourceLocation,
        wipLocation: header.wipLocation,
        requestedById: header.requestedById,
        issuedById: header.issuedById || userId || null,
        reference: header.reference,
        notes: header.notes,
      }
      const forMaterial = header.mode === 'material'
      const body: IssueVoucherBody = {
        ...(forProduct
          ? {
              newOrder: {
                productId: header.productId!,
                bomId: header.bomId,
                plannedQuantity: Number(header.produceQuantity),
              },
            }
          : { productionOrderId: header.productionOrderId! }),
        ...shared,
        lines: posting.map(rowToLine),
      }
      /** One voucher — or, by material, one per order the lines go to. */
      const send = async (
        overrides?: IssueWarningCode[]
      ): Promise<MaterialIssue[]> => {
        const extra = overrides ? { overrides } : {}
        if (edit)
          return [
            await editIssue({
              issueId: edit.issue.id,
              body: {
                ...shared,
                ...extra,
                revision: edit.issue.revision ?? 0,
                editNote: header.editNote,
                lines: posting.map(rowToLine),
              },
            }).unwrap(),
          ]
        if (!forMaterial)
          return [await postIssue({ ...body, ...extra }).unwrap()]
        const res = await postByMaterial({
          ...shared,
          ...extra,
          lines: posting.map((r) => ({
            productId: r.product!.productId,
            variantId: r.product!.variantId ?? null,
            quantity: r.quantity,
            orderId: r.orderId || null,
          })),
        }).unwrap()
        return res.issues
      }
      let savedAll: MaterialIssue[]
      try {
        try {
          savedAll = await send()
        } catch (err) {
          const data = (
            err as {
              data?: {
                errorCode?: string
                details?: IssueVoucherCheck
              }
            }
          )?.data
          if (data?.errorCode !== 'ISSUE_WARNINGS') throw err
          const order = store?.getState().order || []
          const warnings = (data.details?.warnings || []).map((w) => {
            const row = posting[w.line - 1]
            return {
              ...w,
              where: row
                ? `${t('Row')} ${order.indexOf(row.id) + 1} · ${row.product?.name || ''}`
                : `${t('Line')} ${w.line}`,
            }
          })
          if (!(await askOverride(warnings))) {
            toast.info(t('Nothing was posted'))
            return
          }
          savedAll = await send([...new Set(warnings.map((w) => w.code))])
        }
      } catch (err) {
        const details = (err as { data?: { details?: IssueVoucherCheck } })
          ?.data?.details
        const headerProblems = Object.values(details?.header || {})
        if (headerProblems.length) toast.error(headerProblems.join(' · '))
        // Materials only hides Batch / Serial: their problems show on Issue Qty.
        const rowErrors = rowErrorsFromApi(
          err,
          posting,
          forMaterial
            ? { batchId: 'quantity', serials: 'product', orderId: 'orderId' }
            : { batchId: 'batchId' }
        )
        if (rowErrors) {
          toast.error(t('Some lines need attention — nothing was posted'))
          return { rowErrors }
        }
        if (headerProblems.length) return
        throw err
      }
      const saved = savedAll[0]
      if (edit) {
        const last = saved.editHistory?.[saved.editHistory.length - 1]
        toast.success(
          `${saved.issueNumber} ${t('updated')}${
            last?.kind === 'lines'
              ? ` — ${t('stock re-posted')}${costSuffix(saved.totalCost)}`
              : ` — ${t('no stock moved')}`
          }`
        )
        if (saveMode === 'save-print') {
          if (
            !printMaterialIssue(saved, {
              branchName,
              formatMoney,
              t,
              hideMoney: !canSeeCosts,
            })
          )
            toast.error(t('Allow pop-ups for this site to print'))
        }
        navigate({ to: `${LIST}/${saved.id}` as never, replace: true })
        return
      }
      if (saveMode === 'save-print') {
        const blocked = savedAll.some(
          (v) =>
            !printMaterialIssue(v, {
              branchName,
              formatMoney,
              t,
              hideMoney: !canSeeCosts,
            })
        )
        if (blocked) toast.error(t('Allow pop-ups for this site to print'))
      }

      if (forMaterial) {
        toast.success(
          `${savedAll.length} ${t('voucher(s) posted')} · ${savedAll
            .map((v) => `${v.issueNumber} → ${v.orderNumber}`)
            .join(', ')}`
        )
        refetchPending()
        if (saveMode === 'selected') {
          store?.deleteRows(posting.map((r) => r.id))
          store?.ensureTrailingBlank()
          return
        }
        if (saveMode === 'save-new') return
        if (savedAll.length === 1) {
          navigate({ to: `${LIST}/${saved.id}` as never, replace: true })
          return
        }
        setPosted(savedAll)
        store?.reset({ ...store.getState().header }, [])
        return
      }

      toast.success(
        forProduct
          ? `${saved.issueNumber} ${t('posted')} · ${t('production order')} ${saved.orderNumber} ${t('created for')} ${fmtQty(Number(header.produceQuantity))} ${header.productName}${costSuffix(saved.totalCost)}`
          : `${saved.issueNumber} ${t('posted')} · ${saved.lines.length} ${t('line(s) moved to WIP')}${costSuffix(saved.totalCost)}`
      )
      if (saveMode === 'save-new') {
        setLines([])
        setPlan(null)
        setOrderInfo(null)
        return
      }
      if (saveMode === 'selected') {
        // Stay on the order (new or not): its rows reload with what is still open.
        if (forProduct) {
          await switchMode('order', saved.productionOrderId, {
            id: saved.productionOrderId,
            orderNumber: saved.orderNumber,
            productName: header.productName,
            plannedQuantity: Number(header.produceQuantity),
            producedQuantity: 0,
            unit: header.productUnit,
          })
          return
        }
        await loadOrder(saved.productionOrderId, {
          keepRows: true,
          info: orderInfo || undefined,
        })
        return
      }
      navigate({ to: `${LIST}/${saved.id}` as never, replace: true })
    },
    [
      canSeeCosts,
      costSuffix,
      edit,
      editIssue,
      postByMaterial,
      refetchPending,
      plan,
      planLoading,
      loadPlan,
      switchMode,
      orderInfo,
      postIssue,
      userId,
      formatMoney,
      branchName,
      navigate,
      loadOrder,
      t,
    ]
  )

  if (catalog.loading || !options)
    return <Skeleton className='h-96 w-full rounded-xl' />

  /** The posted voucher as rows: one per material (FEFO splits merged back). */
  const editInitial = edit
    ? (() => {
        const productsNow = orderMaterialProducts(edit.lines, catalog)
        const groups = new Map<
          string,
          {
            quantity: number
            batches: Map<string, { batchNumber: string; quantity: number }>
            serials: string[]
          }
        >()
        edit.issue.lines.forEach((l) => {
          const key = `${l.materialLineId}:${l.isAlternative ? l.productId : ''}`
          const g = groups.get(key) || {
            quantity: 0,
            batches: new Map<
              string,
              { batchNumber: string; quantity: number }
            >(),
            serials: [] as string[],
          }
          g.quantity = roundQty(g.quantity + l.quantity)
          if (l.batchId) {
            const b = g.batches.get(l.batchId)
            g.batches.set(l.batchId, {
              batchNumber: l.batchNumber || '',
              quantity: roundQty((b?.quantity || 0) + l.quantity),
            })
          }
          ;(l.serialNumbers || []).forEach((sn) => g.serials.push(sn))
          groups.set(key, g)
        })
        const rows: Omit<IssueRow, 'id'>[] = []
        groups.forEach((g, key) => {
          const found = productsNow.find((p) => p.key === key)
          if (!found) return
          const product = withBatchCredit(found, g.batches)
          const { id: _id, ...row } = rowFromProduct(
            { ...blankIssueRow(), id: '' } as IssueRow,
            product,
            g.quantity
          )
          rows.push({
            ...row,
            // The batches it was posted from, batch for batch.
            ...allocationFields(
              [...g.batches].map(([batchId, b]) => ({ batchId, ...b }))
            ),
            serials: g.serials,
          })
        })
        const v = edit.issue
        return {
          header: {
            mode: 'order' as const,
            productionOrderId: v.productionOrderId,
            // The business day it was posted on (Asia/Karachi), not the UTC date.
            date: toBusinessCalendarDate(new Date(v.issueDate)),
            sourceLocation:
              v.sourceLocation || options.defaultSourceLocation || '',
            wipLocation: v.wipLocation || options.defaultWipLocation || '',
            requestedById: v.requestedBy?.userId || null,
            issuedById: v.issuedBy?.userId || null,
            reference: v.reference || '',
            notes: v.notes || '',
          },
          rows,
        }
      })()
    : undefined

  const hasRows = mode === 'material' || lines.length > 0

  return (
    <div className='space-y-4'>
      <nav
        aria-label={t('Breadcrumb')}
        className='text-muted-foreground flex items-center gap-1.5 text-sm'
      >
        <Link
          to={LIST as never}
          className='hover:text-foreground inline-flex items-center gap-1'
        >
          <ArrowLeft className='h-3.5 w-3.5' aria-hidden />
          {t('Material issues')}
        </Link>
      </nav>
      <PageHeader
        title={
          edit
            ? `${t('Edit material issue')} ${edit.issue.issueNumber}`
            : t('New material issue voucher')
        }
        description={
          edit
            ? `${edit.issue.orderNumber} · ${t('posted')} ${fmtDate(edit.issue.issueDate)}${
                edit.issue.revision
                  ? ` · ${t('revision')} ${edit.issue.revision}`
                  : ''
              }`
            : t(
                'Issue raw materials and components from the store to the production floor — for a finished good you are about to make, or for an open production order.'
              )
        }
        actions={
          <div className='flex flex-wrap gap-2'>
            <Button
              variant='outline'
              size='sm'
              disabled={!hasRows}
              onClick={() => setQuantities('all')}
              title={t('Issue everything still required')}
            >
              <Layers className='mr-1.5 h-3.5 w-3.5' />
              {t('Issue All')}
            </Button>
            <Button
              variant='outline'
              size='sm'
              disabled={!hasRows}
              onClick={() => setQuantities('available')}
              title={t('Issue what is needed, capped at stock on hand')}
            >
              <PackageCheck className='mr-1.5 h-3.5 w-3.5' />
              {t('Issue Available')}
            </Button>
            <Button
              variant='outline'
              size='sm'
              disabled={!hasRows}
              onClick={() => setQuantities('clear')}
            >
              <Eraser className='mr-1.5 h-3.5 w-3.5' />
              {t('Clear')}
            </Button>
            <Button
              variant='ghost'
              size='sm'
              disabled={
                mode === 'material'
                  ? pendingLoading
                  : mode === 'product'
                    ? planLoading || !plan
                    : !orderInfo || loadingOrder
              }
              onClick={reloadMaterials}
            >
              <RefreshCw
                className={cn(
                  'mr-1.5 h-3.5 w-3.5',
                  (loadingOrder || planLoading || pendingLoading) &&
                    'animate-spin'
                )}
              />
              {t('Reload materials')}
            </Button>
          </div>
        }
      />

      {edit ? (
        <EditBanner issue={edit.issue} locked={edit.locked} />
      ) : (
        <ModeSwitch
          value={mode}
          onChange={(m) => void switchMode(m)}
          allowFinishedGood={canCreateOrders}
        />
      )}

      {edit ? null : mode === 'material' ? (
        <PendingPanel
          materials={pendingData?.materials}
          loading={pendingLoading && !pendingData}
          type={pendingType}
          onTypeChange={setPendingType}
          onAdd={addPending}
        />
      ) : mode === 'product' ? (
        <PlanSummary
          plan={plan}
          loading={planLoading}
          error={planError}
          onUseOrder={(o) =>
            void switchMode('order', o.id, {
              id: o.id,
              orderNumber: o.orderNumber,
              productName: plan?.productName || '',
              plannedQuantity: o.plannedQuantity,
              producedQuantity: 0,
              unit: o.unit,
            })
          }
        />
      ) : (
        orderInfo && <OrderSummary info={orderInfo} lines={lines} />
      )}

      <TransactionEntry<IssueRow, IssueHeader>
        gridLoading={
          mode === 'product' && planLoading
            ? t('Loading the materials of this BOM…')
            : mode === 'order' && loadingOrder
              ? t('Loading the order’s materials…')
              : mode === 'material' && pendingLoading && !pendingData
                ? t('Loading what open orders still need…')
                : false
        }
        config={config}
        products={source}
        stock={stock}
        storeRef={storeRef}
        draft={false}
        initial={editInitial}
        onSave={onSave}
        saveLabel={edit ? t('Save changes') : t('Post Issue')}
        saveNew={!edit}
        saveActions={
          edit
            ? [{ mode: 'save-print', label: 'Save & Print' }]
            : [
                { mode: 'selected', label: 'Issue Selected' },
                { mode: 'save-print', label: 'Post & Print' },
              ]
        }
        footerExtra={
          <Button
            type='button'
            variant='ghost'
            onClick={async () => {
              if (edit) {
                navigate({ to: `${LIST}/${edit.issue.id}` as never })
                return
              }
              const store = storeRef.current
              if (store && rowsToIssue(store.filledRows()).length) {
                const ok = await confirm({
                  title: t('Leave this voucher?'),
                  description: t('Nothing has been issued yet.'),
                  confirmText: t('Leave'),
                })
                if (!ok) return
              }
              navigate({ to: LIST as never })
            }}
          >
            {t('Cancel')}
          </Button>
        }
      />
      <p className='text-muted-foreground text-xs'>
        {t(
          'Tip: use − / + on Issue Qty to step a line up or down; click a row’s # to select it for “Issue Selected”; Ctrl+Delete removes a row; add a material (or a listed alternative) on the empty row.'
        )}
      </p>

      <PostedDialog
        issues={posted}
        onClose={() => {
          setPosted(null)
          navigate({ to: LIST as never })
        }}
        onNew={() => setPosted(null)}
      />

      <OverrideDialog
        state={override}
        onClose={(ok) => {
          override?.resolve(ok)
          setOverride(null)
        }}
      />
    </div>
  )
}

/** Finished good (new order) or an open production order. */
function ModeSwitch({
  value,
  onChange,
  allowFinishedGood = true,
}: {
  value: IssueMode
  onChange: (mode: IssueMode) => void
  /** Hide "For a finished good" (it creates a production order). */
  allowFinishedGood?: boolean
}) {
  const { t } = useLanguage()
  const options: {
    value: IssueMode
    icon: typeof Factory
    title: string
    text: string
  }[] = [
    {
      value: 'product',
      icon: Factory,
      title: t('For a finished good'),
      text: t(
        'Pick what to make and how many — materials are calculated from its BOM'
      ),
    },
    {
      value: 'order',
      icon: ClipboardList,
      title: t('For a production order'),
      text: t('Issue what an open order still needs'),
    },
    {
      value: 'material',
      icon: PackagePlus,
      title: t('Materials only'),
      text: t(
        'Packaging or any material — it goes to the open orders that still need it'
      ),
    },
  ]
  return (
    <div
      role='radiogroup'
      aria-label={t('Issue materials for')}
      className={cn(
        'grid grid-cols-1 gap-2',
        allowFinishedGood ? 'md:grid-cols-3' : 'md:grid-cols-2'
      )}
    >
      {options
        .filter((o) => allowFinishedGood || o.value !== 'product')
        .map((o) => {
          const on = o.value === value
          const Icon = o.icon
          return (
            <button
              key={o.value}
              type='button'
              role='radio'
              aria-checked={on}
              onClick={() => onChange(o.value)}
              className={cn(
                'focus-visible:ring-ring flex items-start gap-3 rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-2',
                on
                  ? 'border-primary bg-primary/5 ring-primary/30 ring-1'
                  : 'bg-card hover:bg-muted/50'
              )}
            >
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                  on
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                <Icon className='h-4 w-4' />
              </span>
              <span className='min-w-0'>
                <span className='block text-sm font-semibold'>{o.title}</span>
                <span className='text-muted-foreground block text-xs'>
                  {o.text}
                </span>
              </span>
            </button>
          )
        })}
    </div>
  )
}

/** The finished-good plan: what will be made, its BOM, readiness and open orders. */
function PlanSummary({
  plan,
  loading,
  error,
  onUseOrder,
}: {
  plan: MaterialIssuePlan | null
  loading: boolean
  error: string | null
  onUseOrder: (order: MaterialIssuePlan['openOrders'][number]) => void
}) {
  const { t } = useLanguage()
  if (error)
    return (
      <div className='flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-700 dark:text-rose-300'>
        <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0' />
        {error}
      </div>
    )
  if (!plan)
    return loading ? (
      <Skeleton className='h-[74px] w-full rounded-xl' />
    ) : (
      <div className='text-muted-foreground flex items-center gap-2 rounded-xl border border-dashed p-3 text-sm'>
        <Factory className='h-4 w-4 shrink-0' />
        {t(
          'Choose the finished good and enter how many to make — every material it needs loads below with the quantity to issue.'
        )}
      </div>
    )
  // Production-stock lines only need from the store what the floor does not cover.
  const fromFloor = plan.lines.filter((l) => l.supply === 'floor').length
  const ready = plan.lines.filter(
    (l) =>
      l.isOptional ||
      l.availableQuantity >=
        (l.supply === 'floor'
          ? (l.outstandingQuantity ?? 0)
          : l.requiredQuantity) -
          1e-9
  ).length
  const short = plan.lines.length - ready
  return (
    <div
      className={cn(
        'bg-card space-y-3 rounded-xl border p-3 transition-opacity sm:p-4',
        loading && 'opacity-60'
      )}
      aria-busy={loading || undefined}
    >
      <div className='flex flex-wrap items-center gap-x-6 gap-y-2'>
        <div className='min-w-0'>
          <div className='text-muted-foreground text-xs'>{t('Making')}</div>
          <div className='truncate font-semibold'>
            {fmtQty(plan.quantity)} {getUnitLabel(plan.unit)} ·{' '}
            {plan.productName}
          </div>
        </div>
        <SummaryFact
          label={t('BOM')}
          value={`${plan.bom.bomNumber} v${plan.bom.version}`}
        />
        <SummaryFact label={t('Materials')} value={String(plan.lines.length)} />
        {fromFloor > 0 && (
          <SummaryFact
            label={t('From production stock')}
            value={String(fromFloor)}
          />
        )}
        <SummaryFact
          label={t('In stock')}
          value={`${ready} / ${plan.lines.length}`}
          tone={short ? undefined : 'ok'}
        />
        <SummaryFact
          label={t('Short')}
          value={String(short)}
          tone={short ? 'danger' : undefined}
        />
        <span className='text-muted-foreground text-xs sm:ml-auto'>
          {t('A production order is created and released when you post.')}
        </span>
      </div>
      {plan.openOrders.length > 0 && (
        <div className='flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm'>
          <AlertTriangle className='h-4 w-4 shrink-0 text-amber-500' />
          <span className='min-w-0 flex-1'>
            {t('Already open for this product:')}{' '}
            {plan.openOrders.map((o, i) => (
              <span key={o.id}>
                {i > 0 && ', '}
                <b className='font-mono'>{o.orderNumber}</b>{' '}
                <span className='text-muted-foreground'>
                  ({fmtQty(o.plannedQuantity)} {getUnitLabel(o.unit)} ·{' '}
                  {o.openPercent}% {t('to issue')})
                </span>
              </span>
            ))}
          </span>
          <Button
            size='sm'
            variant='outline'
            className='h-8'
            onClick={() => onUseOrder(plan.openOrders[0])}
          >
            {t('Issue against')} {plan.openOrders[0].orderNumber}
          </Button>
        </div>
      )}
    </div>
  )
}

/** The open order being issued against: how much is planned, made and still to issue. */
function OrderSummary({
  info,
  lines,
}: {
  info: OrderInfo
  lines: RequirementLine[]
}) {
  const { t } = useLanguage()
  const required = lines.reduce((s, l) => s + (l.requiredQuantity || 0), 0)
  const open = lines.reduce((s, l) => s + (l.outstandingQuantity || 0), 0)
  const issuedPct =
    required > 0 ? Math.round(((required - open) / required) * 100) : 0
  return (
    <div className='bg-card flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border p-3 sm:p-4'>
      <div className='min-w-0'>
        <div className='text-muted-foreground text-xs'>
          <span className='font-mono'>{info.orderNumber}</span>
        </div>
        <div className='truncate font-semibold'>{info.productName}</div>
      </div>
      <SummaryFact
        label={t('Planned')}
        value={`${fmtQty(info.plannedQuantity)} ${getUnitLabel(info.unit)}`}
      />
      <SummaryFact
        label={t('Produced')}
        value={`${fmtQty(info.producedQuantity)} ${getUnitLabel(info.unit)}`}
      />
      <div className='min-w-40 flex-1 space-y-1 sm:max-w-64'>
        <div className='text-muted-foreground flex justify-between text-xs'>
          <span>{t('Material issued')}</span>
          <span className='tabular-nums'>{issuedPct}%</span>
        </div>
        <div className='bg-muted h-1.5 overflow-hidden rounded-full'>
          <div
            className='h-full rounded-full bg-amber-500'
            style={{ width: `${issuedPct}%` }}
          />
        </div>
      </div>
      <Link
        to={LIST as never}
        search={{ view: 'usage', orderId: info.id } as never}
        className='text-primary text-xs font-medium hover:underline sm:ml-auto'
      >
        {t('Material usage of this order')} →
      </Link>
    </div>
  )
}

function SummaryFact({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'ok' | 'danger'
}) {
  return (
    <div>
      <div className='text-muted-foreground text-xs'>{label}</div>
      <div
        className={cn(
          'font-semibold tabular-nums',
          tone === 'ok' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'danger' && 'text-rose-600 dark:text-rose-400'
        )}
      >
        {value}
      </div>
    </div>
  )
}

function OverrideDialog({
  state,
  onClose,
}: {
  state: { warnings: Warning[] } | null
  onClose: (ok: boolean) => void
}) {
  const { t } = useLanguage()
  const warnings = state?.warnings || []
  const blocked = warnings.filter((w) => !w.allowed)
  return (
    <Dialog open={!!state} onOpenChange={(open) => !open && onClose(false)}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <AlertTriangle className='h-5 w-5 text-amber-500' />
            {t('Warnings before posting')}
          </DialogTitle>
          <DialogDescription>
            {blocked.length
              ? t(
                  'Some of these need a permission you don’t have — ask a supervisor to post this voucher.'
                )
              : t(
                  'You are allowed to override these. The override is recorded on the voucher.'
                )}
          </DialogDescription>
        </DialogHeader>
        <ul className='max-h-72 space-y-2 overflow-y-auto'>
          {warnings.map((w, i) => (
            <li key={i} className='rounded-lg border p-2.5 text-sm'>
              <div className='flex flex-wrap items-center gap-2'>
                <span className='text-muted-foreground text-xs'>
                  {w.where || `${t('Line')} ${w.line}`}
                </span>
                <Badge
                  variant='outline'
                  className='h-5 border-amber-500/30 bg-amber-500/10 px-1.5 text-[10px] text-amber-700 dark:text-amber-300'
                >
                  {t(CODE_LABEL[w.code])}
                </Badge>
                <span
                  className={cn(
                    'ml-auto inline-flex items-center gap-1 text-xs',
                    w.allowed
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-rose-700 dark:text-rose-400'
                  )}
                >
                  {w.allowed ? (
                    <ShieldCheck className='h-3.5 w-3.5' />
                  ) : (
                    <ShieldAlert className='h-3.5 w-3.5' />
                  )}
                  {t(PERMISSION_LABEL[w.permission] || w.permission)}
                </span>
              </div>
              <p className='mt-1'>{w.message}</p>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant='outline' onClick={() => onClose(false)}>
            {t('Go back')}
          </Button>
          <Button disabled={!!blocked.length} onClick={() => onClose(true)}>
            {t('Override & post')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** A posted voucher: what moved, where to, who did it, and print. */
function IssueView({ issueId }: { issueId: string }) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const canSeeCosts = useCanViewManufacturingCosts()
  const costSuffix = (n: number) => (canSeeCosts ? ` · ${formatMoney(n)}` : '')
  const branchName = useBranchName()
  const { hasPermission } = usePermissions()
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)
  const { data: v, isLoading, error } = useGetMaterialIssueQuery(issueId)
  const cancelled = v?.status === 'cancelled'
  // A posted issue can be edited or deleted (cancelled); returns and cancelled ones can't.
  const changeable = !!v && v.kind === 'issue' && !cancelled
  const canEdit = changeable && hasPermission('editMaterialIssues')
  const canDelete = changeable && hasPermission('editMaterialIssues')
  // What the order still needs after this voucher (e.g. packaging short on the day).
  const { data: reqs } = useGetOrderRequirementsQuery(
    v?.productionOrderId as string,
    { skip: !v || v.kind === 'return' || cancelled }
  )
  // (A skipped query keeps its last data — so check `cancelled` here too.)
  const stillPending = (cancelled ? [] : reqs?.lines || []).filter(
    (l) =>
      !l.isOptional &&
      (l.outstandingQuantity || 0) > 1e-9 &&
      ['released', 'in_production', 'paused'].includes(reqs?.status || '')
  )

  if (isLoading) return <Skeleton className='h-96 w-full rounded-xl' />
  if (!v)
    return (
      <div className='text-muted-foreground rounded-xl border p-10 text-center text-sm'>
        {getErrorMessage(error, t('Material issue not found'))}
      </div>
    )

  const facts: [string, React.ReactNode][] = [
    [t('Date'), fmtDate(v.issueDate)],
    [
      t('Production order'),
      <Link
        key='o'
        to={
          orderPath({
            id: v.productionOrderId,
            orderType: 'production',
          }) as never
        }
        className='font-mono hover:underline'
      >
        {v.orderNumber}
      </Link>,
    ],
    [t('Source warehouse'), v.sourceLocation || '—'],
    [t('WIP location'), v.wipLocation || '—'],
    [t('Branch'), branchName || '—'],
    [t('Requested by'), v.requestedBy?.name || '—'],
    [t('Issued by'), v.issuedBy?.name || '—'],
    [t('Reference'), v.reference || '—'],
  ]
  return (
    <div className='space-y-4'>
      <nav className='text-muted-foreground flex items-center gap-1.5 text-sm'>
        <Link
          to={LIST as never}
          className='hover:text-foreground inline-flex items-center gap-1'
        >
          <ArrowLeft className='h-3.5 w-3.5' aria-hidden />
          {t('Material issues')}
        </Link>
      </nav>
      <PageHeader
        title={
          <span className='flex flex-wrap items-center gap-2'>
            {v.kind === 'return' ? t('Material return') : t('Material issue')}{' '}
            <span className={cn('font-mono', cancelled && 'line-through')}>
              {v.issueNumber}
            </span>
            {cancelled ? (
              <Badge
                variant='outline'
                className='border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
              >
                {t('Cancelled')}
              </Badge>
            ) : (
              <Badge
                variant='outline'
                className='border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              >
                {t('Posted')}
              </Badge>
            )}
            {!!v.editHistory?.length && (
              <Badge variant='outline' className='font-normal'>
                {t('Edited')} ×{v.editHistory.length}
              </Badge>
            )}
            {v.isOverIssue && (
              <Badge
                variant='outline'
                className='border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300'
              >
                {t('Over-issue')}
              </Badge>
            )}
          </span>
        }
        description={
          cancelled
            ? `${t('Reversed — its material went back to')} ${v.sourceLocation || t('stock')}${costSuffix(v.totalCost)}`
            : `${t('Moved from')} ${v.sourceLocation || t('stock')} ${t('to')} ${v.wipLocation || t('WIP')}${costSuffix(v.totalCost)}`
        }
        actions={
          <div className='flex flex-wrap gap-2'>
            {canEdit && (
              <Button asChild variant='outline'>
                <Link
                  to={`${LIST}/${v.id}` as never}
                  search={{ edit: true } as never}
                >
                  <Pencil className='mr-2 h-4 w-4' />
                  {t('Edit')}
                </Link>
              </Button>
            )}
            {canDelete && (
              <Button
                variant='outline'
                className='text-rose-600 hover:text-rose-700 dark:text-rose-400'
                onClick={() => setDeleting(true)}
              >
                <Trash2 className='mr-2 h-4 w-4' />
                {t('Delete')}
              </Button>
            )}
            <Button
              variant='outline'
              onClick={() => {
                if (
                  !printMaterialIssue(v, {
                    branchName,
                    formatMoney,
                    t,
                    hideMoney: !canSeeCosts,
                  })
                )
                  toast.error(t('Allow pop-ups for this site to print'))
              }}
            >
              <Printer className='mr-2 h-4 w-4' />
              {t('Print')}
            </Button>
            <Button asChild variant='outline'>
              <Link
                to={LIST as never}
                search={
                  { view: 'usage', orderId: v.productionOrderId } as never
                }
              >
                {t('Material usage')}
              </Link>
            </Button>
            {!cancelled && (
              <Button asChild>
                <Link
                  to={`${LIST}/new` as never}
                  search={{ orderId: v.productionOrderId } as never}
                >
                  {t('Issue more for this order')}
                </Link>
              </Button>
            )}
          </div>
        }
      />
      {cancelled && (
        <div className='flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-sm'>
          <Undo2 className='mt-0.5 h-4 w-4 shrink-0 text-rose-600' />
          <span>
            <b>{t('Cancelled')}</b> {v.cancelledAt && fmtDate(v.cancelledAt)}
            {v.cancelledBy?.name && ` ${t('by')} ${v.cancelledBy.name}`}
            {v.cancelReason && (
              <span className='text-muted-foreground'> — {v.cancelReason}</span>
            )}
            <span className='text-muted-foreground block text-xs'>
              {t(
                'Its stock movements were reversed. Kept here for the record; it no longer counts anywhere.'
              )}
            </span>
          </span>
        </div>
      )}
      {canDelete && (
        <DeleteIssueDialog
          issue={v}
          open={deleting}
          onOpenChange={setDeleting}
          onDone={() =>
            navigate({ to: `${LIST}/${v.id}` as never, replace: true })
          }
        />
      )}
      {stillPending.length > 0 && (
        <div className='flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm'>
          <AlertTriangle className='h-4 w-4 shrink-0 text-amber-500' />
          <span className='min-w-0 flex-1'>
            <b className='font-mono'>{v.orderNumber}</b> {t('still needs')}{' '}
            {stillPending
              .slice(0, 4)
              .map(
                (l) =>
                  `${l.productName} ${fmtQty(l.outstandingQuantity || 0)} ${l.unit}`
              )
              .join(', ')}
            {stillPending.length > 4 &&
              ` +${stillPending.length - 4} ${t('more')}`}
          </span>
          <Button asChild size='sm' variant='outline'>
            <Link
              to={`${LIST}/new` as never}
              search={{ orderId: v.productionOrderId } as never}
            >
              {t('Issue the rest')}
            </Link>
          </Button>
        </div>
      )}
      <dl className='bg-card grid grid-cols-2 gap-4 rounded-xl border p-4 sm:grid-cols-4'>
        {facts.map(([k, val]) => (
          <div key={k} className='min-w-0'>
            <dt className='text-muted-foreground text-xs'>{k}</dt>
            <dd className='mt-0.5 truncate text-sm font-medium'>{val}</dd>
          </div>
        ))}
      </dl>
      <div
        className={cn(
          'overflow-x-auto rounded-xl border',
          cancelled && 'opacity-60 [&_tbody_td]:line-through'
        )}
      >
        <table className='w-full min-w-[40rem] text-sm'>
          <thead className='bg-muted/40 text-muted-foreground text-xs'>
            <tr>
              <th className='px-3 py-2 text-left font-medium'>#</th>
              <th className='px-3 py-2 text-left font-medium'>
                {t('Material')}
              </th>
              <th className='px-3 py-2 text-left font-medium'>
                {t('Batch / serials')}
              </th>
              <th className='px-3 py-2 text-right font-medium'>{t('Qty')}</th>
              {canSeeCosts && (
                <>
                  <th className='px-3 py-2 text-right font-medium'>
                    {t('Unit cost')}
                  </th>
                  <th className='px-3 py-2 text-right font-medium'>
                    {t('Value')}
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {v.lines.map((l, i) => (
              <tr key={i} className='border-t'>
                <td className='text-muted-foreground px-3 py-2 tabular-nums'>
                  {i + 1}
                </td>
                <td className='px-3 py-2'>
                  <div className='font-medium'>{l.productName}</div>
                  {l.isAlternative && (
                    <div className='text-muted-foreground text-xs'>
                      {t('Alternative')}
                    </div>
                  )}
                </td>
                <td className='text-muted-foreground px-3 py-2 text-xs'>
                  {[l.batchNumber, l.serialNumbers?.join(', ')]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </td>
                <td className='px-3 py-2 text-right tabular-nums'>
                  {fmtQty(l.quantity)} {l.unit}
                </td>
                {canSeeCosts && (
                  <>
                    <td className='px-3 py-2 text-right tabular-nums'>
                      {formatMoney(l.unitCost || 0)}
                    </td>
                    <td className='px-3 py-2 text-right font-medium tabular-nums'>
                      {formatMoney(l.totalCost || 0)}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
          {canSeeCosts && (
            <tfoot>
              <tr className='border-t font-semibold'>
                <td colSpan={5} className='px-3 py-2 text-right'>
                  {t('Total value')}
                </td>
                <td className='px-3 py-2 text-right tabular-nums'>
                  {formatMoney(v.totalCost)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {!!v.overrides?.length && (
        <div className='rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm'>
          <div className='mb-1 flex items-center gap-2 font-medium'>
            <AlertTriangle className='h-4 w-4 text-amber-500' />
            {t('Warnings overridden when posting')}
          </div>
          <ul className='text-muted-foreground list-disc space-y-0.5 pl-5'>
            {v.overrides.map((o, i) => (
              <li key={i}>
                {t('Line')} {o.line}: {o.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {v.notes && (
        <p className='text-muted-foreground text-sm'>
          <span className='text-foreground font-medium'>{t('Notes')}:</span>{' '}
          {v.notes}
        </p>
      )}
      {!!v.editHistory?.length && (
        <section className='space-y-2'>
          <h3 className='text-sm font-semibold'>{t('History')}</h3>
          <ol className='bg-card divide-y rounded-xl border text-sm'>
            {[...v.editHistory].reverse().map((h, i) => (
              <li
                key={i}
                className='flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2.5'
              >
                <Badge
                  variant='outline'
                  className={cn(
                    'h-5 px-1.5 text-[10px] font-medium',
                    h.kind === 'lines'
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      : 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300'
                  )}
                >
                  {h.kind === 'lines' ? t('Re-posted') : t('Details')}
                </Badge>
                <span className='min-w-0 flex-1'>
                  {h.summary}
                  {h.note && (
                    <span className='text-muted-foreground'> — “{h.note}”</span>
                  )}
                  {canSeeCosts &&
                    h.kind === 'lines' &&
                    h.previousTotal !== undefined &&
                    h.newTotal !== undefined && (
                      <span className='text-muted-foreground block text-xs tabular-nums'>
                        {formatMoney(h.previousTotal)} →{' '}
                        {formatMoney(h.newTotal)}
                      </span>
                    )}
                </span>
                <span className='text-muted-foreground text-xs'>
                  {fmtDate(h.at)}
                  {h.by?.name && ` · ${h.by.name}`}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}

const PENDING_TYPES: { value: string; label: string }[] = [
  { value: 'packaging_material', label: 'Packaging' },
  { value: 'raw_material', label: 'Raw materials' },
  { value: 'component', label: 'Components' },
  { value: 'sub_assembly', label: 'Sub-assemblies' },
  { value: 'by_product', label: 'By-products' },
  { value: 'unclassified', label: 'Unclassified' },
]

/**
 * "Materials only": what open orders still need, by type — add one material, or load
 * everything pending of that type in one go.
 */
function PendingPanel({
  materials,
  loading,
  type,
  onTypeChange,
  onAdd,
}: {
  materials?: PendingMaterial[]
  loading: boolean
  type: string
  onTypeChange: (type: string) => void
  onAdd: (materials: PendingMaterial[]) => void
}) {
  const { t } = useLanguage()
  if (loading || !materials)
    return <Skeleton className='h-[120px] w-full rounded-xl' />
  const typeOf = (m: PendingMaterial) =>
    (m.productType as ProductType | null) || 'unclassified'
  const count = (value: string) =>
    materials.filter((m) => value === 'all' || typeOf(m) === value).length
  const shown = materials.filter((m) => type === 'all' || typeOf(m) === type)
  const orderCount = new Set(
    shown.flatMap((m) => m.orders.map((o) => o.orderId))
  ).size
  if (!materials.length)
    return (
      <div className='text-muted-foreground flex items-center gap-2 rounded-xl border border-dashed p-3 text-sm'>
        <PackageCheck className='h-4 w-4 shrink-0 text-emerald-600' />
        {t(
          'Nothing pending — every open production order has all its materials issued.'
        )}
      </div>
    )
  return (
    <div className='bg-card space-y-3 rounded-xl border p-3 sm:p-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='min-w-0'>
          <div className='text-sm font-semibold'>
            {t('Still to issue for open orders')}
          </div>
          <div className='text-muted-foreground text-xs'>
            {shown.length} {t('material(s)')} · {orderCount} {t('order(s)')} ·{' '}
            {t('each line goes to the order that needs it first')}
          </div>
        </div>
        <Button
          size='sm'
          disabled={!shown.length}
          onClick={() => onAdd(shown)}
          className='max-sm:w-full'
        >
          <PackagePlus className='mr-1.5 h-4 w-4' />
          {t('Load all pending')} ({shown.length})
        </Button>
      </div>
      <div
        role='group'
        aria-label={t('Pending by type')}
        className='flex flex-wrap gap-1.5'
      >
        {[{ value: 'all', label: 'All' }, ...PENDING_TYPES]
          .filter((o) => o.value === 'all' || count(o.value) > 0)
          .map((o) => (
            <button
              key={o.value}
              type='button'
              aria-pressed={type === o.value}
              onClick={() => onTypeChange(o.value)}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
                type === o.value
                  ? 'border-foreground bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t(o.label)}
              <span className='tabular-nums opacity-70'>{count(o.value)}</span>
            </button>
          ))}
      </div>
      <ul className='grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3'>
        {shown.slice(0, 6).map((m) => {
          const short = m.available < m.outstanding - 1e-9
          return (
            <li key={`${m.productId}:${m.variantId || ''}`}>
              <button
                type='button'
                onClick={() => onAdd([m])}
                className='hover:bg-muted/60 flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors'
                title={m.orders
                  .map(
                    (o) =>
                      `${o.orderNumber} ${t('needs')} ${fmtQty(o.outstanding)}`
                  )
                  .join('\n')}
              >
                <span className='min-w-0 flex-1'>
                  <span className='block truncate text-sm font-medium'>
                    {m.productName}
                  </span>
                  <span className='text-muted-foreground block truncate text-xs'>
                    {t('Needs')} {fmtQty(m.outstanding)} {getUnitLabel(m.unit)}{' '}
                    · {m.orders.map((o) => o.orderNumber).join(', ')}
                  </span>
                </span>
                <span
                  className={cn(
                    'shrink-0 text-xs tabular-nums',
                    short
                      ? 'font-medium text-rose-600 dark:text-rose-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                  )}
                >
                  {t('Stock')} {fmtQty(m.available)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {shown.length > 6 && (
        <p className='text-muted-foreground text-xs'>
          +{shown.length - 6} {t('more — load them all, or search on the grid')}
        </p>
      )}
    </div>
  )
}

/** A by-material post wrote one voucher per order — list them. */
function PostedDialog({
  issues,
  onClose,
  onNew,
}: {
  issues: MaterialIssue[] | null
  onClose: () => void
  onNew: () => void
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const canSeeCosts = useCanViewManufacturingCosts()
  const branchName = useBranchName()
  const list = issues || []
  const total = list.reduce((s, v) => s + (v.totalCost || 0), 0)
  return (
    <Dialog open={!!issues} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <PackageCheck className='h-5 w-5 text-emerald-600' />
            {t('Issued to')} {list.length} {t('production orders')}
          </DialogTitle>
          <DialogDescription>
            {t('One voucher per order, posted together.')}{' '}
            {canSeeCosts && formatMoney(total)}
          </DialogDescription>
        </DialogHeader>
        <ul className='divide-y rounded-lg border'>
          {list.map((v) => (
            <li
              key={v.id}
              className='flex items-center justify-between gap-3 px-3 py-2.5 text-sm'
            >
              <span className='min-w-0'>
                <Link
                  to={`${LIST}/${v.id}` as never}
                  className='font-mono font-medium hover:underline'
                >
                  {v.issueNumber}
                </Link>
                <span className='text-muted-foreground'>
                  {' '}
                  → {v.orderNumber} · {v.lines.length} {t('line(s)')}
                </span>
              </span>
              {canSeeCosts && (
                <span className='shrink-0 tabular-nums'>
                  {formatMoney(v.totalCost)}
                </span>
              )}
            </li>
          ))}
        </ul>
        <DialogFooter className='gap-2'>
          <Button
            variant='outline'
            onClick={() => {
              const blocked = list.some(
                (v) =>
                  !printMaterialIssue(v, {
                    branchName,
                    formatMoney,
                    t,
                    hideMoney: !canSeeCosts,
                  })
              )
              if (blocked)
                toast.error(t('Allow pop-ups for this site to print'))
            }}
          >
            <Printer className='mr-1.5 h-4 w-4' />
            {t('Print all')}
          </Button>
          <Button variant='outline' onClick={onNew}>
            {t('Issue more')}
          </Button>
          <Button onClick={onClose}>{t('Done')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Editing a posted voucher: what saving does — or why its lines are locked. */
function EditBanner({
  issue,
  locked,
}: {
  issue: MaterialIssue
  locked: EditContext['locked']
}) {
  const { t } = useLanguage()
  if (locked.length)
    return (
      <div className='flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm'>
        <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0 text-amber-500' />
        <span>
          <b>{t('Quantities are locked.')}</b>{' '}
          {locked
            .map(
              (l) => `${fmtQty(l.gone)} ${l.unit} ${t('of')} ${l.productName}`
            )
            .join(', ')}{' '}
          {t('already used in output, scrapped or returned.')}{' '}
          <span className='text-muted-foreground'>
            {t('You can still change the date, people, reference and notes.')}
          </span>
        </span>
      </div>
    )
  return (
    <div className='flex items-start gap-2.5 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3 text-sm'>
      <Pencil className='mt-0.5 h-4 w-4 shrink-0 text-sky-600' />
      <span>
        <b>{t('Editing a posted voucher.')}</b>{' '}
        {t(
          'Changing quantities or materials puts this voucher’s material back into stock and issues the new quantities under the same number'
        )}{' '}
        <span className='font-mono'>{issue.issueNumber}</span>.{' '}
        <span className='text-muted-foreground'>
          {t(
            'Changing only the date, people, reference or notes moves no stock. Every change is kept in its history.'
          )}
        </span>
      </span>
    </div>
  )
}
