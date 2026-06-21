import {
  Trophy,
  Hourglass,
  BarChart3,
  Crown,
  BatteryWarning,
  PackageX,
  ShoppingCart,
  Archive,
  Gem,
  TrendingDown,
  // TrendingUp,
  UserX,
  PieChart,
  Rocket,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import type { Insight, InsightPriority } from '@/stores/insight.api'

/** One icon per insight `type` — more specific and scannable than a generic category icon. */
export const TYPE_ICON: Record<string, LucideIcon> = {
  top_selling_product: Trophy,
  slow_moving_product: Hourglass,
  monthly_sales_growth: BarChart3,
  best_performing_category: Crown,
  low_stock: BatteryWarning,
  stock_out_risk: PackageX,
  reorder_suggestion: ShoppingCart,
  dead_stock: Archive,
  high_margin_product: Gem,
  low_margin_product: TrendingDown,
  vip_customer: Crown,
  inactive_customer: UserX,
  customer_contribution: PieChart,
  sales_drop: TrendingDown,
  high_growth_product: Rocket,
}

export const getTypeIcon = (type: string): LucideIcon => TYPE_ICON[type] || Sparkles

export const PRIORITY_RANK: Record<InsightPriority, number> = { high: 0, medium: 1, low: 2 }

export const PRIORITY_THEME: Record<InsightPriority, { bg: string; text: string; dot: string; ring: string }> = {
  high: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    text: 'text-red-700 dark:text-red-400',
    dot: 'bg-red-500',
    ring: 'ring-red-500/20',
  },
  medium: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    text: 'text-amber-700 dark:text-amber-400',
    dot: 'bg-amber-500',
    ring: 'ring-amber-500/20',
  },
  low: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    text: 'text-blue-700 dark:text-blue-400',
    dot: 'bg-blue-500',
    ring: 'ring-blue-500/20',
  },
}

export const formatMoney = (n: unknown) => `Rs${Math.round(Number(n) || 0).toLocaleString()}`
export const formatNumber = (n: unknown) => (Number.isFinite(Number(n)) ? Math.round(Number(n) * 100) / 100 : n)

/** "Positive" alert types where a high number is good news (growth) — affects tone (green, not red). */
const POSITIVE_TYPES = new Set(['high_growth_product', 'top_selling_product', 'high_margin_product'])
export const isPositiveType = (type: string) => POSITIVE_TYPES.has(type)

/**
 * One-line "what changed" stat for a single product/customer alert — shown as a small
 * colored chip in list rows so the user doesn't have to read a full sentence per item.
 */
export const getRowStat = (insight: Insight): { label: string; tone: InsightPriority | 'good' } => {
  const m = insight.meta
  switch (insight.type) {
    case 'low_stock':
      return { label: `${m.stock} left`, tone: Number(m.stock) <= 2 ? 'high' : 'medium' }
    case 'stock_out_risk': {
      const days = Number(m.daysRemaining)
      if (days === 0) return { label: 'Out of stock', tone: 'high' }
      return { label: `${days}d left`, tone: days <= 3 ? 'high' : days <= 7 ? 'medium' : 'low' }
    }
    case 'reorder_suggestion':
      return { label: `+${m.suggestedReorderQty} units`, tone: 'medium' }
    case 'high_growth_product':
      return { label: `+${formatNumber(m.growthPercent)}%`, tone: 'good' }
    case 'sales_drop':
      return { label: `${formatNumber(m.growthPercent)}%`, tone: Number(m.growthPercent) <= -30 ? 'high' : 'medium' }
    default:
      return { label: insight.priority, tone: insight.priority }
  }
}

const ROW_TONE_CLASSES: Record<string, string> = {
  high: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400',
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400',
  good: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400',
}
export const getRowToneClass = (tone: string) => ROW_TONE_CLASSES[tone] || ROW_TONE_CLASSES.low

/** Sort key so the most urgent / most extreme item in a group always surfaces first. */
const getSortValue = (insight: Insight): number => {
  const m = insight.meta
  switch (insight.type) {
    case 'stock_out_risk':
      return Number(m.daysRemaining ?? Infinity)
    case 'low_stock':
      return Number(m.stock ?? Infinity)
    case 'reorder_suggestion':
      return -Number(m.suggestedReorderQty ?? 0)
    case 'high_growth_product':
      return -Number(m.growthPercent ?? 0)
    case 'sales_drop':
      return Number(m.growthPercent ?? 0)
    default:
      return PRIORITY_RANK[insight.priority] ?? 1
  }
}
export const sortByUrgency = (items: Insight[]) => [...items].sort((a, b) => getSortValue(a) - getSortValue(b))

/** Types that commonly fire once per affected product — these get grouped into one card instead of N cards. */
const GROUPABLE_TYPES = new Set(['low_stock', 'stock_out_risk', 'reorder_suggestion', 'high_growth_product', 'sales_drop'])

const GROUP_TITLE: Record<string, (count: number) => string> = {
  low_stock: (n) => `${n} product${n > 1 ? 's are' : ' is'} running low on stock`,
  stock_out_risk: (n) => `${n} product${n > 1 ? 's' : ''} may run out of stock soon`,
  reorder_suggestion: (n) => `${n} product${n > 1 ? 's' : ''} need${n > 1 ? '' : 's'} reordering`,
  high_growth_product: (n) => `${n} product${n > 1 ? 's are' : ' is'} trending up`,
  sales_drop: (n) => `${n} product${n > 1 ? 's have' : ' has'} declining sales`,
}

export type DisplayItem =
  | { kind: 'single'; key: string; insight: Insight; priority: InsightPriority }
  | {
      kind: 'group'
      key: string
      type: string
      items: Insight[]
      priority: InsightPriority
      title: string
      generatedAt: string
      isRead: boolean
    }

/**
 * Collapses many same-type, per-product insights (e.g. 23 separate "X may run out soon" docs)
 * into one summarized card with an expandable list — otherwise the grid is just noise.
 */
export const groupInsights = (insights: Insight[]): DisplayItem[] => {
  const groups = new Map<string, Insight[]>()
  const singles: Insight[] = []

  for (const insight of insights) {
    const isStoreScoped = insight.type === 'sales_drop' && insight.meta?.scope === 'store'
    if (GROUPABLE_TYPES.has(insight.type) && !isStoreScoped) {
      const key = insight.type
      groups.set(key, [...(groups.get(key) || []), insight])
    } else {
      singles.push(insight)
    }
  }

  const result: DisplayItem[] = []

  for (const [type, items] of groups) {
    // A lone item reads better as a normal single-product card, not a "1 product..." group header.
    if (items.length === 1) {
      singles.push(items[0])
      continue
    }
    const sorted = sortByUrgency(items)
    const worstPriority = sorted.reduce<InsightPriority>(
      (acc, i) => (PRIORITY_RANK[i.priority] < PRIORITY_RANK[acc] ? i.priority : acc),
      'low',
    )
    result.push({
      kind: 'group',
      key: `group:${type}`,
      type,
      items: sorted,
      priority: worstPriority,
      title: (GROUP_TITLE[type] || ((n: number) => `${n} insights`))(items.length),
      generatedAt: items[0].generatedAt,
      isRead: items.every((i) => i.isRead),
    })
  }

  for (const insight of singles) {
    result.push({ kind: 'single', key: insight.id, insight, priority: insight.priority })
  }

  return result.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
}
