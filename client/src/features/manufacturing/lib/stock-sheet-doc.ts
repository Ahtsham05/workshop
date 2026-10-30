import { formatAppDate } from '@/lib/date-format'
import { PRODUCT_TYPE_META, fmtQty } from './constants'
import type { DocCell, DocColumn, DocContext, DocRow, DocSection, ReportDoc } from './report-doc'
import type { StockSheetGroup, StockSheetGroupBy, StockSheetReport, StockSheetRow } from './report-types'

/*
 * Inventory stock sheet, laid out like the store's paper sheet: one ruled table per
 * category (or sub-category / brand / type), and after the opening BALANCE, three columns
 * under every date — ISSUE · RECEIVE · BALANCE. The screen and Excel get every date in one
 * wide table; print splits the dates into pages (DocContext.datesPerPage), each page
 * starting again from the balance brought forward, the way the paper sheet runs.
 */

export const DEFAULT_DATES_PER_PAGE = 4

const EPS = 1e-9
const isZero = (n: number) => Math.abs(Number(n) || 0) < EPS
const keyDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d || 1)
}
const move = (n: number): DocCell => ({ text: isZero(n) ? '' : fmtQty(n), value: Number(n) || 0 })
const balance = (n: number, strong = false): DocCell => ({
  text: fmtQty(isZero(n) ? 0 : n),
  value: Number(n) || 0,
  strong,
  tone: n < -EPS ? 'danger' : undefined,
})
const money = (ctx: DocContext, n: number, strong = false): DocCell => ({
  text: ctx.figure(n),
  value: Math.round((Number(n) || 0) * 100) / 100,
  strong,
})

const GROUP_LABEL: Record<StockSheetGroupBy, string> = {
  category: 'Category',
  subcategory: 'Sub-category',
  brand: 'Brand',
  type: 'Product type',
  none: 'No grouping',
}
const NONE_LABEL: Record<StockSheetGroupBy, string> = {
  category: 'No category',
  subcategory: 'No category',
  brand: 'No brand',
  type: 'No product type',
  none: '',
}
const INTERVAL_LABEL = { day: 'Daily', week: 'Weekly', month: 'Monthly' } as const
const typeLabel = (type: string) =>
  type in PRODUCT_TYPE_META ? PRODUCT_TYPE_META[type as keyof typeof PRODUCT_TYPE_META].label : type

export function stockSheetDoc(data: StockSheetReport, ctx: DocContext): ReportDoc {
  const { t } = ctx
  const buckets = data.buckets
  const bandOf = (i: number) => {
    const b = buckets[i]
    if (data.interval === 'month')
      return keyDate(b.start).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    if (data.interval === 'week' && b.start !== b.end)
      return `${formatAppDate(keyDate(b.start))} – ${formatAppDate(keyDate(b.end))}`
    return formatAppDate(keyDate(b.start))
  }
  const totalBand = t('Period total')
  const valueLabel = ctx.currency ? `${t('Value')} (${ctx.currency})` : t('Value')

  const head = (openBand: string): DocColumn[] => [
    { key: 'sr', label: t('Sr. No'), align: 'center', width: '3.5%', sticky: { left: '0', width: '3.25rem' } },
    { key: 'item', label: t('Item'), width: '19%', sticky: { left: '3.25rem', width: '15rem' } },
    { key: 'unit', label: t('Unit'), width: '6%', group: t('Date'), nowrap: true },
    { key: 'open', label: t('Balance'), align: 'right', group: openBand },
  ]
  const dateCols = (idx: number[]): DocColumn[] =>
    idx.flatMap((i) => [
      { key: `i${i}`, label: t('Issue'), align: 'right' as const, group: bandOf(i) },
      { key: `r${i}`, label: t('Receive'), align: 'right' as const, group: bandOf(i) },
      { key: `b${i}`, label: t('Balance'), align: 'right' as const, group: bandOf(i) },
    ])
  const totalCols: DocColumn[] = [
    { key: 'tIssue', label: t('Issue'), align: 'right', group: totalBand },
    { key: 'tReceive', label: t('Receive'), align: 'right', group: totalBand },
    { key: 'closing', label: t('Balance'), align: 'right', group: totalBand },
    { key: 'value', label: valueLabel, align: 'right', group: totalBand },
  ]

  /** One item's line over the given dates; `bf` = the date column whose balance opens it. */
  const line = (r: StockSheetRow, n: number, idx: number[], bf: number | null, withTotals: boolean): DocRow => {
    const cells: Record<string, DocCell | string> = {
      sr: { text: String(n), value: n },
      item: { text: r.name, strong: true },
      unit: r.unit,
      open: balance(bf == null ? r.opening : r.cells[bf][2]),
    }
    idx.forEach((i) => {
      const [issue, receive, bal] = r.cells[i]
      cells[`i${i}`] = move(issue)
      cells[`r${i}`] = move(receive)
      cells[`b${i}`] = balance(bal)
    })
    if (withTotals) {
      cells.tIssue = move(r.issue)
      cells.tReceive = move(r.receive)
      cells.closing = balance(r.closing, true)
      cells.value = money(ctx, r.closingValue)
    }
    return { cells, drill: { productId: r.productId } }
  }

  /** The table's total line — quantities only when every item shares one unit. */
  const totalLine = (g: StockSheetGroup, idx: number[], bf: number | null, withTotals: boolean, span: number): DocRow | null => {
    if (g.rows.length < 2) return null
    if (g.unit == null) {
      if (!withTotals || ctx.hideMoney) return null
      return {
        kind: 'total',
        label: `${t('Total')} — ${g.rows.length} ${t('items')}`,
        labelSpan: span - 1,
        cells: { value: money(ctx, g.closingValue, true) },
      }
    }
    const sum = (f: (r: StockSheetRow) => number) => g.rows.reduce((s, r) => s + f(r), 0)
    const cells: Record<string, DocCell> = {
      open: balance(sum((r) => (bf == null ? r.opening : r.cells[bf][2])), true),
    }
    idx.forEach((i) => {
      cells[`i${i}`] = { ...move(sum((r) => r.cells[i][0])), strong: true }
      cells[`r${i}`] = { ...move(sum((r) => r.cells[i][1])), strong: true }
      cells[`b${i}`] = balance(sum((r) => r.cells[i][2]), true)
    })
    if (withTotals) {
      cells.tIssue = { ...move(sum((r) => r.issue)), strong: true }
      cells.tReceive = { ...move(sum((r) => r.receive)), strong: true }
      cells.closing = balance(sum((r) => r.closing), true)
      cells.value = money(ctx, g.closingValue, true)
    }
    return { kind: 'total', label: `${t('Total')} (${g.unit || t('qty')})`, labelSpan: 3, cells }
  }

  const titleOf = (g: StockSheetGroup) => {
    if (data.groupBy === 'none') return undefined
    if (g.none) return t(NONE_LABEL[data.groupBy])
    if (data.groupBy === 'type') return t(typeLabel(g.key))
    return g.parent ? `${g.parent} › ${g.name}` : g.name
  }
  const sectionOf = (
    g: StockSheetGroup,
    id: string,
    idx: number[],
    { bf = null, openBand = t('Opening'), withTotals = true }: { bf?: number | null; openBand?: string; withTotals?: boolean } = {}
  ): DocSection => {
    const columns = [...head(openBand), ...dateCols(idx), ...(withTotals ? totalCols : [])]
    const total = totalLine(g, idx, bf, withTotals, columns.length)
    return {
      id,
      title: titleOf(g),
      columns,
      rows: [...g.rows.map((r, n) => line(r, n + 1, idx, bf, withTotals)), ...(total ? [total] : [])],
      empty: t('No items.'),
    }
  }

  const all = buckets.map((_, i) => i)
  const sections: DocSection[] = data.groups.length
    ? data.groups.map((g) => sectionOf(g, `g-${g.key}`, all))
    : [
        {
          id: 'empty',
          columns: [...head(t('Opening')), ...dateCols(all), ...totalCols],
          rows: [],
          empty: t('No item matches these filters.'),
        },
      ]

  // Print: a few dates per page, every table on each page, balance brought forward.
  const per = Math.max(1, Math.floor(ctx.datesPerPage || DEFAULT_DATES_PER_PAGE))
  const chunks: number[][] = []
  for (let s = 0; s < all.length; s += per) chunks.push(all.slice(s, s + per))
  const printSections =
    chunks.length > 1 && data.groups.length
      ? chunks.flatMap((idx, c) =>
          data.groups.map((g, gi) => ({
            ...sectionOf(g, `p${c}-${g.key}`, idx, {
              bf: c === 0 ? null : idx[0] - 1,
              openBand: c === 0 ? t('Opening') : t('Brought forward'),
              withTotals: c === chunks.length - 1,
            }),
            breakBefore: c > 0 && gi === 0,
          }))
        )
      : undefined

  const a = data.applied
  const list = (names: string[]) => (names.length ? names.map((n) => t(n)).join(', ') : t('All'))
  const columnsText = `${t(INTERVAL_LABEL[data.interval])} — ${buckets.length} ${t(
    data.interval === 'day' ? 'dates' : data.interval === 'week' ? 'weeks' : 'months'
  )}`
  return {
    key: 'stock-sheet',
    title: t('Inventory Stock Sheet'),
    subtitle: a.categories.length && a.categories.length <= 3 ? a.categories.join(' · ') : undefined,
    periodStart: data.period.startDate,
    periodEnd: data.period.endDate,
    orientation: 'landscape',
    info: [
      { label: t('Grouped by'), value: t(GROUP_LABEL[data.groupBy]) },
      { label: t('Date columns'), value: columnsText },
      { label: t('Categories'), value: list(a.categories) },
      { label: t('Brands'), value: list(a.brands) },
      ...(a.subCategories.length ? [{ label: t('Sub-categories'), value: list(a.subCategories) }] : []),
      ...(a.types.length ? [{ label: t('Product types'), value: a.types.map((x) => t(x === 'none' ? 'No product type' : typeLabel(x))).join(', ') }] : []),
      ...(a.search ? [{ label: t('Search'), value: a.search }] : []),
    ],
    summary: [
      {
        label: t('Items on the sheet'),
        value: data.totals.products.toLocaleString(),
        hint: data.groupBy === 'none' ? undefined : `${data.groups.length} ${t(data.groups.length === 1 ? 'table' : 'tables')}`,
      },
      {
        label: t('Items moved'),
        value: data.totals.moved.toLocaleString(),
        hint: `${(data.totals.products - data.totals.moved).toLocaleString()} ${t('not moved')}`,
      },
      {
        label: t('Below zero at period end'),
        value: data.totals.negative.toLocaleString(),
        hint: data.totals.negative ? t('Check these items') : t('None'),
      },
      {
        label: ctx.currency ? `${t('Closing stock value')} (${ctx.currency})` : t('Closing stock value'),
        value: ctx.figure(data.totals.closingValue),
        emphasis: true,
      },
    ],
    sections,
    printSections,
    footnotes: [
      t('Receive = purchases, production, returns from production, transfers in and stock-count gains. Issue = issues to production and production stock, packing, sales, scrap, transfers out and count losses.'),
      t('Balances are worked back from the stock each item holds now, so the last balance of a period ending today agrees with the Products page.'),
      ...(data.hiddenBuckets
        ? [`${data.hiddenBuckets} ${t('dates with no movement are left out — balances carry across them.')}`]
        : []),
      ...(data.truncated
        ? [`${t('Only the first')} ${data.maxRows.toLocaleString()} ${t('items are shown — narrow the sheet by category, brand or type.')}`]
        : []),
    ],
  }
}
