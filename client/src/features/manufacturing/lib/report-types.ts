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

export interface ReportParams {
  report: ReportKey
  startDate?: string
  endDate?: string
  status?: 'all' | 'open' | 'completed'
  productId?: string
  productionOrderId?: string
  search?: string
  hideIdle?: boolean
}

interface Period {
  startDate: string
  endDate: string
}

export interface ProductionReportOrder {
  id: string
  orderNumber: string
  orderType: OrderType
  status: ProductionStatus
  productId: string
  productName: string
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

export type ManufacturingReport =
  | DailyReport
  | BatchReport
  | ProductionReport
  | IssueRegisterReport
  | ConsumptionReport
  | StockStatementReport
  | StockRegisterReport
  | InProcessReport
  | ScrapReport
