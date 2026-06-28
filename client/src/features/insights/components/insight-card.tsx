import { useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { Insight } from '@/stores/insight.api'
import { useMarkInsightReadMutation } from '@/stores/insight.api'
import { getTypeIcon, PRIORITY_THEME, formatMoney, formatNumber } from '../utils/insight-display'

/** Which two columns to surface for each `meta.products[]` insight type. */
const PRODUCT_COLUMNS: Record<string, { label: string; render: (p: any) => string }[]> = {
  top_selling_product: [
    { label: 'Sold (30d)', render: (p) => `${p.quantitySold} units` },
    { label: 'Revenue', render: (p) => formatMoney(p.revenue) },
  ],
  slow_moving_product: [
    { label: 'Sold (30d)', render: (p) => `${p.quantitySold} units` },
    { label: 'In stock', render: (p) => `${p.stock}` },
  ],
  dead_stock: [
    { label: 'In stock', render: (p) => `${p.stock}` },
    { label: 'Tied up', render: (p) => formatMoney(p.stock * p.cost) },
  ],
  expiring_stock: [
    { label: 'In stock', render: (p) => `${p.stock}` },
    { label: 'Expires in', render: (p) => `${p.daysUntilExpiry}d` },
  ],
  high_margin_product: [
    { label: 'Margin', render: (p) => `${formatNumber(p.marginPercent)}%` },
    { label: 'Profit/unit', render: (p) => formatMoney(p.unitProfit) },
  ],
  low_margin_product: [
    { label: 'Margin', render: (p) => `${formatNumber(p.marginPercent)}%` },
    { label: 'Profit/unit', render: (p) => formatMoney(p.unitProfit) },
  ],
}

const CUSTOMER_COLUMNS: Record<string, { label: string; render: (c: any) => string }[]> = {
  vip_customer: [
    { label: 'Spent', render: (c) => formatMoney(c.totalRevenue) },
    { label: 'Orders', render: (c) => `${c.totalOrders}` },
  ],
  customer_contribution: [
    { label: 'Spent', render: (c) => formatMoney(c.totalRevenue) },
    { label: 'Orders', render: (c) => `${c.totalOrders}` },
  ],
  inactive_customer: [
    { label: 'Last order', render: (c) => (c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString() : '—') },
  ],
  at_risk_customer: [
    { label: 'Last order', render: (c) => (c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString() : '—') },
    { label: 'Spent', render: (c) => formatMoney(c.totalRevenue) },
  ],
}

const BRANCH_COLUMNS: Record<string, { label: string; render: (b: any) => string }[]> = {
  branch_top_performer: [
    { label: 'Revenue', render: (b) => formatMoney(b.revenue) },
    { label: 'Orders', render: (b) => `${b.orders}` },
  ],
  branch_underperformer: [
    { label: 'Revenue', render: (b) => formatMoney(b.revenue) },
    { label: 'Orders', render: (b) => `${b.orders}` },
  ],
}

const STAT_FIELDS: { key: string; label: string; render?: (v: unknown) => string }[] = [
  { key: 'stock', label: 'Stock on hand' },
  { key: 'daysRemaining', label: 'Days remaining', render: (v) => (v === Infinity ? '∞' : `${Math.round(Number(v))}`) },
  { key: 'reorderPoint', label: 'Reorder point', render: (v) => `${Math.ceil(Number(v))}` },
  { key: 'suggestedReorderQty', label: 'Suggested order qty' },
  { key: 'dailySalesRate', label: 'Daily sales rate', render: (v) => `${formatNumber(v)}/day` },
  { key: 'growthPercent', label: 'Growth', render: (v) => `${Number(v) > 0 ? '+' : ''}${formatNumber(v)}%` },
  { key: 'tiedUpCapital', label: 'Capital tied up', render: formatMoney },
  { key: 'topCustomersSharePct', label: 'Revenue share', render: (v) => `${formatNumber(v)}%` },
  { key: 'currentMonthRevenue', label: 'This month', render: formatMoney },
  { key: 'previousMonthRevenue', label: 'Last month', render: formatMoney },
]

function MiniTable({ rows, columns }: { rows: any[]; columns: { label: string; render: (r: any) => string }[] }) {
  return (
    <div className='mt-3 space-y-1.5'>
      {rows.slice(0, 5).map((row, idx) => (
        <div
          key={row.productId || row.customerId || idx}
          className='flex items-center justify-between gap-3 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs'
        >
          <span className='min-w-0 flex-1 truncate font-medium'>{row.name}</span>
          <div className='flex shrink-0 gap-3 text-muted-foreground'>
            {columns.map((col) => (
              <span key={col.label}>
                <span className='hidden sm:inline'>{col.label}: </span>
                <span className='font-medium text-foreground'>{col.render(row)}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function StatChips({ meta }: { meta: Insight['meta'] }) {
  const chips = STAT_FIELDS.filter((f) => meta[f.key] !== undefined && meta[f.key] !== null).map((f) => ({
    label: f.label,
    value: f.render ? f.render(meta[f.key]) : String(formatNumber(meta[f.key])),
  }))
  if (chips.length === 0) return null
  return (
    <div className='mt-3 flex flex-wrap gap-2'>
      {chips.map((c) => (
        <div key={c.label} className='rounded-md border bg-background px-2.5 py-1 text-xs'>
          <span className='text-muted-foreground'>{c.label}: </span>
          <span className='font-semibold'>{c.value}</span>
        </div>
      ))}
    </div>
  )
}

function InsightMetaBody({ insight }: { insight: Insight }) {
  const { meta, type } = insight
  if (Array.isArray(meta.products) && meta.products.length > 0) {
    const columns = PRODUCT_COLUMNS[type] || [{ label: 'Stock', render: (p: any) => `${p.stock ?? '—'}` }]
    return <MiniTable rows={meta.products} columns={columns} />
  }
  if (Array.isArray(meta.customers) && meta.customers.length > 0) {
    const columns = CUSTOMER_COLUMNS[type] || [{ label: 'Revenue', render: (c: any) => formatMoney(c.totalRevenue) }]
    return <MiniTable rows={meta.customers} columns={columns} />
  }
  if (Array.isArray(meta.categories) && meta.categories.length > 0) {
    return (
      <MiniTable
        rows={meta.categories.map((c, i) => ({ ...c, productId: `cat-${i}` }))}
        columns={[{ label: 'Revenue', render: (c: any) => formatMoney(c.revenue) }]}
      />
    )
  }
  if (Array.isArray(meta.branches) && meta.branches.length > 0) {
    const columns = BRANCH_COLUMNS[type] || [{ label: 'Revenue', render: (b: any) => formatMoney(b.revenue) }]
    return <MiniTable rows={meta.branches} columns={columns} />
  }
  if (Array.isArray(meta.pairs) && meta.pairs.length > 0) {
    return (
      <MiniTable
        rows={meta.pairs.map((p: any, i: number) => ({
          ...p,
          productId: `pair-${i}`,
          name: `${p.productAName} + ${p.productBName}`,
        }))}
        columns={[{ label: 'Bought together', render: (p: any) => `${p.count}x` }]}
      />
    )
  }
  return <StatChips meta={meta} />
}

export function InsightCard({ insight }: { insight: Insight }) {
  const [open, setOpen] = useState(false)
  const [markRead, { isLoading: isMarking }] = useMarkInsightReadMutation()
  const Icon = getTypeIcon(insight.type)
  const theme = PRIORITY_THEME[insight.priority]

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm ring-1 transition-opacity',
        theme.ring,
        insight.isRead && 'opacity-60',
      )}
    >
      <div className={cn('flex items-start justify-between gap-3 p-4', theme.bg)}>
        <div className='flex items-start gap-3 min-w-0'>
          <span className='mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background'>
            <Icon className={cn('h-4 w-4', theme.text)} />
          </span>
          <div className='min-w-0'>
            <p className='text-sm font-semibold leading-tight'>{insight.title}</p>
            <p className={cn('mt-0.5 text-xs font-medium capitalize', theme.text)}>{insight.priority} priority</p>
          </div>
        </div>
        {!insight.isRead && (
          <Button
            variant='ghost'
            size='icon'
            className='h-7 w-7 shrink-0'
            disabled={isMarking}
            title='Mark as read'
            onClick={() => markRead({ id: insight.id, isRead: true })}
          >
            <Check className='h-3.5 w-3.5' />
          </Button>
        )}
      </div>

      <div className='flex-1 p-4'>
        <p className='text-xs leading-relaxed text-muted-foreground'>{insight.description}</p>

        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <button
              type='button'
              className='mt-2 flex items-center gap-1 text-xs font-medium text-primary hover:underline'
            >
              {open ? 'Hide details' : 'View details'}
              <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <InsightMetaBody insight={insight} />
            <Badge variant='outline' className='mt-3 text-[10px] font-medium capitalize text-muted-foreground'>
              {insight.confidence} confidence
            </Badge>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  )
}
