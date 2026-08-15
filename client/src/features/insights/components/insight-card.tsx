import { useState, type ReactNode } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { Insight, InsightBranchRef, InsightCustomerRef, InsightProductRef } from '@/stores/insight.api'
import { useMarkInsightReadMutation } from '@/stores/insight.api'
import { getTypeIcon, PRIORITY_THEME, formatMoney, formatNumber, isPositiveType } from '../utils/insight-display'
import { HeroStat, LevelBar, RankBarList, TwoBarCompare, MiniDonut, type Tone } from './insight-visuals'

/** STOCK_OUT_RISK_DAYS from the rule engine's CONFIG — the reference window a days-remaining gauge fills against. */
const STOCK_OUT_RISK_WINDOW = 14

/** Bar/gauge color for a list-style hero visual — green for "good news" types, priority color otherwise. */
const heroTone = (insight: Insight): Tone => (isPositiveType(insight.type) ? 'good' : insight.priority)

/** The big, scannable visual a card leads with — computed per insight type from its own meta. Returns
 * null for types with no clean single magnitude to chart; those fall back to description text only. */
function getHeroVisual(insight: Insight): ReactNode | null {
  const { meta, type } = insight
  const tone = heroTone(insight)
  const barClass = tone === 'good' ? 'bg-emerald-500' : tone === 'high' ? 'bg-red-500' : tone === 'medium' ? 'bg-amber-500' : 'bg-blue-500'

  switch (type) {
    case 'low_stock': {
      const reorderPoint = Number(meta.reorderPoint) || 0
      if (reorderPoint <= 0) return null
      return (
        <LevelBar
          value={Number(meta.stock) || 0}
          max={reorderPoint}
          tone={insight.priority}
          caption={`${meta.stock} in stock · reorder point is ${Math.ceil(reorderPoint)}`}
        />
      )
    }
    case 'stock_out_risk': {
      const days = Number(meta.daysRemaining)
      if (days === 0) return <HeroStat value='Out of stock' tone='high' />
      return (
        <div className='space-y-1.5'>
          <HeroStat value={String(days)} unit={days === 1 ? 'day left' : 'days left'} tone={insight.priority} />
          <LevelBar value={days} max={STOCK_OUT_RISK_WINDOW} tone={insight.priority} />
        </div>
      )
    }
    case 'reorder_suggestion':
      return <HeroStat value={`+${meta.suggestedReorderQty}`} unit='units to reorder now' tone='medium' />
    case 'high_growth_product':
      return <HeroStat value={`+${formatNumber(meta.growthPercent)}%`} unit='vs previous period' tone='good' />
    case 'demand_trend':
      return (
        <HeroStat
          value={`${Number(meta.growthPercent) > 0 ? '+' : ''}${formatNumber(meta.growthPercent)}%`}
          unit='over the last 7 days'
          tone={meta.label === 'rising' ? 'good' : 'high'}
        />
      )
    case 'sales_drop': {
      const current = meta.current
      const previous = meta.previous
      if (typeof current === 'number' && typeof previous === 'number') {
        return (
          <TwoBarCompare
            leftLabel='before'
            leftValue={previous}
            leftDisplay={formatMoney(previous)}
            rightLabel='now'
            rightValue={current}
            rightDisplay={formatMoney(current)}
            rightTone='high'
          />
        )
      }
      return <HeroStat value={`${formatNumber(meta.growthPercent)}%`} tone='high' />
    }
    case 'monthly_sales_growth': {
      if (meta.noBaseline) return null
      return (
        <TwoBarCompare
          leftLabel='last month'
          leftValue={Number(meta.previousMonthRevenue) || 0}
          leftDisplay={formatMoney(meta.previousMonthRevenue)}
          rightLabel='this month'
          rightValue={Number(meta.currentMonthRevenue) || 0}
          rightDisplay={formatMoney(meta.currentMonthRevenue)}
          rightTone={Number(meta.growthPercent) >= 0 ? 'good' : 'high'}
        />
      )
    }
    case 'customer_contribution': {
      const pct = Number(meta.topCustomersSharePct)
      if (!Number.isFinite(pct)) return null
      return (
        <div className='flex items-center gap-3'>
          <MiniDonut percent={pct} tone={insight.priority} centerLabel='revenue share' />
          <p className='text-xs text-muted-foreground'>of customer revenue comes from this group.</p>
        </div>
      )
    }
    case 'dead_stock':
      return <HeroStat value={formatMoney(meta.tiedUpCapital)} unit='tied up in unsold stock' tone={insight.priority} />
    case 'expiring_stock':
      return <HeroStat value={formatMoney(meta.atRiskValue)} unit='in stock at risk' tone={insight.priority} />
    case 'top_selling_product':
    case 'slow_moving_product':
    case 'high_margin_product':
    case 'low_margin_product': {
      if (!Array.isArray(meta.products) || meta.products.length === 0) return null
      const byMargin = type === 'high_margin_product' || type === 'low_margin_product'
      return (
        <RankBarList
          rows={(meta.products as InsightProductRef[]).slice(0, 5).map((p, i) => ({
            key: p.productId || String(i),
            label: p.name,
            value: byMargin ? Number(p.marginPercent) || 0 : Number(p.quantitySold ?? p.revenue) || 0,
            display: byMargin ? `${formatNumber(p.marginPercent)}%` : formatMoney(p.revenue ?? p.quantitySold),
            barClassName: barClass,
          }))}
        />
      )
    }
    case 'vip_customer': {
      if (!Array.isArray(meta.customers) || meta.customers.length === 0) return null
      return (
        <RankBarList
          rows={(meta.customers as InsightCustomerRef[]).slice(0, 5).map((c, i) => ({
            key: c.customerId || String(i),
            label: c.name,
            value: Number(c.totalRevenue) || 0,
            display: formatMoney(c.totalRevenue),
            barClassName: barClass,
          }))}
        />
      )
    }
    case 'best_performing_category': {
      if (!Array.isArray(meta.categories) || meta.categories.length === 0) return null
      return (
        <RankBarList
          rows={meta.categories.slice(0, 5).map((c, i) => ({
            key: `cat-${i}`,
            label: c.name,
            value: Number(c.revenue) || 0,
            display: formatMoney(c.revenue),
            barClassName: barClass,
          }))}
        />
      )
    }
    case 'branch_top_performer':
    case 'branch_underperformer': {
      if (!Array.isArray(meta.branches) || meta.branches.length === 0) return null
      return (
        <RankBarList
          rows={(meta.branches as InsightBranchRef[]).slice(0, 5).map((b, i) => ({
            key: b.branchId || String(i),
            label: b.name,
            value: Number(b.revenue) || 0,
            display: formatMoney(b.revenue),
            barClassName: barClass,
          }))}
        />
      )
    }
    case 'frequently_bought_together': {
      if (!Array.isArray(meta.pairs) || meta.pairs.length === 0) return null
      return (
        <RankBarList
          rows={meta.pairs.slice(0, 5).map((p, i) => ({
            key: `pair-${i}`,
            label: `${p.productAName} + ${p.productBName}`,
            value: Number(p.count) || 0,
            display: `${p.count}×`,
            barClassName: barClass,
          }))}
        />
      )
    }
    default:
      return null
  }
}

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
  const hero = getHeroVisual(insight)

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

      <div className='flex-1 space-y-2.5 p-4'>
        {hero}
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
