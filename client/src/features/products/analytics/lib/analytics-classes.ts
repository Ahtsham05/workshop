import { Activity, Minus, PackageX, Snail, Zap } from 'lucide-react'
import type { AbcClass, Movement } from '@/stores/productAnalytics.api'

/*
 * ABC classes are ordered, so they share one blue ordinal ramp (validated with the dataviz
 * palette checker against the app's light and dark card surfaces) — the most important
 * class always carries the most contrast: darkest on light, lightest on dark.
 */
export const ABC_STYLES: Record<AbcClass, string> = {
  A: 'bg-[#256abf] text-white dark:bg-[#9ec5f4] dark:text-slate-950',
  B: 'bg-[#5598e7] text-slate-950 dark:bg-[#3987e5] dark:text-white',
  C: 'bg-[#86b6ef] text-slate-950 dark:bg-[#184f95] dark:text-white',
}

export const ABC_DESCRIPTIONS: Record<AbcClass, string> = {
  A: 'Class A — the few products that make up the first 80% of sales',
  B: 'Class B — the next 15% of sales',
  C: 'Class C — the long tail: the last 5% of sales',
}

export const MOVEMENT_META: Record<Movement, { label: string; hint: string; icon: typeof Zap; className: string }> = {
  fast: {
    label: 'Fast moving',
    hint: 'Among the top 20% of products by units sold per day',
    icon: Zap,
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  steady: {
    label: 'Steady',
    hint: 'Selling at a typical pace for this shop',
    icon: Activity,
    className: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300',
  },
  slow: {
    label: 'Slow moving',
    hint: 'Among the bottom 30% of selling products by units per day',
    icon: Snail,
    className: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300',
  },
  no_sales: {
    label: 'No sales',
    hint: 'Nothing sold in the selected period',
    icon: Minus,
    className: 'border-border bg-muted/60 text-muted-foreground',
  },
  dead: {
    label: 'Dead stock',
    hint: 'Holding stock with no sale for 90+ days',
    icon: PackageX,
    className: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300',
  },
}
