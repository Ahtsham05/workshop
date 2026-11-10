import { formatAppDate, formatAppDateTime } from '@/lib/date-format'
import type { DocColumn, DocRow, ReportDoc } from '@/features/manufacturing/lib/report-doc'
import type { WarehouseReportKey } from '@/stores/warehouse.api'

/*
 * Warehouse reports as house-style report documents (features/manufacturing/lib/report-doc):
 * one document is drawn on screen (ReportView), printed (generateReportHTML) and exported
 * (exportReportToExcel), so the three always agree. Money columns are left out when the
 * server sent no money (the viewer lacks viewCostPrices).
 */

type T = (s: string) => string
interface Ctx {
  t: T
  figure: (n: number) => string
  currency: string
  from?: string
  to?: string
  warehouseName?: string
}

interface WhRef {
  id: string
  name: string
  code?: string
  isDefault?: boolean
}

const qty = (n: number | undefined | null) => {
  const v = Number(n || 0)
  if (!v) return ''
  return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 3 })
}
const qtyAlways = (n: number | undefined | null) => {
  const v = Number(n || 0)
  return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 3 })
}
const pct = (n: number | undefined | null) => `${Number(n || 0).toFixed(1)}%`
const cur = (ctx: Ctx, label: string) => `${ctx.t(label)} (${ctx.currency})`
const hasMoney = (v: unknown) => v !== undefined && v !== null

const base = (key: WarehouseReportKey, title: string, ctx: Ctx, extra: Partial<ReportDoc>): ReportDoc => ({
  key: key as unknown as ReportDoc['key'],
  title,
  orientation: 'landscape',
  summary: [],
  sections: [],
  ...(ctx.warehouseName ? { info: [{ label: ctx.t('Warehouse'), value: ctx.warehouseName }] } : {}),
  ...extra,
})

const period = (ctx: Ctx) => (ctx.from && ctx.to ? { periodStart: ctx.from, periodEnd: ctx.to } : { asOf: new Date().toISOString() })

// ── Valuation ────────────────────────────────────────────────────────────────────────────
interface ValuationWarehouse {
  warehouse: WhRef
  products: number
  quantity: number
  costValue?: number
  retailValue: number
  margin?: number
  negative: number
  share: number
  categories: { category: string; products: number; quantity: number; costValue?: number; retailValue: number; margin?: number }[]
}
interface ValuationData {
  warehouses: ValuationWarehouse[]
}

export function valuationDoc(data: ValuationData, ctx: Ctx): ReportDoc {
  const list = data.warehouses
  const money = list.some((w) => hasMoney(w.costValue))
  const cols: DocColumn[] = [
    { key: 'name', label: ctx.t('Warehouse / category'), width: '26%' },
    { key: 'products', label: ctx.t('Products'), align: 'right' },
    { key: 'qty', label: ctx.t('Quantity'), align: 'right' },
    ...(money ? [{ key: 'cost', label: cur(ctx, 'Cost value'), align: 'right' as const }] : []),
    { key: 'retail', label: cur(ctx, 'Retail value'), align: 'right' },
    ...(money ? [{ key: 'margin', label: cur(ctx, 'Potential margin'), align: 'right' as const }] : []),
    { key: 'share', label: ctx.t('Share'), align: 'right' },
  ]
  const rows: DocRow[] = []
  list.forEach((w) => {
    rows.push({
      kind: 'group',
      groupStart: true,
      cells: {
        name: { text: w.warehouse.name, sub: w.negative ? `${w.negative} ${ctx.t('negative')}` : undefined, strong: true },
        products: String(w.products),
        qty: qtyAlways(w.quantity),
        cost: money ? ctx.figure(w.costValue || 0) : '',
        retail: ctx.figure(w.retailValue),
        margin: money ? ctx.figure(w.margin || 0) : '',
        share: pct(w.share),
      },
    })
    w.categories.forEach((c) =>
      rows.push({
        cells: {
          name: { text: `   ${c.category}`, tone: 'muted' },
          products: String(c.products),
          qty: qtyAlways(c.quantity),
          cost: money ? ctx.figure(c.costValue || 0) : '',
          retail: ctx.figure(c.retailValue),
          margin: money ? ctx.figure(c.margin || 0) : '',
          share: '',
        },
      })
    )
  })
  const tot = list.reduce(
    (a, w) => ({ products: a.products + w.products, qty: a.qty + w.quantity, cost: a.cost + (w.costValue || 0), retail: a.retail + w.retailValue, margin: a.margin + (w.margin || 0) }),
    { products: 0, qty: 0, cost: 0, retail: 0, margin: 0 }
  )
  rows.push({
    kind: 'total',
    label: ctx.t('All warehouses'),
    labelSpan: 1,
    cells: { products: String(tot.products), qty: qtyAlways(tot.qty), cost: money ? ctx.figure(tot.cost) : '', retail: ctx.figure(tot.retail), margin: money ? ctx.figure(tot.margin) : '', share: '100%' },
  })
  return base('valuation', ctx.t('Stock Valuation by Warehouse'), ctx, {
    asOf: new Date().toISOString(),
    orientation: 'portrait',
    summary: [
      { label: ctx.t('Warehouses'), value: String(list.length) },
      { label: ctx.t('Units in stock'), value: qtyAlways(tot.qty) },
      ...(money ? [{ label: cur(ctx, 'Cost value'), value: ctx.figure(tot.cost), emphasis: true }] : []),
      { label: cur(ctx, 'Retail value'), value: ctx.figure(tot.retail), emphasis: !money },
    ],
    sections: [{ id: 'valuation', columns: cols, rows, empty: ctx.t('No stock in any warehouse.') }],
    footnotes: [ctx.t('Valued at each product’s current cost and selling price. Share = part of total retail value.')],
  })
}

// ── Stock summary ────────────────────────────────────────────────────────────────────────
interface SummaryRow {
  warehouse: WhRef
  name: string
  sku: string
  unit: string
  opening: number
  closing: number
  purchases: number
  returnsIn: number
  transfersIn: number
  productionIn: number
  adjustIn: number
  sales: number
  returnsOut: number
  transfersOut: number
  productionOut: number
  adjustOut: number
  totalIn: number
  totalOut: number
  closingValue?: number
}

export function summaryDoc(data: { rows: SummaryRow[] }, ctx: Ctx): ReportDoc {
  const money = data.rows.some((r) => hasMoney(r.closingValue))
  const IN = ctx.t('Receipts (in)')
  const OUT = ctx.t('Issues (out)')
  const cols: DocColumn[] = [
    { key: 'name', label: ctx.t('Product'), width: '17%' },
    { key: 'opening', label: ctx.t('Opening'), align: 'right' },
    { key: 'purchases', label: ctx.t('Purchases'), align: 'right', group: IN },
    { key: 'returnsIn', label: ctx.t('Returns'), align: 'right', group: IN },
    { key: 'transfersIn', label: ctx.t('Transfers'), align: 'right', group: IN },
    { key: 'productionIn', label: ctx.t('Production'), align: 'right', group: IN },
    { key: 'adjustIn', label: ctx.t('Adjust'), align: 'right', group: IN },
    { key: 'sales', label: ctx.t('Sales'), align: 'right', group: OUT },
    { key: 'returnsOut', label: ctx.t('Returns'), align: 'right', group: OUT },
    { key: 'transfersOut', label: ctx.t('Transfers'), align: 'right', group: OUT },
    { key: 'productionOut', label: ctx.t('Production'), align: 'right', group: OUT },
    { key: 'adjustOut', label: ctx.t('Adjust'), align: 'right', group: OUT },
    { key: 'closing', label: ctx.t('Closing'), align: 'right' },
    ...(money ? [{ key: 'value', label: cur(ctx, 'Value'), align: 'right' as const }] : []),
  ]
  const KEYS = ['purchases', 'returnsIn', 'transfersIn', 'productionIn', 'adjustIn', 'sales', 'returnsOut', 'transfersOut', 'productionOut', 'adjustOut'] as const
  const byWh = new Map<string, SummaryRow[]>()
  data.rows.forEach((r) => byWh.set(r.warehouse.name, [...(byWh.get(r.warehouse.name) || []), r]))
  const rows: DocRow[] = []
  let grandValue = 0
  byWh.forEach((list, wh) => {
    rows.push({ kind: 'group', label: wh, labelSpan: cols.length, groupStart: true, cells: {} })
    const sum: Record<string, number> = { opening: 0, closing: 0, value: 0 }
    list.forEach((r) => {
      const cells: DocRow['cells'] = {
        name: { text: r.name, sub: [r.sku, r.unit].filter(Boolean).join(' · ') || undefined },
        opening: qtyAlways(r.opening),
        closing: { text: qtyAlways(r.closing), strong: true, tone: r.closing < 0 ? 'danger' : undefined },
        value: money ? ctx.figure(r.closingValue || 0) : '',
      }
      KEYS.forEach((k) => {
        cells[k] = qty(r[k])
        sum[k] = (sum[k] || 0) + Number(r[k] || 0)
      })
      sum.opening += r.opening
      sum.closing += r.closing
      sum.value += r.closingValue || 0
      rows.push({ cells })
    })
    grandValue += sum.value
    const totals: DocRow['cells'] = { opening: qtyAlways(sum.opening), closing: { text: qtyAlways(sum.closing), strong: true }, value: money ? ctx.figure(sum.value) : '' }
    KEYS.forEach((k) => {
      totals[k] = qty(sum[k])
    })
    rows.push({ kind: 'subtotal', label: `${ctx.t('Total')} — ${wh}`, labelSpan: 1, cells: totals })
  })
  return base('summary', ctx.t('Warehouse Stock Summary'), ctx, {
    ...period(ctx),
    summary: [
      { label: ctx.t('Lines'), value: String(data.rows.length) },
      { label: ctx.t('Units in'), value: qtyAlways(data.rows.reduce((s, r) => s + r.totalIn, 0)) },
      { label: ctx.t('Units out'), value: qtyAlways(data.rows.reduce((s, r) => s + r.totalOut, 0)) },
      ...(money ? [{ label: cur(ctx, 'Closing value'), value: ctx.figure(grandValue), emphasis: true }] : []),
    ],
    sections: [{ id: 'summary', columns: cols, rows, empty: ctx.t('No stock or movements in this period.') }],
    footnotes: [
      ctx.t('Opening + receipts − issues = closing, per warehouse. Transfers include moves between warehouses and between branches.'),
      ctx.t('Movements are recorded from the day warehouses were turned on; balances before that are carried in the opening figure.'),
    ],
  })
}

// ── Stock ledger ─────────────────────────────────────────────────────────────────────────
interface LedgerData {
  product: { name: string; sku: string; unit: string }
  sections: {
    warehouse: WhRef
    opening: number
    closing: number
    entries: { date: string; moveType: string; refType: string; refNumber: string; location: string | null; counterpart: string | null; by: string | null; in: number; out: number; balance: number }[]
  }[]
}

const MOVE_LABEL: Record<string, string> = {
  receipt: 'Purchase received',
  delivery: 'Sold / delivered',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
  return_in: 'Customer return',
  return_out: 'Returned to supplier',
  adjustment: 'Adjustment',
  branch_out: 'Sent to branch',
  branch_in: 'From branch',
  production_in: 'Production in',
  production_out: 'Production used',
}

export function ledgerDoc(data: LedgerData, ctx: Ctx): ReportDoc {
  const cols: DocColumn[] = [
    { key: 'date', label: ctx.t('Date'), nowrap: true, width: '13%' },
    { key: 'type', label: ctx.t('Movement'), width: '15%' },
    { key: 'ref', label: ctx.t('Document'), nowrap: true },
    { key: 'where', label: ctx.t('Bin / from-to') },
    { key: 'by', label: ctx.t('By') },
    { key: 'in', label: ctx.t('In'), align: 'right' },
    { key: 'out', label: ctx.t('Out'), align: 'right' },
    { key: 'bal', label: ctx.t('Balance'), align: 'right' },
  ]
  return base('ledger', ctx.t('Stock Ledger'), ctx, {
    ...period(ctx),
    subtitle: `${data.product.name}${data.product.sku ? ` (${data.product.sku})` : ''}`,
    summary: data.sections.map((s) => ({ label: s.warehouse.name, value: `${qtyAlways(s.opening)} → ${qtyAlways(s.closing)} ${data.product.unit || ''}` })),
    sections: data.sections.map((s, i) => ({
      id: s.warehouse.id,
      title: s.warehouse.name,
      breakBefore: i > 0,
      columns: cols,
      rows: [
        { kind: 'opening', label: ctx.t('Opening balance'), labelSpan: 7, cells: { bal: { text: qtyAlways(s.opening), strong: true } } },
        ...s.entries.map((e) => ({
          cells: {
            date: formatAppDateTime(new Date(e.date)),
            type: ctx.t(MOVE_LABEL[e.moveType] || e.moveType),
            ref: e.refNumber || '—',
            where: [e.location, e.counterpart].filter(Boolean).join(' · '),
            by: e.by || '',
            in: qty(e.in),
            out: qty(e.out),
            bal: { text: qtyAlways(e.balance), tone: e.balance < 0 ? ('danger' as const) : undefined },
          },
        })),
        { kind: 'closing', label: ctx.t('Closing balance'), labelSpan: 5, cells: { in: qtyAlways(s.entries.reduce((a, e) => a + e.in, 0)), out: qtyAlways(s.entries.reduce((a, e) => a + e.out, 0)), bal: { text: qtyAlways(s.closing), strong: true } } },
      ],
      empty: ctx.t('No movements.'),
    })),
    footnotes: [ctx.t('Each warehouse is its own ledger: opening + in − out = closing.')],
  })
}

// ── Transfer register ────────────────────────────────────────────────────────────────────
interface TransferData {
  rows: { number: string; date: string; status: string; reference: string; from: string; to: string; by: string; totalQuantity: number; totalValue?: number; lines: { productName: string; sku: string; unit: string; quantity: number; value?: number }[] }[]
}

export function transfersDoc(data: TransferData, ctx: Ctx): ReportDoc {
  const money = data.rows.some((r) => hasMoney(r.totalValue))
  const cols: DocColumn[] = [
    { key: 'date', label: ctx.t('Date'), nowrap: true },
    { key: 'number', label: ctx.t('Transfer'), nowrap: true },
    { key: 'route', label: ctx.t('From → To'), width: '22%' },
    { key: 'product', label: ctx.t('Product'), width: '22%' },
    { key: 'qty', label: ctx.t('Quantity'), align: 'right' },
    ...(money ? [{ key: 'value', label: cur(ctx, 'Value at cost'), align: 'right' as const }] : []),
    { key: 'status', label: ctx.t('Status') },
    { key: 'by', label: ctx.t('By') },
  ]
  const rows: DocRow[] = []
  data.rows.forEach((r) => {
    r.lines.forEach((l, i) =>
      rows.push({
        groupStart: i === 0,
        cells: {
          date: i === 0 ? formatAppDate(new Date(r.date)) : '',
          number: i === 0 ? { text: r.number, sub: r.reference || undefined } : '',
          route: i === 0 ? `${r.from} → ${r.to}` : '',
          product: { text: l.productName, sub: l.sku || undefined },
          qty: `${qtyAlways(l.quantity)} ${l.unit || ''}`,
          value: money ? ctx.figure(l.value || 0) : '',
          status: i === 0 ? ctx.t(r.status === 'done' ? 'Done' : r.status === 'draft' ? 'Draft' : 'Cancelled') : '',
          by: i === 0 ? r.by : '',
        },
      })
    )
  })
  const totalQty = data.rows.reduce((s, r) => s + r.totalQuantity, 0)
  const totalValue = data.rows.reduce((s, r) => s + (r.totalValue || 0), 0)
  rows.push({ kind: 'total', label: ctx.t('Total'), labelSpan: 4, cells: { qty: qtyAlways(totalQty), value: money ? ctx.figure(totalValue) : '' } })
  return base('transfers', ctx.t('Inter-warehouse Transfer Register'), ctx, {
    ...period(ctx),
    summary: [
      { label: ctx.t('Transfers'), value: String(data.rows.length) },
      { label: ctx.t('Units moved'), value: qtyAlways(totalQty) },
      ...(money ? [{ label: cur(ctx, 'Value moved'), value: ctx.figure(totalValue), emphasis: true }] : []),
    ],
    sections: [{ id: 'register', columns: cols, rows, empty: ctx.t('No transfers in this period.') }],
  })
}

// ── Sales / purchases by warehouse ───────────────────────────────────────────────────────
interface SalesData {
  warehouses: { warehouse: WhRef; invoices: number; quantity: number; sales: number; cost?: number; profit?: number; margin?: number; topProducts: { name: string; quantity: number; amount: number; profit?: number }[] }[]
}

export function salesDoc(data: SalesData, ctx: Ctx): ReportDoc {
  const money = data.warehouses.some((w) => hasMoney(w.profit))
  const total = data.warehouses.reduce((s, w) => s + w.sales, 0) || 1
  const cols: DocColumn[] = [
    { key: 'name', label: ctx.t('Warehouse'), width: '22%' },
    { key: 'inv', label: ctx.t('Invoices'), align: 'right' },
    { key: 'qty', label: ctx.t('Units sold'), align: 'right' },
    { key: 'sales', label: cur(ctx, 'Sales'), align: 'right' },
    ...(money
      ? [
          { key: 'cost', label: cur(ctx, 'Cost'), align: 'right' as const },
          { key: 'profit', label: cur(ctx, 'Profit'), align: 'right' as const },
          { key: 'margin', label: ctx.t('Margin'), align: 'right' as const },
        ]
      : []),
    { key: 'share', label: ctx.t('Share of sales'), align: 'right' },
  ]
  const rows: DocRow[] = data.warehouses.map((w) => ({
    cells: {
      name: { text: w.warehouse.name, strong: true },
      inv: String(w.invoices),
      qty: qtyAlways(w.quantity),
      sales: ctx.figure(w.sales),
      cost: money ? ctx.figure(w.cost || 0) : '',
      profit: money ? { text: ctx.figure(w.profit || 0), tone: (w.profit || 0) < 0 ? 'danger' : undefined } : '',
      margin: money ? pct(w.margin) : '',
      share: pct((w.sales / total) * 100),
    },
  }))
  const sum = (k: 'invoices' | 'quantity' | 'sales' | 'cost' | 'profit') => data.warehouses.reduce((s, w) => s + Number(w[k] || 0), 0)
  rows.push({
    kind: 'total',
    label: ctx.t('Total'),
    labelSpan: 1,
    cells: {
      inv: String(sum('invoices')),
      qty: qtyAlways(sum('quantity')),
      sales: ctx.figure(sum('sales')),
      cost: money ? ctx.figure(sum('cost')) : '',
      profit: money ? ctx.figure(sum('profit')) : '',
      margin: money && sum('sales') ? pct((sum('profit') / sum('sales')) * 100) : '',
      share: '100%',
    },
  })
  const topCols: DocColumn[] = [
    { key: 'name', label: ctx.t('Product'), width: '40%' },
    { key: 'qty', label: ctx.t('Units'), align: 'right' },
    { key: 'amount', label: cur(ctx, 'Sales'), align: 'right' },
    ...(money ? [{ key: 'profit', label: cur(ctx, 'Profit'), align: 'right' as const }] : []),
  ]
  return base('sales', ctx.t('Sales by Warehouse'), ctx, {
    ...period(ctx),
    summary: [
      { label: ctx.t('Invoices'), value: String(sum('invoices')) },
      { label: cur(ctx, 'Sales'), value: ctx.figure(sum('sales')), emphasis: true },
      ...(money ? [{ label: cur(ctx, 'Profit'), value: ctx.figure(sum('profit')) }] : []),
    ],
    sections: [
      { id: 'by-warehouse', columns: cols, rows, empty: ctx.t('No sales in this period.') },
      ...data.warehouses
        .filter((w) => w.topProducts.length)
        .map((w) => ({
          id: `top-${w.warehouse.id}`,
          title: `${ctx.t('Top products')} — ${w.warehouse.name}`,
          columns: topCols,
          rows: w.topProducts.map((p) => ({ cells: { name: p.name, qty: qtyAlways(p.quantity), amount: ctx.figure(p.amount), profit: money ? ctx.figure(p.profit || 0) : '' } })),
        })),
    ],
    footnotes: [ctx.t('Invoices without a warehouse were delivered from the default warehouse. Quotations and cancelled invoices are left out.')],
  })
}

interface PurchasesData {
  warehouses: { warehouse: WhRef; purchases: number; suppliers: number; quantity: number; amount: number; topProducts: { name: string; quantity: number; amount: number }[] }[]
}

export function purchasesDoc(data: PurchasesData, ctx: Ctx): ReportDoc {
  const total = data.warehouses.reduce((s, w) => s + w.amount, 0) || 1
  const cols: DocColumn[] = [
    { key: 'name', label: ctx.t('Warehouse'), width: '26%' },
    { key: 'count', label: ctx.t('Purchases'), align: 'right' },
    { key: 'suppliers', label: ctx.t('Suppliers'), align: 'right' },
    { key: 'qty', label: ctx.t('Units received'), align: 'right' },
    { key: 'amount', label: cur(ctx, 'Amount'), align: 'right' },
    { key: 'share', label: ctx.t('Share'), align: 'right' },
  ]
  const rows: DocRow[] = data.warehouses.map((w) => ({
    cells: { name: { text: w.warehouse.name, strong: true }, count: String(w.purchases), suppliers: String(w.suppliers), qty: qtyAlways(w.quantity), amount: ctx.figure(w.amount), share: pct((w.amount / total) * 100) },
  }))
  const amt = data.warehouses.reduce((s, w) => s + w.amount, 0)
  rows.push({
    kind: 'total',
    label: ctx.t('Total'),
    labelSpan: 1,
    cells: { count: String(data.warehouses.reduce((s, w) => s + w.purchases, 0)), suppliers: '', qty: qtyAlways(data.warehouses.reduce((s, w) => s + w.quantity, 0)), amount: ctx.figure(amt), share: '100%' },
  })
  return base('purchases', ctx.t('Purchases by Warehouse'), ctx, {
    ...period(ctx),
    orientation: 'portrait',
    summary: [{ label: cur(ctx, 'Purchased'), value: ctx.figure(amt), emphasis: true }],
    sections: [
      { id: 'by-warehouse', columns: cols, rows, empty: ctx.t('No purchases in this period.') },
      ...data.warehouses
        .filter((w) => w.topProducts.length)
        .map((w) => ({
          id: `top-${w.warehouse.id}`,
          title: `${ctx.t('Top products')} — ${w.warehouse.name}`,
          columns: [
            { key: 'name', label: ctx.t('Product'), width: '50%' },
            { key: 'qty', label: ctx.t('Units'), align: 'right' as const },
            { key: 'amount', label: cur(ctx, 'Amount'), align: 'right' as const },
          ],
          rows: w.topProducts.map((p) => ({ cells: { name: p.name, qty: qtyAlways(p.quantity), amount: ctx.figure(p.amount) } })),
        })),
    ],
  })
}

// ── Ageing ───────────────────────────────────────────────────────────────────────────────
interface AgeingData {
  rows: { warehouse: WhRef; name: string; sku: string; unit: string; quantity: number; value?: number; lastInAt: string | null; estimated: boolean; days: number | null; bucket: string }[]
  buckets: { key: string; label: string; items: number; quantity: number; value?: number }[]
}

export function ageingDoc(data: AgeingData, ctx: Ctx): ReportDoc {
  const money = data.rows.some((r) => hasMoney(r.value))
  const bucketLabel = new Map(data.buckets.map((b) => [b.key, b.label]))
  const cols: DocColumn[] = [
    { key: 'name', label: ctx.t('Product'), width: '26%' },
    { key: 'wh', label: ctx.t('Warehouse') },
    { key: 'qty', label: ctx.t('Quantity'), align: 'right' },
    ...(money ? [{ key: 'value', label: cur(ctx, 'Value'), align: 'right' as const }] : []),
    { key: 'last', label: ctx.t('Last received'), nowrap: true },
    { key: 'days', label: ctx.t('Days'), align: 'right' },
    { key: 'bucket', label: ctx.t('Age') },
  ]
  const bucketCols: DocColumn[] = [
    { key: 'label', label: ctx.t('Age'), width: '30%' },
    { key: 'items', label: ctx.t('Lines'), align: 'right' },
    { key: 'qty', label: ctx.t('Quantity'), align: 'right' },
    ...(money ? [{ key: 'value', label: cur(ctx, 'Value'), align: 'right' as const }] : []),
  ]
  return base('ageing', ctx.t('Stock Ageing by Warehouse'), ctx, {
    asOf: new Date().toISOString(),
    summary: data.buckets.map((b) => ({ label: ctx.t(b.label), value: money ? ctx.figure(b.value || 0) : qtyAlways(b.quantity), emphasis: b.key === 'older' && b.items > 0 })),
    sections: [
      {
        id: 'buckets',
        title: ctx.t('By age'),
        columns: bucketCols,
        rows: data.buckets.map((b) => ({ cells: { label: ctx.t(b.label), items: String(b.items), qty: qtyAlways(b.quantity), value: money ? ctx.figure(b.value || 0) : '' } })),
      },
      {
        id: 'lines',
        title: ctx.t('Oldest first'),
        columns: cols,
        rows: data.rows.map((r) => ({
          cells: {
            name: { text: r.name, sub: r.sku || undefined },
            wh: r.warehouse.name,
            qty: `${qtyAlways(r.quantity)} ${r.unit || ''}`,
            value: money ? ctx.figure(r.value || 0) : '',
            last: r.lastInAt ? formatAppDate(new Date(r.lastInAt)) : { text: ctx.t('before tracking'), tone: 'muted' },
            days: r.days == null ? '' : String(r.days),
            bucket: { text: ctx.t(bucketLabel.get(r.bucket) || r.bucket), tone: r.bucket === 'older' ? 'danger' : undefined },
          },
        })),
        empty: ctx.t('No stock.'),
      },
    ],
    footnotes: [ctx.t('Age = days since stock last came into that warehouse (purchase, transfer, return, production or adjustment). Without any movement yet, the product’s creation date is used.')],
  })
}

// ── Bins ─────────────────────────────────────────────────────────────────────────────────
interface BinsData {
  bins: { warehouse: WhRef; path: string | null; quantity: number; value?: number; items: { name: string; sku: string; unit: string; quantity: number; value?: number }[] }[]
}

export function binsDoc(data: BinsData, ctx: Ctx): ReportDoc {
  const money = data.bins.some((b) => hasMoney(b.value))
  const cols: DocColumn[] = [
    { key: 'name', label: ctx.t('Product'), width: '45%' },
    { key: 'sku', label: ctx.t('SKU') },
    { key: 'qty', label: ctx.t('Quantity'), align: 'right' },
    ...(money ? [{ key: 'value', label: cur(ctx, 'Value'), align: 'right' as const }] : []),
    { key: 'check', label: ctx.t('Counted'), width: '12%' },
  ]
  const rows: DocRow[] = []
  data.bins.forEach((b) => {
    rows.push({ kind: 'group', groupStart: true, label: `${b.warehouse.name} — ${b.path || ctx.t('No bin (warehouse level)')}`, labelSpan: cols.length, cells: {} })
    b.items.forEach((i) => rows.push({ cells: { name: i.name, sku: i.sku, qty: `${qtyAlways(i.quantity)} ${i.unit || ''}`, value: money ? ctx.figure(i.value || 0) : '', check: '' } }))
    rows.push({ kind: 'subtotal', label: ctx.t('Total'), labelSpan: 2, cells: { qty: qtyAlways(b.quantity), value: money ? ctx.figure(b.value || 0) : '' } })
  })
  return base('bins', ctx.t('Stock by Bin / Location'), ctx, {
    asOf: new Date().toISOString(),
    orientation: 'portrait',
    summary: [
      { label: ctx.t('Bins with stock'), value: String(data.bins.filter((b) => b.path).length) },
      { label: ctx.t('Units'), value: qtyAlways(data.bins.reduce((s, b) => s + b.quantity, 0)) },
    ],
    sections: [{ id: 'bins', columns: cols, rows, empty: ctx.t('No stock.') }],
    footnotes: [ctx.t('Print it as a pick / count sheet: the Counted column is left blank for writing.')],
  })
}

export function buildWarehouseReportDoc(report: WarehouseReportKey, data: unknown, ctx: Ctx): ReportDoc {
  switch (report) {
    case 'valuation':
      return valuationDoc(data as ValuationData, ctx)
    case 'summary':
      return summaryDoc(data as { rows: SummaryRow[] }, ctx)
    case 'ledger':
      return ledgerDoc(data as LedgerData, ctx)
    case 'transfers':
      return transfersDoc(data as TransferData, ctx)
    case 'sales':
      return salesDoc(data as SalesData, ctx)
    case 'purchases':
      return purchasesDoc(data as PurchasesData, ctx)
    case 'ageing':
      return ageingDoc(data as AgeingData, ctx)
    default:
      return binsDoc(data as BinsData, ctx)
  }
}
