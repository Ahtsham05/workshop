import type { ProductionStatus, OrderType, ScrapStage, ScrapReason } from '@/stores/manufacturing.api'

/** Responses of GET /manufacturing/reports/:report (server/src/services/manufacturing/reports.service.js). */

export type ReportKey =
  | 'production'
  | 'material-issues'
  | 'material-consumption'
  | 'finished-goods'
  | 'raw-materials'
  | 'stock-register'
  | 'in-process'
  | 'scrap'
  | 'daily'
  | 'batch'
  | 'batch-stock'
  | 'batch-trace'
  | 'product-production'
  | 'product-summary'

export interface ReportParams {
  report: ReportKey
  startDate?: string
  endDate?: string
  status?: 'all' | 'open' | 'completed'
  productId?: string
  productionOrderId?: string
  search?: string
  hideIdle?: boolean
  batchId?: string
  kind?: 'all' | 'finished' | 'materials'
  expiry?: 'all' | 'expired' | '30' | '60' | '90'
  stock?: 'in' | 'all'
  /** Product-wise register: the product line (comma-separated ids) and typed kg per pack. */
  productIds?: string
  packWeights?: string
}

interface Period {
  startDate: string
  endDate: string
}

export interface ProductionReportOrder {
  id: string
  orderNumber: string
  batchNumber?: string
  orderType: OrderType
  status: ProductionStatus
  productId: string
  productName: string
  /** Manufacturing type of the product made (finished_good, by_product, …). */
  productType: string | null
  sku: string
  unit: string
  bomNumber: string
  operatorName: string
  startDate: string | null
  dueDate: string | null
  completedDate: string | null
  planned: number
  produced: number
  good: number
  rejected: number
  inQc: number
  balance: number
  completionPercent: number
  materialCost: number
  finishedValue: number
  unitCost: number
  periodProduced: number
  periodGood: number
  periodGoodValue: number
  periodIssued: number
  isLate: boolean
}

export interface ProductionReport {
  report: 'production'
  period: Period
  orders: ProductionReportOrder[]
  byProduct: {
    productId: string
    productName: string
    productType: string | null
    sku: string
    unit: string
    orders: number
    planned: number
    produced: number
    good: number
    rejected: number
    inQc: number
    balance: number
    periodGood: number
    materialCost: number
    finishedValue: number
  }[]
  totals: {
    orderCount: number
    openCount: number
    completedCount: number
    lateCount: number
    materialCost: number
    finishedValue: number
    periodGood: number
    periodGoodValue: number
    periodIssued: number
  }
  truncated: boolean
}

export interface IssueRegisterReport {
  report: 'material-issues'
  period: Period
  vouchers: {
    id: string
    number: string
    kind: 'issue' | 'return'
    date: string
    orderId: string
    orderNumber: string
    orderProduct: string
    issuedBy: string
    reference: string
    notes: string
    total: number
    lines: {
      productId: string
      productName: string
      unit: string
      quantity: number
      unitCost: number
      totalCost: number
      batchNumber: string
      isAlternative: boolean
    }[]
  }[]
  byMaterial: {
    productId: string
    productName: string
    unit: string
    issuedQty: number
    issuedValue: number
    returnedQty: number
    returnedValue: number
    netQty: number
    netValue: number
    vouchers: number
  }[]
  totals: {
    voucherCount: number
    returnCount: number
    lineCount: number
    issuedValue: number
    returnedValue: number
    netValue: number
    cancelledCount: number
  }
  truncated: boolean
}

export interface ConsumptionLine {
  productId: string
  productName: string
  sku: string
  unit: string
  /** Packing material recorded on a receipt beyond the recipe, used straight from production stock. */
  extra?: boolean
  required: number
  issued: number
  returned: number
  used: number
  wastage: number
  inFactory: number
  toIssue: number
  standard: number
  variance: number
  issuedValue: number
  usedValue: number
  returnedValue: number
  wastageValue: number
  inFactoryValue: number
}

export interface ConsumptionReport {
  report: 'material-consumption'
  period: Period
  materials: (ConsumptionLine & { orders: number })[]
  orders: {
    id: string
    orderNumber: string
    status: ProductionStatus
    productName: string
    unit: string
    planned: number
    good: number
    lines: ConsumptionLine[]
    issuedValue: number
    usedValue: number
    wastageValue: number
    inFactoryValue: number
  }[]
  totals: {
    issuedValue: number
    usedValue: number
    returnedValue: number
    wastageValue: number
    inFactoryValue: number
    orderCount: number
    materialCount: number
    wastagePercent: number
  }
  truncated: boolean
}

export const MOVEMENT_KEYS = [
  'produced',
  'purchased',
  'salesReturn',
  'returnedFromProduction',
  'transferIn',
  'sold',
  'purchaseReturn',
  'issued',
  'transferOut',
  'scrapped',
  'packedIn',
  'packedOut',
  'issuedToFloor',
  'returnedFromFloor',
  'adjustment',
] as const
export type MovementKey = (typeof MOVEMENT_KEYS)[number]

export interface StockStatementRow {
  productId: string
  productName: string
  nameUrdu: string
  sku: string
  unit: string
  productType: string | null
  opening: number
  movements: Record<MovementKey, number>
  totalIn: number
  totalOut: number
  closing: number
  current: number
  unitCost: number
  closingValue: number
  salePrice: number
}

export interface StockStatementReport {
  report: 'finished-goods' | 'raw-materials'
  period: Period
  rows: StockStatementRow[]
  totals: {
    productCount: number
    closingValue: number
    movements: Record<MovementKey, number>
  }
}

export type RegisterSource = MovementKey | 'transferIn' | 'transferOut'

export interface StockRegisterReport {
  report: 'stock-register'
  period: Period
  product: {
    id: string
    name: string
    nameUrdu: string
    sku: string
    unit: string
    productType: string | null
    unitCost: number
    current: number
  }
  opening: number
  closing: number
  rows: {
    source: RegisterSource
    id: string
    date: string
    number: string
    quantity: number
    rate: number | null
    partyName: string | null
    invoiceType?: string
    orderNumber?: string
    note?: string
    in: number
    out: number
    balance: number
  }[]
  totals: { in: number; out: number; count: number }
}

export interface InProcessReport {
  report: 'in-process'
  asOf: string
  batches: {
    id: string
    orderNumber: string
    orderType: OrderType
    status: ProductionStatus
    priority: string
    productName: string
    sku: string
    unit: string
    wipLocation: string
    operatorName: string
    startedAt: string | null
    dueDate: string | null
    daysInProcess: number | null
    daysOverdue: number
    stage: string
    stageStatus: 'running' | 'next' | ''
    operationsDone: number
    operationsTotal: number
    planned: number
    produced: number
    good: number
    rejected: number
    qcPending: number
    reworkPending: number
    balance: number
    completionPercent: number
    materialCost: number
    wipValue: number
    materials: {
      productName: string
      unit: string
      required: number
      issued: number
      consumed: number
      scrapped: number
      inWip: number
      toIssue: number
      wipValue: number
      batches: string[]
    }[]
  }[]
  totals: {
    batchCount: number
    planned: number
    wipValue: number
    qcPending: number
    reworkPending: number
    overdueCount: number
    notStartedCount: number
  }
}

export interface ScrapReport {
  report: 'scrap'
  period: Period
  rows: {
    id: string
    number: string
    date: string
    orderNumber: string
    productName: string
    unit: string
    stage: ScrapStage
    reason: ScrapReason
    quantity: number
    unitCost: number
    value: number
    affectsStock: boolean
    notes: string
  }[]
  byStage: { key: ScrapStage; count: number; value: number }[]
  byReason: { key: ScrapReason; count: number; value: number }[]
  byProduct: { productName: string; unit: string; quantity: number; value: number; count: number }[]
  totals: { count: number; value: number }
  truncated: boolean
}

export interface DailyReport {
  report: 'daily'
  period: Period
  openingWip: number
  closingWip: number
  days: {
    date: string
    batches: number
    vouchers: number
    issued: number
    returned: number
    consumed: number
    /** Material used straight from production stock at receipt — never in the WIP balance. */
    floorUsed: number
    floorScrap: number
    wipBalance: number
    produced: number
    good: number
    rejected: number
    goodValue: number
    scrapValue: number
  }[]
  batches: {
    date: string
    orderId: string
    orderNumber: string
    orderType: OrderType
    productName: string
    unit: string
    planned: number
    issued: number
    produced: number
    good: number
    rejected: number
    goodValue: number
    cumulativeGood: number
    remaining: number
  }[]
  totals: {
    issued: number
    returned: number
    consumed: number
    floorUsed: number
    floorScrap: number
    goodValue: number
    scrapValue: number
    produced: number
    good: number
    activeDays: number
    batchCount: number
  }
}

export interface BatchReport {
  report: 'batch'
  order: {
    id: string
    orderNumber: string
    batchNumber?: string
    orderType: OrderType
    status: ProductionStatus
    priority: string
    productName: string
    sku: string
    unit: string
    bomNumber: string
    bomVersion: number | null
    operatorName: string
    team: string[]
    wipLocation: string
    finishedGoodsLocation: string
    createdAt: string
    plannedStartDate: string | null
    plannedCompletionDate: string | null
    actualStartDate: string | null
    actualCompletionDate: string | null
    notes: string
  }
  quantities: {
    planned: number
    produced: number
    good: number
    rejected: number
    reworkedGood: number
    scrapped: number
    qcPending: number
    reworkPending: number
    remaining: number
    completionPercent: number
  }
  costs: {
    issuedValue: number
    returnedValue: number
    usedValue: number
    wastageValue: number
    inFactoryValue: number
    finishedValue: number
    unitCost: number
    scrapValue: number
  }
  materials: ConsumptionLine[]
  issues: {
    voucherId: string
    number: string
    kind: 'issue' | 'return'
    date: string
    first: boolean
    last: boolean
    issuedBy: string
    productName: string
    unit: string
    quantity: number
    unitCost: number
    totalCost: number
    batchNumber: string
    balance: number
  }[]
  cancelledVouchers: { number: string; reason: string }[]
  outputs: {
    id: string
    number: string
    date: string
    produced: number
    good: number
    rejected: number
    disposition: 'scrap' | 'rework' | null
    reason: string
    status: string
    materialCost: number
  }[]
  receipts: {
    id: string
    number: string
    date: string
    source: 'output' | 'rework' | 'direct'
    quantity: number
    unitCost: number
    value: number
    batchNumber: string
    cumulative: number
    remaining: number
  }[]
  scrap: {
    id: string
    number: string
    date: string
    productName: string
    unit: string
    stage: ScrapStage
    reason: ScrapReason
    quantity: number
    value: number
  }[]
  operations: {
    name: string
    workCenter: string
    status: string
    startedAt: string | null
    completedAt: string | null
    plannedMinutes: number
    actualMinutes: number | null
    by: string
  }[]
}

export type BatchState = 'ok' | 'expiring' | 'expired' | 'no_expiry' | 'depleted' | 'written_off'

export interface BatchSource {
  kind: 'production' | 'purchase' | 'opening' | 'other'
  id: string | null
  /** Order number, or the purchase invoice number. */
  label: string
  /** Supplier name for purchased batches. */
  party: string
}

export interface BatchStockReport {
  report: 'batch-stock'
  asOf: string
  soonDays: number
  rows: {
    id: string
    productId: string
    productName: string
    sku: string
    productType: string | null
    unit: string
    batchNumber: string
    source: BatchSource
    manufactureDate: string | null
    receivedDate: string
    expiryDate: string | null
    daysToExpiry: number | null
    ageDays: number | null
    quantity: number
    unitCost: number
    value: number
    state: BatchState
  }[]
  byProduct: {
    productId: string
    productName: string
    sku: string
    unit: string
    batches: number
    quantity: number
    value: number
    expiredQuantity: number
    nearestExpiry: string | null
  }[]
  totals: {
    batches: number
    products: number
    value: number
    expiredCount: number
    expiredValue: number
    expiringCount: number
    expiringValue: number
  }
  truncated: boolean
}

export interface BatchTraceReport {
  report: 'batch-trace'
  batch: {
    id: string
    batchNumber: string
    productId: string
    productName: string
    sku: string
    unit: string
    productType: string | null
    quantity: number
    unitCost: number
    value: number
    manufactureDate: string | null
    receivedDate: string
    expiryDate: string | null
    daysToExpiry: number | null
    state: BatchState
    source: BatchSource
  }
  summary: {
    received: number
    issuedToProduction: number
    sold: number
    scrapped: number
    other: number
    balance: number
  }
  movements: {
    date: string
    type: string
    label: string
    number: string
    party: string
    refType?: string
    refId?: string | null
    orderId?: string | null
    quantityIn: number
    quantityOut: number
    balance: number
  }[]
  madeFrom: {
    orderId: string
    orderNumber: string
    productName: string
    unit: string
    plannedQuantity: number
    completedQuantity: number
    receivedIntoBatch: number
    status: ProductionStatus
    materials: {
      productId: string
      productName: string
      unit: string
      quantity: number
      batchId: string | null
      batchNumber: string
      expiryDate: string | null
      sources: { kind: 'production' | 'purchase' | 'untracked'; label: string; orderId?: string | null }[]
    }[]
  }[]
  usedIn: {
    orderId: string
    orderNumber: string
    productName: string
    status: ProductionStatus
    quantityUsed: number
    unit: string
    produced: {
      receiptNumber: string
      quantity: number
      unit: string
      date: string
      batchId: string | null
      batchNumber: string
    }[]
  }[]
  soldTo: { invoiceId: string; number: string; customer: string; date: string; quantity: number }[]
}

export interface ProductRegisterOption {
  productId: string
  name: string
  sku: string
  unit: string
  orders: number
  lastOrderAt: string
}

export type WeightSource = 'unit' | 'conversion' | 'recipe' | 'pack' | 'manual' | null

export interface ProductRegisterPack {
  key: string
  productId: string
  variantId: string | null
  name: string
  shortName: string
  sku: string
  unit: string
  kgPerUnit: number | null
  weightSource: WeightSource
  byWeight: boolean
  /** Received by weight beside real packs — shown as "extra packing". */
  loose: boolean
  quantity: number
  kg: number
}

export interface ProductRegisterMaterial {
  key: string
  productId: string
  name: string
  sku: string
  unit: string
  kgPerUnit: number | null
  weightSource: WeightSource
  issued: number
  returned: number
  scrapped: number
  netKg: number | null
}

export interface ProductRegisterDay {
  date: string
  batches: number
  batchNumbers: string[]
  /** Material key → quantity in the material's unit. */
  issued: Record<string, number>
  returned: Record<string, number>
  /** Pack key → quantity in the pack's unit. */
  packs: Record<string, number>
  issueKg: number
  returnedKg: number
  packedKg: number
  looseKg: number
  finishedKg: number
  scrapKg: number
  cumIssueKg: number
  cumFinishedKg: number
  inProcessKg: number
}

export interface ProductRegisterBatch {
  orderId: string
  orderNumber: string
  batchNumber: string
  orderType: OrderType
  status: ProductionStatus
  productName: string
  packKey: string | null
  unit: string
  startedOn: string | null
  lastReceiptAt: string | null
  planned: number
  issuedKg: number
  returnedKg: number
  netIssuedKg: number
  finishedQty: number
  finishedKg: number
  scrapKg: number
  inProcessKg: number
  yieldPercent: number | null
}

interface ProductRegisterEmpty {
  report: 'product-production' | 'product-summary'
  period: Period
  options: ProductRegisterOption[]
  needsProduct: true
}

export interface ProductRegisterData {
  /** 'product-summary' is the same register with the issue as one total column. */
  report: 'product-production' | 'product-summary'
  period: Period
  options: ProductRegisterOption[]
  needsProduct?: false
  selected: { productId: string; name: string; sku: string; unit: string }[]
  baseUnit: 'kg'
  materials: ProductRegisterMaterial[]
  packs: ProductRegisterPack[]
  hasLoose: boolean
  openingInProcessKg: number
  closingInProcessKg: number
  days: ProductRegisterDay[]
  batches: ProductRegisterBatch[]
  warnings: { kind: 'pack' | 'material'; names: string[]; message: string }[]
  totals: {
    batches: number
    issueKg: number
    returnedKg: number
    netIssueKg: number
    packedKg: number
    looseKg: number
    finishedKg: number
    scrapKg: number
    activeDays: number
    completedBatches: number
    completedYieldPercent: number | null
  }
}

export type ProductProductionReport = ProductRegisterEmpty | ProductRegisterData

export type ManufacturingReport =
  | ProductProductionReport
  | BatchStockReport
  | BatchTraceReport
  | DailyReport
  | BatchReport
  | ProductionReport
  | IssueRegisterReport
  | ConsumptionReport
  | StockStatementReport
  | StockRegisterReport
  | InProcessReport
  | ScrapReport
