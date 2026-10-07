import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'
import { inventoryApi } from './inventory.api'
import { productApi } from './product.api'
import { purchaseCatalogApi } from './purchaseCatalog.api'

/**
 * Manufacturing module (server: routes/v1/manufacturing.route.js). Issues, receipts and
 * finished-goods scrap move real branch stock, so — like stockAdjustment.api.ts — they
 * also refresh the product catalog caches that live in other RTK Query slices.
 */
// Same untyped lifecycle signature as stockAdjustment.api.ts — it's shared by three
// mutations with different arg/result types.
const invalidateStockCaches = async (
  _arg: unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { dispatch, queryFulfilled }: any
) => {
  try {
    await queryFulfilled
    dispatch(purchaseCatalogApi.util.invalidateTags(['PurchaseCatalog']))
    dispatch(productApi.util.invalidateTags(['Product']))
    dispatch(inventoryApi.util.invalidateTags(['Inventory'] as never))
  } catch {
    // mutation failed — nothing to invalidate
  }
}

// ── Shared types ──────────────────────────────────────────────────────────────────
export type ProductType =
  | 'raw_material'
  | 'component'
  | 'packaging_material'
  | 'sub_assembly'
  | 'wip'
  | 'finished_good'
  | 'by_product'
  | 'scrap'
  | 'service'
export type ProcurementType = 'buy' | 'make' | 'buy_or_make'
export type ProductionStatus =
  | 'draft'
  | 'planned'
  | 'released'
  | 'in_production'
  | 'paused'
  | 'qc_pending'
  | 'completed'
  | 'cancelled'
export type OrderType = 'production' | 'assembly'
export type ProductionPriority = 'low' | 'normal' | 'high' | 'urgent'
export type ScrapStage =
  | 'material'
  | 'wip'
  | 'qc_reject'
  | 'rework'
  | 'finished_good'
export type RejectDisposition = 'scrap' | 'rework'
export type StockBucket = 'available' | 'wip' | 'qc' | 'rework'
export type ScrapReason =
  | 'defect'
  | 'damage'
  | 'process_loss'
  | 'expired'
  | 'setup'
  | 'rework'
  | 'other'

export interface Paginated<T> {
  results: T[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

type Ref = string | { id?: string; _id?: string; name?: string; email?: string }

export interface ManufacturingProduct {
  id: string
  name: string
  nameUrdu?: string
  sku?: string
  barcode?: string
  unit: string
  cost: number
  price: number
  stockQuantity: number
  hasVariants: boolean
  isActive: boolean
  image?: { url?: string }
  productType: ProductType | null
  procurementType: ProcurementType | null
  defaultBomId: string | null
  manufacturingLeadTimeDays: number | null
  bomCount: number
  activeBomCount: number
}

export interface BomAlternative {
  productId: string
  variantId?: string | null
  productName?: string
  ratio: number
}

export interface BomComponent {
  _id?: string
  productId: string
  variantId?: string | null
  productName?: string
  sku?: string
  quantity: number
  unit: string
  scrapPercent: number
  isOptional: boolean
  childBomId?: string | null
  alternatives: BomAlternative[]
  notes?: string
  sequence?: number
}

export interface Bom {
  id: string
  bomNumber: string
  version: number
  name: string
  productId: string
  variantId?: string | null
  productName: string
  quantity: number
  unit: string
  components: BomComponent[]
  notes?: string
  isActive: boolean
  isDefault: boolean
  isLocked: boolean
  effectiveFrom?: string | null
  effectiveTo?: string | null
  createdAt: string
  updatedAt: string
}

export interface BomInput {
  productId?: string
  variantId?: string | null
  name?: string
  quantity?: number
  unit?: string
  components?: Omit<BomComponent, 'productName' | 'sku'>[]
  notes?: string
  isActive?: boolean
  isDefault?: boolean
  effectiveFrom?: string | null
  effectiveTo?: string | null
}

export interface BomTreeNode {
  componentId?: string
  productId: string
  variantId?: string | null
  productName: string
  sku?: string
  unit: string
  baseQuantity: number
  requiredQuantity: number
  scrapPercent: number
  isOptional: boolean
  level: number
  alternatives: BomAlternative[]
  childBom: { id: string; bomNumber: string; version: number } | null
  children: BomTreeNode[]
}

export interface BomExplosion {
  tree: {
    bomId: string
    bomNumber: string
    version: number
    productId: string
    productName: string
    quantity: number
    unit: string
    children: BomTreeNode[]
  }
  lines: Omit<
    BomTreeNode,
    'children' | 'childBom' | 'componentId' | 'scrapPercent'
  >[]
}

export interface WhereUsedEntry {
  id: string
  bomNumber: string
  version: number
  name: string
  productId: string
  productName: string
  isActive: boolean
  isDefault: boolean
  quantity: number
  unit?: string
}

export interface ProductionMaterial {
  _id: string
  productId: string
  variantId?: string | null
  productName: string
  sku?: string
  unit: string
  baseQuantity: number
  requiredQuantity: number
  /** All in the line's own units; in WIP = issued − returned − consumed − scrapped. */
  issuedQuantity: number
  issuedCost: number
  returnedQuantity: number
  consumedQuantity: number
  consumedCost: number
  scrappedQuantity: number
  isOptional: boolean
  level: number
  alternatives: BomAlternative[]
}

export interface WipLot {
  _id: string
  materialLineId: string
  productId: string
  variantId?: string | null
  productName: string
  unit: string
  batchId?: string | null
  batchNumber?: string
  imeiIds?: string[]
  serialNumbers?: string[]
  quantity: number
  ratio: number
  isAlternative: boolean
  unitCost: number
  issuedAt: string
}

export interface ProductionOrder {
  id: string
  orderNumber: string
  /** 'assembly' orders build (sub-)assemblies with the same engine and their own lifecycle. */
  orderType: OrderType
  parentOrderId?: string | null
  parentMaterialLineId?: string | null
  operatorId?: string | null
  operatorName?: string
  productId: string
  variantId?: string | null
  productName: string
  sku?: string
  unit: string
  bomId?: string | null
  bomNumber?: string
  bomVersion?: number
  plannedQuantity: number
  /** Reported off the line; good units land in completedQuantity after inspection. */
  producedQuantity: number
  completedQuantity: number
  rejectedQuantity: number
  qcPendingQuantity: number
  reworkPendingQuantity: number
  reworkedGoodQuantity: number
  scrappedQuantity: number
  plannedStartDate?: string | null
  plannedCompletionDate?: string | null
  actualStartDate?: string | null
  actualCompletionDate?: string | null
  sourceLocation: string
  wipLocation: string
  finishedGoodsLocation: string
  status: ProductionStatus
  priority: ProductionPriority
  notes?: string
  materials: ProductionMaterial[]
  wipLots: WipLot[]
  materialCost: number
  finishedGoodsValue: number
  statusHistory: {
    from?: string | null
    to: ProductionStatus
    note?: string
    by?: string
    at: string
  }[]
  createdBy?: Ref
  createdAt: string
  updatedAt: string
}

export interface ProductionOrderInput {
  productId?: string
  variantId?: string | null
  bomId?: string | null
  plannedQuantity?: number
  plannedStartDate?: string | null
  plannedCompletionDate?: string | null
  sourceLocation?: string
  wipLocation?: string
  finishedGoodsLocation?: string
  priority?: ProductionPriority
  notes?: string
  status?: 'draft' | 'planned'
  orderType?: OrderType
  operatorId?: string | null
  parentOrderId?: string | null
  parentMaterialLineId?: string | null
}

export interface RequirementLine {
  materialLineId?: string
  branchId?: string
  productId: string
  variantId?: string | null
  productName: string
  sku?: string
  unit: string
  level?: number
  isOptional?: boolean
  requiredQuantity: number
  issuedQuantity?: number
  outstandingQuantity?: number
  availableQuantity: number
  shortageQuantity: number
  alternatives?: BomAlternative[]
  orders?: {
    orderId: string
    orderNumber: string
    status: ProductionStatus
    quantity: number
  }[]
}

export interface OrderRequirements {
  orderId: string
  orderNumber: string
  status: ProductionStatus
  lines: RequirementLine[]
  shortageCount: number
}

export interface AggregatedRequirements {
  orderCount: number
  materialCount: number
  shortageCount: number
  lines: RequirementLine[]
}

export interface MaterialIssue {
  id: string
  issueNumber: string
  kind: 'issue' | 'return'
  isOverIssue?: boolean
  productionOrderId: string
  orderNumber: string
  issueDate: string
  lines: {
    materialLineId: string
    productId: string
    productName: string
    unit: string
    quantity: number
    creditedQuantity: number
    isAlternative: boolean
    unitCost: number
    totalCost: number
    balanceAfter?: number
    batchNumber?: string
    serialNumbers?: string[]
  }[]
  totalCost: number
  notes?: string
  createdBy?: Ref
  createdAt: string
}

export interface ProductionReceipt {
  id: string
  receiptNumber: string
  productionOrderId: string
  orderNumber: string
  productId: string
  productName: string
  unit: string
  quantity: number
  unitCost: number
  totalCost: number
  location?: string
  receiptDate: string
  balanceAfter?: number
  source?: 'output' | 'rework' | 'direct'
  batchId?: string | null
  batchNumber?: string
  expiryDate?: string | null
  imeiIds?: string[]
  serialNumbers?: string[]
  notes?: string
  createdBy?: Ref
  createdAt: string
}

export interface ScrapRecord {
  id: string
  scrapNumber: string
  productionOrderId?: string | null
  orderNumber?: string
  productId: string
  productName: string
  unit: string
  stage: ScrapStage
  reason: ScrapReason
  quantity: number
  unitCost: number
  totalCost: number
  affectsStock: boolean
  scrapDate: string
  notes?: string
  createdBy?: Ref
  createdAt: string
}

export interface ProductionOutput {
  id: string
  outputNumber: string
  productionOrderId: string
  orderNumber: string
  productId: string
  productName: string
  unit: string
  producedQuantity: number
  goodQuantity: number
  rejectedQuantity: number
  rejectDisposition?: RejectDisposition | null
  rejectReason?: string
  status: 'pending_qc' | 'inspected'
  consumption: {
    productName: string
    unit: string
    quantity: number
    cost: number
  }[]
  materialCost: number
  unitCost: number
  reportedAt: string
  reportedBy?: Ref
  inspectedAt?: string | null
  inspectedBy?: Ref
  inspectionNotes?: string
  notes?: string
  createdAt: string
}

export interface StockMovement {
  id: string
  type: string
  stockBucket: StockBucket
  productId?: { id?: string; _id?: string; name: string; sku?: string } | string
  unit?: string
  quantityDelta: number
  balanceAfter: number
  unitCost?: number
  refType?: string
  refId?: string
  productionOrderId?: string
  warehouseId?: string
  location?: string
  batchId?: { id?: string; batchNumber: string } | string | null
  serialNumbers?: string[]
  createdBy?: Ref
  createdAt: string
}

export interface StockDetail {
  productId: string
  variantId: string | null
  name: string
  unit: string
  available: number
  unitCost: number
  tracking: { batch: boolean; serial: boolean }
  batches: {
    id: string
    batchNumber: string
    quantity: number
    expiryDate?: string | null
    costPerUnit: number
  }[]
  serials: {
    id: string
    number: string
    number2: string
    batchId: string | null
  }[]
}

export interface FinishedGoodsInput {
  batchNumber?: string
  expiryDate?: string | null
  serialNumbers?: string[]
  location?: string
}

export interface OrderStatusCounts {
  byStatus: Partial<Record<ProductionStatus, number>>
  total: number
  open: number
  overdue: number
  delayed: number
  inProduction: number
  paused: number
  planned: number
  completed: number
  cancelled: number
  plannedQuantity: number
  materialCost: number
}

/** Query params the Production Orders toolbar sends (lists are comma-separated). */
export interface OrderListParams {
  search?: string
  orderNumber?: string
  product?: string
  status?: string
  priority?: string
  orderType?: OrderType
  parentOrderId?: string
  productId?: string
  operatorId?: string
  createdBy?: string
  bomId?: string
  branchId?: string
  warehouse?: string
  workCenter?: string
  productType?: string
  productionFrom?: string
  productionTo?: string
  dueFrom?: string
  dueTo?: string
  completedFrom?: string
  completedTo?: string
  quantityMin?: number
  quantityMax?: number
  completionMin?: number
  completionMax?: number
  delayed?: boolean
  overdue?: boolean
  hasShortage?: boolean
  hasQcIssue?: boolean
  hasScrap?: boolean
  hasRework?: boolean
  sort?: OrderSort
  dir?: 'asc' | 'desc'
}

export type OrderSort =
  | 'newest'
  | 'oldest'
  | 'due'
  | 'quantity'
  | 'priority'
  | 'status'
  | 'completion'
  | 'cost'

/** A list row: the order plus the flags the server derives for badges. */
export interface ProductionOrderRow extends ProductionOrder {
  completionPercent: number
  isOverdue: boolean
  isDelayed: boolean
  daysLate: number
  hasShortage: boolean
  hasQcIssue: boolean
  hasRework: boolean
}

export interface OrderFilterOptions {
  workCenters: string[]
  warehouses: string[]
  operators: { id: string; name: string }[]
  createdBy: { id: string; name: string; email?: string }[]
  boms: { id: string; label: string; productName: string }[]
  branches: { id: string; name: string }[]
}

export interface OrderExportRow {
  id: string
  orderNumber: string
  orderType: OrderType
  productName: string
  sku: string
  bom: string
  status: ProductionStatus
  priority: ProductionPriority
  plannedQuantity: number
  completedQuantity: number
  rejectedQuantity: number
  unit: string
  completionPercent: number
  plannedStartDate?: string | null
  plannedCompletionDate?: string | null
  actualCompletionDate?: string | null
  workCenter: string
  warehouse: string
  branch: string
  operator: string
  createdBy: string
  materialCost: number
  isDelayed: boolean
  isOverdue: boolean
  hasShortage: boolean
  createdAt: string
}

export interface OrderExport {
  totalResults: number
  truncated: boolean
  results: OrderExportRow[]
}

export interface OrderTreeNode {
  id: string
  orderNumber: string
  orderType: OrderType
  productId: string
  productName: string
  unit: string
  plannedQuantity: number
  producedQuantity: number
  completedQuantity: number
  status: ProductionStatus
  operatorName: string
  parentMaterialLineId: string | null
  children?: OrderTreeNode[]
}

export interface TraceOrderSummary {
  id: string
  orderNumber: string
  orderType: OrderType
  productId: string
  productName: string
  unit: string
  plannedQuantity: number
  completedQuantity: number
  status: ProductionStatus
  operatorName: string
  actualCompletionDate?: string | null
}

export interface TraceProduced {
  receiptId: string
  receiptNumber: string
  quantity: number
  unit: string
  date: string
  source?: string
  batch: { id: string; batchNumber: string; expiryDate?: string | null } | null
  serials: { id: string | null; number: string }[]
}

export interface TraceSource {
  kind: 'purchase' | 'production' | 'untracked'
  linked?: boolean
  serials?: { id: string; number: string }[]
  supplier?: { id: string | null; name: string } | null
  purchase?: { id: string; number: string; date?: string } | null
  order?: TraceNode
}

export interface TraceComponent {
  productId: string
  productName: string
  unit: string
  quantity: number
  batch: { id: string; batchNumber: string; expiryDate?: string | null } | null
  sources: TraceSource[]
}

export interface TraceNode {
  order: TraceOrderSummary
  produced: TraceProduced[]
  components: TraceComponent[]
  truncated?: boolean
}

export interface WhereUsedNode {
  order: TraceOrderSummary
  quantityUsed: number
  unit: string
  produced: TraceProduced[]
  usedIn: WhereUsedNode[]
  truncated?: boolean
}

export interface TraceLookupHit {
  kind: 'serial' | 'batch' | 'order'
  id: string
  label: string
  productName: string
  madeHere?: boolean
  status?: string
  quantity?: number
  orderType?: OrderType
}

export interface WipRow {
  id: string
  orderNumber: string
  orderType?: OrderType
  productName: string
  sku?: string
  unit: string
  status: ProductionStatus
  priority: ProductionPriority
  plannedQuantity: number
  producedQuantity: number
  completedQuantity: number
  rejectedQuantity: number
  qcPendingQuantity: number
  reworkPendingQuantity: number
  scrappedQuantity: number
  remainingQuantity: number
  materialIssuedPercent: number
  outputPercent: number
  materialCost: number
  finishedGoodsValue: number
  wipValue: number
  wipItems: {
    id: string
    productName: string
    unit: string
    quantity: number
    batchNumber?: string
    serialCount: number
  }[]
  wipLocation?: string
  plannedStartDate?: string | null
  plannedCompletionDate?: string | null
  actualStartDate?: string | null
  isOverdue: boolean
}

export interface WipSummary {
  orders: WipRow[]
  totals: {
    orderCount: number
    wipValue: number
    materialCost: number
    qcPendingQuantity: number
    reworkPendingQuantity: number
    overdueCount: number
  }
}

export interface Assembly
  extends Omit<ManufacturingProduct, 'bomCount' | 'activeBomCount'> {
  defaultBom: {
    id: string
    bomNumber: string
    version: number
    quantity: number
    unit: string
    componentCount: number
    isLocked: boolean
  } | null
  usedIn: {
    id: string
    bomNumber: string
    version: number
    productName: string
    isActive: boolean
  }[]
}

export interface DashboardOrder {
  id: string
  orderNumber: string
  orderType?: OrderType
  productName: string
  plannedQuantity: number
  completedQuantity: number
  unit: string
  status: ProductionStatus
  priority: ProductionPriority
  plannedCompletionDate?: string | null
  createdAt?: string
}

export interface ManufacturingDashboard {
  byStatus: Record<ProductionStatus, number>
  openOrders: number
  inProgress: number
  overdue: number
  wipValue: number
  qcPendingQuantity: number
  reworkPendingQuantity: number
  month: {
    producedQuantity: number
    producedValue: number
    receiptCount: number
    materialIssuedValue: number
    issueCount: number
    scrapQuantity: number
    scrapValue: number
    scrapCount: number
  }
  activeBoms: number
  productTypes: Record<ProductType | 'unclassified', number>
  dueSoon: DashboardOrder[]
  recentOrders: DashboardOrder[]
  outputTrend: { date: string; quantity: number; value: number }[]
  shortages: RequirementLine[]
  shortageCount: number
}

export type AnalyticsRange = '7d' | '30d' | '90d' | 'mtd'

export interface AnalyticsBucket {
  /** Business calendar day (YYYY-MM-DD); the first day of the week for weekly buckets. */
  key: string
  produced: number
  previous: number
  target: number
  goodCost: number
  scrapCost: number
  scrapRate: number
}

export type AlertSeverity = 'critical' | 'warning' | 'success' | 'info'

export interface ProductionAlert {
  id: string
  kind: 'shortage' | 'delayed' | 'scrap' | 'qc' | 'completed'
  severity: AlertSeverity
  title: string
  message: string
  at?: string
  link: { order?: string; orderType?: OrderType; to?: string }
}

export interface ManufacturingAnalytics {
  range: AnalyticsRange
  granularity: 'day' | 'week'
  period: { start: string; end: string; days: number; today: string }
  kpis: {
    productionOrders: { total: number; inProduction: number; completed: number }
    inProduction: { count: number; paused: number; released: number }
    completedToday: { orders: number; units: number }
    unitsProduced: {
      quantity: number
      value: number
      previous: number
      change: number | null
    }
    wipValue: { value: number; orders: number }
    materialShortages: { count: number; orders: number }
    qcIssues: {
      rejected: number
      inspected: number
      rejectRate: number
      awaiting: number
    }
    scrapRate: { rate: number; previous: number; change: number; value: number }
  }
  series: AnalyticsBucket[]
  materialConsumption: {
    rows: {
      productId: string
      productName: string
      unit: string
      quantity: number
      cost: number
    }[]
    other: { count: number; cost: number } | null
  }
  productionByProduct: {
    rows: {
      productId: string
      productName: string
      unit: string
      quantity: number
      value: number
    }[]
    other: { count: number; value: number } | null
  }
  productionByWorkCenter: {
    workCenter: string | null
    quantity: number
    value: number
    scrapCost: number
    scrapRate: number
  }[]
  orderStatus: Record<ProductionStatus, number>
  alerts: ProductionAlert[]
  alertCounts: Partial<Record<AlertSeverity, number>>
}

export interface ManufacturingSettings {
  id: string
  prefixes: {
    bom: string
    productionOrder: string
    assemblyOrder: string
    materialIssue: string
    materialReturn: string
    productionOutput: string
    productionReceipt: string
    scrap: string
  }
  numberPadding: number
  defaultSourceLocation: string
  defaultWipLocation: string
  defaultFinishedGoodsLocation: string
  allowNegativeStockIssue: boolean
  allowOverProduction: boolean
  requireBomForProduction: boolean
  explodeSubAssemblies: boolean
  requireQualityCheck: boolean
  defaultRejectDisposition: RejectDisposition
  defaultPriority: ProductionPriority
  counters: Record<string, number>
}

interface ListParams {
  page?: number
  limit?: number
  search?: string
  sortBy?: string
}

const TAGS = [
  'MfgDashboard',
  'MfgProduct',
  'MfgBom',
  'MfgOrder',
  'MfgRequirements',
  'MfgIssue',
  'MfgReceipt',
  'MfgScrap',
  'MfgWip',
  'MfgSettings',
  'MfgOutput',
  'MfgMovement',
  'MfgDemo',
] as const

/** Everything a stock movement can change. */
const EXECUTION_TAGS = [
  'MfgDashboard',
  'MfgOrder',
  'MfgRequirements',
  'MfgIssue',
  'MfgReceipt',
  'MfgScrap',
  'MfgWip',
  'MfgProduct',
  'MfgOutput',
  'MfgMovement',
] as const

export interface DemoDataJob {
  /** `interrupted`: still marked running but its heartbeat went stale (server restarted). */
  state: 'running' | 'done' | 'failed' | 'interrupted'
  action: 'load' | 'reload'
  step: number
  total: number
  percent: number
  message: string
  error: string
  result: Record<string, number> | null
  startedAt?: string
  finishedAt?: string
}

export interface DemoDataStatus {
  hasDemoData: boolean
  products: number
  boms: number
  orders: number
  issues: number
  returns: number
  outputs: number
  receipts: number
  scrap: number
  job: DemoDataJob | null
}

/** Loading or removing demo data touches every manufacturing list and the catalog. */
const ALL_DATA_TAGS = [
  ...EXECUTION_TAGS,
  'MfgBom',
  'MfgSettings',
  'MfgDemo',
] as const

export const manufacturingApi = createApi({
  reducerPath: 'manufacturingApi',
  baseQuery,
  tagTypes: TAGS,
  endpoints: (builder) => ({
    getManufacturingDashboard: builder.query<ManufacturingDashboard, void>({
      query: () => '/manufacturing/dashboard',
      providesTags: ['MfgDashboard'],
    }),
    getManufacturingAnalytics: builder.query<
      ManufacturingAnalytics,
      { range: AnalyticsRange }
    >({
      query: (params) => ({
        url: '/manufacturing/dashboard/analytics',
        params,
      }),
      providesTags: ['MfgDashboard'],
    }),

    // Settings
    getManufacturingSettings: builder.query<ManufacturingSettings, void>({
      query: () => '/manufacturing/settings',
      providesTags: ['MfgSettings'],
    }),
    updateManufacturingSettings: builder.mutation<
      ManufacturingSettings,
      Partial<ManufacturingSettings>
    >({
      query: (body) => ({
        url: '/manufacturing/settings',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['MfgSettings'],
    }),

    // Demo data (current branch)
    getDemoDataStatus: builder.query<DemoDataStatus, void>({
      query: () => '/manufacturing/demo-data',
      providesTags: ['MfgDemo'],
    }),
    // Starts a background load (202) — progress arrives through getDemoDataStatus.
    loadDemoData: builder.mutation<DemoDataJob, { reload?: boolean } | void>({
      query: (body) => ({
        url: '/manufacturing/demo-data',
        method: 'POST',
        body: body ?? {},
      }),
      invalidatesTags: ['MfgDemo'],
    }),
    removeDemoData: builder.mutation<Record<string, number>, void>({
      query: () => ({ url: '/manufacturing/demo-data', method: 'DELETE' }),
      invalidatesTags: [...ALL_DATA_TAGS],
      onQueryStarted: invalidateStockCaches,
    }),

    // Products
    getManufacturingProducts: builder.query<
      Paginated<ManufacturingProduct>,
      ListParams & {
        productType?: string
        classifiedOnly?: boolean
        hasBom?: boolean
      }
    >({
      query: (params) => ({ url: '/manufacturing/products', params }),
      providesTags: ['MfgProduct'],
    }),
    getProductTypeSummary: builder.query<
      Record<ProductType | 'unclassified', number>,
      void
    >({
      query: () => '/manufacturing/products/type-summary',
      providesTags: ['MfgProduct'],
    }),
    updateManufacturingProduct: builder.mutation<
      ManufacturingProduct,
      {
        productId: string
        productType?: ProductType | null
        procurementType?: ProcurementType | null
        manufacturingLeadTimeDays?: number | null
        defaultBomId?: string | null
      }
    >({
      query: ({ productId, ...body }) => ({
        url: `/manufacturing/products/${productId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['MfgProduct', 'MfgBom', 'MfgDashboard'],
      onQueryStarted: async (_arg, { dispatch, queryFulfilled }) => {
        try {
          await queryFulfilled
          dispatch(productApi.util.invalidateTags(['Product']))
        } catch {
          // ignore
        }
      },
    }),
    bulkClassifyProducts: builder.mutation<
      { matched: number; modified: number },
      {
        productIds: string[]
        productType: ProductType | null
        procurementType?: ProcurementType | null
      }
    >({
      query: (body) => ({
        url: '/manufacturing/products/bulk-classify',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['MfgProduct', 'MfgDashboard'],
    }),
    getWhereUsed: builder.query<WhereUsedEntry[], string>({
      query: (productId) => `/manufacturing/products/${productId}/where-used`,
      providesTags: ['MfgBom'],
    }),
    getAssemblies: builder.query<Assembly[], void>({
      query: () => '/manufacturing/assemblies',
      providesTags: ['MfgBom', 'MfgProduct'],
    }),

    // BOMs
    getBoms: builder.query<
      Paginated<Bom>,
      ListParams & {
        productId?: string
        isActive?: boolean
        isDefault?: boolean
        bomNumber?: string
      }
    >({
      query: (params) => ({ url: '/manufacturing/boms', params }),
      providesTags: ['MfgBom'],
    }),
    getBom: builder.query<Bom, string>({
      query: (id) => `/manufacturing/boms/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'MfgBom', id }],
    }),
    getBomVersions: builder.query<Bom[], string>({
      query: (id) => `/manufacturing/boms/${id}/versions`,
      providesTags: ['MfgBom'],
    }),
    explodeBom: builder.query<
      BomExplosion,
      { bomId: string; quantity?: number; explode?: boolean }
    >({
      query: ({ bomId, ...params }) => ({
        url: `/manufacturing/boms/${bomId}/explode`,
        params,
      }),
      providesTags: ['MfgBom'],
    }),
    createBom: builder.mutation<Bom, BomInput>({
      query: (body) => ({ url: '/manufacturing/boms', method: 'POST', body }),
      invalidatesTags: ['MfgBom', 'MfgProduct', 'MfgDashboard'],
    }),
    updateBom: builder.mutation<Bom, { bomId: string } & BomInput>({
      query: ({ bomId, ...body }) => ({
        url: `/manufacturing/boms/${bomId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['MfgBom', 'MfgProduct', 'MfgDashboard'],
    }),
    createBomVersion: builder.mutation<Bom, { bomId: string } & BomInput>({
      query: ({ bomId, ...body }) => ({
        url: `/manufacturing/boms/${bomId}/versions`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['MfgBom', 'MfgProduct', 'MfgDashboard'],
    }),
    setDefaultBom: builder.mutation<Bom, string>({
      query: (bomId) => ({
        url: `/manufacturing/boms/${bomId}/set-default`,
        method: 'POST',
      }),
      invalidatesTags: ['MfgBom', 'MfgProduct'],
    }),
    setBomActive: builder.mutation<Bom, { bomId: string; isActive: boolean }>({
      query: ({ bomId, isActive }) => ({
        url: `/manufacturing/boms/${bomId}/set-active`,
        method: 'POST',
        body: { isActive },
      }),
      invalidatesTags: ['MfgBom', 'MfgProduct', 'MfgDashboard'],
    }),
    deleteBom: builder.mutation<void, string>({
      query: (bomId) => ({
        url: `/manufacturing/boms/${bomId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['MfgBom', 'MfgProduct', 'MfgDashboard'],
    }),

    // Production orders
    getProductionOrders: builder.query<
      Paginated<ProductionOrderRow>,
      ListParams & OrderListParams
    >({
      query: (params) => ({ url: '/manufacturing/production-orders', params }),
      providesTags: ['MfgOrder'],
    }),
    startAssembly: builder.mutation<
      ProductionOrder,
      { orderId: string; note?: string }
    >({
      query: ({ orderId, ...body }) => ({
        url: `/manufacturing/assembly-orders/${orderId}/start`,
        method: 'POST',
        body,
      }),
      invalidatesTags: [...EXECUTION_TAGS],
      onQueryStarted: invalidateStockCaches,
    }),
    completeAssembly: builder.mutation<
      ProductionOrder,
      {
        orderId: string
        quantity?: number
        goodQuantity?: number
        rejectedQuantity?: number
        rejectDisposition?: RejectDisposition
        rejectReason?: string
        finishedGoods?: FinishedGoodsInput
        wipDisposition?: 'return' | 'scrap'
        notes?: string
      }
    >({
      query: ({ orderId, ...body }) => ({
        url: `/manufacturing/assembly-orders/${orderId}/complete`,
        method: 'POST',
        body,
      }),
      invalidatesTags: [...EXECUTION_TAGS],
      onQueryStarted: invalidateStockCaches,
    }),
    createSubAssemblies: builder.mutation<
      { order: ProductionOrder; depth: number }[],
      {
        orderId: string
        recursive?: boolean
        basis?: 'shortage' | 'full'
        materialLineIds?: string[]
        operatorId?: string | null
      }
    >({
      query: ({ orderId, ...body }) => ({
        url: `/manufacturing/production-orders/${orderId}/sub-assemblies`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['MfgOrder', 'MfgDashboard', 'MfgRequirements'],
    }),
    getOrderStatusCounts: builder.query<OrderStatusCounts, OrderListParams>({
      query: (params) => ({
        url: '/manufacturing/production-orders/status-counts',
        params,
      }),
      providesTags: ['MfgOrder'],
    }),
    getOrderFilterOptions: builder.query<OrderFilterOptions, void>({
      query: () => '/manufacturing/production-orders/filter-options',
      providesTags: ['MfgOrder'],
    }),
    exportProductionOrders: builder.query<OrderExport, OrderListParams>({
      query: (params) => ({
        url: '/manufacturing/production-orders/export',
        params,
      }),
      keepUnusedDataFor: 0,
    }),
    bulkUpdateProductionOrders: builder.mutation<
      {
        updated: { id: string; orderNumber: string; status: ProductionStatus }[]
        failed: { id: string; orderNumber: string; message: string }[]
      },
      {
        orderIds: string[]
        priority?: ProductionPriority
        operatorId?: string | null
        plannedStartDate?: string | null
        plannedCompletionDate?: string | null
        status?: 'planned' | 'released' | 'paused' | 'cancelled'
        note?: string
      }
    >({
      query: (body) => ({
        url: '/manufacturing/production-orders/bulk',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['MfgOrder', 'MfgDashboard', 'MfgRequirements'],
    }),
    getOrderTree: builder.query<
      { ancestors: OrderTreeNode[]; order: OrderTreeNode },
      string
    >({
      query: (orderId) => `/manufacturing/production-orders/${orderId}/tree`,
      providesTags: ['MfgOrder'],
    }),
    getOperators: builder.query<
      { id: string; name: string; email?: string }[],
      void
    >({
      query: () => '/manufacturing/operators',
    }),
    traceLookup: builder.query<TraceLookupHit[], string>({
      query: (q) => ({ url: '/manufacturing/trace/lookup', params: { q } }),
    }),
    traceOrder: builder.query<TraceNode, string>({
      query: (orderId) => `/manufacturing/trace/orders/${orderId}`,
      providesTags: ['MfgOrder'],
    }),
    traceFinished: builder.query<
      {
        subject: {
          kind: string
          id: string
          label: string
          productName?: string
        }
        trace: TraceNode | null
        message?: string
      },
      { imeiId?: string; batchId?: string; receiptId?: string }
    >({
      query: (params) => ({ url: '/manufacturing/trace/finished', params }),
      providesTags: ['MfgOrder'],
    }),
    traceWhereUsed: builder.query<
      WhereUsedNode[],
      { imeiId?: string; batchId?: string; productId?: string }
    >({
      query: (params) => ({ url: '/manufacturing/trace/where-used', params }),
      providesTags: ['MfgOrder'],
    }),
    getProductionOrder: builder.query<ProductionOrder, string>({
      query: (id) => `/manufacturing/production-orders/${id}`,
      providesTags: (_r, _e, id) => ['MfgOrder', { type: 'MfgOrder', id }],
    }),
    createProductionOrder: builder.mutation<
      ProductionOrder,
      ProductionOrderInput
    >({
      query: (body) => ({
        url: '/manufacturing/production-orders',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['MfgOrder', 'MfgDashboard', 'MfgRequirements'],
    }),
    updateProductionOrder: builder.mutation<
      ProductionOrder,
      { orderId: string } & ProductionOrderInput
    >({
      query: ({ orderId, ...body }) => ({
        url: `/manufacturing/production-orders/${orderId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['MfgOrder', 'MfgDashboard', 'MfgRequirements'],
    }),
    refreshProductionMaterials: builder.mutation<ProductionOrder, string>({
      query: (orderId) => ({
        url: `/manufacturing/production-orders/${orderId}/refresh-materials`,
        method: 'POST',
      }),
      invalidatesTags: ['MfgOrder', 'MfgRequirements'],
    }),
    changeProductionStatus: builder.mutation<
      ProductionOrder,
      { orderId: string; status: ProductionStatus; note?: string }
    >({
      query: ({ orderId, ...body }) => ({
        url: `/manufacturing/production-orders/${orderId}/status`,
        method: 'POST',
        body,
      }),
      invalidatesTags: [
        'MfgOrder',
        'MfgDashboard',
        'MfgRequirements',
        'MfgWip',
        'MfgBom',
      ],
    }),
    deleteProductionOrder: builder.mutation<void, string>({
      query: (orderId) => ({
        url: `/manufacturing/production-orders/${orderId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['MfgOrder', 'MfgDashboard', 'MfgRequirements'],
    }),
    getOrderRequirements: builder.query<OrderRequirements, string>({
      query: (orderId) =>
        `/manufacturing/production-orders/${orderId}/requirements`,
      providesTags: ['MfgRequirements'],
    }),
    getRequirements: builder.query<
      AggregatedRequirements,
      { statuses?: string } | void
    >({
      query: (params) => ({
        url: '/manufacturing/requirements',
        params: params ?? undefined,
      }),
      providesTags: ['MfgRequirements'],
    }),

    // Execution
    issueMaterials: builder.mutation<
      MaterialIssue,
      {
        orderId: string
        lines: {
          materialLineId: string
          quantity?: number
          alternativeProductId?: string | null
          batches?: { batchId: string; quantity: number }[]
          imeiIds?: string[]
        }[]
        allowOverIssue?: boolean
        notes?: string
        issueDate?: string
      }
    >({
      query: ({ orderId, ...body }) => ({
        url: `/manufacturing/production-orders/${orderId}/issue`,
        method: 'POST',
        body,
      }),
      invalidatesTags: [...EXECUTION_TAGS],
      onQueryStarted: invalidateStockCaches,
    }),
    returnMaterials: builder.mutation<
      MaterialIssue,
      {
        orderId: string
        lines: { wipLotId: string; quantity?: number; imeiIds?: string[] }[]
        notes?: string
      }
    >({
      query: ({ orderId, ...body }) => ({
        url: `/manufacturing/production-orders/${orderId}/return`,
        method: 'POST',
        body,
      }),
      invalidatesTags: [...EXECUTION_TAGS],
      onQueryStarted: invalidateStockCaches,
    }),
    reportOutput: builder.mutation<
      ProductionOutput,
      {
        orderId: string
        producedQuantity: number
        goodQuantity?: number
        rejectedQuantity?: number
        rejectDisposition?: RejectDisposition
        rejectReason?: string
        finishedGoods?: FinishedGoodsInput
        notes?: string
      }
    >({
      query: ({ orderId, ...body }) => ({
        url: `/manufacturing/production-orders/${orderId}/outputs`,
        method: 'POST',
        body,
      }),
      invalidatesTags: [...EXECUTION_TAGS],
      onQueryStarted: invalidateStockCaches,
    }),
    inspectOutput: builder.mutation<
      ProductionOutput,
      {
        outputId: string
        goodQuantity: number
        rejectedQuantity?: number
        rejectDisposition?: RejectDisposition
        rejectReason?: string
        finishedGoods?: FinishedGoodsInput
        inspectionNotes?: string
      }
    >({
      query: ({ outputId, ...body }) => ({
        url: `/manufacturing/outputs/${outputId}/inspect`,
        method: 'POST',
        body,
      }),
      invalidatesTags: [...EXECUTION_TAGS],
      onQueryStarted: invalidateStockCaches,
    }),
    resolveRework: builder.mutation<
      { reworkPendingQuantity: number },
      {
        orderId: string
        goodQuantity?: number
        scrapQuantity?: number
        finishedGoods?: FinishedGoodsInput
        notes?: string
      }
    >({
      query: ({ orderId, ...body }) => ({
        url: `/manufacturing/production-orders/${orderId}/rework`,
        method: 'POST',
        body,
      }),
      invalidatesTags: [...EXECUTION_TAGS],
      onQueryStarted: invalidateStockCaches,
    }),
    recordScrap: builder.mutation<
      ScrapRecord,
      {
        productionOrderId?: string | null
        stage: 'material' | 'finished_good'
        materialLineId?: string
        productId?: string
        batchId?: string
        imeiIds?: string[]
        quantity?: number
        reason?: ScrapReason
        notes?: string
      }
    >({
      query: (body) => ({ url: '/manufacturing/scrap', method: 'POST', body }),
      invalidatesTags: [...EXECUTION_TAGS],
      onQueryStarted: invalidateStockCaches,
    }),
    getOutputs: builder.query<
      Paginated<ProductionOutput>,
      ListParams & {
        productionOrderId?: string
        status?: 'pending_qc' | 'inspected'
      }
    >({
      query: (params) => ({ url: '/manufacturing/outputs', params }),
      providesTags: ['MfgOutput'],
    }),
    getMovements: builder.query<
      Paginated<StockMovement>,
      ListParams & {
        productionOrderId?: string
        productId?: string
        bucket?: StockBucket
        type?: string
        dateFrom?: string
        dateTo?: string
      }
    >({
      query: (params) => ({ url: '/manufacturing/movements', params }),
      providesTags: ['MfgMovement'],
    }),
    getStockDetail: builder.query<
      StockDetail,
      { productId: string; variantId?: string | null }
    >({
      query: ({ productId, variantId }) => ({
        url: '/manufacturing/stock-detail',
        params: { productId, ...(variantId ? { variantId } : {}) },
      }),
      providesTags: ['MfgOrder'],
    }),
    getMaterialIssues: builder.query<
      Paginated<MaterialIssue>,
      ListParams & {
        productionOrderId?: string
        kind?: 'issue' | 'return'
        dateFrom?: string
        dateTo?: string
      }
    >({
      query: (params) => ({ url: '/manufacturing/material-issues', params }),
      providesTags: ['MfgIssue'],
    }),
    getProductionReceipts: builder.query<
      Paginated<ProductionReceipt>,
      ListParams & {
        productionOrderId?: string
        dateFrom?: string
        dateTo?: string
      }
    >({
      query: (params) => ({ url: '/manufacturing/finished-goods', params }),
      providesTags: ['MfgReceipt'],
    }),
    getScrapRecords: builder.query<
      Paginated<ScrapRecord>,
      ListParams & {
        productionOrderId?: string
        stage?: ScrapStage
        reason?: ScrapReason
        dateFrom?: string
        dateTo?: string
      }
    >({
      query: (params) => ({ url: '/manufacturing/scrap', params }),
      providesTags: ['MfgScrap'],
    }),
    getWip: builder.query<WipSummary, void>({
      query: () => '/manufacturing/wip',
      providesTags: ['MfgWip'],
    }),
  }),
})

/** Refresh every manufacturing view and the product catalog once a demo load finishes. */
export const refreshAfterDemoData =
  () =>
  (dispatch: (action: unknown) => unknown): void => {
    dispatch(manufacturingApi.util.invalidateTags([...ALL_DATA_TAGS]))
    dispatch(purchaseCatalogApi.util.invalidateTags(['PurchaseCatalog']))
    dispatch(productApi.util.invalidateTags(['Product']))
    dispatch(inventoryApi.util.invalidateTags(['Inventory'] as never))
  }

export const {
  useGetManufacturingDashboardQuery,
  useGetManufacturingAnalyticsQuery,
  useGetManufacturingSettingsQuery,
  useUpdateManufacturingSettingsMutation,
  useGetDemoDataStatusQuery,
  useLoadDemoDataMutation,
  useRemoveDemoDataMutation,
  useGetManufacturingProductsQuery,
  useGetProductTypeSummaryQuery,
  useUpdateManufacturingProductMutation,
  useBulkClassifyProductsMutation,
  useGetWhereUsedQuery,
  useGetAssembliesQuery,
  useGetBomsQuery,
  useGetOrderStatusCountsQuery,
  useGetOrderFilterOptionsQuery,
  useLazyExportProductionOrdersQuery,
  useBulkUpdateProductionOrdersMutation,
  useGetBomQuery,
  useGetBomVersionsQuery,
  useExplodeBomQuery,
  useCreateBomMutation,
  useUpdateBomMutation,
  useCreateBomVersionMutation,
  useSetDefaultBomMutation,
  useSetBomActiveMutation,
  useDeleteBomMutation,
  useGetProductionOrdersQuery,
  useGetProductionOrderQuery,
  useCreateProductionOrderMutation,
  useUpdateProductionOrderMutation,
  useRefreshProductionMaterialsMutation,
  useChangeProductionStatusMutation,
  useDeleteProductionOrderMutation,
  useGetOrderRequirementsQuery,
  useGetRequirementsQuery,
  useIssueMaterialsMutation,
  useReturnMaterialsMutation,
  useReportOutputMutation,
  useInspectOutputMutation,
  useResolveReworkMutation,
  useGetOutputsQuery,
  useGetMovementsQuery,
  useGetStockDetailQuery,
  useRecordScrapMutation,
  useGetMaterialIssuesQuery,
  useGetProductionReceiptsQuery,
  useGetScrapRecordsQuery,
  useGetWipQuery,
  useStartAssemblyMutation,
  useCompleteAssemblyMutation,
  useCreateSubAssembliesMutation,
  useGetOrderTreeQuery,
  useGetOperatorsQuery,
  useTraceLookupQuery,
  useTraceOrderQuery,
  useTraceFinishedQuery,
  useTraceWhereUsedQuery,
} = manufacturingApi
