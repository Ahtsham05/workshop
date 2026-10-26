import { formatAppDate, formatAppDateTime } from '@/lib/date-format'
import {
  SCRAP_REASON_LABELS,
  SCRAP_STAGE_LABELS,
  fmtQty,
  statusLabel,
} from './constants'
import type {
  BatchReport,
  BatchSource,
  BatchState,
  BatchStockReport,
  BatchTraceReport,
  ConsumptionLine,
  DailyReport,
  ConsumptionReport,
  InProcessReport,
  IssueRegisterReport,
  ProductProductionReport,
  ProductRegisterData,
  WeightSource,
  ManufacturingReport,
  MovementKey,
  ProductionReport,
  ReportKey,
  ScrapReport,
  StockRegisterReport,
  StockStatementReport,
} from './report-types'

/*
 * A report is first turned into a plain "document" — title, summary figures, and ruled
 * tables of already-formatted cells — and that one document is drawn three ways: on
 * screen (components/report-view.tsx), printed (report-print.ts) and exported to Excel
 * (report-excel.ts). So the three can never disagree about a figure.
 *
 * Bank-statement conventions throughout: figures are bare (the currency is named once in
 * the column header), zero movements are left blank, balances always show.
 */

export type Align = 'left' | 'right' | 'center'

export interface DocColumn {
  key: string
  label: string
  align?: Align
  /** Width hint for print (CSS length, e.g. '8%'). */
  width?: string
  /** Header band above several adjacent columns ("Receipts (In)" / "Issues (Out)"). */
  group?: string
  /** Keep on one line (document numbers, dates). */
  nowrap?: boolean
}

export interface DocCell {
  text: string
  /** Raw value for Excel (number stays a number). */
  value?: number | string
  sub?: string
  strong?: boolean
  tone?: 'danger' | 'muted' | 'success'
}

export type CellInput = DocCell | string | null | undefined

/** Screen only: open a product's stock register or a batch's production report. */
export type ReportDrill = { productId: string } | { orderId: string } | { batchId: string }

export interface DocRow {
  kind?: 'line' | 'group' | 'subtotal' | 'total' | 'opening' | 'closing'
  cells: Record<string, CellInput>
  /** A label cell spanning the first N columns (group headers, brought forward, totals). */
  label?: string
  labelSub?: string
  labelSpan?: number
  /** First line of a multi-line entry — drawn with a heavier rule above. */
  groupStart?: boolean
  /** Screen only: open this order / product register. */
  link?: string
  drill?: ReportDrill
}

export interface DocSection {
  id: string
  title?: string
  note?: string
  columns: DocColumn[]
  rows: DocRow[]
  empty?: string
}

export interface ReportDoc {
  key: ReportKey
  title: string
  /** Second title line, e.g. the product of a stock register. */
  subtitle?: string
  periodStart?: string
  periodEnd?: string
  asOf?: string
  orientation: 'portrait' | 'landscape'
  info?: { label: string; value: string }[]
  summary: { label: string; value: string; hint?: string; emphasis?: boolean }[]
  sections: DocSection[]
  footnotes?: string[]
}

export interface DocContext {
  t: (s: string) => string
  /** Bare money figure, e.g. "12,345.00". */
  figure: (n: number) => string
  /** Currency symbol for headers, e.g. "Rs". */
  currency: string
  /**
   * The viewer may not see manufacturing costs (viewManufacturingCosts): every money
   * column and summary figure is dropped, leaving the quantity report. Money is
   * recognised by its header — all money headers go through withCur().
   */
  hideMoney?: boolean
}

const EPS = 1e-9
const isZero = (n: number) => Math.abs(Number(n) || 0) < EPS
const day = (iso?: string | null) => (iso ? formatAppDate(new Date(iso)) : '—')
/** "YYYY-MM-DD" → local date without the UTC shift. */
export const keyToDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const qty = (n: number, { blank = true, strong = false } = {}): DocCell => ({
  text: blank && isZero(n) ? '' : fmtQty(n),
  value: Number(n) || 0,
  strong,
})
const cash = (ctx: DocContext, n: number, { blank = true, strong = false } = {}): DocCell => ({
  text: blank && isZero(n) ? '' : ctx.figure(n),
  value: Math.round((Number(n) || 0) * 100) / 100,
  strong,
})
const pct = (n: number): DocCell => ({ text: `${Math.round(n * 10) / 10}%`, value: n })
const withCur = (ctx: DocContext, label: string) =>
  ctx.currency ? `${ctx.t(label)} (${ctx.currency})` : ctx.t(label)

/* ── Production ──────────────────────────────────────────────────────────────── */

function productionDoc(data: ProductionReport, ctx: DocContext): ReportDoc {
  const { t } = ctx
  const orderCols: DocColumn[] = [
    { key: 'order', label: t('Order No.'), width: '8%', nowrap: true },
    { key: 'product', label: t('Product'), width: '15%' },
    { key: 'start', label: t('Started'), width: '7%', nowrap: true },
    { key: 'due', label: t('Due'), width: '7%', nowrap: true },
    { key: 'status', label: t('Status'), width: '7%' },
    { key: 'unit', label: t('Unit'), width: '4%' },
    { key: 'planned', label: t('Planned'), align: 'right', group: t('Quantity') },
    { key: 'produced', label: t('Produced'), align: 'right', group: t('Quantity') },
    { key: 'good', label: t('Completed'), align: 'right', group: t('Quantity') },
    { key: 'rejected', label: t('Rejected'), align: 'right', group: t('Quantity') },
    { key: 'inQc', label: t('In QC'), align: 'right', group: t('Quantity') },
    { key: 'balance', label: t('Remaining'), align: 'right', group: t('Quantity') },
    { key: 'pct', label: t('Done'), align: 'right', width: '5%' },
    { key: 'materialCost', label: withCur(ctx, 'Material cost'), align: 'right', width: '9%' },
    { key: 'finishedValue', label: withCur(ctx, 'FG value'), align: 'right', width: '9%' },
  ]
  const orderRows: DocRow[] = data.orders.map((o) => ({
    drill: { orderId: o.id },
    cells: {
      order: {
        text: o.orderNumber,
        sub:
          [o.batchNumber && o.batchNumber !== o.orderNumber ? `${t('Batch')} ${o.batchNumber}` : '', o.bomNumber]
            .filter(Boolean)
            .join(' · ') || undefined,
        strong: true,
      },
      product: { text: o.productName, sub: o.sku || undefined },
      start: day(o.startDate),
      due: { text: day(o.dueDate), tone: o.isLate ? 'danger' : undefined },
      status: statusLabel(o.status, o.orderType),
      unit: o.unit,
      planned: qty(o.planned, { blank: false }),
      produced: qty(o.produced),
      good: qty(o.good, { strong: true }),
      rejected: { ...qty(o.rejected), tone: o.rejected > 0 ? 'danger' : undefined },
      inQc: qty(o.inQc),
      balance: qty(o.balance, { blank: false, strong: true }),
      pct: pct(o.completionPercent),
      materialCost: cash(ctx, o.materialCost),
      finishedValue: cash(ctx, o.finishedValue),
    },
  }))
  if (orderRows.length) {
    orderRows.push({
      kind: 'total',
      label: `${t('Total')} — ${data.orders.length} ${t('orders')}`,
      labelSpan: 13,
      cells: {
        materialCost: cash(ctx, data.totals.materialCost, { blank: false, strong: true }),
        finishedValue: cash(ctx, data.totals.finishedValue, { blank: false, strong: true }),
      },
    })
  }

  const productCols: DocColumn[] = [
    { key: 'product', label: t('Product'), width: '22%' },
    { key: 'unit', label: t('Unit'), width: '5%' },
    { key: 'orders', label: t('Orders'), align: 'right' },
    { key: 'planned', label: t('Planned'), align: 'right' },
    { key: 'produced', label: t('Produced'), align: 'right' },
    { key: 'good', label: t('Completed'), align: 'right' },
    { key: 'rejected', label: t('Rejected'), align: 'right' },
    { key: 'balance', label: t('Remaining'), align: 'right' },
    { key: 'periodGood', label: t('Completed in period'), align: 'right' },
    { key: 'materialCost', label: withCur(ctx, 'Material cost'), align: 'right' },
    { key: 'finishedValue', label: withCur(ctx, 'FG value'), align: 'right' },
  ]
  const productRows: DocRow[] = data.byProduct.map((p) => ({
    cells: {
      product: { text: p.productName, sub: p.sku || undefined, strong: true },
      unit: p.unit,
      orders: { text: String(p.orders), value: p.orders },
      planned: qty(p.planned, { blank: false }),
      produced: qty(p.produced),
      good: qty(p.good, { strong: true }),
      rejected: qty(p.rejected),
      balance: qty(p.balance, { blank: false, strong: true }),
      periodGood: qty(p.periodGood),
      materialCost: cash(ctx, p.materialCost),
      finishedValue: cash(ctx, p.finishedValue),
    },
  }))

  return {
    key: 'production',
    title: t('Production Summary'),
    periodStart: data.period.startDate,
    periodEnd: data.period.endDate,
    orientation: 'landscape',
    summary: [
      {
        label: t('Orders worked'),
        value: String(data.totals.orderCount),
        hint: `${data.totals.openCount} ${t('open')} · ${data.totals.completedCount} ${t('completed')}${data.totals.lateCount ? ` · ${data.totals.lateCount} ${t('late')}` : ''}`,
      },
      { label: withCur(ctx, 'Material issued in period'), value: ctx.figure(data.totals.periodIssued) },
      { label: withCur(ctx, 'Finished goods received in period'), value: ctx.figure(data.totals.periodGoodValue) },
      { label: withCur(ctx, 'Finished goods value (orders)'), value: ctx.figure(data.totals.finishedValue), emphasis: true },
    ],
    sections: [
      {
        id: 'orders',
        title: t('Batch-wise production summary'),
        note: t('Remaining = planned − completed − waiting in QC / rework. Quantities are the whole order to date.'),
        columns: orderCols,
        rows: orderRows,
        empty: t('No production orders were worked in this period.'),
      },
      {
        id: 'products',
        title: t('Product-wise summary'),
        columns: productCols,
        rows: productRows,
        empty: t('No products.'),
      },
    ],
  }
}

/* ── Material issue register ─────────────────────────────────────────────────── */

function issueRegisterDoc(data: IssueRegisterReport, ctx: DocContext): ReportDoc {
  const { t } = ctx
  const cols: DocColumn[] = [
    { key: 'date', label: t('Date'), width: '8%', nowrap: true },
    { key: 'voucher', label: t('Voucher'), width: '9%', nowrap: true },
    { key: 'order', label: t('Production order'), width: '15%', nowrap: true },
    { key: 'material', label: t('Material'), width: '20%' },
    { key: 'qty', label: t('Qty'), align: 'right' },
    { key: 'unit', label: t('Unit'), width: '5%' },
    { key: 'rate', label: withCur(ctx, 'Rate'), align: 'right' },
    { key: 'issued', label: withCur(ctx, 'Issued'), align: 'right' },
    { key: 'returned', label: withCur(ctx, 'Returned'), align: 'right' },
    { key: 'balance', label: withCur(ctx, 'Net balance'), align: 'right' },
  ]
  let running = 0
  const rows: DocRow[] = []
  data.vouchers.forEach((v) => {
    const isReturn = v.kind === 'return'
    v.lines.forEach((l, i) => {
      running += isReturn ? -l.totalCost : l.totalCost
      const first = i === 0
      rows.push({
        groupStart: first,
        drill: first ? { orderId: v.orderId } : undefined,
        cells: {
          date: first ? day(v.date) : '',
          voucher: first
            ? { text: v.number, sub: isReturn ? t('Return') : v.issuedBy || undefined, strong: true }
            : '',
          order: first ? { text: v.orderNumber, sub: v.orderProduct || undefined } : '',
          material: {
            text: l.productName,
            sub: [l.isAlternative ? t('Alternative') : '', l.batchNumber ? `${t('Batch')} ${l.batchNumber}` : '']
              .filter(Boolean)
              .join(' · ') || undefined,
          },
          qty: qty(l.quantity, { blank: false }),
          unit: l.unit,
          rate: cash(ctx, l.unitCost),
          issued: isReturn ? '' : cash(ctx, l.totalCost),
          returned: isReturn ? cash(ctx, l.totalCost) : '',
          balance: i === v.lines.length - 1 ? cash(ctx, running, { blank: false, strong: true }) : '',
        },
      })
    })
  })
  if (rows.length) {
    rows.push({
      kind: 'closing',
      label: t('Total for the period'),
      labelSpan: 7,
      cells: {
        issued: cash(ctx, data.totals.issuedValue, { blank: false, strong: true }),
        returned: cash(ctx, data.totals.returnedValue, { blank: false, strong: true }),
        balance: cash(ctx, data.totals.netValue, { blank: false, strong: true }),
      },
    })
  }

  const matCols: DocColumn[] = [
    { key: 'material', label: t('Material'), width: '26%' },
    { key: 'unit', label: t('Unit'), width: '6%' },
    { key: 'issuedQty', label: t('Qty'), align: 'right', group: t('Issued') },
    { key: 'issuedValue', label: withCur(ctx, 'Value'), align: 'right', group: t('Issued') },
    { key: 'returnedQty', label: t('Qty'), align: 'right', group: t('Returned') },
    { key: 'returnedValue', label: withCur(ctx, 'Value'), align: 'right', group: t('Returned') },
    { key: 'netQty', label: t('Qty'), align: 'right', group: t('Net issued') },
    { key: 'netValue', label: withCur(ctx, 'Value'), align: 'right', group: t('Net issued') },
  ]
  const matRows: DocRow[] = data.byMaterial.map((m) => ({
    cells: {
      material: { text: m.productName, strong: true },
      unit: m.unit,
      issuedQty: qty(m.issuedQty),
      issuedValue: cash(ctx, m.issuedValue),
      returnedQty: qty(m.returnedQty),
      returnedValue: cash(ctx, m.returnedValue),
      netQty: qty(m.netQty, { blank: false, strong: true }),
      netValue: cash(ctx, m.netValue, { blank: false, strong: true }),
    },
  }))
  if (matRows.length) {
    matRows.push({
      kind: 'total',
      label: t('Total'),
      labelSpan: 2,
      cells: {
        issuedValue: cash(ctx, data.totals.issuedValue, { blank: false, strong: true }),
        returnedValue: cash(ctx, data.totals.returnedValue, { blank: false, strong: true }),
        netValue: cash(ctx, data.totals.netValue, { blank: false, strong: true }),
      },
    })
  }

  return {
    key: 'material-issues',
    title: t('Material Issue Register'),
    periodStart: data.period.startDate,
    periodEnd: data.period.endDate,
    orientation: 'landscape',
    summary: [
      {
        label: t('Vouchers'),
        value: String(data.totals.voucherCount),
        hint: `${data.totals.returnCount} ${t('returns')} · ${data.totals.lineCount} ${t('lines')}`,
      },
      { label: withCur(ctx, 'Issued to production'), value: ctx.figure(data.totals.issuedValue) },
      { label: withCur(ctx, 'Returned to store'), value: ctx.figure(data.totals.returnedValue) },
      { label: withCur(ctx, 'Net issued'), value: ctx.figure(data.totals.netValue), emphasis: true },
    ],
    sections: [
      {
        id: 'register',
        title: t('Voucher register'),
        columns: cols,
        rows,
        empty: t('No material was issued in this period.'),
      },
      {
        id: 'materials',
        title: t('Material-wise summary'),
        columns: matCols,
        rows: matRows,
        empty: t('No materials.'),
      },
    ],
    footnotes: data.totals.cancelledCount
      ? [`${data.totals.cancelledCount} ${t('cancelled voucher(s) in this period are not included — their stock was reversed.')}`]
      : undefined,
  }
}

/* ── Issue vs consumption ────────────────────────────────────────────────────── */

function consumptionColumns(ctx: DocContext, first: DocColumn): DocColumn[] {
  const { t } = ctx
  return [
    first,
    { key: 'unit', label: t('Unit'), width: '4%' },
    { key: 'required', label: t('Required'), align: 'right' },
    { key: 'issued', label: t('Issued'), align: 'right', group: t('Quantity') },
    { key: 'returned', label: t('Returned'), align: 'right', group: t('Quantity') },
    { key: 'used', label: t('Consumed'), align: 'right', group: t('Quantity') },
    { key: 'wastage', label: t('Wastage'), align: 'right', group: t('Quantity') },
    { key: 'inFactory', label: t('On floor'), align: 'right', group: t('Quantity') },
    { key: 'toIssue', label: t('To issue'), align: 'right' },
    { key: 'variance', label: t('Variance'), align: 'right' },
    { key: 'issuedValue', label: t('Issued'), align: 'right', group: withCur(ctx, 'Value') },
    { key: 'usedValue', label: t('Consumed'), align: 'right', group: withCur(ctx, 'Value') },
    { key: 'wastageValue', label: t('Wastage'), align: 'right', group: withCur(ctx, 'Value') },
  ]
}

const consumptionCells = (ctx: DocContext, l: ConsumptionLine) => ({
  unit: l.unit,
  required: qty(l.required, { blank: false }),
  issued: qty(l.issued),
  returned: qty(l.returned),
  used: qty(l.used),
  wastage: { ...qty(l.wastage), tone: l.wastage > 0 ? ('danger' as const) : undefined },
  inFactory: qty(l.inFactory, { strong: true }),
  toIssue: qty(l.toIssue),
  variance: {
    ...qty(l.variance),
    text: isZero(l.variance) ? '' : `${l.variance > 0 ? '+' : ''}${fmtQty(l.variance)}`,
    tone: l.variance > 0 ? ('danger' as const) : l.variance < 0 ? ('success' as const) : undefined,
  },
  issuedValue: cash(ctx, l.issuedValue),
  usedValue: cash(ctx, l.usedValue),
  wastageValue: cash(ctx, l.wastageValue),
})

function consumptionDoc(data: ConsumptionReport, ctx: DocContext): ReportDoc {
  const { t } = ctx
  const totalCells = {
    issuedValue: cash(ctx, data.totals.issuedValue, { blank: false, strong: true }),
    usedValue: cash(ctx, data.totals.usedValue, { blank: false, strong: true }),
    wastageValue: cash(ctx, data.totals.wastageValue, { blank: false, strong: true }),
  }
  const matRows: DocRow[] = data.materials.map((m) => ({
    cells: { material: { text: m.productName, sub: m.sku || undefined, strong: true }, ...consumptionCells(ctx, m) },
  }))
  if (matRows.length) matRows.push({ kind: 'total', label: t('Total'), labelSpan: 10, cells: totalCells })

  const orderRows: DocRow[] = []
  data.orders.forEach((o) => {
    const lines = o.lines.filter((l) => l.issued > 0 || l.toIssue > 0)
    if (!lines.length) return
    orderRows.push({
      kind: 'group',
      label: `${o.orderNumber} — ${o.productName}`,
      labelSub: `${t('Planned')} ${fmtQty(o.planned)} ${o.unit} · ${t('Completed')} ${fmtQty(o.good)} ${o.unit} · ${statusLabel(o.status)}`,
      labelSpan: 13,
      drill: { orderId: o.id },
      cells: {},
    })
    lines.forEach((l) => {
      orderRows.push({ cells: { material: { text: l.productName }, ...consumptionCells(ctx, l) } })
    })
  })

  return {
    key: 'material-consumption',
    title: t('Material Issue vs Consumption'),
    periodStart: data.period.startDate,
    periodEnd: data.period.endDate,
    orientation: 'landscape',
    summary: [
      { label: withCur(ctx, 'Issued to production'), value: ctx.figure(data.totals.issuedValue), hint: `${data.totals.orderCount} ${t('orders')} · ${data.totals.materialCount} ${t('materials')}` },
      { label: withCur(ctx, 'Consumed in output'), value: ctx.figure(data.totals.usedValue) },
      { label: withCur(ctx, 'Wastage'), value: ctx.figure(data.totals.wastageValue), hint: `${data.totals.wastagePercent}% ${t('of issued')}` },
      { label: withCur(ctx, 'Still on the floor'), value: ctx.figure(data.totals.inFactoryValue), emphasis: true },
    ],
    sections: [
      {
        id: 'materials',
        title: t('Material-wise reconciliation'),
        note: t('Issued − returned − consumed − wastage = on floor. Variance = (consumed + wastage) − what the BOM allows for the completed output; + means over-use.'),
        columns: consumptionColumns(ctx, { key: 'material', label: t('Material'), width: '16%' }),
        rows: matRows,
        empty: t('No material was issued to the orders of this period.'),
      },
      {
        id: 'orders',
        title: t('Order-wise detail'),
        columns: consumptionColumns(ctx, { key: 'material', label: t('Material'), width: '16%' }),
        rows: orderRows,
        empty: t('No orders.'),
      },
    ],
  }
}

/* ── Stock statements ────────────────────────────────────────────────────────── */

const MOVEMENT_META: Record<MovementKey, { label: string; side: 'in' | 'out' | 'both' }> = {
  produced: { label: 'Produced', side: 'in' },
  purchased: { label: 'Purchased', side: 'in' },
  salesReturn: { label: 'Sales returns', side: 'in' },
  returnedFromProduction: { label: 'Returned from production', side: 'in' },
  transferIn: { label: 'Transfer in', side: 'in' },
  sold: { label: 'Sold / Dispatched', side: 'out' },
  purchaseReturn: { label: 'Purchase returns', side: 'out' },
  issued: { label: 'Issued to production', side: 'out' },
  transferOut: { label: 'Transfer out', side: 'out' },
  scrapped: { label: 'Scrapped', side: 'out' },
  packedIn: { label: 'Packed in', side: 'in' },
  packedOut: { label: 'Used in packing', side: 'out' },
  issuedToFloor: { label: 'Issued to production stock', side: 'out' },
  returnedFromFloor: { label: 'Back from production stock', side: 'in' },
  adjustment: { label: 'Adjustment (±)', side: 'both' },
}

const STATEMENT_ORDER: Record<'finished-goods' | 'raw-materials', { always: MovementKey[]; order: MovementKey[] }> = {
  'finished-goods': {
    always: ['produced', 'sold'],
    order: ['produced', 'packedIn', 'salesReturn', 'transferIn', 'purchased', 'returnedFromProduction', 'returnedFromFloor', 'sold', 'packedOut', 'transferOut', 'issued', 'issuedToFloor', 'purchaseReturn', 'scrapped', 'adjustment'],
  },
  'raw-materials': {
    always: ['purchased', 'issued', 'returnedFromProduction'],
    order: ['purchased', 'returnedFromProduction', 'returnedFromFloor', 'transferIn', 'salesReturn', 'produced', 'packedIn', 'issued', 'issuedToFloor', 'packedOut', 'purchaseReturn', 'transferOut', 'sold', 'scrapped', 'adjustment'],
  },
}

function statementDoc(data: StockStatementReport, ctx: DocContext): ReportDoc {
  const { t } = ctx
  const finished = data.report === 'finished-goods'
  const layout = STATEMENT_ORDER[data.report]
  const keys = layout.order.filter((k) => layout.always.includes(k) || data.rows.some((r) => !isZero(r.movements[k])))
  const inGroup = t('Received (In)')
  const outGroup = t('Issued (Out)')
  const cols: DocColumn[] = [
    { key: 'product', label: finished ? t('Finished good') : t('Material'), width: '18%' },
    { key: 'unit', label: t('Unit'), width: '4%' },
    { key: 'opening', label: t('Opening'), align: 'right' },
    ...keys.map((k) => ({
      key: k,
      label: t(MOVEMENT_META[k].label),
      align: 'right' as const,
      group: MOVEMENT_META[k].side === 'in' ? inGroup : MOVEMENT_META[k].side === 'out' ? outGroup : undefined,
    })),
    { key: 'closing', label: finished ? t('Closing (Remaining)') : t('Closing'), align: 'right' },
    { key: 'rate', label: withCur(ctx, 'Rate'), align: 'right' },
    { key: 'value', label: withCur(ctx, 'Value'), align: 'right' },
  ]
  const rows: DocRow[] = data.rows.map((r) => {
    const cells: Record<string, CellInput> = {
      product: { text: r.productName, sub: r.sku || undefined, strong: true },
      unit: r.unit,
      opening: qty(r.opening, { blank: false }),
      closing: { ...qty(r.closing, { blank: false, strong: true }), tone: r.closing < 0 ? 'danger' : undefined },
      rate: cash(ctx, r.unitCost),
      value: cash(ctx, r.closingValue, { blank: false }),
    }
    keys.forEach((k) => {
      const v = r.movements[k]
      // In/out columns show plain positive figures; the adjustment column keeps its sign.
      cells[k] =
        MOVEMENT_META[k].side === 'both'
          ? { text: isZero(v) ? '' : `${v > 0 ? '+' : '−'}${fmtQty(Math.abs(v))}`, value: v }
          : qty(Math.abs(v))
    })
    return { cells, drill: { productId: r.productId } }
  })
  if (rows.length) {
    rows.push({
      kind: 'total',
      label: `${t('Total')} — ${data.totals.productCount} ${t('products')}`,
      labelSpan: cols.length - 1,
      cells: { value: cash(ctx, data.totals.closingValue, { blank: false, strong: true }) },
    })
  }
  const unitSet = new Set(data.rows.map((r) => r.unit))
  const oneUnit = unitSet.size === 1 ? [...unitSet][0] : null
  const sumQty = (fn: (r: (typeof data.rows)[number]) => number) => data.rows.reduce((s, r) => s + fn(r), 0)
  const qtySummary = (label: string, n: number, emphasis = false) => ({
    label: t(label),
    value: oneUnit ? `${fmtQty(n)} ${oneUnit}` : fmtQty(n),
    hint: oneUnit ? undefined : t('all products'),
    emphasis,
  })
  return {
    key: data.report,
    title: finished ? t('Finished Goods Stock Statement') : t('Raw Material Stock Statement'),
    periodStart: data.period.startDate,
    periodEnd: data.period.endDate,
    orientation: 'landscape',
    summary: finished
      ? [
          qtySummary('Opening stock', sumQty((r) => r.opening)),
          qtySummary('Produced', data.totals.movements.produced),
          qtySummary('Sold / Dispatched', -data.totals.movements.sold),
          qtySummary('Remaining stock', sumQty((r) => r.closing), true),
        ]
      : [
          qtySummary('Purchased', data.totals.movements.purchased),
          qtySummary('Issued to production', -data.totals.movements.issued),
          qtySummary('Returned from production', data.totals.movements.returnedFromProduction),
          { label: withCur(ctx, 'Closing stock value'), value: ctx.figure(data.totals.closingValue), emphasis: true },
        ],
    sections: [
      {
        id: 'statement',
        title: finished ? t('Production, dispatch and remaining stock') : t('Material movement'),
        note: t('Opening + received − issued = closing. Closing on today’s date equals the live stock.'),
        columns: cols,
        rows,
        empty: t('No products to show.'),
      },
    ],
  }
}

/* ── Stock register (one product, bank-statement style) ─────────────────────── */

const SOURCE_LABEL: Record<string, string> = {
  produced: 'Production receipt',
  sold: 'Sale',
  salesReturn: 'Sales return',
  purchased: 'Purchase',
  purchaseReturn: 'Purchase return',
  issued: 'Issued to production',
  returnedFromProduction: 'Returned from production',
  transferIn: 'Transfer in',
  transferOut: 'Transfer out',
  scrapped: 'Scrapped',
  packedIn: 'Packing (packs in)',
  packedOut: 'Packing (used)',
  issuedToFloor: 'Issued to production stock',
  returnedFromFloor: 'Back from production stock',
  adjustment: 'Stock adjustment',
}

function registerDoc(data: StockRegisterReport, ctx: DocContext): ReportDoc {
  const { t } = ctx
  const p = data.product
  const cols: DocColumn[] = [
    { key: 'date', label: t('Date'), width: '11%', nowrap: true },
    { key: 'details', label: t('Particulars'), width: '45%' },
    { key: 'rate', label: withCur(ctx, 'Rate'), align: 'right', width: '11%' },
    { key: 'in', label: t('Received'), align: 'right', width: '11%' },
    { key: 'out', label: t('Issued'), align: 'right', width: '11%' },
    { key: 'balance', label: t('Balance'), align: 'right', width: '11%' },
  ]
  const rows: DocRow[] = [
    {
      kind: 'opening',
      label: `${formatAppDate(keyToDate(data.period.startDate))} — ${t('Opening balance brought forward')}`,
      labelSpan: 5,
      cells: { balance: qty(data.opening, { blank: false, strong: true }) },
    },
  ]
  data.rows.forEach((r) => {
    const title = `${t(SOURCE_LABEL[r.source] || r.source)}${r.number ? ` ${r.number}` : ''}`
    const sub = [
      r.partyName ? (r.source === 'transferIn' ? `${t('from')} ${r.partyName}` : r.source === 'transferOut' ? `${t('to')} ${r.partyName}` : r.partyName) : '',
      r.orderNumber ? `${t('Order')} ${r.orderNumber}` : '',
      r.invoiceType && r.invoiceType !== 'cash' ? t(r.invoiceType) : '',
      r.note || '',
    ]
      .filter(Boolean)
      .join(' · ')
    rows.push({
      cells: {
        date: day(r.date),
        details: { text: title, sub: sub || undefined, strong: true },
        rate: r.rate != null ? cash(ctx, r.rate) : '',
        in: qty(r.in),
        out: qty(r.out),
        balance: { ...qty(r.balance, { blank: false, strong: true }), tone: r.balance < 0 ? 'danger' : undefined },
      },
    })
  })
  rows.push({
    kind: 'closing',
    label: `${formatAppDate(keyToDate(data.period.endDate))} — ${t('Closing balance')}`,
    labelSpan: 3,
    cells: {
      in: qty(data.totals.in, { blank: false, strong: true }),
      out: qty(data.totals.out, { blank: false, strong: true }),
      balance: qty(data.closing, { blank: false, strong: true }),
    },
  })
  return {
    key: 'stock-register',
    title: t('Stock Register'),
    subtitle: p.name,
    periodStart: data.period.startDate,
    periodEnd: data.period.endDate,
    orientation: 'portrait',
    info: [
      { label: t('Product'), value: p.name },
      { label: t('SKU'), value: p.sku || '—' },
      { label: t('Unit'), value: p.unit || '—' },
      { label: t('Stock now'), value: `${fmtQty(p.current)} ${p.unit}` },
    ],
    summary: [
      { label: t('Opening balance'), value: `${fmtQty(data.opening)} ${p.unit}` },
      { label: t('Total received'), value: `${fmtQty(data.totals.in)} ${p.unit}`, hint: `${data.rows.filter((r) => r.in > 0).length} ${t('entries')}` },
      { label: t('Total issued'), value: `${fmtQty(data.totals.out)} ${p.unit}`, hint: `${data.rows.filter((r) => r.out > 0).length} ${t('entries')}` },
      { label: t('Closing balance'), value: `${fmtQty(data.closing)} ${p.unit}`, emphasis: true },
    ],
    sections: [{ id: 'register', columns: cols, rows, empty: t('No movement in this period.') }],
  }
}

/* ── In-process batches ──────────────────────────────────────────────────────── */

function inProcessDoc(data: InProcessReport, ctx: DocContext): ReportDoc {
  const { t } = ctx
  const cols: DocColumn[] = [
    { key: 'order', label: t('Batch / Order'), width: '9%', nowrap: true },
    { key: 'product', label: t('Product'), width: '15%' },
    { key: 'status', label: t('Status'), width: '7%' },
    { key: 'stage', label: t('Current stage'), width: '11%' },
    { key: 'started', label: t('Started'), width: '7%', nowrap: true },
    { key: 'days', label: t('Days'), align: 'right', width: '4%' },
    { key: 'due', label: t('Due'), width: '7%', nowrap: true },
    { key: 'unit', label: t('Unit'), width: '4%' },
    { key: 'planned', label: t('Planned'), align: 'right', group: t('Quantity') },
    { key: 'produced', label: t('Produced'), align: 'right', group: t('Quantity') },
    { key: 'good', label: t('Completed'), align: 'right', group: t('Quantity') },
    { key: 'qc', label: t('QC / Rework'), align: 'right', group: t('Quantity') },
    { key: 'balance', label: t('Remaining'), align: 'right', group: t('Quantity') },
    { key: 'wipValue', label: withCur(ctx, 'WIP value'), align: 'right', width: '9%' },
  ]
  const rows: DocRow[] = data.batches.map((b) => ({
    drill: { orderId: b.id },
    cells: {
      order: { text: b.orderNumber, sub: b.wipLocation || undefined, strong: true },
      product: { text: b.productName, sub: b.operatorName || b.sku || undefined },
      status: statusLabel(b.status, b.orderType),
      stage: {
        text: b.stage || '—',
        sub: b.operationsTotal ? `${b.operationsDone}/${b.operationsTotal} ${t('steps done')}` : undefined,
      },
      started: b.startedAt ? day(b.startedAt) : { text: t('Not started'), tone: 'muted' },
      days: b.daysInProcess == null ? '' : { text: String(b.daysInProcess), value: b.daysInProcess },
      due: {
        text: day(b.dueDate),
        sub: b.daysOverdue > 0 ? `${b.daysOverdue} ${b.daysOverdue === 1 ? t('day late') : t('days late')}` : undefined,
        tone: b.daysOverdue > 0 ? 'danger' : undefined,
      },
      unit: b.unit,
      planned: qty(b.planned, { blank: false }),
      produced: qty(b.produced),
      good: qty(b.good, { strong: true }),
      qc: qty(b.qcPending + b.reworkPending),
      balance: qty(b.balance, { blank: false, strong: true }),
      wipValue: cash(ctx, b.wipValue, { blank: false }),
    },
  }))
  if (rows.length) {
    rows.push({
      kind: 'total',
      label: `${t('Total')} — ${data.totals.batchCount} ${t('batches')}`,
      labelSpan: 13,
      cells: { wipValue: cash(ctx, data.totals.wipValue, { blank: false, strong: true }) },
    })
  }

  const matCols: DocColumn[] = [
    { key: 'material', label: t('Material'), width: '22%' },
    { key: 'unit', label: t('Unit'), width: '5%' },
    { key: 'required', label: t('Required'), align: 'right' },
    { key: 'issued', label: t('Issued (net)'), align: 'right' },
    { key: 'consumed', label: t('Consumed'), align: 'right' },
    { key: 'scrapped', label: t('Scrapped'), align: 'right' },
    { key: 'inWip', label: t('In WIP'), align: 'right' },
    { key: 'toIssue', label: t('To issue'), align: 'right' },
    { key: 'wipValue', label: withCur(ctx, 'WIP value'), align: 'right' },
    { key: 'lots', label: t('Batch / Lot'), width: '12%' },
  ]
  const matRows: DocRow[] = []
  data.batches.forEach((b) => {
    matRows.push({
      kind: 'group',
      label: `${b.orderNumber} — ${b.productName}`,
      labelSub: `${t('Planned')} ${fmtQty(b.planned)} ${b.unit} · ${t('Remaining')} ${fmtQty(b.balance)} ${b.unit}${b.stage ? ` · ${t('Stage')}: ${b.stage}` : ''}`,
      labelSpan: 8,
      drill: { orderId: b.id },
      cells: { wipValue: cash(ctx, b.wipValue, { blank: false, strong: true }), lots: '' },
    })
    b.materials.forEach((m) => {
      matRows.push({
        cells: {
          material: m.productName,
          unit: m.unit,
          required: qty(m.required, { blank: false }),
          issued: qty(m.issued),
          consumed: qty(m.consumed),
          scrapped: { ...qty(m.scrapped), tone: m.scrapped > 0 ? 'danger' : undefined },
          inWip: qty(m.inWip, { strong: true }),
          toIssue: { ...qty(m.toIssue), tone: m.toIssue > 0 ? 'danger' : undefined },
          wipValue: cash(ctx, m.wipValue),
          lots: m.batches.join(', '),
        },
      })
    })
  })

  return {
    key: 'in-process',
    title: t('In-Process Batch Details'),
    asOf: data.asOf,
    orientation: 'landscape',
    summary: [
      {
        label: t('Batches on the floor'),
        value: String(data.totals.batchCount),
        hint: data.totals.notStartedCount ? `${data.totals.notStartedCount} ${t('not started yet')}` : undefined,
      },
      { label: t('Awaiting QC / rework'), value: fmtQty(data.totals.qcPending + data.totals.reworkPending) },
      { label: t('Overdue batches'), value: String(data.totals.overdueCount) },
      { label: withCur(ctx, 'Value in process (WIP)'), value: ctx.figure(data.totals.wipValue), emphasis: true },
    ],
    sections: [
      {
        id: 'batches',
        title: t('Batch position'),
        columns: cols,
        rows,
        empty: t('Nothing is in process right now.'),
      },
      {
        id: 'materials',
        title: t('Material position by batch'),
        note: t('In WIP = issued − consumed − scrapped, still on the production floor. To issue = still needed from the store.'),
        columns: matCols,
        rows: matRows,
        empty: t('No materials.'),
      },
    ],
  }
}

/* ── Scrap ───────────────────────────────────────────────────────────────────── */

function scrapDoc(data: ScrapReport, ctx: DocContext): ReportDoc {
  const { t } = ctx
  const cols: DocColumn[] = [
    { key: 'date', label: t('Date'), width: '8%', nowrap: true },
    { key: 'number', label: t('Scrap No.'), width: '9%', nowrap: true },
    { key: 'order', label: t('Order'), width: '9%', nowrap: true },
    { key: 'product', label: t('Product / Material'), width: '22%' },
    { key: 'stage', label: t('Stage'), width: '12%' },
    { key: 'reason', label: t('Reason'), width: '10%' },
    { key: 'qty', label: t('Qty'), align: 'right' },
    { key: 'unit', label: t('Unit'), width: '5%' },
    { key: 'rate', label: withCur(ctx, 'Rate'), align: 'right' },
    { key: 'value', label: withCur(ctx, 'Value'), align: 'right' },
  ]
  const rows: DocRow[] = data.rows.map((r) => ({
    cells: {
      date: day(r.date),
      number: { text: r.number, strong: true },
      order: r.orderNumber || '—',
      product: { text: r.productName, sub: r.notes || undefined },
      stage: { text: t(SCRAP_STAGE_LABELS[r.stage] || r.stage), sub: r.affectsStock ? t('from finished stock') : undefined },
      reason: t(SCRAP_REASON_LABELS[r.reason] || r.reason),
      qty: qty(r.quantity, { blank: false }),
      unit: r.unit,
      rate: cash(ctx, r.unitCost),
      value: cash(ctx, r.value, { blank: false, strong: true }),
    },
  }))
  if (rows.length) {
    rows.push({ kind: 'total', label: t('Total'), labelSpan: 9, cells: { value: cash(ctx, data.totals.value, { blank: false, strong: true }) } })
  }
  const share = (v: number) => (data.totals.value > 0 ? pct((v / data.totals.value) * 100) : pct(0))
  const groupSection = (id: string, title: string, label: string, items: { key: string; count: number; value: number }[], names: Record<string, string>): DocSection => ({
    id,
    title,
    columns: [
      { key: 'k', label, width: '40%' },
      { key: 'count', label: t('Entries'), align: 'right' },
      { key: 'value', label: withCur(ctx, 'Value'), align: 'right' },
      { key: 'share', label: t('Share'), align: 'right' },
    ],
    rows: items.map((g) => ({
      cells: {
        k: { text: t(names[g.key] || g.key), strong: true },
        count: { text: String(g.count), value: g.count },
        value: cash(ctx, g.value, { blank: false }),
        share: share(g.value),
      },
    })),
    empty: t('No scrap.'),
  })
  const top = data.byReason[0]
  return {
    key: 'scrap',
    title: t('Scrap & Rejection Report'),
    periodStart: data.period.startDate,
    periodEnd: data.period.endDate,
    orientation: 'landscape',
    summary: [
      { label: t('Scrap entries'), value: String(data.totals.count) },
      {
        label: t('Main reason'),
        value: top ? t(SCRAP_REASON_LABELS[top.key] || top.key) : '—',
        hint: top ? ctx.figure(top.value) : undefined,
      },
      {
        label: withCur(ctx, 'From finished stock'),
        value: ctx.figure(data.rows.filter((r) => r.affectsStock).reduce((s, r) => s + r.value, 0)),
      },
      { label: withCur(ctx, 'Total scrap value'), value: ctx.figure(data.totals.value), emphasis: true },
    ],
    sections: [
      { id: 'register', title: t('Scrap register'), columns: cols, rows, empty: t('No scrap was recorded in this period.') },
      groupSection('stage', t('By stage'), t('Stage'), data.byStage, SCRAP_STAGE_LABELS),
      groupSection('reason', t('By reason'), t('Reason'), data.byReason, SCRAP_REASON_LABELS),
      {
        id: 'product',
        title: t('By product / material'),
        columns: [
          { key: 'product', label: t('Product / Material'), width: '40%' },
          { key: 'unit', label: t('Unit') },
          { key: 'count', label: t('Entries'), align: 'right' },
          { key: 'qty', label: t('Qty'), align: 'right' },
          { key: 'value', label: withCur(ctx, 'Value'), align: 'right' },
        ],
        rows: data.byProduct.map((p) => ({
          cells: {
            product: { text: p.productName, strong: true },
            unit: p.unit,
            count: { text: String(p.count), value: p.count },
            qty: qty(p.quantity, { blank: false }),
            value: cash(ctx, p.value, { blank: false }),
          },
        })),
        empty: t('No scrap.'),
      },
    ],
  }
}

/* ── Date-wise: issue, production, remaining ─────────────────────────────────── */

function dailyDoc(data: DailyReport, ctx: DocContext): ReportDoc {
  const { t } = ctx
  const mat = withCur(ctx, 'Material on the floor')
  const out = t('Production output')
  const cols: DocColumn[] = [
    { key: 'date', label: t('Date'), width: '9%', nowrap: true },
    { key: 'batches', label: t('Batches'), align: 'right', width: '6%' },
    { key: 'issued', label: t('Issued'), align: 'right', group: mat },
    { key: 'returned', label: t('Returned'), align: 'right', group: mat },
    { key: 'consumed', label: t('Used in production'), align: 'right', group: mat },
    { key: 'floorScrap', label: t('Scrapped'), align: 'right', group: mat },
    { key: 'balance', label: t('Remaining (balance)'), align: 'right', group: mat },
    { key: 'produced', label: t('Produced'), align: 'right', group: out },
    { key: 'good', label: t('Completed'), align: 'right', group: out },
    { key: 'rejected', label: t('Rejected'), align: 'right', group: out },
    { key: 'goodValue', label: withCur(ctx, 'FG value'), align: 'right' },
  ]
  const rows: DocRow[] = [
    {
      kind: 'opening',
      label: `${formatAppDate(keyToDate(data.period.startDate))} — ${t('Opening balance on the floor')}`,
      labelSpan: 6,
      cells: { balance: cash(ctx, data.openingWip, { blank: false, strong: true }) },
    },
    ...data.days.map((d) => ({
      cells: {
        date: { text: formatAppDate(keyToDate(d.date)), strong: true },
        batches: d.batches ? { text: String(d.batches), value: d.batches } : '',
        issued: cash(ctx, d.issued),
        returned: cash(ctx, d.returned),
        consumed: cash(ctx, d.consumed),
        floorScrap: { ...cash(ctx, d.floorScrap), tone: d.floorScrap > 0 ? ('danger' as const) : undefined },
        balance: cash(ctx, d.wipBalance, { blank: false, strong: true }),
        produced: qty(d.produced),
        good: qty(d.good, { strong: true }),
        rejected: { ...qty(d.rejected), tone: d.rejected > 0 ? ('danger' as const) : undefined },
        goodValue: cash(ctx, d.goodValue),
      },
    })),
    {
      kind: 'closing',
      label: `${formatAppDate(keyToDate(data.period.endDate))} — ${t('Closing balance')}`,
      labelSpan: 2,
      cells: {
        issued: cash(ctx, data.totals.issued, { blank: false, strong: true }),
        returned: cash(ctx, data.totals.returned, { blank: false, strong: true }),
        consumed: cash(ctx, data.totals.consumed, { blank: false, strong: true }),
        floorScrap: cash(ctx, data.totals.floorScrap, { blank: false, strong: true }),
        balance: cash(ctx, data.closingWip, { blank: false, strong: true }),
        produced: qty(data.totals.produced, { blank: false, strong: true }),
        good: qty(data.totals.good, { blank: false, strong: true }),
        rejected: '',
        goodValue: cash(ctx, data.totals.goodValue, { blank: false, strong: true }),
      },
    },
  ]

  const batchCols: DocColumn[] = [
    { key: 'date', label: t('Date'), width: '9%', nowrap: true },
    { key: 'order', label: t('Batch / Order'), width: '9%', nowrap: true },
    { key: 'product', label: t('Product'), width: '18%' },
    { key: 'unit', label: t('Unit'), width: '5%' },
    { key: 'planned', label: t('Planned'), align: 'right' },
    { key: 'issued', label: withCur(ctx, 'Issued (net)'), align: 'right' },
    { key: 'produced', label: t('Produced'), align: 'right', group: t('This day') },
    { key: 'good', label: t('Completed'), align: 'right', group: t('This day') },
    { key: 'rejected', label: t('Rejected'), align: 'right', group: t('This day') },
    { key: 'cumulative', label: t('Completed to date'), align: 'right', group: t('Batch position') },
    { key: 'remaining', label: t('Remaining'), align: 'right', group: t('Batch position') },
    { key: 'goodValue', label: withCur(ctx, 'FG value'), align: 'right' },
  ]
  let lastDate = ''
  const batchRows: DocRow[] = data.batches.map((b) => {
    const first = b.date !== lastDate
    lastDate = b.date
    return {
      groupStart: first,
      drill: { orderId: b.orderId },
      cells: {
        date: first ? { text: formatAppDate(keyToDate(b.date)), strong: true } : '',
        order: { text: b.orderNumber, strong: true },
        product: b.productName,
        unit: b.unit,
        planned: qty(b.planned, { blank: false }),
        issued: cash(ctx, b.issued),
        produced: qty(b.produced),
        good: qty(b.good, { strong: true }),
        rejected: { ...qty(b.rejected), tone: b.rejected > 0 ? 'danger' : undefined },
        cumulative: qty(b.cumulativeGood, { blank: false }),
        remaining: { ...qty(b.remaining, { blank: false, strong: true }), tone: b.remaining === 0 ? 'success' : undefined },
        goodValue: cash(ctx, b.goodValue),
      },
    }
  })

  return {
    key: 'daily',
    title: t('Date-wise Issue & Production'),
    periodStart: data.period.startDate,
    periodEnd: data.period.endDate,
    orientation: 'landscape',
    summary: [
      { label: withCur(ctx, 'Opening on the floor'), value: ctx.figure(data.openingWip) },
      {
        label: withCur(ctx, 'Issued (net of returns)'),
        value: ctx.figure(data.totals.issued - data.totals.returned),
        hint: `${data.totals.activeDays} ${t('working days')} · ${data.totals.batchCount} ${t('batches')}`,
      },
      {
        label: withCur(ctx, 'Used in production'),
        value: ctx.figure(data.totals.consumed),
        hint: `${t('FG received')} ${ctx.figure(data.totals.goodValue)}`,
      },
      { label: withCur(ctx, 'Remaining on the floor'), value: ctx.figure(data.closingWip), emphasis: true },
    ],
    sections: [
      {
        id: 'days',
        title: t('Day-wise issue, production and remaining'),
        note: ctx.hideMoney
          ? t('Output quantities add all products together.')
          : t('Opening + issued − returned − used in production − scrapped = remaining on the floor (WIP), valued at issue cost. Output quantities add all products together.'),
        columns: cols,
        rows,
        empty: t('No days in this period.'),
      },
      {
        id: 'batches',
        title: t('Batch-wise by date'),
        note: t('Remaining = planned − completed to date, after that day. Click a batch for its full production report.'),
        columns: batchCols,
        rows: batchRows,
        empty: t('No batch had issues or output in this period.'),
      },
    ],
  }
}

/* ── One batch: the production record ────────────────────────────────────────── */

const OUTPUT_STATUS: Record<string, string> = {
  pending_qc: 'Waiting for QC',
  inspected: 'Inspected',
  reversed: 'Reversed',
}
const RECEIPT_SOURCE: Record<string, string> = {
  output: 'Production',
  rework: 'Passed rework',
  direct: 'Direct',
}
const OP_STATUS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'Running',
  completed: 'Done',
  skipped: 'Skipped',
}

function batchDoc(data: BatchReport, ctx: DocContext): ReportDoc {
  const { t } = ctx
  const o = data.order
  const q = data.quantities
  const c = data.costs
  const u = o.unit
  const kv = (label: string, value: DocCell, strong = false): DocRow => ({
    cells: { k: { text: label, strong }, v: { ...value, strong: strong || value.strong } },
  })
  const kvCols = (valueLabel: string): DocColumn[] => [
    { key: 'k', label: t('Particulars'), width: '72%' },
    { key: 'v', label: valueLabel, align: 'right' },
  ]
  const quantities: DocRow[] = [
    kv(t('Planned quantity'), qty(q.planned, { blank: false })),
    kv(t('Produced (reported from the floor)'), qty(q.produced, { blank: false })),
    kv(t('Completed — received into finished stock'), qty(q.good, { blank: false, strong: true })),
    ...(q.reworkedGood ? [kv(`— ${t('of which passed after rework')}`, qty(q.reworkedGood))] : []),
    kv(t('Rejected at QC'), qty(q.rejected, { blank: false })),
    kv(t('Scrapped'), qty(q.scrapped, { blank: false })),
    kv(t('Waiting for QC'), qty(q.qcPending, { blank: false })),
    kv(t('Waiting in rework'), qty(q.reworkPending, { blank: false })),
    { kind: 'total', cells: { k: t('Remaining to produce'), v: qty(q.remaining, { blank: false, strong: true }) } },
  ]
  const costRows: DocRow[] = [
    kv(t('Material issued'), cash(ctx, c.issuedValue, { blank: false })),
    kv(t('Returned to store'), cash(ctx, c.returnedValue, { blank: false })),
    kv(t('Used in production (consumed)'), cash(ctx, c.usedValue, { blank: false })),
    kv(t('Wastage'), cash(ctx, c.wastageValue, { blank: false })),
    kv(t('Still on the floor (WIP)'), cash(ctx, c.inFactoryValue, { blank: false })),
    kv(t('Scrap value (all stages)'), cash(ctx, c.scrapValue, { blank: false })),
    kv(t('Finished goods value'), cash(ctx, c.finishedValue, { blank: false, strong: true })),
    { kind: 'total', cells: { k: t('Cost per completed unit'), v: cash(ctx, c.unitCost, { blank: false, strong: true }) } },
  ]

  const matRows: DocRow[] = data.materials.map((l) => ({
    cells: { material: { text: l.productName, sub: l.sku || undefined, strong: true }, ...consumptionCells(ctx, l) },
  }))
  if (matRows.length) {
    matRows.push({
      kind: 'total',
      label: t('Total'),
      labelSpan: 10,
      cells: {
        issuedValue: cash(ctx, c.issuedValue, { blank: false, strong: true }),
        usedValue: cash(ctx, c.usedValue, { blank: false, strong: true }),
        wastageValue: cash(ctx, c.wastageValue, { blank: false, strong: true }),
      },
    })
  }

  const issueCols: DocColumn[] = [
    { key: 'date', label: t('Date'), width: '9%', nowrap: true },
    { key: 'voucher', label: t('Voucher'), width: '10%', nowrap: true },
    { key: 'material', label: t('Material'), width: '24%' },
    { key: 'qty', label: t('Qty'), align: 'right' },
    { key: 'unit', label: t('Unit'), width: '5%' },
    { key: 'rate', label: withCur(ctx, 'Rate'), align: 'right' },
    { key: 'issued', label: withCur(ctx, 'Issued'), align: 'right' },
    { key: 'returned', label: withCur(ctx, 'Returned'), align: 'right' },
    { key: 'balance', label: withCur(ctx, 'Net balance'), align: 'right' },
  ]
  const issueRows: DocRow[] = data.issues.map((l) => ({
    groupStart: l.first,
    cells: {
      date: l.first ? day(l.date) : '',
      voucher: l.first ? { text: l.number, sub: l.kind === 'return' ? t('Return') : l.issuedBy || undefined, strong: true } : '',
      material: { text: l.productName, sub: l.batchNumber ? `${t('Batch')} ${l.batchNumber}` : undefined },
      qty: qty(l.quantity, { blank: false }),
      unit: l.unit,
      rate: cash(ctx, l.unitCost),
      issued: l.kind === 'return' ? '' : cash(ctx, l.totalCost),
      returned: l.kind === 'return' ? cash(ctx, l.totalCost) : '',
      balance: l.last ? cash(ctx, l.balance, { blank: false, strong: true }) : '',
    },
  }))
  if (issueRows.length) {
    issueRows.push({
      kind: 'closing',
      label: t('Total'),
      labelSpan: 6,
      cells: {
        issued: cash(ctx, c.issuedValue, { blank: false, strong: true }),
        returned: cash(ctx, c.returnedValue, { blank: false, strong: true }),
        balance: cash(ctx, c.issuedValue - c.returnedValue, { blank: false, strong: true }),
      },
    })
  }

  const outputCols: DocColumn[] = [
    { key: 'date', label: t('Date'), width: '12%', nowrap: true },
    { key: 'number', label: t('Output No.'), width: '12%', nowrap: true },
    { key: 'produced', label: t('Produced'), align: 'right' },
    { key: 'good', label: t('Completed'), align: 'right' },
    { key: 'rejected', label: t('Rejected'), align: 'right' },
    { key: 'disposition', label: t('Rejected to'), width: '14%' },
    { key: 'status', label: t('Status'), width: '12%' },
    { key: 'cost', label: withCur(ctx, 'Material used'), align: 'right' },
  ]
  const outputRows: DocRow[] = data.outputs.map((x) => ({
    cells: {
      date: day(x.date),
      number: { text: x.number, strong: true },
      produced: qty(x.produced, { blank: false }),
      good: qty(x.good, { strong: true }),
      rejected: { ...qty(x.rejected), tone: x.rejected > 0 ? 'danger' : undefined },
      disposition: x.disposition ? { text: x.disposition === 'rework' ? t('Rework') : t('Scrap'), sub: x.reason || undefined } : '',
      status: { text: t(OUTPUT_STATUS[x.status] || x.status), tone: x.status === 'reversed' ? 'muted' : undefined },
      cost: cash(ctx, x.materialCost),
    },
  }))

  const receiptCols: DocColumn[] = [
    { key: 'date', label: t('Date'), width: '12%', nowrap: true },
    { key: 'number', label: t('Receipt No.'), width: '12%', nowrap: true },
    { key: 'source', label: t('Source'), width: '12%' },
    { key: 'qty', label: t('Received'), align: 'right' },
    { key: 'cumulative', label: t('Completed to date'), align: 'right' },
    { key: 'remaining', label: t('Remaining'), align: 'right' },
    { key: 'rate', label: withCur(ctx, 'Unit cost'), align: 'right' },
    { key: 'value', label: withCur(ctx, 'Value'), align: 'right' },
  ]
  const receiptRows: DocRow[] = data.receipts.map((r) => ({
    cells: {
      date: day(r.date),
      number: { text: r.number, sub: r.batchNumber ? `${t('Lot')} ${r.batchNumber}` : undefined, strong: true },
      source: t(RECEIPT_SOURCE[r.source] || r.source),
      qty: qty(r.quantity, { blank: false, strong: true }),
      cumulative: qty(r.cumulative, { blank: false }),
      remaining: { ...qty(r.remaining, { blank: false, strong: true }), tone: r.remaining === 0 ? 'success' : undefined },
      rate: cash(ctx, r.unitCost),
      value: cash(ctx, r.value, { blank: false }),
    },
  }))
  if (receiptRows.length) {
    receiptRows.push({
      kind: 'total',
      label: t('Total received'),
      labelSpan: 3,
      cells: {
        qty: qty(q.good, { blank: false, strong: true }),
        cumulative: '',
        remaining: qty(Math.max(0, q.planned - q.good), { blank: false, strong: true }),
        rate: '',
        value: cash(ctx, c.finishedValue, { blank: false, strong: true }),
      },
    })
  }

  const sections: DocSection[] = [
    { id: 'qty', title: t('Production quantities'), columns: kvCols(`${t('Quantity')} (${u})`), rows: quantities },
    {
      id: 'materials',
      title: t('Material requirement, issue and consumption'),
      note: t('Issued − returned − consumed − wastage = on floor. Variance = (consumed + wastage) − what the BOM allows for the completed output.'),
      columns: consumptionColumns(ctx, { key: 'material', label: t('Material'), width: '16%' }),
      rows: matRows,
      empty: t('This batch has no materials.'),
    },
    { id: 'issues', title: t('Material issue vouchers'), columns: issueCols, rows: issueRows, empty: t('No material has been issued to this batch.') },
    { id: 'outputs', title: t('Production output (date-wise)'), columns: outputCols, rows: outputRows, empty: t('No output has been reported yet.') },
    { id: 'receipts', title: t('Finished goods received'), columns: receiptCols, rows: receiptRows, empty: t('Nothing received into finished stock yet.') },
  ]
  if (data.scrap.length) {
    sections.push({
      id: 'scrap',
      title: t('Scrap'),
      columns: [
        { key: 'date', label: t('Date'), width: '12%', nowrap: true },
        { key: 'number', label: t('Scrap No.'), width: '12%', nowrap: true },
        { key: 'item', label: t('Product / Material'), width: '28%' },
        { key: 'stage', label: t('Stage') },
        { key: 'reason', label: t('Reason') },
        { key: 'qty', label: t('Qty'), align: 'right' },
        { key: 'value', label: withCur(ctx, 'Value'), align: 'right' },
      ],
      rows: data.scrap.map((x) => ({
        cells: {
          date: day(x.date),
          number: { text: x.number, strong: true },
          item: x.productName,
          stage: t(SCRAP_STAGE_LABELS[x.stage] || x.stage),
          reason: t(SCRAP_REASON_LABELS[x.reason] || x.reason),
          qty: { text: `${fmtQty(x.quantity)} ${x.unit}`, value: x.quantity },
          value: cash(ctx, x.value, { blank: false }),
        },
      })),
    })
  }
  if (data.operations.length) {
    sections.push({
      id: 'operations',
      title: t('Routing / operations'),
      columns: [
        { key: 'n', label: '#', align: 'right', width: '4%' },
        { key: 'name', label: t('Operation'), width: '20%' },
        { key: 'wc', label: t('Work centre'), width: '14%' },
        { key: 'status', label: t('Status'), width: '9%' },
        { key: 'started', label: t('Started'), nowrap: true },
        { key: 'completed', label: t('Completed'), nowrap: true },
        { key: 'plan', label: t('Planned min'), align: 'right' },
        { key: 'actual', label: t('Actual min'), align: 'right' },
        { key: 'by', label: t('By') },
      ],
      rows: data.operations.map((op, i) => ({
        cells: {
          n: String(i + 1),
          name: { text: op.name, strong: true },
          wc: op.workCenter || '—',
          status: t(OP_STATUS[op.status] || op.status),
          started: op.startedAt ? formatAppDateTime(new Date(op.startedAt)) : '',
          completed: op.completedAt ? formatAppDateTime(new Date(op.completedAt)) : '',
          plan: qty(op.plannedMinutes),
          actual: op.actualMinutes == null ? '' : qty(op.actualMinutes),
          by: op.by,
        },
      })),
    })
  }
  sections.push({ id: 'costs', title: t('Cost summary'), columns: kvCols(withCur(ctx, 'Amount')), rows: costRows })

  const footnotes = [
    ...data.cancelledVouchers.map((v) => `${t('Cancelled voucher')} ${v.number}${v.reason ? ` — ${v.reason}` : ''} ${t('(stock reversed, not counted)')}`),
    ...(o.notes ? [`${t('Notes')}: ${o.notes}`] : []),
  ]
  return {
    key: 'batch',
    title: t('Batch Production Report'),
    subtitle: `${o.orderNumber} — ${o.productName}`,
    orientation: 'landscape',
    info: [
      { label: t('Batch No.'), value: o.batchNumber || o.orderNumber },
      { label: t('Order No.'), value: o.orderNumber },
      { label: t('Product'), value: o.sku ? `${o.productName} (${o.sku})` : o.productName },
      { label: t('BOM'), value: o.bomNumber ? `${o.bomNumber}${o.bomVersion ? ` v${o.bomVersion}` : ''}` : '—' },
      { label: t('Status'), value: statusLabel(o.status, o.orderType) },
      { label: t('Started'), value: day(o.actualStartDate || o.plannedStartDate) },
      { label: t('Due'), value: day(o.plannedCompletionDate) },
      { label: t('Completed on'), value: day(o.actualCompletionDate) },
      { label: t('Operator / team'), value: [o.operatorName, ...o.team].filter(Boolean).join(', ') || '—' },
    ],
    summary: [
      { label: `${t('Planned')} (${u})`, value: fmtQty(q.planned) },
      { label: `${t('Completed')} (${u})`, value: fmtQty(q.good), hint: `${q.completionPercent}% ${t('done')}` },
      { label: `${t('Remaining')} (${u})`, value: fmtQty(q.remaining), emphasis: true },
      {
        label: withCur(ctx, 'Material issued (net)'),
        value: ctx.figure(c.issuedValue - c.returnedValue),
        hint: c.unitCost ? `${t('Cost per unit')} ${ctx.figure(c.unitCost)}` : undefined,
      },
    ],
    sections,
    footnotes: footnotes.length ? footnotes : undefined,
  }
}

/* ── Batches: stock & expiry, traceability ───────────────────────────────────── */

const BATCH_STATE: Record<BatchState, { label: string; tone?: DocCell['tone'] }> = {
  ok: { label: 'Good' },
  expiring: { label: 'Expiring soon', tone: 'danger' },
  expired: { label: 'Expired', tone: 'danger' },
  no_expiry: { label: 'No expiry', tone: 'muted' },
  depleted: { label: 'Used up', tone: 'muted' },
  written_off: { label: 'Written off', tone: 'muted' },
}

const sourceCell = (s: BatchSource, t: DocContext['t']): DocCell =>
  s.kind === 'production'
    ? { text: `${t('Produced')} — ${s.label}` }
    : s.kind === 'purchase'
      ? { text: s.party || t('Purchase'), sub: s.label ? `${t('Purchase')} ${s.label}` : undefined }
      : { text: s.kind === 'opening' ? t('Opening stock') : '—', tone: 'muted' }

const daysCell = (days: number | null, t: DocContext['t']): DocCell =>
  days === null
    ? { text: '' }
    : { text: days < 0 ? `${-days} ${t('ago')}` : String(days), value: days, tone: days < 0 ? 'danger' : undefined }

function batchStockDoc(data: BatchStockReport, ctx: DocContext): ReportDoc {
  const { t } = ctx
  const columns: DocColumn[] = [
    { key: 'batch', label: t('Batch No.'), width: '13%', nowrap: true },
    { key: 'source', label: t('Source'), width: '17%' },
    { key: 'mfg', label: t('Mfg. date'), width: '8%', nowrap: true },
    { key: 'expiry', label: t('Expiry'), width: '8%', nowrap: true },
    { key: 'days', label: t('Days left'), align: 'right', width: '6%' },
    { key: 'qty', label: t('Qty'), align: 'right' },
    { key: 'unit', label: t('Unit'), width: '5%' },
    { key: 'rate', label: withCur(ctx, 'Rate'), align: 'right' },
    { key: 'value', label: withCur(ctx, 'Value'), align: 'right' },
    { key: 'status', label: t('Status'), width: '9%' },
  ]
  const rows: DocRow[] = []
  data.byProduct.forEach((p) => {
    const lines = data.rows.filter((r) => r.productId === p.productId)
    rows.push({ kind: 'group', label: p.productName, labelSub: p.sku || undefined, labelSpan: columns.length, cells: {} })
    lines.forEach((r) => {
      const state = BATCH_STATE[r.state]
      rows.push({
        drill: { batchId: r.id },
        cells: {
          batch: { text: r.batchNumber, strong: true },
          source: sourceCell(r.source, t),
          mfg: day(r.manufactureDate || r.receivedDate),
          expiry: { text: r.expiryDate ? day(r.expiryDate) : '—', tone: state.tone === 'danger' ? 'danger' : undefined },
          days: daysCell(r.daysToExpiry, t),
          qty: qty(r.quantity, { blank: false, strong: true }),
          unit: r.unit,
          rate: cash(ctx, r.unitCost),
          value: cash(ctx, r.value, { blank: false }),
          status: { text: t(state.label), tone: state.tone },
        },
      })
    })
    if (lines.length > 1) {
      rows.push({
        kind: 'subtotal',
        label: `${t('Total')} ${p.productName} — ${lines.length} ${t('batches')}`,
        labelSpan: 5,
        cells: {
          qty: qty(p.quantity, { blank: false, strong: true }),
          unit: p.unit,
          value: cash(ctx, p.value, { blank: false, strong: true }),
        },
      })
    }
  })
  if (data.rows.length) {
    rows.push({
      kind: 'total',
      label: `${t('Grand total')} — ${data.totals.batches} ${t('batches')}, ${data.totals.products} ${t('products')}`,
      labelSpan: 8,
      cells: { value: cash(ctx, data.totals.value, { blank: false, strong: true }) },
    })
  }
  return {
    key: 'batch-stock',
    title: t('Batch Stock & Expiry'),
    asOf: data.asOf,
    orientation: 'landscape',
    summary: [
      { label: t('Batches in stock'), value: String(data.totals.batches), hint: `${data.totals.products} ${t('products')}` },
      { label: withCur(ctx, 'Stock value'), value: ctx.figure(data.totals.value), emphasis: true },
      {
        label: t('Expired'),
        value: String(data.totals.expiredCount),
        hint: data.totals.expiredCount ? `${withCur(ctx, 'Value')} ${ctx.figure(data.totals.expiredValue)}` : undefined,
      },
      {
        label: `${t('Expiring within')} ${data.soonDays} ${t('days')}`,
        value: String(data.totals.expiringCount),
        hint: data.totals.expiringCount ? `${withCur(ctx, 'Value')} ${ctx.figure(data.totals.expiringValue)}` : undefined,
      },
    ],
    sections: [
      {
        id: 'batches',
        title: t('Batch-wise stock'),
        note: t('Soonest expiry first within each product — the order FEFO issues and sells them in.'),
        columns,
        rows,
        empty: t('No batch matches — batch tracking may be off for these products.'),
      },
    ],
    footnotes: data.truncated ? [t('Only the first 5,000 batches are shown — narrow the filters.')] : undefined,
  }
}

function batchTraceDoc(data: BatchTraceReport, ctx: DocContext): ReportDoc {
  const { t } = ctx
  const b = data.batch
  const u = b.unit
  const state = BATCH_STATE[b.state]
  const sections: DocSection[] = []

  const ledgerRows: DocRow[] = data.movements.map((m) => ({
    kind: m.type === 'opening' ? 'opening' : 'line',
    drill: m.orderId ? { orderId: m.orderId } : undefined,
    cells: {
      date: day(m.date),
      particulars: { text: t(m.label), sub: m.party || undefined, strong: m.type !== 'opening' },
      voucher: m.number,
      in: qty(m.quantityIn),
      out: qty(m.quantityOut),
      balance: qty(m.balance, { blank: false, strong: true }),
    },
  }))
  ledgerRows.push({
    kind: 'closing',
    label: t('Closing balance'),
    labelSpan: 3,
    cells: {
      in: qty(data.movements.reduce((s, m) => s + m.quantityIn, 0), { strong: true }),
      out: qty(data.movements.reduce((s, m) => s + m.quantityOut, 0), { strong: true }),
      balance: qty(b.quantity, { blank: false, strong: true }),
    },
  })
  sections.push({
    id: 'ledger',
    title: `${t('Batch ledger')} (${u})`,
    note: t('Every quantity in and out of this batch, oldest first, with the running balance.'),
    columns: [
      { key: 'date', label: t('Date'), width: '9%', nowrap: true },
      { key: 'particulars', label: t('Particulars'), width: '30%' },
      { key: 'voucher', label: t('Voucher'), width: '14%', nowrap: true },
      { key: 'in', label: t('In'), align: 'right' },
      { key: 'out', label: t('Out'), align: 'right' },
      { key: 'balance', label: t('Balance'), align: 'right' },
    ],
    rows: ledgerRows,
  })

  if (data.madeFrom.length) {
    const rows: DocRow[] = []
    data.madeFrom.forEach((o) => {
      rows.push({
        kind: 'group',
        drill: { orderId: o.orderId },
        label: `${o.orderNumber} — ${o.productName}`,
        labelSub: `${fmtQty(o.receivedIntoBatch)} ${o.unit} ${t('into this batch')} · ${fmtQty(o.completedQuantity)} / ${fmtQty(o.plannedQuantity)} ${t('completed')} · ${statusLabel(o.status)}`,
        labelSpan: 5,
        cells: {},
      })
      o.materials.forEach((m) => {
        rows.push({
          drill: m.batchId ? { batchId: m.batchId } : undefined,
          cells: {
            material: { text: m.productName, strong: true },
            qty: { text: `${fmtQty(m.quantity)} ${m.unit}`, value: m.quantity },
            batch: m.batchNumber
              ? { text: m.batchNumber, sub: m.expiryDate ? `${t('exp')} ${day(m.expiryDate)}` : undefined, strong: true }
              : { text: t('Not batch-tracked'), tone: 'muted' },
            source: m.sources.map((x) => (x.kind === 'production' ? `${t('Made on')} ${x.label}` : x.label)).filter(Boolean).join(', ') || '—',
            kind: m.sources.some((x) => x.kind === 'production') ? t('In-house') : m.sources.some((x) => x.kind === 'purchase') ? t('Purchased') : '',
          },
        })
      })
      if (!o.materials.length) {
        rows.push({ label: t('No material was issued to this order.'), labelSpan: 5, cells: {} })
      }
    })
    sections.push({
      id: 'made-from',
      title: t('Made from — materials and their batches'),
      note: t('Net material issued to the order(s) that produced this batch. Click a material batch to trace it further back.'),
      columns: [
        { key: 'material', label: t('Material'), width: '28%' },
        { key: 'qty', label: t('Qty issued'), align: 'right', width: '12%' },
        { key: 'batch', label: t('Material batch'), width: '18%', nowrap: true },
        { key: 'source', label: t('Supplier / made on'), width: '28%' },
        { key: 'kind', label: t('Source'), width: '12%' },
      ],
      rows,
    })
  }

  if (data.usedIn.length) {
    sections.push({
      id: 'used-in',
      title: t('Used in production'),
      note: t('Production orders that drew this batch, and the finished batches they made.'),
      columns: [
        { key: 'order', label: t('Order No.'), width: '12%', nowrap: true },
        { key: 'product', label: t('Product made'), width: '26%' },
        { key: 'used', label: `${t('Qty used')} (${u})`, align: 'right', width: '10%' },
        { key: 'output', label: t('Finished batches'), width: '36%' },
        { key: 'status', label: t('Status'), width: '12%' },
      ],
      rows: data.usedIn.map((o) => ({
        drill: { orderId: o.orderId },
        cells: {
          order: { text: o.orderNumber, strong: true },
          product: o.productName,
          used: qty(o.quantityUsed, { blank: false, strong: true }),
          output: o.produced.length
            ? o.produced
                .map((r) => `${r.batchNumber || r.receiptNumber} × ${fmtQty(r.quantity)} ${r.unit}`)
                .join(', ')
            : { text: t('Nothing received yet'), tone: 'muted' },
          status: statusLabel(o.status),
        },
      })),
    })
  }

  if (data.soldTo.length) {
    const sold = data.soldTo.reduce((s, x) => s + x.quantity, 0)
    sections.push({
      id: 'sold-to',
      title: t('Sold to'),
      columns: [
        { key: 'date', label: t('Date'), width: '12%', nowrap: true },
        { key: 'invoice', label: t('Invoice'), width: '16%', nowrap: true },
        { key: 'customer', label: t('Customer'), width: '50%' },
        { key: 'qty', label: `${t('Qty')} (${u})`, align: 'right' },
      ],
      rows: [
        ...data.soldTo.map((x) => ({
          cells: {
            date: day(x.date),
            invoice: { text: x.number, strong: true },
            customer: x.customer || { text: t('Walk-in'), tone: 'muted' as const },
            qty: qty(x.quantity, { blank: false }),
          },
        })),
        {
          kind: 'total' as const,
          label: `${t('Total')} — ${data.soldTo.length} ${t('invoices')}`,
          labelSpan: 3,
          cells: { qty: qty(sold, { blank: false, strong: true }) },
        },
      ],
    })
  }

  const sm = data.summary
  return {
    key: 'batch-trace',
    title: t('Batch Traceability'),
    subtitle: `${b.batchNumber} — ${b.productName}`,
    orientation: 'landscape',
    info: [
      { label: t('Batch No.'), value: b.batchNumber },
      { label: t('Product'), value: b.sku ? `${b.productName} (${b.sku})` : b.productName },
      { label: t('Source'), value: [sourceCell(b.source, t).text, sourceCell(b.source, t).sub].filter(Boolean).join(' · ') },
      { label: t('Mfg. date'), value: day(b.manufactureDate || b.receivedDate) },
      {
        label: t('Expiry'),
        value: b.expiryDate
          ? `${day(b.expiryDate)} (${b.daysToExpiry! < 0 ? `${t('expired')} ${-b.daysToExpiry!} ${t('days ago')}` : `${b.daysToExpiry} ${t('days left')}`})`
          : t('No expiry'),
      },
      { label: t('Status'), value: t(state.label) },
      { label: withCur(ctx, 'Unit cost'), value: ctx.figure(b.unitCost) },
    ],
    summary: [
      { label: `${t('Received')} (${u})`, value: fmtQty(sm.received) },
      { label: `${t('Issued to production')} (${u})`, value: fmtQty(sm.issuedToProduction) },
      {
        label: `${t('Sold')} (${u})`,
        value: fmtQty(sm.sold),
        hint: sm.scrapped || sm.other
          ? [sm.scrapped ? `${t('Scrapped')} ${fmtQty(sm.scrapped)}` : '', sm.other ? `${t('Other')} ${fmtQty(sm.other)}` : '']
              .filter(Boolean)
              .join(' · ')
          : undefined,
      },
      { label: `${t('Balance')} (${u})`, value: fmtQty(sm.balance), hint: `${withCur(ctx, 'Value')} ${ctx.figure(b.value)}`, emphasis: true },
    ],
    sections,
    footnotes: data.movements.some((m) => m.type === 'opening')
      ? [t('“Opening / not itemised” is stock this batch held before its movements were linked to it, or moved by documents that don’t name the batch.')]
      : undefined,
  }
}

/* ── Product-wise production register (kg) ──────────────────────────────────── */

/** "Vito Mineral T" from "Vito Mineral T Carton", "Vito Mineral T 20kg Bag" … */
export function productLineName(names: string[]): string {
  if (!names.length) return ''
  if (names.length === 1) return names[0]
  const words = names.map((n) => n.trim().split(/\s+/))
  const common: string[] = []
  for (let i = 0; i < words[0].length; i += 1) {
    const w = words[0][i]
    if (words.every((ws) => ws[i]?.toLowerCase() === w.toLowerCase())) common.push(w)
    else break
  }
  return common.join(' ').replace(/[\s\-–—:(/]+$/, '')
}

/** A pack's name without the product-line prefix ("Carton", "20kg Bag"). */
const packLabel = (name: string, line: string) => {
  if (!line || name === line || !name.toLowerCase().startsWith(line.toLowerCase())) return name
  return name.slice(line.length).replace(/^[\s\-–—:(/]+/, '').replace(/\)$/, '') || name
}

const kgText = (n: number) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
const kgCell = (n: number, { blank = true, strong = false, tone }: { blank?: boolean; strong?: boolean; tone?: DocCell['tone'] } = {}): DocCell => ({
  text: blank && isZero(n) ? '' : kgText(n),
  value: Math.round((Number(n) || 0) * 1000) / 1000,
  strong,
  tone,
})
const WEIGHT_SOURCE: Record<Exclude<WeightSource, null>, string> = {
  unit: 'Weighed in kg',
  conversion: 'Product unit conversion',
  recipe: 'Recipe (materials per unit)',
  pack: 'Pack size',
  manual: 'Typed on this report',
}
/** Above this many weighed materials the day table shows the total only. */
const MAX_MATERIAL_COLUMNS = 6

function productRegisterDoc(data: ProductProductionReport, ctx: DocContext): ReportDoc {
  const { t } = ctx
  // The summary: the same register with the issue as one total — no material columns
  // and no material section.
  const summaryOnly = data.report === 'product-summary'
  const title = summaryOnly ? t('Product Production Summary') : t('Product-wise Production Register')
  if (data.needsProduct) {
    return {
      key: data.report,
      title,
      periodStart: data.period.startDate,
      periodEnd: data.period.endDate,
      orientation: 'landscape',
      summary: [],
      sections: [],
    }
  }
  const d: ProductRegisterData = data
  const line = productLineName(d.selected.map((s) => s.name))
  const weighed = d.materials.filter((m) => m.kgPerUnit != null)
  const eachMaterial = !summaryOnly && weighed.length > 0 && weighed.length <= MAX_MATERIAL_COLUMNS
  const packCols = d.packs.filter((p) => !p.loose)
  const hasReturns = d.totals.returnedKg > 0 || d.days.some((x) => Object.keys(x.returned).length > 0)
  const hasLoss = d.totals.scrapKg > 0
  const issueGroup = t('Issued to production')
  const fgGroup = t('Finished goods')
  const runGroup = t('Running position (kg)')
  const matUnit = (m: (typeof weighed)[number]) => (m.unit && m.unit.toLowerCase() !== 'kg' ? ` (${m.unit})` : ' (kg)')
  const packHeader = (p: (typeof packCols)[number]) => {
    const name = packLabel(p.shortName || p.name, line)
    if (p.byWeight) return `${name} (${p.unit})`
    return p.kgPerUnit == null ? `${name} (${p.unit})` : `${name} (${kgText(p.kgPerUnit)} kg)`
  }

  const cols: DocColumn[] = [
    { key: 'date', label: t('Date'), width: '7%', nowrap: true },
    { key: 'batches', label: t('Batch qty'), align: 'right', group: issueGroup },
    ...(eachMaterial
      ? weighed.map((m) => ({ key: `m:${m.key}`, label: `${m.name}${matUnit(m)}`, align: 'right' as const, group: issueGroup }))
      : []),
    ...(hasReturns ? [{ key: 'returned', label: t('Returned (kg)'), align: 'right' as const, group: issueGroup }] : []),
    { key: 'issueKg', label: t('Total issue (kg)'), align: 'right', group: issueGroup },
    ...packCols.map((p) => ({ key: `p:${p.key}`, label: packHeader(p), align: 'right' as const, group: fgGroup })),
    {
      key: 'packedKg',
      label: d.hasLoose ? t('Total finished goods (kg)') : t('Total finished (kg)'),
      align: 'right',
      group: fgGroup,
    },
    ...(d.hasLoose
      ? [
          { key: 'looseKg', label: t('Extra packing (kg)'), align: 'right' as const, group: fgGroup },
          { key: 'finishedKg', label: t('Total finish weight (kg)'), align: 'right' as const, group: fgGroup },
        ]
      : []),
    ...(hasLoss ? [{ key: 'scrapKg', label: t('Loss / scrap (kg)'), align: 'right' as const }] : []),
    { key: 'cumIssue', label: t('Total issue'), align: 'right', group: runGroup },
    { key: 'cumFinished', label: t('Total finish'), align: 'right', group: runGroup },
    { key: 'inProcess', label: t('Remaining in process'), align: 'right', group: runGroup },
  ]
  const firstRunning = cols.findIndex((c) => c.key === 'cumIssue')

  const batchesCell = (n: number, numbers: string[]): CellInput =>
    n
      ? {
          text: String(n),
          value: n,
          strong: true,
          sub: numbers.length <= 2 ? numbers.join(', ') : `${numbers.slice(0, 2).join(', ')} +${numbers.length - 2}`,
        }
      : ''

  const rows: DocRow[] = [
    {
      kind: 'opening',
      label: `${formatAppDate(keyToDate(d.period.startDate))} — ${t('Opening (in process brought forward)')}`,
      labelSpan: firstRunning,
      cells: { inProcess: kgCell(d.openingInProcessKg, { blank: false, strong: true }) },
    },
    ...d.days.map((x) => {
      const cells: Record<string, CellInput> = {
        date: { text: formatAppDate(keyToDate(x.date)), strong: true },
        batches: batchesCell(x.batches, x.batchNumbers),
        returned: kgCell(x.returnedKg),
        issueKg: kgCell(x.issueKg - x.returnedKg, { strong: true }),
        packedKg: kgCell(d.hasLoose ? x.packedKg : x.finishedKg, { strong: !d.hasLoose }),
        looseKg: kgCell(x.looseKg),
        finishedKg: kgCell(x.finishedKg, { strong: true }),
        scrapKg: kgCell(x.scrapKg, { tone: x.scrapKg > 0 ? 'danger' : undefined }),
        cumIssue: kgCell(x.cumIssueKg, { blank: false }),
        cumFinished: kgCell(x.cumFinishedKg, { blank: false }),
        inProcess: kgCell(x.inProcessKg, { blank: false, strong: true, tone: x.inProcessKg < -0.0005 ? 'danger' : undefined }),
      }
      if (eachMaterial) weighed.forEach((m) => (cells[`m:${m.key}`] = qty(x.issued[m.key] || 0)))
      packCols.forEach((p) => (cells[`p:${p.key}`] = qty(x.packs[p.key] || 0)))
      return { cells }
    }),
  ]
  const totalCells: Record<string, CellInput> = {
    batches: { text: String(d.totals.batches), value: d.totals.batches, strong: true },
    returned: kgCell(d.totals.returnedKg, { blank: false, strong: true }),
    issueKg: kgCell(d.totals.netIssueKg, { blank: false, strong: true }),
    packedKg: kgCell(d.hasLoose ? d.totals.packedKg : d.totals.finishedKg, { blank: false, strong: true }),
    looseKg: kgCell(d.totals.looseKg, { blank: false, strong: true }),
    finishedKg: kgCell(d.totals.finishedKg, { blank: false, strong: true }),
    scrapKg: kgCell(d.totals.scrapKg, { blank: false, strong: true }),
    cumIssue: kgCell(d.totals.netIssueKg, { blank: false, strong: true }),
    cumFinished: kgCell(d.totals.finishedKg, { blank: false, strong: true }),
    inProcess: kgCell(d.closingInProcessKg, { blank: false, strong: true }),
  }
  if (eachMaterial) weighed.forEach((m) => (totalCells[`m:${m.key}`] = qty(m.issued, { blank: false, strong: true })))
  packCols.forEach((p) => (totalCells[`p:${p.key}`] = qty(p.quantity, { blank: false, strong: true })))
  rows.push({ kind: 'total', label: t('Total'), labelSpan: 1, cells: totalCells })

  // Finished goods by pack.
  const packRows: DocRow[] = d.packs.map((p) => ({
    cells: {
      pack: { text: packLabel(p.name, line), sub: p.sku || undefined, strong: true },
      unit: p.unit,
      kgEach:
        p.kgPerUnit == null
          ? { text: t('Not set'), tone: 'danger' }
          : { text: kgText(p.kgPerUnit), value: p.kgPerUnit },
      source: p.weightSource ? t(WEIGHT_SOURCE[p.weightSource]) : '—',
      kind: p.loose ? t('Extra packing') : t('Pack'),
      quantity: qty(p.quantity, { blank: false, strong: true }),
      kg: kgCell(p.kg, { blank: false }),
      share: d.totals.finishedKg > 0 ? pct((p.kg / d.totals.finishedKg) * 100) : '',
    },
  }))
  if (packRows.length) {
    packRows.push({
      kind: 'total',
      label: t('Total finished weight'),
      labelSpan: 6,
      cells: { kg: kgCell(d.totals.finishedKg, { blank: false, strong: true }), share: d.totals.finishedKg > 0 ? pct(100) : '' },
    })
  }

  // Materials issued.
  const netIssueKg = d.totals.netIssueKg
  const materialRows: DocRow[] = d.materials.map((m) => ({
    cells: {
      material: { text: m.name, sub: m.sku || undefined, strong: true },
      unit: m.unit,
      kgEach: m.kgPerUnit == null ? { text: t('Not weighed'), tone: 'muted' } : { text: kgText(m.kgPerUnit), value: m.kgPerUnit },
      issued: qty(m.issued, { blank: false }),
      returned: qty(m.returned),
      scrapped: { ...qty(m.scrapped), tone: m.scrapped > 0 ? 'danger' : undefined },
      net: qty(m.issued - m.returned, { blank: false, strong: true }),
      netKg: m.netKg == null ? { text: '—', tone: 'muted' } : kgCell(m.netKg, { blank: false }),
      share: m.netKg != null && netIssueKg > 0 ? pct((m.netKg / netIssueKg) * 100) : '',
    },
  }))
  if (materialRows.length) {
    materialRows.push({
      kind: 'total',
      label: t('Total weighed material (net)'),
      labelSpan: 7,
      cells: { netKg: kgCell(netIssueKg, { blank: false, strong: true }), share: netIssueKg > 0 ? pct(100) : '' },
    })
  }

  // Batch-wise.
  const batchRows: DocRow[] = d.batches.map((b) => ({
    drill: { orderId: b.orderId },
    cells: {
      batch: { text: b.batchNumber, sub: b.batchNumber !== b.orderNumber ? b.orderNumber : undefined, strong: true },
      pack: packLabel(b.productName, line),
      started: b.startedOn ? formatAppDate(keyToDate(b.startedOn)) : '—',
      status: statusLabel(b.status, b.orderType),
      planned: { ...qty(b.planned, { blank: false }), sub: b.unit },
      issued: kgCell(b.netIssuedKg, { blank: false }),
      finishedQty: qty(b.finishedQty),
      finishedKg: kgCell(b.finishedKg, { strong: true }),
      loss: kgCell(b.scrapKg, { tone: b.scrapKg > 0 ? 'danger' : undefined }),
      inProcess: kgCell(b.inProcessKg, {
        blank: false,
        strong: true,
        tone: b.inProcessKg < -0.0005 ? 'danger' : Math.abs(b.inProcessKg) < 0.0005 ? 'success' : undefined,
      }),
      yield: b.yieldPercent == null ? '' : { ...pct(b.yieldPercent), tone: b.yieldPercent > 100.05 ? 'danger' : undefined },
    },
  }))
  if (batchRows.length) {
    const sumB = (k: 'netIssuedKg' | 'finishedKg' | 'scrapKg' | 'inProcessKg') => d.batches.reduce((s, b) => s + b[k], 0)
    batchRows.push({
      kind: 'total',
      label: `${t('Total')} — ${d.batches.length} ${t('batches')}`,
      labelSpan: 5,
      cells: {
        issued: kgCell(sumB('netIssuedKg'), { blank: false, strong: true }),
        finishedQty: '',
        finishedKg: kgCell(sumB('finishedKg'), { blank: false, strong: true }),
        loss: kgCell(sumB('scrapKg'), { blank: false, strong: true }),
        inProcess: kgCell(sumB('inProcessKg'), { blank: false, strong: true }),
        yield: sumB('netIssuedKg') > 0 ? pct((sumB('finishedKg') / sumB('netIssuedKg')) * 100) : '',
      },
    })
  }

  const packHint = packCols
    .filter((p) => p.quantity)
    .map((p) => `${fmtQty(p.quantity)} ${packLabel(p.shortName || p.name, line)}`)
    .join(' · ')
  return {
    key: data.report,
    title,
    subtitle: line || d.selected.map((s) => s.name).join(', '),
    periodStart: d.period.startDate,
    periodEnd: d.period.endDate,
    orientation: 'landscape',
    info: [
      { label: t('Product'), value: d.selected.map((s) => s.name).join(', ') },
      { label: t('Unit of weight'), value: 'kg' },
    ],
    summary: [
      { label: t('Opening in process (kg)'), value: kgText(d.openingInProcessKg) },
      {
        label: t('Issued (kg)'),
        value: kgText(d.totals.netIssueKg),
        hint: `${d.totals.batches} ${t('batches started')} · ${d.totals.activeDays} ${t('working days')}`,
      },
      {
        label: t('Finished (kg)'),
        value: kgText(d.totals.finishedKg),
        hint:
          [
            packHint,
            d.totals.completedYieldPercent != null
              ? `${t('yield')} ${d.totals.completedYieldPercent}% ${t('on completed batches')}`
              : '',
          ]
            .filter(Boolean)
            .join(' · ') || undefined,
      },
      { label: t('Remaining in process (kg)'), value: kgText(d.closingInProcessKg), emphasis: true },
    ],
    sections: ([
      {
        id: 'days',
        title: t('Day-wise issue, finished goods and remaining in process'),
        note: [
          t('Batch qty = production batches whose first material issue was on that day.'),
          eachMaterial || summaryOnly
            ? ''
            : weighed.length
              ? t('Materials are many — the day table shows the total; each material is listed below.')
              : '',
          d.hasLoose
            ? t('Extra packing = finished but left loose; a minus means loose bulk from earlier days was packed.')
            : '',
          hasLoss
            ? t('Remaining in process = opening + total issue − total finish − loss / scrap.')
            : t('Remaining in process = opening + total issue − total finish.'),
        ]
          .filter(Boolean)
          .join(' '),
        columns: cols,
        rows,
        empty: t('No days in this period.'),
      },
      {
        id: 'packs',
        title: t('Finished goods by pack'),
        columns: [
          { key: 'pack', label: t('Pack / product'), width: '24%' },
          { key: 'unit', label: t('Unit'), width: '7%' },
          { key: 'kgEach', label: t('kg per unit'), align: 'right' },
          { key: 'source', label: t('Weight from'), width: '18%' },
          { key: 'kind', label: t('Type'), width: '10%' },
          { key: 'quantity', label: t('Quantity'), align: 'right' },
          { key: 'kg', label: t('Weight (kg)'), align: 'right' },
          { key: 'share', label: t('Share'), align: 'right', width: '7%' },
        ],
        rows: packRows,
        empty: t('Nothing was received in this period.'),
      },
      {
        id: 'materials',
        title: t('Materials issued'),
        note: t('Packing materials counted in pieces are listed but not weighed.'),
        columns: [
          { key: 'material', label: t('Material'), width: '24%' },
          { key: 'unit', label: t('Unit'), width: '6%' },
          { key: 'kgEach', label: t('kg per unit'), align: 'right' },
          { key: 'issued', label: t('Issued'), align: 'right' },
          { key: 'returned', label: t('Returned'), align: 'right' },
          { key: 'scrapped', label: t('Scrapped'), align: 'right' },
          { key: 'net', label: t('Net issued'), align: 'right' },
          { key: 'netKg', label: t('Net (kg)'), align: 'right' },
          { key: 'share', label: t('Share'), align: 'right', width: '7%' },
        ],
        rows: materialRows,
        empty: t('No material was issued in this period.'),
      },
      {
        id: 'batches',
        title: t('Batch-wise position'),
        note: t('Each batch to the end of the period, from its first issue. In process = issued − finished − loss. Click a batch for its full report.'),
        columns: [
          { key: 'batch', label: t('Batch No.'), width: '11%', nowrap: true },
          { key: 'pack', label: t('Pack / product'), width: '14%' },
          { key: 'started', label: t('Started'), width: '8%', nowrap: true },
          { key: 'status', label: t('Status'), width: '8%' },
          { key: 'planned', label: t('Planned'), align: 'right' },
          { key: 'issued', label: t('Issued (kg)'), align: 'right' },
          { key: 'finishedQty', label: t('Finished (qty)'), align: 'right' },
          { key: 'finishedKg', label: t('Finished (kg)'), align: 'right' },
          { key: 'loss', label: t('Loss (kg)'), align: 'right' },
          { key: 'inProcess', label: t('In process (kg)'), align: 'right' },
          { key: 'yield', label: t('Yield'), align: 'right', width: '6%' },
        ],
        rows: batchRows,
        empty: t('No batch of this product was worked in this period.'),
      },
    ] as DocSection[]).filter((sec) => !(summaryOnly && sec.id === 'materials')),
    footnotes: d.warnings.map((w) => `${t(w.message)} (${w.names.join(', ')})`),
  }
}

export function buildReportDoc(data: ManufacturingReport, ctx: DocContext): ReportDoc {
  const doc = buildFullDoc(data, ctx)
  return ctx.hideMoney ? withoutMoney(doc, ctx) : doc
}

/** The quantity-only version of a report (see DocContext.hideMoney). */
function withoutMoney(doc: ReportDoc, ctx: DocContext): ReportDoc {
  const suffix = ` (${ctx.currency})`
  const isMoney = (label?: string) => !!label && label.includes(suffix)
  return {
    ...doc,
    info: doc.info?.filter((i) => !isMoney(i.label)),
    summary: doc.summary.filter((s) => !isMoney(s.label)),
    sections: doc.sections
      .map((section) => {
        const keep = section.columns.map((c) => !isMoney(c.label) && !isMoney(c.group))
        const columns = section.columns.filter((_, i) => keep[i])
        const rows = section.rows.map((row) => {
          const cells = Object.fromEntries(Object.entries(row.cells).filter(([key]) => columns.some((c) => c.key === key)))
          // A label spanning the first N columns now spans only those still shown.
          const labelSpan = row.labelSpan ? keep.slice(0, row.labelSpan).filter(Boolean).length || 1 : row.labelSpan
          return { ...row, cells, labelSpan }
        })
        return { ...section, columns, rows }
      })
      // A section that only listed money (nothing but labels left) goes entirely.
      .filter((section) => section.columns.some((c) => c.align === 'right' || c.align === 'center')),
  }
}

function buildFullDoc(data: ManufacturingReport, ctx: DocContext): ReportDoc {
  switch (data.report) {
    case 'production':
      return productionDoc(data, ctx)
    case 'material-issues':
      return issueRegisterDoc(data, ctx)
    case 'material-consumption':
      return consumptionDoc(data, ctx)
    case 'finished-goods':
    case 'raw-materials':
      return statementDoc(data, ctx)
    case 'stock-register':
      return registerDoc(data, ctx)
    case 'in-process':
      return inProcessDoc(data, ctx)
    case 'scrap':
      return scrapDoc(data, ctx)
    case 'daily':
      return dailyDoc(data, ctx)
    case 'batch':
      return batchDoc(data, ctx)
    case 'batch-stock':
      return batchStockDoc(data, ctx)
    case 'batch-trace':
      return batchTraceDoc(data, ctx)
    case 'product-production':
    case 'product-summary':
      return productRegisterDoc(data, ctx)
  }
}

export const cellOf = (c: CellInput): DocCell =>
  c == null ? { text: '' } : typeof c === 'string' ? { text: c, value: c } : c
