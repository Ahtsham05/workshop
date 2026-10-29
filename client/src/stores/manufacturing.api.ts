import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'
import type {
  ManufacturingReport,
  ReportParams,
} from '@/features/manufacturing/lib/report-types'
import { inventoryApi } from './inventory.api'
import { productApi } from './product.api'
import { purchaseApi } from './purchase.api'
import { purchaseCatalogApi } from './purchaseCatalog.api'
import { purchaseOrderApi } from './purchaseOrder.api'

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

/**
 * A confirmed receipt moves stock and creates a purchase (supplier payable, PO receipt),
 * so the catalog, inventory, purchase and purchase-order caches all refresh too. A draft
 * save changes none of them, but refreshing is harmless and keeps this one rule simple.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const invalidateReceiptCaches = async (_arg: unknown, api: any) => {
  await invalidateStockCaches(_arg, api)
  try {
    await api.queryFulfilled
    api.dispatch(purchaseApi.util.invalidateTags(['Purchase']))
    api.dispatch(
      purchaseOrderApi.util.invalidateTags([
        'PurchaseOrder',
        'PurchaseOrderStats',
      ])
    )
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
export type StockBucket = 'available' | 'wip' | 'qc' | 'rework' | 'floor'
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
  /** A pack of a bulk product (made by packing, not by a BOM). */
  packOf?: {
    productId: string
    productName: string
    sizeName: string
    contentQuantity: number
    contentUnit: string
  } | null
  /** Pack sizes this (bulk) product is packed into. */
  packSizeCount?: number
  /** 'floor' = kept in production stock (issued in bulk, used automatically). */
  issueMethod?: 'order' | 'floor' | null
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
  /** Days a batch stays good after it is made — FG receipt expiry defaults from it. */
  shelfLifeDays?: number | null
  trackImei?: boolean
  trackSerial?: boolean
  bomCount: number
  activeBomCount: number
  /** Batch / expiry tracking and the product's live batches (list + overview). */
  tracking?: ProductBatchTracking
  categories?: { _id: string; name: string }[]
  brandId?: string | null
  brand?: { id: string; name: string } | null
  createdAt?: string
}

export interface ProductBatchTracking {
  trackBatch: boolean
  trackExpiry: boolean
  /** Batches with stock left. */
  batchCount: number
  nearestExpiry: string | null
  expiredQuantity: number
  /** Stock the product holds that no batch accounts for (can't be issued or sold by batch). */
  unbatchedQuantity?: number
}

export interface ProductBatch {
  id: string
  batchNumber: string
  quantity: number
  costPerUnit: number
  value: number
  manufactureDate: string | null
  expiryDate: string | null
  daysToExpiry: number | null
  status: 'active' | 'depleted' | 'expired' | 'written_off'
  source: {
    kind: 'production' | 'purchase' | 'opening' | 'other'
    id: string | null
    label: string
  }
}

/** A batch found by the report picker (GET /manufacturing/batches/search). */
export interface BatchSearchResult {
  id: string
  batchNumber: string
  productName: string
  unit: string
  quantity: number
  expiryDate: string | null
}

export interface ManufacturingProductFilters {
  productType?: string
  classifiedOnly?: boolean
  hasBom?: boolean
  procurementType?: ProcurementType | 'none'
  stock?: 'in' | 'out'
  tracking?: 'batch' | 'none'
  /**
   * Packing roles: 'make' hides pack products (what a BOM / order makes), 'pack' = what a
   * pack size can be stocked as, 'packs' = pack products only.
   */
  packRole?: 'make' | 'pack' | 'packs'
  /** A category / brand id, or 'none' for products without one. */
  categoryId?: string
  brandId?: string
  search?: string
}

export interface ManufacturingProductStats {
  products: number
  stockQuantity: number
  stockValue: number
  avgCost: number
  outOfStock: number
  withBom: number
}

/** The manufacturing side of one product (its details page). */
export interface ManufacturingProductOverview {
  product: ManufacturingProduct
  boms: {
    id: string
    bomNumber: string
    version: number
    name?: string
    isActive: boolean
    isDefault: boolean
    isLocked: boolean
    quantity: number
    unit: string
    componentCount: number
    operationCount: number
    updatedAt: string
  }[]
  whereUsed: WhereUsedEntry[]
  making: {
    id: string
    orderNumber: string
    orderType: OrderType
    status: ProductionStatus
    priority: ProductionPriority
    plannedQuantity: number
    producedQuantity: number
    completedQuantity: number
    unit: string
    plannedCompletionDate?: string | null
    createdAt: string
  }[]
  consuming: {
    id: string
    orderNumber: string
    orderType: OrderType
    status: ProductionStatus
    productName: string
    plannedCompletionDate?: string | null
    required: number
    issued: number
    inWip: number
  }[]
  totals: { inProduction: number; requiredByOpenOrders: number; inWip: number }
  tracking: ProductBatchTracking
  /** Batches with stock, soonest expiry first. */
  batches: ProductBatch[]
}

export interface BomAlternative {
  productId: string
  variantId?: string | null
  productName?: string
  ratio: number
}

/** Extra on GET /boms/:id — batch tracking per product id (the BOM's product + components). */
export interface BomTrackingInfo {
  tracking?: Record<string, ProductBatchTracking>
  productShelfLifeDays?: number | null
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

/** One step of a BOM's routing; orders plan setup + run × quantity minutes from it. */
export interface BomOperation {
  _id?: string
  name: string
  workCenter?: string
  setupMinutes?: number
  runMinutesPerUnit?: number
  /** Labour + machine rate — conversion cost is informational (not in stock valuation). */
  costPerHour?: number
  instructions?: string
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
  operations?: BomOperation[]
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
  operations?: BomOperation[]
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
  /** 'floor' = used from production stock (issued in bulk), never issued to the order. */
  supply?: 'order' | 'floor'
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

export type OperationStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'skipped'

/** A routing step on an order, tracked on the floor. */
export interface OrderOperation {
  _id: string
  name: string
  workCenter: string
  sequence: number
  plannedMinutes: number
  costPerHour: number
  instructions: string
  status: OperationStatus
  startedAt?: string | null
  startedByName?: string
  completedAt?: string | null
  completedByName?: string
  /** Time worked; null when not recorded (costed at plan). */
  actualMinutes?: number | null
  note?: string
}

export type OrderDocumentCategory =
  | 'drawing'
  | 'specification'
  | 'work_instruction'
  | 'quality'
  | 'certificate'
  | 'photo'
  | 'other'

export interface OrderDocument {
  _id: string
  kind: 'file' | 'link'
  title: string
  category: OrderDocumentCategory
  url?: string
  fileName?: string
  mimeType?: string
  bytes?: number
  uploadedBy?: string | null
  uploadedByName?: string
  uploadedAt: string
}

export interface ProductionOrder {
  id: string
  orderNumber: string
  /** Finished-goods batch (lot) this order produces into; empty on orders made before batches. */
  batchNumber?: string
  /** 'assembly' orders build (sub-)assemblies with the same engine and their own lifecycle. */
  orderType: OrderType
  parentOrderId?: string | null
  parentMaterialLineId?: string | null
  operatorId?: string | null
  operatorName?: string
  team?: { userId: string; name: string }[]
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
  operations?: OrderOperation[]
  documents?: OrderDocument[]
  branchId?: string
  qcPendingCost?: number
  reworkPendingCost?: number
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

export interface ManufacturingAccess {
  enabled: boolean
  /** Why not: the business type isn't Manufacturing, or this login isn't on the rollout list. */
  reason: null | 'business_type' | 'not_invited'
  /** 'tester': on the server's tester list — sees the module in any business type. */
  via?: 'tester'
}

// ── Raw material receipt (RMV) ───────────────────────────────────────────────────
export type MaterialReceiptStatus = 'draft' | 'confirmed' | 'cancelled'

export interface MaterialReceiptLine {
  _id?: string
  productId: string
  variantId?: string | null
  productName?: string
  sku?: string
  productType?: ProductType | null
  quantity: number | null
  unit?: string
  rate: number | null
  discountPercent?: number | null
  discountAmount?: number
  taxPercent?: number | null
  taxAmount?: number
  netAmount?: number
  netUnitCost?: number
  batchNumber?: string
  expiryDate?: string | null
  serials?: string[]
  location?: string
  notes?: string
}

export interface MaterialReceipt {
  id: string
  voucherNumber: string
  status: MaterialReceiptStatus
  date: string
  supplierId?: string | null
  supplierName?: string
  purchaseOrderId?: string | null
  purchaseOrderNumber?: string
  location?: string
  reference?: string
  notes?: string
  lines: MaterialReceiptLine[]
  totals: {
    items: number
    quantity: number
    subtotal: number
    discount: number
    tax: number
    grandTotal: number
  }
  purchaseId?: string | null
  purchaseInvoiceNumber?: string
  confirmedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface MaterialReceiptInput {
  date?: string
  supplierId?: string | null
  purchaseOrderId?: string | null
  location?: string
  reference?: string
  notes?: string
  lines?: MaterialReceiptLine[]
  /** true = post to stock now ("Save"); otherwise a draft. */
  confirm?: boolean
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
  teamMemberIds?: string[]
  parentOrderId?: string | null
  parentMaterialLineId?: string | null
  /** Finished-goods batch number; blank on create = auto-numbered. */
  batchNumber?: string
}

export interface RequirementLine {
  materialLineId?: string
  /** 'floor' = used from production stock at receipt, never issued on a voucher. */
  supply?: 'order' | 'floor'
  /** Floor lines: in production stock now, and what this order will still use from it. */
  floorQuantity?: number
  floorNeed?: number
  /** Floor lines: the requirement still open (outstanding = open − what the floor holds). */
  openQuantity?: number
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
  /** Against on-hand only (the order list's "Has shortage"). */
  shortageQuantity: number
  consumedQuantity?: number
  returnedQuantity?: number
  scrappedQuantity?: number
  wipQuantity?: number
  /** Order detail only — see productionOrder.service.js#getOrderRequirements. */
  reservedQuantity?: number
  heldByEarlierOrdersQuantity?: number
  heldByEarlierOrders?: {
    orderId: string
    orderNumber: string
    orderType?: OrderType
    quantity: number
  }[]
  /** Outstanding minus what this order can count on after the orders ahead of it. */
  netShortageQuantity?: number
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
  /** Planned → paused orders hold stock; drafts and closed orders don't. */
  reserving: boolean
  lines: RequirementLine[]
  shortageCount: number
  netShortageCount: number
}

interface PlanActualForecast {
  planned: number
  actual: number
  forecast: number
}

export interface OrderCosts {
  orderId: string
  plannedQuantity: number
  completedQuantity: number
  unit: string
  material: PlanActualForecast
  conversion: PlanActualForecast
  total: PlanActualForecast
  unitCost: { planned: number; forecast: number; actualFinished: number | null }
  variance: number
  breakdown: {
    consumed: number
    inWip: number
    inQc: number
    inRework: number
    finishedGoods: number
    scrapped: number
    returned: number
  }
  scrapByStage: Partial<Record<ScrapStage, number>>
  scrapByReason: Partial<Record<ScrapReason, number>>
  materials: {
    materialLineId: string
    productName: string
    sku?: string
    unit: string
    isOptional: boolean
    requiredQuantity: number
    issuedQuantity: number
    remainingQuantity: number
    standardUnitCost: number
    actualUnitCost: number | null
    plannedCost: number
    actualCost: number
    consumedCost: number
    wipValue: number
    forecastCost: number
    variance: number
  }[]
  operations: {
    operationId: string
    name: string
    workCenter: string
    status: OperationStatus
    costPerHour: number
    plannedMinutes: number
    actualMinutes: number | null
    recordedMinutes: number | null
    plannedCost: number
    actualCost: number
    forecastCost: number
    /** Time to date is estimated (running step capped at plan, or no time recorded). */
    estimated: boolean
  }[]
}

export type OrderActivityType =
  | 'created'
  | 'status'
  | 'issue'
  | 'return'
  | 'output'
  | 'inspection'
  | 'output_reversed'
  | 'receipt'
  | 'scrap'
  | 'operation_started'
  | 'operation_completed'
  | 'operation_skipped'
  | 'document'

export interface OrderActivityEvent {
  type: OrderActivityType
  at: string
  by: string | null
  byName: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>
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
    batchId?: string | null
    batchNumber?: string
    serialNumbers?: string[]
    variantId?: string | null
  }[]
  totalCost: number
  notes?: string
  /** MIV header (issues posted from the voucher screen). */
  sourceLocation?: string
  wipLocation?: string
  reference?: string
  requestedBy?: { userId?: string; name?: string }
  issuedBy?: { userId?: string; name?: string }
  overrides?: { line: number; code: IssueWarningCode; message: string }[]
  branchId?: string
  createdBy?: Ref
  createdAt: string
  /** Cancelling ("deleting") reverses the stock and keeps the voucher, marked. */
  status?: 'posted' | 'cancelled'
  cancelledAt?: string
  cancelledBy?: { userId?: string; name?: string }
  cancelReason?: string
  /** Bumped on every edit/cancel; an edit or cancel names the one it was made from. */
  revision?: number
  editHistory?: {
    at: string
    by?: { userId?: string; name?: string }
    kind: 'header' | 'lines'
    summary?: string
    note?: string
    previousTotal?: number
    newTotal?: number
  }[]
}

/** What cancelling a voucher would put back (server materialIssueEdit.service.js). */
export interface IssueReversalPreview {
  issueNumber: string
  status: 'posted' | 'cancelled'
  revision: number
  canReverse: boolean
  totalCost: number
  lines: {
    productName: string
    unit: string
    quantity: number
    /** Still on the floor (can go back). */
    inWip: number
    /** Already used in output, scrapped or returned. */
    gone: number
    batchNumber: string | null
    totalCost: number
  }[]
  order: {
    id: string
    orderNumber: string
    productName: string
    status: ProductionStatus
    /** Nothing else happened on it — it can be cancelled together with the voucher. */
    canCancel: boolean
  }
}

export type EditIssueBody = Omit<
  IssueVoucherBody,
  'productionOrderId' | 'newOrder'
> & {
  revision: number
  editNote?: string
}

/** Several production orders at once (server productionOrderBatch.service.js). */
export interface OrderBatchHeader {
  plannedStartDate?: string | null
  plannedCompletionDate?: string | null
  priority?: ProductionPriority | ''
  operatorId?: string | null
  teamMemberIds?: string[]
  sourceLocation?: string
  wipLocation?: string
  finishedGoodsLocation?: string
  notes?: string
  status: 'draft' | 'planned'
}

export interface OrderBatchLine {
  productId: string | null
  variantId?: string | null
  bomId?: string | null
  plannedQuantity: number | null
  priority?: ProductionPriority | '' | null
  plannedStartDate?: string | null
  plannedCompletionDate?: string | null
  notes?: string
  batchNumber?: string | null
}

export interface OrderBatchShortage {
  productName: string
  unit: string
  required: number
  available: number
  short: number
  onHand: number
  heldByOpenOrders: number
}

export interface OrderBatchCheck {
  rows: { line: number; field: string; message: string }[]
  lines: {
    line: number
    components: number
    bomNumber?: string | null
    steps?: number
    shortages: OrderBatchShortage[]
  }[]
}

/** MIV — Material Issue Voucher (see server materialIssueVoucher.service.js). */
export type IssueWarningCode =
  | 'exceeds_remaining'
  | 'expired_batch'
  | 'insufficient_stock'

export interface IssueVoucherLine {
  /** An order's material line, or `new:<index>` of a finished-good plan. */
  materialLineId: string
  /** The material's product — lets the server check a plan line against the BOM. */
  productId?: string | null
  alternativeProductId?: string | null
  quantity: number | null
  batchId?: string | null
  /** The line split over several batches; quantities add up to `quantity`. */
  batches?: { batchId: string; quantity: number }[]
  serialNumbers?: string[]
}

/** Issue for a finished good: posting creates and releases this production order. */
export interface IssueNewOrder {
  productId: string
  variantId?: string | null
  bomId?: string | null
  plannedQuantity: number
}

export interface IssueVoucherBody {
  /** Either an existing order… */
  productionOrderId?: string
  /** …or a finished good to make (the order is created with the issue). */
  newOrder?: IssueNewOrder
  date?: string
  sourceLocation?: string
  wipLocation?: string
  requestedById?: string | null
  issuedById?: string | null
  reference?: string
  notes?: string
  overrides?: IssueWarningCode[]
  lines: IssueVoucherLine[]
}

export interface IssueVoucherCheck {
  header: Partial<Record<string, string>>
  rows: { line: number; field: string; message: string }[]
  warnings: {
    line: number
    field: string
    code: IssueWarningCode
    message: string
    permission: string
    allowed: boolean
  }[]
  notes: { line: number; field: string; message: string }[]
}

/** A finished good's BOM exploded for a quantity — see materialIssueVoucher.service.js#planForProduct. */
export interface MaterialIssuePlan {
  productId: string
  variantId: string | null
  productName: string
  unit: string
  quantity: number
  bom: { id: string; bomNumber: string; version: number }
  boms: {
    id: string
    bomNumber: string
    version: number
    name?: string
    quantity: number
    unit: string
    isDefault: boolean
  }[]
  lines: (RequirementLine & { perUnit: number; baseQuantity: number })[]
  shortageCount: number
  /** This product's orders already open for issue. */
  openOrders: {
    id: string
    orderNumber: string
    status: ProductionStatus
    plannedQuantity: number
    completedQuantity: number
    unit: string
    /** Share of its material still to issue (0–100). */
    openPercent: number
  }[]
}

/** What open orders still have to be issued, per material (materialIssueByMaterial.service.js). */
export interface PendingOrderNeed {
  orderId: string
  orderNumber: string
  orderType: OrderType
  status: ProductionStatus
  productName: string
  materialLineId: string
  outstanding: number
}

export interface PendingMaterial {
  productId: string
  variantId: string | null
  productName: string
  sku: string
  unit: string
  productType: ProductType | null
  imageUrl: string | null
  /** Still to issue across all open orders. */
  outstanding: number
  available: number
  /** In production-queue order — "auto" fills them in this order. */
  orders: PendingOrderNeed[]
}

export interface IssueByMaterialBody {
  date?: string
  sourceLocation?: string
  wipLocation?: string
  requestedById?: string | null
  issuedById?: string | null
  reference?: string
  notes?: string
  overrides?: IssueWarningCode[]
  lines: {
    productId: string
    variantId?: string | null
    quantity: number | null
    /** One order; empty = split over the orders that need it, queue order. */
    orderId?: string | null
  }[]
}

export interface IssueByMaterialResult {
  issues: MaterialIssue[]
  allocations: { orderId: string; orderNumber: string; quantity: number }[][]
}

/** Where issued material went (server materialUsage.service.js). Quantities in line units. */
export interface MaterialUsageLine {
  materialLineId: string
  productId: string
  variantId: string | null
  productName: string
  sku: string
  unit: string
  isOptional: boolean
  required: number
  issued: number
  returned: number
  /** Backflushed into output (good + rejected units). */
  used: number
  /** Scrapped from WIP. */
  wastage: number
  /** Still on the production floor (WIP). */
  inFactory: number
  toIssue: number
  /** What the BOM allows for the good output so far. */
  standard: number
  /** (used + wastage) − standard. */
  variance: number
  issuedValue: number
  usedValue: number
  returnedValue: number
  wastageValue: number
  inFactoryValue: number
}

export interface MaterialUsageOrder {
  id: string
  orderNumber: string
  orderType: OrderType
  status: ProductionStatus
  productName: string
  unit: string
  plannedQuantity: number
  producedQuantity: number
  goodQuantity: number
  rejectedQuantity: number
  createdAt: string
  issuedValue: number
  usedValue: number
  returnedValue: number
  wastageValue: number
  inFactoryValue: number
  lines: MaterialUsageLine[]
}

export type MaterialUsageMaterial = Omit<
  MaterialUsageLine,
  'materialLineId' | 'isOptional'
> & { orderCount: number }

export interface MaterialUsageReport {
  totals: {
    issuedValue: number
    usedValue: number
    returnedValue: number
    wastageValue: number
    inFactoryValue: number
    orderCount: number
    wastagePercent: number
  }
  materials: MaterialUsageMaterial[]
  orders: MaterialUsageOrder[]
  truncated: boolean
}

export interface IssueOptions {
  locations: string[]
  defaultSourceLocation: string
  defaultWipLocation: string
  allowNegativeStockIssue: boolean
  permissions: Record<string, boolean>
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

export type OutputReversalReason =
  | 'wrong_quantity'
  | 'wrong_product'
  | 'wrong_order'
  | 'duplicate'
  | 'other'

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
  status: 'pending_qc' | 'inspected' | 'reversed'
  consumption: {
    materialLineId?: string
    productName: string
    unit: string
    quantity: number
    cost: number
  }[]
  receiptId?: string | null
  /** Set once the output was reversed: what it had posted, and why it was undone. */
  reversal?: {
    at: string
    by?: Ref
    reason: OutputReversalReason
    notes?: string
    previousStatus: 'pending_qc' | 'inspected'
    receiptNumber?: string
    scrapNumber?: string
    reopenedOrder?: boolean
  }
  materialCost: number
  unitCost: number
  reportedAt: string
  reportedBy?: Ref
  inspectedAt?: string | null
  inspectedBy?: Ref
  inspectionNotes?: string
  notes?: string
  /** Received straight to stock while QC is required (the receipt was the inspection). */
  directReceipt?: boolean
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
  tracking: { batch: boolean; expiry?: boolean; serial: boolean }
  shelfLifeDays?: number | null
  batches: {
    id: string
    batchNumber: string
    quantity: number
    expiryDate?: string | null
    manufactureDate?: string | null
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
  manufactureDate?: string | null
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
    rawMaterialReceipt: string
    scrap: string
    /** Finished-goods batch numbers: B261019-007. */
    batch: string
    packing?: string
    /** Production stock: issue (PSI), return (PSR), count (PSC). */
    floorIssue?: string
    floorReturn?: string
    floorCount?: string
  }
  /** Production stock short at a receipt / packing: issue the rest from the store, or refuse. */
  floorShortfall?: 'auto_issue' | 'block'
  /** New orders' batch number: own dated sequence, or the order number. */
  batchNumbering: 'sequence' | 'order'
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
  /** Complete an order once every planned unit is received (unused WIP back to stock). */
  autoCompleteOrders: boolean
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
  'MfgMaterialReceipt',
  'MfgAccess',
  'MfgPacking',
  'MfgFloor',
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
  'MfgPacking',
  'MfgFloor',
] as const

/* ── Packing: bulk finished goods into pack sizes (server packing.service.js) ── */

export interface PackItemInfo {
  id: string
  name: string
  sku: string
  unit: string
  price?: number | null
  missing?: boolean
  available: number
  /** Packing material kept in production stock: what is on the floor (`available` adds the store when shortfalls are auto-issued). */
  fromProductionStock?: boolean
  inProduction?: number
  unitCost?: number
}

export interface PackSizeDto {
  id: string
  name: string
  contentQuantity: number
  contentUnit: string
  innerCount: number
  innerName: string
  isActive: boolean
  sequence: number
  packProduct: PackItemInfo & { tracking: { trackBatch: boolean; trackExpiry: boolean } | null }
  materials: (PackItemInfo & { quantity: number })[]
}

export interface PackingSetup {
  product: {
    id: string
    name: string
    sku: string
    unit: string
    productType: string | null
    variantId: string | null
    hasVariants: boolean
    /** The product's variants (when it has several, one must be chosen). */
    variants: { id: string; label: string; sku: string }[]
    /** Pack sizes can be saved (not serial-tracked). */
    canSetUp: boolean
    /** Can be packed right now; otherwise `problem` says why. */
    packable: boolean
    problem: string | null
    available: number
    unitCost?: number
    tracking: { trackBatch: boolean; trackExpiry: boolean }
    batches: {
      id: string
      batchNumber: string
      quantity: number
      expiryDate: string | null
      manufactureDate: string | null
    }[]
  }
  sizes: PackSizeDto[]
}

export interface PackSizeInput {
  id?: string | null
  name: string
  packProductId: string
  contentQuantity: number
  innerCount?: number
  innerName?: string
  isActive?: boolean
  materials: { productId: string; quantity: number }[]
}

export interface PackingLineInput {
  packSizeId: string
  quantity: number
}

export interface PackingVoucher {
  id: string
  voucherNumber: string
  packingDate: string
  productId: string
  productName: string
  unit: string
  source: 'receipt' | 'stock'
  productionOrderId: string | null
  orderNumber?: string
  /** The finished-goods receipt it was packed from (packed on receipt). */
  receiptId?: string | null
  batchNumber: string
  bulkQuantity: number
  bulkUnitCost?: number
  looseQuantity: number
  lines: {
    _id: string
    packSizeId: string
    packName: string
    productId: string
    productName: string
    unit: string
    quantity: number
    contentQuantity: number
    bulkQuantity: number
    unitCost?: number
    materialCost?: number
    totalCost?: number
    batchNumber?: string
  }[]
  consumed: {
    role: 'bulk' | 'material'
    productId: string
    productName: string
    unit: string
    quantity: number
    unitCost?: number
    totalCost?: number
    batches?: { batchId: string; batchNumber: string; quantity: number }[]
    /** 'floor' = packing material taken from production stock. */
    source?: 'store' | 'floor'
  }[]
  totalCost?: number
  notes: string
  status: 'posted' | 'cancelled'
  cancelledAt?: string
  cancelledBy?: { name?: string }
  cancelReason?: string
  createdByName?: string
  createdAt: string
}

/* ── Production stock: material issued to the floor in bulk (server floorStock.service.js) ── */

export interface FloorUse {
  productId: string
  name: string
  quantity: number
}

export interface FloorOverviewRow {
  productId: string
  name: string
  sku: string
  unit: string
  productType: ProductType | null
  isFloor: boolean
  opening: number
  issued: number
  /** Of `issued`: what receipts / packing issued themselves because the floor was short. */
  autoIssued: number
  used: number
  returned: number
  /** Physical count difference: − wastage / loss, + found. */
  countDiff: number
  closing: number
  usedFor: FloorUse[]
  usedCost?: number
  inProduction: number
  inProductionValue?: number
  storeQuantity: number
  openOrderNeed: number
  openOrders: number
}

export interface FloorOverview {
  rows: FloorOverviewRow[]
  totals: {
    materials: number
    inProductionValue?: number
    usedCost?: number
    issued: number
    used: number
    autoIssued: number
    wastage: number
    short: number
  } | null
}

export type FloorMoveKind = 'issue' | 'auto_issue' | 'return' | 'count' | 'used'

export interface FloorMovement {
  productId: string
  date: string
  kind: FloorMoveKind
  /** Signed, as seen from production stock. */
  quantity: number
  balance: number
  number: string
  refType: 'FloorStockVoucher' | 'ProductionOutput' | 'PackingVoucher'
  refId: string
  orderNumber?: string
  usedFor?: FloorUse[]
  note: string
  by?: string
  cost?: number
}

export interface FloorMaterialDetail {
  product: { id: string; name: string; sku: string; unit: string; productType: ProductType | null; isFloor: boolean }
  opening: number
  closing: number
  inProduction: number
  inProductionValue?: number
  openOrderNeed: number
  usedFor: FloorUse[]
  lots: { id: string; quantity: number; unitCost?: number; batchNumber: string; issuedAt: string; voucherNumber: string }[]
  movements: FloorMovement[]
}

export interface FloorPickItem {
  id: string
  name: string
  sku: string
  unit: string
  productType: ProductType | null
  isFloor: boolean
  storeQuantity: number
  inProduction: number
  /** Average cost of what is on the floor (store cost when empty); hidden without cost access. */
  unitCost?: number
}

export interface FloorUsageTemplate {
  fromOutput?: string
  lines: { productId: string; name: string; unit: string; quantity: number; perUnit: number }[]
}

export interface FloorMaterialChoice {
  id: string
  name: string
  sku: string
  unit: string
  productType: ProductType | null
  isFloor: boolean
}

export type FloorVoucherKind = 'issue' | 'return' | 'count'

export interface FloorVoucher {
  id: string
  voucherNumber: string
  kind: FloorVoucherKind
  voucherDate: string
  auto: boolean
  source?: { refType?: string; refId?: string; number?: string; productName?: string }
  lines: {
    _id: string
    productId: string
    productName: string
    unit: string
    quantity: number
    bookQuantity?: number
    countedQuantity?: number
    unitCost?: number
    totalCost?: number
    batches?: { batchNumber?: string; quantity: number }[]
  }[]
  totalCost?: number
  reason: string
  notes: string
  status: 'posted' | 'cancelled'
  cancelledAt?: string
  cancelledBy?: { name?: string }
  cancelReason?: string
  createdByName?: string
  createdAt: string
}

export interface FloorPeriod {
  dateFrom?: string
  dateTo?: string
}

export interface PackableProduct {
  id: string
  name: string
  sku: string
  unit: string
  sizes: number
  available: number
}

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
    // Whether this user may use the module (manufacturing business type + rollout list).
    getManufacturingAccess: builder.query<ManufacturingAccess, void>({
      query: () => '/manufacturing/access',
      providesTags: ['MfgAccess'],
    }),
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
      ListParams &
        ManufacturingProductFilters & {
          sort?: 'name' | 'newest' | 'stock' | 'stockLow' | 'cost'
        }
    >({
      query: (params) => ({ url: '/manufacturing/products', params }),
      providesTags: ['MfgProduct'],
    }),
    getManufacturingProductStats: builder.query<
      ManufacturingProductStats,
      ManufacturingProductFilters
    >({
      query: (params) => ({ url: '/manufacturing/products/stats', params }),
      providesTags: ['MfgProduct'],
    }),
    getManufacturingProductOverview: builder.query<
      ManufacturingProductOverview,
      string
    >({
      query: (productId) => `/manufacturing/products/${productId}/overview`,
      providesTags: ['MfgProduct', 'MfgBom', 'MfgOrder'],
    }),
    getProductTypeSummary: builder.query<
      Record<ProductType | 'unclassified', number>,
      void
    >({
      query: () => '/manufacturing/products/type-summary',
      providesTags: ['MfgProduct'],
    }),
    /** Every product the filter matches (id + name), for "select all N matching". */
    getMatchingManufacturingProductIds: builder.query<
      { results: { id: string; name: string }[]; total: number; limit: number },
      ManufacturingProductFilters & {
        sort?: 'name' | 'newest' | 'stock' | 'stockLow' | 'cost'
      }
    >({
      // Fetched on demand only (lazy) — no tags, so bulk writes don't refetch it.
      query: (params) => ({ url: '/manufacturing/products/ids', params }),
    }),
    updateManufacturingProduct: builder.mutation<
      ManufacturingProduct,
      {
        productId: string
        productType?: ProductType | null
        procurementType?: ProcurementType | null
        manufacturingLeadTimeDays?: number | null
        shelfLifeDays?: number | null
        trackBatch?: boolean
        trackExpiry?: boolean
        defaultBomId?: string | null
      }
    >({
      query: ({ productId, ...body }) => ({
        url: `/manufacturing/products/${productId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['MfgProduct', 'MfgBom', 'MfgDashboard'],
      // Tracking changes what the purchase / sale / issue screens ask for.
      onQueryStarted: invalidateStockCaches,
    }),
    bulkProductTracking: builder.mutation<
      { updated: number; failed: { id: string; name: string; message: string }[] },
      { productIds: string[]; trackBatch?: boolean; trackExpiry?: boolean }
    >({
      query: (body) => ({
        url: '/manufacturing/products/bulk-tracking',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['MfgProduct', 'MfgBom'],
      onQueryStarted: invalidateStockCaches,
    }),
    /** Stock of a batch-tracked product that no batch accounts for → one new batch. */
    batchUnbatchedStock: builder.mutation<
      {
        id: string
        batchNumber: string
        quantity: number
        expiryDate: string | null
        costPerUnit: number
      },
      {
        productId: string
        variantId?: string | null
        batchNumber?: string
        expiryDate?: string | null
      }
    >({
      query: ({ productId, ...body }) => ({
        url: `/manufacturing/products/${productId}/batch-unbatched`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['MfgProduct'],
      onQueryStarted: invalidateStockCaches,
    }),
    searchManufacturingBatches: builder.query<BatchSearchResult[], string>({
      query: (search) => ({ url: '/manufacturing/batches/search', params: { search } }),
      providesTags: [...EXECUTION_TAGS],
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
    getBom: builder.query<Bom & BomTrackingInfo, string>({
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
    addOrderOperation: builder.mutation<
      ProductionOrder,
      {
        orderId: string
        name: string
        workCenter?: string
        plannedMinutes?: number
        costPerHour?: number
        instructions?: string
        afterOperationId?: string | null
      }
    >({
      query: ({ orderId, ...body }) => ({
        url: `/manufacturing/production-orders/${orderId}/operations`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['MfgOrder'],
    }),
    updateOrderOperation: builder.mutation<
      ProductionOrder,
      {
        orderId: string
        operationId: string
        name?: string
        workCenter?: string
        plannedMinutes?: number
        costPerHour?: number
        instructions?: string
      }
    >({
      query: ({ orderId, operationId, ...body }) => ({
        url: `/manufacturing/production-orders/${orderId}/operations/${operationId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['MfgOrder'],
    }),
    removeOrderOperation: builder.mutation<
      ProductionOrder,
      { orderId: string; operationId: string }
    >({
      query: ({ orderId, operationId }) => ({
        url: `/manufacturing/production-orders/${orderId}/operations/${operationId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['MfgOrder'],
    }),
    reorderOrderOperations: builder.mutation<
      ProductionOrder,
      { orderId: string; operationIds: string[] }
    >({
      query: ({ orderId, ...body }) => ({
        url: `/manufacturing/production-orders/${orderId}/operations/reorder`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['MfgOrder'],
    }),
    orderOperationAction: builder.mutation<
      ProductionOrder,
      {
        orderId: string
        operationId: string
        action: 'start' | 'complete' | 'reopen' | 'skip'
        at?: string | null
        actualMinutes?: number | null
        note?: string
      }
    >({
      query: ({ orderId, operationId, ...body }) => ({
        url: `/manufacturing/production-orders/${orderId}/operations/${operationId}/action`,
        method: 'POST',
        body,
      }),
      // A first step on a Released order moves it to In Production.
      invalidatesTags: ['MfgOrder', 'MfgDashboard', 'MfgRequirements'],
    }),
    getOrderCosts: builder.query<OrderCosts, string>({
      query: (orderId) => `/manufacturing/production-orders/${orderId}/costs`,
      providesTags: ['MfgOrder'],
    }),
    getOrderActivity: builder.query<OrderActivityEvent[], string>({
      query: (orderId) =>
        `/manufacturing/production-orders/${orderId}/activity`,
      providesTags: ['MfgOrder'],
    }),
    addOrderDocumentLink: builder.mutation<
      ProductionOrder,
      {
        orderId: string
        title: string
        url: string
        category?: OrderDocumentCategory
      }
    >({
      query: ({ orderId, ...body }) => ({
        url: `/manufacturing/production-orders/${orderId}/documents/link`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['MfgOrder'],
    }),
    uploadOrderDocument: builder.mutation<
      ProductionOrder,
      {
        orderId: string
        file: File
        title?: string
        category?: OrderDocumentCategory
      }
    >({
      query: ({ orderId, file, title, category }) => {
        const formData = new FormData()
        formData.append('file', file)
        if (title) formData.append('title', title)
        if (category) formData.append('category', category)
        return {
          url: `/manufacturing/production-orders/${orderId}/documents`,
          method: 'POST',
          body: formData,
        }
      },
      invalidatesTags: ['MfgOrder'],
    }),
    // A mutation, not a query: each call mints a fresh short-lived signed URL.
    getOrderDocumentUrl: builder.mutation<
      { url: string },
      { orderId: string; documentId: string }
    >({
      query: ({ orderId, documentId }) => ({
        url: `/manufacturing/production-orders/${orderId}/documents/${documentId}/url`,
        method: 'GET',
      }),
    }),
    removeOrderDocument: builder.mutation<
      ProductionOrder,
      { orderId: string; documentId: string }
    >({
      query: ({ orderId, documentId }) => ({
        url: `/manufacturing/production-orders/${orderId}/documents/${documentId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['MfgOrder'],
    }),
    getMaterialReceipts: builder.query<
      Paginated<MaterialReceipt>,
      {
        status?: string
        supplierId?: string
        search?: string
        dateFrom?: string
        dateTo?: string
        page?: number
        limit?: number
      }
    >({
      query: (params) => ({ url: '/manufacturing/material-receipts', params }),
      providesTags: ['MfgMaterialReceipt'],
    }),
    getMaterialReceipt: builder.query<MaterialReceipt, string>({
      query: (id) => `/manufacturing/material-receipts/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'MfgMaterialReceipt', id }],
    }),
    saveMaterialReceipt: builder.mutation<
      MaterialReceipt,
      { id?: string | null } & MaterialReceiptInput
    >({
      query: ({ id, ...body }) =>
        id
          ? {
              url: `/manufacturing/material-receipts/${id}`,
              method: 'PATCH',
              body,
            }
          : { url: '/manufacturing/material-receipts', method: 'POST', body },
      invalidatesTags: [
        'MfgMaterialReceipt',
        'MfgDashboard',
        'MfgRequirements',
        'MfgMovement',
      ],
      onQueryStarted: invalidateReceiptCaches,
    }),
    confirmMaterialReceipt: builder.mutation<MaterialReceipt, string>({
      query: (id) => ({
        url: `/manufacturing/material-receipts/${id}/confirm`,
        method: 'POST',
      }),
      invalidatesTags: [
        'MfgMaterialReceipt',
        'MfgDashboard',
        'MfgRequirements',
        'MfgMovement',
      ],
      onQueryStarted: invalidateReceiptCaches,
    }),
    deleteMaterialReceipt: builder.mutation<void, string>({
      query: (id) => ({
        url: `/manufacturing/material-receipts/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['MfgMaterialReceipt'],
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
      ProductionOutput & { orderCompleted?: boolean; packing?: { id: string; voucherNumber: string } | null },
      {
        orderId: string
        producedQuantity: number
        /** 'hold' → QC; 'direct' → finished stock now. Omitted: the require-QC setting. */
        qcMode?: 'direct' | 'hold'
        goodQuantity?: number
        rejectedQuantity?: number
        rejectDisposition?: RejectDisposition
        rejectReason?: string
        finishedGoods?: FinishedGoodsInput
        notes?: string
        /** Pack the good output in the same step (bulk → cartons / bags). */
        packing?: { lines: PackingLineInput[]; notes?: string }
        /** The variant made, for an order that never named one. */
        variantId?: string | null
        /** Packing material actually used beyond the recipe — taken from production stock. */
        floorUsage?: { productId: string; quantity: number }[]
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
      ProductionOutput & { orderCompleted?: boolean },
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
    /** Undo an output posted by mistake — stock, QC/rework, WIP; reopens a completed order. */
    reverseOutput: builder.mutation<
      ProductionOutput & { orderStatus: ProductionStatus; cancelledPacking?: string[] },
      {
        outputId: string
        reason: OutputReversalReason
        notes?: string
        /** A packed receipt: cancel its packing in the same step. */
        cancelPacking?: boolean
      }
    >({
      query: ({ outputId, ...body }) => ({
        url: `/manufacturing/outputs/${outputId}/reverse`,
        method: 'POST',
        body,
      }),
      invalidatesTags: [...EXECUTION_TAGS],
      onQueryStarted: invalidateStockCaches,
    }),
    resolveRework: builder.mutation<
      { reworkPendingQuantity: number; orderCompleted?: boolean },
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
        variantId?: string | null
        batchId?: string
        imeiIds?: string[]
        quantity?: number
        reason?: ScrapReason
        /** Calendar day (YYYY-MM-DD); omitted = now. */
        scrapDate?: string
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
        status?: ProductionOutput['status']
        dateFrom?: string
        dateTo?: string
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
    getManufacturingProductVariants: builder.query<
      { hasVariants: boolean; variants: { id: string; label: string; sku: string }[] },
      string
    >({
      query: (productId) => `/manufacturing/products/${productId}/variants`,
      providesTags: ['MfgProduct'],
    }),
    getPackableProducts: builder.query<PackableProduct[], void>({
      query: () => '/manufacturing/packing/products',
      providesTags: ['MfgPacking', 'MfgProduct'],
    }),
    getPackingSetup: builder.query<PackingSetup, { productId: string; variantId?: string | null }>({
      query: ({ productId, variantId }) => ({
        url: `/manufacturing/packing/setup/${productId}`,
        params: variantId ? { variantId } : undefined,
      }),
      providesTags: ['MfgPacking', 'MfgProduct'],
    }),
    savePackSizes: builder.mutation<PackingSetup, { productId: string; sizes: PackSizeInput[] }>({
      query: ({ productId, sizes }) => ({
        url: `/manufacturing/packing/setup/${productId}`,
        method: 'PUT',
        body: { sizes },
      }),
      invalidatesTags: ['MfgPacking'],
    }),
    createPackProduct: builder.mutation<
      { id: string; name: string; sku: string; unit: string; price: number },
      { productId: string; name: string; sku?: string; unit?: string; price?: number }
    >({
      query: ({ productId, ...body }) => ({
        url: `/manufacturing/packing/setup/${productId}/pack-product`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['MfgPacking', 'MfgProduct'],
    }),
    getPackingVouchers: builder.query<
      Paginated<PackingVoucher>,
      { productId?: string; productionOrderId?: string; status?: 'all' | 'posted' | 'cancelled'; search?: string; page?: number; limit?: number }
    >({
      query: (params) => ({ url: '/manufacturing/packing', params }),
      providesTags: ['MfgPacking'],
    }),
    postPacking: builder.mutation<
      PackingVoucher,
      { productId: string; lines: PackingLineInput[]; batchId?: string | null; productionOrderId?: string | null; packingDate?: string; notes?: string }
    >({
      query: (body) => ({ url: '/manufacturing/packing', method: 'POST', body }),
      invalidatesTags: [...EXECUTION_TAGS],
      onQueryStarted: invalidateStockCaches,
    }),
    cancelPacking: builder.mutation<PackingVoucher, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/manufacturing/packing/${id}/cancel`, method: 'POST', body: { reason } }),
      invalidatesTags: [...EXECUTION_TAGS],
      onQueryStarted: invalidateStockCaches,
    }),
    getFloorOverview: builder.query<FloorOverview, FloorPeriod>({
      query: (params) => ({ url: '/manufacturing/floor-stock', params }),
      providesTags: ['MfgFloor'],
    }),
    getFloorMaterial: builder.query<FloorMaterialDetail, FloorPeriod & { productId: string }>({
      query: ({ productId, ...params }) => ({ url: `/manufacturing/floor-stock/materials/${productId}`, params }),
      providesTags: ['MfgFloor'],
    }),
    getFloorPickList: builder.query<FloorPickItem[], void>({
      query: () => '/manufacturing/floor-stock/pick-list',
      providesTags: ['MfgFloor', 'MfgProduct'],
    }),
    getFloorUsageTemplate: builder.query<FloorUsageTemplate, string>({
      query: (productId) => `/manufacturing/floor-stock/usage-template/${productId}`,
      providesTags: ['MfgFloor'],
    }),
    getFloorMaterialChoices: builder.query<FloorMaterialChoice[], { search?: string }>({
      query: (params) => ({ url: '/manufacturing/floor-stock/material-choices', params }),
      providesTags: ['MfgFloor', 'MfgProduct'],
    }),
    setFloorIssueMethod: builder.mutation<
      { updated: number; issueMethod: 'floor' | 'order'; ordersUpdated: number },
      { productIds: string[]; issueMethod: 'floor' | 'order' }
    >({
      query: (body) => ({ url: '/manufacturing/floor-stock/issue-method', method: 'PUT', body }),
      invalidatesTags: ['MfgFloor', 'MfgProduct', 'MfgOrder', 'MfgRequirements'],
    }),
    getFloorVouchers: builder.query<
      Paginated<FloorVoucher>,
      FloorPeriod & { kind?: FloorVoucherKind | 'all'; status?: 'all' | 'posted' | 'cancelled'; productId?: string; search?: string; page?: number; limit?: number }
    >({
      query: (params) => ({ url: '/manufacturing/floor-stock/vouchers', params }),
      providesTags: ['MfgFloor'],
    }),
    getFloorVoucher: builder.query<FloorVoucher, string>({
      query: (id) => `/manufacturing/floor-stock/vouchers/${id}`,
      providesTags: ['MfgFloor'],
    }),
    postFloorVoucher: builder.mutation<
      FloorVoucher,
      {
        kind: FloorVoucherKind
        lines: { productId: string; quantity?: number; countedQuantity?: number }[]
        voucherDate?: string
        reason?: string
        notes?: string
      }
    >({
      query: ({ kind, ...body }) => ({ url: `/manufacturing/floor-stock/${kind}`, method: 'POST', body }),
      invalidatesTags: [...EXECUTION_TAGS],
      onQueryStarted: invalidateStockCaches,
    }),
    cancelFloorVoucher: builder.mutation<FloorVoucher, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/manufacturing/floor-stock/vouchers/${id}/cancel`, method: 'POST', body: { reason } }),
      invalidatesTags: [...EXECUTION_TAGS],
      onQueryStarted: invalidateStockCaches,
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
    checkProductionOrderBatch: builder.mutation<
      OrderBatchCheck,
      { header: OrderBatchHeader; lines: OrderBatchLine[] }
    >({
      query: (body) => ({
        url: '/manufacturing/production-orders/batch/check',
        method: 'POST',
        body,
      }),
    }),
    createProductionOrderBatch: builder.mutation<
      { orders: ProductionOrder[] },
      { header: OrderBatchHeader; lines: OrderBatchLine[] }
    >({
      query: (body) => ({
        url: '/manufacturing/production-orders/batch',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['MfgOrder', 'MfgDashboard', 'MfgRequirements'],
    }),
    getMaterialIssue: builder.query<MaterialIssue, string>({
      query: (issueId) => `/manufacturing/material-issues/${issueId}`,
      providesTags: ['MfgIssue'],
    }),
    getIssueOptions: builder.query<IssueOptions, void>({
      query: () => '/manufacturing/material-issues/options',
      providesTags: ['MfgSettings', 'MfgOrder'],
    }),
    getMaterialIssuePlan: builder.query<
      MaterialIssuePlan,
      {
        productId: string
        variantId?: string | null
        bomId?: string | null
        quantity: number
      }
    >({
      query: (params) => ({
        url: '/manufacturing/material-issues/plan',
        params: Object.fromEntries(
          Object.entries(params).filter(([, v]) => v !== null && v !== '')
        ),
      }),
      providesTags: ['MfgOrder', 'MfgBom'],
    }),
    getPendingMaterials: builder.query<
      { materials: PendingMaterial[] },
      { productType?: string } | void
    >({
      query: (params) => ({
        url: '/manufacturing/material-issues/pending',
        params: params?.productType ? { productType: params.productType } : {},
      }),
      providesTags: ['MfgOrder', 'MfgIssue'],
    }),
    postMaterialIssueByMaterial: builder.mutation<
      IssueByMaterialResult,
      IssueByMaterialBody
    >({
      query: (body) => ({
        url: '/manufacturing/material-issues/by-material',
        method: 'POST',
        body,
      }),
      invalidatesTags: [...EXECUTION_TAGS],
      onQueryStarted: invalidateStockCaches,
    }),
    getMaterialIssueReversal: builder.query<IssueReversalPreview, string>({
      query: (issueId) => `/manufacturing/material-issues/${issueId}/reversal`,
      providesTags: ['MfgIssue', 'MfgOrder'],
    }),
    cancelMaterialIssue: builder.mutation<
      MaterialIssue,
      {
        issueId: string
        reason: string
        revision?: number
        cancelOrder?: boolean
      }
    >({
      query: ({ issueId, ...body }) => ({
        url: `/manufacturing/material-issues/${issueId}/cancel`,
        method: 'POST',
        body,
      }),
      invalidatesTags: [...EXECUTION_TAGS],
      onQueryStarted: invalidateStockCaches,
    }),
    editMaterialIssue: builder.mutation<
      MaterialIssue,
      { issueId: string; body: EditIssueBody }
    >({
      query: ({ issueId, body }) => ({
        url: `/manufacturing/material-issues/${issueId}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: [...EXECUTION_TAGS],
      onQueryStarted: invalidateStockCaches,
    }),
    getMaterialUsage: builder.query<
      MaterialUsageReport,
      {
        status?: 'all' | 'open' | 'completed'
        search?: string
        dateFrom?: string
        dateTo?: string
        productionOrderId?: string
      }
    >({
      query: (params) => ({
        url: '/manufacturing/material-usage',
        params: Object.fromEntries(
          Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
        ),
      }),
      providesTags: ['MfgIssue', 'MfgOrder'],
    }),
    checkMaterialIssue: builder.mutation<IssueVoucherCheck, IssueVoucherBody>({
      query: (body) => ({
        url: '/manufacturing/material-issues/check',
        method: 'POST',
        body,
      }),
    }),
    postMaterialIssue: builder.mutation<MaterialIssue, IssueVoucherBody>({
      query: (body) => ({
        url: '/manufacturing/material-issues',
        method: 'POST',
        body,
      }),
      invalidatesTags: [...EXECUTION_TAGS],
      onQueryStarted: invalidateStockCaches,
    }),
    getMaterialIssues: builder.query<
      Paginated<MaterialIssue>,
      ListParams & {
        productionOrderId?: string
        kind?: 'issue' | 'return'
        status?: 'posted' | 'cancelled'
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
    // Reports centre (features/manufacturing/pages/reports.tsx) — read-only statements.
    getManufacturingReport: builder.query<ManufacturingReport, ReportParams>({
      query: ({ report, ...params }) => ({
        url: `/manufacturing/reports/${report}`,
        params: Object.fromEntries(
          Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
        ),
      }),
      providesTags: [...EXECUTION_TAGS],
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
  useGetFloorOverviewQuery,
  useGetFloorMaterialQuery,
  useGetFloorPickListQuery,
  useGetFloorMaterialChoicesQuery,
  useGetFloorUsageTemplateQuery,
  useSetFloorIssueMethodMutation,
  useGetFloorVouchersQuery,
  useGetFloorVoucherQuery,
  usePostFloorVoucherMutation,
  useCancelFloorVoucherMutation,
  useGetManufacturingProductVariantsQuery,
  useGetPackableProductsQuery,
  useGetPackingSetupQuery,
  useSavePackSizesMutation,
  useCreatePackProductMutation,
  useGetPackingVouchersQuery,
  usePostPackingMutation,
  useCancelPackingMutation,
  useGetManufacturingAccessQuery,
  useGetManufacturingDashboardQuery,
  useGetManufacturingAnalyticsQuery,
  useGetManufacturingSettingsQuery,
  useUpdateManufacturingSettingsMutation,
  useGetDemoDataStatusQuery,
  useLoadDemoDataMutation,
  useRemoveDemoDataMutation,
  useGetManufacturingProductsQuery,
  useGetManufacturingProductStatsQuery,
  useGetManufacturingProductOverviewQuery,
  useGetProductTypeSummaryQuery,
  useLazyGetMatchingManufacturingProductIdsQuery,
  useUpdateManufacturingProductMutation,
  useBulkClassifyProductsMutation,
  useBulkProductTrackingMutation,
  useBatchUnbatchedStockMutation,
  useSearchManufacturingBatchesQuery,
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
  useGetMaterialReceiptsQuery,
  useGetMaterialReceiptQuery,
  useSaveMaterialReceiptMutation,
  useConfirmMaterialReceiptMutation,
  useDeleteMaterialReceiptMutation,
  useAddOrderOperationMutation,
  useUpdateOrderOperationMutation,
  useRemoveOrderOperationMutation,
  useReorderOrderOperationsMutation,
  useOrderOperationActionMutation,
  useGetOrderCostsQuery,
  useGetOrderActivityQuery,
  useAddOrderDocumentLinkMutation,
  useUploadOrderDocumentMutation,
  useGetOrderDocumentUrlMutation,
  useRemoveOrderDocumentMutation,
  useGetOrderRequirementsQuery,
  useGetRequirementsQuery,
  useIssueMaterialsMutation,
  useReturnMaterialsMutation,
  useReportOutputMutation,
  useInspectOutputMutation,
  useReverseOutputMutation,
  useResolveReworkMutation,
  useGetOutputsQuery,
  useGetMovementsQuery,
  useGetStockDetailQuery,
  useRecordScrapMutation,
  useGetMaterialIssuesQuery,
  useGetMaterialIssueQuery,
  useCheckProductionOrderBatchMutation,
  useCreateProductionOrderBatchMutation,
  useGetIssueOptionsQuery,
  useGetMaterialIssuePlanQuery,
  useLazyGetMaterialIssuePlanQuery,
  useGetMaterialUsageQuery,
  useGetMaterialIssueReversalQuery,
  useCancelMaterialIssueMutation,
  useEditMaterialIssueMutation,
  useGetPendingMaterialsQuery,
  usePostMaterialIssueByMaterialMutation,
  useCheckMaterialIssueMutation,
  usePostMaterialIssueMutation,
  useGetProductionReceiptsQuery,
  useGetScrapRecordsQuery,
  useGetWipQuery,
  useGetManufacturingReportQuery,
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
